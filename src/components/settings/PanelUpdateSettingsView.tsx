import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUpCircle,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Tag,
  Calendar,
  History,
  Terminal,
  ShieldCheck,
  Search,
  Filter,
  Check,
  Lock,
  KeyRound,
  Upload,
  FileText,
  Trash2,
  ShieldAlert,
  Layers,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { APP_VERSION, RELEASE_HISTORY, ReleaseNote } from '../../version';
import { useLanguage } from '../../i18n';
import { useUpdate } from '../../context/UpdateContext';
import { useAuth } from '../../context/AuthContext';
import { canUserCheckUpdate, canUserPerformUpdate } from '../../utils/rbac';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface UpdateChannelStatus {
  configured: boolean;
  verified: boolean;
  source: 'key_file' | 'installer' | 'env' | 'none';
  filename: string | null;
  keyFingerprint: string | null;
  configuredAt: string | null;
  configuredBy: string | null;
  verifiedAt: string | null;
}

interface PanelUpdateSettingsViewProps {
  isLightMode?: boolean;
}

export const PanelUpdateSettingsView: React.FC<PanelUpdateSettingsViewProps> = ({
  isLightMode = false,
}) => {
  const { isEn, isRtl } = useLanguage();
  const {
    updateInfo,
    checking,
    updating,
    updateSuccess,
    updateLogs,
    error,
    updateProgress,
    updateStep,
    countdown,
    lastCheckedAt,
    checkFeedback,
    checkUpdate,
    performUpdate,
  } = useUpdate();
  const { user, token, effectivePolicy } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'major' | 'minor' | 'patch'>('all');
  const [isCleanRebuild, setIsCleanRebuild] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Encrypted Update Authorization Key File State (Super Admin Only)
  const [channelStatus, setChannelStatus] = useState<UpdateChannelStatus | null>(null);
  const [loadingChannel, setLoadingChannel] = useState<boolean>(false);
  const [uploadingKey, setUploadingKey] = useState<boolean>(false);
  const [verifyingKey, setVerifyingKey] = useState<boolean>(false);
  const [removingKey, setRemovingKey] = useState<boolean>(false);
  const [confirmRemove, setConfirmRemove] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [keyNotice, setKeyNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canCheck = canUserCheckUpdate(user, effectivePolicy);
  const canPerform = canUserPerformUpdate(user, effectivePolicy);
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const remoteNote = updateInfo?.releaseNote;

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const storedToken =
      token ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('nettopology_auth_token_v1') ||
          sessionStorage.getItem('nettopology_auth_token_v1')
        : null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }
    return headers;
  }, [token]);

  const fetchChannelStatus = useCallback(async () => {
    if (!canCheck) return;
    setLoadingChannel(true);
    try {
      const res = await fetch(`/api/system/update-channel/status?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setChannelStatus({
          configured: Boolean(data.configured),
          verified: Boolean(data.verified),
          source: data.source || 'none',
          filename: data.filename || null,
          keyFingerprint: data.keyFingerprint || null,
          configuredAt: data.configuredAt || null,
          configuredBy: data.configuredBy || null,
          verifiedAt: data.verifiedAt || null,
        });
      }
    } catch {
      // silent fallback
    } finally {
      setLoadingChannel(false);
    }
  }, [canCheck, getAuthHeaders]);

  useEffect(() => {
    fetchChannelStatus();
  }, [fetchChannelStatus]);

  const processKeyFile = async (file: File) => {
    if (!canPerform || uploadingKey) return;
    setKeyNotice(null);
    setConfirmRemove(false);

    if (file.size > 65536) {
      setKeyNotice({
        type: 'error',
        text: isEn
          ? 'File is too large. Please select a valid .txt update key file (max 64 KB).'
          : 'حجم فایل بیش از حد مجاز است. لطفاً یک فایل متنی (.txt) معتبر انتخاب کنید (حداکثر ۶۴ کیلوبایت).',
      });
      return;
    }

    setUploadingKey(true);
    try {
      const textContent = await file.text();
      const res = await fetch('/api/system/update-channel/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          content: textContent,
          filename: file.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setKeyNotice({
          type: 'error',
          text: isEn
            ? (data.error || 'Failed to validate the update authorization key file.')
            : (data.errorFa || data.error || 'اعتبارسنجی فایل کلید مجوز به‌روزرسانی ناموفق بود.'),
        });
        return;
      }

      if (data.status) {
        setChannelStatus(data.status);
      } else {
        await fetchChannelStatus();
      }
      setKeyNotice({
        type: 'success',
        text: isEn
          ? (data.message || 'Update authorization key verified and stored encrypted.')
          : (data.messageFa || 'کلید مجوز به‌روزرسانی با موفقیت تایید و به صورت رمزنگاری‌شده ذخیره شد.'),
      });
      // Immediately check for available releases using the newly activated key
      await checkUpdate(false, true);
    } catch {
      setKeyNotice({
        type: 'error',
        text: isEn
          ? 'Network error while uploading the update key file.'
          : 'خطای ارتباطی هنگام ارسال فایل کلید به‌روزرسانی.',
      });
    } finally {
      setUploadingKey(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processKeyFile(file);
    }
  };

  const handleDropKeyFile = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processKeyFile(file);
    }
  };

  const handleVerifyKey = async () => {
    if (!canPerform || verifyingKey) return;
    setVerifyingKey(true);
    setKeyNotice(null);
    setConfirmRemove(false);
    try {
      const res = await fetch('/api/system/update-channel/verify', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status) {
        setChannelStatus(data.status);
      }
      if (!res.ok || !data.success) {
        setKeyNotice({
          type: 'error',
          text: isEn
            ? (data.error || 'Verification failed. Please upload a valid .txt update key file.')
            : (data.errorFa || data.error || 'تایید دسترسی ناموفق بود. لطفاً فایل کلید معتبر را مجدداً بارگذاری کنید.'),
        });
        return;
      }
      setKeyNotice({
        type: 'success',
        text: isEn
          ? (data.message || 'Release server access verified successfully.')
          : (data.messageFa || 'اتصال و مجوز دسترسی به سرور به‌روزرسانی با موفقیت تایید شد.'),
      });
    } catch {
      setKeyNotice({
        type: 'error',
        text: isEn ? 'Failed to contact server for verification.' : 'خطا در برقراری ارتباط برای تایید کلید.',
      });
    } finally {
      setVerifyingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!canPerform || removingKey) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemovingKey(true);
    setKeyNotice(null);
    try {
      const res = await fetch('/api/system/update-channel', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setChannelStatus(data.status || {
          configured: false,
          verified: false,
          source: 'none',
          filename: null,
          keyFingerprint: null,
          configuredAt: null,
          configuredBy: null,
          verifiedAt: null,
        });
        setConfirmRemove(false);
        setKeyNotice({
          type: 'success',
          text: isEn
            ? (data.message || 'Stored update authorization key removed.')
            : (data.messageFa || 'کلید مجوز به‌روزرسانی ذخیره‌شده حذف شد.'),
        });
      }
    } catch {
      setKeyNotice({
        type: 'error',
        text: isEn ? 'Failed to remove stored key.' : 'خطا در حذف کلید ذخیره‌شده.',
      });
    } finally {
      setRemovingKey(false);
    }
  };

  const handleManualCheck = async () => {
    if (!canCheck || checking || updating) return;
    await checkUpdate(false, true);
  };

  const handleStartUpdate = async () => {
    if (!canPerform || updating) return;
    await performUpdate({ clean: isCleanRebuild });
  };

  // Filtered changelog history
  const filteredHistory = RELEASE_HISTORY.filter((note) => {
    if (filterType !== 'all' && note.type !== filterType) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesVersion = note.version.toLowerCase().includes(q);
    const matchesTitle =
      note.title.toLowerCase().includes(q) ||
      (note.title_en && note.title_en.toLowerCase().includes(q));
    const matchesChanges =
      note.changes.some((c) => c.toLowerCase().includes(q)) ||
      (note.changes_en && note.changes_en.some((c) => c.toLowerCase().includes(q)));
    return matchesVersion || matchesTitle || matchesChanges;
  });

  const totalItems = filteredHistory.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedHistory = filteredHistory.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    const validPage = Math.min(Math.max(1, newPage), totalPages);
    setCurrentPage(validPage);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleFilterChange = (t: 'all' | 'major' | 'minor' | 'patch') => {
    setFilterType(t);
    setCurrentPage(1);
  };

  return (
    <div
      className={`min-h-full p-4 lg:p-8 space-y-6 transition-colors duration-200 ${
        isLightMode ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      {/* Top Banner Header */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl relative overflow-hidden shadow-xl ${
          isLightMode
            ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
            : 'bg-slate-950/70 border-white/10 shadow-black/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-rose-600 via-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25 shrink-0">
              <ArrowUpCircle className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-mono">
                  {isEn ? 'Panel Updates & Releases' : 'ارتقا و به‌روزرسانی پنل'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v{APP_VERSION}
                </span>
                {hasUpdate ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/25 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>{isEn ? `New: v${updateInfo?.latestVersion}` : `نسخه جدید: v${updateInfo?.latestVersion}`}</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isEn ? 'Latest Stable' : 'کاملاً به‌روز'}</span>
                  </span>
                )}
              </div>
              <p
                className={`text-xs sm:text-sm mt-1 ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Verify official software releases, review comprehensive changelogs, and upgrade your system with single-click automation.'
                  : 'بررسی نسخه‌های رسمی منتشرشده در سرور به‌روزرسانی، مشاهده جزئیات تغییرات و ارتقای خودکار سیستم با یک کلیک.'}
              </p>
            </div>
          </div>

          {/* Quick Check Action */}
          <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
            {canCheck ? (
              <button
                onClick={handleManualCheck}
                disabled={checking || updating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-cyan-600/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>
                  {checking
                    ? (isEn ? 'Checking Release Server...' : 'در حال استعلام از سرور به‌روزرسانی...')
                    : (isEn ? 'Check for Updates' : 'بررسی نسخه جدید')}
                </span>
              </button>
            ) : (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800/60 border border-white/10 text-slate-400 text-xs"
                title={isEn ? 'Restricted to Super Administrator' : 'مختص مدیر ارشد سیستم'}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isEn ? 'Admin Only' : 'مختص مدیر ارشد'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Status & Action Section */}
      {updateSuccess || (countdown !== null && countdown > 0) ? (
        /* Update Completed - Prominent 10-Second Countdown & Success Dashboard */
        <div
          className={`p-6 rounded-2xl border backdrop-blur-xl shadow-2xl space-y-5 animate-fadeIn relative overflow-hidden ${
            isLightMode
              ? 'bg-gradient-to-br from-emerald-50 via-white to-teal-50 border-emerald-300 text-slate-900 shadow-emerald-500/10'
              : 'bg-gradient-to-br from-emerald-950/85 via-slate-900/90 to-teal-950/85 border-emerald-500/50 text-slate-100 shadow-emerald-950/50'
          }`}
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Top Row: Success Badge + Big Countdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className={`text-base sm:text-lg font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {isEn ? 'Panel Updated Successfully!' : 'پنل با موفقیت به نگارش جدید ارتقا یافت!'}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40">
                    100% {isEn ? 'COMPLETED' : 'تکمیل شد'}
                  </span>
                </div>
                <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-600' : 'text-emerald-200/80'}`}>
                  {isEn
                    ? 'All repository changes, dependencies, database state, and services were upgraded cleanly.'
                    : 'کلیه تغییرات مخزن، پکیج‌ها، پایگاه داده و سرویس‌های سامانه با موفقیت ارتقا یافتند.'}
                </p>
              </div>
            </div>

            {/* Countdown Badge & Instant Reload Button */}
            <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end flex-wrap">
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 border border-emerald-500/40 shadow-inner">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 border-2 border-emerald-400 flex items-center justify-center font-mono font-black text-xl text-emerald-300 shadow-lg shadow-emerald-500/20 animate-pulse">
                  {countdown ?? 10}
                </div>
                <div className="text-right rtl:text-right ltr:text-left">
                  <div className="text-xs font-bold text-white font-mono">
                    {isEn ? `Reloading in ${countdown ?? 10}s` : `بارگذاری مجدد در ${countdown ?? 10} ثانیه`}
                  </div>
                  <div className="text-[10px] text-emerald-300/80">
                    {isEn ? 'Automatic restart countdown' : 'شمارش معکوس رفرش خودکار'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/30 transition cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isEn ? 'Reload Now' : 'تازه‌سازی فوری'}</span>
              </button>
            </div>
          </div>

          {/* Visual 10-Second Countdown Progress Bar */}
          <div className="space-y-1.5 relative z-10">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span>{isEn ? 'Browser auto-refresh timer:' : 'زمان‌سنج بارگذاری مجدد خودکار مرورگر:'}</span>
              </span>
              <span className="text-emerald-300 font-bold">
                {countdown ?? 10} / 10 {isEn ? 'seconds' : 'ثانیه'}
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-black/60 border border-emerald-500/30 overflow-hidden relative p-0.5 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(16,185,129,0.7)]"
                style={{ width: `${Math.max(0, Math.min(100, ((countdown ?? 10) / 10) * 100))}%` }}
              />
            </div>
          </div>

          {/* Final Completed Pipeline Logs */}
          {updateLogs.length > 0 && (
            <div className="space-y-1.5 relative z-10">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Update Summary & Execution Logs' : 'خلاصه و لاگ‌های اجرای ارتقا'}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {updateLogs.length} {isEn ? 'entries' : 'سطر'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-white/10 font-mono text-xs text-slate-300 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                {updateLogs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-400 shrink-0">✓</span>
                    <span className={log.includes('successfully') || log.includes('موفقیت') ? 'text-emerald-400 font-bold' : ''}>
                      {log}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : updating ? (
        /* Live Updating In-Progress Card with 6-Phase Progress Bar */
        <div
          className={`p-6 rounded-2xl border backdrop-blur-xl shadow-2xl space-y-5 animate-fadeIn relative overflow-hidden update-pipeline-card ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
              : 'bg-slate-900/90 border-slate-700/60 shadow-black/40 text-slate-100'
          }`}
        >
          {/* Subtle Ambient Pulse */}
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header with Title and Current Progress */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <div
                className={`p-3 rounded-2xl border shadow-lg shrink-0 ${
                  isLightMode
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-indigo-100'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400 shadow-indigo-500/10'
                }`}
              >
                <RefreshCw className="w-7 h-7 animate-spin text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className={`text-base sm:text-lg font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                    {isEn ? 'System Update Pipeline In Progress...' : 'عملیات به‌روزرسانی پنل در حال اجراست...'}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                      isLightMode
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                    }`}
                  >
                    {isEn ? `Phase ${updateStep} of 6` : `گام ${updateStep} از ۶`}
                  </span>
                </div>
                <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Executing safe update pipeline, database snapshot & building production assets...'
                    : 'در حال اجرای خط لوله امن ارتقا، تهیه پشتیبان دیتابیس و بیلد نرم‌افزار...'}
                </p>
              </div>
            </div>

            {/* Percentage Badge */}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border self-start sm:self-auto shadow-inner update-progress-badge ${
                isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-800'
                  : 'bg-slate-950/70 border-white/10 text-slate-200'
              }`}
            >
              <span className={`text-xs font-mono font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn ? 'Progress:' : 'پیشرفت:'}
              </span>
              <span className="text-xl font-mono font-black text-indigo-400">
                {updateProgress}%
              </span>
            </div>
          </div>

          {/* Interactive Progress Bar */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className={`font-semibold truncate max-w-[85%] ${isLightMode ? 'text-indigo-700' : 'text-indigo-400'}`}>
                {isEn
                  ? updateStep === 1
                    ? 'Phase 1/6: Initializing upgrade pipeline...'
                    : updateStep === 2
                    ? 'Phase 2/6: Syncing repository & safeguarding database...'
                    : updateStep === 3
                    ? 'Phase 3/6: Installing & reconciling NPM dependencies...'
                    : updateStep === 4
                    ? 'Phase 4/6: Verifying backend processes & Python environment...'
                    : updateStep === 5
                    ? 'Phase 5/6: Building production frontend and backend bundles...'
                    : 'Phase 6/6: Finalizing configuration & preparing restart...'
                  : updateStep === 1
                    ? 'گام ۱/۶: آماده‌سازی خط لوله ارتقا...'
                    : updateStep === 2
                    ? 'گام ۲/۶: همگام‌سازی مخزن و پشتیبان‌گیری از دیتابیس...'
                    : updateStep === 3
                    ? 'گام ۳/۶: نصب و اعتبارسنجی پکیج‌های NPM...'
                    : updateStep === 4
                    ? 'گام ۴/۶: بررسی پروسه‌های بک‌اند و محیط پایتون...'
                    : updateStep === 5
                    ? 'گام ۵/۶: ساخت و کامپایل مجدد کدهای اجرایی پنل...'
                    : 'گام ۶/۶: نهایی‌سازی تنظیمات و آماده‌سازی ری‌استارت...'}
              </span>
              <span className={`font-bold shrink-0 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                {updateProgress}%
              </span>
            </div>

            {/* Animated Gradient Bar */}
            <div
              className={`w-full h-3.5 rounded-full border overflow-hidden relative p-0.5 shadow-inner ${
                isLightMode ? 'bg-slate-200 border-slate-300' : 'bg-slate-950 border-white/10'
              }`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-600 transition-all duration-700 ease-out relative shadow-sm"
                style={{ width: `${Math.max(5, Math.min(100, updateProgress))}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              </div>
            </div>

            {/* 6 Step Indicators */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
              {[
                { step: 1, label_en: '1. Init', label_fa: '۱. آغاز' },
                { step: 2, label_en: '2. Sync', label_fa: '۲. دریافت' },
                { step: 3, label_en: '3. Deps', label_fa: '۳. پکیج‌ها' },
                { step: 4, label_en: '4. Backend', label_fa: '۴. بک‌اند' },
                { step: 5, label_en: '5. Build', label_fa: '۵. بیلد' },
                { step: 6, label_en: '6. Restart', label_fa: '۶. ری‌استارت' },
              ].map((s) => {
                const isDone = updateStep > s.step;
                const isCurrent = updateStep === s.step;
                return (
                  <div key={s.step} className="flex flex-col items-center gap-1.5 text-center">
                    <div
                      className={`w-full h-1.5 rounded-full transition-all ${
                        isDone
                          ? 'bg-emerald-500 shadow-xs'
                          : isCurrent
                          ? 'bg-indigo-500 animate-pulse shadow-sm shadow-indigo-500/50'
                          : isLightMode
                          ? 'bg-slate-200'
                          : 'bg-slate-800'
                      }`}
                    />
                    <span
                      className={`text-[10px] font-mono font-medium truncate max-w-full ${
                        isDone
                          ? 'text-emerald-400 font-semibold'
                          : isCurrent
                          ? 'text-indigo-400 font-bold'
                          : isLightMode
                          ? 'text-slate-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {isEn ? s.label_en : s.label_fa}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Terminal Logs */}
          <div className="space-y-1.5 relative z-10">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isEn ? 'Live Terminal Output' : 'خروجی زنده کنسول'}</span>
              </div>
              <span className={`text-[10px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {updateLogs.length} {isEn ? 'entries' : 'سطر'}
              </span>
            </div>

            <div
              className={`p-4 rounded-xl border font-mono text-xs max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar ${
                isLightMode
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-slate-950 border-white/10 text-slate-300'
              }`}
            >
              {updateLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-indigo-400 shrink-0">›</span>
                  <span className={log.includes('successfully') || log.includes('موفقیت') ? 'text-emerald-400 font-bold' : ''}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : hasUpdate ? (
        /* Update Available Callout Banner */
        <div className="p-6 rounded-2xl bg-gradient-to-br from-rose-950/70 via-purple-950/50 to-slate-900/80 border border-rose-500/40 shadow-xl space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-500/20 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {isEn ? `New Version v${updateInfo?.latestVersion} Ready for Installation` : `نسخه جدید v${updateInfo?.latestVersion} آماده نصب است`}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-500/40 font-bold">
                    {isEn ? 'UPDATE READY' : 'آماده نصب'}
                  </span>
                </div>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  {isEn
                    ? (remoteNote?.title_en || `Release v${updateInfo?.latestVersion}: System optimizations and enhancements.`)
                    : (remoteNote?.title || `ارتقا و بهبود قابلیت‌های نرم‌افزار.`)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCleanRebuild}
                  onChange={(e) => setIsCleanRebuild(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                />
                <span>{isEn ? 'Clean deep build' : 'پاکسازی عمیق پکیج‌ها'}</span>
              </label>

              {canPerform ? (
                <button
                  onClick={handleStartUpdate}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition cursor-pointer active:scale-95 flex items-center gap-2"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>{isEn ? 'Update Panel to Latest Version' : 'ارتقای پنل به آخرین نسخه'}</span>
                </button>
              ) : (
                <div className="text-xs text-slate-400 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-white/10">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Update restricted to Super Admin' : 'ارتقا تنها برای مدیر ارشد مجاز است'}</span>
                </div>
              )}
            </div>
          </div>

          {/* New Release Highlights */}
          {remoteNote && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                {isEn ? 'Changes in this release:' : 'تغییرات اعمال‌شده در این نسخه:'}
              </h4>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-200">
                {(isEn ? (remoteNote.changes_en || remoteNote.changes) : remoteNote.changes).map((c, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-rose-400 font-bold shrink-0">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : updateInfo?.requiresKey ? (
        /* Key Authorization Required Notice */
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isLightMode
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : 'bg-amber-950/25 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {isEn ? 'Update Authorization Key Required' : 'ثبت فایل کلید مجوز به‌روزرسانی الزامی است'}
              </h3>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-amber-800' : 'text-amber-200/80'}`}>
                {isEn
                  ? (updateInfo.error || 'Upload your authorized .txt update key file below once to activate automated system updates.')
                  : (updateInfo.errorFa || 'برای فعال‌سازی دریافت خودکار به‌روزرسانی‌ها، فایل متنی کلید مجوز (.txt) را یک‌بار در بخش زیر بارگذاری کنید.')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Up-To-Date Nominal Card */
        <div
          className={`p-5 rounded-2xl border backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            isLightMode
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {isEn ? 'Your panel is running the latest version' : 'سامانه شما کاملاً به‌روز است'}
              </h3>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-emerald-800' : 'text-emerald-300/80'}`}>
                {isEn
                  ? `Installed Version v${APP_VERSION} matches the latest stable release on the official update server.`
                  : `نسخه نصب‌شده v${APP_VERSION} دقیقاً مطابق با آخرین ریلیز پایدار در سرور رسمی به‌روزرسانی می‌باشد.`}
              </p>
            </div>
          </div>

          {lastCheckedAt && (
            <span className={`text-[11px] font-mono px-3 py-1 rounded-full border self-start sm:self-auto ${
              isLightMode
                ? 'bg-white border-emerald-300 text-emerald-800'
                : 'bg-slate-900 border-emerald-500/30 text-emerald-300'
            }`}>
              {isEn ? `Checked: ${new Date(lastCheckedAt).toLocaleTimeString()}` : `آخرین بررسی: ${new Date(lastCheckedAt).toLocaleTimeString('fa-IR')}`}
            </span>
          )}
        </div>
      )}

      {/* Stealth Update Authorization Key File Management Card (Super Admin Only) */}
      {canPerform && (
        <div
          className={`p-5 sm:p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-4 transition-colors ${
            updateInfo?.requiresKey
              ? isLightMode
                ? 'bg-amber-50/50 border-amber-300'
                : 'bg-amber-950/15 border-amber-500/40'
              : isLightMode
              ? 'bg-white/90 border-slate-200'
              : 'bg-slate-950/60 border-white/10'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border shrink-0 ${
                  channelStatus?.configured && channelStatus?.verified
                    ? isLightMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : isLightMode
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                }`}
              >
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-sm sm:text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {isEn ? 'Update Authorization Key' : 'کلید مجوز به‌روزرسانی سامانه'}
                  </h3>
                  <FieldInfoTooltip
                    title={isEn ? 'Update Authorization Key (.txt)' : 'فایل کلید مجوز به‌روزرسانی (.txt)'}
                    isEn={isEn}
                    isLightMode={isLightMode}
                    whatIsIt={
                      isEn
                        ? 'A plain-text (.txt) authorization file containing the release source address and access key required to authenticate with the private software update server.'
                        : 'یک فایل متنی (.txt) حاوی آدرس منبع به‌روزرسانی و کلید دسترسی اختصاصی که مجوز اتصال ایمن پنل به سرور به‌روزرسانی را فراهم می‌کند.'
                    }
                    whyNeeded={
                      isEn
                        ? 'Restricts update package downloads to authorized deployments only. Once uploaded, the file contents are encrypted immediately on the server with AES-256-GCM and are never sent back to the browser.'
                        : 'برای حفاظت از بسته‌های نرم‌افزاری و جلوگیری از دسترسی غیرمجاز به نسخه‌های جدید کاربرد دارد. پس از یک‌بار بارگذاری، اطلاعات روی سرور با رمزنگاری AES-256-GCM ذخیره شده و هرگز به مرورگر برگردانده نمی‌شود.'
                    }
                    practicalExample={
                      isEn
                        ? 'Upload your provided key.txt file once (e.g. line 1: release source address, line 2: access key — or KEY=VALUE format). All future checks and updates work automatically.'
                        : 'فایل key.txt ارائه‌شده را یک‌بار بارگذاری کنید (مثلاً خط اول آدرس منبع و خط دوم کلید دسترسی، یا قالب KEY=VALUE). پس از تایید، تمامی بررسی‌ها و ارتقاهای بعدی به صورت خودکار انجام می‌شوند.'
                    }
                  />
                  {loadingChannel ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${isLightMode ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-900 border-white/10 text-slate-400'}`}>
                      {isEn ? 'Checking...' : 'در حال بررسی...'}
                    </span>
                  ) : channelStatus?.configured && channelStatus?.verified ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border border-emerald-500/35 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Active & Encrypted' : 'فعال و رمزنگاری‌شده'}</span>
                    </span>
                  ) : channelStatus?.configured ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/35">
                      {isEn ? 'Needs Verification' : 'نیازمند بررسی اعتبار'}
                    </span>
                  ) : (
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${isLightMode ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-900 border-white/10 text-slate-400'}`}>
                      {isEn ? 'Not Configured' : 'ثبت نشده'}
                    </span>
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Upload your .txt authorization key file once. Credentials are stored encrypted server-side (AES-256-GCM) and used automatically for all updates.'
                    : 'فایل متنی کلید مجوز (.txt) را یک‌بار بارگذاری کنید تا به صورت رمزنگاری‌شده (AES-256-GCM) در سرور ذخیره و برای تمامی به‌روزرسانی‌ها استفاده شود.'}
                </p>
              </div>
            </div>

            {/* Action Buttons when configured */}
            {channelStatus?.configured && (
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  onClick={handleVerifyKey}
                  disabled={verifyingKey || uploadingKey}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                      : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifyingKey ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Verify Key' : 'تست اعتبار'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingKey}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Replace (.txt)' : 'جایگزینی فایل (.txt)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveKey}
                  disabled={removingKey}
                  onMouseLeave={() => setConfirmRemove(false)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer disabled:opacity-50 ${
                    confirmRemove
                      ? 'bg-rose-600 hover:bg-rose-500 border-rose-500 text-white'
                      : isLightMode
                      ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                      : 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {confirmRemove
                      ? (isEn ? 'Click to Confirm' : 'تایید حذف')
                      : (isEn ? 'Remove' : 'حذف')}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.key,.conf,.cfg,text/plain"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Active Key Metadata Summary OR Upload Dropzone */}
          {channelStatus?.configured ? (
            <div
              className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl border text-xs ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-900/70 border-white/10 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-wider font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Key Fingerprint' : 'شناسه کلید'}
                  </div>
                  <div className="font-mono font-bold truncate">
                    {channelStatus.keyFingerprint || 'KEY-ACTIVE'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-wider font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Activation Source' : 'منبع فعال‌سازی'}
                  </div>
                  <div className="font-semibold truncate">
                    {channelStatus.source === 'installer'
                      ? (isEn ? 'Installer Provisioned' : 'تنظیم‌شده هنگام نصب پنل')
                      : channelStatus.source === 'key_file'
                      ? (isEn
                          ? `Key File (${channelStatus.filename || 'key.txt'})`
                          : `فایل کلید (${channelStatus.filename || 'key.txt'})`)
                      : (isEn ? 'Server Environment' : 'متغیر محیطی سرور')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <div className={`text-[10px] uppercase tracking-wider font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Last Verified' : 'آخرین تایید اعتبار'}
                  </div>
                  <div className="font-mono truncate">
                    {channelStatus.verifiedAt
                      ? new Date(channelStatus.verifiedAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')
                      : channelStatus.configuredAt
                      ? new Date(channelStatus.configuredAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')
                      : (isEn ? 'Active' : 'فعال')}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDropKeyFile}
              onClick={() => !uploadingKey && fileInputRef.current?.click()}
              className={`p-5 rounded-xl border-2 border-dashed transition cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isDraggingFile
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : isLightMode
                  ? 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
                  : 'border-white/15 bg-slate-900/50 hover:border-indigo-500/50 hover:bg-indigo-950/20'
              }`}
            >
              <div className="flex items-center gap-3.5 text-center sm:text-start">
                <div className={`p-3 rounded-xl border shrink-0 ${isLightMode ? 'bg-white border-slate-200 text-indigo-600' : 'bg-slate-950 border-white/10 text-indigo-400'}`}>
                  {uploadingKey ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className={`text-xs sm:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {uploadingKey
                      ? (isEn ? 'Verifying & Encrypting Update Key...' : 'در حال اعتبارسنجی و رمزنگاری فایل کلید...')
                      : (isEn ? 'Drop your update key file (.txt) here or click to browse' : 'فایل کلید به‌روزرسانی (.txt) را اینجا رها کنید یا کلیک کنید')}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Supports plain .txt authorization files (encrypted immediately with AES-256-GCM on upload).'
                      : 'پشتیبانی از فایل‌های متنی (.txt)؛ پس از بارگذاری بلافاصله با AES-256-GCM رمزنگاری و ذخیره می‌شود.'}
                  </div>
                </div>
              </div>

              <span className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-bold text-xs shadow-sm shrink-0">
                {isEn ? 'Select .txt File' : 'انتخاب فایل .txt'}
              </span>
            </div>
          )}

          {/* Inline Notice Banner */}
          {keyNotice && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                keyNotice.type === 'success'
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : isLightMode
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              }`}
            >
              {keyNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span className="flex-1">{keyNotice.text}</span>
            </div>
          )}
        </div>
      )}

      {/* Release Notes History & Changelog Explorer */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl shadow-lg space-y-5 ${
          isLightMode
            ? 'bg-white/90 border-slate-200'
            : 'bg-slate-950/60 border-white/10'
        }`}
      >
        <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b ${isLightMode ? 'border-slate-200' : 'border-white/10'} pb-4`}>
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {isEn ? 'Release Notes & Changelog History' : 'تاریخچه تغییرات و نسخه‌های منتشرشده (Release Notes)'}
              </h3>
              <p className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn ? 'Comprehensive chronological audit of all updates' : 'گزارش مستند و کامل تمام نسخه‌ها و تغییرات سامانه'}
              </p>
            </div>
          </div>

          {/* Filters, Page Size & Search */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 flex-wrap">
            {/* Left: Type Filters */}
            <div className={`flex flex-wrap items-center gap-1 p-1 rounded-xl border text-xs max-w-full ${isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-white/10'}`}>
              {(['all', 'major', 'minor', 'patch'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleFilterChange(t)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer capitalize whitespace-nowrap ${
                    filterType === t
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : isLightMode
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'all' ? (isEn ? 'All' : 'همه') : t}
                </button>
              ))}
            </div>

            {/* Right: Page Size Selector & Search Box */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Page Size Switcher (10, 50, 200) */}
              <div className={`flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs ${isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-white/10'}`}>
                <span className={`text-[11px] font-medium ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn ? 'Per Page:' : 'در هر صفحه:'}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {[10, 50, 200].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handlePageSizeChange(size)}
                      className={`px-2 py-0.5 rounded-lg font-mono font-bold text-xs transition cursor-pointer ${
                        pageSize === size
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : isLightMode
                          ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                          : 'text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                      title={isEn ? `Show ${size} releases per page` : `نمایش ${size} نسخه در هر صفحه`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 w-full sm:w-56 min-w-0 sm:min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={isEn ? 'Search release notes...' : 'جستجو در نسخه‌ها...'}
                  className={`w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-indigo-400 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Release Summary & Active Page Info Bar */}
        {totalItems > 0 && (
          <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-1 text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                {isEn ? 'Showing' : 'نمایش'} <b className={`font-mono ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>{startIndex + 1}–{endIndex}</b> {isEn ? 'of' : 'از'} <b className={`font-mono ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>{totalItems}</b> {isEn ? 'releases' : 'نسخه منتشرشده'}
              </span>
              {searchQuery && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {isEn ? `Filtered: "${searchQuery}"` : `فیلتر شده بر اساس: «${searchQuery}»`}
                </span>
              )}
            </div>

            {/* Quick Top Pagination Summary */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <span className="font-mono text-[11px]">
                {isEn ? 'Page' : 'صفحه'} <b className={`font-mono ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>{safePage}</b> / {totalPages}
              </span>
            </div>
          </div>
        )}

        {/* List of Releases (Paginated) */}
        <div className="space-y-4">
          {paginatedHistory.length > 0 ? (
            paginatedHistory.map((note) => {
              const isCurrent = note.version === APP_VERSION;
              const typeBadgeColor =
                note.type === 'major'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : note.type === 'minor'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

              const titleText = isEn
                ? (note.title_en || note.title)
                : note.title;

              const changesList = isEn
                ? (note.changes_en && note.changes_en.length > 0 ? note.changes_en : note.changes)
                : note.changes;

              return (
                <div
                  key={note.version}
                  className={`p-4 sm:p-5 rounded-2xl border transition space-y-3 ${
                    isCurrent
                      ? isLightMode
                        ? 'bg-indigo-50/80 border-indigo-300 shadow-sm'
                        : 'bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                      : isLightMode
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-900/60 border-white/10'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`font-mono font-bold text-sm sm:text-base ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                        v{note.version}
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${typeBadgeColor}`}>
                        {note.type}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border border-emerald-500/40 font-semibold">
                          {isEn ? 'Current Running Version' : 'نسخه فعال جاری'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{note.releaseDate}</span>
                    </div>
                  </div>

                  <h4 className={`text-xs sm:text-sm font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-100'}`}>
                    {titleText}
                  </h4>

                  <ul className={`space-y-1.5 text-xs list-disc list-inside ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                    {changesList.map((c, i) => (
                      <li key={i} className="leading-relaxed">
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              {isEn ? 'No release notes match your query.' : 'هیچ نسخه‌ای منطبق بر جستجو یافت نشد.'}
            </div>
          )}
        </div>

        {/* Bottom Pagination Controls Bar */}
        {totalPages > 1 && (
          <div
            className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isLightMode ? 'border-slate-200' : 'border-white/10'
            }`}
          >
            {/* Info Text */}
            <div className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
              <span>
                {isEn ? 'Page' : 'صفحه'}{' '}
                <b className={`font-mono font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>
                  {safePage}
                </b>{' '}
                {isEn ? 'of' : 'از'}{' '}
                <b className={`font-mono font-bold ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>
                  {totalPages}
                </b>{' '}
                ({totalItems} {isEn ? 'total versions' : 'نسخه در کل'})
              </span>
            </div>

            {/* Pagination Button Controls */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {/* First Page */}
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={safePage <= 1}
                className={`p-2 rounded-xl border text-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={isEn ? 'First Page' : 'صفحه اول'}
              >
                {isRtl ? <ChevronsRight className="w-3.5 h-3.5" /> : <ChevronsLeft className="w-3.5 h-3.5" />}
              </button>

              {/* Previous Page */}
              <button
                type="button"
                onClick={() => handlePageChange(safePage - 1)}
                disabled={safePage <= 1}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={isEn ? 'Previous Page' : 'صفحه قبل'}
              >
                {isRtl ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                <span>{isEn ? 'Previous' : 'قبلی'}</span>
              </button>

              {/* Numbered Page Buttons */}
              <div className="flex items-center gap-1 mx-1">
                {(() => {
                  const pages: (number | string)[] = [];
                  const maxButtons = 5;

                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    const leftEllipsis = safePage > 4;
                    const rightEllipsis = safePage < totalPages - 3;

                    if (leftEllipsis) pages.push('ellipsis-left');

                    const start = Math.max(2, safePage - 1);
                    const end = Math.min(totalPages - 1, safePage + 1);

                    for (let i = start; i <= end; i++) {
                      if (!pages.includes(i)) pages.push(i);
                    }

                    if (rightEllipsis) pages.push('ellipsis-right');
                    if (!pages.includes(totalPages)) pages.push(totalPages);
                  }

                  return pages.map((p, idx) => {
                    if (typeof p === 'string') {
                      return (
                        <span key={`${p}-${idx}`} className="px-2 text-xs text-slate-500 font-mono select-none">
                          …
                        </span>
                      );
                    }

                    const isActive = p === safePage;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`min-w-[32px] h-8 px-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center justify-center ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : isLightMode
                            ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                            : 'bg-slate-900 border border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => handlePageChange(safePage + 1)}
                disabled={safePage >= totalPages}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={isEn ? 'Next Page' : 'صفحه بعد'}
              >
                <span>{isEn ? 'Next' : 'بعدی'}</span>
                {isRtl ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                disabled={safePage >= totalPages}
                className={`p-2 rounded-xl border text-xs transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={isEn ? 'Last Page' : 'صفحه آخر'}
              >
                {isRtl ? <ChevronsLeft className="w-3.5 h-3.5" /> : <ChevronsRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
