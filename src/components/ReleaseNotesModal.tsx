import React from 'react';
import {
  Tag,
  Sparkles,
  X,
  Calendar,
  CheckCircle2,
  History,
  ArrowUpCircle,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Terminal,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { APP_VERSION, RELEASE_HISTORY } from '../version';
import { useLanguage } from '../i18n/LanguageContext';
import { useUpdate } from '../context/UpdateContext';

interface ReleaseNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ isOpen, onClose }) => {
  const { t, isEn, isRtl } = useLanguage();
  const {
    updateInfo,
    checking,
    updating,
    updateSuccess,
    updateLogs,
    error,
    countdown,
    checkUpdate,
    performUpdate,
    toggleSimulatedUpdate,
    isSimulated,
  } = useUpdate();

  if (!isOpen) return null;

  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const remoteNote = updateInfo?.releaseNote;
  const newVersionTitle = remoteNote
    ? isEn && remoteNote.title_en
      ? remoteNote.title_en
      : remoteNote.title
    : t('update_ready_to_install');
  const newVersionChanges = remoteNote
    ? isEn && remoteNote.changes_en
      ? remoteNote.changes_en
      : remoteNote.changes
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 modal-backdrop-blur animate-fade-in"
      data-modal-backdrop="true"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] sm:max-h-[86vh] flex flex-col rounded-2xl spatial-glass border border-white/20 text-slate-100 shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden my-auto">
        {/* Header (Pinned) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-900/85 shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {t('release_notes_title')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  v{APP_VERSION}
                </span>

                {hasUpdate && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/25 text-rose-300 border border-rose-500/40 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                    <span>v{updateInfo?.latestVersion} {t('update_available_badge')}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{t('release_notes_subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label={t('action_close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Active Update Ready Banner & In-Panel Updater Section */}
          {hasUpdate && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-950/60 via-indigo-950/40 to-slate-900/90 border-2 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.25)] relative overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500"></div>

              {/* Title Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                  </span>
                  <span className="font-mono text-base font-bold text-white px-2.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/40">
                    v{updateInfo?.latestVersion}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full uppercase bg-rose-500/30 text-rose-200 border border-rose-500/40">
                    {t('update_available_badge')}
                  </span>
                  {isSimulated && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      DEMO MODE
                    </span>
                  )}
                </div>

                {remoteNote?.releaseDate && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-300/80 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{remoteNote.releaseDate}</span>
                  </div>
                )}
              </div>

              {/* Release Header Description */}
              <h3 className="text-sm sm:text-base font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span>{newVersionTitle}</span>
              </h3>

              {/* Remote Release Changes */}
              {newVersionChanges.length > 0 && (
                <div className="mb-4 bg-black/30 rounded-xl p-3 border border-white/10">
                  <div className="text-[11px] font-bold text-slate-300 mb-2">
                    {isEn ? `What's new in v${updateInfo?.latestVersion}:` : `لیست تغییرات نگارش جدید (v${updateInfo?.latestVersion}):`}
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {newVersionChanges.map((change, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Status and Action Buttons */}
              <div className="mt-4 pt-3 border-t border-rose-500/20">
                {updateSuccess ? (
                  <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white">
                          {isEn ? 'Panel Updated Successfully!' : 'پنل با موفقیت به نگارش جدید ارتقا یافت!'}
                        </div>
                        <div className="text-xs text-emerald-300/90 mt-0.5">
                          {isEn
                            ? `Reloading interface in ${countdown} seconds...`
                            : `صفحه تا ${countdown} ثانیه دیگر مجدداً بارگذاری می‌شود...`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                    >
                      {isEn ? 'Reload Now' : 'تازه‌سازی فوری'}
                    </button>
                  </div>
                ) : updating ? (
                  <div className="p-4 rounded-xl bg-indigo-950/50 border border-indigo-500/40 text-indigo-200 space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-cyan-300 animate-spin" />
                      <div className="font-bold text-sm text-white">
                        {isEn
                          ? `Updating panel to v${updateInfo?.latestVersion}...`
                          : `در حال ارتقای پنل به نگارش v${updateInfo?.latestVersion}...`}
                      </div>
                    </div>
                    <div className="bg-black/60 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 border border-white/10 flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">
                        {updateLogs[updateLogs.length - 1] || 'Executing update steps...'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {isEn
                        ? 'Please keep this window open while files are synchronized and rebuilt.'
                        : 'لطفاً تا اتمام بارگذاری و کامپایل فایل‌های سیستمی این پنجره را نبندید.'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {error && (
                      <div className="mb-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-center gap-2.5 text-rose-200 text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="flex-1">{error}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <button
                        onClick={performUpdate}
                        className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-sm shadow-[0_0_25px_rgba(244,63,94,0.4)] transition cursor-pointer"
                      >
                        <ArrowUpCircle className="w-5 h-5 text-rose-200" />
                        <span>
                          {isEn
                            ? `Update Panel to v${updateInfo?.latestVersion} Now`
                            : `ارتقای پنل به نگارش v${updateInfo?.latestVersion}`}
                        </span>
                      </button>

                      <a
                        href={updateInfo?.repoUrl || 'https://github.com/shahbazimasoud/Net-Management'}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>GitHub</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Release History Header */}
          <div className="flex items-center justify-between pb-1 border-b border-white/10">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {isEn ? 'Installed Version History' : 'تاریخچه نسخه‌ها و نگارش‌های نصب‌شده'}
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {RELEASE_HISTORY.length} {isEn ? 'Releases' : 'نگارش ثبت‌شده'}
            </span>
          </div>

          {/* Historical Releases */}
          {RELEASE_HISTORY.map((rel, index) => {
            const isLatest = index === 0;
            const title = isEn && rel.title_en ? rel.title_en : rel.title;
            const changes = isEn && rel.changes_en ? rel.changes_en : rel.changes;

            return (
              <div
                key={rel.version}
                className={`p-4 rounded-xl border transition-all ${
                  isLatest && !hasUpdate
                    ? 'bg-indigo-950/30 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-white px-2 py-0.5 rounded-lg bg-white/10 border border-white/15">
                      v{rel.version}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full uppercase ${
                        rel.type === 'major'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : rel.type === 'minor'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {rel.type === 'major'
                        ? t('release_notes_tag_major')
                        : rel.type === 'minor'
                        ? t('release_notes_tag_minor')
                        : t('release_notes_tag_patch')}
                    </span>
                    <span className="text-sm font-semibold text-slate-200">{title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{rel.releaseDate}</span>
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-slate-300">
                  {changes.map((change, cIdx) => (
                    <li key={cIdx} className="flex items-start gap-2 leading-relaxed">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer (Pinned) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-white/10 bg-slate-900/85 text-xs text-slate-400 shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => checkUpdate(false)}
              disabled={checking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white transition cursor-pointer text-xs"
              title={t('update_btn_check_now')}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? t('update_checking_in_progress') : t('update_btn_check_now')}</span>
            </button>

            <button
              onClick={toggleSimulatedUpdate}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition cursor-pointer font-mono ${
                isSimulated
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 border-white/10'
              }`}
              title="تست نمایش نشانگر چشمک‌زن قرمز و فرآیند ارتقا"
            >
              {isSimulated ? '✓ Demo Mode Active' : '⚡ Simulate Alert'}
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition cursor-pointer shadow-sm"
          >
            {t('release_notes_btn_close')}
          </button>
        </div>
      </div>
    </div>
  );
};
