import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
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
  Cpu,
  Lock,
  Globe,
  Database,
  Tags,
  Clock,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { isServerActionAllowed } from '../../utils/rbac';
import { useModalDock } from '../../context/ModalDockContext';
import { getAuthHeaders } from '../../services/settingsStorage';

export interface ServerExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: RemoteServer[];
  selectedServerIds?: Set<string>;
  effectivePolicy?: any;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const ServerExportModal: React.FC<ServerExportModalProps> = ({
  isOpen,
  onClose,
  servers,
  selectedServerIds = new Set<string>(),
  effectivePolicy,
  isLightMode = false,
  isEn = true,
}) => {
  const { dockModal, undockModal } = useModalDock();

  // Modal Window State
  const [isMaximized, setIsMaximized] = useState(false);

  // Export Scope Selection: 'selected' | 'all'
  const hasSelected = selectedServerIds.size > 0;
  const [scope, setScope] = useState<'selected' | 'all'>(hasSelected ? 'selected' : 'all');
  const [format, setFormat] = useState<'json' | 'csv'>('json');

  // Export Options
  const [includeHardware, setIncludeHardware] = useState(true);
  const [includeServices, setIncludeServices] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [includeUptime, setIncludeUptime] = useState(true);

  // Execution states
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  if (!isOpen) return null;

  // Determine targeted servers
  const targetServerList =
    scope === 'selected' && hasSelected
      ? servers.filter((s) => selectedServerIds.has(s.id))
      : servers;

  // Granular RBAC Check for each target server
  const authorizedServers = targetServerList.filter((s) =>
    isServerActionAllowed(s, 'export_servers', effectivePolicy)
  );
  const forbiddenServers = targetServerList.filter(
    (s) => !isServerActionAllowed(s, 'export_servers', effectivePolicy)
  );

  const serversToExport = authorizedServers;
  const canExportAtLeastOne = serversToExport.length > 0;

  // Minimize handler adhering to Rule 5 & 7
  const handleMinimize = () => {
    dockModal({
      id: 'modal-server-export',
      labelEn: `Export Servers (${serversToExport.length})`,
      labelFa: `خروجی سرورها (${serversToExport.length})`,
      badge: format.toUpperCase(),
      category: 'device',
      onRestore: () => {
        undockModal('modal-server-export');
      },
      onClose: () => {
        undockModal('modal-server-export');
        onClose();
      },
    });
    onClose();
  };

  const handleExecuteExport = async () => {
    if (!canExportAtLeastOne) return;
    setIsExporting(true);
    setError(null);
    setSuccessCount(null);

    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/remote-servers/export', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverIds: serversToExport.map((s) => s.id),
          format,
          includeHardware,
          includeServices,
          includeTags,
          includeUptime,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(
          (isEn ? errJson.error : errJson.errorFa) ||
            (isEn ? 'Failed to export remote servers inventory.' : 'خطا در دریافت فایل خروجی سرورها.')
        );
      }

      const timestamp = Date.now();
      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remote_servers_export_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remote_servers_export_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }

      setSuccessCount(serversToExport.length);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err.message || (isEn ? 'Export failed' : 'عملیات با خطا مواجه شد'));
    } finally {
      setIsExporting(false);
    }
  };

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
            : 'max-w-2xl max-h-[92vh] sm:rounded-2xl'
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
                  ? 'bg-cyan-100/80 border-cyan-300 text-cyan-700'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}
            >
              <Download className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className={`text-sm sm:text-base font-bold truncate ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn
                    ? 'Export Remote Servers Fleet & Inventory'
                    : 'استخراج و خروجی اطلاعات سرورهای ریموت'}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  RBAC
                </span>
              </div>
              <p className={`text-xs truncate ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Granular Multi-Vendor Compute Fleet Inventory Data Extraction'
                  : 'استخراج داده‌های شناسنامه و مشخصات سرورها بر اساس ماتریس دسترسی'}
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
          {/* RBAC Status Banner */}
          {forbiddenServers.length > 0 && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-bold">
                  {isEn
                    ? `RBAC Scope Notice: ${forbiddenServers.length} server(s) restricted`
                    : `هشدار دسترسی RBAC: ${forbiddenServers.length} سرور غیرمجاز`}
                </div>
                <div className="opacity-90 leading-relaxed">
                  {isEn
                    ? `Your assigned RBAC policy does not grant export authorization for ${forbiddenServers.length} server(s). They will be automatically excluded from the export file.`
                    : `طبق پالیسی کنترل دسترسی شما، مجوز استخراج برای ${forbiddenServers.length} سرور فعال نیست و این سرورها به صورت خودکار از خروجی حذف خواهند شد.`}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {forbiddenServers.slice(0, 5).map((srv) => (
                    <span
                      key={srv.id}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold"
                    >
                      {srv.name || srv.hostname || srv.ip}
                    </span>
                  ))}
                  {forbiddenServers.length > 5 && (
                    <span className="px-1.5 py-0.5 text-[10px] opacity-75 font-mono">
                      +{forbiddenServers.length - 5} {isEn ? 'more' : 'دیگر'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Zero Authorized Servers Lockout */}
          {!canExportAtLeastOne && (
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
                    ? 'Export Forbidden by Granular Multi-Vendor RBAC'
                    : 'مجوز استخراج توسط کنترل دسترسی (RBAC) مسدود است'}
                </div>
                <div className="opacity-90 leading-relaxed">
                  {isEn
                    ? 'Your current role or policy lacks the "export_servers" permission for the selected scope. Please contact your system administrator to update your policy in Access Control (RBAC).'
                    : 'نقش یا پالیسی جاری شما فاقد مجوز "export_servers" برای سرورهای انتخابی است. جهت فعال‌سازی دسترسی، با مدیر سیستم در بخش کنترل دسترسی (RBAC) هماهنگ فرمایید.'}
                </div>
              </div>
            </div>
          )}

          {/* Scope Selector: Selected vs All */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className={`text-xs font-bold uppercase tracking-wider ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {isEn ? 'Export Scope' : 'محدوده استخراج سرورها'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Export Scope' : 'محدوده استخراج'}
                whatIsIt={
                  isEn
                    ? 'Determines whether to export only the servers currently selected via checkboxes, or the entire accessible fleet.'
                    : 'مشخص می‌کند که فقط سرورهای تیک‌خورده استخراج شوند یا کل ناوگان سرورهای در دسترس شما.'
                }
                whyNeeded={
                  isEn
                    ? 'Allows granular single-server or batch exports without needing to filter outside the inventory view.'
                    : 'امکان استخراج تکی یا گروهی سریع را بدون نیاز به اعمال فیلترهای جانبی فراهم می‌کند.'
                }
                example={
                  isEn
                    ? 'Select 3 Linux web servers to export only their configuration.'
                    : 'انتخاب ۳ سرور لینوکس برای دریافت خروجی اختصاصی آنها.'
                }
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!hasSelected}
                onClick={() => setScope('selected')}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                  scope === 'selected' && hasSelected
                    ? isLightMode
                      ? 'bg-cyan-100/90 border-cyan-500 text-cyan-900 font-bold shadow-xs'
                      : 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-xs shadow-cyan-500/20'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                } ${!hasSelected ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>{isEn ? 'Selected Servers' : 'سرورهای انتخاب‌شده'}</span>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30">
                  {selectedServerIds.size}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScope('all')}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                  scope === 'all'
                    ? isLightMode
                      ? 'bg-cyan-100/90 border-cyan-500 text-cyan-900 font-bold shadow-xs'
                      : 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-xs shadow-cyan-500/20'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span>{isEn ? 'All Fleet Servers' : 'تمامی سرورهای ناوگان'}</span>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30">
                  {servers.length}
                </span>
              </button>
            </div>
          </div>

          {/* Format Selector: JSON vs CSV */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className={`text-xs font-bold uppercase tracking-wider ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {isEn ? 'File Format' : 'فرمت فایل خروجی'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Export File Format' : 'فرمت فایل'}
                whatIsIt={
                  isEn
                    ? 'JSON preserves full nested structures, web servers, databases, tags, and hardware metrics. CSV is optimized for spreadsheet analysis in Excel or Google Sheets.'
                    : 'فرمت JSON تمام ساختارهای تودرتو، وب‌سرورها، دیتابیس‌ها و تگ‌ها را حفظ می‌کند. فرمت CSV برای باز شدن در اکسل بهینه‌سازی شده است.'
                }
                whyNeeded={
                  isEn
                    ? 'Enables seamless import into external automation systems (JSON) or spreadsheet auditing reports (CSV).'
                    : 'امکان اتصال به سیستم‌های اتوماسیون (با JSON) یا ارائه گزارش‌های ممیزی در اکسل (با CSV).'
                }
                example="JSON / CSV"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                  format === 'json'
                    ? isLightMode
                      ? 'bg-cyan-100/90 border-cyan-500 text-cyan-900 font-bold shadow-xs'
                      : 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-xs shadow-cyan-500/20'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-amber-400" />
                  <div className={isEn ? 'text-left' : 'text-right'}>
                    <div className="font-bold">JSON Data</div>
                    <div className="text-[10px] opacity-75 font-mono">.json (Structured)</div>
                  </div>
                </div>
                {format === 'json' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
              </button>

              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                  format === 'csv'
                    ? isLightMode
                      ? 'bg-cyan-100/90 border-cyan-500 text-cyan-900 font-bold shadow-xs'
                      : 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-xs shadow-cyan-500/20'
                    : isLightMode
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <div className={isEn ? 'text-left' : 'text-right'}>
                    <div className="font-bold">CSV Spreadsheet</div>
                    <div className="text-[10px] opacity-75 font-mono">.csv (Excel Table)</div>
                  </div>
                </div>
                {format === 'csv' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
              </button>
            </div>
          </div>

          {/* Granular Field Options */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className={`text-xs font-bold uppercase tracking-wider ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {isEn ? 'Data Fields & Telemetry' : 'فیلدها و اطلاعات همراه'}
              </label>
              <FieldInfoTooltip
                title={isEn ? 'Export Data Inclusions' : 'فیلدهای استخراج'}
                whatIsIt={
                  isEn
                    ? 'Choose which technical categories to include in the exported data payload.'
                    : 'انتخاب دسته‌های فنی مشخصات سرور که باید در خروجی گنجانده شوند.'
                }
                whyNeeded={
                  isEn
                    ? 'Lets you minimize output size or isolate specific domains (such as hardware specs or web servers).'
                    : 'امکان سبک‌سازی خروجی یا تفکیک اطلاعات سخت‌افزاری و وب‌سرورها بر اساس نیاز ممیزی.'
                }
                example="vCPU, RAM, Nginx, PostgreSQL, Tags"
                isLightMode={isLightMode}
                isEn={isEn}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Include Hardware Specs */}
              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  includeHardware
                    ? isLightMode
                      ? 'bg-white border-cyan-500/60 shadow-xs'
                      : 'bg-slate-900/90 border-cyan-500/40'
                    : isLightMode
                    ? 'bg-slate-100/60 border-slate-200 text-slate-400'
                    : 'bg-slate-950/40 border-white/5 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className={`font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Hardware Specifications' : 'مشخصات سخت‌افزاری'}
                    </div>
                    <div className="text-[10px] opacity-75 truncate">
                      {isEn ? 'vCPU cores, RAM (GB), Disk storage' : 'هسته‌های vCPU، رم و فضای دیسک'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeHardware}
                  onChange={(e) => setIncludeHardware(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>

              {/* Include Installed Services */}
              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  includeServices
                    ? isLightMode
                      ? 'bg-white border-cyan-500/60 shadow-xs'
                      : 'bg-slate-900/90 border-cyan-500/40'
                    : isLightMode
                    ? 'bg-slate-100/60 border-slate-200 text-slate-400'
                    : 'bg-slate-950/40 border-white/5 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className={`font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Web & Database Services' : 'سرویس‌های وب و دیتابیس'}
                    </div>
                    <div className="text-[10px] opacity-75 truncate">
                      {isEn ? 'Nginx, Apache, PostgreSQL, MySQL' : 'انجین‌ایکس، آپاچی، پستگرس، مای‌اس‌کیو‌ال'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeServices}
                  onChange={(e) => setIncludeServices(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>

              {/* Include Automation Tags */}
              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  includeTags
                    ? isLightMode
                      ? 'bg-white border-cyan-500/60 shadow-xs'
                      : 'bg-slate-900/90 border-cyan-500/40'
                    : isLightMode
                    ? 'bg-slate-100/60 border-slate-200 text-slate-400'
                    : 'bg-slate-950/40 border-white/5 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Tags className="w-4 h-4 text-purple-400 shrink-0" />
                  <div className="min-w-0">
                    <div className={`font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Tags & Category' : 'برچسب‌ها و دسته‌بندی'}
                    </div>
                    <div className="text-[10px] opacity-75 truncate">
                      {isEn ? 'Fleet tags, group categories, role' : 'تگ‌های اتوماسیون، دسته‌ها و نقش'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeTags}
                  onChange={(e) => setIncludeTags(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>

              {/* Include Uptime & Telemetry */}
              <label
                className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer select-none transition ${
                  includeUptime
                    ? isLightMode
                      ? 'bg-white border-cyan-500/60 shadow-xs'
                      : 'bg-slate-900/90 border-cyan-500/40'
                    : isLightMode
                    ? 'bg-slate-100/60 border-slate-200 text-slate-400'
                    : 'bg-slate-950/40 border-white/5 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <div className={`font-bold ${isLightMode ? 'text-slate-800' : 'text-slate-200'}`}>
                      {isEn ? 'Uptime & Live State' : 'کارکرد سیستم و وضعیت آنلاین'}
                    </div>
                    <div className="text-[10px] opacity-75 truncate">
                      {isEn ? 'Uptime duration, online status' : 'مدت آپتایم، وضعیت فعال بودن سرور'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeUptime}
                  onChange={(e) => setIncludeUptime(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Security & Zero-Leak Assurance */}
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-[11px] ${
              isLightMode
                ? 'bg-slate-100 border-slate-200 text-slate-600'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
          >
            <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              {isEn
                ? 'Zero-Leak Credential Security: Passwords, SSH private keys, and sudo secrets are completely stripped from exported records.'
                : 'امنیت کامل اطلاعات هویتی: تمامی رمزهای عبور، کلیدهای خصوصی SSH و اطلاعات محرمانه از فایل خروجی حذف می‌شوند.'}
            </span>
          </div>

          {/* Error Message */}
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

          {/* Success Notification */}
          {successCount !== null && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                {isEn
                  ? `Successfully exported ${successCount} server(s) to ${format.toUpperCase()}.`
                  : `خروجی ${successCount} سرور با موفقیت با فرمت ${format.toUpperCase()} دریافت شد.`}
              </span>
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
            <span className="font-mono text-cyan-400 font-bold">
              {serversToExport.length}
            </span>
            <span className={isLightMode ? 'text-slate-600' : 'text-slate-400'}>
              {isEn ? 'server(s) ready to export' : 'سرور آماده استخراج'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 rtl:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
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
              disabled={!canExportAtLeastOne || isExporting}
              onClick={handleExecuteExport}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer ${
                canExportAtLeastOne && !isExporting
                  ? 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-cyan-500/25 active:scale-95'
                  : 'bg-slate-700/50 text-slate-400 border border-white/5 cursor-not-allowed'
              }`}
            >
              <Download
                className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`}
              />
              <span>
                {isExporting
                  ? isEn
                    ? 'Exporting Fleet...'
                    : 'در حال استخراج...'
                  : isEn
                  ? `Download ${format.toUpperCase()} (${serversToExport.length})`
                  : `دریافت فایل ${format.toUpperCase()} (${serversToExport.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
