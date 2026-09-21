import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Activity,
  Cpu,
  Zap,
  HardDrive,
  Network,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Key,
  Shield,
  Search,
  Server,
  Terminal,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Layers,
  Info,
} from 'lucide-react';
import { RemoteServer, LinuxServerLiveMetrics, LinuxServerProcessMetric } from '../../types';
import { fetchLinuxServerLiveMetrics } from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface LinuxServerMonitorModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  onClose: () => void;
  onMinimize: () => void;
  onOpenTerminal?: (server: RemoteServer) => void;
  isLightMode?: boolean;
  isEn?: boolean;
}

interface HistoricalDataPoint {
  timeStr: string;
  cpu: number;
  memory: number;
}

export const LinuxServerMonitorModal: React.FC<LinuxServerMonitorModalProps> = ({
  isOpen,
  server,
  onClose,
  onMinimize,
  onOpenTerminal,
  isLightMode = false,
  isEn = true,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [metrics, setMetrics] = useState<LinuxServerLiveMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [ephemeralPassword, setEphemeralPassword] = useState('');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(3000); // 3 seconds default
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'disks' | 'network' | 'processes'>('overview');
  const [processSearch, setProcessSearch] = useState('');
  const [sortProcessBy, setSortProcessBy] = useState<'cpu' | 'mem'>('cpu');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch telemetry from physical or virtual device
  const fetchMetrics = useCallback(async (customPassword?: string) => {
    if (!server) return;
    setLoading(true);
    setError(null);

    const pwdToUse = customPassword !== undefined ? customPassword : ephemeralPassword;

    try {
      const res = await fetchLinuxServerLiveMetrics(server.id, pwdToUse);
      if (res.success && res.metrics) {
        setMetrics(res.metrics);
        setRequiresPassword(false);

        // Append to history
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        setHistory((prev) => {
          const next = [
            ...prev,
            {
              timeStr,
              cpu: res.metrics.cpu.usagePercent,
              memory: res.metrics.memory.usagePercent,
            },
          ];
          return next.slice(-25); // Keep last 25 data points
        });
      } else {
        if (res.requires_password) {
          setRequiresPassword(true);
        }
        setError(res.error || (isEn ? 'Failed to fetch telemetry metrics' : 'واکشی متریک‌های سیستم ناموفق بود'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Network connection error while contacting server' : 'خطای اتصال به سرور'));
    } finally {
      setLoading(false);
    }
  }, [server, ephemeralPassword, isEn]);

  // Initial load and periodic polling
  useEffect(() => {
    if (isOpen && server) {
      fetchMetrics();
    } else {
      setMetrics(null);
      setError(null);
      setHistory([]);
    }
  }, [isOpen, server?.id]);

  useEffect(() => {
    if (!isOpen || autoRefreshInterval <= 0 || requiresPassword || error) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      fetchMetrics();
    }, autoRefreshInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, autoRefreshInterval, fetchMetrics, requiresPassword, !!error]);

  // Filtered and sorted processes
  const filteredProcesses = useMemo(() => {
    if (!metrics?.processes) return [];
    let list = [...metrics.processes];
    if (processSearch.trim()) {
      const q = processSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.command.toLowerCase().includes(q) ||
          p.user.toLowerCase().includes(q) ||
          p.pid.toString().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortProcessBy === 'cpu') return b.cpuPercent - a.cpuPercent;
      return b.memPercent - a.memPercent;
    });
    return list;
  }, [metrics?.processes, processSearch, sortProcessBy]);

  if (!isOpen || !server) return null;

  // SVG Sparkline path generator
  const renderSparkline = (dataKey: 'cpu' | 'memory', strokeColor: string, fillColor: string) => {
    if (history.length < 2) {
      return (
        <div className="h-28 flex items-center justify-center text-xs text-slate-400 font-mono">
          {isEn ? 'Collecting live telemetry data...' : 'در حال دریافت داده‌های لایو...'}
        </div>
      );
    }

    const width = 500;
    const height = 90;
    const padding = 10;
    const maxVal = 100;
    const minVal = 0;

    const points = history.map((pt, idx) => {
      const x = padding + (idx / (history.length - 1)) * (width - 2 * padding);
      const val = pt[dataKey];
      const y = height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);
      return { x, y, val };
    });

    const pathData = points.reduce((acc, p, idx) => {
      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    const areaData = `${pathData} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={fillColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={fillColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="3 3" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.15" />

          {/* Area fill */}
          <path d={areaData} fill={`url(#grad-${dataKey})`} />

          {/* Stroke Line */}
          <path d={pathData} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Current point pulsating dot */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="4"
              fill={strokeColor}
              className="animate-ping"
            />
          )}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="3.5"
              fill={strokeColor}
            />
          )}
        </svg>

        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1 px-1">
          <span>{history[0]?.timeStr || '00:00'}</span>
          <span>{isEn ? 'Timeline (Last 25 snapshots)' : 'روند زمانی (۲۵ نمونه اخیر)'}</span>
          <span className="font-bold text-slate-200">{history[history.length - 1]?.timeStr || 'Now'}</span>
        </div>
      </div>
    );
  };

  const modalNode = (
    <div
      className={
        isMaximized
          ? 'fixed top-0 left-0 right-0 bottom-8 z-50 p-0 flex flex-col'
          : 'fixed inset-0 z-50 p-2 sm:p-4 bg-black/80 backdrop-blur-sm flex items-center justify-center'
      }
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div
        className={`flex flex-col overflow-hidden transition-all duration-200 shadow-2xl ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-full rounded-none border-none'
            : 'w-full max-w-6xl max-h-[92vh] rounded-2xl border'
        } ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-800'
            : 'bg-slate-950 border-slate-800 text-slate-100'
        }`}
      >
        {/* ======================================================== */}
        {/* MODAL HEADER (Universal 3-button control & Strict Bounds) */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3.5 border-b shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                  {server.name}
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {server.ip}:{server.ssh_port || 22}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase">
                  {metrics?.os?.distro || server.os_distro || 'Linux'}
                </span>
                {loading && (
                  <span className="flex items-center gap-1 text-[11px] text-cyan-400 font-mono animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>{isEn ? 'Syncing...' : 'همگام‌سازی...'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                {metrics?.hostname ? `host: ${metrics.hostname}` : server.hostname || server.ip}
                {metrics?.uptimeFormatted && ` • up ${metrics.uptimeFormatted}`}
                {metrics?.cpu?.cores && ` • ${metrics.cpu.cores} vCPU`}
                {metrics?.memory?.totalHuman && ` • ${metrics.memory.totalHuman} RAM`}
              </p>
            </div>
          </div>

          {/* 3-Control Header Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Direct Terminal Shortcut */}
            {onOpenTerminal && (
              <button
                type="button"
                onClick={() => onOpenTerminal(server)}
                title={isEn ? 'Open Native SSH Terminal' : 'باز کردن ترمینال لینوکس'}
                className={`p-2 rounded-lg border transition cursor-pointer text-xs font-semibold flex items-center gap-1 ${
                  isLightMode
                    ? 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">{isEn ? 'Terminal' : 'ترمینال'}</span>
              </button>
            )}

            {/* Minimize to ToolsDock */}
            <button
              type="button"
              onClick={onMinimize}
              title={isEn ? 'Minimize to Dock' : 'کوچک‌سازی به نوار ابزار'}
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={
                isMaximized
                  ? isEn
                    ? 'Exit Fullscreen'
                    : 'خروج از تمام‌صفحه'
                  : isEn
                  ? 'Fullscreen'
                  : 'تمام‌صفحه'
              }
              className={`p-2 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              title={isEn ? 'Close Monitor' : 'بستن مانیتور'}
              className="p-2 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/15 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* SUBHEADER CONTROLS & NAVIGATION TABS */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2.5 border-b gap-3 flex-wrap text-xs ${
            isLightMode ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isEn ? 'Overview & Live Gauges' : 'نمای کلی و نمودارها'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('disks')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'disks'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isEn ? 'Storage & Disks' : 'ذخیره‌سازی و دیسک‌ها'}</span>
              {metrics?.disks && metrics.disks.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/40 font-mono">
                  {metrics.disks.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('network')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'network'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>{isEn ? 'Network Interfaces' : 'کارت‌های شبکه'}</span>
              {metrics?.networks && metrics.networks.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/40 font-mono">
                  {metrics.networks.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('processes')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'processes'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>{isEn ? 'Top Processes' : 'پردازش‌های فعال'}</span>
              {metrics?.processes && metrics.processes.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/40 font-mono">
                  {metrics.processes.length}
                </span>
              )}
            </button>
          </div>

          {/* Polling Interval and Refresh Action */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{isEn ? 'Auto-Refresh:' : 'بازخوانی خودکار:'}</span>
            </span>

            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className={`px-2 py-1 rounded-md text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <option value={2000}>2s (Fast)</option>
              <option value={3000}>3s (Live)</option>
              <option value={5000}>5s (Normal)</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
              <option value={0}>{isEn ? 'Paused (Manual)' : 'توقف (دستی)'}</option>
            </select>

            <button
              type="button"
              disabled={loading}
              onClick={() => fetchMetrics()}
              title={isEn ? 'Refresh Now' : 'بروزرسانی دستی'}
              className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MODAL MAIN CONTENT */}
        {/* ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Password Prompt (if zero-storage policy enabled) */}
          {requiresPassword && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isLightMode
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold">
                    {isEn
                      ? 'Zero-Storage Ephemeral Authentication Required'
                      : 'احراز هویت موقت سرور الزامی است'}
                  </h4>
                  <p className="text-xs text-amber-300/80 mt-0.5">
                    {isEn
                      ? 'This server has zero-storage credential policy. Please enter SSH password for live telemetry session.'
                      : 'برای این سرور سیاست عدم ذخیره‌سازی پسورد فعال است؛ لطفاً گذرواژه موقت SSH را وارد کنید.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="password"
                  placeholder={isEn ? 'SSH Password' : 'گذرواژه SSH'}
                  value={ephemeralPassword}
                  onChange={(e) => setEphemeralPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchMetrics(ephemeralPassword);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 w-full sm:w-48 ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => fetchMetrics(ephemeralPassword)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shrink-0 cursor-pointer"
                >
                  {isEn ? 'Authenticate' : 'اتصال'}
                </button>
              </div>
            </div>
          )}

          {/* Genuine Error Display (Zero Fake Data Guarantee) */}
          {error && !requiresPassword && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
                isLightMode
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold">
                    {isEn ? 'Device Telemetry Unreachable' : 'ارتباط با مانیتورینگ دستگاه برقرار نشد'}
                  </h4>
                  <p className="text-xs text-rose-300/80 mt-0.5 font-mono">{error}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fetchMetrics()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shrink-0 cursor-pointer"
              >
                {isEn ? 'Retry Connection' : 'تلاش مجدد'}
              </button>
            </div>
          )}

          {/* Loading Initial State */}
          {loading && !metrics && !error && (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-bold text-slate-200">
                {isEn ? 'Establishing secure SSH connection...' : 'در حال برقراری اتصال امن SSH و دریافت وضعیت منابع...'}
              </p>
              <p className="text-xs text-slate-400 font-mono">
                {server.ip}:{server.ssh_port || 22}
              </p>
            </div>
          )}

          {/* Metrics Content Render */}
          {metrics && (
            <>
              {/* TAB 1: OVERVIEW & GAUGES */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* High-Level Metric Gauges (CPU, Memory, Load, Uptime) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* CPU Card */}
                    <div
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{isEn ? 'CPU Utilization' : 'مصرف پردازنده'}</span>
                              <FieldInfoTooltip
                                infoWhatEn="Instantaneous CPU usage calculated directly from /proc/stat delta."
                                infoWhatFa="درصد بهره‌وری لحظه‌ای پردازنده که مستقیماً از تفاضل خوانش‌های /proc/stat استخراج می‌شود."
                                infoWhyEn="Ensures accurate real-time visibility into thread and process load on target cores."
                                infoWhyFa="امکان نظارت دقیق بر بار پردازشی سرور و تشخیص گلوگاه‌های پردازشی را فراهم می‌کند."
                                infoExampleEn="24.5% across 4 vCPU cores"
                                infoExampleFa="۲۴.۵٪ روی ۴ هسته مجازی"
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {metrics.cpu.cores} Cores • {metrics.cpu.model.slice(0, 18)}
                            </span>
                          </div>
                        </div>
                        <span className="text-xl font-mono font-black text-cyan-400">
                          {metrics.cpu.usagePercent}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden border border-white/5">
                          <div
                            className={`h-full transition-all duration-300 ${
                              metrics.cpu.usagePercent > 85
                                ? 'bg-rose-500'
                                : metrics.cpu.usagePercent > 65
                                ? 'bg-amber-400'
                                : 'bg-cyan-400'
                            }`}
                            style={{ width: `${Math.min(100, metrics.cpu.usagePercent)}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                          <span>0%</span>
                          <span>Load: {metrics.cpu.loadAvg.join(', ')}</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    {/* Memory Card */}
                    <div
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                            <Zap className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{isEn ? 'Physical Memory (RAM)' : 'حافظه فیزیکی (RAM)'}</span>
                              <FieldInfoTooltip
                                infoWhatEn="Physical RAM consumption parsed from /proc/meminfo (MemTotal - MemAvailable)."
                                infoWhatFa="میزان حافظه مصرفی واقعی از فایل /proc/meminfo با کسر حافظه در دسترس از کل."
                                infoWhyEn="Critical for preventing out-of-memory kernel kills (OOM) on Linux nodes."
                                infoWhyFa="برای پیشگیری از کرش سرویس‌ها ناشی از اتمام حافظه (OOM Killer) ضروری است."
                                infoExampleEn="Used: 4.2 GB / 16.0 GB (26%)"
                                infoExampleFa="مصرف: ۴.۲ گیگابایت از ۱۶ گیگابایت"
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {metrics.memory.usedHuman} / {metrics.memory.totalHuman}
                            </span>
                          </div>
                        </div>
                        <span className="text-xl font-mono font-black text-emerald-400">
                          {metrics.memory.usagePercent}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden border border-white/5">
                          <div
                            className={`h-full transition-all duration-300 ${
                              metrics.memory.usagePercent > 85
                                ? 'bg-rose-500'
                                : metrics.memory.usagePercent > 70
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, metrics.memory.usagePercent)}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                          <span>Free: {metrics.memory.freeHuman}</span>
                          <span>Avail: {metrics.memory.freeHuman}</span>
                        </div>
                      </div>
                    </div>

                    {/* Swap Allocation Card */}
                    <div
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{isEn ? 'Virtual Swap Space' : 'حافظه مجازی (Swap)'}</span>
                              <FieldInfoTooltip
                                infoWhatEn="Virtual disk swap partition used when physical memory reaches peak capacity."
                                infoWhatFa="فضای سواپ دیسک که هنگام تکمیل ظرفیت حافظه فیزیکی رم مورد استفاده قرار می‌گیرد."
                                infoWhyEn="High swap activity indicates severe memory pressure and disk I/O thrashing."
                                infoWhyFa="مصرف بالای سواپ نشانه فشار زیاد روی رم و کاهش چشمگیر سرعت پاسخگویی سیستم است."
                                infoExampleEn="Swap: 256 MB / 2.0 GB"
                                infoExampleFa="سواپ: ۲۵۶ مگابایت از ۲ گیگابایت"
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {metrics.memory.swapTotalBytes > 0
                                ? `${metrics.memory.swapUsedHuman} / ${metrics.memory.swapTotalHuman}`
                                : isEn
                                ? 'No Swap Partition'
                                : 'فاقد پارتیشن سواپ'}
                            </span>
                          </div>
                        </div>
                        <span className="text-xl font-mono font-black text-purple-400">
                          {metrics.memory.swapUsagePercent}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden border border-white/5">
                          <div
                            className={`h-full transition-all duration-300 ${
                              metrics.memory.swapUsagePercent > 70
                                ? 'bg-rose-500'
                                : 'bg-purple-400'
                            }`}
                            style={{ width: `${Math.min(100, metrics.memory.swapUsagePercent)}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
                          <span>0%</span>
                          <span>{metrics.memory.swapTotalBytes > 0 ? `${metrics.memory.swapUsagePercent}%` : 'Disabled'}</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    {/* Uptime & System Info */}
                    <div
                      className={`p-4 rounded-xl border flex flex-col justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold">{isEn ? 'System Uptime' : 'زمان روشن بودن'}</span>
                              <FieldInfoTooltip
                                infoWhatEn="Total running duration of the operating system without reboot."
                                infoWhatFa="مدت زمان تداوم فعالیت سیستم عامل بدون ری‌استارت."
                                infoWhyEn="Confirms host stability and verifies that no unexpected kernel panic occurred."
                                infoWhyFa="نشان‌دهنده پایداری هاست و عدم وقوع ریبوت‌های ناخواسته است."
                                infoExampleEn="14d 6h 32m"
                                infoExampleFa="۱۴ روز و ۶ ساعت"
                                isEn={isEn}
                                isLightMode={isLightMode}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono truncate">
                              Kernel: {metrics.os.kernel || 'N/A'}
                            </span>
                          </div>
                        </div>
                        <span className="text-base font-mono font-bold text-blue-400">
                          {metrics.uptimeFormatted}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-white/5 pt-2 text-slate-400">
                        <span>Arch: {metrics.os.arch}</span>
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Dual Line Chart */}
                  <div
                    className={`p-5 rounded-xl border space-y-3 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs sm:text-sm font-bold">
                          {isEn ? 'Real-time Telemetry Timeline (CPU & Memory)' : 'نمودار زنده روند بار پردازنده و حافظه رم'}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-mono">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                          <span>CPU: {metrics.cpu.usagePercent}%</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <span>RAM: {metrics.memory.usagePercent}%</span>
                        </span>
                      </div>
                    </div>

                    {renderSparkline('cpu', '#22d3ee', '#06b6d4')}
                  </div>

                  {/* Summary of Primary Storage & Network Interfaces */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Primary Disks Snapshot */}
                    <div
                      className={`p-4 rounded-xl border space-y-3 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-amber-400" />
                          <h4 className="text-xs font-bold">{isEn ? 'Mount Points Snapshot' : 'وضعیت پارتیشن‌های دیسک'}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('disks')}
                          className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                        >
                          <span>{isEn ? 'View all' : 'مشاهده همه'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="space-y-2.5">
                        {metrics.disks.slice(0, 3).map((d) => (
                          <div key={d.mount} className="text-xs space-y-1">
                            <div className="flex justify-between items-center font-mono text-[11px]">
                              <span className="font-bold text-slate-200">{d.mount}</span>
                              <span className="text-slate-400">
                                {d.usedHuman} / {d.sizeHuman} ({d.usagePercent}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  d.usagePercent > 90
                                    ? 'bg-rose-500'
                                    : d.usagePercent > 75
                                    ? 'bg-amber-400'
                                    : 'bg-cyan-500'
                                }`}
                                style={{ width: `${Math.min(100, d.usagePercent)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Network Snapshot */}
                    <div
                      className={`p-4 rounded-xl border space-y-3 ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Network className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-xs font-bold">{isEn ? 'Network Interfaces' : 'ترافیک کارت‌های شبکه'}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('network')}
                          className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                        >
                          <span>{isEn ? 'View all' : 'مشاهده همه'}</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {metrics.networks.slice(0, 3).map((net) => (
                          <div
                            key={net.interface}
                            className={`p-2 rounded-lg border flex items-center justify-between text-xs font-mono ${
                              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/5'
                            }`}
                          >
                            <span className="font-bold text-cyan-400">{net.interface}</span>
                            <div className="flex items-center gap-3 text-[11px] text-slate-300">
                              <span>RX: {net.rxHuman}</span>
                              <span>TX: {net.txHuman}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: STORAGE & DISKS */}
              {activeTab === 'disks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold">{isEn ? 'Mounted Filesystems' : 'فایل‌سیستم‌های مانت‌شده'}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? 'Real-time partition capacity, free space, and mount paths parsed from df.'
                          : 'ظرفیت زنده پارتیشن‌ها، فضای آزاد و مسیرهای مانت از دستور df.'}
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                      {metrics.disks.length} {isEn ? 'Partitions' : 'پارتیشن'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {metrics.disks.map((d) => (
                      <div
                        key={d.mount}
                        className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-cyan-400 font-mono truncate max-w-[180px]">
                              {d.mount}
                            </span>
                            <span
                              className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                d.usagePercent > 90
                                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                  : d.usagePercent > 75
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {d.usagePercent}%
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono truncate block mt-0.5">
                            Device: {d.filesystem}
                          </span>
                        </div>

                        <div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                            <div
                              className={`h-full transition-all duration-300 ${
                                d.usagePercent > 90
                                  ? 'bg-rose-500'
                                  : d.usagePercent > 75
                                  ? 'bg-amber-400'
                                  : 'bg-cyan-500'
                              }`}
                              style={{ width: `${Math.min(100, d.usagePercent)}%` }}
                            />
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-2">
                            <span>Used: {d.usedHuman}</span>
                            <span>Free: {d.availHuman}</span>
                            <span>Total: {d.sizeHuman}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: NETWORK INTERFACES */}
              {activeTab === 'network' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold">{isEn ? 'Network Interfaces & Throughput' : 'کارت‌های شبکه و ترافیک'}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? 'Physical and virtual network device statistics extracted directly from /proc/net/dev.'
                          : 'آمار ترافیک دریافتی و ارسالی کارت‌های شبکه استخراج شده از /proc/net/dev.'}
                      </p>
                    </div>
                    <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {metrics.networks.length} {isEn ? 'Interfaces' : 'اینترفیس'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {metrics.networks.map((net) => (
                      <div
                        key={net.interface}
                        className={`p-4 rounded-xl border space-y-3 ${
                          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-cyan-500/15 text-cyan-400 font-mono font-bold text-xs">
                              {net.interface}
                            </div>
                            <div>
                              <span className="text-xs font-bold">{net.interface}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                Total Packets: {(net.rxPackets + net.txPackets).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            UP
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 font-mono text-xs pt-1">
                          <div
                            className={`p-2.5 rounded-lg border ${
                              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/5'
                            }`}
                          >
                            <span className="text-[10px] text-slate-400 block">{isEn ? 'Received (RX)' : 'دریافتی (RX)'}</span>
                            <span className="text-sm font-bold text-emerald-400 block mt-0.5">{net.rxHuman}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {net.rxPackets.toLocaleString()} pkts
                            </span>
                          </div>

                          <div
                            className={`p-2.5 rounded-lg border ${
                              isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-white/5'
                            }`}
                          >
                            <span className="text-[10px] text-slate-400 block">{isEn ? 'Transmitted (TX)' : 'ارسالی (TX)'}</span>
                            <span className="text-sm font-bold text-cyan-400 block mt-0.5">{net.txHuman}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {net.txPackets.toLocaleString()} pkts
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: PROCESSES */}
              {activeTab === 'processes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-sm font-bold">{isEn ? 'Top Resource-Consuming Processes' : 'پردازش‌های پرمصرف سیستم'}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? 'Real active Linux processes sorted dynamically by CPU and Memory usage.'
                          : 'لیست پردازش‌های واقعی در حال اجرا بر اساس مصرف پردازنده و رم.'}
                      </p>
                    </div>

                    {/* Search and Sort controls */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder={isEn ? 'Filter processes...' : 'جستجوی پردازش...'}
                          value={processSearch}
                          onChange={(e) => setProcessSearch(e.target.value)}
                          className={`pl-8 pr-3 py-1 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800'
                              : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        />
                      </div>

                      <div className="flex items-center border rounded-lg overflow-hidden text-xs font-mono">
                        <button
                          type="button"
                          onClick={() => setSortProcessBy('cpu')}
                          className={`px-2.5 py-1 transition cursor-pointer ${
                            sortProcessBy === 'cpu'
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : isLightMode
                              ? 'bg-white text-slate-700'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          CPU%
                        </button>
                        <button
                          type="button"
                          onClick={() => setSortProcessBy('mem')}
                          className={`px-2.5 py-1 transition cursor-pointer ${
                            sortProcessBy === 'mem'
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : isLightMode
                              ? 'bg-white text-slate-700'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          MEM%
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Processes Table */}
                  <div
                    className={`rounded-xl border overflow-hidden ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono text-left">
                        <thead
                          className={`border-b text-[11px] uppercase tracking-wider ${
                            isLightMode ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          <tr>
                            <th className="p-3 w-20">PID</th>
                            <th className="p-3 w-28">{isEn ? 'User' : 'کاربر'}</th>
                            <th className="p-3 w-24">CPU %</th>
                            <th className="p-3 w-24">MEM %</th>
                            <th className="p-3">{isEn ? 'Command' : 'دستور / پردازش'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredProcesses.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400">
                                {isEn ? 'No matching processes found.' : 'پردازشی یافت نشد.'}
                              </td>
                            </tr>
                          ) : (
                            filteredProcesses.map((p) => (
                              <tr
                                key={p.pid}
                                className={`transition-colors ${
                                  isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'
                                }`}
                              >
                                <td className="p-3 font-bold text-slate-300">{p.pid}</td>
                                <td className="p-3 text-slate-400">{p.user}</td>
                                <td className="p-3">
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold ${
                                      p.cpuPercent > 50
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : p.cpuPercent > 10
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'text-cyan-400'
                                    }`}
                                  >
                                    {p.cpuPercent}%
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold ${
                                      p.memPercent > 30
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'text-emerald-400'
                                    }`}
                                  >
                                    {p.memPercent}%
                                  </span>
                                </td>
                                <td className="p-3 text-slate-200 font-sans truncate max-w-md">
                                  {p.command}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ======================================================== */}
        {/* MODAL FOOTER */}
        {/* ======================================================== */}
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-3 border-t text-xs shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                metrics ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>
              {metrics
                ? isEn
                  ? `Live Telemetry Sync • ${new Date(metrics.timestamp).toLocaleTimeString()}`
                  : `اتصال زنده مانیتورینگ • ${new Date(metrics.timestamp).toLocaleTimeString()}`
                : isEn
                ? 'Disconnected'
                : 'قطع اتصال'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 rounded-lg border transition cursor-pointer text-xs font-medium ${
                isLightMode
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-white/5'
              }`}
            >
              {isEn ? 'Close' : 'بستن'}
            </button>

            {onOpenTerminal && (
              <button
                type="button"
                onClick={() => onOpenTerminal(server)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition shadow-sm cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Launch Terminal' : 'اجرای ترمینال'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
