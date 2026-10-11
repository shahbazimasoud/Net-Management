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
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';
import { getAuthHeaders } from '../../services/settingsStorage';

export interface ServerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  existingServers: RemoteServer[];
  effectivePolicy?: any;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const ServerImportModal: React.FC<ServerImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingServers = [],
  effectivePolicy,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  // Modal Window State
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');

  // Input states
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileType, setFileType] = useState<'json' | 'csv' | null>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip');

  // Parsed candidate preview
  const [parsedServers, setParsedServers] = useState<any[]>([]);
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

  // Check RBAC Authorization for Server Import
  const isImportPermitted =
    !effectivePolicy ||
    (effectivePolicy.canImportServers !== false &&
      (effectivePolicy.canImportServers === true ||
        effectivePolicy.canManageDevices === true ||
        effectivePolicy.defaultServerPermissions?.import_servers === true ||
        effectivePolicy.id === 'policy-super-admin'));

  if (!isOpen) return null;

  // Minimize handler adhering to Rule 5 & 7
  const handleMinimize = () => {
    dockModal({
      id: 'modal-server-import',
      labelEn: `Import Servers (${parsedServers.length || 'Ready'})`,
      labelFa: `ورود سرورها (${parsedServers.length || 'آماده'})`,
      badge: 'IMPORT',
      category: 'device',
      onRestore: () => {
        undockModal('modal-server-import');
      },
      onClose: () => {
        undockModal('modal-server-import');
        onClose();
      },
    });
    onClose();
  };

  // Helper to parse CSV string into objects
  const parseCsvToServers = (csvText: string): any[] => {
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

      const name = obj.name || obj.servername || obj.hostname || obj.id || `Imported Server ${i}`;
      const ip = obj.ip || obj.ipaddress || obj.host || obj.sshhost || '';
      if (!ip) continue;

      const osRaw = (obj.ostype || obj.os || '').toLowerCase();
      const osType = osRaw.includes('win') ? 'windows' : 'linux';
      const tagsRaw = obj.automationtags || obj.tags || '';
      const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((t: string) => t.trim()).filter(Boolean) : [];
      const webSvcs = (obj.webservers || '').toLowerCase();
      const dbSvcs = (obj.databases || '').toLowerCase();

      rows.push({
        id: obj.id || undefined,
        name,
        hostname: obj.hostname || '',
        ip,
        os_type: osType,
        os_distro: obj.osdistro || obj.distro || (osType === 'windows' ? 'Windows Server 2022' : 'Ubuntu 24.04 LTS'),
        environment: obj.environment || 'Production',
        category: obj.category || 'Application Server',
        role: obj.role || 'General Server',
        tags,
        ssh_port: Number(obj.sshport || obj.port) || 22,
        ssh_username: obj.sshuser || obj.username || (osType === 'windows' ? 'Administrator' : 'root'),
        cpu_cores: obj.vcpus || obj.vcpuscores || obj.cpucores ? Number(obj.vcpus || obj.vcpuscores || obj.cpucores) : undefined,
        ram_gb: obj.ram || obj.ramgb ? Number(obj.ram || obj.ramgb) : undefined,
        disk_gb: obj.disk || obj.diskgb ? Number(obj.disk || obj.diskgb) : undefined,
        has_nginx: webSvcs.includes('nginx'),
        has_apache: webSvcs.includes('apache'),
        has_postgresql: dbSvcs.includes('postgres'),
        has_mysql: dbSvcs.includes('mysql'),
      });
    }

    return rows;
  };

  const handleProcessRawText = (text: string, typeHint?: 'json' | 'csv') => {
    setParseError(null);
    setError(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setParsedServers([]);
      return;
    }

    // Try parsing as JSON first
    if (typeHint === 'json' || trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const list = Array.isArray(parsed) ? parsed : parsed.servers && Array.isArray(parsed.servers) ? parsed.servers : [parsed];
        const valid = list.filter((item: any) => item && (item.ip || item.hostname || item.name));
        if (valid.length === 0) {
          throw new Error(isEn ? 'No server objects with IP or Name found in JSON.' : 'هیچ شیء سروری با مشخصات IP یا نام در JSON یافت نشد.');
        }
        setParsedServers(valid);
        setFileType('json');
        return;
      } catch (err: any) {
        if (typeHint === 'json') {
          setParseError(isEn ? `Invalid JSON syntax: ${err.message}` : `خطا در ساختار JSON: ${err.message}`);
          setParsedServers([]);
          return;
        }
      }
    }

    // Parse as CSV
    try {
      const csvRows = parseCsvToServers(trimmed);
      if (csvRows.length > 0) {
        setParsedServers(csvRows);
        setFileType('csv');
      } else {
        setParseError(isEn ? 'Could not parse valid server rows from CSV.' : 'امکان شناسایی ردیف‌های معتبر سرور از فایل CSV وجود نداشت.');
        setParsedServers([]);
      }
    } catch (err: any) {
      setParseError(isEn ? `CSV parsing error: ${err.message}` : `خطا در پردازش فایل CSV: ${err.message}`);
      setParsedServers([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    const ext = selected.name.split('.').pop()?.toLowerCase();
    const typeHint = ext === 'json' ? 'json' : ext === 'csv' ? 'csv' : undefined;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setFileContent(content);
      handleProcessRawText(content, typeHint);
    };
    reader.onerror = () => {
      setParseError(isEn ? 'Failed to read uploaded file.' : 'خطا در خواندن محتوای فایل انتخاب‌شده.');
    };
    reader.readAsText(selected);
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

  const handleExecuteImport = async () => {
    if (!isImportPermitted || parsedServers.length === 0) return;
    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/remote-servers/import', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          servers: parsedServers,
          conflictMode,
        }),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(
          (isEn ? resJson.error : resJson.errorFa) ||
            (isEn ? 'Failed to import server records.' : 'خطا در ثبت و ورود سرورها.')
        );
      }

      setImportResult({
        importedCount: resJson.importedCount ?? parsedServers.length,
        updatedCount: resJson.updatedCount ?? 0,
        skippedCount: resJson.skippedCount ?? 0,
        message: isEn ? resJson.message : resJson.messageFa,
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
          name: 'Web Gateway 01',
          hostname: 'web01.corp.internal',
          ip: '192.168.10.15',
          os_type: 'linux',
          os_distro: 'Ubuntu 24.04 LTS',
          environment: 'Production',
          category: 'Application Server',
          role: 'Reverse Proxy & Web Gateway',
          tags: ['web', 'dmz', 'proxy'],
          ssh_port: 22,
          ssh_username: 'root',
          cpu_cores: 4,
          ram_gb: 16,
          disk_gb: 120,
          has_nginx: true,
          has_apache: false,
          has_postgresql: false,
          has_mysql: false,
          notes: 'Edge SSL termination proxy',
        },
        {
          name: 'Database Primary',
          hostname: 'db01.corp.internal',
          ip: '192.168.10.20',
          os_type: 'linux',
          os_distro: 'Debian 12 Bookworm',
          environment: 'Production',
          category: 'Database Server',
          role: 'Core PostgreSQL Cluster',
          tags: ['database', 'primary'],
          ssh_port: 22,
          ssh_username: 'postgres',
          cpu_cores: 8,
          ram_gb: 32,
          disk_gb: 500,
          has_postgresql: true,
          notes: 'High-availability PostgreSQL cluster',
        },
        {
          name: 'Windows Active Directory',
          hostname: 'dc01.corp.internal',
          ip: '192.168.10.10',
          os_type: 'windows',
          os_distro: 'Windows Server 2022',
          environment: 'Production',
          category: 'Domain Controller',
          role: 'Primary Active Directory Domain Services',
          tags: ['ad', 'domain-controller', 'dns'],
          win_protocol: 'rdp',
          win_port: 3389,
          win_username: 'Administrator',
          cpu_cores: 4,
          ram_gb: 16,
          disk_gb: 200,
          notes: 'Primary forest domain controller',
        },
      ];
      const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample_remote_servers_template.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      const csv =
        '\uFEFFName,Hostname,IP Address,OS Type,OS Distro,Environment,Category,Role,SSH Port,SSH User,vCPU Cores,RAM (GB),Disk (GB),Web Servers,Databases,Automation Tags\r\n' +
        '"Web Gateway 01","web01.corp.internal","192.168.10.15","linux","Ubuntu 24.04 LTS","Production","Application Server","Web Gateway",22,"root",4,16,120,"Nginx","","web; dmz"\r\n' +
        '"Database Primary","db01.corp.internal","192.168.10.20","linux","Debian 12 Bookworm","Production","Database Server","PostgreSQL Primary",22,"postgres",8,32,500,"","PostgreSQL","database; prod"\r\n' +
        '"Windows Domain Controller","dc01.corp.internal","192.168.10.10","windows","Windows Server 2022","Production","Domain Controller","Active Directory",3389,"Administrator",4,16,200,"","","ad; dc"';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample_remote_servers_template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  // Inspect duplicates against existing inventory
  const existingSetByIp = new Set(existingServers.map((s) => (s.ip || '').toLowerCase().trim()));
  const existingSetByName = new Set(existingServers.map((s) => (s.name || '').toLowerCase().trim()));

  const duplicateCount = parsedServers.filter(
    (s) =>
      existingSetByIp.has((s.ip || '').toLowerCase().trim()) ||
      existingSetByName.has((s.name || '').toLowerCase().trim())
  ).length;

  const newCount = parsedServers.length - duplicateCount;

  const modalContent = (
    <div
      className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-3 sm:p-5 pointer-events-auto"
      style={{ isolation: 'isolate' }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity ${
          isLightMode ? 'bg-slate-900/35 backdrop-blur-xs' : 'bg-black/70 backdrop-blur-sm'
        }`}
        onClick={onClose}
      />

      {/* Modal Dialog Window */}
      <div
        className={`relative flex flex-col w-full shadow-2xl transition-all duration-200 border rounded-2xl overflow-hidden font-sans ${
          isMaximized
            ? 'h-full max-h-full rounded-none'
            : 'max-w-3xl max-h-[92vh] sm:rounded-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800 shadow-slate-900/20'
            : 'bg-slate-950 border-cyan-500/30 text-slate-100 shadow-cyan-950/40'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with 3 Control Buttons (Close, Minimize, Maximize) adhering to Rule 7 */}
        <div
          className={`px-4 sm:px-6 py-3.5 border-b flex items-center justify-between shrink-0 select-none ${
            isLightMode
              ? 'bg-white border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 border ${
                isLightMode
                  ? 'bg-teal-100/80 border-teal-300 text-teal-700'
                  : 'bg-teal-500/15 border-teal-500/30 text-teal-400'
              }`}
            >
              <Upload className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm sm:text-base font-bold truncate ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn
                    ? 'Import Remote Servers & Fleet Inventory'
                    : 'ورود و بارگذاری سرورهای ریموت به ناوگان'}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  RBAC
                </span>
              </div>
              <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Batch & Single Server Ingestion via JSON or CSV File Upload'
                  : 'ورود تکی یا گروهی سرورها از طریق فایل‌های ساختاریافته JSON یا CSV'}
              </p>
            </div>
          </div>

          {/* 3 Header Control Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 rtl:flex-row-reverse">
            {/* Minimize Button */}
            <button
              type="button"
              onClick={handleMinimize}
              title={isEn ? 'Minimize to Tools Dock' : 'کمینه‌سازی در داک ابزارها'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore Button */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                  : 'border-white/10 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Strict RBAC Denial Warning Banner */}
          {!isImportPermitted && (
            <div
              className={`p-4 rounded-xl border flex items-center gap-3.5 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              <ShieldAlert className="w-6 h-6 shrink-0 text-rose-500" />
              <div className="text-xs space-y-1">
                <div className="font-bold text-sm">
                  {isEn
                    ? 'Import Prohibited by Granular Multi-Vendor RBAC'
                    : 'ورود سرورها توسط کنترل دسترسی (RBAC) مسدود است'}
                </div>
                <div className="opacity-90 leading-relaxed">
                  {isEn
                    ? 'Your account policy does not permit importing server records into the fleet. Please contact your system administrator to grant the "canImportServers" capability.'
                    : 'پالیسی حساب کاربری شما اجازه ورود یا ثبت دسته‌ای سرورها را نمی‌دهد. جهت دریافت دسترسی، با مدیر سیستم در بخش کنترل دسترسی (RBAC) هماهنگ فرمایید.'}
                </div>
              </div>
            </div>
          )}

          {/* Navigation Tabs (Upload File vs Paste Text) */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'upload'
                    ? isLightMode
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : isLightMode
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isEn ? 'File Upload (JSON / CSV)' : 'بارگذاری فایل (JSON / CSV)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  activeTab === 'paste'
                    ? isLightMode
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : isLightMode
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isEn ? 'Paste JSON / CSV' : 'درج مستقیم متن (Paste)'}</span>
              </button>
            </div>

            {/* Sample Templates Quick Download */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn ? 'Sample Templates:' : 'نمونه قالب‌ها:'}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadSample('json')}
                className={`px-2 py-0.5 rounded border transition cursor-pointer flex items-center gap-1 ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
                title={isEn ? 'Download sample JSON template' : 'دانلود قالب نمونه JSON'}
              >
                <FileCode className="w-3 h-3 text-amber-400" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSample('csv')}
                className={`px-2 py-0.5 rounded border transition cursor-pointer flex items-center gap-1 ${
                  isLightMode
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
                title={isEn ? 'Download sample CSV template' : 'دانلود قالب نمونه CSV'}
              >
                <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Tab 1: File Upload Drag & Drop Area */}
          {activeTab === 'upload' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 sm:p-8 rounded-2xl border-2 border-dashed text-center transition cursor-pointer flex flex-col items-center justify-center space-y-2.5 ${
                file
                  ? isLightMode
                    ? 'bg-teal-50/70 border-teal-500 text-teal-900'
                    : 'bg-teal-950/20 border-teal-500/60 text-teal-200'
                  : isLightMode
                  ? 'bg-white border-slate-300 hover:border-teal-500 hover:bg-slate-50 text-slate-600'
                  : 'bg-slate-900/50 border-white/10 hover:border-teal-500/50 hover:bg-white/5 text-slate-300'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div
                className={`p-3 rounded-2xl border ${
                  file
                    ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                    : 'bg-slate-800/60 text-slate-400 border-white/10'
                }`}
              >
                <Upload className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="font-bold text-xs sm:text-sm">
                  {file
                    ? file.name
                    : isEn
                    ? 'Click to select or drag & drop .json / .csv file here'
                    : 'برای انتخاب کلیک کنید یا فایل JSON / CSV را اینجا بکشید'}
                </div>
                <div className="text-[11px] opacity-75 font-mono">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB • Detected: ${fileType?.toUpperCase() || 'DATA'}`
                    : isEn
                    ? 'Supports UTF-8 JSON array or comma-separated CSV'
                    : 'پشتیبانی از آرایه JSON و جداول استاندارد CSV با کدگذاری UTF-8'}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Direct Paste Text Area */}
          {activeTab === 'paste' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs font-bold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Paste JSON or CSV Content' : 'متن ساختاریافته سرورها را وارد نمایید:'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPastedText('');
                    setParsedServers([]);
                    setParseError(null);
                  }}
                  className={`text-[11px] transition cursor-pointer ${
                    isLightMode ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {isEn ? 'Clear' : 'پاک کردن'}
                </button>
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
                    ? '[\n  {\n    "name": "Ubuntu Web 01",\n    "ip": "192.168.10.15",\n    "os_type": "linux",\n    "role": "Web Gateway"\n  }\n]'
                    : '[\n  {\n    "name": "سرور وب اوبونتو",\n    "ip": "192.168.10.15",\n    "os_type": "linux"\n  }\n]'
                }
                className={`w-full p-3 rounded-xl border text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-white/10 text-slate-200'
                }`}
              />
            </div>
          )}

          {/* Parse Error Notification */}
          {parseError && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Conflict Resolution Mode Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className={`text-xs font-bold uppercase tracking-wider ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {isEn ? 'Duplicate Handling Strategy' : 'استراتژی مدیریت تکراری‌ها (Conflict Mode)'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Duplicate Handling' : 'مدیریت تکراری‌ها'}
                whatIsIt={
                  isEn
                    ? 'Defines what the system should do when an imported server matches an existing server IP or hostname in your fleet inventory.'
                    : 'تعیین می‌کند در صورتی که سرور ورودی دارای IP یا نام یکسان با سرورهای موجود باشد، چه رفتاری صورت گیرد.'
                }
                whyNeeded={
                  isEn
                    ? 'Prevents accidental overwrites or duplicate entries for compute nodes.'
                    : 'جلوگیری از بازنویسی ناخواسته یا ایجاد رکوردهای تکراری در سیستم.'
                }
                example="Skip duplicates / Overwrite existing"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  conflictMode === 'skip'
                    ? isLightMode
                      ? 'bg-teal-50 border-teal-500 text-teal-900 font-bold'
                      : 'bg-teal-500/20 border-teal-500 text-teal-200 font-bold'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="conflictMode"
                    value="skip"
                    checked={conflictMode === 'skip'}
                    onChange={() => setConflictMode('skip')}
                    className="accent-teal-500"
                  />
                  <div>
                    <div>{isEn ? 'Skip Existing Duplicates' : 'نادیده گرفتن تکراری‌ها (Skip)'}</div>
                    <div className="text-[10px] font-normal opacity-75">
                      {isEn ? 'Preserves existing server configurations' : 'حفظ کانفیگ سرورهای فعلی بدون تغییر'}
                    </div>
                  </div>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  conflictMode === 'overwrite'
                    ? isLightMode
                      ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold'
                      : 'bg-amber-500/20 border-amber-500 text-amber-200 font-bold'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="conflictMode"
                    value="overwrite"
                    checked={conflictMode === 'overwrite'}
                    onChange={() => setConflictMode('overwrite')}
                    className="accent-amber-500"
                  />
                  <div>
                    <div>{isEn ? 'Overwrite / Update Existing' : 'به‌روزرسانی و بازنویسی (Overwrite)'}</div>
                    <div className="text-[10px] font-normal opacity-75">
                      {isEn ? 'Updates matching servers with new values' : 'اعمال مشخصات و متغیرهای جدید روی سرور موجود'}
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Parsed Preview Table */}
          {parsedServers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                    {isEn ? 'Detected Servers Preview' : 'پیش‌نمایش سرورهای شناسایی‌شده'}
                  </span>
                  <span className="font-mono px-2 py-0.5 rounded-full font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px]">
                    {parsedServers.length} {isEn ? 'Records' : 'مورد'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-emerald-400 font-bold">
                    +{newCount} {isEn ? 'New' : 'جدید'}
                  </span>
                  {duplicateCount > 0 && (
                    <span className="text-amber-400 font-bold">
                      • {duplicateCount} {isEn ? 'Conflicts' : 'تکراری'}
                    </span>
                  )}
                </div>
              </div>

              <div
                className={`max-h-48 overflow-y-auto rounded-xl border text-xs font-mono divide-y ${
                  isLightMode
                    ? 'bg-white border-slate-200 divide-slate-100'
                    : 'bg-slate-900/80 border-white/10 divide-white/5'
                }`}
              >
                {parsedServers.map((srv, idx) => {
                  const isDup =
                    existingSetByIp.has((srv.ip || '').toLowerCase().trim()) ||
                    existingSetByName.has((srv.name || '').toLowerCase().trim());

                  return (
                    <div
                      key={idx}
                      className="p-2.5 flex items-center justify-between gap-3 hover:bg-white/5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-[10px] opacity-50 shrink-0 font-bold">#{idx + 1}</span>
                        <div className="min-w-0">
                          <div className="font-bold truncate text-[11px]">
                            {srv.name || srv.hostname || 'Unnamed'}
                          </div>
                          <div className="text-[10px] opacity-75 truncate">
                            {srv.ip} {srv.hostname ? `• ${srv.hostname}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-[10px]">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                            srv.os_type === 'windows'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {srv.os_type || 'linux'}
                        </span>

                        {isDup ? (
                          <span className="px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {conflictMode === 'skip' ? (isEn ? 'SKIP' : 'رد') : (isEn ? 'UPDATE' : 'بروزرسانی')}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {isEn ? 'NEW' : 'جدید'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Execution Error */}
          {error && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Summary Toast */}
          {importResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                isLightMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
              <div className="space-y-0.5">
                <div className="font-bold">
                  {isEn ? 'Server Fleet Ingestion Successful' : 'ورود سرورها با موفقیت انجام شد'}
                </div>
                <div className="text-[11px] opacity-90">
                  {importResult.message ||
                    (isEn
                      ? `Imported ${importResult.importedCount} new, updated ${importResult.updatedCount}, skipped ${importResult.skippedCount}.`
                      : `${importResult.importedCount} سرور جدید افزوده شد، ${importResult.updatedCount} به‌روزرسانی شد و ${importResult.skippedCount} مورد نادیده گرفته شد.`)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`px-4 sm:px-6 py-3.5 border-t flex items-center justify-between shrink-0 select-none ${
            isLightMode
              ? 'bg-slate-100 border-slate-200'
              : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-teal-400 font-bold">
              {parsedServers.length}
            </span>
            <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
              {isEn ? 'server(s) ready to import' : 'سرور آماده ورود'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 rtl:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="button"
              disabled={!isImportPermitted || parsedServers.length === 0 || isImporting}
              onClick={handleExecuteImport}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer ${
                isImportPermitted && parsedServers.length > 0 && !isImporting
                  ? 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-teal-500/25 active:scale-95'
                  : 'bg-slate-700/50 text-slate-400 border border-white/5 cursor-not-allowed'
              }`}
            >
              <Upload className={`w-4 h-4 ${isImporting ? 'animate-bounce' : ''}`} />
              <span>
                {isImporting
                  ? isEn
                    ? 'Importing Servers...'
                    : 'در حال ورود سرورها...'
                  : isEn
                  ? `Execute Import (${parsedServers.length})`
                  : `ورود سرورها به سیستم (${parsedServers.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
