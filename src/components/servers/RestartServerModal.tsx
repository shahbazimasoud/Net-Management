import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  X,
  Minus,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Clock,
  Send,
  ShieldAlert,
  Terminal,
  Server,
  Zap,
  Radio,
  CheckCircle2,
  Lock,
  Sparkles,
  Info,
  Ban,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { restartRemoteServer } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

interface RestartServerModalProps {
  server: RemoteServer;
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

type TimingPreset = 'immediate' | '1m' | '3m' | '5m' | '10m' | '15m' | 'custom';

export const RestartServerModal: React.FC<RestartServerModalProps> = ({
  server,
  isLightMode = false,
  isEn = true,
  onClose,
  onSuccess,
}) => {
  const { dockModal, undockModal } = useModalDock();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timing
  const [timingMode, setTimingMode] = useState<TimingPreset>('immediate');
  const [customMinutes, setCustomMinutes] = useState<number>(5);

  // Broadcast Notification
  const [notifyUsers, setNotifyUsers] = useState<boolean>(true);
  const [broadcastMessage, setBroadcastMessage] = useState<string>('');

  // Force Option
  const [forceRestart, setForceRestart] = useState<boolean>(true);

  // Password for zero-storage policy
  const [password, setPassword] = useState<string>('');
  const requiresPassword = Boolean(server.prompt_password_on_connect && !server.ssh_password && !server.win_password);

  const isLinux = server.os_type === 'linux';

  // Compute delay in minutes
  const delayMinutes = React.useMemo(() => {
    switch (timingMode) {
      case 'immediate':
        return 0;
      case '1m':
        return 1;
      case '3m':
        return 3;
      case '5m':
        return 5;
      case '10m':
        return 10;
      case '15m':
        return 15;
      case 'custom':
        return Math.max(1, Math.floor(customMinutes || 1));
      default:
        return 0;
    }
  }, [timingMode, customMinutes]);

  const delayLabel = React.useMemo(() => {
    if (delayMinutes === 0) return isEn ? 'Immediately' : 'فوری (هم‌اکنون)';
    return isEn ? `${delayMinutes} minute${delayMinutes > 1 ? 's' : ''}` : `${delayMinutes} دقیقه`;
  }, [delayMinutes, isEn]);

  // Intelligent template message based on OS and delay time
  useEffect(() => {
    if (delayMinutes === 0) {
      setBroadcastMessage(
        isEn
          ? `System Reboot Notice: ${server.name} is restarting immediately for scheduled administration. Please save all work.`
          : `اعلان ری‌استارت سیستم: سرور ${server.name} هم‌اکنون به دلیل عملیات مدیریتی راه‌اندازی مجدد می‌شود. لطفاً کارهای خود را فوراً ذخیره کنید.`
      );
    } else {
      setBroadcastMessage(
        isEn
          ? `Warning: ${server.name} will restart in ${delayLabel} for scheduled maintenance. Please log out and save active sessions.`
          : `هشدار: سرور ${server.name} تا ${delayLabel} دیگر جهت عملیات نگهداری مجدداً راه‌اندازی خواهد شد. لطفاً نشست‌های فعال را ذخیره و خارج شوید.`
      );
    }
  }, [delayMinutes, delayLabel, isEn, server.name]);

  // Quick preset message templates
  const handleApplyTemplate = (type: 'maintenance' | 'updates' | 'urgent') => {
    if (type === 'maintenance') {
      setBroadcastMessage(
        isEn
          ? `Notice: Server ${server.name} is scheduled for planned routine maintenance and will reboot ${delayMinutes > 0 ? `in ${delayLabel}` : 'now'}.`
          : `اعلان: سرور ${server.name} جهت تعمیرات و نگهداری دوره‌ای ${delayMinutes > 0 ? `ظرف ${delayLabel}` : 'هم‌اکنون'} ری‌استارت خواهد شد.`
      );
    } else if (type === 'updates') {
      setBroadcastMessage(
        isEn
          ? `Security Patch Notice: Essential system updates applied. Server will reboot ${delayMinutes > 0 ? `in ${delayLabel}` : 'immediately'} to finalize configuration.`
          : `اعلان به‌روزرسانی امنیتی: پچ‌های سیستمی اعمال گردید. سرور ${delayMinutes > 0 ? `ظرف ${delayLabel}` : 'هم‌اکنون'} جهت اتمام تغییرات ری‌استارت می‌گردد.`
      );
    } else {
      setBroadcastMessage(
        isEn
          ? `Urgent Administrator Notice: Server restart initiated ${delayMinutes > 0 ? `in ${delayLabel}` : 'immediately'}. Please close all files.`
          : `پیام فوری مدیر شبکه: راه‌اندازی مجدد سرور ${delayMinutes > 0 ? `ظرف ${delayLabel}` : 'فوری'} آغاز شد. کلیه فایل‌های باز را فوراً ذخیره کنید.`
      );
    }
  };

  // Minimization handler with ToolsDock registration
  const handleMinimize = () => {
    setIsMinimized(true);
    dockModal({
      id: `restart-${server.id}`,
      labelEn: `Restart: ${server.name}`,
      labelFa: `راه‌اندازی مجدد: ${server.name}`,
      badge: isLinux ? 'Linux' : 'Windows',
      category: 'system',
      onRestore: () => {
        setIsMinimized(false);
        undockModal(`restart-${server.id}`);
      },
      onClose: () => {
        undockModal(`restart-${server.id}`);
        onClose();
      },
    });
  };

  // Submit restart
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresPassword && !password.trim()) {
      setError(isEn ? 'Please enter the administrative password.' : 'لطفاً رمز عبور مدیریتی را وارد نمایید.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await restartRemoteServer(
        server.id,
        {
          delayMinutes,
          notifyUsers,
          message: notifyUsers ? broadcastMessage.trim() : undefined,
          force: forceRestart,
          cancelPending: false,
        },
        password.trim() || undefined
      );

      if (res.success) {
        undockModal(`restart-${server.id}`);
        onSuccess(
          delayMinutes > 0
            ? (isEn
                ? `Restart scheduled in ${delayLabel} for ${server.name} (${server.ip})`
                : `دستور راه‌اندازی مجدد ظرف ${delayLabel} برای سرور «${server.name}» (${server.ip}) با موفقیت زمان‌بندی شد`)
            : (isEn
                ? `Restart initiated immediately for ${server.name} (${server.ip})`
                : `دستور راه‌اندازی فوری سرور «${server.name}» (${server.ip}) با موفقیت صادر شد`)
        );
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to issue restart command' : 'خطا در صدور دستور ری‌استارت'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error during restart command execution' : 'خطای شبکه در ارتباط با سرور'));
    } finally {
      setLoading(false);
    }
  };

  // Cancel any pending scheduled restart
  const handleCancelPending = async () => {
    if (requiresPassword && !password.trim()) {
      setError(isEn ? 'Please enter the administrative password to abort restart.' : 'لطفاً جهت لغو ری‌استارت رمز عبور مدیریتی را وارد نمایید.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await restartRemoteServer(
        server.id,
        {
          cancelPending: true,
        },
        password.trim() || undefined
      );

      if (res.success) {
        undockModal(`restart-${server.id}`);
        onSuccess(
          isEn
            ? `Scheduled restart was successfully cancelled on ${server.name}`
            : `زمان‌بندی ری‌استارت روی سرور «${server.name}» با موفقیت لغو شد`
        );
        onClose();
      } else {
        setError(res.error || (isEn ? 'Failed to cancel scheduled restart' : 'خطا در لغو زمان‌بندی ری‌استارت'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error while cancelling restart' : 'خطای شبکه در لغو ری‌استارت'));
    } finally {
      setLoading(false);
    }
  };

  if (isMinimized) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-xl rounded-2xl max-h-[90vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory Triad Controls (Close, Minimize, Fullscreen) - Rule 7 */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <RotateCcw className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <span>{isEn ? `Restart Server: ${server.name}` : `راه‌اندازی مجدد سرور: ${server.name}`}</span>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                      isLinux
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                        : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    }`}
                  >
                    {isLinux ? 'Linux OS' : 'Windows Server'}
                  </span>
                </h3>
                <FieldInfoTooltip
                  title={isEn ? 'Server Reboot Protocol' : 'مکانیزم و پروتکل راه‌اندازی مجدد سرور'}
                  infoWhatEn={
                    isLinux
                      ? 'Issues graceful or immediate kernel reboot via shutdown -r or systemctl reboot, with broadcast terminal warnings via wall.'
                      : 'Executes Windows shutdown.exe /r /t with optional force parameter /f and interactive user popup warning via msg.exe.'
                  }
                  infoWhatFa={
                    isLinux
                      ? 'صدور دستور ریستارت هسته لینوکس از طریق shutdown -r یا systemctl reboot همراه با ارسال اخطار متنی ترمینال به کاربران از طریق دستور wall.'
                      : 'اجرای دستور shutdown.exe /r /t ویندوز با قابلیت بستن اجباری برنامه‌ها (/f) و نمایش پنجره اعلان هشدار به کاربران لاگین از طریق msg.exe.'
                  }
                  infoWhyEn="Allows scheduled maintenance, kernel updates, or memory flushes without abruptly terminating active sessions without notice."
                  infoWhyFa="فراهم‌سازی امکان ریست دوره‌ای، اعمال کرنل جدید یا آزادسازی حافظه با مهلت زمانی مشخص بدون ایجاد وقفه ناگهانی برای کاربران سرور."
                  infoExampleEn={isLinux ? 'shutdown -r +5 "Maintenance reboot"' : 'shutdown /r /t 300 /f /c "Maintenance reboot"'}
                  infoExampleFa={isLinux ? 'shutdown -r +5 "Maintenance reboot"' : 'shutdown /r /t 300 /f /c "Maintenance reboot"'}
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {server.ip}:{isLinux ? server.ssh_port || 22 : server.win_port || 3389} • {server.os_distro || server.os_type}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMinimize}
              title={isEn ? 'Minimize to ToolsDock' : 'کوچک‌سازی به نوار ابزار پایین'}
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

          {/* Attention Warning Notice */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isLightMode ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
            }`}
          >
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold block">
                {isEn ? 'Production Impact Confirmation' : 'هشدار تایید عملیات حیاتی ری‌استارت'}
              </span>
              <p className="opacity-90 leading-relaxed">
                {isEn
                  ? `Rebooting will temporarily interrupt all running services, network tunnels, background daemons, and connected sessions on ${server.name}.`
                  : `راه‌اندازی مجدد موجب قطع موقت تمامی سرویس‌ها، پردازش‌های پس‌زمینه و نشست‌های متصل کاربران روی سرور «${server.name}» خواهد شد.`}
              </p>
            </div>
          </div>

          {/* 1. Timing Mode / Grace Period Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isEn ? 'Restart Schedule & Grace Period:' : 'زمان‌بندی و مهلت پیش از ری‌استارت:'}</span>
              </label>
              <span className="text-[11px] font-mono text-cyan-400 font-semibold">{delayLabel}</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {(
                [
                  { id: 'immediate', labelEn: 'Now (0m)', labelFa: 'هم‌اکنون' },
                  { id: '1m', labelEn: '1 min', labelFa: '۱ دقیقه' },
                  { id: '3m', labelEn: '3 min', labelFa: '۳ دقیقه' },
                  { id: '5m', labelEn: '5 min', labelFa: '۵ دقیقه' },
                  { id: '10m', labelEn: '10 min', labelFa: '۱۰ دقیقه' },
                  { id: 'custom', labelEn: 'Custom', labelFa: 'دلخواه...' },
                ] as const
              ).map((preset) => {
                const active = timingMode === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTimingMode(preset.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition text-center cursor-pointer ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                        : isLightMode
                        ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {isEn ? preset.labelEn : preset.labelFa}
                  </button>
                );
              })}
            </div>

            {/* Custom Minutes Input */}
            {timingMode === 'custom' && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="text-xs">
                  <span className="font-semibold block">{isEn ? 'Custom Delay (Minutes):' : 'مدت تاخیر دلخواه (دقیقه):'}</span>
                  <span className="text-[10px] text-slate-400">
                    {isEn ? 'Schedule reboot after specified minutes' : 'تعیین دقیق دقایق تاخیر تا راه‌اندازی مجدد'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={`w-20 px-3 py-1.5 rounded-lg border text-sm font-mono text-center focus:outline-none transition ${
                      isLightMode
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-400'
                    }`}
                  />
                  <span className="text-xs text-slate-400 font-medium">{isEn ? 'min' : 'دقیقه'}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Broadcast Warning Notification Toggle */}
          <div
            className={`p-3.5 rounded-xl border space-y-3 transition ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyUsers}
                  onChange={(e) => setNotifyUsers(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 focus:ring-offset-slate-950 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isEn ? 'Broadcast Warning to Logged-in Users' : 'ارسال پیام هشدار به کاربران لاگین داخل سرور'}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {isLinux
                      ? isEn
                        ? 'Sends real-time terminal broadcast using the wall command to all active TTYs/PTS'
                        : 'ارسال اخطار مستقیم در ترمینال تمامی نشست‌های فعال با دستور wall'
                      : isEn
                      ? 'Displays system popup message via msg.exe and appends /c comment to shutdown'
                      : 'نمایش پاپ‌آپ اخطار به کاربران متصل از طریق msg.exe و ثبت کامنت در shutdown'}
                  </span>
                </div>
              </label>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  notifyUsers
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                }`}
              >
                {notifyUsers ? (isEn ? 'Enabled' : 'فعال') : isEn ? 'Disabled' : 'غیرفعال'}
              </span>
            </div>

            {notifyUsers && (
              <div className="space-y-2 pt-2 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {isEn ? 'Message content to broadcast:' : 'متن پیام ارسالی به کاربران:'}
                  </span>
                  {/* Preset Template Pills */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyTemplate('maintenance')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer transition"
                    >
                      {isEn ? 'Maintenance' : 'تعمیرات'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyTemplate('updates')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 cursor-pointer transition"
                    >
                      {isEn ? 'Updates' : 'به‌روزرسانی'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyTemplate('urgent')}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 cursor-pointer transition"
                    >
                      {isEn ? 'Urgent' : 'فوری'}
                    </button>
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder={isEn ? 'Enter broadcast message...' : 'متن پیام را وارد کنید...'}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none transition leading-relaxed resize-none ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-cyan-400'
                  }`}
                />
              </div>
            )}
          </div>

          {/* 3. Force Restart Option */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={forceRestart}
                onChange={(e) => setForceRestart(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-950 cursor-pointer"
              />
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  {isEn ? 'Force Close Running Applications' : 'بستن اجباری برنامه‌های در حال اجرا (Force)'}
                </span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  {isLinux ? 'Linux kernel force unmount / sync' : 'Windows /f (Forces running apps to close without warning)'}
                </span>
              </div>
            </label>
          </div>

          {/* 4. Ephemeral Password for Zero-Storage Server */}
          {requiresPassword && (
            <div
              className={`p-3.5 rounded-xl border space-y-2 ${
                isLightMode ? 'bg-amber-50/50 border-amber-200' : 'bg-amber-950/20 border-amber-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">
                  {isEn ? 'Administrative Credentials Required' : 'نیاز به گذرواژه مدیر (Zero-Storage Policy)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isEn
                  ? 'This server enforces zero-storage security policy. Please provide password for this reboot command.'
                  : 'این سرور تحت سیاست امنیت عدم ذخیره‌سازی گذرواژه است. لطفاً رمز عبور را جهت اجرای دستور وارد کنید.'}
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEn ? 'Enter server administrative password...' : 'رمز عبور سرور را وارد کنید...'}
                className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                    : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                }`}
              />
            </div>
          )}

          {/* 5. Command Preview Badge */}
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-between text-[11px] font-mono ${
              isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-black/40 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-400">{isEn ? 'Command to execute:' : 'دستور اجرایی:'}</span>
              <span className="text-cyan-400 font-semibold truncate">
                {isLinux
                  ? delayMinutes === 0
                    ? 'sudo shutdown -r now'
                    : `sudo shutdown -r +${delayMinutes} "${notifyUsers && broadcastMessage ? broadcastMessage.slice(0, 30) + '...' : ''}"`
                  : `shutdown /r /t ${delayMinutes * 60} ${forceRestart ? '/f' : ''}`}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            {/* Cancel Scheduled Restart button */}
            <button
              type="button"
              onClick={handleCancelPending}
              disabled={loading}
              title={isEn ? 'Cancel any pending scheduled restart on this server' : 'لغو هرگونه ری‌استارت زمان‌بندی‌شده قبلی'}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Ban className="w-3.5 h-3.5 text-slate-400" />
              <span>{isEn ? 'Abort Scheduled Restart' : 'لغو ری‌استارت زمان‌بندی‌شده'}</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className={`px-4 py-2 rounded-xl text-xs font-medium border transition cursor-pointer ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-md shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Sending Command...' : 'در حال ارسال دستور...'}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{delayMinutes === 0 ? (isEn ? 'Restart Now' : 'ری‌استارت فوری') : isEn ? `Schedule (${delayLabel})` : `زمان‌بندی (${delayLabel})`}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
