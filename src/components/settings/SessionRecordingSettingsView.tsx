import React, { useState, useEffect, useCallback } from 'react';
import {
  Video,
  HardDrive,
  Shield,
  Sliders,
  Trash2,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Terminal,
  Monitor,
  Lock,
  Film,
  FolderCheck,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchSessionRecordingSettings,
  updateSessionRecordingSettings,
  testSessionRecordingStoragePath,
  triggerSessionRecordingCleanup,
  formatBytes,
} from '../../services/sessionRecordingApi';
import type {
  SessionRecordingSettings,
  SessionRecordingHostDiagnostics,
  SessionRecordingVideoFormat,
  SessionRecordingQualityPreset,
} from '../../types';

interface SessionRecordingSettingsViewProps {
  isLightMode?: boolean;
  onOpenRecordingsArchive?: () => void;
}

export const SessionRecordingSettingsView: React.FC<SessionRecordingSettingsViewProps> = ({
  isLightMode = false,
  onOpenRecordingsArchive,
}) => {
  const { isEn } = useLanguage();
  const [settings, setSettings] = useState<SessionRecordingSettings | null>(null);
  const [diagnostics, setDiagnostics] = useState<SessionRecordingHostDiagnostics | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingPath, setTestingPath] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSessionRecordingSettings();
      setSettings(data.settings);
      setDiagnostics(data.diagnostics);
      setCanEdit(data.canEdit);
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Failed to load session recording settings.' : 'خطا در بارگذاری تنظیمات ضبط جلسات.'));
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateField = <K extends keyof SessionRecordingSettings>(
    key: K,
    value: SessionRecordingSettings[K]
  ) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!settings || !canEdit) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await updateSessionRecordingSettings(settings);
      setSettings(res.settings);
      setDiagnostics(res.diagnostics);
      setFeedback({
        type: 'success',
        message: isEn
          ? 'Session recording settings saved to database and applied immediately.'
          : 'تنظیمات ضبط جلسات در پایگاه داده ذخیره و بلافاصله اعمال شد.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Failed to save settings.' : 'خطا در ذخیره تنظیمات.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestPath = async () => {
    if (!settings) return;
    setTestingPath(true);
    setFeedback(null);
    try {
      const res = await testSessionRecordingStoragePath(settings.storagePath);
      setDiagnostics(res.diagnostics);
      setFeedback({
        type: res.diagnostics.pathWritable ? 'success' : 'error',
        message: res.diagnostics.pathWritable
          ? isEn
            ? `Storage path "${res.diagnostics.storagePath}" is writable and healthy.`
            : `مسیر ذخیره‌سازی «${res.diagnostics.storagePath}» قابل نوشتن و سالم است.`
          : res.diagnostics.error ||
            (isEn ? 'Storage path is not writable.' : 'مسیر ذخیره‌سازی قابل نوشتن نیست.'),
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Path inspection failed.' : 'بررسی مسیر با خطا مواجه شد.'),
      });
    } finally {
      setTestingPath(false);
    }
  };

  const handleManualCleanup = async () => {
    setCleaning(true);
    setFeedback(null);
    try {
      const res = await triggerSessionRecordingCleanup();
      setDiagnostics(res.diagnostics);
      setFeedback({
        type: 'success',
        message: isEn
          ? `Cleanup completed: purged ${res.result.deletedCount} recording(s), freed ${formatBytes(res.result.freedBytes)}, protected ${res.result.skippedLegalHoldCount} Legal Hold item(s).`
          : `پاکسازی انجام شد: ${res.result.deletedCount} ضبط حذف شد، ${formatBytes(res.result.freedBytes)} فضا آزاد شد و ${res.result.skippedLegalHoldCount} پرونده قفل ضدحذف محافظت گردید.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Cleanup failed.' : 'اجرای پاکسازی با خطا مواجه شد.'),
      });
    } finally {
      setCleaning(false);
    }
  };

  const surface = isLightMode
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-slate-900/70 border-slate-800 text-slate-100';
  const mutedText = isLightMode ? 'text-slate-500' : 'text-slate-400';
  const inputCls = isLightMode
    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-cyan-600 focus:bg-white'
    : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500';
  const divider = isLightMode ? 'border-slate-200' : 'border-slate-800';

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className={`border rounded-lg p-12 text-center ${surface}`}>
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-cyan-500" />
          <p className={`text-sm ${mutedText}`}>
            {isEn ? 'Loading session recording configuration and server storage diagnostics...' : 'در حال بارگذاری تنظیمات ضبط جلسات و وضعیت فضای دیسک سرور...'}
          </p>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className={`border rounded-lg p-8 text-center ${surface}`}>
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-medium mb-4">{error || (isEn ? 'Unable to load settings' : 'بارگذاری تنظیمات ممکن نشد')}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      </div>
    );
  }

  const quotaBytes = Math.max(1, settings.maxStorageGb) * 1024 * 1024 * 1024;
  const usedBytes = diagnostics?.recordingsUsedBytes || 0;
  const quotaPct = Math.min(100, Number(((usedBytes / quotaBytes) * 100).toFixed(1)));

  return (
    <div className="p-5 md:p-6 max-w-6xl mx-auto space-y-5 pb-14" dir={isEn ? 'ltr' : 'rtl'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Video className="w-5 h-5 text-cyan-500 shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight">
              {isEn ? 'Session Recording & Storage Settings' : 'تنظیمات ضبط جلسات ریموت و ذخیره‌سازی'}
            </h1>
          </div>
          <p className={`text-xs mt-1 ${mutedText}`}>
            {isEn
              ? 'Zero-disruption passive recording for Remote Servers & Automation Fleet (SSH, RDP & VNC) with background video transcoding and retention controls.'
              : 'ضبط غیرمخرب و بدون فشار برای جلسات SSH، RDP و VNC در بخش سرورهای ریموت همراه با تبدیل پس‌زمینه ویدیو و پاکسازی خودکار.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenRecordingsArchive && (
            <button
              onClick={onOpenRecordingsArchive}
              className={`px-3 py-2 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors ${
                isLightMode
                  ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {isEn ? 'Open Recordings Archive' : 'مشاهده آرشیو ضبط‌ها'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canEdit || saving}
            className="px-4 py-2 text-xs font-medium rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isEn ? 'Save Settings' : 'ذخیره تنظیمات'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-md border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? isLightMode
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : isLightMode
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Real Server Storage & Host Tooling Diagnostics Strip */}
      <div className={`border rounded-lg p-4 ${surface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-inherit">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <HardDrive className="w-4 h-4 text-cyan-500" />
            <span>{isEn ? 'Live Host Storage & Transcoder Diagnostics' : 'وضعیت زنده فضای دیسک سرور و موتور تبدیل ویدیو'}</span>
          </div>
          <span className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
            {diagnostics?.storagePath || settings.storagePath}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Path Writability */}
          <div className="space-y-1">
            <div className={`text-[11px] ${mutedText}`}>{isEn ? 'Storage Directory' : 'وضعیت مسیر ذخیره'}</div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {diagnostics?.pathWritable ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-emerald-500">{isEn ? 'Writable & Ready' : 'قابل نوشتن و آماده'}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="text-rose-500">{isEn ? 'Not Writable' : 'عدم دسترسی نوشتن'}</span>
                </>
              )}
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              {diagnostics?.recordingsCount || 0} {isEn ? 'recordings stored' : 'ضبط ذخیره شده'}
            </div>
          </div>

          {/* Recordings Quota Usage */}
          <div className="space-y-1">
            <div className={`text-[11px] ${mutedText}`}>{isEn ? 'Archive Quota Used' : 'مصرف سهمیه آرشیو'}</div>
            <div className="text-sm font-semibold font-mono tabular-nums">
              {formatBytes(usedBytes)}{' '}
              <span className={`text-xs font-normal ${mutedText}`}>/ {settings.maxStorageGb} GB ({quotaPct}%)</span>
            </div>
            <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLightMode ? 'bg-slate-200' : 'bg-slate-800'}`}>
              <div
                className={`h-full transition-all ${quotaPct > 85 ? 'bg-rose-500' : quotaPct > 65 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
          </div>

          {/* Host Partition Free Space */}
          <div className="space-y-1">
            <div className={`text-[11px] ${mutedText}`}>{isEn ? 'Host Disk Free Space' : 'فضای خالی پارتیشن سرور'}</div>
            <div className="text-sm font-semibold font-mono tabular-nums">
              {diagnostics?.diskTotalBytes ? formatBytes(diagnostics.diskFreeBytes) : '—'}
              {diagnostics?.diskTotalBytes ? (
                <span className={`text-xs font-normal ${mutedText}`}>
                  {' '}
                  / {formatBytes(diagnostics.diskTotalBytes)}
                </span>
              ) : null}
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              {diagnostics?.diskTotalBytes
                ? `${diagnostics.diskFreePercent}% ${isEn ? 'free' : 'خالی'} · ${isEn ? 'Floor' : 'حداقل ایمن'} ${settings.minFreeDiskPercent}%`
                : isEn
                ? 'Disk metrics unavailable'
                : 'اطلاعات دیسک در دسترس نیست'}
            </div>
          </div>

          {/* Transcoder Binaries */}
          <div className="space-y-1">
            <div className={`text-[11px] ${mutedText}`}>{isEn ? 'Background Transcoder' : 'موتور تبدیل پس‌زمینه'}</div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className={diagnostics?.ffmpegAvailable ? 'text-emerald-500 font-medium' : 'text-amber-500'}>
                ffmpeg: {diagnostics?.ffmpegAvailable ? (isEn ? 'OK' : 'نصب') : (isEn ? 'Missing' : 'نصب نیست')}
              </span>
              <span className={mutedText}>·</span>
              <span className={diagnostics?.guacencAvailable ? 'text-emerald-500 font-medium' : 'text-amber-500'}>
                guacenc: {diagnostics?.guacencAvailable ? (isEn ? 'OK' : 'نصب') : (isEn ? 'Missing' : 'نصب نیست')}
              </span>
            </div>
            <div className={`text-[11px] ${mutedText}`}>
              {diagnostics?.ffmpegAvailable && diagnostics?.guacencAvailable
                ? isEn
                  ? 'MP4 / WebM background conversion active'
                  : 'تبدیل خودکار MP4 / WebM فعال است'
                : isEn
                ? 'Native .guac player active (install guacenc + ffmpeg for MP4/WebM)'
                : 'پخش بومی .guac فعال است (برای خروجی MP4/WebM نصب guacenc لازم است)'}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Section 1: Capture Scope & Protocols */}
        <div className={`border rounded-lg p-5 space-y-4 ${surface}`}>
          <div className={`flex items-center gap-2 pb-3 border-b ${divider}`}>
            <Sliders className="w-4 h-4 text-cyan-500" />
            <h2 className="text-sm font-semibold">
              {isEn ? 'Capture Scope & Protocols' : 'دامنه ضبط و پروتکل‌ها'}
            </h2>
          </div>

          {/* Master Switch */}
          <label className={`flex items-center justify-between gap-3 p-3 rounded-md border cursor-pointer ${divider}`}>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span>{isEn ? 'Enable Session Recording Globally' : 'فعال‌سازی سراسری ضبط جلسات'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Master switch controlling passive session recording for all Remote Servers & Automation Fleet hosts."
                  infoWhatFa="کلید اصلی فعال یا غیرفعال‌سازی ضبط جلسات برای کل سرورهای بخش Remote Servers."
                  infoWhyEn="Allows instant compliance enforcement across the fleet while individual servers can still override via Inherit / Always / Disabled."
                  infoWhyFa="امکان اعمال سریع سیاست نظارتی بر کل سرورها را فراهم می‌کند؛ در عین حال هر سرور می‌تواند سیاست اختصاصی خود را داشته باشد."
                  infoExampleEn="Enabled globally, with sensitive production servers pinned to Always Record."
                  infoExampleFa="فعال به صورت سراسری و تنظیم سرورهای حساس روی حالت ضبط همیشگی."
                />
              </div>
              <p className={`text-[11px] ${mutedText}`}>
                {isEn
                  ? 'Applies to all servers set to "Inherit Global" in Remote Servers.'
                  : 'برای همه سرورهایی که روی «تبعیت از تنظیمات سراسری» هستند اعمال می‌شود.'}
              </p>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.enabled}
              onChange={(e) => updateField('enabled', e.target.checked)}
              className="w-4 h-4 accent-cyan-600 rounded"
            />
          </label>

          {/* Protocol Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className={`flex items-center justify-between p-3 rounded-md border cursor-pointer ${divider}`}>
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-medium">SSH</span>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.recordSsh}
                onChange={(e) => updateField('recordSsh', e.target.checked)}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
            </label>

            <label className={`flex items-center justify-between p-3 rounded-md border cursor-pointer ${divider}`}>
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-medium">RDP</span>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.recordRdp}
                onChange={(e) => updateField('recordRdp', e.target.checked)}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
            </label>

            <label className={`flex items-center justify-between p-3 rounded-md border cursor-pointer ${divider}`}>
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-violet-500" />
                <span className="text-xs font-medium">VNC</span>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.recordVnc}
                onChange={(e) => updateField('recordVnc', e.target.checked)}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
            </label>
          </div>

          {/* Security Toggles */}
          <div className="space-y-2.5 pt-1">
            <label className={`flex items-center justify-between gap-3 p-3 rounded-md border cursor-pointer ${divider}`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Shield className="w-3.5 h-3.5 text-cyan-500" />
                  <span>{isEn ? 'Mask Sensitive Inputs & Clipboard' : 'سانسور خودکار رمزهای عبور و کلیپ‌بورد حساس'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    infoWhatEn="Automatically strips password prompts from SSH command markers and suppresses server clipboard streams during RDP/VNC recording."
                    infoWhatFa="به صورت خودکار رمزهای عبور تایپ‌شده در ترمینال SSH و محتوای کلیپ‌بورد ریموت دسکتاپ را از فایل ضبط حذف می‌کند."
                    infoWhyEn="Prevents accidental leakage of sudo, database, or administrator credentials to auditors reviewing recordings."
                    infoWhyFa="از افشای ناخواسته رمزهای عبور ادمین‌ها و دیتابیس‌ها هنگام بازبینی ضبط‌ها توسط ممیزان جلوگیری می‌کند."
                    infoExampleEn="Recommended: Keep enabled for ISO 27001 and SOC 2 compliance."
                    infoExampleFa="پیشنهادی: برای انطباق با استانداردهای امنیتی همیشه فعال نگه دارید."
                  />
                </div>
                <p className={`text-[11px] ${mutedText}`}>
                  {isEn
                    ? 'Redacts SSH password prompts and RDP/VNC clipboard streams.'
                    : 'حذف رمزهای sudo/passwd در SSH و کلیپ‌بورد در RDP/VNC.'}
                </p>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.maskSensitiveInput}
                onChange={(e) => updateField('maskSensitiveInput', e.target.checked)}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
            </label>

            <label className={`flex items-center justify-between gap-3 p-3 rounded-md border cursor-pointer ${divider}`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isEn ? 'AES-256-GCM Encryption at Rest' : 'رمزنگاری فایل‌های ضبط روی دیسک (AES-256-GCM)'}</span>
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    infoWhatEn="Encrypts finalized recording files on the server disk using the panel master AES-256-GCM keychain."
                    infoWhatFa="فایل‌های ضبط‌شده را پس از پایان جلسه با کلید اصلی AES-256-GCM پنل روی دیسک رمزنگاری می‌کند."
                    infoWhyEn="Protects archived terminal and desktop recordings even if raw server storage or backups are copied offline."
                    infoWhyFa="حتی در صورت دسترسی مستقیم به فایل‌های دیسک یا بکاپ سرور، محتوای ویدیوها و ترمینال غیرقابل خواندن باقی می‌ماند."
                    infoExampleEn="Decryption occurs transparently on the server only for RBAC-authorized playback/download."
                    infoExampleFa="رمزگشایی فقط لحظه پخش یا دانلود برای کاربران مجاز در سمت سرور انجام می‌شود."
                  />
                </div>
                <p className={`text-[11px] ${mutedText}`}>
                  {isEn
                    ? 'Transparently decrypted server-side only for authorized playback/download.'
                    : 'رمزگشایی شفاف در سمت سرور فقط برای کاربران دارای مجوز RBAC.'}
                </p>
              </div>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={settings.encryptAtRest}
                onChange={(e) => updateField('encryptAtRest', e.target.checked)}
                className="w-4 h-4 accent-cyan-600 rounded"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Storage Location on Server */}
        <div className={`border rounded-lg p-5 space-y-4 ${surface}`}>
          <div className={`flex items-center gap-2 pb-3 border-b ${divider}`}>
            <HardDrive className="w-4 h-4 text-cyan-500" />
            <h2 className="text-sm font-semibold">
              {isEn ? 'Server Storage Path & Safety Guard' : 'مسیر ذخیره‌سازی روی سرور و محافظ فضای دیسک'}
            </h2>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium">
                {isEn ? 'Recording Storage Directory (Server Path)' : 'مسیر پوشه ذخیره‌سازی روی سرور'}
              </label>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Absolute filesystem path on the NetTopology server where SSH (.cast) and RDP/VNC (.guac / .mp4 / .webm) recordings are stored."
                infoWhatFa="مسیر مطلق پوشه روی سرور لینوکسی پنل که فایل‌های ضبط SSH و RDP/VNC در آن (بر اساس سال/ماه/روز) ذخیره می‌شوند."
                infoWhyEn="Allows pointing recordings to a dedicated NAS/NFS mount or secondary large disk partition so the root OS drive never fills up."
                infoWhyFa="امکان ذخیره فایل‌ها روی هارد مجزا یا NAS/NFS را فراهم می‌کند تا فضای دیسک سیستم‌عامل پر نشود."
                infoExampleEn="/mnt/recordings/nettopology or /opt/nettopology/backend/recordings"
                infoExampleFa="/mnt/recordings/nettopology یا /opt/nettopology/backend/recordings"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                disabled={!canEdit}
                value={settings.storagePath}
                onChange={(e) => updateField('storagePath', e.target.value)}
                placeholder="/var/lib/nettopology/recordings"
                className={`flex-1 px-3 py-2 text-xs font-mono rounded-md border outline-none transition-colors ${inputCls}`}
              />
              <button
                type="button"
                onClick={handleTestPath}
                disabled={testingPath}
                className={`px-3 py-2 text-xs font-medium rounded-md border flex items-center gap-1.5 shrink-0 transition-colors ${
                  isLightMode
                    ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
                    : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100'
                }`}
              >
                {testingPath ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderCheck className="w-3.5 h-3.5" />}
                {isEn ? 'Test Path' : 'تست مسیر'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">
                  {isEn ? 'Max Archive Quota (GB)' : 'حداکثر سقف حجم آرشیو (گیگابایت)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Maximum disk space allowed for all stored session recordings combined."
                  infoWhatFa="حداکثر حجم مجاز کل فایل‌های ضبط‌شده روی سرور."
                  infoWhyEn="Prevents recordings from growing unbounded; when exceeded, the retention daemon purges the oldest non-locked recordings first."
                  infoWhyFa="از رشد بی‌رویه حجم آرشیو جلوگیری می‌کند؛ با رسیدن به سقف، قدیمی‌ترین فایل‌های بدون قفل ضدحذف پاکسازی می‌شوند."
                  infoExampleEn="50 GB (small team) or 500 GB (enterprise fleet)"
                  infoExampleFa="۵۰ گیگابایت برای تیم کوچک یا ۵۰۰ گیگابایت برای دیتاسنتر بزرگ"
                />
              </div>
              <input
                type="number"
                min={1}
                max={100000}
                disabled={!canEdit}
                value={settings.maxStorageGb}
                onChange={(e) => updateField('maxStorageGb', Math.max(1, Number(e.target.value) || 1))}
                className={`w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border outline-none ${inputCls}`}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">
                  {isEn ? 'Min Free Disk Guard (%)' : 'حداقل فضای خالی ایمن دیسک (%)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Safety threshold of free disk percentage below which new recordings are automatically paused."
                  infoWhatFa="آستانه ایمنی درصد فضای خالی دیسک که در صورت کاهش از آن، ضبط جلسات جدید متوقف می‌شود."
                  infoWhyEn="Guarantees recording can never crash the host OS or PostgreSQL database due to a 100% full partition, while live SSH/RDP still connect normally."
                  infoWhyFa="تضمین می‌کند پر شدن هارد هرگز باعث اختلال در سیستم‌عامل یا دیتابیس نشود؛ در عین حال اتصال زنده SSH و RDP بدون مشکل ادامه می‌یابد."
                  infoExampleEn="5% (default) or 10% for shared OS partitions"
                  infoExampleFa="۵٪ (پیش‌فرض) یا ۱۰٪ برای پارتیشن‌های مشترک با سیستم‌عامل"
                />
              </div>
              <input
                type="number"
                min={1}
                max={50}
                disabled={!canEdit}
                value={settings.minFreeDiskPercent}
                onChange={(e) => updateField('minFreeDiskPercent', Math.min(50, Math.max(1, Number(e.target.value) || 5)))}
                className={`w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border outline-none ${inputCls}`}
              />
            </div>
          </div>

          <label className={`flex items-center justify-between gap-3 p-3 rounded-md border cursor-pointer ${divider}`}>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span>{isEn ? 'Delete Raw .guac After Successful Video Conversion' : 'حذف فایل خام .guac پس از تبدیل موفق به ویدیو'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Removes the intermediate raw Guacamole stream file once MP4/WebM transcoding succeeds and is verified."
                  infoWhatFa="پس از تبدیل موفق و تایید سلامت فایل MP4 یا WebM، فایل خام .guac را جهت صرفه‌جویی در فضا حذف می‌کند."
                  infoWhyEn="Reduces disk footprint when you only need downloadable MP4/WebM playback."
                  infoWhyFa="مصرف فضای دیسک را کاهش می‌دهد؛ در صورت خطا در تبدیل، فایل خام هرگز حذف نخواهد شد."
                  infoExampleEn="Keep disabled if you want lossless native .guac playback alongside MP4."
                  infoExampleFa="اگر می‌خواهید علاوه بر MP4 فایل خام بدون افت کیفیت نیز باقی بماند، غیرفعال بگذارید."
                />
              </div>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.deleteRawAfterTranscode}
              onChange={(e) => updateField('deleteRawAfterTranscode', e.target.checked)}
              className="w-4 h-4 accent-cyan-600 rounded"
            />
          </label>
        </div>

        {/* Section 3: Video Format & Quality Presets (RDP / VNC) */}
        <div className={`border rounded-lg p-5 space-y-4 ${surface}`}>
          <div className={`flex items-center gap-2 pb-3 border-b ${divider}`}>
            <Film className="w-4 h-4 text-cyan-500" />
            <h2 className="text-sm font-semibold">
              {isEn ? 'Video Format & Quality (RDP / VNC)' : 'فرمت خروجی و کیفیت ویدیو (RDP / VNC)'}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">{isEn ? 'Output Video Format' : 'فرمت خروجی ویدیو'}</label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Container and codec used for background transcoding of RDP/VNC sessions."
                  infoWhatFa="فرمت فایل نهایی که جلسات RDP و VNC در پس‌زمینه (با اولویت CPU پایین) به آن تبدیل می‌شوند."
                  infoWhyEn="MP4 (H.264) provides universal playback on Windows, macOS, and browsers; WebM (VP9) achieves smaller files; Raw Only skips transcoding for zero CPU usage."
                  infoWhyFa="فرمت MP4 سازگاری کامل با همه سیستم‌ها دارد، WebM حجم کمتری می‌گیرد و حالت Raw Only بدون مصرف CPU فایل را مستقیم در پنل پخش می‌کند."
                  infoExampleEn="MP4 (H.264) — Recommended for compliance archives"
                  infoExampleFa="MP4 (H.264) — پیشنهادی برای آرشیو و دانلود استاندارد"
                />
              </div>
              <select
                disabled={!canEdit}
                value={settings.videoFormat}
                onChange={(e) => updateField('videoFormat', e.target.value as SessionRecordingVideoFormat)}
                className={`w-full px-3 py-2 text-xs rounded-md border outline-none ${inputCls}`}
              >
                <option value="mp4">{isEn ? 'MP4 (H.264 — Universal)' : 'MP4 (H.264 — استاندارد و سازگار)'}</option>
                <option value="webm">{isEn ? 'WebM (VP9 — Compact)' : 'WebM (VP9 — کم‌حجم)'}</option>
                <option value="both">{isEn ? 'MP4 + Keep Native .guac' : 'MP4 + نگهداری فایل خام .guac'}</option>
                <option value="guac_only">{isEn ? 'Native .guac Only (Zero CPU Transcode)' : 'فقط فایل خام .guac (بدون تبدیل CPU)'}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">{isEn ? 'Quality Preset' : 'پروفایل کیفیت'}</label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Controls frame rate, bitrate, and target resolution for background video conversion."
                  infoWhatFa="نرخ فریم، بیت‌ریت و رزولوشن تبدیل ویدیوهای RDP و VNC را تعیین می‌کند."
                  infoWhyEn="Balances visual sharpness of desktop text against archive disk consumption."
                  infoWhyFa="تعادل میان خوانایی متن‌های دسکتاپ و حجم فایل‌های ذخیره‌شده روی سرور را برقرار می‌کند."
                  infoExampleEn="Balanced (15 FPS · 900 kbps · 720p) uses ~6 MB per minute."
                  infoExampleFa="متعادل (۱۵ فریم · ۹۰۰ کیلوبیت · 720p) حدود ۶ مگابایت در دقیقه مصرف دارد."
                />
              </div>
              <select
                disabled={!canEdit}
                value={settings.qualityPreset}
                onChange={(e) => updateField('qualityPreset', e.target.value as SessionRecordingQualityPreset)}
                className={`w-full px-3 py-2 text-xs rounded-md border outline-none ${inputCls}`}
              >
                <option value="low">{isEn ? 'Low — Compact (8 FPS · 350 kbps · 576p)' : 'کم‌حجم (۸ فریم · ۳۵۰ kbps · 576p)'}</option>
                <option value="balanced">{isEn ? 'Balanced — Recommended (15 FPS · 900 kbps · 720p)' : 'متعادل — پیشنهادی (۱۵ فریم · ۹۰۰ kbps · 720p)'}</option>
                <option value="high">{isEn ? 'High — Crisp Text (24 FPS · 2200 kbps · 1080p)' : 'بالا — وضوح کامل متن (۲۴ فریم · ۲۲۰۰ kbps · 1080p)'}</option>
                <option value="custom">{isEn ? 'Custom Parameters' : 'تنظیمات دستی (Custom)'}</option>
              </select>
            </div>
          </div>

          {settings.qualityPreset === 'custom' && (
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-md border ${divider}`}>
              <div className="space-y-1">
                <label className={`text-[11px] font-medium ${mutedText}`}>FPS (5–60)</label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  disabled={!canEdit}
                  value={settings.customFps}
                  onChange={(e) => updateField('customFps', Number(e.target.value) || 15)}
                  className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border outline-none ${inputCls}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-[11px] font-medium ${mutedText}`}>{isEn ? 'Bitrate (kbps)' : 'بیت‌ریت (kbps)'}</label>
                <input
                  type="number"
                  min={150}
                  max={12000}
                  disabled={!canEdit}
                  value={settings.customBitrateKbps}
                  onChange={(e) => updateField('customBitrateKbps', Number(e.target.value) || 900)}
                  className={`w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border outline-none ${inputCls}`}
                />
              </div>
              <div className="space-y-1">
                <label className={`text-[11px] font-medium ${mutedText}`}>{isEn ? 'Max Resolution' : 'حداکثر رزولوشن'}</label>
                <select
                  disabled={!canEdit}
                  value={`${settings.customMaxWidth}x${settings.customMaxHeight}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split('x').map(Number);
                    updateField('customMaxWidth', w || 1280);
                    updateField('customMaxHeight', h || 720);
                  }}
                  className={`w-full px-2.5 py-1.5 text-xs font-mono rounded border outline-none ${inputCls}`}
                >
                  <option value="1024x576">1024x576</option>
                  <option value="1280x720">1280x720</option>
                  <option value="1920x1080">1920x1080</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium">
                {isEn ? 'Max Concurrent Background Transcodes' : 'حداکثر تبدیل همزمان در پس‌زمینه'}
              </label>
              <FieldInfoTooltip
                isEn={isEn}
                isLightMode={isLightMode}
                infoWhatEn="Maximum number of RDP/VNC recordings converted simultaneously at low CPU priority (nice -n 15)."
                infoWhatFa="حداکثر تعداد ویدیوهایی که به صورت همزمان در پس‌زمینه (با اولویت CPU پایین nice -n 15) تبدیل می‌شوند."
                infoWhyEn="Protects live RDP, SSH, and web panel responsiveness from CPU spikes during peak admin activity."
                infoWhyFa="از ایجاد فشار روی CPU سرور و کند شدن جلسات زنده جلوگیری می‌کند."
                infoExampleEn="1 (recommended for 2–4 vCPU hosts), 2 for 8+ vCPU servers."
                infoExampleFa="۱ (پیشنهادی برای سرورهای ۲ تا ۴ هسته‌ای) یا ۲ برای سرورهای پرقدرت."
              />
            </div>
            <input
              type="number"
              min={1}
              max={4}
              disabled={!canEdit}
              value={settings.maxConcurrentTranscodes}
              onChange={(e) => updateField('maxConcurrentTranscodes', Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
              className={`w-32 px-3 py-2 text-xs font-mono tabular-nums rounded-md border outline-none ${inputCls}`}
            />
          </div>
        </div>

        {/* Section 4: Automated Retention & Cleanup Policy */}
        <div className={`border rounded-lg p-5 space-y-4 ${surface}`}>
          <div className={`flex items-center justify-between pb-3 border-b ${divider}`}>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-cyan-500" />
              <h2 className="text-sm font-semibold">
                {isEn ? 'Retention Period & Auto-Purge' : 'مدت نگهداری و پاکسازی خودکار'}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleManualCleanup}
              disabled={!canEdit || cleaning}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors ${
                isLightMode
                  ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100'
              }`}
            >
              {cleaning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isEn ? 'Run Cleanup Now' : 'اجرای پاکسازی اکنون'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">
                  {isEn ? 'SSH Retention (Days)' : 'مدت نگهداری ضبط SSH (روز)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Number of days SSH terminal recordings (.cast) are kept before automated purge."
                  infoWhatFa="تعداد روزهایی که فایل‌های ضبط ترمینال SSH قبل از حذف خودکار نگهداری می‌شوند."
                  infoWhyEn="SSH recordings are tiny (kilobytes per hour), allowing much longer audit retention than video."
                  infoWhyFa="فایل‌های SSH بسیار کم‌حجم (در حد کیلوبایت) هستند، بنابراین می‌توان آن‌ها را برای دوره‌های طولانی‌تری نگهداری کرد."
                  infoExampleEn="90 or 180 days"
                  infoExampleFa="۹۰ روز یا ۱۸۰ روز"
                />
              </div>
              <input
                type="number"
                min={1}
                max={3650}
                disabled={!canEdit}
                value={settings.sshRetentionDays}
                onChange={(e) => updateField('sshRetentionDays', Math.max(1, Number(e.target.value) || 90))}
                className={`w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border outline-none ${inputCls}`}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium">
                  {isEn ? 'RDP / VNC Retention (Days)' : 'مدت نگهداری ویدیوهای RDP/VNC (روز)'}
                </label>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Number of days RDP and VNC visual session recordings are retained before automated cleanup."
                  infoWhatFa="تعداد روزهایی که ویدیوهای ضبط‌شده ریموت دسکتاپ (RDP و VNC) قبل از حذف خودکار نگه داشته می‌شوند."
                  infoWhyEn="Keeps video storage predictable while retaining sufficient forensic history."
                  infoWhyFa="حجم مصرفی ویدیوها را در بازه قابل پیش‌بینی نگه می‌دارد و تاریخچه کافی برای بررسی حوادث فراهم می‌کند."
                  infoExampleEn="30 days (standard) or 90 days (regulated environments)"
                  infoExampleFa="۳۰ روز (استاندارد) یا ۹۰ روز (محیط‌های بانکی و حساس)"
                />
              </div>
              <input
                type="number"
                min={1}
                max={3650}
                disabled={!canEdit}
                value={settings.rdpRetentionDays}
                onChange={(e) => updateField('rdpRetentionDays', Math.max(1, Number(e.target.value) || 30))}
                className={`w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border outline-none ${inputCls}`}
              />
            </div>
          </div>

          <label className={`flex items-center justify-between gap-3 p-3 rounded-md border cursor-pointer ${divider}`}>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span>{isEn ? 'Enable Hourly Automated Cleanup Daemon' : 'فعال‌سازی پاکسازی خودکار ساعتی'}</span>
                <FieldInfoTooltip
                  isEn={isEn}
                  isLightMode={isLightMode}
                  infoWhatEn="Runs an hourly background sweep that deletes expired recordings and enforces the Max Archive Quota."
                  infoWhatFa="سرویس پس‌زمینه‌ای که هر ساعت فایل‌های منقضی‌شده و مازاد سهمیه حجم را به صورت خودکار پاکسازی می‌کند."
                  infoWhyEn="Eliminates manual disk maintenance while strictly preserving every recording marked with Legal Hold."
                  infoWhyFa="نیاز به پاکسازی دستی را از بین می‌برد و همزمان فایل‌های دارای قفل ضدحذف (Legal Hold) را کاملاً حفظ می‌کند."
                  infoExampleEn="Legal Hold recordings are NEVER deleted by automated cleanup."
                  infoExampleFa="پرونده‌های دارای قفل ضدحذف هرگز توسط پاکسازی خودکار حذف نمی‌شوند."
                />
              </div>
              <p className={`text-[11px] ${mutedText}`}>
                {isEn
                  ? 'Recordings with Legal Hold enabled are strictly immune to auto-purge.'
                  : 'ضبط‌های دارای قفل ضدحذف (Legal Hold) هرگز توسط پاکسازی خودکار حذف نمی‌شوند.'}
              </p>
            </div>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={settings.autoCleanupEnabled}
              onChange={(e) => updateField('autoCleanupEnabled', e.target.checked)}
              className="w-4 h-4 accent-cyan-600 rounded"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
