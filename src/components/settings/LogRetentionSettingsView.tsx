import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  HardDrive,
  ShieldCheck,
  Trash2,
  Download,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Archive,
  Save,
  Info,
  Sliders,
  Layers,
  FileText,
  Sparkles,
  History,
  X,
  ChevronRight,
  ArrowRight,
  Lock,
  FileArchive,
  Check,
  Flame,
  Activity
} from 'lucide-react';
import { LogRetentionConfig, AuditStorageStats, LogPurgeResult } from '../../types';
import {
  fetchLogRetentionConfigApi,
  saveLogRetentionConfigApi,
  purgeLogRetentionNowApi,
  fetchAuditStorageStatsApi,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { isUserSuperAdmin } from '../../utils/rbac';
import { APP_VERSION } from '../../version';

interface LogRetentionSettingsViewProps {
  isLightMode?: boolean;
  onNavigateToLogs?: () => void;
}

export const LogRetentionSettingsView: React.FC<LogRetentionSettingsViewProps> = ({
  isLightMode = false,
  onNavigateToLogs,
}) => {
  const { isRtl, isEn } = useLanguage();
  const { user, effectivePolicy } = useAuth();
  const isSuperAdmin = isUserSuperAdmin(user, effectivePolicy);

  // Core State
  const [config, setConfig] = useState<LogRetentionConfig>({
    id: 'primary',
    retentionDays: 90,
    autoPurgeEnabled: true,
    backupBeforePurge: true,
    purgeScheduleTime: '02:00',
    lastCleanupTimestamp: null,
    lastCleanupDeletedCount: 0,
  });

  const [stats, setStats] = useState<AuditStorageStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Backup Export State
  const [isExporting, setIsExporting] = useState<'zip' | 'json' | null>(null);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);

  // Manual Purge State & 2-Stage Confirmation Modal
  const [manualPurgeDays, setManualPurgeDays] = useState<number>(90);
  const [manualBackupBeforePurge, setManualBackupBeforePurge] = useState<boolean>(true);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState<boolean>(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState<string>('');
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeResult, setPurgeResult] = useState<LogPurgeResult | null>(null);

  // Load configuration and storage telemetry
  const loadData = useCallback(async (showRefreshingSpinner = false) => {
    if (showRefreshingSpinner) setIsRefreshing(true);
    try {
      const res = await fetchLogRetentionConfigApi();
      if (res.config) {
        setConfig((prev) => ({
          ...prev,
          ...res.config,
          retentionDays: Number(res.config.retentionDays !== undefined ? res.config.retentionDays : 90),
          autoPurgeEnabled: Boolean(res.config.autoPurgeEnabled !== undefined ? res.config.autoPurgeEnabled : true),
          backupBeforePurge: Boolean(res.config.backupBeforePurge !== undefined ? res.config.backupBeforePurge : true),
          purgeScheduleTime: res.config.purgeScheduleTime || '02:00',
        }));
      }
      if (res.stats) {
        setStats(res.stats);
      } else {
        const statsRes = await fetchAuditStorageStatsApi();
        if (statsRes.stats) {
          setStats(statsRes.stats);
        }
      }
    } catch (err: any) {
      console.warn('[LogRetentionSettingsView] Failed to load retention config:', err);
      setFeedback({
        type: 'error',
        message: isEn
          ? `Error loading log retention settings: ${err.message || 'Server connection failed'}`
          : `خطا در دریافت تنظیمات نگهداری لاگ‌ها: ${err.message || 'عدم برقراری ارتباط با سرور'}`,
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isEn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save Retention Configuration
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      const payload: Partial<LogRetentionConfig> = {
        retentionDays: Number(config.retentionDays),
        autoPurgeEnabled: Boolean(config.autoPurgeEnabled),
        backupBeforePurge: Boolean(config.backupBeforePurge),
        purgeScheduleTime: config.purgeScheduleTime || '02:00',
      };

      const res = await saveLogRetentionConfigApi(payload);
      if (res.config) {
        setConfig((prev) => ({ ...prev, ...res.config }));
      }
      setFeedback({
        type: 'success',
        message: isEn
          ? 'Log retention policy configuration saved and synchronized with PostgreSQL.'
          : 'سیاست‌های نگهداری و پاکسازی لاگ‌ها با موفقیت ذخیره و در پایگاه داده اعمال شد.',
      });
      setTimeout(() => setFeedback(null), 5000);
      loadData();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: isEn
          ? `Failed to save retention policy: ${err.message || 'Database transaction error'}`
          : `خطا در ذخیره‌سازی سیاست‌های نگهداری: ${err.message || 'خطای تراکنش پایگاه داده'}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Standalone Backup Download
  const handleDownloadBackup = async (format: 'zip' | 'json') => {
    setIsExporting(format);
    setExportSuccessNotice(null);
    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/settings/log-retention/backup?format=${format}`, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `audit-logs-backup-${timestamp}.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportSuccessNotice(
        isEn
          ? `Standalone backup archive (${filename}) downloaded successfully.`
          : `نسخه پشتیبان مستقل لاگ‌ها (${filename}) با موفقیت بارگیری شد.`
      );
      setTimeout(() => setExportSuccessNotice(null), 6000);
    } catch (err: any) {
      console.error('[LogRetentionSettingsView] Backup download failed:', err);
      setFeedback({
        type: 'error',
        message: isEn
          ? `Failed to generate standalone backup: ${err.message}`
          : `خطا در ایجاد و دانلود بکاپ مستقل: ${err.message}`,
      });
    } finally {
      setIsExporting(null);
    }
  };

  // Handle Immediate Manual Purge Execution
  const handleExecutePurge = async () => {
    setIsPurging(true);
    setPurgeResult(null);
    try {
      const res = await purgeLogRetentionNowApi({
        retentionDays: manualPurgeDays,
        backupBeforePurge: manualBackupBeforePurge,
      });

      if (res.result) {
        setPurgeResult(res.result);
      }
      setIsPurgeModalOpen(false);
      setPurgeConfirmText('');
      setFeedback({
        type: 'success',
        message: isEn
          ? `Manual purge completed successfully. Removed ${res.result?.totalDeleted || 0} expired log records.`
          : `پاکسازی دستی با موفقیت انجام شد. تعداد ${res.result?.totalDeleted || 0} رکورد لاگ منقضی از پایگاه داده حذف گردید.`,
      });
      loadData();
    } catch (err: any) {
      console.error('[LogRetentionSettingsView] Manual purge failed:', err);
      setFeedback({
        type: 'error',
        message: isEn
          ? `Manual purge execution failed: ${err.message}`
          : `خطا در اجرای پاکسازی دستی: ${err.message}`,
      });
    } finally {
      setIsPurging(false);
    }
  };

  // Retention Period Options
  const retentionPresets = useMemo(() => [
    { days: 30, labelEn: '30 Days (1 Month)', labelFa: '۳۰ روز (۱ ماه)', badge: null },
    { days: 60, labelEn: '60 Days (2 Months)', labelFa: '۶۰ روز (۲ ماه)', badge: null },
    { days: 90, labelEn: '90 Days (Recommended)', labelFa: '۹۰ روز (توصیه‌شده)', badge: isEn ? 'Standard' : 'استاندارد' },
    { days: 180, labelEn: '180 Days (6 Months)', labelFa: '۱۸۰ روز (۶ ماه)', badge: isEn ? 'Extended' : 'بلندمدت' },
    { days: 365, labelEn: '365 Days (1 Year)', labelFa: '۱ سال کامل (Enterprise)', badge: isEn ? 'Audit' : 'سازمانی' },
    { days: 0, labelEn: 'Unlimited (Never Purge)', labelFa: 'نامحدود (عدم حذف خودکار)', badge: isEn ? 'Permanent' : 'دائمی' },
  ], [isEn]);

  // Format Timestamps
  const formatTimestamp = (isoString?: string | null) => {
    if (!isoString) return isEn ? 'No records recorded' : 'هیچ رکوردی ثبت نشده است';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleString(isEn ? 'en-US' : 'fa-IR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6 ${isRtl ? 'rtl' : 'ltr'}`}>
      {/* Top Banner & Header Bar */}
      <div
        className={`rounded-2xl p-4 sm:p-6 border transition-all shadow-md ${
          isLightMode
            ? 'bg-gradient-to-r from-sky-50 via-white to-indigo-50 border-sky-200/80 shadow-sky-100/50'
            : 'bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-indigo-950/40 border-slate-800 shadow-slate-950/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl flex items-center justify-center border shadow-inner ${
                isLightMode
                  ? 'bg-sky-600 text-white border-sky-400/40 shadow-sky-700/20'
                  : 'bg-gradient-to-br from-sky-500/20 to-indigo-500/20 text-sky-400 border-sky-500/30'
              }`}
            >
              <Database className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className={`text-lg sm:text-xl font-extrabold tracking-tight ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {isEn
                    ? 'Database Log Retention & Storage Policies'
                    : 'سیاست‌های نگهداری و پاکسازی لاگ‌های پایگاه داده'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                  <Activity className="w-3 h-3 animate-pulse text-sky-400" />
                  <span>PostgreSQL Authoritative</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  v{APP_VERSION}
                </span>
              </div>
              <p
                className={`text-xs sm:text-sm mt-1 leading-relaxed ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {isEn
                  ? 'Configure authoritative PostgreSQL retention windows, schedule automated nightly prune daemons, and trigger standalone encrypted exports.'
                  : 'پیکربندی دوره‌های نگهداری پایگاه داده PostgreSQL، تنظیم دیمن پاکسازی خودکار نیمه‌شب و دانلود نسخه‌های پشتیبان مستقل ممیزی.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center flex-wrap">
            {onNavigateToLogs && (
              <button
                type="button"
                onClick={onNavigateToLogs}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title={isEn ? 'View Live SIEM Audit Logs' : 'مشاهده لاگ‌های زنده ممیزی'}
              >
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isEn ? 'Audit Logs View' : 'مشاهده لاگ‌ها'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={isEn ? 'Refresh storage telemetry' : 'بروزرسانی آمار تلمتری لاگ‌ها'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : 'text-slate-400'}`} />
              <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-95 transition shadow-md shadow-sky-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? (isEn ? 'Saving...' : 'در حال ذخیره...') : (isEn ? 'Save Policies' : 'ذخیره تنظیمات')}</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-center gap-2.5 text-xs transition-all ${
              feedback.type === 'success'
                ? isLightMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-medium flex-1">{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {exportSuccessNotice && (
          <div
            className={`mt-4 p-3 rounded-xl border flex items-center gap-2.5 text-xs transition-all ${
              isLightMode
                ? 'bg-sky-50 border-sky-200 text-sky-800'
                : 'bg-sky-950/60 border-sky-500/40 text-sky-200'
            }`}
          >
            <Download className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-medium flex-1">{exportSuccessNotice}</span>
            <button
              onClick={() => setExportSuccessNotice(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 4 Storage Telemetry Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Physical PostgreSQL Storage Size */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'PostgreSQL Storage Footprint' : 'حجم فیزیکی مصرفی در دیتابیس'}
            </span>
            <div className="flex items-center gap-1">
              <FieldInfoTooltip
                title={isEn ? 'PostgreSQL Storage Footprint' : 'حجم اشغال‌شده در پایگاه داده'}
                infoWhatEn="Exact physical disk space occupied by all audit and command tables in PostgreSQL."
                infoWhatFa="حجم فیزیکی دقیق تخصیص‌یافته به تمامی جداول لاگ‌ها و فرامین ممیزی در پایگاه داده PostgreSQL."
                infoWhyEn="Critical for capacity planning and preventing server disk saturation over extended production operations."
                infoWhyFa="ضروری برای مدیریت ظرفیت سرور و جلوگیری از پر شدن دیسک به دلیل انباشت مداوم لاگ‌های شبکه."
                infoExampleEn="e.g. 14.85 MB across 45,000 recorded network device sessions."
                infoExampleFa="به عنوان مثال ۱۴.۸۵ مگابایت برای ۴۵,۰۰۰ رکورد دستورات ثبت‌شده."
                isEn={isEn}
                isLightMode={isLightMode}
              />
              <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
              {stats?.totalSizeFormatted || (isLoading ? '...' : '0 KB')}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              ({(stats?.totalSizeBytes || 0).toLocaleString()} B)
            </span>
          </div>
          <p className={`text-[11px] mt-1.5 leading-tight ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {isEn ? 'Tables: devices, servers, portal, security' : 'شامل جداول فرامین تجهیزات، سرورها، پورتال و امنیت'}
          </p>
        </div>

        {/* Card 2: Total Stored Records Breakdown */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Total Authoritative Records' : 'مجموع کل رکوردهای ممیزی'}
            </span>
            <div className="flex items-center gap-1">
              <FieldInfoTooltip
                title={isEn ? 'Total Authoritative Records' : 'مجموع کل رکوردهای لاگ'}
                infoWhatEn="Sum of all persistent audit entries across device commands, server executions, portal auth, and system changes."
                infoWhatFa="مجموع تمام رکوردهای پایدار در دیتابیس شامل دستورات ترمینال، لاگ‌های سرور، ورود و تغییرات پرتال."
                infoWhyEn="Ensures full compliance with corporate IT auditing standards and forensic non-repudiation."
                infoWhyFa="تضمین‌کننده رعایت استانداردهای ممیزی امنیت شبکه و ردناپذیری اقدامات کاربران و اپراتورها."
                infoExampleEn="Recommended policy: keep 90 days of active records for normal operations."
                infoExampleFa="سیاست پیشنهادی: نگهداری ۹۰ روز از رکوردهای فعال برای استفاده‌های عادی و بررسی‌های دوره‌ای."
                isEn={isEn}
                isLightMode={isLightMode}
              />
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
              {(stats?.totalRecords || 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-emerald-400 font-semibold">
              {isEn ? 'records' : 'رکورد'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px] font-mono text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Dev: {(stats?.deviceCommandLogsCount || 0).toLocaleString()}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Srv: {(stats?.serverCommandLogsCount || 0).toLocaleString()}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Portal: {(stats?.portalLogsCount || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Card 3: Audit Event Horizon / Date Span */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Audit Event Horizon' : 'افق زمانی رکوردهای موجود'}
            </span>
            <div className="flex items-center gap-1">
              <FieldInfoTooltip
                title={isEn ? 'Audit Event Horizon' : 'افق زمانی وقایع'}
                infoWhatEn="The span between the oldest surviving log entry and the most recent live record in the database."
                infoWhatFa="فاصله زمانی میان قدیمی‌ترین لاگ موجود در دیتابیس تا تازه‌ترین رخداد ثبت‌شده."
                infoWhyEn="Indicates whether the current retention daemon is successfully pruning expired historical data."
                infoWhyFa="مشخص‌کننده صحت عملکرد دیمن پاکسازی دوره‌ای در حذف تاریخچه قدیمی‌تر از سقف مجاز."
                infoExampleEn="e.g. Oldest: 2026-08-01, Newest: Today."
                infoExampleFa="به عنوان مثال قدیمی‌ترین: اول مرداد، تازه‌ترین: امروز."
                isEn={isEn}
                isLightMode={isLightMode}
              />
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">{isEn ? 'Oldest:' : 'قدیمی‌ترین:'}</span>
              <span className={`font-mono text-xs ${isLightMode ? 'text-slate-800 font-semibold' : 'text-slate-200'}`}>
                {formatTimestamp(stats?.oldestLogTimestamp)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">{isEn ? 'Newest:' : 'تازه‌ترین:'}</span>
              <span className={`font-mono text-xs ${isLightMode ? 'text-slate-800 font-semibold' : 'text-slate-200'}`}>
                {formatTimestamp(stats?.newestLogTimestamp)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Retention Engine & Last Cleanup Status */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Nightly Retention Daemon' : 'وضعیت دیمن دوره‌ای پاکسازی'}
            </span>
            <div className="flex items-center gap-1">
              <FieldInfoTooltip
                title={isEn ? 'Nightly Retention Daemon' : 'دیمن خودکار پاکسازی شبانه'}
                infoWhatEn="Background server worker that automatically removes records older than the retention threshold every midnight at 02:00 AM."
                infoWhatFa="سرویس پس‌زمینه سرور که هر شب در ساعت ۰۲:۰۰ بامداد رکوردهای قدیمی‌تر از بازه نگهداری را حذف می‌کند."
                infoWhyEn="Automates housekeeping without requiring manual intervention from system administrators."
                infoWhyFa="مدیریت خودکار منابع دیتابیس بدون نیاز به دخالت روزمره اپراتورهای شبکه."
                infoExampleEn="Runs every 24 hours at 02:00 AM server local time."
                infoExampleFa="هر ۲۴ ساعت در ساعت ۰۲:۰۰ بامداد سرور اجرا می‌گردد."
                isEn={isEn}
                isLightMode={isLightMode}
              />
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <History className="w-4 h-4" />
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                config.autoPurgeEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  config.autoPurgeEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {config.autoPurgeEnabled
                ? (isEn ? 'Active & Scheduled' : 'فعال و زمان‌بندی‌شده')
                : (isEn ? 'Purge Disabled' : 'حذف خودکار غیرفعال')}
            </span>
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
            <div>
              {isEn ? 'Last run:' : 'آخرین اجرا:'}{' '}
              <span className={`font-mono ${isLightMode ? 'text-slate-800' : 'text-slate-300'}`}>
                {formatTimestamp(stats?.lastCleanupTimestamp || config.lastCleanupTimestamp)}
              </span>
            </div>
            <div>
              {isEn ? 'Last purged:' : 'آخرین تعداد حذف:'}{' '}
              <span className="font-mono text-sky-400 font-semibold">
                {(stats?.lastCleanupDeletedCount || config.lastCleanupDeletedCount || 0).toLocaleString()}{' '}
                {isEn ? 'records' : 'رکورد'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Configuration Grid: Retention Policy Form + Standalone Backup Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Policy Configuration Form */}
        <div
          className={`lg:col-span-2 p-5 sm:p-6 rounded-2xl border transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center border border-sky-500/25">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Retention Horizon & Lifecycle Rules' : 'قوانین و دوره نگهداری لاگ‌ها در پایگاه داده'}
                </h2>
                <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Define how long PostgreSQL keeps historical audit and command streams.'
                    : 'مدت زمان نگهداری تاریخچه فرامین تجهیزات و رویدادهای ممیزی در دیتابیس را تعیین کنید.'}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveConfig} className="mt-5 space-y-6">
            {/* Retention Period Selection */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className={`text-xs font-bold uppercase tracking-wider ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn ? 'Configured Retention Period' : 'بازه نگهداری لاگ‌ها (روز)'}
                </label>
                <FieldInfoTooltip
                  title={isEn ? 'Configured Retention Period' : 'بازه نگهداری لاگ‌ها'}
                  infoWhatEn="The number of days an audit record remains in PostgreSQL before becoming eligible for automatic purge."
                  infoWhatFa="تعداد روزهایی که هر رکورد لاگ در دیتابیس باقی می‌ماند تا مشمول پاکسازی خودکار گردد."
                  infoWhyEn="Balances enterprise SIEM auditability against database storage growth."
                  infoWhyFa="ایجاد توازن میان الزامات ممیزی سازمانی و رشد حجم پایگاه داده."
                  infoExampleEn="Recommended value: 90 days for balanced operations, or 365 days for strict regulatory compliance."
                  infoExampleFa="مقدار توصیه‌شده: ۹۰ روز برای شرایط عادی یا ۳۶۵ روز برای انطباق‌های سخت‌گیرانه اداری."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>

              {/* Preset Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {retentionPresets.map((preset) => {
                  const isSelected = Number(config.retentionDays) === preset.days;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, retentionDays: preset.days }))}
                      className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? isLightMode
                            ? 'bg-sky-50 border-sky-500 shadow-sm text-sky-900 ring-2 ring-sky-500/20'
                            : 'bg-sky-500/15 border-sky-400/80 text-white ring-2 ring-sky-500/30'
                          : isLightMode
                          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          : 'bg-slate-800/40 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-sm font-extrabold font-mono">
                          {preset.days === 0 ? '∞' : `${preset.days} ${isEn ? 'Days' : 'روز'}`}
                        </span>
                        {isSelected ? (
                          <div className="w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5" />
                          </div>
                        ) : preset.badge ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-700/50 text-slate-400">
                            {preset.badge}
                          </span>
                        ) : null}
                      </div>
                      <span className={`text-[11px] mt-1.5 font-medium ${isSelected ? (isLightMode ? 'text-sky-800' : 'text-sky-200') : 'text-slate-400'}`}>
                        {isEn ? preset.labelEn : preset.labelFa}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Days Input */}
              <div className="mt-3.5 flex items-center gap-3">
                <span className={`text-xs ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn ? 'Or specify custom days:' : 'یا وارد کردن تعداد روز سفارشی:'}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="3650"
                    value={config.retentionDays}
                    onChange={(e) => setConfig((prev) => ({ ...prev, retentionDays: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className={`w-28 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
                        : 'bg-slate-950/80 border-slate-700 text-white focus:border-sky-400'
                    }`}
                  />
                  <span className="text-xs font-mono text-slate-400">
                    {config.retentionDays === 0
                      ? (isEn ? '(Never Purge)' : '(عدم حذف)')
                      : (isEn ? 'days' : 'روز')}
                  </span>
                </div>
              </div>
            </div>

            {/* Automation Toggles */}
            <div className="space-y-4 pt-4 border-t border-slate-800/40">
              {/* Toggle 1: Auto-Purge Daemon */}
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition ${
                  isLightMode
                    ? 'bg-slate-50/70 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Enable Automated Background Purge' : 'فعال‌سازی حذف خودکار لاگ‌های منقضی'}
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'Automated Background Purge' : 'حذف خودکار لاگ‌های منقضی'}
                      infoWhatEn="Enables scheduled nightly housekeeping to permanently delete records older than the selected retention days."
                      infoWhatFa="فعال‌سازی پاکسازی خودکار شبانه برای حذف رکوردهای کهنه‌تر از بازه تعیین‌شده."
                      infoWhyEn="Prevents the PostgreSQL database from indefinitely growing in size."
                      infoWhyFa="جلوگیری از انباشت بی‌رویه اطلاعات در دیتابیس و حفظ سرعت کوئری‌ها."
                      infoExampleEn="Runs automatically at 02:00 AM server time every night."
                      infoExampleFa="هر شب راس ساعت ۲ بامداد به وقت سرور اجرا می‌شود."
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'The background retention daemon runs nightly at 02:00 AM server time and deletes records exceeding the retention horizon.'
                      : 'دیمن پس‌زمینه سرور هر شب در ساعت ۰۲:۰۰ بامداد رکوردهایی که از بازه نگهداری عبور کرده‌اند را پاکسازی می‌نماید.'}
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={config.autoPurgeEnabled}
                    onChange={(e) => setConfig((prev) => ({ ...prev, autoPurgeEnabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                </label>
              </div>

              {/* Toggle 2: Safety Backup Before Purge */}
              <div
                className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition ${
                  isLightMode
                    ? 'bg-slate-50/70 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                      {isEn ? 'Automatic Safety Backup Prior to Purge' : 'تهیه خودکار نسخه پشتیبان مستقل پیش از حذف'}
                    </span>
                    <FieldInfoTooltip
                      title={isEn ? 'Automatic Safety Backup Prior to Purge' : 'بکاپ خودکار قبل از پاکسازی'}
                      infoWhatEn="Creates a standalone compressed snapshot of all records slated for deletion before dropping them from PostgreSQL."
                      infoWhatFa="تهیه فایل فشرده بکاپ از لاگ‌هایی که قرار است حذف شوند، درست لحظاتی پیش از پاکسازی از دیتابیس."
                      infoWhyEn="Prevents irrecoverable data loss and guarantees forensic recovery even after routine pruning."
                      infoWhyFa="جلوگیری از فقدان جبران‌ناپذیر داده‌ها و امکان بازیابی کامل در صورت نیاز به بررسی‌های امنیتی بعدی."
                      infoExampleEn="Always recommended to keep enabled (True)."
                      infoExampleFa="همواره توصیه می‌شود این گزینه فعال باشد (True)."
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Creates an encrypted standalone archive snapshot of all expiring records before permanent deletion from PostgreSQL tables.'
                      : 'یک نسخه پشتیبان فشرده و مستقل از تمام رکوردهای منقضی پیش از حذف نهایی از جداول ذخیره می‌گردد.'}
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={config.backupBeforePurge}
                    onChange={(e) => setConfig((prev) => ({ ...prev, backupBeforePurge: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="pt-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {isEn ? 'Scheduled Execution:' : 'زمان اجرای زمان‌بندی‌شده:'} {config.purgeScheduleTime || '02:00'} (Server Time)
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 active:scale-95 transition shadow-lg shadow-sky-600/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{isSaving ? (isEn ? 'Saving Changes...' : 'در حال ذخیره‌سازی...') : (isEn ? 'Save Retention Policy' : 'ذخیره و اعمال سیاست‌ها')}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column (1 Col): Standalone Backup & Export Panel */}
        <div
          className={`p-5 sm:p-6 rounded-2xl border flex flex-col justify-between transition-all ${
            isLightMode
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800 shadow-slate-950/30'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center border border-indigo-500/25">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {isEn ? 'Standalone Log Backup' : 'بکاپ مستقل از لاگ‌های دیتابیس'}
                  </h3>
                  <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Isolated export of all audit logs' : 'خروجی‌گیری مجزا از کل تاریخچه ممیزی'}
                  </p>
                </div>
              </div>
              <FieldInfoTooltip
                title={isEn ? 'Standalone Log Backup' : 'بکاپ مستقل لاگ‌ها'}
                infoWhatEn="Generates an isolated, portable archive package of all database audit tables without touching device configurations or credentials."
                infoWhatFa="ایجاد پکیج مستقل و قابل حمل از کلیه لاگ‌های ممیزی بدون اختلال در بکاپ‌های سراسری سیستم یا تنظیمات تجهیزات."
                infoWhyEn="Allows long-term cold storage of historical compliance logs on secondary storage."
                infoWhyFa="امکان نگهداری آرشیوهای بلندمدت در حافظه‌های سرد یا سرورهای بایگانی خارج از سایت."
                infoExampleEn="Export as ZIP archive for easy per-table inspection or JSON for SIEM ingestion."
                infoExampleFa="خروجی ZIP برای بررسی جدول به جدول یا JSON برای تغذیه سامانه‌های SIEM."
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            <p className={`text-xs mt-3.5 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
              {isEn
                ? 'Export all device commands, server activities, portal changes, and security events into a portable package.'
                : 'دریافت خروجی کامل از کلیه دستورات دیوایس‌ها، سرورها، وقایع ورود و ممیزی سیستم در قالب یک فایل مستقل.'}
            </p>

            <div
              className={`mt-4 p-3.5 rounded-xl border space-y-2 text-xs ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Included Records:' : 'تعداد کل رکوردها:'}</span>
                <span className="font-mono font-bold text-sky-400">
                  {(stats?.totalRecords || 0).toLocaleString()} {isEn ? 'entries' : 'مورد'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Estimated Size:' : 'حجم تخمینی:'}</span>
                <span className="font-mono font-bold text-indigo-400">
                  {stats?.totalSizeFormatted || '0 KB'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{isEn ? 'Package Version:' : 'نسخه ساختار بسته:'}</span>
                <span className="font-mono text-emerald-400">v{APP_VERSION}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            <button
              type="button"
              onClick={() => handleDownloadBackup('zip')}
              disabled={isExporting !== null}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 active:scale-95 transition shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isExporting === 'zip' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileArchive className="w-4 h-4" />
              )}
              <span>
                {isExporting === 'zip'
                  ? (isEn ? 'Generating ZIP...' : 'در حال فشرده‌سازی ZIP...')
                  : (isEn ? 'Download Standalone ZIP Archive' : 'دانلود آرشیو فشرده ZIP')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadBackup('json')}
              disabled={isExporting !== null}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition border cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              {isExporting === 'json' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-sky-400" />
              )}
              <span>
                {isExporting === 'json'
                  ? (isEn ? 'Preparing JSON...' : 'در حال تولید JSON...')
                  : (isEn ? 'Download Unified JSON Package' : 'دانلود پکیج کامل JSON')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Immediate Manual Purge / Maintenance Zone */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isLightMode
            ? 'bg-gradient-to-r from-rose-50/50 via-white to-amber-50/50 border-rose-200 shadow-sm'
            : 'bg-gradient-to-r from-rose-950/20 via-slate-900/80 to-amber-950/20 border-rose-900/40 shadow-slate-950/30'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                  {isEn ? 'Immediate Manual Log Purge' : 'پاکسازی فوری و دستی لاگ‌های پایگاه داده'}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {isEn ? 'Irreversible Action' : 'عملیات حساس و غیرقابل بازگشت'}
                </span>
              </div>
              <p className={`text-xs mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {isEn
                  ? 'Trigger an instant prune of audit records older than the selected threshold. Two-stage confirmation is required.'
                  : 'پاکسازی بلادرنگ رکوردهای لاگ قدیمی‌تر از سقف انتخابی. این عملیات نیازمند تایید دومرحله‌ای امنیتی است.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`text-xs ${isLightMode ? 'text-slate-700 font-medium' : 'text-slate-300'}`}>
                {isEn ? 'Purge older than:' : 'حذف لاگ‌های قدیمی‌تر از:'}
              </span>
              <select
                value={manualPurgeDays}
                onChange={(e) => setManualPurgeDays(Number(e.target.value))}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-800 focus:border-rose-500'
                    : 'bg-slate-900 border-slate-700 text-white focus:border-rose-400'
                }`}
              >
                <option value={30}>{isEn ? '30 Days (1 Month)' : '۳۰ روز'}</option>
                <option value={60}>{isEn ? '60 Days (2 Months)' : '۶۰ روز'}</option>
                <option value={90}>{isEn ? '90 Days (3 Months)' : '۹۰ روز'}</option>
                <option value={180}>{isEn ? '180 Days (6 Months)' : '۱۸۰ روز'}</option>
                <option value={365}>{isEn ? '365 Days (1 Year)' : '۱ سال'}</option>
                <option value={config.retentionDays}>
                  {isEn ? `Current Policy (${config.retentionDays} Days)` : `سیاست فعلی (${config.retentionDays} روز)`}
                </option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setPurgeConfirmText('');
                setIsPurgeModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 transition shadow-md shadow-rose-600/25 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isEn ? 'Purge Expired Logs Now' : 'اجرای پاکسازی دستی اکنون'}</span>
            </button>
          </div>
        </div>

        {/* Purge Result Banner if Available */}
        {purgeResult && (
          <div
            className={`mt-4 p-4 rounded-xl border space-y-2 text-xs transition-all ${
              isLightMode
                ? 'bg-white border-emerald-300 text-slate-800'
                : 'bg-slate-900 border-emerald-500/40 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isEn
                  ? `Manual purge completed in ${purgeResult.durationMs}ms. Total deleted: ${purgeResult.totalDeleted} records.`
                  : `پاکسازی دستی در مدت ${purgeResult.durationMs} میلی‌ثانیه انجام شد. مجموع حذف‌شده: ${purgeResult.totalDeleted} رکورد.`}
              </span>
            </div>
            <div className="flex items-center gap-4 flex-wrap font-mono text-[11px] text-slate-400">
              <span>Dev Logs: {purgeResult.deletedDeviceLogs}</span>
              <span>Srv Logs: {purgeResult.deletedServerLogs}</span>
              <span>Portal Logs: {purgeResult.deletedPortalLogs}</span>
              <span>Security Logs: {purgeResult.deletedAuditLogs}</span>
              <span>Cutoff: {new Date(purgeResult.cutoffDate).toLocaleDateString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Two-Stage Confirmation Modal for Manual Purge */}
      {isPurgeModalOpen && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 space-y-5 transition-all transform scale-100 ${
              isLightMode
                ? 'bg-white border-rose-300 shadow-rose-900/20 text-slate-900'
                : 'bg-slate-900 border-rose-500/40 shadow-2xl text-white'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-rose-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rose-500">
                    {isEn ? 'Confirm Manual Log Purge' : 'تایید عملیات پاکسازی دستی لاگ‌ها'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEn ? 'Two-stage verification required' : 'تایید دومرحله‌ای امنیتی الزامی است'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPurgeModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Message */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
              }`}
            >
              <p className="font-semibold">
                {isEn
                  ? `Warning: You are about to permanently purge all audit logs older than ${manualPurgeDays} days from PostgreSQL.`
                  : `هشدار: شما در شرف حذف دائمی و غیرقابل بازگشت تمامی لاگ‌های ممیزی قدیمی‌تر از ${manualPurgeDays} روز از پایگاه داده هستید.`}
              </p>
              <p className="mt-1 opacity-90">
                {isEn
                  ? 'This action affects network device commands, server sessions, and portal lifecycle logs.'
                  : 'این اقدام فرامین ثبت‌شده تجهیزات، سرورها و رویدادهای سیستمی را حذف خواهد کرد.'}
              </p>
            </div>

            {/* Safety Backup Checkbox */}
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="space-y-0.5">
                <span className="text-xs font-bold">
                  {isEn ? 'Create Safety Backup First' : 'تهیه نسخه پشتیبان ایمن پیش از حذف'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? 'Dumps an isolated archive of expiring logs before dropping them.'
                    : 'قبل از حذف، یک نسخه پشتیبان مستقل از لاگ‌های منقضی تهیه می‌کند.'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={manualBackupBeforePurge}
                onChange={(e) => setManualBackupBeforePurge(e.target.checked)}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
              />
            </div>

            {/* Type confirmation code */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 block">
                {isEn
                  ? 'Type "PURGE" to authorize this operation:'
                  : 'جهت تایید نهایی، عبارت "PURGE" را در کادر زیر وارد نمایید:'}
              </label>
              <input
                type="text"
                value={purgeConfirmText}
                onChange={(e) => setPurgeConfirmText(e.target.value)}
                placeholder="PURGE"
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-mono tracking-wider border transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-rose-500'
                    : 'bg-slate-950 border-slate-700 text-white focus:border-rose-400'
                }`}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPurgeModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  isLightMode ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleExecutePurge}
                disabled={purgeConfirmText.trim().toUpperCase() !== 'PURGE' || isPurging}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition shadow-lg shadow-rose-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                {isPurging ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>
                  {isPurging
                    ? (isEn ? 'Purging Records...' : 'در حال حذف لاگ‌ها...')
                    : (isEn ? 'Permanently Purge Logs' : 'حذف دائمی لاگ‌ها')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
