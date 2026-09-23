import React, { useState, useEffect } from 'react';
import {
  LogOut,
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Clock,
  Send,
  ShieldAlert,
  Terminal,
  User,
  Radio,
  Sparkles,
  Zap,
} from 'lucide-react';
import { RemoteServer, LinuxLoggedInUser } from '../../../types';
import { logoutLinuxServerUserSession } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface LogoutUserSessionModalProps {
  server: RemoteServer;
  userSession: LinuxLoggedInUser;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

type TimingMode = 'immediate' | '1m' | '3m' | '5m' | 'custom';

export const LogoutUserSessionModal: React.FC<LogoutUserSessionModalProps> = ({
  server,
  userSession,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timing mode
  const [timingMode, setTimingMode] = useState<TimingMode>('immediate');
  const [customValue, setCustomValue] = useState<number>(2);
  const [customUnit, setCustomUnit] = useState<'seconds' | 'minutes'>('minutes');

  // Scope: this TTY or all sessions of this user
  const [allSessions, setAllSessions] = useState(false);

  // Force signal (SIGKILL)
  const [forceKill, setForceKill] = useState(true);

  // Alert message
  const [sendMessage, setSendMessage] = useState(true);
  const [customMessage, setCustomMessage] = useState('');

  // Calculate actual delay in seconds
  const delaySeconds = React.useMemo(() => {
    switch (timingMode) {
      case 'immediate':
        return 0;
      case '1m':
        return 60;
      case '3m':
        return 180;
      case '5m':
        return 300;
      case 'custom':
        return customUnit === 'minutes' ? Math.max(1, customValue) * 60 : Math.max(1, customValue);
      default:
        return 0;
    }
  }, [timingMode, customValue, customUnit]);

  // Delay label for messages
  const delayLabel = React.useMemo(() => {
    if (delaySeconds === 0) return isEn ? 'immediately' : 'فوری';
    if (delaySeconds < 60) return isEn ? `${delaySeconds} seconds` : `${delaySeconds} ثانیه`;
    const mins = Math.round(delaySeconds / 60);
    return isEn ? `${mins} minute${mins > 1 ? 's' : ''}` : `${mins} دقیقه`;
  }, [delaySeconds, isEn]);

  // Auto-fill template message when timing mode or delay changes if user hasn't typed a custom override
  useEffect(() => {
    if (delaySeconds === 0) {
      setCustomMessage(
        isEn
          ? 'Notice from Administrator: Your terminal session has been terminated.'
          : 'پیام مدیر سیستم: نشست کاربری شما در این ترمینال بسته شد.'
      );
    } else {
      setCustomMessage(
        isEn
          ? `Warning: Your terminal session will be terminated in ${delayLabel} by the system administrator. Please save your work immediately.`
          : `هشدار: نشست ترمینال شما تا ${delayLabel} دیگر توسط مدیر سیستم قطع خواهد شد. لطفاً فوراً کارهای خود را ذخیره کنید.`
      );
    }
  }, [delaySeconds, delayLabel, isEn]);

  // Quick preset templates
  const handleApplyTemplate = (type: 'maintenance' | 'security' | 'idle') => {
    if (type === 'maintenance') {
      setCustomMessage(
        isEn
          ? `Server maintenance is scheduled. Your session will close ${delaySeconds > 0 ? `in ${delayLabel}` : 'now'}. Please save your work.`
          : `تعمیرات و نگهداری سرور در حال آغاز است. نشست شما ${delaySeconds > 0 ? `تا ${delayLabel} دیگر` : 'هم‌اکنون'} بسته می‌شود. لطفاً کارهای خود را ذخیره کنید.`
      );
    } else if (type === 'security') {
      setCustomMessage(
        isEn
          ? `Security compliance notice: Unauthorized or restricted session is being terminated ${delaySeconds > 0 ? `in ${delayLabel}` : 'immediately'}.`
          : `هشدار امنیتی: این نشست کاربری به دلایل انضباطی یا امنیتی ${delaySeconds > 0 ? `ظرف ${delayLabel}` : 'فوراً'} خاتمه می‌یابد.`
      );
    } else {
      setCustomMessage(
        isEn
          ? `Session idle timeout policy: Terminating inactive terminal session ${delaySeconds > 0 ? `in ${delayLabel}` : 'now'}.`
          : `پایان مهلت نشست: نشست غیرفعال ترمینال ${delaySeconds > 0 ? `تا ${delayLabel} دیگر` : 'هم‌اکنون'} قطع می‌گردد.`
      );
    }
  };

  const isCurrentSshUser = Boolean(
    server.ssh_username && userSession.user.toLowerCase() === server.ssh_username.toLowerCase()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await logoutLinuxServerUserSession(
        server.id,
        {
          username: userSession.user,
          tty: userSession.tty,
          delaySeconds,
          message: sendMessage ? customMessage.trim() : undefined,
          force: forceKill || timingMode === 'immediate',
          allSessions,
        },
        ephemeralPassword
      );

      if (res.success) {
        onSuccess(
          delaySeconds > 0
            ? (isEn
                ? `Logout scheduled in ${delayLabel} for session ${userSession.user} (${userSession.tty})`
                : `دستور خروج ظرف ${delayLabel} برای نشست «${userSession.user}» (${userSession.tty}) زمان‌بندی شد`)
            : (isEn
                ? `Session for user ${userSession.user} (${userSession.tty}) terminated successfully`
                : `نشست کاربر «${userSession.user}» (${userSession.tty}) با موفقیت قطع شد`)
        );
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to log out user session' : 'خطا در قطع اتصال نشست کاربر'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error during session logout' : 'خطای شبکه در ارسال دستور خروج'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-xl rounded-2xl max-h-[90vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory 3 Controls (Rule 7) */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? `Log Out Session: ${userSession.user}` : `قطع اتصال و خروج نشست: ${userSession.user}`}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Linux Session Logout' : 'قطع و خروج نشست کاربر در لینوکس'}
                  infoWhatEn="Terminates active interactive Linux sessions via pkill, fuser, and systemd loginctl with optional pre-logout terminal message broadcast."
                  infoWhatFa="قطع نشست‌های فعال ترمینال لینوکس از طریق pkill، fuser و loginctl همراه با قابلیت ارسال پیام هشدار قبل از قطع اتصال."
                  infoWhyEn="Safely kicks idle, hanging, or unauthorized user sessions immediately or after a grace period without rebooting the server."
                  infoWhyFa="امکان خارج کردن نشست‌های بلااستفاده، معلق یا غیرمجاز به صورت فوری یا با مهلت زمانی مشخص بدون نیاز به ریست سرور."
                  infoExampleEn="pkill -KILL -t pts/1"
                  infoExampleFa="pkill -KILL -t pts/1"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                TTY: {userSession.tty} • {isEn ? 'Remote IP' : 'آی‌پی مبدا'}: {userSession.from || (isEn ? 'Local' : 'محلی')} • {server.name || server.ip}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Minimize' : 'کوچک‌سازی'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isEn ? (isMaximized ? 'Exit Fullscreen' : 'Fullscreen') : isMaximized ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close' : 'بستن'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs font-mono ${
                isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Self-connection warning if targeting SSH user */}
          {isCurrentSshUser && (
            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{isEn ? 'Attention: Active Management User' : 'توجه: کاربر فعال اتصال مدیریتی'}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {isEn
                  ? `User "${userSession.user}" matches the active SSH username configured for server management. Terminating this session may disconnect your SSH tunnel.`
                  : `کاربر «${userSession.user}» همان کاربری است که پنل برای اتصال SSH به این سرور استفاده می‌کند. قطع این نشست ممکن است ارتباط مدیریتی را موقتاً قطع کند.`}
              </p>
            </div>
          )}

          {/* Active Session Info Card */}
          <div
            className={`p-3.5 rounded-xl border space-y-2 text-xs font-mono ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b pb-2 border-white/5">
              <span className="font-semibold">{isEn ? 'Session Snapshot' : 'مشخصات نشست فعال'}</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                {isEn ? 'Active' : 'فعال'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 block">{isEn ? 'Username' : 'نام کاربری'}:</span>
                <span className="font-bold text-cyan-400">{userSession.user}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Terminal (TTY)' : 'ترمینال (TTY)'}:</span>
                <span className="font-semibold text-slate-300">{userSession.tty}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Login Time' : 'زمان لاگین'}:</span>
                <span className="text-slate-300">{userSession.loginTime || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">{isEn ? 'Idle Time' : 'مدت بیکاری'}:</span>
                <span className="text-amber-400 font-bold">{userSession.idleTime || '0s'}</span>
              </div>
            </div>
            {userSession.what && userSession.what !== '-' && (
              <div className="pt-1 text-[11px] border-t border-white/5 flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">{isEn ? 'Process' : 'پردازش'}:</span>
                <span className="text-slate-300 truncate">{userSession.what}</span>
              </div>
            )}
          </div>

          {/* Timing Mode Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>{isEn ? 'Logout Timing & Schedule' : 'زمان‌بندی و مهلت قطع اتصال'}</span>
              </label>
              <span className="text-[11px] text-cyan-400 font-mono font-semibold">
                {delaySeconds === 0 ? (isEn ? 'Immediate Kill' : 'خروج فوری') : `${isEn ? 'Delay' : 'مهلت'}: ${delayLabel}`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setTimingMode('immediate')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  timingMode === 'immediate'
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400 font-bold shadow-sm'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isEn ? 'Force (0s)' : 'فوری (فورس)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTimingMode('1m')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  timingMode === '1m'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isEn ? '1 Minute' : '۱ دقیقه'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTimingMode('3m')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  timingMode === '3m'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isEn ? '3 Minutes' : '۳ دقیقه'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTimingMode('5m')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  timingMode === '5m'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 font-bold shadow-sm'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isEn ? '5 Minutes' : '۵ دقیقه'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTimingMode('custom')}
                className={`p-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 col-span-2 sm:col-span-1 ${
                  timingMode === 'custom'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400 font-bold shadow-sm'
                    : isLightMode
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/60'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isEn ? 'Custom...' : 'دلخواه...'}</span>
              </button>
            </div>

            {/* Custom Delay Inputs */}
            {timingMode === 'custom' && (
              <div
                className={`p-3 rounded-xl border flex items-center gap-2 animate-fadeIn ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <span className="text-xs text-slate-400 whitespace-nowrap">{isEn ? 'Terminate after:' : 'قطع پس از:'}</span>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={customValue}
                  onChange={(e) => setCustomValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={`w-20 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                />
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${
                    isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
                  }`}
                >
                  <option value="seconds">{isEn ? 'Seconds' : 'ثانیه'}</option>
                  <option value="minutes">{isEn ? 'Minutes' : 'دقیقه'}</option>
                </select>
                <span className="text-xs text-purple-400 font-mono font-semibold ml-auto">
                  {delaySeconds}s
                </span>
              </div>
            )}
          </div>

          {/* Alert Message Options */}
          <div
            className={`p-3.5 rounded-xl border space-y-2.5 ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                <input
                  type="checkbox"
                  checked={sendMessage}
                  onChange={(e) => setSendMessage(e.target.checked)}
                  className="rounded text-cyan-500 focus:ring-cyan-500 cursor-pointer w-4 h-4"
                />
                <Send className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Send Alert Message Before Termination' : 'ارسال پیام هشدار به کاربر قبل از خروج'}</span>
              </label>

              {sendMessage && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('maintenance')}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition cursor-pointer"
                  >
                    {isEn ? 'Maintenance' : 'تعمیرات'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('idle')}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition cursor-pointer"
                  >
                    {isEn ? 'Timeout' : 'انقضا'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('security')}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                  >
                    {isEn ? 'Security' : 'امنیتی'}
                  </button>
                </div>
              )}
            </div>

            {sendMessage && (
              <div className="space-y-1.5 animate-fadeIn">
                <textarea
                  rows={2}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Alert message to be displayed directly on the user terminal...'
                      : 'متن پیام هشداری که مستقیماً روی ترمینال کاربر چاپ می‌شود...'
                  }
                  className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                      : 'bg-slate-950 border-slate-700 text-white placeholder-slate-500'
                  }`}
                />
                <p className="text-[10px] text-slate-400">
                  {isEn
                    ? `Message will be delivered directly to TTY /dev/${userSession.tty} via console broadcast.`
                    : `پیام مستقیماً از طریق کنسول روی TTY /dev/${userSession.tty} چاپ خواهد شد.`}
                </p>
              </div>
            )}
          </div>

          {/* Scope and Force Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                allSessions
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-900/40 border-slate-800 text-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={allSessions}
                onChange={(e) => setAllSessions(e.target.checked)}
                className="mt-0.5 rounded text-rose-500 focus:ring-rose-500 cursor-pointer"
              />
              <div>
                <span className="font-bold block">
                  {isEn ? `Kill All Sessions of "${userSession.user}"` : `بستن تمام نشست‌های کاربر «${userSession.user}»`}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isEn
                    ? 'Terminate every active interactive session and background processes owned by this user.'
                    : 'خروج تمامی ترمینال‌ها و پردازش‌های متعلق به این کاربر روی سرور.'}
                </span>
              </div>
            </label>

            <label
              className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                forceKill
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-900/40 border-slate-800 text-slate-300'
              }`}
            >
              <input
                type="checkbox"
                checked={forceKill}
                onChange={(e) => setForceKill(e.target.checked)}
                className="mt-0.5 rounded text-rose-500 focus:ring-rose-500 cursor-pointer"
              />
              <div>
                <span className="font-bold block flex items-center gap-1">
                  <Zap className="w-3 h-3 text-rose-400" />
                  <span>{isEn ? 'Force Terminate (SIGKILL -9)' : 'خروج اجباری (SIGKILL -9)'}</span>
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {isEn
                    ? 'Immediately kill process without waiting for graceful hangup response.'
                    : 'قطع آنی پروسس بدون فوت وقت جهت اطمینان از خروج کامل نشست.'}
                </span>
              </div>
            </label>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              <LogOut className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>
                {loading
                  ? (isEn ? 'Executing Logout...' : 'در حال اجرای خروج...')
                  : delaySeconds === 0
                  ? (isEn ? 'Force Log Out Now' : 'قطع اتصال و خروج فوری')
                  : (isEn ? `Schedule Logout (${delayLabel})` : `ثبت و زمان‌بندی خروج (${delayLabel})`)}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
