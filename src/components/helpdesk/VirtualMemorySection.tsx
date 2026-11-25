import React, { useEffect, useMemo, useState } from 'react';
import {
  MemoryStick,
  HardDrive,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Lock,
  Cpu,
  Sliders,
  Plus,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { TimeoutAntivirusHint } from './TimeoutAntivirusHint';
import {
  HelpdeskVirtualMemoryAction,
  HelpdeskVirtualMemoryResult,
} from '../../services/api';

export interface VirtualMemorySectionProps {
  isLightMode: boolean;
  isEn: boolean;
  canRunDiagnostics: boolean;
  canExecuteActions: boolean;
  data: HelpdeskVirtualMemoryResult | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  busy: boolean;
  highlighted?: boolean;
  onRefresh: () => void;
  onClearActionBanner: () => void;
  onManage: (params: {
    action: HelpdeskVirtualMemoryAction;
    driveOrMount?: string;
    filePath?: string;
    initialSizeMb?: number;
    maximumSizeMb?: number;
    persistent?: boolean;
    swappiness?: number;
  }) => Promise<void>;
  onGoToAntivirus?: () => void;
}

function fmtMbToSmart(mb: number, isEn: boolean): string {
  const v = Math.max(0, Number(mb) || 0);
  if (v >= 1024) {
    return `${(v / 1024).toFixed(2)} ${isEn ? 'GB' : 'گیگابایت'} (${v.toLocaleString()} MB)`;
  }
  return `${v.toLocaleString()} MB`;
}

export const VirtualMemorySection: React.FC<VirtualMemorySectionProps> = ({
  isLightMode,
  isEn,
  canRunDiagnostics,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  busy,
  highlighted = false,
  onRefresh,
  onClearActionBanner,
  onManage,
  onGoToAntivirus,
}) => {
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [winMode, setWinMode] = useState<'custom_size' | 'system_managed_drive'>('custom_size');
  const [initialMbInput, setInitialMbInput] = useState<string>('4096');
  const [maxMbInput, setMaxMbInput] = useState<string>('8192');
  const [linuxPersistent, setLinuxPersistent] = useState<boolean>(true);
  const [swappinessInput, setSwappinessInput] = useState<string>('30');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-xs'
    : 'bg-slate-900/80 border-slate-800 shadow-sm';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200/90'
    : 'bg-slate-950/60 border-slate-800/90';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-sky-500';

  useEffect(() => {
    if (!data) return;
    const drives = data.eligibleDrives || [];
    if (drives.length > 0 && (!selectedDrive || !drives.some((d) => d.driveOrMount === selectedDrive))) {
      const preferred =
        drives.find((d) => d.hasAllocation) ||
        drives.slice().sort((a, b) => b.freeMb - a.freeMb)[0];
      if (preferred) setSelectedDrive(preferred.driveOrMount);
    }
    if (data.recommendedMinMb > 0 && (!initialMbInput || initialMbInput === '4096')) {
      setInitialMbInput(String(data.recommendedMinMb));
      setMaxMbInput(String(Math.max(data.recommendedMinMb, data.recommendedMaxMb)));
    }
    if (data.swappiness !== null && data.swappiness !== undefined) {
      setSwappinessInput(String(data.swappiness));
    }
  }, [data]);

  const activeDriveMeta = useMemo(() => {
    if (!data?.eligibleDrives?.length) return null;
    return (
      data.eligibleDrives.find((d) => d.driveOrMount === selectedDrive) ||
      data.eligibleDrives[0] ||
      null
    );
  }, [data, selectedDrive]);

  const existingOnSelectedDriveMb = useMemo(() => {
    if (!data?.allocations || !activeDriveMeta) return 0;
    return data.allocations
      .filter((a) => a.driveOrMount === activeDriveMeta.driveOrMount)
      .reduce((sum, a) => sum + (Number(a.currentAllocatedMb) || 0), 0);
  }, [data, activeDriveMeta]);

  const parsedInit = Math.round(Number(initialMbInput) || 0);
  const parsedMax = data?.osFamily === 'linux' ? parsedInit : Math.round(Number(maxMbInput) || 0);

  const spaceValidationError = useMemo(() => {
    if (!data || !activeDriveMeta) return null;
    if (data.osFamily === 'windows' && winMode === 'system_managed_drive') return null;
    if (parsedInit < 16) {
      return isEn ? 'Size must be at least 16 MB.' : 'حداقل حجم مجاز ۱۶ مگابایت است.';
    }
    if (data.osFamily === 'windows' && parsedMax < parsedInit) {
      return isEn
        ? 'Maximum size must be greater than or equal to Initial size.'
        : 'حداکثر حجم (Maximum) باید بزرگتر یا مساوی حجم اولیه (Initial) باشد.';
    }
    if (parsedMax > 1048576) {
      return isEn ? 'Maximum limit is 1,048,576 MB (1 TB).' : 'حداکثر مقدار مجاز ۱ ترابایت است.';
    }
    const maxSafeMb = activeDriveMeta.freeMb + existingOnSelectedDriveMb - 1024;
    if (parsedMax > maxSafeMb) {
      return isEn
        ? `Requested ${parsedMax.toLocaleString()} MB exceeds safe free space on ${activeDriveMeta.driveOrMount} (max ~${Math.max(0, Math.round(maxSafeMb)).toLocaleString()} MB preserving 1 GB OS headroom).`
        : `حجم درخواستی (${parsedMax.toLocaleString()} MB) از فضای آزاد امن درایو ${activeDriveMeta.driveOrMount} بیشتر است (حداکثر مجاز با حفظ ۱ گیگابایت فضای رزرو: ${Math.max(0, Math.round(maxSafeMb)).toLocaleString()} MB).`;
    }
    return null;
  }, [data, activeDriveMeta, existingOnSelectedDriveMb, winMode, parsedInit, parsedMax, isEn]);

  const applyPresetMb = (initVal: number, maxVal: number) => {
    setWinMode('custom_size');
    setInitialMbInput(String(Math.max(16, Math.round(initVal))));
    setMaxMbInput(String(Math.max(16, Math.round(maxVal))));
  };

  const handleApplyAllocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !activeDriveMeta || spaceValidationError) return;
    if (data.osFamily === 'windows' && winMode === 'system_managed_drive') {
      await onManage({
        action: 'set_system_managed_drive',
        driveOrMount: activeDriveMeta.driveOrMount,
      });
      return;
    }
    await onManage({
      action: 'set_custom',
      driveOrMount: activeDriveMeta.driveOrMount,
      initialSizeMb: parsedInit,
      maximumSizeMb: data.osFamily === 'linux' ? parsedInit : parsedMax,
      persistent: linuxPersistent,
    });
  };

  return (
    <div
      id="hd-section-virtual-memory"
      className={`scroll-mt-4 rounded-xl border p-4 sm:p-5 space-y-5 transition ${surfaceBg} ${
        highlighted ? 'ring-2 ring-sky-500 ring-offset-2' : ''
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MemoryStick className="w-4 h-4 text-violet-500" />
            <h3 className={`text-sm font-bold ${textPrimary}`}>
              {isEn
                ? 'Virtual Memory & Disk-as-RAM Allocation (Pagefile / Swap)'
                : 'حافظه مجازی و تخصیص هارد به عنوان رم (Virtual Memory / Pagefile / Swap)'}
            </h3>
            <FieldInfoTooltip
              isEn={isEn}
              isLightMode={isLightMode}
              fieldName={isEn ? 'Virtual Memory (Pagefile / Swap)' : 'حافظه مجازی (استفاده از دیسک به عنوان رم)'}
              whatIsIt={
                isEn
                  ? 'Dedicates a controlled portion of local SSD/HDD storage as Virtual RAM (pagefile.sys on Windows, swap file on Linux) so the OS can handle memory spikes and heavy applications without Out-Of-Memory crashes.'
                  : 'بخشی از فضای هارد یا SSD را به‌عنوان حافظه رم کمکی/مجازی (فایل pagefile.sys در ویندوز یا Swap File در لینوکس) به سیستم‌عامل معرفی می‌کند تا هنگام پر شدن رم فیزیکی، برنامه‌ها کرش نکنند.'
              }
              whyNeeded={
                isEn
                  ? 'Workstations with 4–8 GB RAM running browsers, Outlook, ERP clients, or VMs often freeze when commit memory fills up; moving or expanding Pagefile onto a fast drive with free space stabilizes the endpoint.'
                  : 'سیستم‌هایی که با کمبود رم مواجه می‌شوند یا درایو C آن‌ها پر شده، با تخصیص رم مجازی روی درایو با فضای آزاد کافی (مثلاً درایو D یا SSD) از هنگ کردن و خطای کمبود حافظه جلوگیری می‌کنند.'
              }
              example={
                isEn
                  ? '8 GB RAM PC → Allocate 8,192–12,288 MB on D:\\pagefile.sys (or Linux /swapfile)'
                  : 'سیستم با ۸ گیگابایت رم ← اختصاص ۸۱۹۲ تا ۱۲۲۸۸ مگابایت روی D:\\pagefile.sys (یا /swapfile در لینوکس)'
              }
            />
          </div>
          <p className={`text-xs mt-0.5 ${textMuted}`}>
            {isEn
              ? 'View live physical RAM vs commit limit, configure Windows Pagefile size per drive or Automatic mode, and allocate or remove Linux Swap space.'
              : 'مشاهده وضعیت رم فیزیکی و حافظه مجازی فعلی، تعیین دقیق میزان هارد اختصاص‌یافته به عنوان رم روی درایو دلخواه، یا فعال‌سازی حالت خودکار سیستم.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.osFamily === 'windows' && !data.automaticManagedPagefile && (
            <button
              type="button"
              onClick={() => onManage({ action: 'enable_auto' })}
              disabled={!canExecuteActions || busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-500 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isEn ? 'Enable Windows Auto Mode' : 'فعال‌سازی مدیریت خودکار ویندوز'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={!canRunDiagnostics || loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span>{isEn ? 'Refresh Virtual Memory' : 'بروزرسانی حافظه مجازی'}</span>
          </button>
        </div>
      </div>

      {/* Errors & Action Notices */}
      {error && (
        <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{error}</span>
            <TimeoutAntivirusHint
              errorText={error}
              isEn={isEn}
              isLightMode={isLightMode}
              canViewSecurityAv={canRunDiagnostics}
              canControlAntivirus={canExecuteActions}
              onGoToAntivirus={onGoToAntivirus}
            />
          </div>
        </div>
      )}

      {actionResult && (
        <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-500">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{isEn ? actionResult.message : actionResult.messageFa}</span>
            </div>
            {actionResult.pendingRebootRecommended && (
              <div className={`text-[11px] flex items-center gap-1.5 ${isLightMode ? 'text-amber-700' : 'text-amber-300'}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isEn
                    ? 'Windows requires a workstation restart for the new Pagefile allocation to take full effect in the kernel.'
                    : 'برای اعمال نهایی اندازه جدید Pagefile در هسته ویندوز، ریستارت سیستم کاربر توصیه می‌شود.'}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClearActionBanner}
            className={`text-[11px] px-2 py-1 rounded border cursor-pointer shrink-0 ${
              isLightMode ? 'border-emerald-300 text-emerald-700' : 'border-emerald-700 text-emerald-300'
            }`}
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-500 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className={isLightMode ? 'text-rose-800' : 'text-rose-200'}>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={onClearActionBanner}
            className={`text-[11px] px-2 py-1 rounded border cursor-pointer shrink-0 ${
              isLightMode ? 'border-rose-300 text-rose-700' : 'border-rose-700 text-rose-300'
            }`}
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {!data && !loading && !error && (
        <div className={`p-5 rounded-xl border text-center text-xs space-y-1.5 ${subSurfaceBg}`}>
          <div className={`font-semibold ${textPrimary}`}>
            {isEn ? 'Virtual Memory Telemetry Not Loaded Yet' : 'اطلاعات حافظه مجازی هنوز بارگذاری نشده است'}
          </div>
          <p className={textMuted}>
            {isEn
              ? 'Click "Refresh Virtual Memory" above to inspect Physical RAM, active Pagefile/Swap allocations, and eligible drives.'
              : 'برای مشاهده وضعیت رم، فایل‌های Pagefile/Swap و اختصاص فضای هارد به عنوان رم، دکمه «بروزرسانی حافظه مجازی» را بزنید.'}
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 text-xs">
            <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={textMuted}>{isEn ? 'Physical RAM Installed' : 'رم فیزیکی نصب‌شده'}</span>
                <Cpu className="w-4 h-4 text-sky-500 shrink-0" />
              </div>
              <div className={`mt-1 text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                {data.physicalRamTotalGb} GB
              </div>
              <div className={`mt-1 text-[11px] font-mono ${textMuted}`}>
                {isEn
                  ? `Used ${data.physicalRamUsedMb.toLocaleString()} · Free ${data.physicalRamFreeMb.toLocaleString()} MB`
                  : `مصرف ${data.physicalRamUsedMb.toLocaleString()} · آزاد ${data.physicalRamFreeMb.toLocaleString()} MB`}
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={textMuted}>
                  {data.osFamily === 'windows'
                    ? isEn
                      ? 'Active Pagefile Allocated'
                      : 'حجم فعلی Pagefile (رم مجازی)'
                    : isEn
                    ? 'Active Linux Swap Allocated'
                    : 'حجم فعلی Swap لینوکس'}
                </span>
                <HardDrive className="w-4 h-4 text-violet-500 shrink-0" />
              </div>
              <div className={`mt-1 text-xl font-bold font-mono tabular-nums text-violet-500`}>
                {data.totalVirtualAllocatedMb >= 1024
                  ? `${(data.totalVirtualAllocatedMb / 1024).toFixed(2)} GB`
                  : `${data.totalVirtualAllocatedMb} MB`}
              </div>
              <div className={`mt-1 text-[11px] font-mono ${textMuted}`}>
                {isEn
                  ? `Used ${data.totalVirtualUsedMb.toLocaleString()} MB across ${data.allocations.length} target(s)`
                  : `مصرف‌شده: ${data.totalVirtualUsedMb.toLocaleString()} MB در ${data.allocations.length} فایل/پارتیشن`}
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={textMuted}>{isEn ? 'Total Commit Memory' : 'مجموع حافظه در دسترس (RAM + دیسک)'}</span>
                <MemoryStick className="w-4 h-4 text-emerald-500 shrink-0" />
              </div>
              <div className={`mt-1 text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                {(data.commitLimitMb / 1024).toFixed(2)} GB
              </div>
              <div className={`mt-1 text-[11px] font-mono ${textMuted}`}>
                {isEn
                  ? `Committed: ${data.commitTotalMb.toLocaleString()} / ${data.commitLimitMb.toLocaleString()} MB`
                  : `مصرف Commit: ${data.commitTotalMb.toLocaleString()} از ${data.commitLimitMb.toLocaleString()} MB`}
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border ${subSurfaceBg}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={textMuted}>
                  {data.osFamily === 'windows'
                    ? isEn
                      ? 'Management Mode'
                      : 'حالت مدیریت حافظه مجازی'
                    : isEn
                    ? 'Kernel Swappiness'
                    : 'ضریب Swappiness کرنل'}
                </span>
                <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {data.osFamily === 'windows' ? (
                  <span
                    className={`px-2 py-0.5 rounded border text-xs font-bold ${
                      data.automaticManagedPagefile
                        ? isLightMode
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : isLightMode
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    }`}
                  >
                    {data.automaticManagedPagefile
                      ? isEn
                        ? 'Windows Auto-Managed'
                        : 'مدیریت خودکار ویندوز'
                      : isEn
                      ? 'Manual / Custom Config'
                      : 'تنظیم دستی / سفارشی'}
                  </span>
                ) : (
                  <span className={`text-xl font-bold font-mono tabular-nums ${textPrimary}`}>
                    {data.swappiness !== null ? data.swappiness : '—'}
                  </span>
                )}
              </div>
              <div className={`mt-1 text-[11px] font-mono ${textMuted}`}>
                {isEn
                  ? `Recommended: ${(data.recommendedMinMb / 1024).toFixed(1)}–${(data.recommendedMaxMb / 1024).toFixed(1)} GB`
                  : `پیشنهادی سیستم: ${(data.recommendedMinMb / 1024).toFixed(1)} تا ${(data.recommendedMaxMb / 1024).toFixed(1)} GB`}
              </div>
            </div>
          </div>

          {data.pendingRebootRecommended && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {isEn
                  ? 'Configured Pagefile size differs from live kernel allocation — restart the workstation to apply pending sizing.'
                  : 'اندازه تنظیم‌شده Pagefile با مقدار فعلی کرنل متفاوت است؛ برای اعمال نهایی اندازه جدید، سیستم باید ریستارت شود.'}
              </span>
            </div>
          )}

          {/* Active Allocations Table */}
          <div className="space-y-2">
            <div className={`text-xs font-bold ${textPrimary}`}>
              {data.osFamily === 'windows'
                ? isEn
                  ? 'Configured & Active Windows Pagefiles'
                  : 'فایل‌های Pagefile فعال و تنظیم‌شده روی درایوها'
                : isEn
                ? 'Active Linux Swap Files & Partitions'
                : 'فضاهای Swap فعال روی سرور/سیستم لینوکس'}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs border-collapse">
                <thead className={isLightMode ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/90 text-slate-400'}>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Drive / Path' : 'درایو / مسیر'}</th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Mode / Type' : 'نوع و حالت'}</th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Configured Range' : 'محدوده تنظیم‌شده'}</th>
                    <th className="py-2.5 px-3 text-start">{isEn ? 'Active & Peak Usage' : 'حجم فعال و میزان مصرف'}</th>
                    <th className="py-2.5 px-3 text-center">{isEn ? 'Manage' : 'مدیریت'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
                  {data.allocations.map((al) => (
                    <tr key={al.id}>
                      <td className={`py-2.5 px-3 font-mono ${textPrimary}`} dir="ltr">
                        <div className="font-bold flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                          <span>{al.filePath}</span>
                        </div>
                        <div className={`text-[10px] ${textMuted}`}>
                          {al.driveOrMount}
                          {al.tempPageFile ? (isEn ? ' · Temporary' : ' · موقت') : ''}
                          {data.osFamily === 'linux' && al.persistentInFstab
                            ? isEn
                              ? ' · Persistent (/etc/fstab)'
                              : ' · دائمی در fstab'
                            : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                            al.managementMode === 'custom_size'
                              ? isLightMode
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : isLightMode
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {al.kind === 'swap_partition'
                            ? isEn
                              ? 'Swap Partition'
                              : 'پارتیشن Swap'
                            : al.kind === 'zram'
                            ? 'ZRAM'
                            : al.kind === 'swap_file'
                            ? isEn
                              ? 'Swap File'
                              : 'فایل Swap'
                            : al.managementMode === 'automatic'
                            ? isEn
                              ? 'Windows Auto'
                              : 'خودکار ویندوز'
                            : al.managementMode === 'system_managed'
                            ? isEn
                              ? 'System Managed'
                              : 'تنظیم سیستمی'
                            : isEn
                            ? 'Custom Size'
                            : 'حجم سفارشی'}
                        </span>
                      </td>
                      <td className={`py-2.5 px-3 font-mono tabular-nums ${textPrimary}`} dir="ltr">
                        {al.managementMode === 'custom_size' || data.osFamily === 'linux'
                          ? `${al.initialSizeMb.toLocaleString()} – ${al.maximumSizeMb.toLocaleString()} MB`
                          : isEn
                          ? 'System Managed'
                          : 'خودکار'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-1 min-w-[160px]">
                          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                            <span className={textPrimary}>
                              {al.currentUsedMb} / {al.currentAllocatedMb} MB
                            </span>
                            <span className={textMuted}>
                              {isEn ? 'Peak' : 'اوج'}: {al.peakUsedMb} MB ({al.usagePercent}%)
                            </span>
                          </div>
                          <div className={`h-1.5 w-full rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${Math.max(al.usagePercent > 0 ? 4 : 0, al.usagePercent)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {!al.removable ? (
                          <span className={`text-[11px] ${textMuted}`}>
                            {isEn ? 'Managed by OS' : 'سیستمی'}
                          </span>
                        ) : confirmRemoveId === al.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={!canExecuteActions || busy}
                              onClick={async () => {
                                setConfirmRemoveId(null);
                                await onManage({
                                  action: 'remove_drive',
                                  driveOrMount: al.driveOrMount,
                                  filePath: al.filePath,
                                });
                              }}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              {isEn ? 'Confirm' : 'تأیید حذف'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(null)}
                              className={`px-2 py-1 rounded border text-[10px] cursor-pointer ${
                                isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'
                              }`}
                            >
                              {isEn ? 'Cancel' : 'انصراف'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={!canExecuteActions || busy}
                            onClick={() => setConfirmRemoveId(al.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                          >
                            {!canExecuteActions ? <Lock className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                            <span>{isEn ? 'Remove' : 'حذف / غیرفعال'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.allocations.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`py-5 text-center ${textMuted}`}>
                        {isEn
                          ? 'No Pagefile or Swap allocation is currently configured on this endpoint.'
                          : 'در حال حاضر هیچ فایل Pagefile یا فضای Swap روی این سیستم تنظیم نشده است.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Allocation Builder Form */}
          <form onSubmit={handleApplyAllocation} className={`p-4 rounded-xl border space-y-4 ${subSurfaceBg}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <span className={`text-xs font-bold ${textPrimary}`}>
                  {isEn
                    ? 'Allocate Hard Drive / SSD Space as Virtual RAM'
                    : 'تخصیص یا تغییر میزان فضای هارد به عنوان رم مجازی'}
                </span>
              </div>
              {activeDriveMeta && (
                <span className={`text-[11px] font-mono ${textMuted}`}>
                  {isEn ? 'Drive Free:' : 'فضای آزاد درایو:'}{' '}
                  <strong className="text-emerald-500">
                    {activeDriveMeta.freeGb} GB ({activeDriveMeta.freeMb.toLocaleString()} MB)
                  </strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className={`block font-semibold mb-1 ${textMuted}`}>
                  {data.osFamily === 'windows'
                    ? isEn
                      ? 'Target NTFS Drive'
                      : 'درایو هدف (NTFS)'
                    : isEn
                    ? 'Target Mount Directory'
                    : 'مسیر مانت هدف'}
                </label>
                <select
                  value={selectedDrive}
                  onChange={(e) => setSelectedDrive(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  {(data.eligibleDrives || []).map((d) => (
                    <option key={d.driveOrMount} value={d.driveOrMount}>
                      {d.driveOrMount} {d.label ? `(${d.label})` : ''} — {isEn ? 'Free' : 'آزاد'}: {d.freeGb} GB [{d.fileSystem}]
                    </option>
                  ))}
                </select>
              </div>

              {data.osFamily === 'windows' && (
                <div>
                  <label className={`block font-semibold mb-1 ${textMuted}`}>
                    {isEn ? 'Allocation Mode on Drive' : 'نحوه تخصیص روی درایو'}
                  </label>
                  <select
                    value={winMode}
                    onChange={(e) => setWinMode(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${inputCls}`}
                  >
                    <option value="custom_size">
                      {isEn ? 'Custom Size (Initial / Maximum MB)' : 'تعیین دستی میزان فضا (MB)'}
                    </option>
                    <option value="system_managed_drive">
                      {isEn ? 'System-Managed Size on This Drive' : 'اندازه خودکار ویندوز روی همین درایو'}
                    </option>
                  </select>
                </div>
              )}

              {(data.osFamily === 'linux' || winMode === 'custom_size') && (
                <>
                  <div>
                    <label className={`block font-semibold mb-1 ${textMuted}`}>
                      {data.osFamily === 'windows'
                        ? isEn
                          ? 'Initial Size (MB)'
                          : 'حجم اولیه / پایه (مگابایت)'
                        : isEn
                        ? 'Swap File Size (MB)'
                        : 'حجم فایل Swap (مگابایت)'}
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={1048576}
                      value={initialMbInput}
                      onChange={(e) => {
                        setInitialMbInput(e.target.value);
                        if (data.osFamily === 'linux') setMaxMbInput(e.target.value);
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                    />
                    <div className={`text-[10px] font-mono mt-0.5 ${textMuted}`}>
                      ≈ {fmtMbToSmart(parsedInit, isEn)}
                    </div>
                  </div>

                  {data.osFamily === 'windows' && (
                    <div>
                      <label className={`block font-semibold mb-1 ${textMuted}`}>
                        {isEn ? 'Maximum Size (MB)' : 'حداکثر حجم مجاز (مگابایت)'}
                      </label>
                      <input
                        type="number"
                        min={16}
                        max={1048576}
                        value={maxMbInput}
                        onChange={(e) => setMaxMbInput(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-mono outline-none ${inputCls}`}
                      />
                      <div className={`text-[10px] font-mono mt-0.5 ${textMuted}`}>
                        ≈ {fmtMbToSmart(parsedMax, isEn)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Presets & Linux Persistence */}
            {(data.osFamily === 'linux' || winMode === 'custom_size') && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={textMuted}>{isEn ? 'Quick Presets:' : 'مقادیر آماده:'}</span>
                  {[
                    {
                      label: isEn ? '1× RAM' : '۱ برابر رم',
                      init: data.physicalRamTotalMb || 4096,
                      max: data.physicalRamTotalMb || 4096,
                    },
                    {
                      label: isEn ? '1.5× RAM (Recommended)' : '۱.۵ برابر رم (پیشنهادی)',
                      init: data.recommendedMinMb || 4096,
                      max: data.recommendedMaxMb || 8192,
                    },
                    { label: '4 GB', init: 4096, max: 4096 },
                    { label: '8 GB', init: 8192, max: 8192 },
                    { label: '16 GB', init: 16384, max: 16384 },
                    { label: '32 GB', init: 32768, max: 32768 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPresetMb(preset.init, preset.max)}
                      className={`px-2.5 py-1 rounded-md border font-mono transition cursor-pointer ${
                        isLightMode
                          ? 'bg-white hover:bg-sky-50 border-slate-300 text-slate-700'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {data.osFamily === 'linux' && (
                  <label className={`inline-flex items-center gap-2 text-xs cursor-pointer ${textPrimary}`}>
                    <input
                      type="checkbox"
                      checked={linuxPersistent}
                      onChange={(e) => setLinuxPersistent(e.target.checked)}
                      className="rounded border-slate-400"
                    />
                    <span>{isEn ? 'Persist swap in /etc/fstab on boot' : 'ثبت دائمی در /etc/fstab هنگام بوت'}</span>
                  </label>
                )}
              </div>
            )}

            {spaceValidationError && (
              <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-500 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{spaceValidationError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className={`text-[11px] ${textMuted}`}>
                {data.osFamily === 'windows'
                  ? isEn
                    ? 'Tip: For equal Initial & Maximum size, Windows pre-allocates a fixed contiguous pagefile.sys without fragmentation.'
                    : 'نکته: اگر مقدار Initial و Maximum برابر باشد، فایل pagefile.sys بدون تکه شدن (Fragmentation) با حداکثر سرعت ایجاد می‌شود.'
                  : isEn
                  ? 'Linux swapfile is activated immediately with swapon without requiring a reboot.'
                  : 'در لینوکس فضای Swap بلافاصله بدون نیاز به ریستارت فعال و به رم سیستم اضافه می‌شود.'}
              </div>

              <button
                type="submit"
                disabled={!canExecuteActions || busy || !activeDriveMeta || Boolean(spaceValidationError)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : !canExecuteActions ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <MemoryStick className="w-3.5 h-3.5" />
                )}
                <span>
                  {data.osFamily === 'windows'
                    ? winMode === 'system_managed_drive'
                      ? isEn
                        ? 'Apply System-Managed Drive'
                        : 'اعمال حالت خودکار روی درایو'
                      : isEn
                      ? 'Allocate Disk as Virtual RAM'
                      : 'ثبت و تخصیص هارد به عنوان رم'
                    : isEn
                    ? 'Create & Activate Swap File'
                    : 'ساخت و فعال‌سازی فایل Swap'}
                </span>
              </button>
            </div>
          </form>

          {/* Linux vm.swappiness Quick Tuner */}
          {data.osFamily === 'linux' && (
            <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${subSurfaceBg}`}>
              <div>
                <div className={`font-bold ${textPrimary}`}>
                  {isEn ? 'Linux Kernel Swappiness (vm.swappiness)' : 'تنظیم ضریب استفاده از Swap در لینوکس (vm.swappiness)'}
                </div>
                <div className={`text-[11px] ${textMuted}`}>
                  {isEn
                    ? '0–10: Prefer physical RAM strongly (recommended for servers/SSD); 60: Desktop default; 100: Aggressive swap.'
                    : '۰ تا ۱۰: اولویت حداکثری با رم فیزیکی (مناسب سرور/SSD) · ۳۰: متعادل · ۶۰: پیش‌فرض دسکتاپ.'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[10, 30, 60].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSwappinessInput(String(val))}
                    className={`px-2 py-1 rounded border font-mono text-[11px] cursor-pointer ${
                      swappinessInput === String(val)
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLightMode
                        ? 'bg-white border-slate-300 text-slate-700'
                        : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={swappinessInput}
                  onChange={(e) => setSwappinessInput(e.target.value)}
                  className={`w-20 px-2.5 py-1.5 rounded-lg border font-mono text-xs outline-none ${inputCls}`}
                />
                <button
                  type="button"
                  disabled={!canExecuteActions || busy}
                  onClick={() =>
                    onManage({
                      action: 'set_swappiness',
                      swappiness: Math.max(0, Math.min(100, Math.round(Number(swappinessInput) || 0))),
                      persistent: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                >
                  {isEn ? 'Apply Swappiness' : 'اعمال ضریب'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
