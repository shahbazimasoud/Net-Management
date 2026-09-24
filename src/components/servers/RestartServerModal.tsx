import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Power,
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
  XCircle,
  Lock,
  Sparkles,
  Info,
  Ban,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { RemoteServer } from '../../types';
import { restartRemoteServer, executeBulkServerPower } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { useModalDock } from '../../context/ModalDockContext';

interface RestartServerModalProps {
  server?: RemoteServer | null;
  servers?: RemoteServer[];
  initialAction?: 'restart' | 'poweroff';
  isLightMode?: boolean;
  isEn?: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

type TimingPreset = 'immediate' | '1m' | '3m' | '5m' | '10m' | '15m' | 'custom';

export const RestartServerModal: React.FC<RestartServerModalProps> = ({
  server,
  servers,
  initialAction = 'restart',
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

  // Resolved list of target servers
  const targetServers = React.useMemo(() => {
    if (servers && servers.length > 0) return servers;
    if (server) return [server];
    return [];
  }, [server, servers]);

  const isBulk = targetServers.length > 1;
  const singleServer = targetServers.length === 1 ? targetServers[0] : null;

  const linuxServers = React.useMemo(
    () => targetServers.filter((s) => s.os_type === 'linux'),
    [targetServers]
  );
  const windowsServers = React.useMemo(
    () => targetServers.filter((s) => s.os_type === 'windows'),
    [targetServers]
  );

  // Action type: 'restart' vs 'poweroff'
  const [actionType, setActionType] = useState<'restart' | 'poweroff'>(initialAction);

  // Timing
  const [timingMode, setTimingMode] = useState<TimingPreset>('immediate');
  const [customMinutes, setCustomMinutes] = useState<number>(5);

  // Broadcast Notification
  const [notifyUsers, setNotifyUsers] = useState<boolean>(true);
  const [broadcastMessage, setBroadcastMessage] = useState<string>('');

  // Force Option
  const [forceRestart, setForceRestart] = useState<boolean>(true);

  // Expandable list of target servers
  const [showServerList, setShowServerList] = useState<boolean>(false);

  // Execution results for bulk runs
  const [executionResults, setExecutionResults] = useState<
    Array<{
      serverId: string;
      serverName: string;
      ip: string;
      osType: string;
      success: boolean;
      message: string;
      command?: string;
      output?: string;
    }> | null
  >(null);

  // Password for zero-storage policy
  const [password, setPassword] = useState<string>('');
  const requiresPassword = React.useMemo(() => {
    return targetServers.some(
      (s) => s.prompt_password_on_connect && !s.ssh_password && !s.win_password
    );
  }, [targetServers]);

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

  // Intelligent template message based on action, OS and delay time
  useEffect(() => {
    const isRestart = actionType === 'restart';
    const serverNameLabel = isBulk
      ? isEn
        ? `${targetServers.length} Servers`
        : `${targetServers.length} سرور منتخب`
      : singleServer?.name || (isEn ? 'Server' : 'سرور');

    if (delayMinutes === 0) {
      if (isRestart) {
        setBroadcastMessage(
          isEn
            ? `System Reboot Notice: ${serverNameLabel} is restarting immediately for scheduled administration. Please save all work.`
            : `اعلان راه‌اندازی مجدد: سرور ${serverNameLabel} هم‌اکنون به دلیل عملیات مدیریتی ری‌استارت می‌شود. لطفاً کارهای خود را فوراً ذخیره کنید.`
        );
      } else {
        setBroadcastMessage(
          isEn
            ? `System Poweroff Notice: ${serverNameLabel} is shutting down immediately by administrator order. Please save all work.`
            : `اعلان خاموش‌سازی سیستم: سرور ${serverNameLabel} هم‌اکنون طبق دستور مدیر سیستم خاموش می‌شود. لطفاً کارهای خود را فوراً ذخیره نمایید.`
        );
      }
    } else {
      if (isRestart) {
        setBroadcastMessage(
          isEn
            ? `Warning: ${serverNameLabel} will restart in ${delayLabel} for scheduled maintenance. Please log out and save active sessions.`
            : `هشدار: سرور ${serverNameLabel} ظرف ${delayLabel} دیگر جهت عملیات نگهداری ری‌استارت خواهد شد. لطفاً نشست‌های فعال را ذخیره و خارج شوید.`
        );
      } else {
        setBroadcastMessage(
          isEn
            ? `Warning: ${serverNameLabel} will shut down in ${delayLabel}. Please save work and disconnect active sessions.`
            : `هشدار: سرور ${serverNameLabel} ظرف ${delayLabel} دیگر خاموش خواهد شد. لطفاً کارهای خود را ذخیره نموده و خارج شوید.`
        );
      }
    }
  }, [actionType, delayMinutes, delayLabel, isEn, isBulk, targetServers.length, singleServer?.name]);

  // Quick preset message templates
  const handleApplyTemplate = (type: 'maintenance' | 'updates' | 'urgent') => {
    const isRestart = actionType === 'restart';
    const serverNameLabel = isBulk
      ? isEn
        ? `${targetServers.length} servers`
        : `${targetServers.length} سرور منتخب`
      : singleServer?.name || (isEn ? 'server' : 'سرور');

    const actionTextEn = isRestart ? 'reboot' : 'power down';
    const actionTextFa = isRestart ? 'ری‌استارت' : 'خاموش';

    if (type === 'maintenance') {
      setBroadcastMessage(
        isEn
          ? `Notice: Server infrastructure (${serverNameLabel}) is scheduled for routine maintenance and will ${actionTextEn} ${
              delayMinutes > 0 ? `in ${delayLabel}` : 'now'
            }.`
          : `اعلان: زیرساخت سرور (${serverNameLabel}) جهت تعمیرات و نگهداری دوره‌ای ${
              delayMinutes > 0 ? `ظرف ${delayLabel}` : 'هم‌اکنون'
            } ${actionTextFa} خواهد شد.`
      );
    } else if (type === 'updates') {
      setBroadcastMessage(
        isEn
          ? `Security Patch Notice: Essential system updates applied. Systems will ${actionTextEn} ${
              delayMinutes > 0 ? `in ${delayLabel}` : 'immediately'
            } to finalize configuration.`
          : `اعلان به‌روزرسانی امنیتی: پچ‌های سیستمی اعمال شد. سرورها ${
              delayMinutes > 0 ? `ظرف ${delayLabel}` : 'هم‌اکنون'
            } جهت اعمال تغییرات ${actionTextFa} می‌شوند.`
      );
    } else {
      setBroadcastMessage(
        isEn
          ? `Urgent Administrator Notice: Immediate system ${isRestart ? 'restart' : 'shutdown'} initiated ${
              delayMinutes > 0 ? `in ${delayLabel}` : 'now'
            }. Please close all files immediately.`
          : `پیام فوری مدیر شبکه: دستور ${actionTextFa} فوری سیستم ${
              delayMinutes > 0 ? `ظرف ${delayLabel}` : 'هم‌اکنون'
            } صادر گردید. کلیه فایل‌ها و نشست‌های باز را فوراً ذخیره کنید.`
      );
    }
  };

  // Minimization handler with ToolsDock registration
  const handleMinimize = () => {
    setIsMinimized(true);
    const modalId = isBulk ? `bulk-power-${actionType}` : `power-${singleServer?.id || 'fleet'}`;
    const actionLabelEn = actionType === 'restart' ? 'Restart' : 'Shutdown';
    const actionLabelFa = actionType === 'restart' ? 'راه‌اندازی مجدد' : 'خاموش‌سازی';

    dockModal({
      id: modalId,
      labelEn: isBulk ? `${actionLabelEn}: ${targetServers.length} Servers` : `${actionLabelEn}: ${singleServer?.name}`,
      labelFa: isBulk ? `${actionLabelFa}: ${targetServers.length} سرور` : `${actionLabelFa}: ${singleServer?.name}`,
      badge: isBulk ? `${targetServers.length} Fleet` : singleServer?.os_type === 'linux' ? 'Linux' : 'Windows',
      category: 'system',
      onRestore: () => {
        setIsMinimized(false);
        undockModal(modalId);
      },
      onClose: () => {
        undockModal(modalId);
        onClose();
      },
    });
  };

  // Submit action (Restart or Shutdown)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requiresPassword && !password.trim()) {
      setError(
        isEn
          ? 'Please enter the administrative password for zero-storage policy servers.'
          : 'لطفاً رمز عبور مدیریتی را برای سرورهای تحت سیاست Zero-Storage وارد نمایید.'
      );
      return;
    }

    setLoading(true);
    setError(null);
    setExecutionResults(null);

    const isRestart = actionType === 'restart';

    try {
      if (isBulk) {
        const res = await executeBulkServerPower({
          serverIds: targetServers.map((s) => s.id),
          actionType,
          delayMinutes,
          notifyUsers,
          message: notifyUsers ? broadcastMessage.trim() : undefined,
          force: forceRestart,
          cancelPending: false,
          password: password.trim() || undefined,
        });

        if (res.results && res.results.length > 0) {
          setExecutionResults(res.results);
          const successCount = res.results.filter((r) => r.success).length;
          const failCount = res.results.length - successCount;

          if (res.success || successCount > 0) {
            undockModal(`bulk-power-${actionType}`);
            onSuccess(
              isEn
                ? `${isRestart ? 'Restart' : 'Shutdown'} command dispatched: ${successCount} successful${
                    failCount > 0 ? `, ${failCount} failed` : ''
                  }.`
                : `دستور ${isRestart ? 'راه‌اندازی مجدد' : 'خاموش کردن'} صادر شد: ${successCount} موفق${
                    failCount > 0 ? `، ${failCount} ناموفق` : ''
                  }.`
            );
          } else {
            setError(
              isEn
                ? 'All servers failed to execute command. See details below.'
                : 'اجرای دستور روی تمامی سرورها با خطا مواجه شد. جزئیات را در زیر مشاهده کنید.'
            );
          }
        } else {
          setError(res.error || (isEn ? 'Failed to execute bulk power command' : 'خطا در اجرای عملیات گروهی سرورها'));
        }
      } else if (singleServer) {
        const res = await restartRemoteServer(
          singleServer.id,
          {
            actionType,
            delayMinutes,
            notifyUsers,
            message: notifyUsers ? broadcastMessage.trim() : undefined,
            force: forceRestart,
            cancelPending: false,
          },
          password.trim() || undefined
        );

        if (res.success) {
          undockModal(`power-${singleServer.id}`);
          onSuccess(
            delayMinutes > 0
              ? isEn
                ? `${isRestart ? 'Restart' : 'Shutdown'} scheduled in ${delayLabel} for ${singleServer.name} (${singleServer.ip})`
                : `دستور ${isRestart ? 'راه‌اندازی مجدد' : 'خاموش کردن'} ظرف ${delayLabel} برای سرور «${singleServer.name}» (${singleServer.ip}) با موفقیت زمان‌بندی شد`
              : isEn
              ? `${isRestart ? 'Restart' : 'Shutdown'} initiated immediately for ${singleServer.name} (${singleServer.ip})`
              : `دستور ${isRestart ? 'راه‌اندازی' : 'خاموش کردن'} فوری سرور «${singleServer.name}» (${singleServer.ip}) با موفقیت صادر شد`
          );
          onClose();
        } else {
          setError(res.error || (isEn ? 'Failed to issue command' : 'خطا در صدور دستور'));
        }
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error during execution' : 'خطای شبکه در اجرای دستور'));
    } finally {
      setLoading(false);
    }
  };

  // Cancel any pending scheduled action
  const handleCancelPending = async () => {
    if (requiresPassword && !password.trim()) {
      setError(
        isEn
          ? 'Please enter the administrative password to abort scheduled action.'
          : 'لطفاً جهت لغو زمان‌بندی رمز عبور مدیریتی را وارد نمایید.'
      );
      return;
    }

    setLoading(true);
    setError(null);
    setExecutionResults(null);

    const isRestart = actionType === 'restart';

    try {
      if (isBulk) {
        const res = await executeBulkServerPower({
          serverIds: targetServers.map((s) => s.id),
          actionType,
          cancelPending: true,
          password: password.trim() || undefined,
        });

        if (res.results && res.results.length > 0) {
          setExecutionResults(res.results);
          const successCount = res.results.filter((r) => r.success).length;
          undockModal(`bulk-power-${actionType}`);
          onSuccess(
            isEn
              ? `Scheduled ${isRestart ? 'restart' : 'shutdown'} cancelled on ${successCount} of ${res.results.length} servers.`
              : `زمان‌بندی ${isRestart ? 'ری‌استارت' : 'خاموش‌سازی'} روی ${successCount} از ${res.results.length} سرور لغو گردید.`
          );
        } else {
          setError(res.error || (isEn ? 'Failed to cancel scheduled actions' : 'خطا در لغو زمان‌بندی‌ها'));
        }
      } else if (singleServer) {
        const res = await restartRemoteServer(
          singleServer.id,
          {
            actionType,
            cancelPending: true,
          },
          password.trim() || undefined
        );

        if (res.success) {
          undockModal(`power-${singleServer.id}`);
          onSuccess(
            isEn
              ? `Scheduled ${isRestart ? 'restart' : 'shutdown'} was successfully cancelled on ${singleServer.name}`
              : `زمان‌بندی ${isRestart ? 'ری‌استارت' : 'خاموش‌سازی'} روی سرور «${singleServer.name}» با موفقیت لغو شد`
          );
          onClose();
        } else {
          setError(res.error || (isEn ? 'Failed to cancel scheduled action' : 'خطا در لغو زمان‌بندی'));
        }
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error while cancelling' : 'خطای شبکه در لغو زمان‌بندی'));
    } finally {
      setLoading(false);
    }
  };

  if (isMinimized) {
    return null;
  }

  const isRestart = actionType === 'restart';
  const themeColor = isRestart ? 'amber' : 'rose';

  return (
    <div className="fixed top-0 left-0 right-0 bottom-8 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`flex flex-col border shadow-2xl transition-all duration-200 overflow-hidden ${
          isMaximized
            ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-2xl rounded-2xl max-h-[92vh]'
        } ${isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'}`}
      >
        {/* Header with Mandatory Triad Controls (Close, Minimize, Fullscreen) - Rule 7 */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100/90 border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isRestart
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
            >
              {isRestart ? (
                <RotateCcw className="w-5 h-5 animate-spin-slow" />
              ) : (
                <Power className="w-5 h-5 text-rose-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <span>
                    {isBulk
                      ? isRestart
                        ? isEn
                          ? `Restart Fleet (${targetServers.length} Servers)`
                          : `راه‌اندازی مجدد ناوگان (${targetServers.length} سرور)`
                        : isEn
                        ? `Shutdown Fleet (${targetServers.length} Servers)`
                        : `خاموش کردن ناوگان (${targetServers.length} سرور)`
                      : isRestart
                      ? isEn
                        ? `Restart Server: ${singleServer?.name}`
                        : `راه‌اندازی مجدد سرور: ${singleServer?.name}`
                      : isEn
                      ? `Shutdown Server: ${singleServer?.name}`
                      : `خاموش کردن سرور: ${singleServer?.name}`}
                  </span>
                  {isBulk ? (
                    <div className="flex items-center gap-1">
                      {linuxServers.length > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                          {linuxServers.length} Linux
                        </span>
                      )}
                      {windowsServers.length > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          {windowsServers.length} Windows
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        singleServer?.os_type === 'linux'
                          ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                          : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {singleServer?.os_type === 'linux' ? 'Linux OS' : 'Windows Server'}
                    </span>
                  )}
                </h3>
                <FieldInfoTooltip
                  title={
                    isRestart
                      ? isEn
                        ? 'Server Reboot Protocol'
                        : 'مکانیزم راه‌اندازی مجدد سرور'
                      : isEn
                      ? 'Server Shutdown Protocol'
                      : 'مکانیزم خاموش‌سازی سرور'
                  }
                  infoWhatEn={
                    isRestart
                      ? 'Dispatches OS-native reboot signals: Linux uses shutdown -r or reboot via SSH, Windows uses shutdown.exe /r /t with optional broadcast.'
                      : 'Dispatches OS-native poweroff commands: Linux uses shutdown -h or poweroff via SSH, Windows uses shutdown.exe /s /t.'
                  }
                  infoWhatFa={
                    isRestart
                      ? 'ارسال سیگنال‌های سیستمی بر اساس سیستم‌عامل سرور: در لینوکس shutdown -r یا reboot و در ویندوز shutdown.exe /r /t به همراه اخطار متنی.'
                      : 'صدور دستور خاموش‌سازی طبق سیستم‌عامل سرور: در لینوکس shutdown -h یا poweroff و در ویندوز shutdown.exe /s /t با قابلیت اخطار پاپ‌آپ.'
                  }
                  infoWhyEn="Ensures safe, graceful termination of system daemons, database engines, and logged-in user processes based on each target machine's operating system."
                  infoWhyFa="تضمین بستن ایمن دیمون‌های سیستمی، موتورهای دیتابیس و پردازش‌های فعال کاربران به تفکیک ساختار سیستم‌عامل هر سرور مقصد."
                  infoExampleEn={
                    isRestart
                      ? 'Linux: shutdown -r +5 "Maintenance" | Windows: shutdown /r /t 300 /f'
                      : 'Linux: shutdown -h +5 "Powering off" | Windows: shutdown /s /t 300 /f'
                  }
                  infoExampleFa={
                    isRestart
                      ? 'Linux: shutdown -r +5 "Maintenance" | Windows: shutdown /r /t 300 /f'
                      : 'Linux: shutdown -h +5 "Powering off" | Windows: shutdown /s /t 300 /f'
                  }
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {isBulk
                  ? isEn
                    ? `Batch action across ${targetServers.length} selected servers (${linuxServers.length} Linux, ${windowsServers.length} Windows)`
                    : `عملیات گروهی روی ${targetServers.length} سرور منتخب (${linuxServers.length} لینوکس، ${windowsServers.length} ویندوز)`
                  : `${singleServer?.ip}:${singleServer?.os_type === 'linux' ? singleServer?.ssh_port || 22 : singleServer?.win_port || 3389} • ${singleServer?.os_distro || singleServer?.os_type}`}
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

          {/* Action Selector: Restart vs Shutdown */}
          <div
            className={`p-1.5 rounded-xl border flex items-center gap-1.5 ${
              isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setActionType('restart')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                isRestart
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRestart ? 'animate-spin-slow' : ''}`} />
              <span>{isEn ? 'Restart / Reboot' : 'راه‌اندازی مجدد (ری‌استارت)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActionType('poweroff')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                !isRestart
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : isLightMode
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isEn ? 'Shutdown / Power Off' : 'خاموش کردن سرور (Shutdown)'}</span>
            </button>
          </div>

          {/* Attention Warning Notice */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              isRestart
                ? isLightMode
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                : isLightMode
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
            }`}
          >
            <ShieldAlert
              className={`w-5 h-5 shrink-0 mt-0.5 ${isRestart ? 'text-amber-400' : 'text-rose-400'}`}
            />
            <div className="text-xs space-y-1">
              <span className="font-bold block">
                {isRestart
                  ? isEn
                    ? 'Production Impact: Server Reboot'
                    : 'هشدار تایید عملیات حیاتی ری‌استارت'
                  : isEn
                  ? 'Critical Warning: Server Shutdown'
                  : 'هشدار بحرانی خاموش‌سازی سرور'}
              </span>
              <p className="opacity-90 leading-relaxed">
                {isBulk
                  ? isRestart
                    ? isEn
                      ? `Rebooting will temporarily interrupt all running services, network tunnels, daemons, and connected sessions across ${targetServers.length} servers.`
                      : `راه‌اندازی مجدد موجب قطع موقت کلیه سرویس‌ها، پردازش‌های پس‌زمینه و نشست‌های متصل کاربران روی هر ${targetServers.length} سرور منتخب خواهد شد.`
                    : isEn
                    ? `Powering off will completely stop all services across ${targetServers.length} servers. Physical/IPMI intervention may be required to power them back on!`
                    : `خاموش کردن سرورها موجب توقف کامل کلیه سرویس‌های ${targetServers.length} سرور منتخب می‌شود. جهت روشن‌سازی مجدد ممکن است به دسترسی فیزیکی یا IPMI نیاز باشد!`
                  : isRestart
                  ? isEn
                    ? `Rebooting will temporarily interrupt all running services, network tunnels, background daemons, and connected sessions on ${singleServer?.name}.`
                    : `راه‌اندازی مجدد موجب قطع موقت تمامی سرویس‌ها، پردازش‌های پس‌زمینه و نشست‌های متصل کاربران روی سرور «${singleServer?.name}» خواهد شد.`
                  : isEn
                  ? `Shutting down will completely halt ${singleServer?.name}. Ensure you have IPMI/ILO/vCenter access to power it on again remotely!`
                  : `خاموش کردن موجب توقف کامل سرور «${singleServer?.name}» خواهد شد. اطمینان حاصل کنید دسترسی IPMI/ILO/کنسول جهت روشن‌سازی مجدد را دارید!`}
              </p>
            </div>
          </div>

          {/* If Bulk: Collapsible Target Server List */}
          {isBulk && (
            <div
              className={`rounded-xl border overflow-hidden ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setShowServerList(!showServerList)}
                className="w-full flex items-center justify-between p-3 text-xs font-semibold hover:bg-black/5 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>
                    {isEn
                      ? `Target Servers Selected (${targetServers.length})`
                      : `سرورهای هدف انتخاب‌شده (${targetServers.length})`}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({linuxServers.length} Linux, {windowsServers.length} Windows)
                  </span>
                </div>
                {showServerList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showServerList && (
                <div className="max-h-48 overflow-y-auto p-2.5 border-t border-slate-800/40 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {targetServers.map((s) => {
                    const isSrvLinux = s.os_type === 'linux';
                    return (
                      <div
                        key={s.id}
                        className={`p-2 rounded-lg border flex items-center justify-between font-mono ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
                        }`}
                      >
                        <div className="truncate me-2">
                          <span className="font-bold text-slate-200 block truncate">{s.name}</span>
                          <span className="text-[10px] text-slate-400">{s.ip}</span>
                        </div>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                            isSrvLinux
                              ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                              : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {isSrvLinux ? 'Linux' : 'Windows'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 1. Timing Mode / Grace Period Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {isRestart
                    ? isEn
                      ? 'Restart Schedule & Grace Period:'
                      : 'زمان‌بندی و مهلت پیش از ری‌استارت:'
                    : isEn
                    ? 'Shutdown Schedule & Grace Period:'
                    : 'زمان‌بندی و مهلت پیش از خاموش‌سازی:'}
                </span>
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
                  <span className="font-semibold block">
                    {isEn ? 'Custom Delay (Minutes):' : 'مدت تاخیر دلخواه (دقیقه):'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isEn
                      ? `Schedule ${isRestart ? 'reboot' : 'shutdown'} after specified minutes`
                      : `تعیین دقیق دقایق تاخیر تا ${isRestart ? 'راه‌اندازی مجدد' : 'خاموش‌سازی'}`}
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
                    <span>
                      {isEn
                        ? 'Broadcast Warning to Logged-in Users'
                        : 'ارسال پیام هشدار به کاربران لاگین داخل سرور'}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-400 block">
                    {isEn
                      ? 'Dispatches wall on Linux (all active TTYs) and msg.exe on Windows interactive sessions'
                      : 'ارسال پیام در ترمینال لینوکس (دستور wall) و پاپ‌آپ ویندوز (msg.exe)'}
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

          {/* 3. Force Option */}
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
                  {isEn
                    ? 'Windows /f flag and Linux force unmount / sync'
                    : 'پارامتر /f ویندوز و همگام‌سازی فوری دیسک در لینوکس'}
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
                  ? 'One or more target servers enforce zero-storage policy. Provide administrative credentials to execute.'
                  : 'یک یا چند سرور تحت سیاست عدم ذخیره‌سازی گذرواژه هستند. لطفاً جهت اجرای دستور رمز عبور را وارد نمایید.'}
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEn ? 'Enter administrative password...' : 'رمز عبور سرور را وارد کنید...'}
                className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none transition ${
                  isLightMode
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                    : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                }`}
              />
            </div>
          )}

          {/* 5. Command Preview Badges (Adaptive OS Specific) */}
          <div
            className={`p-3 rounded-xl border space-y-2 text-[11px] font-mono ${
              isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-black/40 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 text-slate-400 font-sans font-semibold">
              <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{isEn ? 'Adaptive Command Dispatch Preview:' : 'پیش‌نمایش انطباقی دستورات بر اساس سیستم‌عامل:'}</span>
            </div>

            {/* Linux Preview (if applicable) */}
            {(linuxServers.length > 0 || singleServer?.os_type === 'linux') && (
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/20 border border-cyan-500/20">
                <span className="text-cyan-400 font-bold shrink-0">Linux OS:</span>
                <span className="text-cyan-300 truncate font-mono text-[10.5px]">
                  {isRestart
                    ? delayMinutes === 0
                      ? 'sudo shutdown -r now || sudo reboot'
                      : `sudo shutdown -r +${delayMinutes}`
                    : delayMinutes === 0
                    ? 'sudo shutdown -h now || sudo poweroff'
                    : `sudo shutdown -h +${delayMinutes}`}
                </span>
              </div>
            )}

            {/* Windows Preview (if applicable) */}
            {(windowsServers.length > 0 || singleServer?.os_type === 'windows') && (
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-black/20 border border-blue-500/20">
                <span className="text-blue-400 font-bold shrink-0">Windows:</span>
                <span className="text-blue-300 truncate font-mono text-[10.5px]">
                  {isRestart
                    ? `shutdown /r /t ${delayMinutes * 60} ${forceRestart ? '/f' : ''}`
                    : `shutdown /s /t ${delayMinutes * 60} ${forceRestart ? '/f' : ''}`}
                </span>
              </div>
            )}
          </div>

          {/* Execution Results View (if completed bulk run) */}
          {executionResults && executionResults.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-xs font-bold block text-slate-200">
                {isEn ? 'Execution Output Summary:' : 'خلاصه نتایج اجرای دستور:'}
              </span>
              <div className="max-h-40 overflow-y-auto space-y-1.5">
                {executionResults.map((res) => (
                  <div
                    key={res.serverId}
                    className={`p-2 rounded-lg border flex items-center justify-between text-xs font-mono ${
                      res.success
                        ? isLightMode
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                        : isLightMode
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {res.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-bold truncate">{res.serverName}</span>
                      <span className="text-[10px] opacity-70">({res.ip})</span>
                    </div>
                    <span className="text-[10px] truncate max-w-[200px]">{res.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            {/* Cancel Scheduled Action button */}
            <button
              type="button"
              onClick={handleCancelPending}
              disabled={loading}
              title={
                isEn
                  ? `Cancel any pending scheduled ${isRestart ? 'restart' : 'shutdown'}`
                  : `لغو هرگونه ${isRestart ? 'ری‌استارت' : 'خاموش‌سازی'} زمان‌بندی‌شده قبلی`
              }
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Ban className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {isEn
                  ? `Abort Scheduled ${isRestart ? 'Restart' : 'Shutdown'}`
                  : `لغو ${isRestart ? 'ری‌استارت' : 'خاموش‌سازی'} زمان‌بندی‌شده`}
              </span>
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
                className={`px-5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                  isRestart
                    ? 'text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-md shadow-amber-500/20'
                    : 'text-white bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 shadow-md shadow-rose-500/20'
                }`}
              >
                {loading ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isEn ? 'Sending Command...' : 'در حال ارسال دستور...'}</span>
                  </>
                ) : isRestart ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {delayMinutes === 0
                        ? isBulk
                          ? isEn
                            ? `Restart ${targetServers.length} Servers Now`
                            : `ری‌استارت فوری ${targetServers.length} سرور`
                          : isEn
                          ? 'Restart Now'
                          : 'ری‌استارت فوری'
                        : isEn
                        ? `Schedule Restart (${delayLabel})`
                        : `زمان‌بندی ری‌استارت (${delayLabel})`}
                    </span>
                  </>
                ) : (
                  <>
                    <Power className="w-3.5 h-3.5" />
                    <span>
                      {delayMinutes === 0
                        ? isBulk
                          ? isEn
                            ? `Shutdown ${targetServers.length} Servers Now`
                            : `خاموش کردن فوری ${targetServers.length} سرور`
                          : isEn
                          ? 'Shutdown Now'
                          : 'خاموش کردن فوری'
                        : isEn
                        ? `Schedule Shutdown (${delayLabel})`
                        : `زمان‌بندی خاموش‌سازی (${delayLabel})`}
                    </span>
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
