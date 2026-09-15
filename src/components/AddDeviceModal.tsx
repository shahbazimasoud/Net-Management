import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Network, Server, Wifi, Router as RouterIcon, ShieldCheck, MapPin, FileCode2, Terminal, Key, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Cpu, Radio, Plus, ListFilter, Zap, Minus } from 'lucide-react';
import { Device, DeviceType, DevicePlatform, ConnectionMode, ConfigTemplate } from '../types';
import { fetchTemplates, testDeviceConnection, fetchDevices } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onAdd: (device: Partial<Device>) => Promise<Device | void>;
  onDeviceCreatedWithTemplate?: (device: Device, templateId: string) => void;
  isLightMode?: boolean;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  onAdd,
  onDeviceCreatedWithTemplate,
  isLightMode: propIsLightMode,
}) => {
  const { t, isEn } = useLanguage();

  const isLightMode = propIsLightMode ?? (typeof document !== 'undefined' && (
    document.querySelector('.theme-light') !== null ||
    document.documentElement.classList.contains('light') ||
    localStorage.getItem('panel_theme') === 'light' ||
    localStorage.getItem('theme_mode') === 'light'
  ));
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [platform, setPlatform] = useState<DevicePlatform>('cisco_ios');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('ssh');
  const [type, setType] = useState<DeviceType>('switch');
  const [role, setRole] = useState('Access Switch');
  const [model, setModel] = useState('Cisco Catalyst 2960X-48FPS-L');
  const [building, setBuilding] = useState(isEn ? 'HQ Central Building' : 'ساختمان مرکزی');
  const [floor, setFloor] = useState(isEn ? 'Floor 2' : 'طبقه ۲');
  const [unit, setUnit] = useState(isEn ? 'IT Server Room' : 'اتاق سرور و رک');
  const [rack, setRack] = useState('Rack-B02');
  const [totalPorts, setTotalPorts] = useState(24);
  const [powerSupplies, setPowerSupplies] = useState<number>(1);
  const [powerWatts, setPowerWatts] = useState<number>(120);
  const [cdpEnabled, setCdpEnabled] = useState(true);
  const [lldpEnabled, setLldpEnabled] = useState(true);
  const [snmpCommunity, setSnmpCommunity] = useState('public');
  const [connectionProtocol, setConnectionProtocol] = useState<'ssh' | 'telnet'>('ssh');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState(22);
  const [sshUsername, setSshUsername] = useState('admin');
  const [sshPassword, setSshPassword] = useState('cisco123');
  const [enablePassword, setEnablePassword] = useState('cisco');
  const [showPassword, setShowPassword] = useState(false);
  const [isTestingSsh, setIsTestingSsh] = useState(false);
  const [sshTestResult, setSshTestResult] = useState<{ success: boolean; message: string; latency_ms?: number } | null>(null);
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hierarchy from Physical Placement view & live devices
  const [hierarchyBuildings, setHierarchyBuildings] = useState<string[]>([]);
  const [hierarchyFloors, setHierarchyFloors] = useState<Record<string, string[]>>({});
  const [hierarchyUnits, setHierarchyUnits] = useState<Record<string, string[]>>({});
  const [hierarchyRacks, setHierarchyRacks] = useState<Record<string, string[]>>({});
  const [allKnownFloors, setAllKnownFloors] = useState<string[]>([]);
  const [allKnownUnits, setAllKnownUnits] = useState<string[]>([]);
  const [allKnownRacks, setAllKnownRacks] = useState<string[]>([]);
  const [isCustomBuilding, setIsCustomBuilding] = useState<boolean>(false);
  const [isCustomFloor, setIsCustomFloor] = useState<boolean>(false);
  const [isCustomUnit, setIsCustomUnit] = useState<boolean>(false);
  const [isCustomRack, setIsCustomRack] = useState<boolean>(false);

  // Fetch templates and existing physical placement hierarchy
  useEffect(() => {
    if (!isOpen) return;
    fetchTemplates()
      .then((res) => {
        setTemplates(res.templates);
      })
      .catch(() => {});

    const loadHierarchy = async () => {
      try {
        const HIERARCHY_STORAGE_KEY = 'nettopology_physical_hierarchy_v2';
        let savedBuildings: string[] = [];
        let savedFloors: Record<string, string[]> = {};
        let savedUnits: Record<string, string[]> = {};
        let savedRacks: Record<string, string[]> = {};

        try {
          const raw = localStorage.getItem(HIERARCHY_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.buildings)) savedBuildings = parsed.buildings;
            if (parsed.floors && typeof parsed.floors === 'object') savedFloors = parsed.floors;
            if (parsed.units && typeof parsed.units === 'object') savedUnits = parsed.units;
            if (parsed.racks && typeof parsed.racks === 'object') savedRacks = parsed.racks;
          }
        } catch (e) {}

        const devRes = await fetchDevices().catch(() => ({ devices: [] }));
        const liveDevices = devRes?.devices || [];

        const bldgsSet = new Set<string>(savedBuildings);
        const floorsMap: Record<string, Set<string>> = {};
        const unitsMap: Record<string, Set<string>> = {};
        const racksMap: Record<string, Set<string>> = {};

        // Merge saved floors
        Object.entries(savedFloors).forEach(([b, fList]) => {
          if (!floorsMap[b]) floorsMap[b] = new Set();
          fList.forEach((f) => floorsMap[b].add(f));
        });

        // Merge saved units
        Object.entries(savedUnits).forEach(([k, uList]) => {
          if (!unitsMap[k]) unitsMap[k] = new Set();
          uList.forEach((u) => unitsMap[k].add(u));
        });

        // Merge saved racks
        Object.entries(savedRacks).forEach(([k, rList]) => {
          if (!racksMap[k]) racksMap[k] = new Set();
          rList.forEach((r) => racksMap[k].add(r));
        });

        // Merge from existing network devices
        liveDevices.forEach((d) => {
          if (d.building) {
            bldgsSet.add(d.building);
            if (d.floor) {
              if (!floorsMap[d.building]) floorsMap[d.building] = new Set();
              floorsMap[d.building].add(d.floor);
              const k = `${d.building}:::${d.floor}`;
              if (d.unit) {
                if (!unitsMap[k]) unitsMap[k] = new Set();
                unitsMap[k].add(d.unit);
              }
              if (d.rack) {
                if (!racksMap[k]) racksMap[k] = new Set();
                racksMap[k].add(d.rack);
              }
            }
          }
        });

        const finalBuildings = Array.from(bldgsSet).filter(Boolean);
        const finalFloors: Record<string, string[]> = {};
        Object.entries(floorsMap).forEach(([b, fSet]) => {
          finalFloors[b] = Array.from(fSet).filter(Boolean);
        });
        const finalUnits: Record<string, string[]> = {};
        Object.entries(unitsMap).forEach(([k, uSet]) => {
          finalUnits[k] = Array.from(uSet).filter(Boolean);
        });
        const finalRacks: Record<string, string[]> = {};
        Object.entries(racksMap).forEach(([k, rSet]) => {
          finalRacks[k] = Array.from(rSet).filter(Boolean);
        });

        // Also aggregate all known items across whole system for quick re-use
        const allFSet = new Set<string>();
        Object.values(finalFloors).forEach((fArr) => fArr.forEach((f) => allFSet.add(f)));
        const allUSet = new Set<string>();
        Object.values(finalUnits).forEach((uArr) => uArr.forEach((u) => allUSet.add(u)));
        const allRSet = new Set<string>();
        Object.values(finalRacks).forEach((rArr) => rArr.forEach((r) => allRSet.add(r)));

        setHierarchyBuildings(finalBuildings);
        setHierarchyFloors(finalFloors);
        setHierarchyUnits(finalUnits);
        setHierarchyRacks(finalRacks);
        setAllKnownFloors(Array.from(allFSet).filter(Boolean));
        setAllKnownUnits(Array.from(allUSet).filter(Boolean));
        setAllKnownRacks(Array.from(allRSet).filter(Boolean));

        // If current building is empty or default and we have saved buildings, set default
        if (finalBuildings.length > 0 && (!building || !finalBuildings.includes(building))) {
          // If building was default, pick the first existing building
          const firstBldg = finalBuildings[0];
          setBuilding(firstBldg);
          setIsCustomBuilding(false);

          const availFloors = finalFloors[firstBldg] || [];
          if (availFloors.length > 0) {
            setFloor(availFloors[0]);
            setIsCustomFloor(false);

            const floorKey = `${firstBldg}:::${availFloors[0]}`;
            const availUnits = finalUnits[floorKey] || [];
            if (availUnits.length > 0) {
              setUnit(availUnits[0]);
              setIsCustomUnit(false);
            }
            const availRacks = finalRacks[floorKey] || [];
            if (availRacks.length > 0) {
              setRack(availRacks[0]);
              setIsCustomRack(false);
            }
          }
        }
      } catch (err) {}
    };

    loadHierarchy();
  }, [isOpen]);

  const handlePlatformChange = (newPlatform: DevicePlatform) => {
    setPlatform(newPlatform);
    if (newPlatform === 'mikrotik_routeros') {
      if (model.includes('Cisco') || model.includes('Ubuntu')) {
        setModel('MikroTik RouterBOARD CRS328-24P-4S+RM');
      }
      setRole('Core Switch / Router');
      setSshUsername('admin');
      setSshPassword('');
    } else if (newPlatform === 'generic_linux') {
      if (model.includes('Cisco') || model.includes('MikroTik')) {
        setModel('Ubuntu 22.04 LTS / OpenSwitch');
      }
      setRole('Network Gateway / Server');
      setSshUsername('root');
      setSshPassword('');
    } else if (newPlatform === 'cisco_ios_xe') {
      if (model.includes('2960') || model.includes('MikroTik')) {
        setModel('Cisco Catalyst 9300-24P');
      }
      setSshUsername('admin');
      setSshPassword('cisco123');
    } else if (newPlatform === 'cisco_ios') {
      if (model.includes('9300') || model.includes('MikroTik')) {
        setModel('Cisco Catalyst 2960X-48FPS-L');
      }
      setSshUsername('admin');
      setSshPassword('cisco123');
    }
  };

  if (!isOpen) return null;

  const handleProtocolChange = (proto: 'ssh' | 'telnet') => {
    setConnectionProtocol(proto);
    if (proto === 'telnet' && sshPort === 22) {
      setSshPort(23);
    } else if (proto === 'ssh' && sshPort === 23) {
      setSshPort(22);
    }
  };

  const handleTestConnection = async () => {
    const targetHost = (sshHost.trim() || ip.trim());
    if (!targetHost || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(targetHost)) {
      setError(isEn ? `Please enter a valid IP address for ${connectionProtocol.toUpperCase()} connection` : `لطفاً ابتدا آدرس IP معتبر وارد کنید تا اتصال ${connectionProtocol.toUpperCase()} تست شود`);
      return;
    }
    try {
      setIsTestingSsh(true);
      setSshTestResult(null);
      setError(null);
      const res = await testDeviceConnection({
        ip: targetHost,
        ssh_host: targetHost,
        ssh_port: Number(sshPort) || (connectionProtocol === 'telnet' ? 23 : 22),
        ssh_username: sshUsername.trim(),
        ssh_password: sshPassword,
        enable_password: enablePassword,
        protocol: connectionProtocol,
        connection_protocol: connectionProtocol,
        platform,
      });
      setSshTestResult({
        success: res.success,
        message: res.message || (res.success
          ? (isEn ? `${connectionProtocol.toUpperCase()} Connection successful!` : `اتصال ${connectionProtocol.toUpperCase()} برقرار و احراز هویت شد!`)
          : (res.error || (isEn ? 'Connection failed' : `اتصال ${connectionProtocol.toUpperCase()} ناموفق بود`))),
        latency_ms: res.latency_ms,
      });
    } catch (err: any) {
      setSshTestResult({
        success: false,
        message: err.message || (isEn ? 'Connection failed' : `اتصال ${connectionProtocol.toUpperCase()} ناموفق بود`),
      });
    } finally {
      setIsTestingSsh(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isEn ? 'Please enter device name' : 'لطفاً نام تجهیز را وارد کنید');
      return;
    }
    if (!ip.trim() || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip.trim())) {
      setError(isEn ? 'Please enter a valid IP address (e.g. 192.168.1.50)' : 'لطفاً آدرس IP معتبر وارد کنید (مثال: 192.168.1.50)');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const created = await onAdd({
        name: name.trim(),
        ip: ip.trim(),
        ssh_host: sshHost.trim() || ip.trim(),
        connection_protocol: connectionProtocol,
        type,
        role,
        platform,
        connection_mode: connectionMode,
        connection: {
          protocol: connectionProtocol,
          host: sshHost.trim() || ip.trim(),
          port: Number(sshPort) || (connectionProtocol === 'telnet' ? 23 : 22),
          username: sshUsername.trim() || 'admin',
          password: sshPassword,
          connection_timeout: 4000,
        },
        model: model.trim(),
        building: building.trim(),
        floor: floor.trim(),
        unit: unit.trim(),
        rack: rack.trim(),
        total_ports: Number(totalPorts),
        power_supplies: Number(powerSupplies) || 1,
        power_watts: Number(powerWatts) || 120,
        cdp_enabled: cdpEnabled,
        lldp_enabled: lldpEnabled,
        snmp_community: snmpCommunity.trim(),
        ssh_port: Number(sshPort) || 22,
        ssh_username: sshUsername.trim() || 'admin',
        ssh_password: sshPassword,
        enable_password: enablePassword,
        ssh_status: sshTestResult?.success ? 'authenticated' : 'configured',
      });

      // Persist any new building, floor, unit, or rack to localStorage hierarchy
      try {
        const HIERARCHY_STORAGE_KEY = 'nettopology_physical_hierarchy_v2';
        const raw = localStorage.getItem(HIERARCHY_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : { buildings: [], floors: {}, units: {}, racks: {} };
        const bList: string[] = Array.isArray(parsed.buildings) ? parsed.buildings : [];
        const fMap: Record<string, string[]> = parsed.floors && typeof parsed.floors === 'object' ? parsed.floors : {};
        const uMap: Record<string, string[]> = parsed.units && typeof parsed.units === 'object' ? parsed.units : {};
        const rMap: Record<string, string[]> = parsed.racks && typeof parsed.racks === 'object' ? parsed.racks : {};

        const bName = building.trim();
        const fName = floor.trim();
        const uName = unit.trim();
        const rName = rack.trim();

        if (bName && !bList.includes(bName)) {
          bList.push(bName);
        }
        if (bName && fName) {
          if (!fMap[bName]) fMap[bName] = [];
          if (!fMap[bName].includes(fName)) fMap[bName].push(fName);
        }
        const key = `${bName}:::${fName}`;
        if (bName && fName && uName) {
          if (!uMap[key]) uMap[key] = [];
          if (!uMap[key].includes(uName)) uMap[key].push(uName);
        }
        if (bName && fName && rName) {
          if (!rMap[key]) rMap[key] = [];
          if (!rMap[key].includes(rName)) rMap[key].push(rName);
        }
        localStorage.setItem(
          HIERARCHY_STORAGE_KEY,
          JSON.stringify({
            buildings: bList,
            floors: fMap,
            units: uMap,
            racks: rMap,
          })
        );
        window.dispatchEvent(new CustomEvent('nettopology_hierarchy_updated'));
      } catch (e) {}

      onClose();

      // If user selected a template for this newly introduced device, trigger interactive template applicator
      if (selectedTemplateId && onDeviceCreatedWithTemplate && created) {
        onDeviceCreatedWithTemplate(created as Device, selectedTemplateId);
      }
    } catch (err: any) {
      setError(err.message || (isEn ? 'Error adding device' : 'خطا در ثبت تجهیز'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-2 sm:p-4 modal-backdrop-blur overflow-y-auto"
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] sm:max-h-[88vh] flex flex-col transition-colors ${
        isLightMode
          ? 'bg-white border-slate-200 text-slate-800'
          : 'bg-slate-900/95 border-slate-800 text-slate-100 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl'
      }`}>
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 transition-colors ${
          isLightMode ? 'border-slate-200 bg-slate-50/90' : 'border-slate-800 bg-slate-950/80'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              isLightMode ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
            }`}>
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{t('add_device_title')}</h3>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>{t('add_device_subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  isLightMode
                    ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                    : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800'
                }`}
                title={isEn ? 'Minimize' : 'مینیمایز به نوار پایین'}
                aria-label={isEn ? 'Minimize' : 'مینیمایز'}
              >
                <Minus className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isLightMode
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              aria-label={t('action_close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
            {error && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                <AlertCircle className={`w-4 h-4 shrink-0 ${isLightMode ? 'text-rose-600' : 'text-rose-400'}`} />
                <span>{error}</span>
              </div>
            )}

            {/* Platform & OS Driver Selector */}
            <div className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/60'
            }`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-xs font-bold ${
                  isLightMode ? 'text-indigo-700' : 'text-indigo-400'
                }`}>
                  <Cpu className="w-4 h-4" />
                  <span>{isEn ? 'Hardware Platform & Network OS:' : 'پلتفرم سخت‌افزاری و سیستم‌عامل شبکه:'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>{isEn ? 'Driver Mode:' : 'حالت اجرا:'}</span>
                  <button
                    type="button"
                    onClick={() => setConnectionMode('ssh')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      connectionMode === 'ssh'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isLightMode
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    SSH Live
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectionMode('simulator')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      connectionMode === 'simulator'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : isLightMode
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Simulator
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handlePlatformChange('cisco_ios')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-center transition cursor-pointer ${
                    platform === 'cisco_ios'
                      ? isLightMode
                        ? 'bg-white border-indigo-600 text-indigo-700 shadow-sm ring-2 ring-indigo-500/20'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm ring-1 ring-indigo-500/30'
                      : isLightMode
                      ? 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-bold font-mono">Cisco IOS</span>
                  <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-slate-400'}`}>Catalyst 2960 / 3750</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePlatformChange('cisco_ios_xe')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-center transition cursor-pointer ${
                    platform === 'cisco_ios_xe'
                      ? isLightMode
                        ? 'bg-white border-indigo-600 text-indigo-700 shadow-sm ring-2 ring-indigo-500/20'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm ring-1 ring-indigo-500/30'
                      : isLightMode
                      ? 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-bold font-mono">Cisco IOS-XE</span>
                  <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-slate-400'}`}>Cat 9300 / ISR 4k</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePlatformChange('mikrotik_routeros')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-center transition cursor-pointer ${
                    platform === 'mikrotik_routeros'
                      ? isLightMode
                        ? 'bg-white border-indigo-600 text-indigo-700 shadow-sm ring-2 ring-indigo-500/20'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm ring-1 ring-indigo-500/30'
                      : isLightMode
                      ? 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-bold font-mono">MikroTik RouterOS</span>
                  <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-slate-400'}`}>CRS / CCR / RB</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePlatformChange('generic_linux')}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-center transition cursor-pointer ${
                    platform === 'generic_linux'
                      ? isLightMode
                        ? 'bg-white border-indigo-600 text-indigo-700 shadow-sm ring-2 ring-indigo-500/20'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm ring-1 ring-indigo-500/30'
                      : isLightMode
                      ? 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-bold font-mono">Generic Linux</span>
                  <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-slate-400'}`}>Ubuntu / VyOS / SONiC</span>
                </button>
              </div>
            </div>

            {/* Device Type Selector */}
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {isEn ? 'Device Role & Type:' : 'نوع تجهیز (Device Type):'}
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setType('switch');
                    setRole('Access Switch');
                    setModel('Cisco Catalyst 2960X-48FPS-L');
                    setTotalPorts(24);
                    setPowerSupplies(1);
                    setPowerWatts(120);
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    type === 'switch'
                      ? isLightMode
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Server className="w-4 h-4" />
                  <span className="text-xs font-bold">{isEn ? 'Switch' : 'سوییچ شبکه (Switch)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('router');
                    setRole('Edge Gateway');
                    setModel('Cisco ISR 4451-X');
                    setTotalPorts(8);
                    setPowerSupplies(1);
                    setPowerWatts(150);
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    type === 'router'
                      ? isLightMode
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <RouterIcon className="w-4 h-4" />
                  <span className="text-xs font-bold">{isEn ? 'Router' : 'روتر شبکه (Router)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setType('access_point');
                    setRole('Wireless AP');
                    setModel('Cisco Catalyst 9120AXI');
                    setTotalPorts(2);
                    setPowerSupplies(1);
                    setPowerWatts(25);
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    type === 'access_point'
                      ? isLightMode
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                        : 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                  <span className="text-xs font-bold">{isEn ? 'Access Point' : 'اکسس پوینت (AP)'}</span>
                </button>
              </div>
            </div>

            {/* Identity & IP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Device Hostname:' : 'نام یا شناسه تجهیز (Hostname):'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isEn ? 'e.g. SW-ACC-BLDG-A-F2' : 'مثلاً: SW-ACC-BLDG-A-F2'}
                  className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono text-left transition ${
                    isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:border-indigo-500 placeholder-slate-400 shadow-xs'
                      : 'bg-slate-900 border border-slate-700 text-white focus:border-indigo-500 placeholder-slate-500'
                  }`}
                  dir="ltr"
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Management IP Address:' : 'آدرس آی‌پی مدیریتی (IP Address):'}
                </label>
                <input
                  type="text"
                  required
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder={isEn ? 'e.g. 192.168.1.25' : 'مثلاً: 192.168.1.25'}
                  className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono text-left transition ${
                    isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:border-indigo-500 placeholder-slate-400 shadow-xs'
                      : 'bg-slate-900 border border-slate-700 text-white focus:border-indigo-500 placeholder-slate-500'
                  }`}
                  dir="ltr"
                />
              </div>
            </div>

            {/* Model & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Equipment Role:' : 'نقش تجهیز (Role):'}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none transition ${
                    isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:border-indigo-500 shadow-xs'
                      : 'bg-slate-900 border border-slate-700 text-white focus:border-indigo-500'
                  }`}
                >
                  <option value="Core Switch">{isEn ? 'Core Switch' : 'Core Switch (سوئیچ اصلی)'}</option>
                  <option value="Distribution Switch">{isEn ? 'Distribution Switch' : 'Distribution Switch (سوئیچ توزیع)'}</option>
                  <option value="Access Switch">{isEn ? 'Access Switch' : 'Access Switch (سوئیچ دسترسی)'}</option>
                  <option value="Edge Gateway">{isEn ? 'Edge Gateway / Router' : 'Edge Gateway / Router (مسیریاب مرزی)'}</option>
                  <option value="Wireless AP">{isEn ? 'Wireless Access Point' : 'Wireless Access Point (اکسس‌پوینت وای‌فای)'}</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Hardware Model:' : 'مدل سخت‌افزاری (Hardware Model):'}
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Cisco Catalyst / MikroTik / Aruba"
                  className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono text-left transition ${
                    isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:border-indigo-500 placeholder-slate-400 shadow-xs'
                      : 'bg-slate-900 border border-slate-700 text-white focus:border-indigo-500 placeholder-slate-500'
                  }`}
                  dir="ltr"
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Total Ports:' : 'تعداد پورت‌ها (Total Ports):'}
                </label>
                <select
                  value={totalPorts}
                  onChange={(e) => setTotalPorts(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono text-left transition ${
                    isLightMode
                      ? 'bg-slate-50 border border-slate-300 text-slate-800 focus:bg-white focus:border-indigo-500 shadow-xs'
                      : 'bg-slate-900 border border-slate-700 text-white focus:border-indigo-500'
                  }`}
                  dir="ltr"
                >
                  <option value={2}>2 Ports ({isEn ? 'for AP' : 'برای AP'})</option>
                  <option value={8}>8 Ports ({isEn ? 'for Router/Mini SW' : 'برای روتر/سوئیچ کوچک'})</option>
                  <option value={16}>16 Ports</option>
                  <option value={24}>24 Ports</option>
                  <option value={48}>48 Ports</option>
                </select>
              </div>
            </div>

            {/* Power Supplies & Consumption */}
            <div className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
              isLightMode
                ? 'bg-amber-50/50 border-amber-200/80 text-amber-900'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
            }`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-xs font-bold ${
                  isLightMode ? 'text-amber-900' : 'text-amber-300'
                }`}>
                  <Zap className={`w-4 h-4 ${isLightMode ? 'text-amber-600' : 'text-amber-400'}`} />
                  <span>{isEn ? 'Power Supply Units & Load (PSU & Watts):' : 'مشخصات منبع تغذیه برق و توان مصرفی (Power):'}</span>
                </div>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-semibold ${
                  isLightMode ? 'text-amber-700 bg-amber-100/70' : 'text-amber-300 bg-amber-900/40 border border-amber-700/50'
                }`}>
                  ~{(powerWatts / (1000 * 0.85)).toFixed(2)} kVA
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'Power Supplies (PSU Count):' : 'تعداد پاورها (Power Supplies):'}
                  </label>
                  <select
                    value={powerSupplies}
                    onChange={(e) => setPowerSupplies(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono transition ${
                      isLightMode
                        ? 'bg-white border border-amber-200 text-slate-800 focus:border-amber-500 shadow-xs'
                        : 'bg-slate-900 border border-amber-800/60 text-amber-100 focus:border-amber-500'
                    }`}
                  >
                    <option value={1}>{isEn ? '1 PSU (Single Feed)' : '۱ منبع تغذیه (Single PSU)'}</option>
                    <option value={2}>{isEn ? '2 PSUs (1+1 Redundant)' : '۲ منبع تغذیه (Redundant 1+1)'}</option>
                    <option value={3}>{isEn ? '3 PSUs (2+1 Redundant)' : '۳ منبع تغذیه (Redundant 2+1)'}</option>
                    <option value={4}>{isEn ? '4 PSUs (2+2 Dual Feed)' : '۴ منبع تغذیه (Dual Feed 2+2)'}</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? 'Rated Power (Watts):' : 'توان مصرفی برحسب وات (Watts):'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={12000}
                      step={5}
                      value={powerWatts}
                      onChange={(e) => setPowerWatts(Math.max(0, Number(e.target.value)))}
                      className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none font-mono text-left transition ${
                        isLightMode
                          ? 'bg-white border border-amber-200 text-slate-800 focus:border-amber-500 shadow-xs'
                          : 'bg-slate-900 border border-amber-800/60 text-amber-100 focus:border-amber-500'
                      }`}
                      dir="ltr"
                    />
                    <span className={`text-xs font-mono font-bold shrink-0 ${isLightMode ? 'text-amber-800' : 'text-amber-400'}`}>W</span>
                  </div>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px]">
                <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>{isEn ? 'Quick presets:' : 'مقادیر سریع:'}</span>
                {[
                  { label: 'AP (25W)', w: 25, psu: 1 },
                  { label: 'Router (80W)', w: 80, psu: 1 },
                  { label: 'Switch 24P (120W)', w: 120, psu: 1 },
                  { label: 'PoE+ Switch (370W)', w: 370, psu: 2 },
                  { label: '1U Server (350W)', w: 350, psu: 2 },
                  { label: '2U Server (650W)', w: 650, psu: 2 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPowerWatts(preset.w);
                      setPowerSupplies(preset.psu);
                    }}
                    className={`px-2 py-0.5 rounded-md font-mono transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white border border-amber-300/80 text-amber-800 hover:bg-amber-100 hover:border-amber-400'
                        : 'bg-amber-900/30 border border-amber-700/50 text-amber-300 hover:bg-amber-900/50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* SSH / Telnet Credentials & Connection Verification */}
            <div className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/60'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`flex items-center gap-2 text-xs font-bold ${
                  isLightMode ? 'text-indigo-700' : 'text-indigo-400'
                }`}>
                  <Terminal className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-indigo-400'}`} />
                  <span>{isEn ? 'Terminal Protocol & Credentials:' : 'مشخصات اتصال ترمینال و دسترسی CLI:'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`inline-flex rounded-lg p-0.5 border text-[11px] font-semibold ${
                    isLightMode ? 'bg-slate-200/80 border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}>
                    <button
                      type="button"
                      onClick={() => handleProtocolChange('ssh')}
                      className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        connectionProtocol === 'ssh'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : isLightMode
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      SSH
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProtocolChange('telnet')}
                      className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        connectionProtocol === 'telnet'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : isLightMode
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Telnet
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingSsh}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isTestingSsh ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{isEn ? 'Testing...' : 'در حال تست...'}</span>
                      </>
                    ) : (
                      <>
                        <Terminal className="w-3 h-3" />
                        <span>{isEn ? `Test ${connectionProtocol.toUpperCase()}` : `تست اتصال ${connectionProtocol.toUpperCase()}`}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* SSH / Telnet Test Status Result Banner */}
              {sshTestResult && (
                <div
                  className={`p-2.5 rounded-lg flex items-start gap-2 text-xs font-sans ${
                    sshTestResult.success
                      ? isLightMode
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : isLightMode
                      ? 'bg-rose-50 border border-rose-200 text-rose-800'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {sshTestResult.success ? (
                    <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${isLightMode ? 'text-emerald-600' : 'text-emerald-400'}`} />
                  ) : (
                    <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${isLightMode ? 'text-rose-600' : 'text-rose-400'}`} />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold">{sshTestResult.message}</div>
                    {sshTestResult.latency_ms !== undefined && (
                      <div className="text-[11px] opacity-80 mt-0.5 font-mono">
                        {isEn ? 'Latency' : 'پینگ / تاخیر'}: {sshTestResult.latency_ms}ms
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-8">
                  <label className="block text-[11px] font-medium mb-1 flex items-center justify-between">
                    <span className={`font-semibold ${isLightMode ? 'text-indigo-700' : 'text-indigo-400'}`}>
                      {isEn ? `${connectionProtocol.toUpperCase()} Target Host / IP:` : `آدرس IP اتصال ${connectionProtocol.toUpperCase()}:`}
                    </span>
                    <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Terminal connection target' : 'مقصد اتصال ترمینال مودال‌ها'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => setSshHost(e.target.value)}
                    placeholder={ip || '192.168.1.50'}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono text-left transition ${
                      isLightMode
                        ? 'bg-white border border-indigo-200 text-slate-800 focus:border-indigo-500'
                        : 'bg-slate-900 border border-indigo-500/50 text-indigo-100 focus:border-indigo-400'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? `${connectionProtocol.toUpperCase()} Port:` : `پورت ${connectionProtocol.toUpperCase()}:`}
                  </label>
                  <input
                    type="number"
                    value={sshPort}
                    onChange={(e) => setSshPort(Number(e.target.value))}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono text-left transition ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500'
                        : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {isEn ? `${connectionProtocol.toUpperCase()} Username:` : `نام کاربری ${connectionProtocol.toUpperCase()}:`}
                  </label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => setSshUsername(e.target.value)}
                    placeholder="admin"
                    className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono text-left transition ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500'
                        : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                    }`}
                    dir="ltr"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className={`block text-[11px] font-medium mb-1 flex items-center justify-between ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{isEn ? `${connectionProtocol.toUpperCase()} Password:` : `رمز عبور ${connectionProtocol.toUpperCase()}:`}</span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`cursor-pointer ${isLightMode ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono text-left transition ${
                      isLightMode
                        ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500'
                        : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                    }`}
                    dir="ltr"
                  />
                </div>

                {platform !== 'mikrotik_routeros' && platform !== 'generic_linux' ? (
                  <div className="sm:col-span-4">
                    <label className={`block text-[11px] font-medium mb-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isEn ? 'Enable Secret:' : 'رمز Enable (اختیاری):'}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={enablePassword}
                      onChange={(e) => setEnablePassword(e.target.value)}
                      placeholder="cisco"
                      className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-mono text-left transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500'
                          : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                      }`}
                      dir="ltr"
                    />
                  </div>
                ) : (
                  <div className="sm:col-span-4 flex items-center">
                    <div className={`p-2 rounded-lg border text-[11px] leading-relaxed ${
                      isLightMode
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    }`}>
                      {isEn
                        ? 'RouterOS / Linux uses direct user permissions; no enable password required.'
                        : 'سیستم‌عامل انتخابی نیازی به رمز Enable ندارد؛ سطح دسترسی مستقیماً از کاربر اعمال می‌شود.'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Location Fields (Building, Floor, Unit, Rack) with selector / creator */}
            <div className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/60'
            }`}>
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-1.5 text-xs font-bold ${
                  isLightMode ? 'text-indigo-700' : 'text-indigo-400'
                }`}>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Physical Placement Location:' : 'موقعیت استقرار فیزیکی تجهیز (Physical Location):'}</span>
                </div>
                <span className={`text-[10px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn ? 'Select defined or create new' : 'انتخاب از موارد تعریف‌شده یا ایجاد جدید'}
                </span>
              </div>

              {/* Datalists for custom input autocomplete */}
              <datalist id="building-suggestions">
                {hierarchyBuildings.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              <datalist id="floor-suggestions">
                {allKnownFloors.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <datalist id="unit-suggestions">
                {allKnownUnits.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
              <datalist id="rack-suggestions">
                {allKnownRacks.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Building Selector / Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className={`text-[11px] font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      {isEn ? 'Building:' : 'ساختمان (Building):'}
                    </label>
                    {hierarchyBuildings.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomBuilding((prev) => {
                            const next = !prev;
                            if (next) setBuilding('');
                            else if (hierarchyBuildings.length > 0) setBuilding(hierarchyBuildings[0]);
                            return next;
                          });
                        }}
                        className={`text-[10px] font-semibold flex items-center gap-0.5 transition cursor-pointer ${
                          isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'
                        }`}
                      >
                        {isCustomBuilding ? (
                          <>
                            <ListFilter className="w-3 h-3" />
                            <span>{isEn ? 'Choose Existing' : 'انتخاب از لیست'}</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>{isEn ? '+ New' : '+ جدید'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {!isCustomBuilding && hierarchyBuildings.length > 0 ? (
                    <select
                      value={building}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') {
                          setIsCustomBuilding(true);
                          setBuilding('');
                        } else {
                          const newBldg = e.target.value;
                          setBuilding(newBldg);
                          const availFloors = hierarchyFloors[newBldg] || allKnownFloors;
                          if (availFloors.length > 0 && !isCustomFloor) {
                            setFloor(availFloors[0]);
                            const floorKey = `${newBldg}:::${availFloors[0]}`;
                            const availUnits = hierarchyUnits[floorKey] || allKnownUnits;
                            if (availUnits.length > 0 && !isCustomUnit) setUnit(availUnits[0]);
                            const availRacks = hierarchyRacks[floorKey] || allKnownRacks;
                            if (availRacks.length > 0 && !isCustomRack) setRack(availRacks[0]);
                          }
                        }
                      }}
                      className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-medium transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 shadow-xs'
                          : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                      }`}
                    >
                      {hierarchyBuildings.map((b) => (
                        <option key={b} value={b}>
                          🏢 {b}
                        </option>
                      ))}
                      <option value="__add_new__" className={isLightMode ? 'text-indigo-600 font-bold' : 'text-indigo-400 font-bold'}>
                        {isEn ? '+ Add New Building...' : '+ تعریف ساختمان جدید...'}
                      </option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      list="building-suggestions"
                      value={building}
                      onChange={(e) => setBuilding(e.target.value)}
                      placeholder={isEn ? 'e.g. Central Building' : 'مثلاً: ساختمان مرکزی'}
                      className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none transition ${
                        isLightMode
                          ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 placeholder-slate-400'
                          : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500 placeholder-slate-500'
                      }`}
                      autoFocus={isCustomBuilding}
                    />
                  )}
                </div>

                {/* 2. Floor Selector / Input */}
                {(() => {
                  const bldgFloors = hierarchyFloors[building] || [];
                  const otherFloors = allKnownFloors.filter((f) => !bldgFloors.includes(f));
                  const hasFloors = bldgFloors.length > 0 || otherFloors.length > 0;

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-[11px] font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Floor:' : 'طبقه (Floor):'}
                        </label>
                        {hasFloors && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomFloor((prev) => {
                                const next = !prev;
                                if (next) setFloor('');
                                else {
                                  const avail = bldgFloors.length > 0 ? bldgFloors : allKnownFloors;
                                  if (avail.length > 0) setFloor(avail[0]);
                                }
                                return next;
                              });
                            }}
                            className={`text-[10px] font-semibold flex items-center gap-0.5 transition cursor-pointer ${
                              isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'
                            }`}
                          >
                            {isCustomFloor ? (
                              <>
                                <ListFilter className="w-3 h-3" />
                                <span>{isEn ? 'Choose Existing' : 'انتخاب از لیست'}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>{isEn ? '+ New' : '+ جدید'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {!isCustomFloor && hasFloors ? (
                        <select
                          value={floor}
                          onChange={(e) => {
                            if (e.target.value === '__add_new__') {
                              setIsCustomFloor(true);
                              setFloor('');
                            } else {
                              const newFlr = e.target.value;
                              setFloor(newFlr);
                              const floorKey = `${building}:::${newFlr}`;
                              const availUnits = hierarchyUnits[floorKey] || allKnownUnits;
                              if (availUnits.length > 0 && !isCustomUnit) setUnit(availUnits[0]);
                              const availRacks = hierarchyRacks[floorKey] || allKnownRacks;
                              if (availRacks.length > 0 && !isCustomRack) setRack(availRacks[0]);
                            }
                          }}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-medium transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 shadow-xs'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                          }`}
                        >
                          {bldgFloors.length > 0 && (
                            <optgroup label={isEn ? `Floors in ${building}` : `طبقات ساختمان «${building}»`}>
                              {bldgFloors.map((f) => (
                                <option key={f} value={f}>
                                  📐 {f}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherFloors.length > 0 && (
                            <optgroup label={isEn ? 'Other defined floors' : 'سایر طبقات تعریف‌شده در شبکه'}>
                              {otherFloors.map((f) => (
                                <option key={f} value={f}>
                                  📐 {f}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__add_new__" className={isLightMode ? 'text-indigo-600 font-bold' : 'text-indigo-400 font-bold'}>
                            {isEn ? '+ Add New Floor...' : '+ تعریف طبقه جدید...'}
                          </option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          list="floor-suggestions"
                          value={floor}
                          onChange={(e) => setFloor(e.target.value)}
                          placeholder={isEn ? 'e.g. Ground Floor, Floor 2' : 'مثلاً: طبقه همکف، طبقه ۱'}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 placeholder-slate-400'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500 placeholder-slate-500'
                          }`}
                          autoFocus={isCustomFloor}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* 3. Unit / Room / Section Selector / Input */}
                {(() => {
                  const floorKey = `${building}:::${floor}`;
                  const floorUnits = hierarchyUnits[floorKey] || [];
                  const otherUnits = allKnownUnits.filter((u) => !floorUnits.includes(u));
                  const hasUnits = floorUnits.length > 0 || otherUnits.length > 0;

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-[11px] font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Room / Unit / Section:' : 'واحد، اتاق یا سکشن (Unit / Room):'}
                        </label>
                        {hasUnits && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomUnit((prev) => {
                                const next = !prev;
                                if (next) setUnit('');
                                else {
                                  const avail = floorUnits.length > 0 ? floorUnits : allKnownUnits;
                                  if (avail.length > 0) setUnit(avail[0]);
                                }
                                return next;
                              });
                            }}
                            className={`text-[10px] font-semibold flex items-center gap-0.5 transition cursor-pointer ${
                              isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'
                            }`}
                          >
                            {isCustomUnit ? (
                              <>
                                <ListFilter className="w-3 h-3" />
                                <span>{isEn ? 'Choose Existing' : 'انتخاب از لیست'}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>{isEn ? '+ New' : '+ جدید'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {!isCustomUnit && hasUnits ? (
                        <select
                          value={unit}
                          onChange={(e) => {
                            if (e.target.value === '__add_new__') {
                              setIsCustomUnit(true);
                              setUnit('');
                            } else {
                              setUnit(e.target.value);
                            }
                          }}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-medium transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 shadow-xs'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                          }`}
                        >
                          {floorUnits.length > 0 && (
                            <optgroup label={isEn ? 'Units on this floor' : 'واحدهای این طبقه'}>
                              {floorUnits.map((u) => (
                                <option key={u} value={u}>
                                  🚪 {u}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherUnits.length > 0 && (
                            <optgroup label={isEn ? 'Other defined units / rooms' : 'سایر واحدهای تعریف‌شده در سیستم'}>
                              {otherUnits.map((u) => (
                                <option key={u} value={u}>
                                  🚪 {u}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__add_new__" className={isLightMode ? 'text-indigo-600 font-bold' : 'text-indigo-400 font-bold'}>
                            {isEn ? '+ Add New Unit / Room / Section...' : '+ تعریف واحد یا سکشن جدید...'}
                          </option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          required
                          list="unit-suggestions"
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder={isEn ? 'e.g. Server Room, NOC Section' : 'مثلاً: اتاق سرور، واحد مالی، سکشن NOC'}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 placeholder-slate-400'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500 placeholder-slate-500'
                          }`}
                          autoFocus={isCustomUnit}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* 4. Rack / Cabinet Selector / Input */}
                {(() => {
                  const floorKey = `${building}:::${floor}`;
                  const floorRacks = hierarchyRacks[floorKey] || [];
                  const otherRacks = allKnownRacks.filter((r) => !floorRacks.includes(r));
                  const hasRacks = floorRacks.length > 0 || otherRacks.length > 0;

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`text-[11px] font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          {isEn ? 'Rack / Cabinet:' : 'شماره رک یا کابینت (Rack / Cabinet):'}
                        </label>
                        {hasRacks && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomRack((prev) => {
                                const next = !prev;
                                if (next) setRack('');
                                else {
                                  const avail = floorRacks.length > 0 ? floorRacks : allKnownRacks;
                                  if (avail.length > 0) setRack(avail[0]);
                                }
                                return next;
                              });
                            }}
                            className={`text-[10px] font-semibold flex items-center gap-0.5 transition cursor-pointer ${
                              isLightMode ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-300'
                            }`}
                          >
                            {isCustomRack ? (
                              <>
                                <ListFilter className="w-3 h-3" />
                                <span>{isEn ? 'Choose Existing' : 'انتخاب از لیست'}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" />
                                <span>{isEn ? '+ New' : '+ جدید'}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {!isCustomRack && hasRacks ? (
                        <select
                          value={rack}
                          onChange={(e) => {
                            if (e.target.value === '__add_new__') {
                              setIsCustomRack(true);
                              setRack('');
                            } else {
                              setRack(e.target.value);
                            }
                          }}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none font-medium transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 shadow-xs'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500'
                          }`}
                        >
                          <option value="">{isEn ? '-- Unassigned / No Rack --' : '-- بدون رک / رک نامشخص --'}</option>
                          {floorRacks.length > 0 && (
                            <optgroup label={isEn ? 'Racks on this floor' : 'رک‌های این طبقه'}>
                              {floorRacks.map((r) => (
                                <option key={r} value={r}>
                                  🗄️ {r}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {otherRacks.length > 0 && (
                            <optgroup label={isEn ? 'Other defined racks' : 'سایر رک‌های شبکه'}>
                              {otherRacks.map((r) => (
                                <option key={r} value={r}>
                                  🗄️ {r}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__add_new__" className={isLightMode ? 'text-indigo-600 font-bold' : 'text-indigo-400 font-bold'}>
                            {isEn ? '+ Add New Rack...' : '+ تعریف رک جدید...'}
                          </option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          list="rack-suggestions"
                          value={rack}
                          onChange={(e) => setRack(e.target.value)}
                          placeholder={isEn ? 'e.g. Rack-A01, Wall Cabinet' : 'مثلاً: Rack-A01، کابینت دیواری'}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs focus:outline-none transition ${
                            isLightMode
                              ? 'bg-white border border-slate-300 text-slate-800 focus:border-indigo-500 placeholder-slate-400'
                              : 'bg-slate-900 border border-slate-700 text-slate-100 focus:border-indigo-500 placeholder-slate-500'
                          }`}
                          autoFocus={isCustomRack}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Configuration Template Selection */}
            <div className={`p-3.5 rounded-xl border text-xs space-y-2 transition-colors ${
              isLightMode
                ? 'bg-indigo-50/70 border-indigo-100 text-slate-800'
                : 'bg-indigo-950/20 border-indigo-800/40 text-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <label className={`font-bold flex items-center gap-1.5 text-xs ${
                  isLightMode ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  <FileCode2 className={`w-4 h-4 ${isLightMode ? 'text-indigo-600' : 'text-indigo-400'}`} />
                  <span>{isEn ? 'Initial Configuration Template:' : 'الگوی کانفیگ اولیه خودکار (Configuration Template):'}</span>
                </label>
                <span className={`text-[10px] font-medium font-mono ${
                  isLightMode ? 'text-indigo-600' : 'text-indigo-400'
                }`}>Cisco / MikroTik</span>
              </div>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg text-xs focus:outline-none font-sans transition ${
                  isLightMode
                    ? 'bg-white border border-indigo-200 text-slate-800 focus:border-indigo-500'
                    : 'bg-slate-900 border border-indigo-700/60 text-slate-100 focus:border-indigo-500'
                }`}
              >
                <option value="">{isEn ? '-- No Template (Register in Inventory Only) --' : '-- بدون تمپلیت (فقط ثبت در دیتابیس) --'}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.vendor.toUpperCase()}] {t.name} ({t.role})
                  </option>
                ))}
              </select>
              {selectedTemplateId && (
                <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-indigo-700' : 'text-indigo-300'}`}>
                  {isEn
                    ? 'After registration, the interactive deployment wizard will open to resolve variables and deploy commands to this device.'
                    : 'پس از زدن دکمه «ثبت تجهیز»، صفحه تایید تعاملی آدرس IP و متغیرهای کانفیگ با مشخصات همین تجهیز باز خواهد شد تا دستورات در مد مناسب به تجهیز ارسال گردند.'}
                </p>
              )}
            </div>

            {/* Discovery Protocols CDP & LLDP */}
            <div className={`flex flex-wrap items-center gap-4 p-3 rounded-xl border text-xs transition-colors ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/60'
            }`}>
              <span className={`font-medium text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn ? 'Discovery Protocols:' : 'پروتکل‌های اسکن همسایگی:'}
              </span>
              <label className={`flex items-center gap-1.5 cursor-pointer ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                <input
                  type="checkbox"
                  checked={cdpEnabled}
                  onChange={(e) => setCdpEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 cursor-pointer"
                />
                <span>CDP (Cisco Discovery Protocol)</span>
              </label>

              <label className={`flex items-center gap-1.5 cursor-pointer ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                <input
                  type="checkbox"
                  checked={lldpEnabled}
                  onChange={(e) => setLldpEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white border-slate-300 cursor-pointer"
                />
                <span>LLDP (IEEE 802.1AB)</span>
              </label>
            </div>
          </div>

          {/* Form Actions (Pinned Footer) */}
          <div className={`flex items-center justify-end gap-2.5 px-5 py-3 border-t shrink-0 transition-colors ${
            isLightMode ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/80'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {t('action_cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? t('add_device_btn_saving') : t('add_device_btn_submit')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

