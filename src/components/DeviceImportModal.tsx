import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  X,
  Minus,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Server,
  Layers,
  Lock,
  RefreshCw,
  FileText,
  Download,
  Check,
  Info,
  Sliders,
  Plus,
  Network,
} from 'lucide-react';
import { Device } from '../types';
import { FieldInfoTooltip } from './common/FieldInfoTooltip';
import { useModalDock } from '../context/ModalDockContext';
import { getAuthHeaders } from '../services/settingsStorage';

export interface DeviceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  existingDevices: Device[];
  effectivePolicy?: any;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const DeviceImportModal: React.FC<DeviceImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingDevices = [],
  effectivePolicy,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  // Modal Window State
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'single'>('upload');

  // Input states
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<'json' | 'csv' | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');

  // Single Device Form State
  const [singleName, setSingleName] = useState('');
  const [singleIp, setSingleIp] = useState('');
  const [singleType, setSingleType] = useState('switch');
  const [singleModel, setSingleModel] = useState('Catalyst 2960-X');
  const [singlePlatform, setSinglePlatform] = useState('cisco_ios_xe');
  const [singleRole, setSingleRole] = useState('Access Switch');
  const [singleTotalPorts, setSingleTotalPorts] = useState(24);
  const [singleBuilding, setSingleBuilding] = useState('');
  const [singleFloor, setSingleFloor] = useState('');
  const [singleUnit, setSingleUnit] = useState('');
  const [singleRack, setSingleRack] = useState('');
  const [singleMac, setSingleMac] = useState('');
  const [singleSshUser, setSingleSshUser] = useState('admin');
  const [singleSshPort, setSingleSshPort] = useState(22);

  // Parsed candidate preview
  const [parsedDevices, setParsedDevices] = useState<any[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Execution states
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check RBAC Authorization for Device Import
  const isImportPermitted =
    !effectivePolicy ||
    (effectivePolicy.canImportDevices !== false &&
      (effectivePolicy.canImportDevices === true ||
        effectivePolicy.canManageDevices === true ||
        effectivePolicy.defaultDevicePermissions?.import_devices === true ||
        effectivePolicy.id === 'policy-super-admin'));

  if (!isOpen) return null;

  // Minimize handler adhering to Rule 5 & 7
  const handleMinimize = () => {
    dockModal({
      id: 'modal-device-import',
      labelEn: `Import Equipment (${parsedDevices.length || 'Ready'})`,
      labelFa: `ورود تجهیزات (${parsedDevices.length || 'آماده'})`,
      badge: 'IMPORT',
      category: 'device',
      onRestore: () => {
        undockModal('modal-device-import');
      },
      onClose: () => {
        undockModal('modal-device-import');
        onClose();
      },
    });
    onClose();
  };

  // Helper to parse CSV string into objects
  const parseCsvToDevices = (csvText: string): any[] => {
    const clean = csvText.replace(/^\uFEFF/, '').trim();
    if (!clean) return [];
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      const obj: Record<string, any> = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx] ?? '';
      });

      const ip = (obj.ip || obj.ipaddress || obj.host || obj.sshhost || '').trim();
      const name = (obj.name || obj.devicename || obj.hostname || obj.id || `Imported Device ${i}`).trim();
      if (!ip && !obj.name && !obj.id) continue;

      const rawType = (obj.type || obj.devicetype || '').toLowerCase();
      const type = rawType.includes('rout')
        ? 'router'
        : rawType.includes('fire')
        ? 'firewall'
        : rawType.includes('ap') || rawType.includes('wire')
        ? 'access_point'
        : rawType.includes('serv')
        ? 'server'
        : 'switch';

      const rawPlatform = (obj.platform || '').toLowerCase();
      const platform = rawPlatform.includes('miko') || rawPlatform.includes('routeros')
        ? 'mikrotik_routeros'
        : rawPlatform.includes('nx')
        ? 'cisco_nxos'
        : rawPlatform.includes('juniper')
        ? 'juniper_junos'
        : rawPlatform.includes('huawei')
        ? 'huawei_vrp'
        : rawPlatform.includes('arista')
        ? 'arista_eos'
        : 'cisco_ios_xe';

      rows.push({
        id: obj.id || obj.deviceid || `dev-${Date.now()}-${i}`,
        name,
        ip: ip || '127.0.0.1',
        type,
        model: obj.model || obj.hardwaremodel || (type === 'switch' ? 'Catalyst 2960-X' : 'ISR 4331'),
        platform,
        role: obj.role || obj.devicerole || 'Access Switch',
        mac_address: obj.mac || obj.macaddress || '',
        total_ports: Number(obj.totalports || obj.ports || obj.portcount) || 24,
        building: obj.building || '',
        floor: obj.floor || '',
        unit: obj.unit || '',
        rack: obj.rack || '',
        section: obj.section || '',
        ssh_host: obj.sshhost || ip || '127.0.0.1',
        ssh_port: Number(obj.sshport || obj.port) || 22,
        ssh_username: obj.sshusername || obj.username || 'admin',
        is_online: obj.status?.toLowerCase().includes('off') ? false : true,
      });
    }

    return rows;
  };

  // Helper to parse JSON string into device objects
  const parseJsonToDevices = (jsonText: string): any[] => {
    const parsed = JSON.parse(jsonText);
    let rawList: any[] = [];
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.devices)) {
        rawList = parsed.devices;
      } else if (Array.isArray(parsed.data)) {
        rawList = parsed.data;
      } else {
        rawList = [parsed];
      }
    }

    return rawList.map((item, idx) => ({
      id: item.id || item.device_id || `dev-${Date.now()}-${idx + 1}`,
      name: item.name || item.hostname || item.device_name || `Imported Device ${idx + 1}`,
      ip: item.ip || item.ip_address || item.host || '127.0.0.1',
      type: item.type || 'switch',
      model: item.model || 'Catalyst 2960-X',
      platform: item.platform || 'cisco_ios_xe',
      role: item.role || 'Access Switch',
      mac_address: item.mac_address || item.mac || '',
      total_ports: Number(item.total_ports || item.ports?.length) || 24,
      ports: Array.isArray(item.ports) ? item.ports : [],
      building: item.building || '',
      floor: item.floor || '',
      unit: item.unit || '',
      rack: item.rack || '',
      section: item.section || '',
      location: item.location || '',
      ssh_host: item.ssh_host || item.ip || '127.0.0.1',
      ssh_port: Number(item.ssh_port) || 22,
      ssh_username: item.ssh_username || 'admin',
      is_online: item.is_online !== undefined ? Boolean(item.is_online) : true,
    }));
  };

  // Handler for parsing either raw string or file
  const handleProcessRawText = (text: string, forceType?: 'json' | 'csv') => {
    const trimmed = text.trim();
    if (!trimmed) {
      setParsedDevices([]);
      setParseError(null);
      return;
    }

    let detectedType = forceType;
    if (!detectedType) {
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        detectedType = 'json';
      } else {
        detectedType = 'csv';
      }
    }

    setFileType(detectedType);

    try {
      if (detectedType === 'json') {
        const items = parseJsonToDevices(trimmed);
        if (items.length === 0) {
          throw new Error(isEn ? 'No device items found in JSON structure.' : 'هیچ رکوردی در ساختار JSON یافت نشد.');
        }
        setParsedDevices(items);
        setParseError(null);
      } else {
        const items = parseCsvToDevices(trimmed);
        if (items.length === 0) {
          throw new Error(
            isEn
              ? 'Could not parse CSV. Header row (Name, IP, Type, etc.) is required.'
              : 'امکان پردازش CSV وجود ندارد. سطر اول به عنوان هدر الزامی است.'
          );
        }
        setParsedDevices(items);
        setParseError(null);
      }
    } catch (err: any) {
      setParseError(err.message || (isEn ? 'Parsing failed' : 'خطا در پردازش اطلاعات'));
      setParsedDevices([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const typeHint = ext === 'json' ? 'json' : ext === 'csv' ? 'csv' : undefined;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setFileContent(content);
      handleProcessRawText(content, typeHint);
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    setFile(droppedFile);
    const ext = droppedFile.name.split('.').pop()?.toLowerCase();
    const typeHint = ext === 'json' ? 'json' : ext === 'csv' ? 'csv' : undefined;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setFileContent(content);
      handleProcessRawText(content, typeHint);
    };
    reader.readAsText(droppedFile);
  };

  // Add single device to candidate list
  const handleAddSingleDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim() || !singleIp.trim()) return;

    const newSingle = {
      id: `dev-${Date.now()}`,
      name: singleName.trim(),
      ip: singleIp.trim(),
      type: singleType,
      model: singleModel.trim(),
      platform: singlePlatform,
      role: singleRole.trim(),
      total_ports: Number(singleTotalPorts) || 24,
      mac_address: singleMac.trim(),
      building: singleBuilding.trim(),
      floor: singleFloor.trim(),
      unit: singleUnit.trim(),
      rack: singleRack.trim(),
      ssh_host: singleIp.trim(),
      ssh_port: Number(singleSshPort) || 22,
      ssh_username: singleSshUser.trim() || 'admin',
      is_online: true,
    };

    setParsedDevices((prev) => [newSingle, ...prev]);
    setSingleName('');
    setSingleIp('');
    setSingleMac('');
    setParseError(null);
  };

  const handleExecuteImport = async () => {
    if (!isImportPermitted || parsedDevices.length === 0) return;
    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/devices/import', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          devices: parsedDevices,
          conflictMode,
        }),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(
          (isEn ? resJson.error : resJson.errorFa) ||
            (isEn ? 'Failed to import network equipment records.' : 'خطا در ثبت و ورود تجهیزات شبکه.')
        );
      }

      setImportResult({
        importedCount: resJson.importedCount ?? parsedDevices.length,
        updatedCount: resJson.updatedCount ?? 0,
        skippedCount: resJson.skippedCount ?? 0,
        message: isEn ? resJson.message_en || resJson.message : resJson.message_fa || resJson.message,
      });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      setError(err.message || (isEn ? 'Import failed' : 'عملیات ورود با خطا مواجه شد'));
    } finally {
      setIsImporting(false);
    }
  };

  // Sample templates download
  const handleDownloadSample = (type: 'json' | 'csv') => {
    if (type === 'json') {
      const sample = [
        {
          name: 'Core-Catalyst-9300',
          ip: '192.168.10.1',
          type: 'switch',
          model: 'Catalyst 9300-48P',
          platform: 'cisco_ios_xe',
          role: 'Core Switch',
          total_ports: 48,
          mac: '00:1A:2B:3C:4D:5E',
          building: 'Main Data Center',
          floor: 'Floor 1',
          unit: 'DC-West',
          rack: 'Rack-A1',
          ssh_username: 'admin',
          ssh_port: 22,
        },
        {
          name: 'Edge-Router-CCR2004',
          ip: '192.168.10.2',
          type: 'router',
          model: 'MikroTik CCR2004-16G-2S+',
          platform: 'mikrotik_routeros',
          role: 'Edge Gateway',
          total_ports: 18,
          mac: 'D4:CA:6D:11:22:33',
          building: 'Main Data Center',
          floor: 'Floor 1',
          unit: 'DC-East',
          rack: 'Rack-A2',
          ssh_username: 'admin',
          ssh_port: 22,
        },
        {
          name: 'Access-Dist-SW02',
          ip: '192.168.20.15',
          type: 'switch',
          model: 'Catalyst 2960-X',
          platform: 'cisco_ios_xe',
          role: 'Access Switch',
          total_ports: 24,
          mac: '00:2B:3C:4D:5E:6F',
          building: 'Building B',
          floor: 'Floor 2',
          unit: 'Office-204',
          rack: 'Wall-Cabinet-02',
          ssh_username: 'cisco',
          ssh_port: 22,
        },
      ];
      const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'network_equipment_import_template.json';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = 'Name,IP,Type,Model,Platform,Role,Total_Ports,MAC,Building,Floor,Unit,Rack,SSH_Username,SSH_Port\n';
      const rows =
        'Core-Catalyst-9300,192.168.10.1,switch,Catalyst 9300-48P,cisco_ios_xe,Core Switch,48,00:1A:2B:3C:4D:5E,Main Data Center,Floor 1,DC-West,Rack-A1,admin,22\n' +
        'Edge-Router-CCR2004,192.168.10.2,router,MikroTik CCR2004-16G-2S+,mikrotik_routeros,Edge Gateway,18,D4:CA:6D:11:22:33,Main Data Center,Floor 1,DC-East,Rack-A2,admin,22\n' +
        'Access-Dist-SW02,192.168.20.15,switch,Catalyst 2960-X,cisco_ios_xe,Access Switch,24,00:2B:3C:4D:5E:6F,Building B,Floor 2,Office-204,Wall-Cabinet-02,cisco,22\n';
      const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'network_equipment_import_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Check conflicts in parsed devices
  const existingIdSet = new Set(existingDevices.map((d) => String(d.id).toLowerCase()));
  const existingIpSet = new Set(existingDevices.map((d) => String(d.ip).toLowerCase()));

  const conflictCount = parsedDevices.filter(
    (dev) => (dev.id && existingIdSet.has(dev.id.toLowerCase())) || (dev.ip && dev.ip !== '127.0.0.1' && existingIpSet.has(dev.ip.toLowerCase()))
  ).length;

  return createPortal(
    <div
      className={`fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in select-none`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`relative flex flex-col w-full border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized ? 'h-full max-w-none rounded-none' : 'max-w-4xl max-h-[92vh] rounded-2xl'
        } ${
          isLightMode
            ? 'bg-white border-slate-200 text-slate-800 shadow-slate-300/40'
            : 'bg-slate-900 border-white/10 text-slate-100 shadow-black/80'
        }`}
      >
        {/* Modal Header adhering to Rule 5 & 7 */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b select-none shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide">
                  {isEn ? 'Import Network Equipment Inventory' : 'ورود و بارگذاری تجهیزات شبکه (Import)'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {isEn ? 'Single & Batch' : 'تکی و دسته‌ای'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Batch upload switches, routers & firewalls via JSON or CSV with conflict deduplication'
                  : 'بارگذاری گروهی سوئیچ‌ها، روترها و فایروال‌ها با فرمت JSON و CSV به همراه کنترل تداخل'}
              </p>
            </div>
          </div>

          {/* Triple Window Controls: Minimize, Maximize, Close */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleMinimize}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-600'
                  : 'hover:bg-white/10 border-white/10 text-slate-400 hover:text-white'
              }`}
              title={isEn ? 'Minimize to ToolsDock' : 'مینیمایز به نوار داک'}
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-slate-200 border-slate-300 text-slate-600'
                  : 'hover:bg-white/10 border-white/10 text-slate-400 hover:text-white'
              }`}
              title={isEn ? (isMaximized ? 'Restore' : 'Maximize') : isMaximized ? 'کاهش اندازه' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200 border-slate-300 text-slate-600'
                  : 'hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border-white/10 text-slate-400'
              }`}
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RBAC Gate Banner: Unauthorized Access Notice */}
        {!isImportPermitted && (
          <div className="px-5 py-3.5 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-200">
                {isEn ? 'Permission Denied: Network Equipment Import Restricted' : 'عدم دسترسی: بارگذاری تجهیزات شبکه مسدود است'}
              </div>
              <div className="mt-0.5 opacity-90">
                {isEn
                  ? 'Your account policy does not permit importing equipment records into inventory. Please contact your system administrator to grant the "canImportDevices" capability.'
                  : 'پالیسی امنیتی حساب کاربری شما اجازه ورود و بارگذاری تجهیزات شبکه را نمی‌دهد. لطفاً با مدیر سیستم جهت فعال‌سازی مجوز canImportDevices تماس بگیرید.'}
              </div>
            </div>
          </div>
        )}

        {/* Modal Subheader Navigation & Tabs */}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b text-xs ${
            isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-white/10'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200/70'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isEn ? 'Upload File (.json / .csv)' : 'بارگذاری فایل (JSON / CSV)'}</span>
            </button>
            <button
              onClick={() => setActiveTab('paste')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'paste'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200/70'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{isEn ? 'Direct Text / Code Paste' : 'درج مستقیم متن یا کد'}</span>
            </button>
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'single'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200/70'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Quick Single Device' : 'ثبت تکی تجهیز'}</span>
            </button>
          </div>

          {/* Template Download Links */}
          <div className="flex items-center gap-2">
            <span className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Sample Templates:' : 'نمونه الگوها:'}
            </span>
            <button
              type="button"
              onClick={() => handleDownloadSample('json')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-white/10 text-slate-300'
              }`}
            >
              <FileCode className="w-3 h-3 text-cyan-400" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSample('csv')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-white/10 text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Tab 1: File Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition ${
                  isLightMode
                    ? 'border-slate-300 bg-slate-50/50 hover:bg-slate-100/60'
                    : 'border-white/15 bg-slate-950/40 hover:bg-slate-950/70 hover:border-emerald-500/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,text/csv,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 mb-3 border border-emerald-500/20">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-center">
                  {file
                    ? file.name
                    : isEn
                    ? 'Click or drag & drop equipment inventory file (.json or .csv)'
                    : 'کلیک کنید یا فایل اکسپورت را اینجا بکشید (.json یا .csv)'}
                </div>
                <div className={`text-xs mt-1 text-center ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Supports standard NetTopology JSON packages and UTF-8 encoded CSV spreadsheets'
                    : 'پشتیبانی از پکیج‌های استاندارد JSON و جداول اکسل با فرمت CSV'}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Direct Paste */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Paste JSON Array or CSV Text' : 'درج مستقیم محتوای ساختاریافته (JSON یا CSV)'}</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    infoWhatEn="Paste raw JSON array or CSV text containing device records."
                    infoWhatFa="درج مستقیم آرایه JSON یا سطرهای متن جدول CSV تجهیزات."
                    infoWhyEn="Allows quick migration from external spreadsheets or scripts without generating files."
                    infoWhyFa="امکان انتقال سریع بدون نیاز به ایجاد فایل از سایر برنامه‌ها یا اسکریپت‌ها."
                    infoExampleEn='[{"name":"SW-01","ip":"192.168.1.10","type":"switch","model":"C9300","platform":"cisco_ios_xe"}]'
                    infoExampleFa='[{"name":"SW-01","ip":"192.168.1.10","type":"switch","model":"C9300","platform":"cisco_ios_xe"}]'
                  />
                </div>
              </div>
              <textarea
                value={pastedText}
                onChange={(e) => {
                  setPastedText(e.target.value);
                  handleProcessRawText(e.target.value);
                }}
                rows={7}
                placeholder={
                  isEn
                    ? 'Paste raw JSON array: [{"name": "SW-01", "ip": "192.168.1.1", ...}]\nOr CSV: Name,IP,Type,Model,Platform,Role,Total_Ports\nSW-01,192.168.1.1,switch,Catalyst 2960-X,cisco_ios_xe,Access Switch,24'
                    : 'متن آرایه JSON یا سطرهای CSV را اینجا الصاق کنید...'
                }
                className={`w-full p-3 font-mono text-xs rounded-xl border focus:outline-hidden focus:ring-1 focus:ring-emerald-500 transition resize-y ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-950/80 border-white/10 text-slate-200'
                }`}
              />
            </div>
          )}

          {/* Tab 3: Quick Single Device */}
          {activeTab === 'single' && (
            <form onSubmit={handleAddSingleDevice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Device Name / Hostname *' : 'نام تجهیز / Hostname *'}</label>
                  <input
                    type="text"
                    required
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    placeholder="e.g. Core-SW-01"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'IP Address *' : 'آدرس IP *'}</label>
                  <input
                    type="text"
                    required
                    value={singleIp}
                    onChange={(e) => setSingleIp(e.target.value)}
                    placeholder="192.168.10.1"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Device Type' : 'نوع تجهیز'}</label>
                  <select
                    value={singleType}
                    onChange={(e) => setSingleType(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <option value="switch">{isEn ? 'Switch (سوییچ)' : 'سوییچ'}</option>
                    <option value="router">{isEn ? 'Router (روتر)' : 'روتر'}</option>
                    <option value="firewall">{isEn ? 'Firewall (فایروال)' : 'فایروال'}</option>
                    <option value="access_point">{isEn ? 'Access Point (اکسس‌پوینت)' : 'اکسس‌پوینت'}</option>
                    <option value="server">{isEn ? 'Server (سرور)' : 'سرور'}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Hardware Model' : 'مدل سخت‌افزار'}</label>
                  <input
                    type="text"
                    value={singleModel}
                    onChange={(e) => setSingleModel(e.target.value)}
                    placeholder="Catalyst 2960-X"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'OS Platform' : 'پلتفرم سیستم‌عامل'}</label>
                  <select
                    value={singlePlatform}
                    onChange={(e) => setSinglePlatform(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <option value="cisco_ios_xe">Cisco IOS / IOS-XE</option>
                    <option value="cisco_nxos">Cisco NX-OS</option>
                    <option value="mikrotik_routeros">MikroTik RouterOS</option>
                    <option value="juniper_junos">Juniper Junos</option>
                    <option value="huawei_vrp">Huawei VRP</option>
                    <option value="arista_eos">Arista EOS</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Role in Network' : 'نقش در شبکه'}</label>
                  <input
                    type="text"
                    value={singleRole}
                    onChange={(e) => setSingleRole(e.target.value)}
                    placeholder="Core / Access / Distribution"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Total Ports' : 'تعداد پورت‌ها'}</label>
                  <input
                    type="number"
                    min="1"
                    max="128"
                    value={singleTotalPorts}
                    onChange={(e) => setSingleTotalPorts(Number(e.target.value) || 24)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'MAC Address' : 'آدرس MAC'}</label>
                  <input
                    type="text"
                    value={singleMac}
                    onChange={(e) => setSingleMac(e.target.value)}
                    placeholder="00:1A:2B:3C:4D:5E"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">{isEn ? 'Rack / Room Placement' : 'محل رک / استقرار'}</label>
                  <input
                    type="text"
                    value={singleRack}
                    onChange={(e) => setSingleRack(e.target.value)}
                    placeholder="Rack A-01"
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-1 focus:ring-emerald-500 ${
                      isLightMode ? 'bg-slate-50 border-slate-300' : 'bg-slate-950/60 border-white/10'
                    }`}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!singleName.trim() || !singleIp.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Add to Import Batch' : 'افزودن به لیست ورودی'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Conflict Resolution Settings */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border text-xs ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-white/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">{isEn ? 'Conflict Handling Strategy:' : 'استراتژی رفع تداخل تجهیزات:'}</span>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Action to take when an imported device matches an existing record by IP or ID."
                infoWhatFa="نحوه رفتار سیستم هنگام هم‌پوشانی یا تکراری بودن شناسه یا آدرس IP تجهیز ورودی."
                infoWhyEn="Prevents accidental overwrites of existing live network equipment configurations."
                infoWhyFa="جلوگیری از تغییر یا بازنویسی ناخواسته مشخصات و تنظیمات سوییچ‌های در حال کار."
                infoExampleEn="Skip duplicates: keeps existing data intact. Overwrite: replaces specs."
                infoExampleFa="نادیده‌گرفتن: داده‌های موجود حفظ می‌شوند. بازنویسی: مشخصات به‌روزرسانی می‌شوند."
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer transition ${
                  conflictMode === 'skip'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium'
                    : isLightMode
                    ? 'border-slate-300 text-slate-600'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="conflictMode"
                  value="skip"
                  checked={conflictMode === 'skip'}
                  onChange={() => setConflictMode('skip')}
                  className="hidden"
                />
                <Check className={`w-3 h-3 ${conflictMode === 'skip' ? 'text-emerald-400' : 'opacity-0'}`} />
                <span>{isEn ? 'Skip Duplicate Records' : 'نادیده‌گرفتن رکوردهای تکراری'}</span>
              </label>

              <label
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer transition ${
                  conflictMode === 'overwrite'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-medium'
                    : isLightMode
                    ? 'border-slate-300 text-slate-600'
                    : 'border-white/10 text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="conflictMode"
                  value="overwrite"
                  checked={conflictMode === 'overwrite'}
                  onChange={() => setConflictMode('overwrite')}
                  className="hidden"
                />
                <Check className={`w-3 h-3 ${conflictMode === 'overwrite' ? 'text-amber-400' : 'opacity-0'}`} />
                <span>{isEn ? 'Overwrite / Update Existing' : 'بازنویسی و به‌روزرسانی موجود'}</span>
              </label>
            </div>
          </div>

          {/* Parse Error Display */}
          {parseError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Candidate Preview Section */}
          {parsedDevices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {isEn
                      ? `Candidate Devices Ready for Import (${parsedDevices.length} items)`
                      : `تجهیزات آماده بارگذاری و ورود (${parsedDevices.length} مورد)`}
                  </span>
                </div>
                {conflictCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px]">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {isEn
                        ? `${conflictCount} existing matches detected (${conflictMode === 'skip' ? 'will skip' : 'will update'})`
                        : `${conflictCount} مورد تکراری (${conflictMode === 'skip' ? 'نادیده گرفته می‌شود' : 'به‌روزرسانی می‌شود'})`}
                    </span>
                  </div>
                )}
              </div>

              <div
                className={`max-h-56 overflow-y-auto border rounded-xl divide-y text-xs ${
                  isLightMode
                    ? 'bg-white border-slate-200 divide-slate-100'
                    : 'bg-slate-950/60 border-white/10 divide-white/5'
                }`}
              >
                {parsedDevices.map((dev, idx) => {
                  const isExisting =
                    (dev.id && existingIdSet.has(dev.id.toLowerCase())) ||
                    (dev.ip && dev.ip !== '127.0.0.1' && existingIpSet.has(dev.ip.toLowerCase()));

                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 hover:bg-white/5 transition">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                          <Network className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 font-medium">
                            <span>{dev.name}</span>
                            <span className="font-mono text-[11px] text-cyan-400">({dev.ip})</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-slate-400 uppercase">
                              {dev.type}
                            </span>
                          </div>
                          <div className="text-[11px] opacity-70 mt-0.5 flex items-center gap-2">
                            <span>{dev.model || 'Model N/A'}</span>
                            <span>•</span>
                            <span>{dev.platform}</span>
                            <span>•</span>
                            <span>{dev.total_ports || 24} {isEn ? 'Ports' : 'پورت'}</span>
                            {dev.rack && (
                              <>
                                <span>•</span>
                                <span>{dev.rack}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExisting ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              conflictMode === 'skip'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                            }`}
                          >
                            {conflictMode === 'skip'
                              ? isEn
                                ? 'Existing (Skip)'
                                : 'موجود (رد شدن)'
                              : isEn
                              ? 'Existing (Update)'
                              : 'موجود (به‌روزرسانی)'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            {isEn ? 'New Device' : 'تجهیز جدید'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setParsedDevices((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-red-400 transition"
                          title={isEn ? 'Remove from batch' : 'حذف از لیست'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Execution Status / Results */}
          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{isEn ? 'Import Successfully Completed' : 'عملیات ورود با موفقیت پایان یافت'}</span>
              </div>
              <p>{importResult.message}</p>
              <div className="flex items-center gap-4 text-[11px] pt-1 opacity-90">
                <span>{isEn ? 'Added:' : 'افزوده شد:'} {importResult.importedCount}</span>
                <span>{isEn ? 'Updated:' : 'به‌روز شد:'} {importResult.updatedCount}</span>
                <span>{isEn ? 'Skipped:' : 'نادیده گرفته شد:'} {importResult.skippedCount}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3 border-t select-none shrink-0 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
              {isEn ? 'Total in batch:' : 'مجموع در صف:'}
            </span>
            <span className="font-bold font-mono text-emerald-400">{parsedDevices.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 hover:bg-slate-200 text-slate-700'
                  : 'border-white/10 hover:bg-white/5 text-slate-300'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={!isImportPermitted || parsedDevices.length === 0 || isImporting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isEn ? 'Importing Devices...' : 'در حال ثبت تجهیزات...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isEn
                      ? `Import ${parsedDevices.length} Devices`
                      : `ورود ${parsedDevices.length} تجهیز به انبار`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
