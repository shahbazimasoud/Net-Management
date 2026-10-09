import React, { useState } from 'react';
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
  ExternalLink,
  Layers,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { APP_VERSION, RELEASE_HISTORY, ReleaseNote } from '../../version';
import { useLanguage } from '../../i18n';
import { useUpdate } from '../../context/UpdateContext';
import { useAuth } from '../../context/AuthContext';
import { canUserCheckUpdate, canUserPerformUpdate } from '../../utils/rbac';

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
  const { user, effectivePolicy } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'major' | 'minor' | 'patch'>('all');
  const [isCleanRebuild, setIsCleanRebuild] = useState(false);

  const canCheck = canUserCheckUpdate(user, effectivePolicy);
  const canPerform = canUserPerformUpdate(user, effectivePolicy);
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const remoteNote = updateInfo?.releaseNote;

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
                  ? 'Verify remote GitHub releases, review comprehensive changelogs, and upgrade your system with single-click automation.'
                  : 'بررسی نسخه‌های منتشرشده در مخزن رسمی گیت‌هاب، مشاهده جزئیات تغییرات و ارتقای خودکار سیستم با یک کلیک.'}
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
                    ? (isEn ? 'Connecting to GitHub...' : 'در حال استعلام از گیت‌هاب...')
                    : (isEn ? 'Check for Updates' : 'بررسی نسخه جدید (GitHub)')}
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
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/85 via-slate-900/90 to-purple-950/85 border border-indigo-500/50 shadow-2xl shadow-indigo-950/50 space-y-5 animate-fadeIn relative overflow-hidden">
          {/* Subtle Ambient Pulse */}
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Header with Title and Current Progress */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-cyan-300 shadow-lg shadow-indigo-500/20 shrink-0">
                <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {isEn ? 'System Update Pipeline In Progress...' : 'عملیات به‌روزرسانی پنل در حال اجراست...'}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {isEn ? `Phase ${updateStep} of 6` : `گام ${updateStep} از ۶`}
                  </span>
                </div>
                <p className="text-xs text-slate-300/80 mt-1">
                  {isEn
                    ? 'Executing safe update pipeline, database snapshot & building production assets...'
                    : 'در حال اجرای خط لوله امن ارتقا، تهیه پشتیبان دیتابیس و بیلد نرم‌افزار...'}
                </p>
              </div>
            </div>

            {/* Percentage Badge */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-black/50 border border-cyan-500/40 self-start sm:self-auto shadow-inner">
              <span className="text-xs text-cyan-300 font-mono">{isEn ? 'Progress:' : 'پیشرفت:'}</span>
              <span className="text-xl font-mono font-black text-cyan-300">{updateProgress}%</span>
            </div>
          </div>

          {/* Interactive Progress Bar */}
          <div className="space-y-2 relative z-10">
            <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
              <span className="text-cyan-300 font-semibold truncate max-w-[85%]">
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
              <span className="text-indigo-300 font-bold shrink-0">{updateProgress}%</span>
            </div>

            {/* Animated Gradient Bar */}
            <div className="w-full h-3.5 rounded-full bg-slate-950 border border-white/10 overflow-hidden relative p-0.5 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 transition-all duration-700 ease-out relative shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                style={{ width: `${Math.max(5, Math.min(100, updateProgress))}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
              </div>
            </div>

            {/* 6 Step Indicators */}
            <div className="grid grid-cols-6 gap-1.5 pt-1">
              {[
                { step: 1, label_en: 'Init', label_fa: 'آغاز' },
                { step: 2, label_en: 'Sync', label_fa: 'گیت' },
                { step: 3, label_en: 'Deps', label_fa: 'پکیج‌ها' },
                { step: 4, label_en: 'Backend', label_fa: 'بک‌اند' },
                { step: 5, label_en: 'Build', label_fa: 'بیلد' },
                { step: 6, label_en: 'Restart', label_fa: 'ری‌استارت' },
              ].map((s) => {
                const isDone = updateStep > s.step;
                const isCurrent = updateStep === s.step;
                return (
                  <div key={s.step} className="flex flex-col items-center gap-1 text-center">
                    <div
                      className={`w-full h-1.5 rounded-full transition-all ${
                        isDone
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                          : isCurrent
                          ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                          : 'bg-slate-800'
                      }`}
                    />
                    <span
                      className={`text-[9px] font-mono truncate max-w-full ${
                        isDone
                          ? 'text-emerald-300 font-medium'
                          : isCurrent
                          ? 'text-cyan-300 font-bold'
                          : 'text-slate-500'
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
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Live Terminal Output' : 'خروجی زنده کنسول'}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {updateLogs.length} {isEn ? 'entries' : 'سطر'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/90 border border-white/10 font-mono text-xs text-slate-300 max-h-56 overflow-y-auto space-y-1.5 custom-scrollbar">
              {updateLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-cyan-400 shrink-0">›</span>
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
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {isEn ? `New Version v${updateInfo?.latestVersion} Published on GitHub` : `نسخه جدید v${updateInfo?.latestVersion} در گیت‌هاب منتشر شد`}
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

            <div className="flex items-center gap-3">
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
                  ? `Installed Version v${APP_VERSION} matches the latest stable release published on GitHub.`
                  : `نسخه نصب‌شده v${APP_VERSION} دقیقاً مطابق با آخرین ریلیز پایدار در مخزن گیت‌هاب می‌باشد.`}
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

          {/* Filters & Search */}
          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-white/10'}`}>
              {(['all', 'major', 'minor', 'patch'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer capitalize ${
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

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

        {/* List of Releases */}
        <div className="space-y-4">
          {filteredHistory.length > 0 ? (
            filteredHistory.map((note) => {
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
      </div>
    </div>
  );
};
