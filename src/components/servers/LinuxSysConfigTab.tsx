import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Globe,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Terminal,
  Shield,
  Clock,
  Layers,
  Send,
  Zap,
  Check,
  X,
  Play,
  Activity,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxSystemDetailedInfo,
  LinuxProxyConfig,
} from '../../types';
import {
  fetchLinuxServerSysConfig,
  configureLinuxServerProxy,
  testLinuxServerProxy,
  changeLinuxServerSshPort,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxSysConfigTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
  onSshPortChanged?: (newPort: number) => void;
}

export const LinuxSysConfigTab: React.FC<LinuxSysConfigTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
  onSshPortChanged,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sysInfo, setSysInfo] = useState<LinuxSystemDetailedInfo | null>(null);

  // SSH Port Change State
  const [newSshPort, setNewSshPort] = useState<number | string>(server.ssh_port || 22);
  const [changingPort, setChangingPort] = useState(false);
  const [showPortConfirm, setShowPortConfirm] = useState(false);
  const [portFeedback, setPortFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Proxy Configuration State
  const [proxyConfig, setProxyConfig] = useState<LinuxProxyConfig>({
    enabled: false,
    httpProxy: '',
    httpsProxy: '',
    ftpProxy: '',
    noProxy: 'localhost,127.0.0.1,::1',
  });
  const [savingProxy, setSavingProxy] = useState(false);
  const [proxyFeedback, setProxyFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Proxy Testing State
  const [testingProxy, setTestingProxy] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    statusCode?: number;
    latencyMs?: number;
    message: string;
  } | null>(null);

  const loadSysConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLinuxServerSysConfig(server.id, ephemeralPassword);
      if (res.success && res.sysInfo) {
        setSysInfo(res.sysInfo);
        if (res.sysInfo.proxy) {
          setProxyConfig(res.sysInfo.proxy);
        }
      } else {
        setError(res.error || (isEn ? 'Failed to fetch Linux system configuration' : 'خطا در واکشی تنظیمات و مشخصات سیستم لینوکس'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network error fetching system configuration' : 'خطای ارتباط در دریافت اطلاعات سرور'));
    } finally {
      setLoading(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  useEffect(() => {
    loadSysConfig();
  }, [loadSysConfig]);

  // Handle SSH Port Change
  const handleChangePort = async () => {
    const portNum = Number(newSshPort);
    if (!portNum || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setPortFeedback({
        message: isEn ? 'Invalid port number (must be between 1 and 65535)' : 'شماره پورت نامعتبر است (باید بین ۱ تا ۶۵۵۳۵ باشد)',
        type: 'error',
      });
      return;
    }

    setChangingPort(true);
    setPortFeedback(null);
    try {
      const res = await changeLinuxServerSshPort(server.id, portNum, ephemeralPassword);
      if (res.success) {
        setPortFeedback({
          message: res.message || (isEn ? `SSH port successfully changed to ${portNum}` : `پورت SSH با موفقیت به ${portNum} تغییر یافت`),
          type: 'success',
        });
        setShowPortConfirm(false);
        if (onSshPortChanged) {
          onSshPortChanged(portNum);
        }
      } else {
        setPortFeedback({
          message: res.message || res.error || (isEn ? 'Failed to change SSH port' : 'خطا در تغییر پورت SSH'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setPortFeedback({
        message: err?.message || (isEn ? 'Network error changing SSH port' : 'خطای ارتباط با سرور در تغییر پورت'),
        type: 'error',
      });
    } finally {
      setChangingPort(false);
    }
  };

  // Handle Proxy Save & Persist
  const handleSaveProxy = async (enable: boolean) => {
    setSavingProxy(true);
    setProxyFeedback(null);
    try {
      const payload: LinuxProxyConfig = {
        ...proxyConfig,
        enabled: enable,
      };

      const res = await configureLinuxServerProxy(server.id, payload, ephemeralPassword);
      if (res.success) {
        setProxyConfig(payload);
        setProxyFeedback({
          message: res.message || (isEn ? 'Persistent proxy configuration saved successfully' : 'تنظیمات پروکسی دائمی با موفقیت ذخیره شد'),
          type: 'success',
        });
        loadSysConfig();
      } else {
        setProxyFeedback({
          message: res.message || res.error || (isEn ? 'Failed to apply persistent proxy' : 'خطا در اعمال تنظیمات پروکسی دائمی'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setProxyFeedback({
        message: err?.message || (isEn ? 'Network error configuring proxy' : 'خطای شبکه در ذخیره تنظیمات پروکسی'),
        type: 'error',
      });
    } finally {
      setSavingProxy(false);
    }
  };

  // Handle Proxy Test
  const handleTestProxy = async () => {
    const activeUrl = proxyConfig.httpProxy || proxyConfig.httpsProxy;
    if (!activeUrl) {
      setProxyFeedback({
        message: isEn ? 'Please specify an HTTP or SOCKS proxy URL to test' : 'لطفاً آدرس پروکسی را برای تست وارد کنید',
        type: 'error',
      });
      return;
    }

    setTestingProxy(true);
    setTestResult(null);
    try {
      const res = await testLinuxServerProxy(server.id, activeUrl, 'https://www.google.com', ephemeralPassword);
      setTestResult({
        success: res.success,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        message: res.message || (res.success ? (isEn ? 'Proxy connection test succeeded' : 'ارتباط با پروکسی با موفقیت برقرار شد') : (isEn ? 'Proxy test failed' : 'تست اتصال با پروکسی با شکست مواجه شد')),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || (isEn ? 'Failed to run proxy test' : 'خطا در اجرای تست پروکسی'),
      });
    } finally {
      setTestingProxy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>{isEn ? 'OS, Distribution, Kernel & System Config' : 'مشخصات توزیع، کرنل لینوکس و تنظیمات سرور'}</span>
            </h3>
            <FieldInfoTooltip
              title={isEn ? 'Linux System Architecture & Config' : 'پیکربندی سیستم لینوکس'}
              infoWhatEn="Authentic Linux operating system release, kernel build, persistent system-wide proxy, and SSH daemon configuration."
              infoWhatFa="مشخصات واقعی توزیع و نگارش لینوکس، نسخه کرنل، تنظیمات پروکسی سراسری پایدار با ریستارت و پورت سرویس SSH."
              infoWhyEn="Essential for kernel compatibility checking, package manager proxying (APT/YUM), and server hardening by changing default SSH ports."
              infoWhyFa="ضروری برای کنترل سازگاری کرنل، تنظیم پروکسی جهت دانلود بسته‌ها و امن‌سازی سرور با تغییر پورت پیش‌فرض SSH."
              infoExampleEn="Verify kernel version (e.g., 6.8.0-49-generic), configure corporate proxy, or relocate SSH to port 2222."
              infoExampleFa="بررسی نسخه کرنل لینوکس، تنظیم پروکسی در /etc/environment و تغییر پورت SSH به ۲۲۲۲ با بررسی خطای syntax."
              isEn={isEn}
              isLightMode={isLightMode}
            />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {isEn
              ? 'Real-time distribution release, kernel version, persistent proxy surviving reboots, and SSH port management.'
              : 'مشاهده مشخصات توزیع، نسخه کرنل، تعریف پروکسی دائمی سیستمی (بدون پاک شدن با ریستارت) و تغییر پورت SSH.'}
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={loadSysConfig}
          title={isEn ? 'Refresh System Info' : 'بروزرسانی مشخصات سیستم'}
          className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
            isLightMode
              ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Card 1: Operating System, Distribution & Kernel */}
      <div
        className={`p-5 rounded-2xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold">
                {isEn ? 'Operating System & Kernel Details' : 'مشخصات توزیع لینوکس و نسخه کرنل'}
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                {sysInfo?.distro || (isEn ? 'Detecting via /etc/os-release...' : 'در حال شناسایی از /etc/os-release...')}
              </span>
            </div>
          </div>

          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            {sysInfo?.arch || 'x86_64'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Distribution */}
          <div
            className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-white/5'
            }`}
          >
            <span className="text-[10px] text-slate-400 block font-medium">
              {isEn ? 'Linux Distribution' : 'توزیع لینوکس'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-cyan-400 block mt-1 font-mono">
              {sysInfo?.distro || '-'}
            </span>
          </div>

          {/* OS Version */}
          <div
            className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-white/5'
            }`}
          >
            <span className="text-[10px] text-slate-400 block font-medium">
              {isEn ? 'OS Release / Version' : 'نگارش سیستم‌عامل'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-200 block mt-1 font-mono">
              {sysInfo?.distroVersion || '-'}
            </span>
          </div>

          {/* Kernel Release */}
          <div
            className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-white/5'
            }`}
          >
            <span className="text-[10px] text-slate-400 block font-medium">
              {isEn ? 'Linux Kernel (uname -r)' : 'نسخه کرنل (uname -r)'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-emerald-400 block mt-1 font-mono truncate" title={sysInfo?.kernelRelease}>
              {sysInfo?.kernelRelease || '-'}
            </span>
          </div>

          {/* Hostname & Uptime */}
          <div
            className={`p-3 rounded-xl border ${
              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-white/5'
            }`}
          >
            <span className="text-[10px] text-slate-400 block font-medium">
              {isEn ? 'Hostname / Uptime' : 'نام هاست و آپ‌تایم'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-200 block mt-1 font-mono truncate" title={sysInfo?.hostname}>
              {sysInfo?.hostname || '-'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              {sysInfo?.uptime || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: SSH Port Management */}
      <div
        className={`p-5 rounded-2xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold">
                  {isEn ? 'SSH Port Configuration' : 'مدیریت و تغییر پورت SSH'}
                </h4>
                <FieldInfoTooltip
                  title={isEn ? 'SSH Port Security' : 'امنیت پورت SSH'}
                  infoWhatEn="The listening TCP port for sshd service. Default is 22."
                  infoWhatFa="پورت گوش‌دهنده TCP برای سرویس sshd که به‌صورت پیش‌فرض ۲۲ است."
                  infoWhyEn="Changing the default SSH port dramatically reduces automated internet bot brute-force attacks and log clutter."
                  infoWhyFa="تغییر پورت پیش‌فرض حملات ربات‌های اینترنتی را به شدت کاهش داده و لاگ‌های سرور را تمیز نگه می‌دارد."
                  infoExampleEn="Safe non-standard ports: 2222, 22222, 5022. The system runs sshd -t syntax test prior to applying changes."
                  infoExampleFa="پورت‌های نمونه امن: ۲۲۲۲ یا ۵۰۲۲. برنامه قبل از ریستارت، فایل کانفیگ را با sshd -t تست می‌کند تا از قفل شدن دسترسی جلوگیری شود."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {isEn ? 'Current Port in Use:' : 'پورت فعال فعلی:'} <strong className="text-cyan-400">{sysInfo?.currentSshPort || server.ssh_port || 22}</strong>
              </span>
            </div>
          </div>

          <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            <span>{isEn ? 'Syntax Pre-Check Enabled' : 'تست اعتبار سنجی فعال'}</span>
          </span>
        </div>

        {portFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              portFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {portFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-mono">{portFeedback.message}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-end gap-3 pt-1">
          <div className="w-full sm:w-64">
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'New SSH Port (1 - 65535)' : 'پورت جدید SSH (بین ۱ تا ۶۵۵۳۵)'}
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={newSshPort}
              onChange={(e) => setNewSshPort(e.target.value)}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          <button
            type="button"
            disabled={changingPort || Number(newSshPort) === (sysInfo?.currentSshPort || server.ssh_port || 22)}
            onClick={() => setShowPortConfirm(true)}
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{isEn ? 'Change SSH Port' : 'اعمال و تغییر پورت SSH'}</span>
          </button>
        </div>

        {/* Confirmation Modal */}
        {showPortConfirm && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-amber-300">
                  {isEn ? 'Confirm SSH Port Modification' : 'تایید تغییر پورت SSH سرور'}
                </h5>
                <p className="text-[11px] text-amber-200/80 mt-1">
                  {isEn
                    ? `Are you sure you want to change SSH port from ${sysInfo?.currentSshPort || server.ssh_port || 22} to ${newSshPort}? Our backend will test the configuration before restarting sshd, and configure ufw/iptables if present.`
                    : `آیا از تغییر پورت SSH از ${sysInfo?.currentSshPort || server.ssh_port || 22} به ${newSshPort} اطمینان دارید؟ سیستم قبل از ریستارت صحت کانفیگ را اعتبارسنجی کرده و در فایروال سرور نیز پورت جدید را باز می‌نماید.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPortConfirm(false)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border ${
                  isLightMode ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                disabled={changingPort}
                onClick={handleChangePort}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Zap className={`w-3 h-3 ${changingPort ? 'animate-spin' : ''}`} />
                <span>{changingPort ? (isEn ? 'Applying...' : 'در حال تغییر...') : (isEn ? 'Yes, Apply New Port' : 'بله، پورت تغییر یابد')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card 3: Persistent Proxy Configuration */}
      <div
        className={`p-5 rounded-2xl border space-y-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs sm:text-sm font-bold">
                  {isEn ? 'Persistent System-Wide Proxy (Survives Reboot)' : 'ثبت پروکسی دائمی سیستمی (پایدار پس از ریستارت)'}
                </h4>
                <FieldInfoTooltip
                  title={isEn ? 'Persistent Linux Proxy' : 'پروکسی دائمی لینوکس'}
                  infoWhatEn="Persists HTTP/HTTPS/SOCKS5 proxy settings to /etc/environment, /etc/profile.d/proxy.sh, and /etc/apt/apt.conf.d/95proxies."
                  infoWhatFa="تنظیمات پروکسی را در فایل‌های /etc/environment، /etc/profile.d/proxy.sh و کانفیگ APT می‌نویسد تا با ریستارت پاک نشود."
                  infoWhyEn="Required for servers behind restricted networks, sanctions, or corporate firewalls to fetch updates and packages seamlessly."
                  infoWhyFa="ضروری برای سرورهای درگیر تحریم یا فایروال سازمانی جهت دریافت بدون وقفه پکیج‌ها و اتصال به اینترنت بدون نیاز به تنظیم مجدد."
                  infoExampleEn="http://192.168.1.50:8080 or socks5://127.0.0.1:1080 with bypass for 127.0.0.1,localhost,10.0.0.0/8."
                  infoExampleFa="پروکسی http://192.168.1.50:8080 یا socks5://127.0.0.1:1080 به همراه مستثنی کردن آی‌پی‌های داخلی."
                  isEn={isEn}
                  isLightMode={isLightMode}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {proxyConfig.enabled
                  ? (isEn ? 'Persistent Proxy Status: ACTIVE' : 'وضعیت پروکسی دائمی: فعال')
                  : (isEn ? 'Persistent Proxy Status: INACTIVE (Direct Connection)' : 'وضعیت پروکسی دائمی: غیرفعال (اتصال مستقیم)')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono px-2.5 py-1 rounded-lg border ${
                proxyConfig.enabled
                  ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                  : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
              }`}
            >
              {proxyConfig.enabled ? (isEn ? 'Enabled in /etc' : 'فعال در سیستم') : (isEn ? 'Direct' : 'مستقیم')}
            </span>
          </div>
        </div>

        {proxyFeedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              proxyFeedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {proxyFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-mono">{proxyFeedback.message}</span>
          </div>
        )}

        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              testResult.success
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 font-mono">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
            {testResult.latencyMs !== undefined && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/30">
                Latency: {testResult.latencyMs}ms (HTTP {testResult.statusCode || 200})
              </span>
            )}
          </div>
        )}

        {/* Proxy Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'HTTP Proxy URL' : 'آدرس پروکسی HTTP'}
            </label>
            <input
              type="text"
              placeholder="http://proxy.corp.internal:8080"
              value={proxyConfig.httpProxy || ''}
              onChange={(e) => setProxyConfig({ ...proxyConfig, httpProxy: e.target.value })}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'HTTPS Proxy URL' : 'آدرس پروکسی HTTPS'}
            </label>
            <input
              type="text"
              placeholder="http://proxy.corp.internal:8080"
              value={proxyConfig.httpsProxy || ''}
              onChange={(e) => setProxyConfig({ ...proxyConfig, httpsProxy: e.target.value })}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'FTP Proxy (Optional)' : 'پروکسی FTP (اختیاری)'}
            </label>
            <input
              type="text"
              placeholder="http://proxy.corp.internal:8080"
              value={proxyConfig.ftpProxy || ''}
              onChange={(e) => setProxyConfig({ ...proxyConfig, ftpProxy: e.target.value })}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1">
              {isEn ? 'No Proxy (Exceptions)' : 'مستثنی‌ها (بدون پروکسی)'}
            </label>
            <input
              type="text"
              placeholder="localhost,127.0.0.1,::1,10.0.0.0/8"
              value={proxyConfig.noProxy || ''}
              onChange={(e) => setProxyConfig({ ...proxyConfig, noProxy: e.target.value })}
              className={`w-full px-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-white'
              }`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testingProxy}
              onClick={handleTestProxy}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Activity className={`w-3.5 h-3.5 ${testingProxy ? 'animate-spin' : ''}`} />
              <span>{testingProxy ? (isEn ? 'Testing via curl...' : 'در حال تست...') : (isEn ? 'Test Connectivity' : 'تست اتصال با پروکسی')}</span>
            </button>

            {proxyConfig.enabled && (
              <button
                type="button"
                disabled={savingProxy}
                onClick={() => handleSaveProxy(false)}
                className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition cursor-pointer"
              >
                {isEn ? 'Clear & Disable Proxy' : 'حذف و غیرفعال‌سازی پروکسی'}
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={savingProxy}
            onClick={() => handleSaveProxy(true)}
            className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Check className={`w-3.5 h-3.5 ${savingProxy ? 'animate-spin' : ''}`} />
            <span>
              {savingProxy
                ? (isEn ? 'Saving to /etc...' : 'در حال ثبت در سیستم...')
                : (isEn ? 'Save Persistent Proxy (Survives Reboot)' : 'ثبت پروکسی دائمی (ماندگار با ریستارت)')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
