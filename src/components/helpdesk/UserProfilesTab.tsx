import React, { useMemo, useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  HardDrive,
  Trash2,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Lock,
  FolderOpen,
  Download,
  FileJson,
  Search,
  Wrench,
  Unplug,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Layers,
} from 'lucide-react';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { TimeoutAntivirusHint } from './TimeoutAntivirusHint';
import {
  HelpdeskProfileActionType,
  HelpdeskUserProfileItem,
  HelpdeskUserProfilesResult,
} from '../../services/api';

export interface UserProfilesTabProps {
  isLightMode: boolean;
  isEn: boolean;
  targetIp: string;
  canRunDiagnostics: boolean;
  canExecuteActions: boolean;
  data: HelpdeskUserProfilesResult | null;
  loading: boolean;
  error: string | null;
  actionResult: any | null;
  actionError: string | null;
  busyKey: string | null;
  onRefresh: () => void;
  onClearActionBanner: () => void;
  onProfileAction: (params: {
    action: HelpdeskProfileActionType;
    profileSid: string;
    profileUsername: string;
  }) => Promise<void>;
  onGoToAntivirus?: () => void;
}

type ProfileFilterMode = 'all' | 'active_loaded' | 'domain' | 'local' | 'attention';
type ProfileSortMode = 'size_desc' | 'size_asc' | 'temp_desc' | 'last_used' | 'name_asc';

