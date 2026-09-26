import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Gauge,
  Zap,
  Cpu,
  HardDrive,
  Server,
  RefreshCw,
  Check,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Sliders,
  Layers,
  FileCode,
  ArrowRight,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  RemoteServer,
  ApacheInstallationDetails,
  ApachePerformanceReport,
  ApacheScoreboardStats,
} from '../../types';
import {
  fetchApachePerformanceReport,
  enableApacheModStatus,
  applyApachePerformanceTuning,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface ApachePerformanceTabProps {
  server: RemoteServer;
  discovery: ApacheInstallationDetails | null;
  isEn: boolean;
  isLightMode: boolean;
  onRefreshDiscovery?: () => void;
}

export const ApachePerformanceTab: React.FC<ApachePerformanceTabProps> = ({
  server,
  discovery,
  isEn,
  isLightMode,
  onRefreshDiscovery,
}) => {
  const [report, setReport] = useState<ApachePerformanceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = off

  // Modals & Deployments
  const [isEnablingStatus, setIsEnablingStatus] = useState<boolean>(false);
  const [enableStatusResult, setEnableStatusResult] = useState<string | null>(null);
  const [isApplyingTuning, setIsApplyingTuning] = useState<boolean>(false);
  const [tuningType, setTuningType] = useState<'mpm' | 'compression' | 'cache'>('mpm');
  const [showConfigEditorModal, setShowConfigEditorModal] = useState<boolean>(false);
  const [customConfigContent, setCustomConfigContent] = useState<string>('');
  const [tuningDeployResult, setTuningDeployResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Fetch report callback
  const loadPerformanceReport = useCallback(
    async (showLoadingSpinner = true) => {
      if (showLoadingSpinner) setLoading(true);
      setError(null);
      try {
        const res = await fetchApachePerformanceReport(server.id);
        if (res.success && res.report) {
          setReport(res.report);
        } else {
          setError(res.error || (isEn ? 'Failed to retrieve performance telemetry' : 'خطا در دریافت اطلاعات تلمتری'));
        }
      } catch (err: any) {
        setError(err?.message || (isEn ? 'Connection failure while querying server' : 'خطای اتصال به سرور'));
      } finally {
        if (showLoadingSpinner) setLoading(false);
      }
    },
    [server.id, isEn]
  );

  // Initial load
  useEffect(() => {
    loadPerformanceReport(true);
  }, [loadPerformanceReport]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      loadPerformanceReport(false);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, loadPerformanceReport]);

  // Enable mod_status handler
  const handleEnableModStatus = async () => {
    setIsEnablingStatus(true);
    setEnableStatusResult(null);
    try {
      const res = await enableApacheModStatus(server.id);
      if (res.success) {
        setEnableStatusResult(
          isEn
            ? 'mod_status enabled and Apache reloaded successfully!'
            : 'ماژول mod_status فعال شد و آپاچی با موفقیت بارگذاری مجدد گردید!'
        );
        setTimeout(() => {
          loadPerformanceReport(true);
          if (onRefreshDiscovery) onRefreshDiscovery();
        }, 1500);
      } else {
        setEnableStatusResult(
          (isEn ? 'Failed to enable mod_status: ' : 'خطا در فعال‌سازی mod_status: ') +
            (res.error || res.syntaxOutput || 'Unknown error')
        );
      }
    } catch (err: any) {
      setEnableStatusResult(
        (isEn ? 'Error: ' : 'خطا: ') + (err?.message || 'Request failed')
      );
    } finally {
      setIsEnablingStatus(false);
    }
  };

  // Open deployment modal for selected tuning type
  const handleOpenTuningDeploy = (type: 'mpm' | 'compression' | 'cache') => {
    setTuningType(type);
    setTuningDeployResult(null);
    if (!report) return;

    if (type === 'mpm') {
      setCustomConfigContent(report.mpmTuning.recommendedSnippet);
    } else if (type === 'compression') {
      setCustomConfigContent(report.compression.recommendedSnippet);
    } else {
      setCustomConfigContent(report.cache.recommendedSnippet);
    }
    setShowConfigEditorModal(true);
  };

  // Deploy tuning configuration handler
  const handleDeployTuning = async () => {
    if (!customConfigContent.trim()) return;
    setIsApplyingTuning(true);
    setTuningDeployResult(null);

    let defaultPath: string | undefined;
    if (discovery?.osFamily === 'debian') {
      defaultPath =
        tuningType === 'mpm'
          ? '/etc/apache2/conf-available/mpm-tuning.conf'
          : tuningType === 'compression'
          ? '/etc/apache2/conf-available/compression.conf'
          : '/etc/apache2/conf-available/caching.conf';
    } else if (discovery?.osFamily === 'rhel' || discovery?.osFamily === 'alpine') {
      defaultPath =
        tuningType === 'mpm'
          ? '/etc/httpd/conf.d/mpm-tuning.conf'
          : tuningType === 'compression'
          ? '/etc/httpd/conf.d/compression.conf'
          : '/etc/httpd/conf.d/caching.conf';
    }

    try {
      const res = await applyApachePerformanceTuning(server.id, customConfigContent, defaultPath);
      if (res.success) {
        setTuningDeployResult({
          success: true,
          message: isEn
            ? `Tuning configuration deployed to ${res.filePath}. Apache syntax test passed and service reloaded!`
            : `کانفیگ در ${res.filePath} مستقر شد. تست سینتکس تایید شد و سرویس بدون قطعی بارگذاری شد!`,
        });
        setTimeout(() => {
          loadPerformanceReport(false);
        }, 1500);
      } else {
        setTuningDeployResult({
          success: false,
          message:
            (isEn ? 'Failed to apply tuning: ' : 'خطا در استقرار کانفیگ: ') +
            (res.error || res.syntaxOutput || 'Syntax validation failed; auto-rolled back safely.'),
        });
      }
    } catch (err: any) {
      setTuningDeployResult({
        success: false,
        message: (isEn ? 'Deploy error: ' : 'خطای استقرار: ') + (err?.message || 'Network error'),
      });
    } finally {
      setIsApplyingTuning(false);
    }
  };

  // Copy code helper
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Scoreboard characters map
  const scoreboardLegend = useMemo(
    () => [
      { key: '_', label: isEn ? 'Waiting for Connection' : 'در انتظار اتصال', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
      { key: 'S', label: isEn ? 'Starting Up' : 'در حال راه‌اندازی', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
      { key: 'R', label: isEn ? 'Reading Request' : 'خواندن درخواست', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
      { key: 'W', label: isEn ? 'Sending Reply (Active)' : 'پاسخگویی / فعال', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      { key: 'K', label: isEn ? 'Keepalive' : 'اتصال باز (Keepalive)', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
      { key: 'D', label: isEn ? 'DNS Lookup' : 'جستجوی DNS', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
      { key: 'C', label: isEn ? 'Closing Connection' : 'بستن اتصال', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
      { key: 'L', label: isEn ? 'Logging' : 'ثبت لاگ', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
      { key: 'G', label: isEn ? 'Gracefully Finishing' : 'پایان نرم', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
      { key: 'I', label: isEn ? 'Idle Cleanup' : 'پاکسازی دوره بیکاری', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
      { key: '.', label: isEn ? 'Open Slot (Unused)' : 'اسلات خالی', color: 'bg-slate-800/40 text-slate-500 border-slate-700/50' },
    ],
    [isEn]
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div
        className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 transition shadow-sm ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">
                {isEn ? 'Apache Performance & mod_status Telemetry' : 'تلمتری عملکرد آپاچی و اسکوربورد زنده'}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Phase 11
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Real-time mod_status metrics, live worker process scoreboard, MPM hardware tuning, and asset optimization'
                : 'آمار زنده mod_status، ماتریس اسکوربورد کارگرها، محاسبه‌گر ظرفیت MPM و بهینه‌سازی فشرده‌سازی و کش'}
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2.5">
          {/* Auto-refresh selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{isEn ? 'Auto-Refresh:' : 'بروزرسانی خودکار:'}</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className={`px-2 py-1 text-xs rounded-lg border cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <option value={0}>{isEn ? 'Disabled' : 'غیرفعال'}</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadPerformanceReport(true)}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{loading ? (isEn ? 'Polling...' : 'در حال خواندن...') : isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-bold">{isEn ? 'Telemetry Probe Notice' : 'خطای دریافت تلمتری'}</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* mod_status Not Available Banner & Setup Assistant */}
      {report && !report.isStatusAvailable && (
        <div
          className={`p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
            isLightMode
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-sm">
                {isEn ? 'mod_status Handler Not Active or Protected' : 'هندلر mod_status غیرفعال یا محدود است'}
              </h4>
              <p className="text-xs leading-relaxed max-w-2xl opacity-90">
                {isEn
                  ? 'Apache live telemetry requires the mod_status module and a protected /server-status handler. Enable it with strict loopback access (127.0.0.1) to monitor live workers, requests per second, and slot utilization safely.'
                  : 'برای استخراج آمار زنده آپاچی نیاز به ماژول mod_status و هندلر امن /server-status است. با یک کلیک می‌توانید این قابلیت را با محدودیت دسترسی به شبکه داخلی لوکال‌هاست فعال نمایید.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleEnableModStatus}
            disabled={isEnablingStatus}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50 shrink-0"
          >
            {isEnablingStatus ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {isEnablingStatus
                ? isEn
                  ? 'Configuring mod_status...'
                  : 'در حال فعال‌سازی...'
                : isEn
                ? 'Enable mod_status Safely'
                : 'فعال‌سازی ایمن mod_status'}
            </span>
          </button>
        </div>
      )}

      {enableStatusResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            enableStatusResult.includes('success') || enableStatusResult.includes('موفقیت')
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {enableStatusResult.includes('success') || enableStatusResult.includes('موفقیت') ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{enableStatusResult}</span>
        </div>
      )}

      {/* 2. LIVE TELEMETRY CARDS */}
      {report?.telemetry && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Requests per second */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'Throughput' : 'نرخ درخواست'}</span>
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {report.telemetry.reqPerSec}
              <span className="text-[10px] text-slate-400 font-sans ml-1">req/s</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {isEn ? 'Total:' : 'مجموع:'} {report.telemetry.totalAccesses.toLocaleString()} reqs
            </div>
          </div>

          {/* Transfer Rate */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'Bandwidth' : 'پهنای باند'}</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {report.telemetry.bytesPerSec > 1048576
                ? `${(report.telemetry.bytesPerSec / 1048576).toFixed(2)} MB/s`
                : `${(report.telemetry.bytesPerSec / 1024).toFixed(1)} KB/s`}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {isEn ? 'Transferred:' : 'حجم کل:'} {report.telemetry.totalMBytes} MB
            </div>
          </div>

          {/* Average Request Size */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'Bytes/Req' : 'متوسط حجم پاسخ'}</span>
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {(report.telemetry.bytesPerReq / 1024).toFixed(1)}
              <span className="text-[10px] text-slate-400 font-sans ml-1">KB</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {report.telemetry.bytesPerReq.toLocaleString()} bytes
            </div>
          </div>

          {/* Active Workers */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'Busy Workers' : 'کارگرهای فعال'}</span>
              <Server className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {report.telemetry.busyWorkers}
              <span className="text-xs text-slate-400 font-sans ml-1.5">
                / {report.telemetry.idleWorkers} {isEn ? 'idle' : 'بیکار'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {isEn ? 'Total slots:' : 'مجموع اسلات:'} {report.scoreboard?.totalSlots || 0}
            </div>
          </div>

          {/* CPU & Load */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'CPU Load' : 'بار پردازنده'}</span>
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-400">
              {report.telemetry.cpuLoad > 0 ? report.telemetry.cpuLoad.toFixed(2) : '0.00'}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {report.mpmTuning.hardware.cpuCores} {isEn ? 'Cores available' : 'هسته پردازشی'}
            </div>
          </div>

          {/* Uptime */}
          <div
            className={`p-3.5 rounded-xl border space-y-1.5 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>{isEn ? 'Service Uptime' : 'مدت زمان فعالیت'}</span>
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-400 truncate">
              {report.telemetry.uptimeHuman}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {report.telemetry.uptime.toLocaleString()} {isEn ? 'seconds' : 'ثانیه'}
            </div>
          </div>
        </div>
      )}

      {/* 3. LIVE SCOREBOARD VISUALIZER */}
      {report?.scoreboard && (
        <div
          className={`p-5 rounded-xl border space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm">
                  {isEn ? 'Live Apache Worker Scoreboard Matrix' : 'ماتریس زنده اسکوربورد پردازش‌های کارگر آپاچی'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? 'Visual map of worker processes across all allocated server slots'
                    : 'نمایش گرافیکی وضعیت لحظه‌ای کارگرها در اسلات‌های تخصیص‌یافته وب‌سرور'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">{isEn ? 'Capacity Utilization:' : 'بهره‌وری اسلات‌ها:'}</span>
                <span className="font-mono font-bold text-amber-400">
                  {report.scoreboard.utilizationPercent}%
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyCode(report.scoreboard?.raw || '')}
                className="px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-[11px] flex items-center gap-1 cursor-pointer transition"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedCode ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy Raw' : 'کپی رشته خام'}</span>
              </button>
            </div>
          </div>

          {/* Utilization Progress Bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, report.scoreboard.utilizationPercent))}%`,
              }}
            />
          </div>

          {/* Scoreboard Matrix Cells */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs overflow-x-auto">
            <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto p-1">
              {report.scoreboard.raw.split('').map((char, idx) => {
                const legendItem = scoreboardLegend.find((l) => l.key === char) || {
                  color: 'bg-slate-800 text-slate-500 border-slate-700',
                  label: 'Unknown',
                };
                return (
                  <div
                    key={idx}
                    title={`Slot #${idx + 1}: [${char}] ${legendItem.label}`}
                    className={`w-6 h-6 rounded flex items-center justify-center font-bold border transition transform hover:scale-125 cursor-default ${legendItem.color}`}
                  >
                    {char}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-[11px]">
            {scoreboardLegend.map((item) => {
              let count = 0;
              if (item.key === '_') count = report.scoreboard!.waitingForConnection;
              else if (item.key === 'S') count = report.scoreboard!.startingUp;
              else if (item.key === 'R') count = report.scoreboard!.readingRequest;
              else if (item.key === 'W') count = report.scoreboard!.sendingReply;
              else if (item.key === 'K') count = report.scoreboard!.keepalive;
              else if (item.key === 'D') count = report.scoreboard!.dnsLookup;
              else if (item.key === 'C') count = report.scoreboard!.closingConnection;
              else if (item.key === 'L') count = report.scoreboard!.logging;
              else if (item.key === 'G') count = report.scoreboard!.gracefullyFinishing;
              else if (item.key === 'I') count = report.scoreboard!.idleCleanup;
              else if (item.key === '.') count = report.scoreboard!.openSlot;

              return (
                <div
                  key={item.key}
                  className={`p-1.5 rounded-lg border flex items-center justify-between gap-1.5 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center border ${item.color}`}
                    >
                      {item.key}
                    </span>
                    <span className="truncate text-slate-400">{item.label}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-200 ml-1">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. HARDWARE & MPM CONCURRENCY TUNER */}
      {report?.mpmTuning && (
        <div
          className={`p-5 rounded-xl border space-y-4 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm">
                  {isEn ? 'Hardware-Aware MPM Concurrency Tuner' : 'محاسبه‌گر و تنظیم‌کننده همزمانی ماژول MPM بر اساس سخت‌افزار'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {isEn
                    ? `Calculated for active MPM: ${report.mpmTuning.activeMpm.toUpperCase()} (${report.mpmTuning.hardware.cpuCores} Cores, ${report.mpmTuning.hardware.totalRamMb} MB RAM)`
                    : `محاسبه‌شده برای ماژول فعال ${report.mpmTuning.activeMpm.toUpperCase()} (${report.mpmTuning.hardware.cpuCores} هسته و ${report.mpmTuning.hardware.totalRamMb} مگابایت رم)`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenTuningDeploy('mpm')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{isEn ? 'Configure & Deploy MPM' : 'اعمال و استقرار MPM'}</span>
            </button>
          </div>

          {/* Hardware Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="text-slate-400 text-[11px]">{isEn ? 'System RAM:' : 'کل حافظه رم:'}</div>
              <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                {report.mpmTuning.hardware.totalRamMb} MB
              </div>
              <div className="text-[10px] text-slate-400">
                {report.mpmTuning.hardware.availRamMb} MB {isEn ? 'available' : 'آزاد'}
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="text-slate-400 text-[11px]">{isEn ? 'CPU Cores:' : 'هسته‌های پردازنده:'}</div>
              <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                {report.mpmTuning.hardware.cpuCores} {isEn ? 'Cores' : 'هسته'}
              </div>
              <div className="text-[10px] text-slate-400">{isEn ? 'Hardware thread pool' : 'توان پردازشی هسته‌ها'}</div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="text-slate-400 text-[11px]">{isEn ? 'Worker Process RSS:' : 'مصرف رم هر پروسس:'}</div>
              <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                ~{report.mpmTuning.hardware.averageWorkerRssMb} MB
              </div>
              <div className="text-[10px] text-slate-400">{isEn ? 'Measured live via kernel' : 'اندازه‌گیری لحظه‌ای پروسس'}</div>
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="text-slate-400 text-[11px]">{isEn ? 'Current Worker Daemons:' : 'تعداد پروسس‌های فعال:'}</div>
              <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                {report.mpmTuning.hardware.currentActiveWorkers} {isEn ? 'processes' : 'پروسس'}
              </div>
              <div className="text-[10px] text-slate-400">{isEn ? 'Active daemon pool' : 'استخر پروسس‌های جاری'}</div>
            </div>
          </div>

          {/* Directives Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-xs text-left">
              <thead
                className={`text-[11px] uppercase tracking-wider font-semibold ${
                  isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-950 text-slate-400'
                }`}
              >
                <tr>
                  <th className="py-2.5 px-3">{isEn ? 'MPM Directive' : 'دستور MPM'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Current Baseline' : 'مقدار جاری'}</th>
                  <th className="py-2.5 px-3 text-emerald-400">{isEn ? 'Hardware Recommended' : 'مقدار پیشنهادی سخت‌افزاری'}</th>
                  <th className="py-2.5 px-3">{isEn ? 'Engineering Purpose' : 'هدف مهندسی'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">StartServers</td>
                  <td className="py-2 px-3 text-slate-400">{report.mpmTuning.currentDirectives.startServers}</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.startServers}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Child processes created on startup' : 'تعداد پروسس‌های فرزند در آغاز به کار وب‌سرور'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">MinSpareThreads</td>
                  <td className="py-2 px-3 text-slate-400">25</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.minSpareThreads || 25}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Minimum idle threads to handle incoming spikes' : 'حداقل رشته‌های آماده‌باش برای مهار جهش‌های ناگهانی'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">MaxSpareThreads</td>
                  <td className="py-2 px-3 text-slate-400">75</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.maxSpareThreads || 75}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Maximum idle threads before cleanup' : 'حداکثر رشته‌های آماده‌باش قبل از پاکسازی جهت صرفه‌جویی در رم'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">ThreadsPerChild</td>
                  <td className="py-2 px-3 text-slate-400">{report.mpmTuning.currentDirectives.threadsPerChild}</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.threadsPerChild}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Threads created by each child process' : 'تعداد رشته‌های اجرایی ایجاد شده توسط هر پروسس'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">MaxRequestWorkers</td>
                  <td className="py-2 px-3 text-slate-400">{report.mpmTuning.currentDirectives.maxRequestWorkers}</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.maxRequestWorkers}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Maximum simultaneous connections allowed' : 'سقف همزمانی اتصالات مجاز بدون خطر کمبود حافظه'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-amber-300">MaxConnectionsPerChild</td>
                  <td className="py-2 px-3 text-slate-400">
                    {report.mpmTuning.currentDirectives.maxConnectionsPerChild}
                  </td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">
                    {report.mpmTuning.recommendedDirectives.maxConnectionsPerChild}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-[11px]">
                    {isEn ? 'Recycle worker processes to prevent memory leaks' : 'بازیافت پروسس‌ها جهت جلوگیری قطعی از نشتی حافظه'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. COMPRESSION & CACHING OPTIMIZERS (2-Column Grid) */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Compression Optimizer (Gzip / Deflate & Brotli) */}
          <div
            className={`p-5 rounded-xl border space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm">
                    {isEn ? 'Compression Engine (Deflate & Brotli)' : 'موتور فشرده‌سازی (Deflate و Brotli)'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Compress payload over the wire' : 'کاهش ۶۰ تا ۸۰ درصدی حجم ترافیک خروجی'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenTuningDeploy('compression')}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{isEn ? 'Apply' : 'اعمال'}</span>
              </button>
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                  report.compression.deflateEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                mod_deflate: {report.compression.deflateEnabled ? (isEn ? 'Active' : 'فعال') : isEn ? 'Not loaded' : 'غیرفعال'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                  report.compression.brotliEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                mod_brotli: {report.compression.brotliEnabled ? (isEn ? 'Active' : 'فعال') : isEn ? 'Not loaded' : 'غیرفعال'}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed">
              {isEn
                ? 'Enables streaming HTTP response compression for static and dynamic assets including HTML, CSS, JavaScript, JSON APIs, XML, and SVG.'
                : 'فشرده‌سازی خودکار پاسخ‌های وب شامل کدهای HTML، استایل‌ها، جاوااسکریپت و API‌های JSON.'}
            </div>

            {/* Code snippet preview */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-36">
              <pre>{report.compression.recommendedSnippet}</pre>
            </div>
          </div>

          {/* Browser & Disk Caching Optimizer */}
          <div
            className={`p-5 rounded-xl border space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm">
                    {isEn ? 'Browser & Cache-Control Policies' : 'سیاست‌های کشینگ مرورگر (Expires & Headers)'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isEn ? 'Eliminate repeated static requests' : 'کاهش بار سرور با ماندگاری کش در مرورگر کاربران'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenTuningDeploy('cache')}
                className="px-3 py-1.5 rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{isEn ? 'Apply' : 'اعمال'}</span>
              </button>
            </div>

            {/* Status pills */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                  report.cache.expiresEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                mod_expires: {report.cache.expiresEnabled ? (isEn ? 'Active' : 'فعال') : isEn ? 'Not loaded' : 'غیرفعال'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] border ${
                  report.cache.headersEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                mod_headers: {report.cache.headersEnabled ? (isEn ? 'Active' : 'فعال') : isEn ? 'Not loaded' : 'غیرفعال'}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 leading-relaxed">
              {isEn
                ? 'Adds ExpiresDefault and Cache-Control headers so browsers cache immutable assets (fonts, images, bundles) for 1 year while refreshing dynamic HTML.'
                : 'تنظیم هدرهای انقضا و Cache-Control جهت کش ماندگار فونت‌ها، تصاویر و فایل‌های استاتیک به مدت ۱ سال.'}
            </div>

            {/* Code snippet preview */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-36">
              <pre>{report.cache.recommendedSnippet}</pre>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIG DEPLOYMENT MODAL / DRAWER */}
      {showConfigEditorModal && (
        <div className="fixed inset-0 z-[1000000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
              isLightMode ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {tuningType === 'mpm'
                      ? isEn
                        ? 'Deploy MPM Concurrency Tuning'
                        : 'استقرار تنظیمات همزمانی MPM'
                      : tuningType === 'compression'
                      ? isEn
                        ? 'Deploy Compression Configuration'
                        : 'استقرار تنظیمات فشرده‌سازی'
                      : isEn
                      ? 'Deploy Browser Caching Configuration'
                      : 'استقرار تنظیمات کش مرورگر'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isEn
                      ? 'Syntax tested via apachectl -t with automated rollback protection'
                      : 'تست سینتکس با apachectl -t و محافظت کامل رول‌بک در صورت بروز خطا'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfigEditorModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {tuningDeployResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    tuningDeployResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {tuningDeployResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{tuningDeployResult.message}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 block">
                  {isEn ? 'Configuration Directives (Editable):' : 'دستورات کانفیگ (قابل ویرایش):'}
                </label>
                <textarea
                  rows={12}
                  value={customConfigContent}
                  onChange={(e) => setCustomConfigContent(e.target.value)}
                  className={`w-full p-3 font-mono text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLightMode
                      ? 'bg-slate-50 border-slate-300 text-slate-900'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleCopyCode(customConfigContent)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedCode ? (isEn ? 'Copied' : 'کپی شد') : isEn ? 'Copy Config' : 'کپی کانفیگ'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigEditorModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'انصراف'}
                </button>
                <button
                  type="button"
                  onClick={handleDeployTuning}
                  disabled={isApplyingTuning}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isApplyingTuning ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>
                    {isApplyingTuning
                      ? isEn
                        ? 'Validating & Applying...'
                        : 'در حال اعتبارسنجی و استقرار...'
                      : isEn
                      ? 'Validate & Apply Config'
                      : 'اعتبارسنجی و اعمال کانفیگ'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
