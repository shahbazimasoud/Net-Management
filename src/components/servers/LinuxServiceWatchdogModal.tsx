import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Plus,
  Play,
  RotateCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  FileText,
  Activity,
  Zap,
  Lock,
  Unlock,
  Check,
} from 'lucide-react';
import { RemoteServer, LinuxSystemService, LinuxServiceWatchdogRule } from '../../types';
import { ModalHeaderControls } from '../common/ModalHeaderControls';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchLinuxServiceWatchdogs,
  saveLinuxServiceWatchdog,
  deleteLinuxServiceWatchdog,
  testLinuxServiceWatchdog,
  resetLinuxServiceWatchdogAntiLoop,
  fetchLinuxWatchdogLogs,
} from '../../services/api';

interface LinuxServiceWatchdogModalProps {
  server: RemoteServer;
  services: LinuxSystemService[];
  initialServiceName?: string;
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  isLightMode: boolean;
  isEn: boolean;
  ephemeralPassword?: string;
  onRefreshServices?: () => void;
}

export const LinuxServiceWatchdogModal: React.FC<LinuxServiceWatchdogModalProps> = ({
  server,
  services,
  initialServiceName,
  isOpen,
  onClose,
  onMinimize,
  isLightMode,
  isEn,
  ephemeralPassword,
  onRefreshServices,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'form' | 'logs'>('rules');

  const [watchdogs, setWatchdogs] = useState<LinuxServiceWatchdogRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState(initialServiceName || '');
  const [enabled, setEnabled] = useState(true);
  const [checkIntervalSeconds, setCheckIntervalSeconds] = useState(30);
  const [maxRestartAttempts, setMaxRestartAttempts] = useState(3);
  const [cooldownPeriodSeconds, setCooldownPeriodSeconds] = useState(300);
  const [rebootOnPersistentFailure, setRebootOnPersistentFailure] = useState(false);
  const [rebootCooldownMinutes, setRebootCooldownMinutes] = useState(60);
  const [minUptimeBeforeRebootMinutes, setMinUptimeBeforeRebootMinutes] = useState(5);
  const [maxRebootsPerDay, setMaxRebootsPerDay] = useState(2);
  const [customPreRestartCommand, setCustomPreRestartCommand] = useState('');
  const [saving, setSaving] = useState(false);

  // Test run state
  const [testingService, setTestingService] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  // Reset loop state
  const [resettingService, setResettingService] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Auto-dismiss banners
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Load watchdogs from server
  const loadWatchdogs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchLinuxServiceWatchdogs(server.id, ephemeralPassword);
      if (res.success && Array.isArray(res.watchdogs)) {
        setWatchdogs(res.watchdogs);
      } else {
        setErrorMsg(res.error || (isEn ? 'Failed to fetch watchdog rules' : 'خطا در بارگیری قوانین ناظر'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to communicate with remote server' : 'خطا در ارتباط با سرور'));
    } finally {
      setLoading(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  // Load logs
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetchLinuxWatchdogLogs(server.id, 120, ephemeralPassword);
      if (res.success) {
        setLogs(res.logs || (isEn ? 'No logs recorded.' : 'لاگی ثبت نشده است.'));
      }
    } catch (err: any) {
      setLogs(`Error: ${err?.message}`);
    } finally {
      setLoadingLogs(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  useEffect(() => {
    if (isOpen) {
      loadWatchdogs();
      if (initialServiceName) {
        setServiceName(initialServiceName);
        setEditingRuleId(null);
        setActiveTab('form');
      } else {
        setEditingRuleId(null);
        setActiveTab('rules');
      }
    }
  }, [isOpen, initialServiceName, loadWatchdogs]);

  useEffect(() => {
    if (activeTab === 'logs' && isOpen) {
      loadLogs();
    }
  }, [activeTab, isOpen, loadLogs]);

  // Open Form to Edit
  const handleEditRule = (rule: LinuxServiceWatchdogRule) => {
    setEditingRuleId(rule.id);
    setServiceName(rule.serviceName);
    setEnabled(rule.enabled);
    setCheckIntervalSeconds(rule.checkIntervalSeconds || 30);
    setMaxRestartAttempts(rule.maxRestartAttempts || 3);
    setCooldownPeriodSeconds(rule.cooldownPeriodSeconds || 300);
    setRebootOnPersistentFailure(rule.rebootOnPersistentFailure || false);
    setRebootCooldownMinutes(rule.rebootCooldownMinutes || 60);
    setMinUptimeBeforeRebootMinutes(rule.minUptimeBeforeRebootMinutes || 5);
    setMaxRebootsPerDay(rule.maxRebootsPerDay || 2);
    setCustomPreRestartCommand(rule.customPreRestartCommand || '');
    setActiveTab('form');
  };

  // Reset Form
  const resetForm = () => {
    setEditingRuleId(null);
    setServiceName('');
    setEnabled(true);
    setCheckIntervalSeconds(30);
    setMaxRestartAttempts(3);
    setCooldownPeriodSeconds(300);
    setRebootOnPersistentFailure(false);
    setRebootCooldownMinutes(60);
    setMinUptimeBeforeRebootMinutes(5);
    setMaxRebootsPerDay(2);
    setCustomPreRestartCommand('');
  };

  // Save rule
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) {
      setErrorMsg(isEn ? 'Please specify a service name' : 'لطفاً نام سرویس را مشخص کنید');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const rule: LinuxServiceWatchdogRule = {
      id: editingRuleId || serviceName.trim().replace(/[^a-zA-Z0-9_@.-]/g, '_'),
      serviceName: serviceName.trim(),
      enabled,
      checkIntervalSeconds,
      maxRestartAttempts,
      cooldownPeriodSeconds,
      rebootOnPersistentFailure,
      rebootCooldownMinutes,
      minUptimeBeforeRebootMinutes,
      maxRebootsPerDay,
      customPreRestartCommand: customPreRestartCommand.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await saveLinuxServiceWatchdog(server.id, rule, ephemeralPassword);
      if (res.success) {
        setSuccessMsg(
          isEn
            ? `Watchdog policy for ${serviceName} deployed and activated successfully.`
            : `سیاست ناظر خودکار برای ${serviceName} با موفقیت مستقر و فعال شد.`
        );
        resetForm();
        setActiveTab('rules');
        await loadWatchdogs();
        if (onRefreshServices) onRefreshServices();
      } else {
        setErrorMsg(res.message || res.error || (isEn ? 'Failed to save watchdog rule' : 'خطا در ذخیره قانون ناظر'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Execution error' : 'خطای اجرا'));
    } finally {
      setSaving(false);
    }
  };

  // Delete rule
  const handleDeleteRule = async (name: string) => {
    const confirmMsg = isEn
      ? `Are you sure you want to remove the watchdog policy for ${name}? The daemon service will be stopped and removed.`
      : `آیا از حذف سیاست ناظر خودکار برای ${name} اطمینان دارید؟ دیمن متوقف و پاک خواهد شد.`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await deleteLinuxServiceWatchdog(server.id, name, ephemeralPassword);
      if (res.success) {
        setSuccessMsg(
          isEn
            ? `Watchdog policy for ${name} removed.`
            : `سیاست ناظر خودکار برای ${name} حذف شد.`
        );
        await loadWatchdogs();
        if (onRefreshServices) onRefreshServices();
      } else {
        setErrorMsg(res.message || res.error || (isEn ? 'Failed to delete rule' : 'خطا در حذف قانون'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Execution error' : 'خطای اجرا'));
    } finally {
      setLoading(false);
    }
  };

  // Run test check
  const handleTestCheck = async (name: string) => {
    setTestingService(name);
    setTestOutput(null);
    try {
      const res = await testLinuxServiceWatchdog(server.id, name, ephemeralPassword);
      setTestOutput(res.output || (res.success ? 'PASS' : 'FAILED'));
    } catch (err: any) {
      setTestOutput(`Error: ${err?.message}`);
    } finally {
      setTestingService(null);
    }
  };

  // Reset anti-loop lock
  const handleResetLoop = async (name: string) => {
    setResettingService(name);
    try {
      const res = await resetLinuxServiceWatchdogAntiLoop(server.id, name, ephemeralPassword);
      if (res.success) {
        setSuccessMsg(
          isEn
            ? `Anti-loop lock cleared for ${name}. Watchdog re-armed.`
            : `قفل ضدلوپ برای ${name} پاک شد و ناظر مجدداً فعال گردید.`
        );
        await loadWatchdogs();
      } else {
        setErrorMsg(res.message || res.error || (isEn ? 'Failed to reset anti-loop lock' : 'خطا در ریست قفل'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Execution error' : 'خطای اجرا'));
    } finally {
      setResettingService(null);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-[80] p-0 flex flex-col'
          : 'fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm pb-10'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`w-full flex flex-col overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'h-full rounded-none border-none'
            : 'max-w-5xl max-h-[92vh] rounded-2xl border shadow-2xl'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-300 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Shield className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-sans">
                  {isEn
                    ? 'Linux Service Watchdog & Auto-Recovery Engine'
                    : 'ناظر خودکار و خودترمیمی سرویس‌های لینوکس'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {isEn ? 'Systemd Native Agent' : 'ایجنت نیتیو سیستم‌دی'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isEn ? 'Target Host: ' : 'سرور مقصد: '}
                <span className="font-mono text-cyan-400 font-semibold">{server.name || server.ip}</span>
                <span className="text-slate-500"> ({server.ip}:{server.ssh_port || 22})</span>
              </p>
            </div>
          </div>

          <ModalHeaderControls
            onMinimize={onMinimize}
            onClose={onClose}
            onMaximizeToggle={() => setIsMaximized((prev) => !prev)}
            isMaximized={isMaximized}
            isLightMode={isLightMode}
            isEn={isEn}
          />
        </div>

        {/* Tab Navigation & Status Bar */}
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-b shrink-0 ${
            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/50 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? isLightMode
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Watchdog Policies' : 'سیاست‌های ناظر'}</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  watchdogs.length > 0 ? 'bg-cyan-500/30 text-cyan-300' : 'bg-slate-700 text-slate-400'
                }`}
              >
                {watchdogs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setActiveTab('form');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'form'
                  ? isLightMode
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingRuleId ? (isEn ? 'Edit Policy' : 'ویرایش سیاست') : isEn ? 'New Policy' : 'سیاست جدید'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? isLightMode
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-400 hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isEn ? 'Live Audit Logs' : 'لاگ‌های زنده ناظر'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (activeTab === 'logs') loadLogs();
                else loadWatchdogs();
              }}
              title={isEn ? 'Refresh Status' : 'بروزرسانی وضعیت'}
              className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Banner Messages */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-rose-200 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-400 hover:text-emerald-200 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* TAB 1: RULES LIST */}
          {activeTab === 'rules' && (
            <div className="space-y-4">
              {/* Anti-Loop Safety Explainer Card */}
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  isLightMode
                    ? 'bg-cyan-50 border-cyan-200 text-cyan-950'
                    : 'bg-cyan-950/25 border-cyan-800/50 text-cyan-200'
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-cyan-300">
                    {isEn
                      ? 'Enterprise Anti-Boot-Loop Architectural Guarantee'
                      : 'تضمین معماری محافظت کامل در برابر لوپ ریستارت و بوت'}
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {isEn
                      ? 'The NetTopology watchdog agent operates directly on the target host using systemd. When a service goes down, it attempts auto-restart up to your configured limit. If restarts fail and server reboot is authorized, the 3-Layer Anti-Loop Matrix verifies (1) minimum server uptime (≥ 5m), (2) persistent reboot cooldown (≥ 60m surviving across reboots), and (3) 24h daily limit to completely prevent infinite boot loops.'
                      : 'ایجنت ناظر مستقیماً روی سرور مقصد با لایه systemd فعالیت می‌کند. هنگام سقوط سرویس، ابتدا به تعداد دفعات مشخص شده تلاش برای استارت مجدد می‌کند. در صورت عدم موفقیت و فعال بودن مجوز ریستارت، ماتریس ۳ لایه ضدلوپ شامل (۱) حداقل زمان روشن بودن سرور (≥ ۵ دقیقه)، (۲) کول‌داون پایدار ریستارت (≥ ۶۰ دقیقه که پس از ریستارت پاک نمی‌شود) و (۳) سقف تعداد مجاز در شبانه‌روز، مانع از افتادن سرور در لوپ بی‌پایان ریستارت می‌شود.'}
                  </p>
                </div>
              </div>

              {/* Rules Table / Cards */}
              {loading && watchdogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                  <p className="text-xs">{isEn ? 'Querying target host for active watchdog units...' : 'در حال استعلام وضعیت قوانین ناظر از سرور...'}</p>
                </div>
              ) : watchdogs.length === 0 ? (
                <div
                  className={`p-10 rounded-xl border text-center space-y-3 ${
                    isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <ShieldAlert className="w-10 h-10 text-slate-500 mx-auto" />
                  <div className="text-sm font-semibold text-slate-300">
                    {isEn ? 'No Watchdog Policies Configured Yet' : 'هنوز هیچ سیاست ناظری برای این سرور تنظیم نشده است'}
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {isEn
                      ? 'Create an auto-recovery rule to monitor critical daemons like Nginx, MySQL, Docker, or custom services.'
                      : 'یک قانون خودترمیمی ایجاد کنید تا سرویس‌های حساسی مانند Nginx، MySQL، داکر یا سرویس‌های دلخواه شما مانیتور و بازیابی شوند.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setActiveTab('form');
                    }}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer transition shadow-lg shadow-cyan-900/20"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isEn ? 'Create First Policy' : 'ایجاد اولین سیاست ناظر'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {watchdogs.map((rule) => {
                    const isAntiLoopTripped = rule.status === 'anti_loop_halted';
                    const isHealthy = rule.status === 'active';
                    const isRecovering = rule.status === 'recovering';
                    const isFailed = rule.status === 'failed';

                    return (
                      <div
                        key={rule.id || rule.serviceName}
                        className={`p-4 rounded-xl border transition-all ${
                          isAntiLoopTripped
                            ? 'bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/20'
                            : isHealthy
                            ? isLightMode
                              ? 'bg-white border-slate-200 shadow-sm'
                              : 'bg-slate-900/70 border-slate-800'
                            : isRecovering
                            ? 'bg-amber-950/20 border-amber-500/40'
                            : 'bg-slate-900/50 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-mono text-sm font-bold text-cyan-400">
                                {rule.serviceName}
                              </span>

                              {/* Status Badge */}
                              {isAntiLoopTripped ? (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3 text-rose-400 animate-pulse" />
                                  <span>{isEn ? 'ANTI-LOOP HALTED' : 'متوقف توسط قفل ضدلوپ'}</span>
                                </span>
                              ) : isHealthy ? (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                  <span>{isEn ? 'Healthy & Active' : 'سالم و فعال'}</span>
                                </span>
                              ) : isRecovering ? (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                  <RotateCw className="w-3 h-3 text-amber-400 animate-spin" />
                                  <span>
                                    {isEn
                                      ? `Recovering (Attempt ${rule.consecutiveFailures || 1})`
                                      : `در حال بازیابی (تلاش ${rule.consecutiveFailures || 1})`}
                                  </span>
                                </span>
                              ) : isFailed ? (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  {isEn ? 'Persistent Failure' : 'شکست پایدار'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                                  {rule.status || 'unknown'}
                                </span>
                              )}

                              {/* Unit State */}
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                  rule.systemdUnitActive
                                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-slate-800 text-slate-500'
                                }`}
                              >
                                {rule.systemdUnitActive ? 'daemon: active' : 'daemon: stopped'}
                              </span>

                              {rule.rebootOnPersistentFailure && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-purple-400" />
                                  <span>{isEn ? 'Reboot Enabled' : 'مجوز ریستارت سرور'}</span>
                                </span>
                              )}
                            </div>

                            {/* Details Chips */}
                            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" />
                                <span>{isEn ? 'Interval: ' : 'بازه چک: '}</span>
                                <strong className="text-slate-300 font-mono">{rule.checkIntervalSeconds}s</strong>
                              </span>
                              <span className="flex items-center gap-1">
                                <RotateCw className="w-3 h-3 text-slate-500" />
                                <span>{isEn ? 'Max Restarts: ' : 'حداکثر تلاش استارت: '}</span>
                                <strong className="text-slate-300 font-mono">{rule.maxRestartAttempts}x</strong>
                              </span>
                              {rule.rebootOnPersistentFailure && (
                                <span className="flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-slate-500" />
                                  <span>{isEn ? 'Anti-Loop Cooldown: ' : 'کول‌داون ضدلوپ: '}</span>
                                  <strong className="text-slate-300 font-mono">{rule.rebootCooldownMinutes}m</strong>
                                </span>
                              )}
                              {rule.consecutiveFailures !== undefined && rule.consecutiveFailures > 0 && (
                                <span className="text-amber-400 font-mono font-medium">
                                  {isEn ? 'Failures count: ' : 'تعداد خطاهای متوالی: '}
                                  {rule.consecutiveFailures}
                                </span>
                              )}
                            </div>

                            {/* Last Action Message */}
                            {rule.lastActionMessage && (
                              <p
                                className={`text-xs font-mono px-2.5 py-1 rounded-lg ${
                                  isAntiLoopTripped
                                    ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                                    : 'bg-slate-800/50 text-slate-400'
                                }`}
                              >
                                {rule.lastActionMessage}
                              </p>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Reset Anti-Loop Button (if tripped) */}
                            {isAntiLoopTripped && (
                              <button
                                type="button"
                                disabled={resettingService === rule.serviceName}
                                onClick={() => handleResetLoop(rule.serviceName)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-md shadow-rose-900/30"
                                title={
                                  isEn
                                    ? 'Reset Anti-Loop Lock and Re-arm Watchdog'
                                    : 'ریست قفل ضدلوپ و فعال‌سازی مجدد ناظر'
                                }
                              >
                                {resettingService === rule.serviceName ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Unlock className="w-3 h-3" />
                                )}
                                <span>{isEn ? 'Reset Anti-Loop' : 'ریست قفل ضدلوپ'}</span>
                              </button>
                            )}

                            {/* Test Run Button */}
                            <button
                              type="button"
                              disabled={testingService === rule.serviceName}
                              onClick={() => handleTestCheck(rule.serviceName)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-xs transition cursor-pointer flex items-center gap-1"
                              title={isEn ? 'Test Health Check Now' : 'اجرای تست ارزیابی اکنون'}
                            >
                              {testingService === rule.serviceName ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              <span>{isEn ? 'Test Check' : 'تست چک'}</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleEditRule(rule)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition cursor-pointer"
                              title={isEn ? 'Edit Policy Configuration' : 'ویرایش تنظیمات سیاست'}
                            >
                              {isEn ? 'Edit' : 'ویرایش'}
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.serviceName)}
                              className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition cursor-pointer"
                              title={isEn ? 'Delete Policy' : 'حذف سیاست'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Test output console for this rule if active */}
                        {testingService === rule.serviceName && (
                          <div className="mt-3 p-3 rounded-lg bg-black text-cyan-400 font-mono text-xs flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{isEn ? 'Executing remote test evaluation on host...' : 'در حال اجرای تست ارزیابی زنده روی سرور...'}</span>
                          </div>
                        )}
                        {testOutput && !testingService && (
                          <div className="mt-3 p-3 rounded-lg bg-black border border-slate-800 font-mono text-xs text-slate-200 space-y-1">
                            <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800">
                              <span className="flex items-center gap-1.5">
                                <Terminal className="w-3 h-3 text-cyan-400" />
                                <span>{isEn ? 'Diagnostic Evaluation Result:' : 'نتیجه ارزیابی تشخیصی:'}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setTestOutput(null)}
                                className="text-slate-500 hover:text-slate-300 text-xs"
                              >
                                {isEn ? 'Close' : 'بستن'}
                              </button>
                            </div>
                            <pre className="whitespace-pre-wrap text-emerald-400 pt-1">{testOutput}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE / EDIT FORM */}
          {activeTab === 'form' && (
            <form onSubmit={handleSaveRule} className="space-y-5">
              <div
                className={`p-4 rounded-xl border ${
                  isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>
                    {editingRuleId
                      ? isEn
                        ? `Edit Watchdog Policy for ${serviceName}`
                        : `ویرایش سیاست ناظر برای ${serviceName}`
                      : isEn
                      ? 'Configure New Auto-Recovery Policy'
                      : 'پیکربندی سیاست خودترمیمی جدید'}
                  </span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Service Name Input */}
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Monitored Service Name / Unit' : 'نام سرویس یا واحد مانیتور شونده'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Monitored Service' : 'سرویس تحت نظارت'}
                        infoWhatEn="The exact systemd unit name to monitor (e.g. nginx.service, mysqld.service, docker.service)."
                        infoWhatFa="نام دقیق یونیت سیستم‌دی که قصد نظارت بر سلامت آن را دارید (مانند nginx.service یا docker.service)."
                        infoWhyEn="The watchdog daemon periodically queries systemctl is-active for this exact unit name."
                        infoWhyFa="دیمن ناظر در دوره‌های زمانی منظم وضعیت این سرویس را استعلام می‌کند."
                        infoExampleEn="nginx.service or docker.service"
                        infoExampleFa="nginx.service یا docker.service"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        placeholder="e.g. nginx.service"
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                      {/* Quick Dropdown of Detected Services */}
                      {services && services.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) setServiceName(e.target.value);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-100 border-slate-300 text-slate-800'
                              : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}
                        >
                          <option value="">{isEn ? 'Pick Detected Service...' : 'انتخاب از سرویس‌های شناسایی‌شده...'}</option>
                          {services.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} ({s.activeState})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Check Interval */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Health Check Interval (Seconds)' : 'بازه زمانی بررسی سلامت (ثانیه)'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Check Interval' : 'بازه زمانی چک'}
                        infoWhatEn="Number of seconds to sleep between each health evaluation."
                        infoWhatFa="فاصله زمانی برحسب ثانیه بین هر ارزیابی سلامت سرویس توسط دیمن."
                        infoWhyEn="Lower intervals detect failures faster; standard intervals (30s-60s) impose minimal overhead."
                        infoWhyFa="مقادیر کوتاه‌تر خرابی را سریع‌تر تشخیص می‌دهند و مقادیر ۳۰ الی ۶۰ ثانیه بهینه و بدون بار هستند."
                        infoExampleEn="Recommended: 30 seconds"
                        infoExampleFa="مقدار پیشنهادی: ۳۰ ثانیه"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <select
                      value={checkIntervalSeconds}
                      onChange={(e) => setCheckIntervalSeconds(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value={10}>10 {isEn ? 'seconds (Fastest)' : 'ثانیه (بسیار سریع)'}</option>
                      <option value={15}>15 {isEn ? 'seconds' : 'ثانیه'}</option>
                      <option value={30}>30 {isEn ? 'seconds (Recommended)' : 'ثانیه (پیشنهادی)'}</option>
                      <option value={60}>60 {isEn ? 'seconds (1 minute)' : 'ثانیه (۱ دقیقه)'}</option>
                      <option value={120}>120 {isEn ? 'seconds (2 minutes)' : 'ثانیه (۲ دقیقه)'}</option>
                      <option value={300}>300 {isEn ? 'seconds (5 minutes)' : 'ثانیه (۵ دقیقه)'}</option>
                    </select>
                  </div>

                  {/* Max Restart Attempts */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Max Restart Retries Before Escalation' : 'حداکثر دفعات تلاش استارت قبل از اقدام نهایی'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Max Restart Retries' : 'حداکثر دفعات تلاش'}
                        infoWhatEn="Maximum number of consecutive systemctl restart attempts allowed when down."
                        infoWhatFa="حداکثر دفعاتی که در صورت متوقف بودن سرویس، دستور استارت مجدد اجرا می‌شود."
                        infoWhyEn="If a service repeatedly crashes (e.g. broken config), stopping retries prevents CPU thrashing."
                        infoWhyFa="اگر سرویسی به دلیل خطای کانفیگ بلافاصله کرش کند، محدود کردن تلاش‌ها مانع هدررفت پردازنده می‌شود."
                        infoExampleEn="Recommended: 3 attempts"
                        infoExampleFa="مقدار پیشنهادی: ۳ بار"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <select
                      value={maxRestartAttempts}
                      onChange={(e) => setMaxRestartAttempts(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value={1}>1 {isEn ? 'attempt' : 'تلاش'}</option>
                      <option value={2}>2 {isEn ? 'attempts' : 'تلاش'}</option>
                      <option value={3}>3 {isEn ? 'attempts (Standard)' : 'تلاش (استاندارد)'}</option>
                      <option value={5}>5 {isEn ? 'attempts' : 'تلاش'}</option>
                      <option value={10}>10 {isEn ? 'attempts' : 'تلاش'}</option>
                    </select>
                  </div>

                  {/* Cooldown Healthy Period */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Healthy Stability Window for Counter Reset' : 'مدت پایداری برای صفر شدن شمارنده خطا (ثانیه)'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Stability Window' : 'پنجره پایداری'}
                        infoWhatEn="How long (in seconds) the service must stay continuously active before resetting failure counter to 0."
                        infoWhatFa="مدت زمانی که سرویس باید پیوسته فعال بماند تا شمارنده خطاهای متوالی به صفر ریست شود."
                        infoWhyEn="Ensures that flaky services that crash every 10 seconds are not falsely treated as healthy."
                        infoWhyFa="مانع از این می‌شود که سرویسی با ناپایداری مکرر به اشتباه سالم در نظر گرفته شود."
                        infoExampleEn="Recommended: 300 seconds (5 minutes)"
                        infoExampleFa="پیشنهادی: ۳۰۰ ثانیه (۵ دقیقه)"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <select
                      value={cooldownPeriodSeconds}
                      onChange={(e) => setCooldownPeriodSeconds(Number(e.target.value))}
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    >
                      <option value={60}>60s (1 {isEn ? 'minute' : 'دقیقه'})</option>
                      <option value={180}>180s (3 {isEn ? 'minutes' : 'دقیقه'})</option>
                      <option value={300}>300s (5 {isEn ? 'minutes - Recommended' : 'دقیقه - پیشنهادی'})</option>
                      <option value={600}>600s (10 {isEn ? 'minutes' : 'دقیقه'})</option>
                    </select>
                  </div>

                  {/* Pre-restart Hook Command */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Optional Pre-Restart Hook Command' : 'دستور پاکسازی قبل از استارت (اختیاری)'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Pre-Restart Hook' : 'دستور قبل از استارت'}
                        infoWhatEn="A shell command to run right before executing systemctl restart (e.g. killing zombie processes or flushing temp files)."
                        infoWhatFa="دستور شلی که دقیقاً قبل از دستور استارت سرویس برای رفع موانع یا پراسس‌های زامبی اجرا می‌شود."
                        infoWhyEn="Useful for services that leave dead lockfiles or orphaned child sockets behind."
                        infoWhyFa="مناسب برای سرویس‌هایی که فایل‌های لاک خراب یا پورت‌های معلق باقی می‌گذارند."
                        infoExampleEn="rm -f /var/run/mydaemon.pid"
                        infoExampleFa="rm -f /var/run/mydaemon.pid"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <input
                      type="text"
                      value={customPreRestartCommand}
                      onChange={(e) => setCustomPreRestartCommand(e.target.value)}
                      placeholder={isEn ? 'e.g. sync; rm -f /tmp/*.sock' : 'مثال: sync; rm -f /tmp/*.sock'}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                  </div>
                </div>

                {/* ESCALATION SECTION: REBOOT AUTHORIZATION & ANTI-LOOP MATRIX */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-4">
                  <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30">
                    <div className="flex items-start gap-2.5">
                      <Zap className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-purple-200">
                          {isEn
                            ? 'Escalation Action: Reboot Server on Persistent Failure'
                            : 'اقدام نهایی: ریستارت سرور در صورت عدم موفقیت تلاش‌های استارت'}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {isEn
                            ? 'If enabled, and the service remains down after all retry attempts, the watchdog is authorized to initiate an emergency controlled server reboot.'
                            : 'اگر این تیک زده شود، در صورتی که پس از تمام دفعات تلاش سرویس استارت نشد، ناظر مجاز به انجام ریستارت اضطراری و کنترل‌شده سرور خواهد بود.'}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={rebootOnPersistentFailure}
                        onChange={(e) => setRebootOnPersistentFailure(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {/* ANTI-BOOT-LOOP SETTINGS (Visible when reboot toggle enabled) */}
                  {rebootOnPersistentFailure && (
                    <div
                      className={`p-4 rounded-xl border space-y-3.5 ${
                        isLightMode
                          ? 'bg-amber-50 border-amber-200 text-amber-950'
                          : 'bg-amber-950/15 border-amber-500/30 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <Lock className="w-4 h-4 text-amber-400" />
                        <span>
                          {isEn
                            ? 'Strict Anti-Boot-Loop Circuit Breaker Matrix'
                            : 'ماتریس محافظت قطعی در برابر چرخه لوپ بی‌پایان بوت'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Minimum Host Uptime */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-300">
                              {isEn ? 'Min Uptime Before Reboot' : 'حداقل آپ‌تایم قبل ریستارت'}
                            </label>
                            <FieldInfoTooltip
                              fieldName={isEn ? 'Min Uptime' : 'حداقل آپ‌تایم'}
                              infoWhatEn="Minimum minutes the host must have been running before allowing another reboot."
                              infoWhatFa="حداقل دقایقی که سرور باید از زمان بوت شدن روشن بوده باشد تا ریستارت جدید مجاز شود."
                              infoWhyEn="Prevents rapid reboot cycles when a service fails during initial system startup."
                              infoWhyFa="مانع از ریستارت فوری و پیاپی سرور در ثانیه‌های ابتدایی بوت سیستم‌عامل می‌شود."
                              infoExampleEn="Standard: 5 minutes"
                              infoExampleFa="مقدار استاندارد: ۵ دقیقه"
                              isLightMode={isLightMode}
                              isEn={isEn}
                            />
                          </div>
                          <select
                            value={minUptimeBeforeRebootMinutes}
                            onChange={(e) => setMinUptimeBeforeRebootMinutes(Number(e.target.value))}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs border focus:outline-none ${
                              isLightMode
                                ? 'bg-white border-amber-300 text-slate-900'
                                : 'bg-slate-950 border-amber-500/30 text-slate-100'
                            }`}
                          >
                            <option value={2}>2 {isEn ? 'minutes' : 'دقیقه'}</option>
                            <option value={5}>5 {isEn ? 'minutes (Recommended)' : 'دقیقه (پیشنهادی)'}</option>
                            <option value={10}>10 {isEn ? 'minutes' : 'دقیقه'}</option>
                            <option value={15}>15 {isEn ? 'minutes' : 'دقیقه'}</option>
                          </select>
                        </div>

                        {/* Reboot Cooldown Window */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-300">
                              {isEn ? 'Reboot Cooldown Window' : 'کول‌داون بین ریستارت‌ها'}
                            </label>
                            <FieldInfoTooltip
                              fieldName={isEn ? 'Reboot Cooldown' : 'کول‌داون ریستارت'}
                              infoWhatEn="Minimum minutes that must elapse between watchdog-initiated reboots."
                              infoWhatFa="حداقل دقایقی که باید بین دو ریستارت خودکار ناشی از ناظر سپری شود."
                              infoWhyEn="Stored persistently on disk across reboots; guarantees the server never reboots twice in close succession."
                              infoWhyFa="این زمان روی دیسک ذخیره شده و پس از ریستارت حفظ می‌شود؛ مانع از ریستارت مکرر می‌گردد."
                              infoExampleEn="Standard: 60 minutes"
                              infoExampleFa="مقدار استاندارد: ۶۰ دقیقه"
                              isLightMode={isLightMode}
                              isEn={isEn}
                            />
                          </div>
                          <select
                            value={rebootCooldownMinutes}
                            onChange={(e) => setRebootCooldownMinutes(Number(e.target.value))}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs border focus:outline-none ${
                              isLightMode
                                ? 'bg-white border-amber-300 text-slate-900'
                                : 'bg-slate-950 border-amber-500/30 text-slate-100'
                            }`}
                          >
                            <option value={15}>15 {isEn ? 'minutes' : 'دقیقه'}</option>
                            <option value={30}>30 {isEn ? 'minutes' : 'دقیقه'}</option>
                            <option value={60}>60 {isEn ? 'minutes (1 hour - Standard)' : 'دقیقه (۱ ساعت - استاندارد)'}</option>
                            <option value={120}>120 {isEn ? 'minutes (2 hours)' : 'دقیقه (۲ ساعت)'}</option>
                            <option value={240}>240 {isEn ? 'minutes (4 hours)' : 'دقیقه (۴ ساعت)'}</option>
                          </select>
                        </div>

                        {/* Daily Reboot Limit */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-semibold text-slate-300">
                              {isEn ? 'Max Reboots in 24 Hours' : 'سقف ریستارت در ۲۴ ساعت'}
                            </label>
                            <FieldInfoTooltip
                              fieldName={isEn ? 'Daily Reboot Cap' : 'سقف روزانه ریستارت'}
                              infoWhatEn="Maximum number of watchdog-triggered reboots allowed in a rolling 24-hour window."
                              infoWhatFa="حداکثر تعداد دفعات مجاز ریستارت خودکار در بازه متحرک ۲۴ ساعته."
                              infoWhyEn="If this ceiling is hit, the watchdog trips into 'anti_loop_halted' state and halts further reboots until admin resets it."
                              infoWhyFa="در صورت رسیدن به این سقف، سیستم وارد وضعیت توقف امن شده و تا زمان بررسی ادمین ریستارت دیگری انجام نمی‌دهد."
                              infoExampleEn="Standard: 2 reboots / day"
                              infoExampleFa="مقدار استاندارد: ۲ بار در روز"
                              isLightMode={isLightMode}
                              isEn={isEn}
                            />
                          </div>
                          <select
                            value={maxRebootsPerDay}
                            onChange={(e) => setMaxRebootsPerDay(Number(e.target.value))}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-xs border focus:outline-none ${
                              isLightMode
                                ? 'bg-white border-amber-300 text-slate-900'
                                : 'bg-slate-950 border-amber-500/30 text-slate-100'
                            }`}
                          >
                            <option value={1}>1 {isEn ? 'reboot / day' : 'بار در شبانه‌روز'}</option>
                            <option value={2}>2 {isEn ? 'reboots / day (Recommended)' : 'بار در شبانه‌روز (پیشنهادی)'}</option>
                            <option value={3}>3 {isEn ? 'reboots / day' : 'بار در شبانه‌روز'}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setActiveTab('rules');
                    }}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !serviceName.trim()}
                    className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-900/30"
                  >
                    {saving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {saving
                        ? isEn
                          ? 'Deploying to Host...'
                          : 'در حال استقرار روی سرور...'
                        : isEn
                        ? 'Deploy & Activate Policy'
                        : 'استقرار و فعال‌سازی سیاست'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 3: LIVE AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>/var/log/nettopology-watchdog.log</span>
                </span>
                <button
                  type="button"
                  disabled={loadingLogs}
                  onClick={loadLogs}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh Logs' : 'بروزرسانی لاگ‌ها'}</span>
                </button>
              </div>

              <div
                className={`p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[500px] border leading-relaxed ${
                  isLightMode
                    ? 'bg-slate-900 text-emerald-300 border-slate-700'
                    : 'bg-black text-emerald-400 border-slate-800'
                }`}
              >
                {loadingLogs ? (
                  <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>{isEn ? 'Fetching audit logs from destination host...' : 'در حال دریافت لاگ‌ها از سرور...'}</span>
                  </div>
                ) : logs ? (
                  <pre className="whitespace-pre-wrap">{logs}</pre>
                ) : (
                  <p className="text-slate-500 italic">{isEn ? 'No logs recorded yet.' : 'هنوز لاگی ثبت نشده است.'}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-t text-xs shrink-0 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900/80 border-slate-800 text-slate-400'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {isEn
                ? 'NetTopology Service Watchdog v1.118.0 • Real Destination Execution'
                : 'ناظر سرویس‌های نت‌توپولوژی نسخه ۱.۱۱۸.۰ • اجرای واقعی روی سرور مقصد'}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer text-xs font-medium"
          >
            {isEn ? 'Close' : 'بستن'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