function formatBytesSmart(bytes: number, isEn: boolean): string {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= 1024 * 1024 * 1024) {
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} ${isEn ? 'GB' : 'گیگابایت'}`;
  }
  if (b >= 1024 * 1024) {
    return `${(b / (1024 * 1024)).toFixed(1)} ${isEn ? 'MB' : 'مگابایت'}`;
  }
  if (b >= 1024) {
    return `${(b / 1024).toFixed(0)} KB`;
  }
  return `${b} B`;
}

function formatDateCompact(iso: string | null | undefined, isEn: boolean): string {
  if (!iso) return isEn ? 'Unknown' : 'نامشخص';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

const SEGMENT_COLORS = [
  'bg-sky-500',
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500',
];

const FOLDER_BAR_COLORS: Record<string, string> = {
  appdata: 'bg-indigo-500',
  downloads: 'bg-amber-500',
  documents: 'bg-emerald-500',
  desktop: 'bg-sky-500',
  temp: 'bg-rose-500',
  media_other: 'bg-slate-400',
};

export const UserProfilesTab: React.FC<UserProfilesTabProps> = ({
  isLightMode,
  isEn,
  targetIp,
  canRunDiagnostics,
  canExecuteActions,
  data,
  loading,
  error,
  actionResult,
  actionError,
  busyKey,
  onRefresh,
  onClearActionBanner,
  onProfileAction,
  onGoToAntivirus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<ProfileFilterMode>('all');
  const [sortMode, setSortMode] = useState<ProfileSortMode>('size_desc');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCleanId, setConfirmCleanId] = useState<string | null>(null);

  const surfaceBg = isLightMode
    ? 'bg-white border-slate-200 shadow-xs'
    : 'bg-slate-900/80 border-slate-800 shadow-sm';
  const subSurfaceBg = isLightMode
    ? 'bg-slate-50 border-slate-200/90'
    : 'bg-slate-950/60 border-slate-800/90';
  const textPrimary = isLightMode ? 'text-slate-900' : 'text-slate-100';
  const textMuted = isLightMode ? 'text-slate-600' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
    : 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-sky-500';

  const profiles = data?.profiles || [];

  const stats = useMemo(() => {
    let domainCount = 0;
    let localCount = 0;
    let attentionCount = 0;
    let loadedCount = 0;
    for (const p of profiles) {
      if (p.accountType === 'domain') domainCount++;
      else if (p.accountType === 'local') localCount++;
      if (p.isLoaded || p.isActiveLoggedIn) loadedCount++;
      if (
        p.hasBakRegistryKey ||
        p.isTemporaryProfile ||
        p.statusCode === 'bak_corrupt' ||
        p.statusCode === 'temp_profile' ||
        p.statusCode === 'orphan_folder' ||
        p.statusCode === 'missing_folder'
      ) {
        attentionCount++;
      }
    }
    return { domainCount, localCount, attentionCount, loadedCount };
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = profiles.filter((p) => {
      if (filterMode === 'active_loaded' && !p.isActiveLoggedIn && !p.isLoaded) return false;
      if (filterMode === 'domain' && p.accountType !== 'domain') return false;
      if (filterMode === 'local' && p.accountType !== 'local' && p.accountType !== 'system') return false;
      if (
        filterMode === 'attention' &&
        !p.hasBakRegistryKey &&
        !p.isTemporaryProfile &&
        p.statusCode !== 'bak_corrupt' &&
        p.statusCode !== 'temp_profile' &&
        p.statusCode !== 'orphan_folder' &&
        p.statusCode !== 'missing_folder'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.username.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.sid.toLowerCase().includes(q) ||
        p.profilePath.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortMode === 'size_desc') return b.sizeBytes - a.sizeBytes;
      if (sortMode === 'size_asc') return a.sizeBytes - b.sizeBytes;
      if (sortMode === 'temp_desc') return b.reclaimableTempBytes - a.reclaimableTempBytes;
      if (sortMode === 'name_asc') return a.username.localeCompare(b.username);
      if (sortMode === 'last_used') {
        const ta = a.lastUseTime ? new Date(a.lastUseTime).getTime() : 0;
        const tb = b.lastUseTime ? new Date(b.lastUseTime).getTime() : 0;
        return tb - ta;
      }
      return 0;
    });
    return list;
  }, [profiles, filterMode, sortMode, searchQuery]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'Username',
      'AccountType',
      'SID',
      'ProfilePath',
      'Status',
      'ActiveLoggedIn',
      'Loaded',
      'TotalSizeMB',
      'ReclaimableTempMB',
      'NTUSER_DAT_MB',
      'FileCount',
      'LastUseTime',
    ];
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = profiles.map((p) =>
      [
        p.username,
        p.accountType,
        p.sid,
        p.profilePath,
        p.statusCode,
        p.isActiveLoggedIn ? 'Yes' : 'No',
        p.isLoaded ? 'Yes' : 'No',
        p.sizeMb,
        p.reclaimableTempMb,
        p.ntUserDatSizeMb ?? '',
        p.fileCount,
        p.lastUseTime || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_profiles_${data.hostname || targetIp || 'endpoint'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_profiles_${data.hostname || targetIp || 'endpoint'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (p: HelpdeskUserProfileItem) => {
    if (p.isActiveLoggedIn) {
      return {
        label: isEn ? 'Active Session' : 'لاگین فعال',
        cls: isLightMode
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      };
    }
    if (p.statusCode === 'temp_profile' || p.isTemporaryProfile) {
      return {
        label: isEn ? 'Temporary Profile!' : 'پروفایل موقت (TEMP)!',
        cls: isLightMode
          ? 'bg-rose-50 text-rose-700 border-rose-300'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    }
    if (p.statusCode === 'bak_corrupt' || p.hasBakRegistryKey) {
      return {
        label: isEn ? '.bak Registry Issue' : 'خطای کلید .bak',
        cls: isLightMode
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    }
    if (p.statusCode === 'orphan_folder') {
      return {
        label: isEn ? 'Orphan Folder' : 'پوشه رهاشده (بدون رجیستری)',
        cls: isLightMode
          ? 'bg-orange-50 text-orange-800 border-orange-300'
          : 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      };
    }
    if (p.statusCode === 'missing_folder') {
      return {
        label: isEn ? 'Missing Folder' : 'پوشه حذف‌شده',
        cls: isLightMode
          ? 'bg-slate-100 text-slate-700 border-slate-300'
          : 'bg-slate-800 text-slate-300 border-slate-700',
      };
    }
    if (p.isLoaded) {
      return {
        label: isEn ? 'Hive Loaded' : 'هایو لودشده',
        cls: isLightMode
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      };
    }
    if (p.roamingConfigured) {
      return {
        label: isEn ? 'Roaming' : 'پروفایل Roaming',
        cls: isLightMode
          ? 'bg-violet-50 text-violet-700 border-violet-200'
          : 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      };
    }
    return {
      label: isEn ? 'Healthy' : 'سالم (غیرفعال)',
      cls: isLightMode
        ? 'bg-slate-100 text-slate-700 border-slate-200'
        : 'bg-slate-800/80 text-slate-300 border-slate-700',
    };
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div
        id="hd-section-user-profiles"
        className={`scroll-mt-4 rounded-xl border p-4 sm:p-5 space-y-5 ${surfaceBg}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" />
              <h2 className={`text-sm font-bold ${textPrimary}`}>
                {isEn
                  ? 'Workstation User Profiles & Storage Manager'
                  : 'مدیریت پروفایل‌های کاربران و حجم اشغالی سیستم'}
              </h2>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                fieldName={isEn ? 'Workstation User Profiles' : 'مدیریت پروفایل‌های این سیستم'}
                whatIsIt={
                  isEn
                    ? 'Lists every Windows Registry ProfileList (S-1-5-21-*) or Linux /home profile stored on this endpoint, including real folder disk footprint (Desktop, Documents, Downloads, AppData, Temp), .bak/TEMP corruption status, and NTUSER.DAT size.'
                    : 'تمامی پروفایل‌های کاربری ثبت‌شده روی این سیستم (شامل کاربران دامین، محلی، پوشه‌های رهاشده بدون رجیستری و پروفایل‌های خراب .bak/TEMP) را به همراه میزان دقیق فضای اشغالی هر پوشه و امکان پاک‌سازی یا حذف ایمن نمایش می‌دهد.'
                }
                whyNeeded={
                  isEn
                    ? 'Former employees or bloated browser/AppData caches frequently consume tens of gigabytes on drive C:, and corrupted .bak registry entries lock users into Temporary Profiles.'
                    : 'پروفایل‌های کاربران قبلی یا فایل‌های کش انباشته‌شده بخش بزرگی از درایو C را پر می‌کنند و کلیدهای خراب .bak باعث ورود کاربر با پروفایل موقت (Temporary Profile) و از دست رفتن تنظیمات ظاهری می‌شوند.'
                }
                example={
                  isEn
                    ? 'ACME\\j.doe · 14.8 GB total (Temp 2.1 GB reclaimable) · Clean Temp or Safe Delete'
                    : 'کاربر ACME\\a.rezaei · مجموع ۱۴.۸ گیگابایت (۲.۱ گیگابایت Temp قابل آزادسازی) ← پاک‌سازی کش یا حذف کامل پروفایل'
                }
              />
            </div>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {isEn
                ? 'Inspect every profile disk footprint, reclaimable cache, registry hive status, and safely clean temp, fix .bak temp profiles, or remove old profiles.'
                : 'مشاهده حجم دقیق تک‌تک پروفایل‌های سیستم، تفکیک پوشه‌ها، پاک‌سازی Temp/کش هر کاربر، تعمیر پروفایل موقت (.bak) و حذف ایمن پروفایل‌های بلااستفاده.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data && profiles.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJson}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                    isLightMode
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                >
                  <FileJson className="w-3.5 h-3.5 text-sky-500" />
                  <span>JSON</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={!canRunDiagnostics || loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{isEn ? 'Scan User Profiles' : 'اسکن و بروزرسانی پروفایل‌ها'}</span>
            </button>
          </div>
        </div>

        {/* Error & Timeout Hint */}
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

        {/* Action Banners */}
        {actionResult && (
          <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 font-bold text-emerald-500">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{isEn ? actionResult.message : actionResult.messageFa}</span>
              </div>
              {actionResult.rawOutput && (
                <div className={`font-mono text-[11px] ${textMuted}`} dir="ltr">
                  {actionResult.rawOutput}
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
            <div className="flex items-start gap-2 min-w-0">
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

        {loading && !data && (
          <div className={`p-8 rounded-xl border text-center space-y-2 ${subSurfaceBg}`}>
            <Loader2 className="w-6 h-6 text-sky-500 animate-spin mx-auto" />
            <div className={`text-xs font-semibold ${textPrimary}`}>
              {isEn
                ? 'Enumerating user profiles & measuring directory footprints...'
                : 'در حال اسکن پروفایل‌های کاربران و محاسبه دقیق حجم پوشه‌ها...'}
            </div>
            <div className={`text-[11px] ${textMuted}`}>
              {isEn
                ? 'Large profiles (many gigabytes) may take up to ~30 seconds to calculate cleanly.'
                : 'برای پروفایل‌های پرحجم ممکن است محاسبه دقیق حجم چند ثانیه زمان ببرد.'}
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className={`p-6 rounded-xl border text-center text-xs space-y-2 ${subSurfaceBg}`}>
            <Users className="w-7 h-7 text-sky-500 mx-auto opacity-80" />
            <div className={`font-semibold ${textPrimary}`}>
              {isEn ? 'User Profiles Inventory Not Loaded Yet' : 'اطلاعات پروفایل‌های این سیستم هنوز دریافت نشده است'}
            </div>
            <p className={textMuted}>
              {isEn
                ? 'Click "Connect & Inspect" at the top or "Scan User Profiles" to inspect every account stored on this endpoint.'
                : 'برای مشاهده لیست پروفایل‌های این سیستم، حجم اشغال‌شده هر کاربر و مدیریت آن‌ها، دکمه «اسکن و بروزرسانی پروفایل‌ها» را بزنید.'}
            </p>
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 text-xs">
              <div className={`p-4 rounded-xl border ${subSurfaceBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={textMuted}>{isEn ? 'Discovered Profiles' : 'تعداد کل پروفایل‌ها'}</span>
                  <Users className="w-4 h-4 text-sky-500 shrink-0" />
                </div>
                <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${textPrimary}`}>
                  {profiles.length}
                </div>
                <div className={`mt-1 text-[11px] ${textMuted}`}>
                  {isEn
                    ? `${stats.domainCount} Domain · ${stats.localCount} Local · ${stats.loadedCount} Loaded`
                    : `${stats.domainCount} دامینی · ${stats.localCount} محلی · ${stats.loadedCount} فعال/لودشده`}
                </div>
              </div>

              <div className={`p-4 rounded-xl border ${subSurfaceBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={textMuted}>{isEn ? 'Total Profiles Size' : 'مجموع حجم پروفایل‌ها'}</span>
                  <HardDrive className="w-4 h-4 text-indigo-500 shrink-0" />
                </div>
                <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${textPrimary}`}>
                  {formatBytesSmart(data.totalProfilesSizeBytes, isEn)}
                </div>
                <div className={`mt-1 text-[11px] font-mono tabular-nums ${textMuted}`}>
                  {data.osDriveTotalGb > 0
                    ? isEn
                      ? `OS Drive Free: ${data.osDriveFreeGb} / ${data.osDriveTotalGb} GB`
                      : `فضای آزاد درایو سیستم: ${data.osDriveFreeGb} از ${data.osDriveTotalGb} GB`
                    : data.hostname}
                </div>
              </div>

              <div className={`p-4 rounded-xl border ${subSurfaceBg}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={textMuted}>{isEn ? 'Reclaimable Temp & Cache' : 'حجم Temp و کش قابل آزادسازی'}</span>
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                </div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-500">
                  {data.totalReclaimableTempMb >= 1024
                    ? `${(data.totalReclaimableTempMb / 1024).toFixed(2)} ${isEn ? 'GB' : 'گیگابایت'}`
                    : `${data.totalReclaimableTempMb} ${isEn ? 'MB' : 'مگابایت'}`}
                </div>
                <div className={`mt-1 text-[11px] ${textMuted}`}>
                  {isEn ? 'AppData Temp, INetCache & Browser Caches' : 'فایل‌های Temp و کش مرورگرها در پروفایل‌ها'}
                </div>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  stats.attentionCount > 0
                    ? isLightMode
                      ? 'bg-rose-50/70 border-rose-200'
                      : 'bg-rose-950/20 border-rose-500/35'
                    : subSurfaceBg
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={textMuted}>{isEn ? 'Health / .bak Alerts' : 'هشدار پروفایل / .bak'}</span>
                  {stats.attentionCount > 0 ? (
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </div>
                <div
                  className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
                    stats.attentionCount > 0 ? 'text-rose-500' : 'text-emerald-500'
                  }`}
                >
                  {stats.attentionCount}
                </div>
                <div className={`mt-1 text-[11px] ${textMuted}`}>
                  {stats.attentionCount > 0
                    ? isEn
                      ? '.bak, TEMP, missing or orphan folders'
                      : 'پروفایل موقت، کلید .bak یا پوشه رهاشده'
                    : isEn
                    ? 'All profile registry keys look healthy'
                    : 'تمامی کلیدهای پروفایل سالم هستند'}
                </div>
              </div>
            </div>

            {/* Proportional Disk Share Visual Bar */}
            {profiles.length > 0 && data.totalProfilesSizeBytes > 0 && (
              <div className={`p-4 rounded-xl border space-y-2.5 ${subSurfaceBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <Layers className="w-3.5 h-3.5 text-sky-500" />
                    <span className={textPrimary}>
                      {isEn ? 'Disk Space Distribution by Profile' : 'سهم هر پروفایل از کل فضای مصرف‌شده'}
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${textMuted}`}>
                    {data.hostname} {data.domain ? `(${data.domain})` : ''}
                  </span>
                </div>

                <div className={`h-3 w-full rounded-full overflow-hidden flex ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                  {profiles.slice(0, 7).map((p, idx) => {
                    const pct = (p.sizeBytes / data.totalProfilesSizeBytes) * 100;
                    if (pct <= 0.4) return null;
                    return (
                      <div
                        key={p.id}
                        style={{ width: `${pct}%` }}
                        className={`${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]} h-full transition-all border-r border-white/20 last:border-r-0`}
                        title={`${p.username}: ${formatBytesSmart(p.sizeBytes, isEn)} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  {profiles.slice(0, 6).map((p, idx) => {
                    const pct =
                      data.totalProfilesSizeBytes > 0
                        ? ((p.sizeBytes / data.totalProfilesSizeBytes) * 100).toFixed(1)
                        : '0.0';
                    return (
                      <div key={`legend-${p.id}`} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-xs ${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}`} />
                        <span dir="ltr" className={`font-mono font-medium ${textPrimary}`}>
                          {p.shortName}
                        </span>
                        <span className={`font-mono ${textMuted}`}>
                          ({formatBytesSmart(p.sizeBytes, isEn)} · {pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search, Filter & Sort Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', en: `All (${profiles.length})`, fa: `همه (${profiles.length})` },
                    { id: 'active_loaded', en: `Active / Loaded (${stats.loadedCount})`, fa: `فعال / لودشده (${stats.loadedCount})` },
                    { id: 'domain', en: `Domain (${stats.domainCount})`, fa: `دامین (${stats.domainCount})` },
                    { id: 'local', en: `Local (${stats.localCount})`, fa: `محلی (${stats.localCount})` },
                    { id: 'attention', en: `Alerts (${stats.attentionCount})`, fa: `هشدارها (${stats.attentionCount})` },
                  ] as Array<{ id: ProfileFilterMode; en: string; fa: string }>
                ).map((f) => {
                  const active = filterMode === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilterMode(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                        active
                          ? 'bg-sky-600 text-white border-sky-500'
                          : isLightMode
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      {isEn ? f.en : f.fa}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className={`w-3.5 h-3.5 absolute top-2.5 ${isEn ? 'left-2.5' : 'right-2.5'} text-slate-400`} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isEn ? 'Search user, SID or path...' : 'جستجوی نام کاربر، SID یا مسیر...'}
                    className={`py-1.5 ${isEn ? 'pl-8 pr-3' : 'pr-8 pl-3'} rounded-lg border text-xs outline-none w-56 ${inputCls}`}
                  />
                </div>

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as ProfileSortMode)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  <option value="size_desc">{isEn ? 'Largest First' : 'پرحجم‌ترین (نزولی)'}</option>
                  <option value="size_asc">{isEn ? 'Smallest First' : 'کم‌حجم‌ترین (صعودی)'}</option>
                  <option value="temp_desc">{isEn ? 'Most Temp/Cache' : 'بیشترین Temp قابل پاک‌سازی'}</option>
                  <option value="last_used">{isEn ? 'Recently Used' : 'آخرین زمان استفاده'}</option>
                  <option value="name_asc">{isEn ? 'Username (A-Z)' : 'نام کاربری (الفبایی)'}</option>
                </select>
              </div>
            </div>

            {/* Profile List */}
            {filteredProfiles.length === 0 ? (
              <div className={`p-6 rounded-xl border text-center text-xs ${subSurfaceBg} ${textMuted}`}>
                {isEn
                  ? 'No user profiles match the current search or filter.'
                  : 'هیچ پروفایلی با فیلتر یا جستجوی انتخابی مطابقت ندارد.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProfiles.map((p) => {
                  const statusBadge = getStatusBadge(p);
                  const isExpanded = Boolean(expandedIds[p.id]);
                  const sharePct =
                    data.totalProfilesSizeBytes > 0
                      ? Math.min(100, (p.sizeBytes / data.totalProfilesSizeBytes) * 100)
                      : 0;
                  const isBusyClean = busyKey === `clean_temp:${p.id}`;
                  const isBusyRepair = busyKey === `repair_bak:${p.id}`;
                  const isBusyUnload = busyKey === `unload_hive:${p.id}`;
                  const isBusyDelete = busyKey === `delete_profile:${p.id}`;
                  const anyBusy = busyKey !== null;

                  return (
                    <div
                      key={p.id}
                      className={`rounded-xl border p-4 transition space-y-3 ${
                        p.hasBakRegistryKey || p.isTemporaryProfile
                          ? isLightMode
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-rose-950/15 border-rose-500/35'
                          : p.isActiveLoggedIn
                          ? isLightMode
                            ? 'bg-emerald-50/35 border-emerald-200'
                            : 'bg-emerald-950/15 border-emerald-500/30'
                          : subSurfaceBg
                      }`}
                    >
                      {/* Main Row Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.isActiveLoggedIn ? (
                              <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : p.statusCode === 'orphan_folder' ? (
                              <UserX className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                              <Users className="w-4 h-4 text-sky-500 shrink-0" />
                            )}

                            <span dir="ltr" className={`text-sm font-bold font-mono ${textPrimary}`}>
                              {p.username}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                p.accountType === 'domain'
                                  ? isLightMode
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                  : p.accountType === 'orphan'
                                  ? isLightMode
                                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                                    : 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                                  : isLightMode
                                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {p.accountType === 'domain'
                                ? isEn
                                  ? 'Domain Account'
                                  : 'اکانت دامینی'
                                : p.accountType === 'orphan'
                                ? isEn
                                  ? 'Orphan Folder'
                                  : 'پوشه بدون رجیستری'
                                : p.accountType === 'system'
                                ? isEn
                                  ? 'System'
                                  : 'سیستمی'
                                : isEn
                                ? 'Local Account'
                                : 'اکانت محلی'}
                            </span>

                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${statusBadge.cls}`}>
                              {statusBadge.label}
                            </span>

                            {p.isCurrentSessionUser && (
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                  isLightMode
                                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                                    : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                }`}
                              >
                                {isEn ? 'HelpDesk Auth User' : 'کاربر نشست فعلی'}
                              </span>
                            )}
                          </div>

                          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${textMuted}`}>
                            <span className="inline-flex items-center gap-1 font-mono" dir="ltr">
                              <FolderOpen className="w-3 h-3 text-amber-500 shrink-0" />
                              {p.profilePath || '-'}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono" dir="ltr">
                              <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                              {data.osFamily === 'windows' ? `SID: ${p.sid}` : `UID: ${p.uid ?? '-'}`}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3 text-sky-500 shrink-0" />
                              {isEn ? 'Last Used:' : 'آخرین استفاده:'} {formatDateCompact(p.lastUseTime, isEn)}
                            </span>
                            {p.ntUserDatSizeMb !== null && (
                              <span className="font-mono">
                                NTUSER.DAT: <strong className={textPrimary}>{p.ntUserDatSizeMb} MB</strong>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Footprint & Quick Actions */}
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-end">
                            <div className={`text-base font-bold font-mono tabular-nums ${textPrimary}`}>
                              {formatBytesSmart(p.sizeBytes, isEn)}
                            </div>
                            <div className={`text-[10px] font-mono tabular-nums ${textMuted}`}>
                              {sharePct.toFixed(1)}% {isEn ? 'of profiles' : 'از کل'} ·{' '}
                              {p.fileCount.toLocaleString()} {isEn ? 'files' : 'فایل'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleExpand(p.id)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                              isLightMode
                                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                            }`}
                          >
                            <span>{isEn ? 'Breakdown' : 'تفکیک پوشه‌ها'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Folder Size Proportional Mini Bar */}
                      {p.sizeBytes > 0 && (
                        <div className={`h-2 w-full rounded-full overflow-hidden flex ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          {p.folders
                            .filter((f) => f.key !== 'temp' && f.sizeBytes > 0)
                            .map((f) => {
                              const pct = (f.sizeBytes / p.sizeBytes) * 100;
                              if (pct < 0.5) return null;
                              return (
                                <div
                                  key={`${p.id}-bar-${f.key}`}
                                  style={{ width: `${pct}%` }}
                                  className={`${FOLDER_BAR_COLORS[f.key] || 'bg-slate-500'} h-full`}
                                  title={`${isEn ? f.labelEn : f.labelFa}: ${formatBytesSmart(f.sizeBytes, isEn)} (${pct.toFixed(1)}%)`}
                                />
                              );
                            })}
                        </div>
                      )}

                      {/* Expanded Folder Breakdown Cards */}
                      {isExpanded && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
                          {p.folders.map((f) => {
                            const fPct =
                              p.sizeBytes > 0 ? ((f.sizeBytes / p.sizeBytes) * 100).toFixed(1) : '0.0';
                            return (
                              <div
                                key={`${p.id}-${f.key}`}
                                className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                                  isLightMode
                                    ? 'bg-white border-slate-200'
                                    : 'bg-slate-900/90 border-slate-800'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${FOLDER_BAR_COLORS[f.key] || 'bg-slate-400'}`} />
                                  <span className={`font-semibold truncate ${textPrimary}`}>
                                    {isEn ? f.labelEn : f.labelFa}
                                  </span>
                                </div>
                                <div className={`font-mono font-bold tabular-nums ${textPrimary}`}>
                                  {formatBytesSmart(f.sizeBytes, isEn)}
                                </div>
                                <div className={`font-mono text-[10px] ${textMuted}`}>
                                  {f.key === 'temp'
                                    ? isEn
                                      ? 'Safe to clean'
                                      : 'قابل پاک‌سازی ایمن'
                                    : `${fPct}%`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Management Actions Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800/80">
                        <div className={`text-[11px] flex items-center gap-1.5 ${textMuted}`}>
                          {p.reclaimableTempBytes > 0 ? (
                            <span className="inline-flex items-center gap-1 text-amber-500 font-semibold font-mono">
                              <Sparkles className="w-3.5 h-3.5 shrink-0" />
                              {isEn
                                ? `Reclaimable Cache/Temp: ${formatBytesSmart(p.reclaimableTempBytes, isEn)}`
                                : `کش/Temp قابل پاک‌سازی: ${formatBytesSmart(p.reclaimableTempBytes, isEn)}`}
                            </span>
                          ) : (
                            <span>
                              {isEn ? 'Minimal temp cache in profile' : 'پوشه Temp این پروفایل کم‌حجم است'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Clean Temp/Cache */}
                          {p.pathExists && (
                            confirmCleanId === p.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={anyBusy}
                                  onClick={async () => {
                                    setConfirmCleanId(null);
                                    await onProfileAction({
                                      action: 'clean_temp',
                                      profileSid: p.sid,
                                      profileUsername: p.username,
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold transition cursor-pointer"
                                >
                                  {isEn ? 'Confirm Clean Temp' : 'تأیید پاک‌سازی Temp'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCleanId(null)}
                                  className={`px-2 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                                    isLightMode ? 'border-slate-300 text-slate-700' : 'border-slate-700 text-slate-300'
                                  }`}
                                >
                                  {isEn ? 'Cancel' : 'انصراف'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!canExecuteActions || anyBusy}
                                onClick={() => setConfirmCleanId(p.id)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                              >
                                {isBusyClean ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5" />
                                )}
                                <span>{isEn ? 'Clean Temp & Cache' : 'پاک‌سازی Temp و کش'}</span>
                              </button>
                            )
                          )}

                          {/* Repair .bak Profile Registry (Windows) */}
                          {data.osFamily === 'windows' && (p.hasBakRegistryKey || p.isTemporaryProfile) && (
                            <button
                              type="button"
                              disabled={!canExecuteActions || anyBusy || p.isActiveLoggedIn}
                              onClick={() =>
                                onProfileAction({
                                  action: 'repair_bak',
                                  profileSid: p.sid,
                                  profileUsername: p.username,
                                })
                              }
                              title={
                                p.isActiveLoggedIn
                                  ? isEn
                                    ? 'User must sign out before repairing .bak registry key'
                                    : 'کاربر باید ابتدا لاگ‌آوت کند تا کلید .bak تعمیر شود'
                                  : undefined
                              }
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                            >
                              {isBusyRepair ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Wrench className="w-3.5 h-3.5" />
                              )}
                              <span>{isEn ? 'Fix .bak Temp Profile' : 'تعمیر کلید .bak'}</span>
                            </button>
                          )}

                          {/* Unload Stuck Registry Hive (Windows) */}
                          {data.osFamily === 'windows' &&
                            p.isLoaded &&
                            !p.isActiveLoggedIn &&
                            !p.isCurrentSessionUser && (
                              <button
                                type="button"
                                disabled={!canExecuteActions || anyBusy}
                                onClick={() =>
                                  onProfileAction({
                                    action: 'unload_hive',
                                    profileSid: p.sid,
                                    profileUsername: p.username,
                                  })
                                }
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                              >
                                {isBusyUnload ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Unplug className="w-3.5 h-3.5" />
                                )}
                                <span>{isEn ? 'Unload Hive' : 'آزادسازی Hive'}</span>
                              </button>
                            )}

                          {/* Safe Delete Profile */}
                          {p.isProtected ? (
                            <span
                              title={isEn ? p.protectionReasonEn : p.protectionReasonFa}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium opacity-75 ${
                                isLightMode
                                  ? 'bg-slate-100 border-slate-200 text-slate-600'
                                  : 'bg-slate-800/80 border-slate-700 text-slate-400'
                              }`}
                            >
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>{isEn ? 'Protected' : 'محافظت‌شده'}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!canExecuteActions || anyBusy}
                              onClick={() => setConfirmDeleteId((prev) => (prev === p.id ? null : p.id))}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-semibold transition disabled:opacity-50 cursor-pointer"
                            >
                              {isBusyDelete ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : !canExecuteActions ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              <span>{isEn ? 'Delete Profile' : 'حذف پروفایل'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step-2 Explicit Confirmation Box for Profile Deletion */}
                      {confirmDeleteId === p.id && !p.isProtected && (
                        <div
                          className={`p-3 rounded-xl border space-y-2 text-xs ${
                            isLightMode
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : 'bg-rose-950/50 border-rose-500/50 text-rose-100'
                          }`}
                        >
                          <div className="flex items-start gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <span>
                              {isEn
                                ? `Permanently delete profile "${p.username}" (${formatBytesSmart(p.sizeBytes, true)})?`
                                : `آیا از حذف کامل پروفایل «${p.username}» به حجم ${formatBytesSmart(p.sizeBytes, false)} مطمئن هستید؟`}
                            </span>
                          </div>
                          <p className={`text-[11px] ${isLightMode ? 'text-rose-800' : 'text-rose-200'}`}>
                            {isEn
                              ? `This removes the local profile folder (${p.profilePath || '-'}) and its Windows ProfileList registry entry (${p.sid}). Desktop, Documents, and Downloads stored only on this PC will be permanently erased.`
                              : `مسیر (${p.profilePath || '-'}) و کلید رجیستری (${p.sid}) برای همیشه حذف می‌شوند و فایل‌های دسکتاپ، اسناد و دانلودهای محلی این پروفایل قابل بازگشت نخواهند بود.`}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={anyBusy}
                              onClick={async () => {
                                setConfirmDeleteId(null);
                                await onProfileAction({
                                  action: 'delete_profile',
                                  profileSid: p.sid,
                                  profileUsername: p.username,
                                });
                              }}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer"
                            >
                              {isEn ? 'Confirm Permanent Delete' : 'تأیید حذف دائمی پروفایل'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                                isLightMode ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                              }`}
                            >
                              {isEn ? 'Cancel' : 'انصراف'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
