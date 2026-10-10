import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  Server,
  Router as RouterIcon,
  Cable,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Tag,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Radio,
  Lock,
  Trash2,
  ExternalLink,
  Layers,
  Minus,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Device, SwitchPort, CustomTopologyLink } from '../types';
import { fetchDevicePorts } from '../services/api';
import { useLanguage } from '../i18n';
import { ModalHeaderControls } from './common/ModalHeaderControls';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';

interface CustomMapPortSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  isLightMode?: boolean;
  device: Device | null;
  side: 'source' | 'target';
  partnerDevice?: Device | null;
  partnerPort?: string | null;
  customMapLinks?: CustomTopologyLink[];
  allDevices?: Device[];
  onDisconnectLink?: (linkId: string) => void;
  onSelectPort: (portName: string, portData?: SwitchPort) => void;
}

export const CustomMapPortSelectorModal: React.FC<CustomMapPortSelectorModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  isLightMode: propIsLightMode,
  device,
  side,
  partnerDevice,
  partnerPort,
  customMapLinks = [],
  allDevices = [],
  onDisconnectLink,
  onSelectPort,
}) => {
  const { t, isEn, isRtl } = useLanguage();
  const [isMaximized, setIsMaximized] = useState(false);
  const [ports, setPorts] = useState<SwitchPort[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'available' | 'in_use' | 'trunk' | 'access'>('all');
  const [activeTab, setActiveTab] = useState<'select' | 'connections'>('select');
  const [confirmDisconnectLinkId, setConfirmDisconnectLinkId] = useState<string | null>(null);

  // Active theme calculation (Strict dark/light mode consistency)
  const isLight = propIsLightMode ?? (typeof document !== 'undefined' && (
    document.documentElement.classList.contains('light') ||
    document.querySelector('.theme-light') !== null ||
    localStorage.getItem('panel_theme') === 'light' ||
    localStorage.getItem('theme_mode') === 'light'
  ));

  useEffect(() => {
    if (!isOpen || !device) return;

    let isMounted = true;
    setLoading(true);

    fetchDevicePorts(device.id)
      .then((res) => {
        if (isMounted) {
          if (res?.ports && res.ports.length > 0) {
            setPorts(res.ports);
          } else {
            // Generate fallback ports based on device port count
            const count = device.total_ports || (device.type === 'router' ? 4 : 24);
            const fallback: SwitchPort[] = [];
            const prefix = device.type === 'router' ? 'GigabitEthernet0/' : 'GigabitEthernet1/0/';
            for (let i = 1; i <= count; i++) {
              fallback.push({
                port_id: `${prefix}${i}`,
                name: `${prefix}${i}`,
                status: i % 3 === 0 ? 'down' : 'up',
                admin_status: 'enabled',
                mode: i <= 4 ? 'trunk' : 'access',
                vlan: i <= 4 ? 1 : 10,
                allowed_vlans: i <= 4 ? '1,10,20,30' : '10',
                speed: '1Gbps',
                duplex: 'Full',
                connected_device: '',
              });
            }
            setPorts(fallback);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          const count = device.total_ports || (device.type === 'router' ? 4 : 24);
          const fallback: SwitchPort[] = [];
          const prefix = device.type === 'router' ? 'GigabitEthernet0/' : 'GigabitEthernet1/0/';
          for (let i = 1; i <= count; i++) {
            fallback.push({
              port_id: `${prefix}${i}`,
              name: `${prefix}${i}`,
              status: 'up',
              admin_status: 'enabled',
              mode: i <= 2 ? 'trunk' : 'access',
              vlan: 1,
              allowed_vlans: '1',
              speed: '1Gbps',
              duplex: 'Full',
              connected_device: '',
            });
          }
          setPorts(fallback);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, device]);

  if (!isOpen || !device) return null;

  // Helper to find connection details for a specific port on this device
  const getPortConnection = (portName: string) => {
    if (!customMapLinks || !device) return null;
    const pLower = portName.toLowerCase().trim();
    for (const l of customMapLinks) {
      if (l.sourceDeviceId === device.id && l.sourcePort.toLowerCase().trim() === pLower) {
        const peerDev = allDevices?.find((d) => d.id === l.targetDeviceId);
        return {
          link: l,
          peerDevice: peerDev,
          peerDeviceId: l.targetDeviceId,
          peerDeviceName: peerDev?.name || l.targetDeviceId,
          peerPort: l.targetPort,
          peerMode: l.targetMode,
          peerVlan: l.targetVlan,
          localPort: l.sourcePort,
          localMode: l.sourceMode,
          localVlan: l.sourceVlan,
          speed: l.speed,
          cableType: l.cableType,
        };
      }
      if (l.targetDeviceId === device.id && l.targetPort.toLowerCase().trim() === pLower) {
        const peerDev = allDevices?.find((d) => d.id === l.sourceDeviceId);
        return {
          link: l,
          peerDevice: peerDev,
          peerDeviceId: l.sourceDeviceId,
          peerDeviceName: peerDev?.name || l.sourceDeviceId,
          peerPort: l.sourcePort,
          peerMode: l.sourceMode,
          peerVlan: l.sourceVlan,
          localPort: l.targetPort,
          localMode: l.targetMode,
          localVlan: l.targetVlan,
          speed: l.speed,
          cableType: l.cableType,
        };
      }
    }
    return null;
  };

  // All active connections involving this device
  const deviceConnections = (customMapLinks || [])
    .filter((l) => l.sourceDeviceId === device.id || l.targetDeviceId === device.id)
    .map((l) => {
      const isSrc = l.sourceDeviceId === device.id;
      const peerId = isSrc ? l.targetDeviceId : l.sourceDeviceId;
      const peerDev = allDevices?.find((d) => d.id === peerId);
      return {
        link: l,
        localPort: isSrc ? l.sourcePort : l.targetPort,
        localMode: isSrc ? l.sourceMode : l.targetMode,
        localVlan: isSrc ? l.sourceVlan : l.targetVlan,
        peerId,
        peerDev,
        peerName: peerDev?.name || peerId,
        peerIp: peerDev?.ip || '',
        peerPort: isSrc ? l.targetPort : l.sourcePort,
        peerMode: isSrc ? l.targetMode : l.sourceMode,
        peerVlan: isSrc ? l.targetVlan : l.sourceVlan,
        speed: l.speed || '1G',
        cableType: l.cableType || 'Copper',
      };
    });

  const filteredPorts = ports.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const conn = getPortConnection(p.port_id);
    const isInUse = !!conn;

    const matchesSearch =
      !q ||
      p.port_id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.vlan && p.vlan.toString().includes(q)) ||
      (conn && conn.peerDeviceName.toLowerCase().includes(q)) ||
      (p.connected_device && p.connected_device.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterMode === 'available') return !isInUse;
    if (filterMode === 'in_use') return isInUse;
    if (filterMode === 'access') return p.mode === 'access';
    if (filterMode === 'trunk') return p.mode === 'trunk';
    return true;
  });

  const inUseCount = ports.filter((p) => !!getPortConnection(p.port_id)).length;
  const availableCount = Math.max(0, ports.length - inUseCount);

  const modalContent = (
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[100000] flex items-center justify-center transition-all duration-200 ${
        isMaximized ? 'p-0' : 'p-3 sm:p-6'
      } ${
        isLight ? 'bg-slate-900/40 backdrop-blur-xs' : 'bg-black/80 backdrop-blur-sm'
      }`}
      data-modal-backdrop="true"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        className={`w-full flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'h-full max-w-none max-h-full rounded-none border-none'
            : 'max-w-2xl max-h-[88vh] rounded-2xl border'
        } ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        } animate-in fade-in zoom-in-95 duration-150`}
      >
        {/* Modal Header */}
        <div className={`p-4 sm:px-6 border-b flex items-center justify-between transition-colors ${
          isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl border flex-shrink-0 ${
              isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-indigo-950/60 border-indigo-800/60 text-indigo-400'
            }`}>
              <Cable className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                  isLight
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/50'
                }`}>
                  {side === 'source' ? (isEn ? 'Step 1: Source Port' : 'مرحله ۱: پورت مبدا') : (isEn ? 'Step 2: Destination Port' : 'مرحله ۲: پورت مقصد')}
                </span>
                <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {device.ip}
                </span>
              </div>
              <h3 className={`text-base font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? `Select Port on ${device.name}` : `انتخاب پورت روی ${device.name}`}
              </h3>
            </div>
          </div>
          <ModalHeaderControls
            onClose={onClose}
            onMinimize={onMinimize}
            onMaximizeToggle={() => setIsMaximized(!isMaximized)}
            isMaximized={isMaximized}
            isLightMode={isLight}
            isEn={isEn}
          />
        </div>

        {/* Tab Navigation: Select Port vs Connected Ports Overview */}
        <div className={`flex items-center border-b px-4 pt-2 gap-2 text-xs transition-colors ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/70 border-slate-800'
        }`}>
          <button
            onClick={() => setActiveTab('select')}
            className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'select'
                ? isLight
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-indigo-500 text-indigo-400'
                : isLight
                  ? 'border-transparent text-slate-600 hover:text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cable className="w-3.5 h-3.5" />
            <span>{isEn ? 'Select Port for Cable' : 'انتخاب پورت جهت اتصال کابل'}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
            }`}>
              {availableCount} {isEn ? 'free' : 'آزاد'}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('connections')}
            className={`pb-2 px-3 font-semibold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'connections'
                ? isLight
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-indigo-500 text-indigo-400'
                : isLight
                  ? 'border-transparent text-slate-600 hover:text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isEn ? 'Port Connections' : 'اتصالات پورت‌های این دیوایس'}</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
              isLight
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/40'
            }`}>
              {deviceConnections.length}
            </span>
          </button>
        </div>

        {/* Cable Connection Hint / Context */}
        {partnerDevice && partnerPort && activeTab === 'select' && (
          <div className={`px-4 py-2.5 border-b flex items-center justify-between text-xs transition-colors ${
            isLight
              ? 'bg-indigo-50/80 border-indigo-100 text-indigo-800'
              : 'bg-indigo-950/30 border-indigo-900/40 text-indigo-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{isEn ? 'Connecting from:' : 'در حال اتصال کابل از:'}</span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                isLight
                  ? 'bg-white border-indigo-200 text-indigo-900'
                  : 'bg-slate-900 border-indigo-800 text-indigo-200'
              }`}>
                {partnerDevice.name} ({partnerPort})
              </span>
            </div>
            <div className={`flex items-center gap-1 font-mono text-[11px] ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              <span>{device.name}</span>
            </div>
          </div>
        )}

        {/* TAB 1: Select Port */}
        {activeTab === 'select' && (
          <>
            {/* Search & Filter Bar */}
            <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
              isLight ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}>
              <div className="relative flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder={isEn ? 'Search port (e.g. Gi1/0/1, Trunk, VLAN 10)...' : 'جستجوی پورت (مثلا Gi1/0/1، ترانک، ویلن ۱۰)...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full px-3 py-1.5 ${isRtl ? 'pr-8' : 'pl-8'} rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500'
                  }`}
                />
                <Search className={`w-3.5 h-3.5 text-slate-400 absolute ${isRtl ? 'right-2.5' : 'left-2.5'} top-2.5`} />
              </div>

              <div className={`flex items-center gap-1 rounded-xl p-1 text-xs border ${
                isLight ? 'bg-slate-200/70 border-slate-300/50' : 'bg-slate-900 border-slate-800'
              }`}>
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-lg transition font-medium text-[11px] cursor-pointer ${
                    filterMode === 'all'
                      ? isLight
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-slate-800 text-white shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'All' : 'همه'} ({ports.length})
                </button>
                <button
                  onClick={() => setFilterMode('available')}
                  className={`px-2.5 py-1 rounded-lg transition font-medium text-[11px] cursor-pointer ${
                    filterMode === 'available'
                      ? isLight
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Available' : 'پورت‌های آزاد'} ({availableCount})
                </button>
                <button
                  onClick={() => setFilterMode('in_use')}
                  className={`px-2.5 py-1 rounded-lg transition font-medium text-[11px] cursor-pointer ${
                    filterMode === 'in_use'
                      ? isLight
                        ? 'bg-white text-amber-700 shadow-xs'
                        : 'bg-amber-950/70 text-amber-400 border border-amber-800/60 shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'In Use' : 'متصل شده'} ({inUseCount})
                </button>
                <button
                  onClick={() => setFilterMode('trunk')}
                  className={`px-2.5 py-1 rounded-lg transition font-medium text-[11px] cursor-pointer ${
                    filterMode === 'trunk'
                      ? isLight
                        ? 'bg-white text-purple-700 shadow-xs'
                        : 'bg-purple-950/70 text-purple-400 border border-purple-800/60 shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Trunk' : 'ترانک'}
                </button>
                <button
                  onClick={() => setFilterMode('access')}
                  className={`px-2.5 py-1 rounded-lg transition font-medium text-[11px] cursor-pointer ${
                    filterMode === 'access'
                      ? isLight
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'bg-blue-950/70 text-blue-400 border border-blue-800/60 shadow-xs'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Access' : 'اکسس'}
                </button>
              </div>

              <FieldInfoTooltip
                title={isEn ? 'Physical Switch Ports' : 'اینترفیس‌های فیزیکی سوئیچ'}
                whatIsIt={isEn ? 'Selects a physical interface on this device to attach the topology cable.' : 'انتخاب پورت فیزیکی جهت اتصال کابل و لینک توپولوژی.'}
                whyNeeded={isEn ? 'Every network link requires an exact physical interface to track connectivity and VLAN configuration.' : 'هر اتصال در شبکه برای ردگیری وضعیت و تنظیمات VLAN نیاز به یک پورت مشخص فیزیکی دارد.'}
                example={isEn ? 'GigabitEthernet0/1 (Trunk) or GigabitEthernet1/0/24 (Access)' : 'GigabitEthernet0/1 (ترانک) یا GigabitEthernet1/0/24 (اکسس)'}
                isLightMode={isLight}
                isEn={isEn}
              />
            </div>

            {/* Ports Grid / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <div className={`py-16 text-center text-xs flex flex-col items-center justify-center gap-2 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  <span>{isEn ? 'Loading device physical interfaces...' : 'در حال بارگذاری اینترفیس‌های فیزیکی تجهیز...'}</span>
                </div>
              ) : filteredPorts.length === 0 ? (
                <div className={`py-12 text-center text-xs ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {isEn ? 'No ports matched your filter criteria.' : 'هیچ پورتی مطابق با فیلتر یافت نشد.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredPorts.map((port) => {
                    const isUp = port.status === 'up';
                    const isTrunk = port.mode === 'trunk';
                    const isDisabled = port.admin_status === 'disabled';
                    const conn = getPortConnection(port.port_id);
                    const isInUse = !!conn;

                    return (
                      <button
                        key={port.port_id}
                        onClick={() => onSelectPort(port.port_id, port)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition text-left group cursor-pointer ${
                          isInUse
                            ? isLight
                              ? 'bg-amber-50/70 border-amber-300 hover:border-amber-500 shadow-xs'
                              : 'bg-amber-950/20 border-amber-700/60 hover:border-amber-500 shadow-xs'
                            : isLight
                              ? 'bg-white border-slate-200 hover:border-indigo-500 hover:shadow-md'
                              : 'bg-slate-900 border-slate-800 hover:border-indigo-500 hover:bg-slate-800 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isInUse
                                ? 'bg-amber-500 ring-2 ' + (isLight ? 'ring-amber-300' : 'ring-amber-700')
                                : isDisabled
                                ? 'bg-amber-500'
                                : isUp
                                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                                : isLight ? 'bg-slate-400' : 'bg-slate-600'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-bold font-mono transition truncate ${
                                isInUse
                                  ? isLight ? 'text-amber-900' : 'text-amber-200'
                                  : isLight
                                    ? 'text-slate-900 group-hover:text-indigo-600'
                                    : 'text-slate-100 group-hover:text-indigo-400'
                              }`}>
                                {port.port_id}
                              </span>
                              {isInUse && (
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold flex items-center gap-0.5 border ${
                                  isLight
                                    ? 'bg-amber-200/70 text-amber-900 border-amber-300'
                                    : 'bg-amber-900/60 text-amber-300 border-amber-700'
                                }`}>
                                  <Lock className="w-2.5 h-2.5" />
                                  {isEn ? 'In Use' : 'متصل'}
                                </span>
                              )}
                            </div>
                            <div className={`text-[10px] flex items-center gap-1.5 font-mono mt-0.5 ${
                              isLight ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              <span>{port.speed || '1Gbps'}</span>
                              {isInUse && conn ? (
                                <span className={`font-bold truncate max-w-[130px] ${
                                  isLight ? 'text-amber-700' : 'text-amber-400'
                                }`} title={`Connected to ${conn.peerDeviceName} (${conn.peerPort})`}>
                                  → {conn.peerDeviceName} ({conn.peerPort})
                                </span>
                              ) : port.connected_device ? (
                                <span className="truncate max-w-[110px]" title={port.connected_device}>
                                  • {port.connected_device}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              isTrunk
                                ? isLight
                                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                                  : 'bg-purple-950/60 text-purple-300 border-purple-800'
                                : isLight
                                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                                  : 'bg-blue-950/60 text-blue-300 border-blue-800'
                            }`}
                          >
                            {isTrunk ? 'Trunk' : `VLAN ${port.vlan || 1}`}
                          </span>
                          <div className={`p-1 rounded-lg transition ${
                            isInUse
                              ? isLight
                                ? 'text-amber-600 group-hover:bg-amber-100'
                                : 'text-amber-400 group-hover:bg-amber-900/40'
                              : isLight
                                ? 'text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50'
                                : 'text-slate-400 group-hover:text-indigo-400 group-hover:bg-indigo-950'
                          }`}>
                            {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: Connected Ports Detailed Overview */}
        {activeTab === 'connections' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className={`flex items-center justify-between pb-2 border-b ${
              isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800 text-slate-300'
            }`}>
              <span className="text-xs font-semibold">
                {isEn
                  ? `Active Cable Links on ${device.name} (${deviceConnections.length})`
                  : `کابل‌های متصل به ${device.name} (${deviceConnections.length} ارتباط)`}
              </span>
              <span className={`text-[11px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {device.ip}
              </span>
            </div>

            {deviceConnections.length === 0 ? (
              <div className={`py-14 text-center text-xs flex flex-col items-center justify-center gap-2 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}>
                <Cable className={`w-8 h-8 ${isLight ? 'text-slate-300' : 'text-slate-700'}`} />
                <span className="font-medium">
                  {isEn
                    ? 'No cable links currently connected to this device.'
                    : 'در حال حاضر هیچ کابل یا اتصالی برای این دیوایس ثبت نشده است.'}
                </span>
                <button
                  onClick={() => setActiveTab('select')}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition cursor-pointer"
                >
                  {isEn ? 'Attach First Cable' : 'اتصال اولین کابل'}
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {deviceConnections.map((conn) => (
                  <div
                    key={conn.link.id}
                    className={`p-3.5 rounded-xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isLight
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-xl border shrink-0 ${
                        isLight
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                          : 'bg-indigo-950/50 border-indigo-800 text-indigo-400'
                      }`}>
                        <Cable className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold font-mono">
                          <span className={`px-2 py-0.5 rounded border ${
                            isLight
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'bg-indigo-950 border-indigo-800 text-indigo-400'
                          }`}>
                            {conn.localPort}
                          </span>
                          <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>
                            {isRtl ? '← متصل به →' : '↔ connected to ↔'}
                          </span>
                          <span className={isLight ? 'text-slate-900' : 'text-white'}>
                            {conn.peerName}
                          </span>
                          <span className={`px-2 py-0.5 rounded border ${
                            isLight
                              ? 'bg-purple-50 border-purple-200 text-purple-700'
                              : 'bg-purple-950 border-purple-800 text-purple-400'
                          }`}>
                            {conn.peerPort}
                          </span>
                        </div>

                        <div className={`flex flex-wrap items-center gap-2 text-[11px] font-mono mt-1 ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                          <span>{conn.speed}</span>
                          <span>•</span>
                          <span>{conn.cableType}</span>
                          {conn.peerIp && (
                            <>
                              <span>•</span>
                              <span>{conn.peerIp}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            {conn.localMode === 'trunk' ? 'Trunk' : `VLAN ${conn.localVlan || 1}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {confirmDisconnectLinkId === conn.link.id ? (
                        <div className={`flex items-center gap-1.5 p-1 rounded-lg border animate-in fade-in ${
                          isLight ? 'bg-rose-50 border-rose-300' : 'bg-rose-950/40 border-rose-800'
                        }`}>
                          <span className={`text-[10px] font-medium px-1 ${
                            isLight ? 'text-rose-700' : 'text-rose-300'
                          }`}>
                            {isEn ? 'Confirm remove?' : 'حذف شود؟'}
                          </span>
                          <button
                            onClick={() => {
                              if (onDisconnectLink) onDisconnectLink(conn.link.id);
                              setConfirmDisconnectLinkId(null);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] cursor-pointer"
                          >
                            {isEn ? 'Yes' : 'بله'}
                          </button>
                          <button
                            onClick={() => setConfirmDisconnectLinkId(null)}
                            className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                              isLight ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                            }`}
                          >
                            {isEn ? 'No' : 'خیر'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDisconnectLinkId(conn.link.id)}
                          className={`px-2.5 py-1 rounded-lg border transition text-xs font-medium flex items-center gap-1 cursor-pointer ${
                            isLight
                              ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                              : 'border-rose-900/60 text-rose-400 hover:bg-rose-950/40'
                          }`}
                          title={isEn ? 'Disconnect and remove this cable' : 'قطع و حذف این کابل'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Disconnect' : 'قطع اتصال کابل'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className={`p-3.5 border-t flex items-center justify-between text-xs transition-colors ${
          isLight
            ? 'bg-slate-50 border-slate-200 text-slate-500'
            : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}>
          <span>
            {activeTab === 'select'
              ? (isEn
                  ? `Ports marked with "In Use" are already wired to other devices.`
                  : `پورت‌های با برچسب «متصل» قبلاً به دستگاه‌های دیگر کابل‌کشی شده‌اند.`)
              : (isEn
                  ? `Total active cable connections: ${deviceConnections.length}`
                  : `مجموع ارتباطات فعال کابل این دستگاه: ${deviceConnections.length}`)}
          </span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl border transition font-medium cursor-pointer ${
              isLight
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {isEn ? 'Cancel' : 'انصراف'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};

