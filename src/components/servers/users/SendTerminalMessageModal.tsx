import React, { useState } from 'react';
import {
  Send,
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Radio,
  User,
  Sparkles,
} from 'lucide-react';
import { RemoteServer, LinuxLoggedInUser } from '../../../types';
import { sendLinuxServerUserMessage } from '../../../services/api';
import { FieldInfoTooltip } from '../../common/FieldInfoTooltip';

interface SendTerminalMessageModalProps {
  server: RemoteServer;
  loggedInUsers: LinuxLoggedInUser[];
  initialTarget?: string; // TTY or username or 'all'
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const SendTerminalMessageModal: React.FC<SendTerminalMessageModalProps> = ({
  server,
  loggedInUsers,
  initialTarget = 'all',
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recipient selection: 'all' or specific session key
  const [targetKey, setTargetKey] = useState<string>(initialTarget || 'all');
  const [messageText, setMessageText] = useState<string>('');

  // Selected session details (if targeting a specific user/tty)
  const selectedSession = React.useMemo(() => {
    if (targetKey === 'all') return null;
    return loggedInUsers.find(
      (u) => (u.tty && u.tty === targetKey) || u.user === targetKey || `${u.user}:${u.tty}` === targetKey
    ) || null;
  }, [targetKey, loggedInUsers]);

  // Actual target parameter passed to the backend
  const resolvedTarget = React.useMemo(() => {
    if (targetKey === 'all') return 'all';
    if (selectedSession && selectedSession.tty) {
      return selectedSession.tty;
    }
    return targetKey;
  }, [targetKey, selectedSession]);

  // Quick preset templates
  const handleApplyPreset = (type: 'maintenance' | 'warning' | 'greeting') => {
    if (type === 'maintenance') {
      setMessageText(
        isEn
          ? 'System Notice: Server maintenance is scheduled in 10 minutes. Please save your work and prepare to log out.'
          : 'پیام مدیر سیستم: تعمیرات و به‌روزرسانی سرور تا ۱۰ دقیقه دیگر آغاز می‌شود. لطفاً کارهای خود را ذخیره کرده و خارج شوید.'
      );
    } else if (type === 'warning') {
      setMessageText(
        isEn
          ? 'Important Warning: High resource usage detected on your session. Please inspect running processes.'
          : 'هشدار مهم: مصرف بالای منابع روی نشست شما ثبت شده است. لطفاً پردازش‌های جاری خود را بررسی کنید.'
      );
    } else {
      setMessageText(
        isEn
          ? 'Hello from System Administrator. Please respond via administrative channel when available.'
          : 'پیام از طرف مدیر سیستم: لطفاً در اولین فرصت از طریق راه‌های ارتباطی با بخش پشتیبانی تماس بگیرید.'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      setError(isEn ? 'Message text cannot be empty' : 'متن پیام نمی‌تواند خالی باشد');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await sendLinuxServerUserMessage(
        server.id,
        resolvedTarget,
        messageText.trim(),
        ephemeralPassword
      );

      if (res.success) {
        onSuccess(
          resolvedTarget === 'all'
            ? (isEn ? 'Broadcast message sent to all active sessions' : 'پیام همگانی با موفقیت برای تمامی کاربران ارسال شد')
            : (isEn
                ? `Message delivered to ${selectedSession ? `${selectedSession.user} (${selectedSession.tty})` : resolvedTarget}`
                : `پیام با موفقیت به «${selectedSession ? `${selectedSession.user} (${selectedSession.tty})` : resolvedTarget}» تحویل داده شد`)
        );
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to deliver message' : 'خطا در ارسال پیام به ترمینال'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error during message delivery' : 'خطای شبکه در ارسال پیام'));
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
            : 'w-full max-w-lg rounded-2xl max-h-[90vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Universal 3 Controls */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">
                  {isEn ? 'Broadcast / Send Terminal Message' : 'ارسال پیام به کنسول ترمینال'}
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Terminal Message Delivery' : 'ارسال پیام به ترمینال در لینوکس'}
                  infoWhatEn="Broadcasts messages in real-time directly to the active pseudo-terminal (/dev/pts/X) or all users via console write and tee."
                  infoWhatFa="ارسال فوری پیام متنی به ترمینال فعال کاربر (/dev/pts/X) یا تمام کاربران فعال سرور از طریق دستورات write، tee و wall."
                  infoWhyEn="Allows system administrators to alert users about maintenance, security policies, or urgent tasks without disconnecting them."
                  infoWhyFa="به مدیران امکان می‌دهد هشدارهای نگهداری، امنیتی یا اداری را پیش از هر اقدامی مستقیماً روی مانیتور کاربر نمایش دهند."
                  infoExampleEn="tee /dev/pts/1 or wall"
                  infoExampleFa="tee /dev/pts/1 یا wall"
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {server.name || server.ip} • {targetKey === 'all' ? (isEn ? 'All Sessions' : 'همه نشست‌ها') : (selectedSession ? `${selectedSession.user} (${selectedSession.tty})` : targetKey)}
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

        {/* Modal Body */}
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

          {/* Target Recipient Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold block">
              {isEn ? 'Select Recipient' : 'انتخاب گیرنده پیام'}
            </label>
            <select
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-900 border-slate-700 text-white'
              }`}
            >
              <option value="all">
                {isEn ? '📢 Broadcast to ALL active sessions (wall)' : '📢 ارسال همگانی به تمامی کاربران فعال (wall)'}
              </option>
              {loggedInUsers.map((u) => {
                const optVal = u.tty || u.user;
                return (
                  <option key={`${u.user}-${u.tty}`} value={optVal}>
                    {u.user} — {u.tty} ({isEn ? 'IP' : 'آی‌پی'}: {u.from || (isEn ? 'local' : 'محلی')})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Active Session Info Card (When a specific session is selected) */}
          {selectedSession && (
            <div
              className={`p-3 rounded-xl border space-y-2 text-xs font-mono ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-400 border-b pb-1.5 border-white/5">
                <span className="font-semibold">{isEn ? 'Target Terminal Info' : 'مشخصات ترمینال هدف'}</span>
                <span className="text-cyan-400 font-bold flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5" />
                  /dev/{selectedSession.tty}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">{isEn ? 'User' : 'کاربر'}:</span>
                  <span className="font-bold text-emerald-400">{selectedSession.user}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isEn ? 'Remote IP' : 'آی‌پی متصل'}:</span>
                  <span className="font-semibold text-slate-300">{selectedSession.from || (isEn ? 'Local' : 'محلی')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">{isEn ? 'Idle Time' : 'مدت بیکاری'}:</span>
                  <span className="text-amber-400 font-semibold">{selectedSession.idleTime || '0s'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Message Text with Quick Templates */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold block">
                {isEn ? 'Message Content' : 'متن پیام'}
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('maintenance')}
                  className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition cursor-pointer"
                >
                  {isEn ? 'Maintenance' : 'تعمیرات'}
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('warning')}
                  className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition cursor-pointer"
                >
                  {isEn ? 'Warning' : 'هشدار'}
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('greeting')}
                  className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition cursor-pointer"
                >
                  {isEn ? 'Notice' : 'اطلاعیه'}
                </button>
              </div>
            </div>

            <textarea
              rows={4}
              required
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={
                isEn
                  ? 'Type administrative message to be rendered on the target user terminal...'
                  : 'متن پیامی که مستقیماً روی مانیتور و ترمینال کاربر مقصد چاپ می‌شود...'
              }
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                  : 'bg-slate-900 border-slate-700 text-white placeholder-slate-500'
              }`}
            />
            <p className="text-[10px] text-slate-400">
              {resolvedTarget === 'all'
                ? (isEn
                    ? 'Message will be broadcasted to all logged-in terminals using wall and root tee.'
                    : 'پیام از طریق کنسول و دستور wall به تمامی ترمینال‌های متصل ارسال خواهد شد.')
                : (isEn
                    ? `Message will be delivered with zero distortion to /dev/${resolvedTarget} via direct stream.`
                    : `پیام مستقیماً و بدون خطا روی پایانه /dev/${resolvedTarget} چاپ می‌شود.`)}
            </p>
          </div>

          {/* Footer Actions */}
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
              disabled={loading || !messageText.trim()}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? (isEn ? 'Sending...' : 'در حال ارسال...') : (isEn ? 'Send Message' : 'ارسال پیام')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
