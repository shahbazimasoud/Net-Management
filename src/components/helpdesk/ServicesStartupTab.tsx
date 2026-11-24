import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cog,
  Download,
  FolderOpen,
  Layers,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface ServicesStartupTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  canExecuteActions: boolean;
  data: any | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  onClearActionBanner: () => void;
  onRefresh: () => void;
  onServiceAction: (
    service: any,
    action: 'start' | 'stop' | 'restart' | 'pause' | 'resume' | 'set_startup',
    startupType?: 'Automatic' | 'AutomaticDelayed' | 'Manual' | 'Disabled'
  ) => Promise<void>;
  onStartupAction: (params: {
    action: 'enable' | 'disable' | 'delete' | 'add';
    item?: any;
    newName?: string;
    newCommand?: string;
    newScope?: 'machine' | 'user';
    newOwnerSid?: string;
  }) => Promise<void>;
  busyKey: string | null;
}

const SERVICES_PAGE_SIZE = 25;
const STARTUP_PAGE_SIZE = 20;

export const ServicesStartupTab: React.FC<ServicesStartupTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  onClearActionBanner,
  onRefresh,
  onServiceAction,
  onStartupAction,
  busyKey,
}) => {
  const [section, setSection] = useState<'services' | 'startup'>('services');

  // Services filters, sorting, pagination & confirmation
  const [svcSearch, setSvcSearch] = useState('');
  const [svcStatusFilter, setSvcStatusFilter] = useState<'all' | 'Running' | 'Stopped' | 'Paused'>('all');
  const [svcStartFilter, setSvcStartFilter] = useState<
    'all' | 'Automatic' | 'AutomaticDelayed' | 'Manual' | 'Disabled'
  >('all');
  const [svcSort, setSvcSort] = useState<'displayName' | 'status' | 'startType' | 'pid'>('displayName');
  const [svcSortDir, setSvcSortDir] = useState<'asc' | 'desc'>('asc');
  const [svcPage, setSvcPage] = useState(1);
  const [expandedSvcId, setExpandedSvcId] = useState<string | null>(null);
  const [confirmStopSvcName, setConfirmStopSvcName] = useState<string | null>(null);

  // Startup filters, sorting, pagination & add form
  const [stSearch, setStSearch] = useState('');
  const [stScopeFilter, setStScopeFilter] = useState<'all' | 'machine' | 'user'>('all');
  const [stSourceFilter, setStSourceFilter] = useState<
    'all' | 'registry_run' | 'startup_folder' | 'scheduled_task'
  >('all');
  const [stEnabledFilter, setStEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [stPage, setStPage] = useState(1);
  const [expandedStId, setExpandedStId] = useState<string | null>(null);
  const [confirmDeleteStId, setConfirmDeleteStId] = useState<string | null>(null);

  const [showAddStartupForm, setShowAddStartupForm] = useState(false);
  const [newStartupName, setNewStartupName] = useState('');
  const [newStartupCommand, setNewStartupCommand] = useState('');
  const [newStartupScope, setNewStartupScope] = useState<'machine' | 'user'>('machine');
  const [newStartupOwnerSid, setNewStartupOwnerSid] = useState('');

  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-xs'
    : 'bg-slate-900/80 border-slate-800';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-sky-500';

  const servicesList: any[] = useMemo(
    () => (Array.isArray(data?.services) ? data.services : []),
    [data]
  );
  const startupList: any[] = useMemo(
    () => (Array.isArray(data?.startupItems) ? data.startupItems : []),
    [data]
  );

  // Distinct active user SIDs discovered from user startup items (so adding a per-user entry can target an active user)
  const discoveredUserProfiles = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of startupList) {
      if (item.ownerSid && item.ownerUser) {
        map.set(String(item.ownerSid), String(item.ownerUser));
      }
    }
    return Array.from(map.entries()).map(([sid, user]) => ({ sid, user }));
  }, [startupList]);

  const filteredServices = useMemo(() => {
    const q = svcSearch.trim().toLowerCase();
    const filtered = servicesList.filter((s) => {
      if (svcStatusFilter !== 'all' && s.status !== svcStatusFilter) return false;
      if (svcStartFilter !== 'all' && s.startType !== svcStartFilter) return false;
      if (!q) return true;
      return (
        String(s.displayName || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.description || '').toLowerCase().includes(q) ||
        String(s.account || '').toLowerCase().includes(q) ||
        String(s.pathName || '').toLowerCase().includes(q) ||
        String(s.pid || '').includes(q)
      );
    });
    const mult = svcSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (svcSort === 'pid') {
        const diff = (Number(a.pid) || 0) - (Number(b.pid) || 0);
        if (diff !== 0) return diff * mult;
      } else if (svcSort === 'status') {
        const cmp = String(a.status || '').localeCompare(String(b.status || ''));
        if (cmp !== 0) return cmp * mult;
      } else if (svcSort === 'startType') {
        const cmp = String(a.startType || '').localeCompare(String(b.startType || ''));
        if (cmp !== 0) return cmp * mult;
      }
      return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || '')) * mult;
    });
  }, [servicesList, svcSearch, svcStatusFilter, svcStartFilter, svcSort, svcSortDir]);

  const svcTotalPages = Math.max(1, Math.ceil(filteredServices.length / SERVICES_PAGE_SIZE));
  const clampedSvcPage = Math.min(Math.max(1, svcPage), svcTotalPages);
  const paginatedServices = useMemo(() => {
    const start = (clampedSvcPage - 1) * SERVICES_PAGE_SIZE;
    return filteredServices.slice(start, start + SERVICES_PAGE_SIZE);
  }, [filteredServices, clampedSvcPage]);

  const filteredStartup = useMemo(() => {
    const q = stSearch.trim().toLowerCase();
    return startupList.filter((item) => {
      if (stScopeFilter !== 'all' && item.scope !== stScopeFilter) return false;
      if (stSourceFilter !== 'all') {
        if (stSourceFilter === 'registry_run') {
          if (item.sourceType !== 'registry_run' && item.sourceType !== 'registry_runonce') return false;
        } else if (item.sourceType !== stSourceFilter) {
          return false;
        }
      }
      if (stEnabledFilter === 'enabled' && !item.enabled) return false;
      if (stEnabledFilter === 'disabled' && item.enabled) return false;
      if (!q) return true;
      return (
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.command || '').toLowerCase().includes(q) ||
        String(item.publisher || '').toLowerCase().includes(q) ||
        String(item.locationLabel || '').toLowerCase().includes(q) ||
        String(item.ownerUser || '').toLowerCase().includes(q)
      );
    });
  }, [startupList, stSearch, stScopeFilter, stSourceFilter, stEnabledFilter]);

  const stTotalPages = Math.max(1, Math.ceil(filteredStartup.length / STARTUP_PAGE_SIZE));
  const clampedStPage = Math.min(Math.max(1, stPage), stTotalPages);
  const paginatedStartup = useMemo(() => {
    const start = (clampedStPage - 1) * STARTUP_PAGE_SIZE;
    return filteredStartup.slice(start, start + STARTUP_PAGE_SIZE);
  }, [filteredStartup, clampedStPage]);

  const handleToggleSvcSort = (col: 'displayName' | 'status' | 'startType' | 'pid') => {
    if (svcSort === col) {
      setSvcSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSvcSort(col);
      setSvcSortDir(col === 'pid' ? 'desc' : 'asc');
    }
    setSvcPage(1);
  };

  const handleExportCsv = () => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    if (section === 'services') {
      if (filteredServices.length === 0) return;
      const headers = ['ServiceName', 'DisplayName', 'Status', 'StartupType', 'PID', 'Account', 'PathName', 'Protected'];
      const rows = filteredServices.map((s) =>
        [s.name, s.displayName, s.status, s.startType, s.pid || '', s.account, s.pathName, s.isProtected ? 'Yes' : 'No']
          .map(esc)
          .join(',')
      );
      const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `windows_services_${data?.hostname || targetIp || 'endpoint'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      if (filteredStartup.length === 0) return;
      const headers = ['Name', 'Enabled', 'Scope', 'Owner', 'SourceType', 'Location', 'Publisher', 'Command', 'Protected'];
      const rows = filteredStartup.map((item) =>
        [
          item.name,
          item.enabled ? 'Enabled' : 'Disabled',
          item.scope,
          item.ownerUser || '',
          item.sourceType,
          item.locationLabel,
          item.publisher || '',
          item.command,
          item.isProtected ? 'Yes' : 'No',
        ]
          .map(esc)
          .join(',')
      );
      const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `startup_programs_${data?.hostname || targetIp || 'endpoint'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleCreateStartupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStartupName.trim() || !newStartupCommand.trim()) return;
    await onStartupAction({
      action: 'add',
      newName: newStartupName.trim(),
      newCommand: newStartupCommand.trim(),
      newScope: newStartupScope,
      newOwnerSid: newStartupScope === 'user' ? newStartupOwnerSid || undefined : undefined,
    });
    setNewStartupName('');
    setNewStartupCommand('');
    setShowAddStartupForm(false);
  };

  const formatStartTypeLabel = (st: string) => {
    switch (st) {
      case 'Automatic':
        return isEn ? 'Automatic' : 'خودکار (Automatic)';
      case 'AutomaticDelayed':
        return isEn ? 'Automatic (Delayed)' : 'خودکار با تاخیر (Delayed)';
      case 'Manual':
        return isEn ? 'Manual' : 'دستی (Manual)';
      case 'Disabled':
        return isEn ? 'Disabled' : 'غیرفعال (Disabled)';
      case 'Boot':
        return isEn ? 'Boot' : 'بوت (Boot)';
      case 'System':
        return isEn ? 'System' : 'سیستم (System)';
      default:
        return st || 'Unknown';
    }
  };

  const formatStatusLabel = (st: string) => {
    switch (st) {
      case 'Running':
        return isEn ? 'Running' : 'در حال اجرا';
      case 'Stopped':
        return isEn ? 'Stopped' : 'متوقف';
      case 'Paused':
        return isEn ? 'Paused' : 'معلق (Paused)';
      case 'StartPending':
        return isEn ? 'Starting...' : 'در حال شروع...';
      case 'StopPending':
        return isEn ? 'Stopping...' : 'در حال توقف...';
      default:
        return st || 'Unknown';
    }
  };

  const formatSourceTypeLabel = (src: string) => {
    switch (src) {
      case 'registry_run':
        return isEn ? 'Registry Run' : 'رجیستری (Run)';
      case 'registry_runonce':
        return isEn ? 'Registry RunOnce' : 'رجیستری (RunOnce)';
      case 'startup_folder':
        return isEn ? 'Startup Folder' : 'پوشه Startup';
      case 'scheduled_task':
        return isEn ? 'Logon Task' : 'تسک زمان‌بندی ورود';
      default:
        return src;
    }
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-2xl border p-5 space-y-5 ${surfaceBg}`}>
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
              <Cog className="w-4 h-4 text-sky-500" />
              <span>
                {isEn
                  ? 'Services & Startup Programs Management'
                  : 'مدیریت سرویس‌ها و برنامه‌های استارت‌آپ (Services & Startup)'}
              </span>
              <FieldInfoTooltip
                isLightMode={isLightMode}
                isEn={isEn}
                title={isEn ? 'Services & Startup Control' : 'مدیریت سرویس‌ها و استارت‌آپ'}
                whatIsIt={
                  isEn
                    ? 'Live inspection and remote control of Windows Services (services.msc / systemctl) and all Startup triggers (Registry Run, Startup Folders, Logon Tasks).'
                    : 'مشاهده و کنترل زنده سرویس‌های ویندوز (services.msc) و تمامی برنامه‌هایی که هنگام بالا آمدن سیستم یا ورود کاربر اجرا می‌شوند.'
                }
                whyNeeded={
                  isEn
                    ? 'Lets HelpDesk engineers restart stuck services (like Spooler or Windows Update), change startup modes, or disable heavy startup apps slowing down boot.'
                    : 'به کارشناس پشتیبانی امکان می‌دهد سرویس‌های گیرکرده را ری‌استارت یا فعال/غیرفعال کند و برنامه‌های سنگین استارت‌آپ را بدون حذف دائمی مدیریت نماید.'
                }
                example={
                  isEn
                    ? 'Restart wuauserv before Windows Update, or disable heavy Teams/OneDrive autostart via StartupApproved.'
                    : 'ری‌استارت سرویس wuauserv یا غیرفعال کردن اجرای خودکار برنامه‌های اضافی در استارت‌آپ'
                }
              />
            </h2>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {isEn
                ? 'Start, stop, restart, pause/resume services or switch startup mode (Automatic, Delayed, Manual, Disabled) and manage Startup entries. Critical remote-access (WinRM/SSH) and security services are protected.'
                : 'اجرا، توقف، ری‌استارت، تغییر نوع راه‌اندازی سرویس‌ها (Automatic، Delayed، Manual، Disabled) و مدیریت برنامه‌های استارت‌آپ. سرویس‌های حیاتی شبکه و آنتی‌ویروس برای جلوگیری از قطع ارتباط محافظت شده‌اند.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && ((section === 'services' && filteredServices.length > 0) || (section === 'startup' && filteredStartup.length > 0)) && (
              <button
                type="button"
                onClick={handleExportCsv}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isLightMode
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isEn ? 'Export CSV' : 'خروجی CSV'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading || !targetIp.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isEn ? 'Refresh Services & Startup' : 'بروزرسانی سرویس‌ها و استارت‌آپ'}</span>
            </button>
          </div>
        </div>

        {/* Error & Action Banners */}
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-500">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex items-start justify-between gap-2.5 text-xs text-rose-500">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
            <button type="button" onClick={onClearActionBanner} className="opacity-70 hover:opacity-100 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionResult && (
          <div
            className={`rounded-xl border p-3.5 space-y-1.5 text-xs ${
              actionResult.success
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <div className="flex items-center gap-2">
                {actionResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{isEn ? actionResult.message : actionResult.messageFa}</span>
              </div>
              <button type="button" onClick={onClearActionBanner} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {actionResult.rawOutput && (
              <pre
                dir="ltr"
                className={`p-2 rounded-lg border font-mono text-[11px] overflow-x-auto ${subSurfaceBg} ${textMuted}`}
              >
                {actionResult.rawOutput}
              </pre>
            )}
          </div>
        )}

        {loading && !data && (
          <div className={`rounded-xl border p-10 text-center space-y-3 ${subSurfaceBg}`}>
            <Loader2 className="w-8 h-8 mx-auto text-sky-500 animate-spin" />
            <div className={`text-sm font-semibold ${textPrimary}`}>
              {isEn
                ? `Loading Windows Services and Startup entries from ${targetIp}...`
                : `در حال دریافت لیست سرویس‌ها و برنامه‌های استارت‌آپ از ${targetIp}...`}
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
            {isEn
              ? 'Connect to a workstation above or click "Refresh Services & Startup" to inspect services and startup programs.'
              : 'ابتدا به سیستم کاربر متصل شوید یا دکمه «بروزرسانی سرویس‌ها و استارت‌آپ» را بزنید.'}
          </div>
        )}

        {data && (
          <>
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>
                  {isEn ? 'Total Services' : 'کل سرویس‌های سیستم'}
                </div>
                <div className={`text-xl font-bold font-mono tabular-nums mt-1 ${textPrimary}`}>
                  {data.summary?.totalServices ?? servicesList.length}
                </div>
                <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${textMuted}`}>
                  <span>{data.hostname || data.targetIp}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {isEn ? 'Auto' : 'خودکار'}: <strong className={textPrimary}>{data.summary?.automaticServices ?? 0}</strong>
                  </span>
                </div>
              </div>

              <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>
                  {isEn ? 'Running / Stopped' : 'در حال اجرا / متوقف'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1 flex items-baseline gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">{data.summary?.runningServices ?? 0}</span>
                  <span className={`text-xs font-normal ${textMuted}`}>/</span>
                  <span className={textMuted}>{data.summary?.stoppedServices ?? 0}</span>
                </div>
                <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                  {isEn
                    ? `Disabled: ${data.summary?.disabledServices ?? 0}`
                    : `غیرفعال: ${data.summary?.disabledServices ?? 0}`}
                </div>
              </div>

              <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>
                  {isEn ? 'Startup Programs' : 'برنامه‌های استارت‌آپ'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1 text-indigo-500">
                  {data.summary?.totalStartupItems ?? startupList.length}
                </div>
                <div className={`text-[11px] mt-0.5 truncate ${textMuted}`} dir="ltr">
                  {data.activeUser || (isEn ? 'System & Active Users' : 'سیستم و کاربران فعال')}
                </div>
              </div>

              <div className={`rounded-xl border p-3.5 ${subSurfaceBg}`}>
                <div className={`text-[11px] font-medium ${textMuted}`}>
                  {isEn ? 'Startup Enabled / Disabled' : 'استارت‌آپ فعال / غیرفعال'}
                </div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1 flex items-baseline gap-2">
                  <span className="text-sky-500">{data.summary?.enabledStartupItems ?? 0}</span>
                  <span className={`text-xs font-normal ${textMuted}`}>/</span>
                  <span className="text-amber-500">{data.summary?.disabledStartupItems ?? 0}</span>
                </div>
                <div className={`text-[11px] mt-0.5 ${textMuted}`}>
                  {isEn ? 'Registry · Folder · Tasks' : 'رجیستری · پوشه · تسک'}
                </div>
              </div>
            </div>

            {/* Section Switcher: Services vs Startup Programs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className={`inline-flex items-center gap-1 p-1 rounded-xl border ${
                  isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSection('services')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    section === 'services'
                      ? isLightMode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-slate-800 text-white shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Activity className={`w-3.5 h-3.5 ${section === 'services' ? 'text-sky-500' : ''}`} />
                  <span>{isEn ? 'Windows Services' : 'سرویس‌های سیستم (Services)'}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75">({servicesList.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSection('startup')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    section === 'startup'
                      ? isLightMode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-slate-800 text-white shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Power className={`w-3.5 h-3.5 ${section === 'startup' ? 'text-indigo-500' : ''}`} />
                  <span>{isEn ? 'Startup Programs' : 'برنامه‌های استارت‌آپ (Startup)'}</span>
                  <span className="font-mono tabular-nums text-[11px] opacity-75">({startupList.length})</span>
                </button>
              </div>

              {section === 'startup' && canExecuteActions && (
                <button
                  type="button"
                  onClick={() => setShowAddStartupForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Add Startup Program' : 'افزودن برنامه به استارت‌آپ'}</span>
                </button>
              )}
            </div>

            {/* =============================================================== */}
            {/* SUB-SECTION A: WINDOWS SERVICES                                 */}
            {/* =============================================================== */}
            {section === 'services' && (
              <div className="space-y-4">
                {/* Services Filter & Search Toolbar */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                  <div className="lg:col-span-5 relative">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                    <input
                      type="text"
                      value={svcSearch}
                      onChange={(e) => {
                        setSvcSearch(e.target.value);
                        setSvcPage(1);
                      }}
                      placeholder={
                        isEn
                          ? 'Search service name, display name, description, PID, or path...'
                          : 'جستجو نام سرویس، عنوان نمایشی، توضیحات، PID یا مسیر فایل...'
                      }
                      className={`w-full ps-8 pe-8 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                    {svcSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setSvcSearch('');
                          setSvcPage(1);
                        }}
                        className={`absolute top-1/2 -translate-y-1/2 end-2.5 ${textMuted} hover:text-rose-500 cursor-pointer`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="lg:col-span-3">
                    <select
                      value={svcStatusFilter}
                      onChange={(e) => {
                        setSvcStatusFilter(e.target.value as any);
                        setSvcPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">
                        {isEn ? `All Statuses (${servicesList.length})` : `همه وضعیت‌ها (${servicesList.length})`}
                      </option>
                      <option value="Running">
                        {isEn
                          ? `Running (${data.summary?.runningServices ?? 0})`
                          : `در حال اجرا (${data.summary?.runningServices ?? 0})`}
                      </option>
                      <option value="Stopped">
                        {isEn
                          ? `Stopped (${data.summary?.stoppedServices ?? 0})`
                          : `متوقف (${data.summary?.stoppedServices ?? 0})`}
                      </option>
                      <option value="Paused">
                        {isEn
                          ? `Paused (${data.summary?.pausedServices ?? 0})`
                          : `معلق (${data.summary?.pausedServices ?? 0})`}
                      </option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <select
                      value={svcStartFilter}
                      onChange={(e) => {
                        setSvcStartFilter(e.target.value as any);
                        setSvcPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All Startup Types' : 'همه انواع اجرا'}</option>
                      <option value="Automatic">{isEn ? 'Automatic' : 'خودکار (Automatic)'}</option>
                      <option value="AutomaticDelayed">{isEn ? 'Automatic (Delayed)' : 'خودکار با تاخیر'}</option>
                      <option value="Manual">{isEn ? 'Manual' : 'دستی (Manual)'}</option>
                      <option value="Disabled">{isEn ? 'Disabled' : 'غیرفعال (Disabled)'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2 flex items-center gap-1.5">
                    <select
                      value={svcSort}
                      onChange={(e) => {
                        setSvcSort(e.target.value as any);
                        setSvcPage(1);
                      }}
                      className={`flex-1 min-w-0 px-2.5 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="displayName">{isEn ? 'Sort: Name' : 'مرتب‌سازی: نام'}</option>
                      <option value="status">{isEn ? 'Sort: Status' : 'مرتب‌سازی: وضعیت'}</option>
                      <option value="startType">{isEn ? 'Sort: Startup Type' : 'مرتب‌سازی: نوع اجرا'}</option>
                      <option value="pid">{isEn ? 'Sort: PID' : 'مرتب‌سازی: PID'}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setSvcSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      className={`px-2.5 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer shrink-0 ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {filteredServices.length === 0 ? (
                  <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                    {isEn
                      ? 'No services matched your search or filters.'
                      : 'هیچ سرویسی مطابق جستجو یا فیلترهای انتخابی یافت نشد.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs border-collapse">
                      <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/90 text-slate-400'}>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleSvcSort('displayName')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Service Name' : 'نام سرویس'}</span>
                              {svcSort === 'displayName' &&
                                (svcSortDir === 'asc' ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-sky-500" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                                ))}
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleSvcSort('status')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Status' : 'وضعیت'}</span>
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">
                            <button
                              type="button"
                              onClick={() => handleToggleSvcSort('startType')}
                              className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 cursor-pointer"
                            >
                              <span>{isEn ? 'Startup Type (Enable / Disable)' : 'نحوه اجرا (Enable / Disable)'}</span>
                            </button>
                          </th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Log On / PID' : 'اکانت اجرا / PID'}</th>
                          <th className="py-2.5 px-3 text-end">{isEn ? 'Controls' : 'کنترل سرویس'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {paginatedServices.map((svc: any) => {
                          const isExpanded = expandedSvcId === svc.name;
                          const isConfirmingStop = confirmStopSvcName === svc.name;
                          const rowBusy = busyKey?.startsWith(`svc:${svc.name}:`);
                          const isRunning = svc.status === 'Running';
                          const isStopped = svc.status === 'Stopped';
                          const isPaused = svc.status === 'Paused';

                          return (
                            <React.Fragment key={svc.name}>
                              <tr className={isLightMode ? 'hover:bg-slate-50/70' : 'hover:bg-slate-800/30'}>
                                <td className="py-2.5 px-3 max-w-[320px]">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedSvcId(isExpanded ? null : svc.name)}
                                    className="text-start group cursor-pointer w-full"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                      ) : (
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${textMuted} group-hover:text-sky-500`} />
                                      )}
                                      <span className={`font-semibold truncate ${textPrimary} group-hover:text-sky-500`}>
                                        {svc.displayName}
                                      </span>
                                      {svc.isProtected && (
                                        <span
                                          title={isEn ? svc.protectionReason : svc.protectionReasonFa}
                                          className="inline-flex items-center text-amber-500 shrink-0"
                                        >
                                          <Lock className="w-3 h-3" />
                                        </span>
                                      )}
                                    </div>
                                    <div className={`text-[11px] font-mono ps-5 truncate ${textMuted}`} dir="ltr">
                                      {svc.name}
                                    </div>
                                  </button>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1.5 font-semibold text-xs ${
                                      isRunning
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : isPaused
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : textMuted
                                    }`}
                                  >
                                    {isRunning ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ) : isPaused ? (
                                      <Pause className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                      <Square className="w-3 h-3 shrink-0" />
                                    )}
                                    <span>{formatStatusLabel(svc.status)}</span>
                                  </span>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  {canExecuteActions &&
                                  (svc.startType === 'Automatic' ||
                                    svc.startType === 'AutomaticDelayed' ||
                                    svc.startType === 'Manual' ||
                                    svc.startType === 'Disabled') ? (
                                    <select
                                      value={svc.startType}
                                      disabled={Boolean(busyKey)}
                                      onChange={(e) => {
                                        const val = e.target.value as
                                          | 'Automatic'
                                          | 'AutomaticDelayed'
                                          | 'Manual'
                                          | 'Disabled';
                                        onServiceAction(svc, 'set_startup', val);
                                      }}
                                      className={`px-2 py-1 rounded-md border text-[11px] font-medium outline-none cursor-pointer disabled:opacity-50 ${inputCls}`}
                                    >
                                      <option value="Automatic">{formatStartTypeLabel('Automatic')}</option>
                                      {data.osFamily !== 'linux' && (
                                        <option value="AutomaticDelayed">{formatStartTypeLabel('AutomaticDelayed')}</option>
                                      )}
                                      <option value="Manual">{formatStartTypeLabel('Manual')}</option>
                                      {!svc.isProtected && (
                                        <option value="Disabled">{formatStartTypeLabel('Disabled')}</option>
                                      )}
                                    </select>
                                  ) : (
                                    <span className={`text-[11px] ${textMuted}`}>
                                      {formatStartTypeLabel(svc.startType)}
                                    </span>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className={`text-[11px] truncate max-w-[160px] ${textMuted}`} dir="ltr">
                                    {svc.account || '—'}
                                  </div>
                                  <div className={`text-[11px] font-mono tabular-nums ${textMuted}`} dir="ltr">
                                    {svc.pid ? `PID ${svc.pid}` : '—'}
                                  </div>
                                </td>

                                <td className="py-2.5 px-3 text-end whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    {isConfirmingStop ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={Boolean(busyKey)}
                                          onClick={() => {
                                            setConfirmStopSvcName(null);
                                            onServiceAction(svc, 'stop');
                                          }}
                                          className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer"
                                        >
                                          {isEn ? 'Confirm Stop' : 'تأیید توقف'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmStopSvcName(null)}
                                          className={`px-2 py-1 rounded-md border text-[11px] cursor-pointer ${
                                            isLightMode
                                              ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                              : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                          }`}
                                        >
                                          {isEn ? 'Cancel' : 'انصراف'}
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        {(isStopped || svc.status === 'Unknown') && (
                                          <button
                                            type="button"
                                            disabled={!canExecuteActions || Boolean(busyKey) || svc.startType === 'Disabled'}
                                            onClick={() => onServiceAction(svc, 'start')}
                                            title={
                                              svc.startType === 'Disabled'
                                                ? isEn
                                                  ? 'Change startup type from Disabled before starting'
                                                  : 'ابتدا نوع اجرا را از Disabled تغییر دهید'
                                                : isEn
                                                ? 'Start Service'
                                                : 'شروع سرویس (Start)'
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition cursor-pointer"
                                          >
                                            {rowBusy ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Play className="w-3 h-3" />
                                            )}
                                            <span>{isEn ? 'Start' : 'شروع'}</span>
                                          </button>
                                        )}

                                        {isPaused && (
                                          <button
                                            type="button"
                                            disabled={!canExecuteActions || Boolean(busyKey)}
                                            onClick={() => onServiceAction(svc, 'resume')}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold transition cursor-pointer"
                                          >
                                            <Play className="w-3 h-3" />
                                            <span>{isEn ? 'Resume' : 'ادامه'}</span>
                                          </button>
                                        )}

                                        {isRunning && svc.canPauseAndContinue && !svc.isProtected && (
                                          <button
                                            type="button"
                                            disabled={!canExecuteActions || Boolean(busyKey)}
                                            onClick={() => onServiceAction(svc, 'pause')}
                                            title={isEn ? 'Pause Service' : 'معلق‌کردن (Pause)'}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                                              isLightMode
                                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                            }`}
                                          >
                                            <Pause className="w-3 h-3" />
                                            <span>{isEn ? 'Pause' : 'توقف موقت'}</span>
                                          </button>
                                        )}

                                        {isRunning && !svc.isProtected && (
                                          <button
                                            type="button"
                                            disabled={!canExecuteActions || Boolean(busyKey)}
                                            onClick={() => onServiceAction(svc, 'restart')}
                                            title={isEn ? 'Restart Service' : 'ری‌استارت سرویس'}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 text-sky-600 dark:text-sky-400 text-[11px] font-semibold transition cursor-pointer"
                                          >
                                            {rowBusy ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <RotateCcw className="w-3 h-3" />
                                            )}
                                            <span>{isEn ? 'Restart' : 'ری‌استارت'}</span>
                                          </button>
                                        )}

                                        {(isRunning || isPaused) && !svc.isProtected && svc.canStop && (
                                          <button
                                            type="button"
                                            disabled={!canExecuteActions || Boolean(busyKey)}
                                            onClick={() => setConfirmStopSvcName(svc.name)}
                                            title={isEn ? 'Stop Service' : 'توقف سرویس (Stop)'}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-500 text-[11px] font-semibold transition cursor-pointer"
                                          >
                                            <PowerOff className="w-3 h-3" />
                                            <span>{isEn ? 'Stop' : 'توقف'}</span>
                                          </button>
                                        )}

                                        {svc.isProtected && (
                                          <span
                                            title={isEn ? svc.protectionReason : svc.protectionReasonFa}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium ${
                                              isLightMode
                                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                            }`}
                                          >
                                            <Shield className="w-3 h-3" />
                                            <span>{isEn ? 'Protected' : 'محافظت‌شده'}</span>
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className={isLightMode ? 'bg-slate-50/90' : 'bg-slate-900/55'}>
                                  <td colSpan={5} className="px-5 py-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                      {svc.description && (
                                        <div className="md:col-span-2">
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'Description: ' : 'توضیحات: '}
                                          </span>
                                          <span className={textPrimary}>{svc.description}</span>
                                        </div>
                                      )}
                                      {svc.pathName && (
                                        <div className="md:col-span-2">
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'Path to Executable: ' : 'مسیر فایل اجرایی: '}
                                          </span>
                                          <code
                                            dir="ltr"
                                            className={`inline-block mt-0.5 px-2 py-0.5 rounded border font-mono text-[10px] break-all ${subSurfaceBg} ${textPrimary}`}
                                          >
                                            {svc.pathName}
                                          </code>
                                        </div>
                                      )}
                                      <div>
                                        <span className={`font-semibold ${textMuted}`}>
                                          {isEn ? 'Depends On: ' : 'وابسته به سرویس‌های: '}
                                        </span>
                                        <span className={`font-mono ${textPrimary}`} dir="ltr">
                                          {svc.dependsOn?.length ? svc.dependsOn.join(', ') : isEn ? 'None' : 'ندارد'}
                                        </span>
                                      </div>
                                      <div>
                                        <span className={`font-semibold ${textMuted}`}>
                                          {isEn ? 'Dependent Services: ' : 'سرویس‌های وابسته به این سرویس: '}
                                        </span>
                                        <span className={`font-mono ${textPrimary}`} dir="ltr">
                                          {svc.dependentServices?.length
                                            ? svc.dependentServices.join(', ')
                                            : isEn
                                            ? 'None'
                                            : 'ندارد'}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Services Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={textMuted}>
                    {isEn
                      ? `Showing ${(clampedSvcPage - 1) * SERVICES_PAGE_SIZE + (paginatedServices.length > 0 ? 1 : 0)}–${
                          (clampedSvcPage - 1) * SERVICES_PAGE_SIZE + paginatedServices.length
                        } of ${filteredServices.length} matching service(s)`
                      : `نمایش ${
                          (clampedSvcPage - 1) * SERVICES_PAGE_SIZE + (paginatedServices.length > 0 ? 1 : 0)
                        } تا ${(clampedSvcPage - 1) * SERVICES_PAGE_SIZE + paginatedServices.length} از ${
                          filteredServices.length
                        } سرویس`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={clampedSvcPage <= 1}
                      onClick={() => setSvcPage(Math.max(1, clampedSvcPage - 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Prev' : 'قبلی'}</span>
                    </button>
                    <span className={`px-2 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                      {clampedSvcPage} / {svcTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={clampedSvcPage >= svcTotalPages}
                      onClick={() => setSvcPage(Math.min(svcTotalPages, clampedSvcPage + 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <span>{isEn ? 'Next' : 'بعدی'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* SUB-SECTION B: STARTUP PROGRAMS                                 */}
            {/* =============================================================== */}
            {section === 'startup' && (
              <div className="space-y-4">
                {/* Inline Add Startup Entry Form */}
                {showAddStartupForm && (
                  <form
                    onSubmit={handleCreateStartupSubmit}
                    className={`rounded-xl border p-4 space-y-3 ${subSurfaceBg}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-xs font-bold flex items-center gap-2 ${textPrimary}`}>
                        <Plus className="w-3.5 h-3.5 text-indigo-500" />
                        <span>
                          {isEn
                            ? 'Add New Windows Startup Entry (Registry Run)'
                            : 'افزودن برنامه جدید به استارت‌آپ (Registry Run)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddStartupForm(false)}
                        className={`text-xs ${textMuted} hover:text-rose-500 cursor-pointer`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <div className="md:col-span-3">
                        <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                          {isEn ? 'Entry Name' : 'نام ورودی'}
                        </label>
                        <input
                          type="text"
                          required
                          value={newStartupName}
                          onChange={(e) => setNewStartupName(e.target.value)}
                          placeholder="e.g. CompanyVPNClient"
                          className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                        />
                      </div>

                      <div className="md:col-span-5">
                        <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                          {isEn ? 'Executable Path / Command' : 'مسیر فایل اجرایی یا دستور'}
                        </label>
                        <input
                          type="text"
                          required
                          dir="ltr"
                          value={newStartupCommand}
                          onChange={(e) => setNewStartupCommand(e.target.value)}
                          placeholder='"C:\Program Files\App\app.exe" --minimized'
                          className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                          {isEn ? 'Scope' : 'دامنه اجرا'}
                        </label>
                        <select
                          value={newStartupScope}
                          onChange={(e) => setNewStartupScope(e.target.value as 'machine' | 'user')}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                        >
                          <option value="machine">{isEn ? 'All Users (HKLM)' : 'همه کاربران (HKLM)'}</option>
                          <option value="user">{isEn ? 'Active User (HKU/HKCU)' : 'کاربر فعال (HKU)'}</option>
                        </select>
                      </div>

                      <div className="md:col-span-2 flex items-end">
                        <button
                          type="submit"
                          disabled={Boolean(busyKey)}
                          className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                        >
                          {busyKey === 'startup:add' ? (
                            <Loader2 className="w-3.5 h-3.5 mx-auto animate-spin" />
                          ) : isEn ? (
                            'Add Entry'
                          ) : (
                            'ثبت در استارت‌آپ'
                          )}
                        </button>
                      </div>
                    </div>

                    {newStartupScope === 'user' && discoveredUserProfiles.length > 0 && (
                      <div className="max-w-sm">
                        <label className={`block text-[11px] font-medium mb-1 ${textMuted}`}>
                          {isEn ? 'Target User Profile (Optional)' : 'پروفایل کاربر هدف (اختیاری)'}
                        </label>
                        <select
                          value={newStartupOwnerSid}
                          onChange={(e) => setNewStartupOwnerSid(e.target.value)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                        >
                          <option value="">{isEn ? 'Session / HKCU Default' : 'اکانت نشست فعلی (HKCU)'}</option>
                          {discoveredUserProfiles.map((u) => (
                            <option key={u.sid} value={u.sid}>
                              {u.user}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </form>
                )}

                {/* Startup Search & Filters */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                  <div className="lg:col-span-5 relative">
                    <Search className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-3 ${textMuted}`} />
                    <input
                      type="text"
                      value={stSearch}
                      onChange={(e) => {
                        setStSearch(e.target.value);
                        setStPage(1);
                      }}
                      placeholder={
                        isEn
                          ? 'Search startup app name, command path, publisher, or user...'
                          : 'جستجو نام برنامه، مسیر اجرا، ناشر یا کاربر...'
                      }
                      className={`w-full ps-8 pe-8 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    />
                    {stSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setStSearch('');
                          setStPage(1);
                        }}
                        className={`absolute top-1/2 -translate-y-1/2 end-2.5 ${textMuted} hover:text-rose-500 cursor-pointer`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <select
                      value={stEnabledFilter}
                      onChange={(e) => {
                        setStEnabledFilter(e.target.value as any);
                        setStPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All States' : 'همه وضعیت‌ها'}</option>
                      <option value="enabled">{isEn ? 'Enabled' : 'فعال (Enabled)'}</option>
                      <option value="disabled">{isEn ? 'Disabled' : 'غیرفعال (Disabled)'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-2">
                    <select
                      value={stScopeFilter}
                      onChange={(e) => {
                        setStScopeFilter(e.target.value as any);
                        setStPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All Scopes' : 'همه دامنه‌ها'}</option>
                      <option value="machine">{isEn ? 'System / All Users' : 'سیستمی (همه‌کاربران)'}</option>
                      <option value="user">{isEn ? 'User Profile' : 'پروفایل کاربر'}</option>
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <select
                      value={stSourceFilter}
                      onChange={(e) => {
                        setStSourceFilter(e.target.value as any);
                        setStPage(1);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                    >
                      <option value="all">{isEn ? 'All Startup Sources' : 'همه منابع استارت‌آپ'}</option>
                      <option value="registry_run">{isEn ? 'Registry (Run / RunOnce)' : 'رجیستری (Run / RunOnce)'}</option>
                      <option value="startup_folder">{isEn ? 'Startup Folder' : 'پوشه Startup'}</option>
                      <option value="scheduled_task">{isEn ? 'Logon Scheduled Tasks' : 'تسک‌های زمان‌بندی ورود'}</option>
                    </select>
                  </div>
                </div>

                {filteredStartup.length === 0 ? (
                  <div className={`rounded-xl border p-8 text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                    {isEn
                      ? 'No startup items matched your current search or filters.'
                      : 'هیچ برنامه استارت‌آپی مطابق جستجو یا فیلترهای انتخابی یافت نشد.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-xs border-collapse">
                      <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/90 text-slate-400'}>
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Startup Program' : 'نام برنامه'}</th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Source & Scope' : 'منبع و دامنه'}</th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Publisher' : 'ناشر'}</th>
                          <th className="py-2.5 px-3 text-start">{isEn ? 'Status' : 'وضعیت'}</th>
                          <th className="py-2.5 px-3 text-end">{isEn ? 'Actions' : 'مدیریت'}</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                        {paginatedStartup.map((item: any) => {
                          const isExpanded = expandedStId === item.id;
                          const isConfirmingDel = confirmDeleteStId === item.id;
                          const rowBusy = busyKey === `startup:${item.id}`;

                          return (
                            <React.Fragment key={item.id}>
                              <tr className={isLightMode ? 'hover:bg-slate-50/70' : 'hover:bg-slate-800/30'}>
                                <td className="py-2.5 px-3 max-w-[330px]">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStId(isExpanded ? null : item.id)}
                                    className="text-start group cursor-pointer w-full"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {isExpanded ? (
                                        <ChevronUp className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      ) : (
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${textMuted} group-hover:text-indigo-500`} />
                                      )}
                                      <span className={`font-semibold truncate ${textPrimary} group-hover:text-indigo-500`}>
                                        {item.name}
                                      </span>
                                      {item.isProtected && (
                                        <span
                                          title={isEn ? item.protectionReason : item.protectionReasonFa}
                                          className="inline-flex items-center text-amber-500 shrink-0"
                                        >
                                          <Lock className="w-3 h-3" />
                                        </span>
                                      )}
                                    </div>
                                    <div className={`text-[11px] font-mono ps-5 truncate ${textMuted}`} dir="ltr">
                                      {item.command}
                                    </div>
                                  </button>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${textPrimary}`}>
                                      {item.scope === 'user' ? (
                                        <>
                                          <User className="w-3 h-3 text-indigo-500 shrink-0" />
                                          <span className="truncate max-w-[140px]" dir="ltr">
                                            {item.ownerUser || (isEn ? 'User Profile' : 'کاربر')}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Server className="w-3 h-3 text-sky-500 shrink-0" />
                                          <span>{isEn ? 'Machine (All Users)' : 'سیستم (همه کاربران)'}</span>
                                        </>
                                      )}
                                    </span>
                                    <span className={`text-[10px] ${textMuted}`}>
                                      {formatSourceTypeLabel(item.sourceType)}
                                    </span>
                                  </div>
                                </td>

                                <td className={`py-2.5 px-3 max-w-[160px] truncate ${textMuted}`}>
                                  {item.publisher || '—'}
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1.5 font-semibold text-xs ${
                                      item.enabled
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-amber-600 dark:text-amber-400'
                                    }`}
                                  >
                                    {item.enabled ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    ) : (
                                      <PowerOff className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span>
                                      {item.enabled
                                        ? isEn
                                          ? 'Enabled'
                                          : 'فعال'
                                        : isEn
                                        ? 'Disabled'
                                        : 'غیرفعال'}
                                    </span>
                                  </span>
                                </td>

                                <td className="py-2.5 px-3 text-end whitespace-nowrap">
                                  {item.isProtected ? (
                                    <span
                                      title={isEn ? item.protectionReason : item.protectionReasonFa}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium ${
                                        isLightMode
                                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                                          : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                      }`}
                                    >
                                      <Shield className="w-3 h-3" />
                                      <span>{isEn ? 'Protected' : 'محافظت‌شده'}</span>
                                    </span>
                                  ) : isConfirmingDel ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={Boolean(busyKey)}
                                        onClick={() => {
                                          setConfirmDeleteStId(null);
                                          onStartupAction({ action: 'delete', item });
                                        }}
                                        className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold transition cursor-pointer"
                                      >
                                        {isEn ? 'Confirm Delete' : 'تأیید حذف'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteStId(null)}
                                        className={`px-2 py-1 rounded-md border text-[11px] cursor-pointer ${
                                          isLightMode
                                            ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                            : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                        }`}
                                      >
                                        {isEn ? 'Cancel' : 'انصراف'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-1.5">
                                      {item.canToggle && (
                                        <button
                                          type="button"
                                          disabled={!canExecuteActions || Boolean(busyKey)}
                                          onClick={() =>
                                            onStartupAction({
                                              action: item.enabled ? 'disable' : 'enable',
                                              item,
                                            })
                                          }
                                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                                            item.enabled
                                              ? isLightMode
                                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                              : 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                          }`}
                                        >
                                          {rowBusy ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : item.enabled ? (
                                            <PowerOff className="w-3 h-3" />
                                          ) : (
                                            <Play className="w-3 h-3" />
                                          )}
                                          <span>
                                            {item.enabled
                                              ? isEn
                                                ? 'Disable'
                                                : 'غیرفعال‌سازی'
                                              : isEn
                                              ? 'Enable'
                                              : 'فعال‌سازی'}
                                          </span>
                                        </button>
                                      )}

                                      {item.canDelete && (
                                        <button
                                          type="button"
                                          disabled={!canExecuteActions || Boolean(busyKey)}
                                          onClick={() => setConfirmDeleteStId(item.id)}
                                          title={isEn ? 'Remove from Startup' : 'حذف از استارت‌آپ'}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-500 text-[11px] font-semibold transition cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          <span>{isEn ? 'Remove' : 'حذف'}</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className={isLightMode ? 'bg-slate-50/90' : 'bg-slate-900/55'}>
                                  <td colSpan={5} className="px-5 py-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                      <div>
                                        <span className={`font-semibold ${textMuted}`}>
                                          {isEn ? 'Location: ' : 'محل ثبت در سیستم: '}
                                        </span>
                                        <span className={`font-mono break-all ${textPrimary}`} dir="ltr">
                                          {item.locationLabel}
                                        </span>
                                      </div>
                                      {item.ownerUser && (
                                        <div>
                                          <span className={`font-semibold ${textMuted}`}>
                                            {isEn ? 'Owner Account: ' : 'اکانت مالک: '}
                                          </span>
                                          <span className={`font-mono ${textPrimary}`} dir="ltr">
                                            {item.ownerUser}
                                          </span>
                                        </div>
                                      )}
                                      <div className="md:col-span-2">
                                        <span className={`font-semibold ${textMuted}`}>
                                          {isEn ? 'Startup Command / Target: ' : 'دستور یا مسیر اجرا: '}
                                        </span>
                                        <code
                                          dir="ltr"
                                          className={`inline-block mt-0.5 px-2 py-0.5 rounded border font-mono text-[10px] break-all ${subSurfaceBg} ${textPrimary}`}
                                        >
                                          {item.command}
                                        </code>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Startup Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={textMuted}>
                    {isEn
                      ? `Showing ${(clampedStPage - 1) * STARTUP_PAGE_SIZE + (paginatedStartup.length > 0 ? 1 : 0)}–${
                          (clampedStPage - 1) * STARTUP_PAGE_SIZE + paginatedStartup.length
                        } of ${filteredStartup.length} startup item(s)`
                      : `نمایش ${
                          (clampedStPage - 1) * STARTUP_PAGE_SIZE + (paginatedStartup.length > 0 ? 1 : 0)
                        } تا ${(clampedStPage - 1) * STARTUP_PAGE_SIZE + paginatedStartup.length} از ${
                          filteredStartup.length
                        } برنامه استارت‌آپ`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={clampedStPage <= 1}
                      onClick={() => setStPage(Math.max(1, clampedStPage - 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Prev' : 'قبلی'}</span>
                    </button>
                    <span className={`px-2 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                      {clampedStPage} / {stTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={clampedStPage >= stTotalPages}
                      onClick={() => setStPage(Math.min(stTotalPages, clampedStPage + 1))}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 cursor-pointer ${
                        isLightMode
                          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      <span>{isEn ? 'Next' : 'بعدی'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
