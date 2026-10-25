import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Minus,
  Maximize2,
  Minimize2,
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Pause,
  Play,
  Server,
  Zap,
  Radio,
  Terminal,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { SwitchPort } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useModalDock } from '../context/ModalDockContext';

/**
 * Format bytes into readable string (B, KB, MB, GB, TB)
 */
function formatBytes(bytes: number): string {
  if (bytes === 0 || isNaN(bytes) || bytes < 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = (bytes / Math.pow(k, i)).toFixed(i > 0 ? 2 : 0);
  return `${val} ${sizes[i]}`;
}

/**
 * Format bits per second into readable rate string (bps, Kbps, Mbps, Gbps)
 */
function formatBps(bps: number): string {
  if (bps === 0 || isNaN(bps) || bps < 0) return '0 bps';
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.min(Math.floor(Math.log(bps) / Math.log(k)), sizes.length - 1);
  const val = (bps / Math.pow(k, i)).toFixed(i > 0 ? 2 : 0);
  return `${val} ${sizes[i]}`;
}

interface Point2D {
  x: number;
  y: number;
}

/**
 * Builds smooth cubic Bezier path data (d="M ... C ...") and corresponding closed area path
 */
function buildSmoothSpline(points: Point2D[], baselineY: number): { pathLine: string; pathArea: string } {
  if (points.length === 0) {
    return { pathLine: '', pathArea: '' };
  }
  if (points.length === 1) {
    const p = points[0];
    const pathLine = `M ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const pathArea = `M ${p.x.toFixed(1)},${baselineY.toFixed(1)} L ${p.x.toFixed(1)},${p.y.toFixed(1)} L ${p.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
    return { pathLine, pathArea };
  }
  if (points.length === 2) {
    const p0 = points[0];
    const p1 = points[1];
    const pathLine = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} L ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    const pathArea = `M ${p0.x.toFixed(1)},${baselineY.toFixed(1)} L ${p0.x.toFixed(1)},${p0.y.toFixed(1)} L ${p1.x.toFixed(1)},${p1.y.toFixed(1)} L ${p1.x.toFixed(1)},${baselineY.toFixed(1)} Z`;
    return { pathLine, pathArea };
  }

  // Catmull-Rom to Cubic Bezier conversion with clamped control points
  const tension = 0.2;
  let pathLine = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const pPrev = i > 0 ? points[i - 1] : points[i];
    const pCurr = points[i];
    const pNext = points[i + 1];
    const pNextNext = i + 2 < points.length ? points[i + 2] : pNext;

    let cp1x = pCurr.x + (pNext.x - pPrev.x) * tension;
    let cp1y = pCurr.y + (pNext.y - pPrev.y) * tension;
    let cp2x = pNext.x - (pNextNext.x - pCurr.x) * tension;
    let cp2y = pNext.y - (pNextNext.y - pCurr.y) * tension;

    // Clamp Y to valid plot range [15, baselineY] to avoid overshoot
    cp1y = Math.max(15, Math.min(baselineY, cp1y));
    cp2y = Math.max(15, Math.min(baselineY, cp2y));

    pathLine += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${pNext.x.toFixed(1)},${pNext.y.toFixed(1)}`;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const pathArea = `${pathLine} L ${last.x.toFixed(1)},${baselineY.toFixed(1)} L ${first.x.toFixed(1)},${baselineY.toFixed(1)} Z`;

  return { pathLine, pathArea };
}

export interface CiscoPortStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  port: SwitchPort;
  deviceName: string;
  deviceId: string;
  isLightMode?: boolean;
}

interface StatsPoint {
  timeLabel: string;
  timestamp: number;
  inBps: number;
  outBps: number;
  inPps: number;
  outPps: number;
}

interface HoveredPointState {
  pt: StatsPoint;
  x: number;
  yRx: number;
  yTx: number;
}

export const CiscoPortStatisticsModal: React.FC<CiscoPortStatisticsModalProps> = ({
  isOpen,
  onClose,
  port,
  deviceName,
  deviceId,
  isLightMode: propIsLightMode,
}) => {
  const { t, isEn } = useLanguage();
  const { dockModal, undockModal } = useModalDock();

  // Detect Light Mode with fallback
  const isLightMode = useMemo(() => {
    if (propIsLightMode !== undefined) return propIsLightMode;
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('light') || document.body.classList.contains('light');
    }
    return false;
  }, [propIsLightMode]);

  const [isMaximized, setIsMaximized] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFa, setErrorFa] = useState<string | null>(null);

  // Raw telemetry data
  const [telemetry, setTelemetry] = useState<any | null>(null);
  const [history, setHistory] = useState<StatsPoint[]>([]);
  const [showRawDrawer, setShowRawDrawer] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPointState | null>(null);

  const modalId = `cisco_port_stats_${deviceId}_${port.port_id}`;

  // Docking registration
  const handleMinimize = useCallback(() => {
    dockModal({
      id: modalId,
      labelEn: `Port Stats: ${deviceName} [${port.port_id}]`,
      labelFa: `آمار پورت: ${deviceName} [${port.port_id}]`,
      badge: telemetry ? (telemetry.in_rate_formatted || 'Live') : 'Stats',
      category: 'device',
      onRestore: () => {
        undockModal(modalId);
      },
      onClose: () => {
        undockModal(modalId);
        onClose();
      },
    });
    onClose();
  }, [dockModal, undockModal, modalId, deviceName, port.port_id, telemetry, onClose]);

  // Fetch telemetry from server
  const fetchStats = useCallback(async (isInitial = false) => {
    if (!isOpen) return;
    if (isInitial) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const targetPortId = port.port_id || port.name || port.id || '';
      const resp = await fetch(
        `/api/devices/${encodeURIComponent(deviceId)}/cisco-ports/stats?portId=${encodeURIComponent(targetPortId)}`,
        {
          headers: {
            'Accept-Language': isEn ? 'en' : 'fa',
          },
        }
      );

      const data = await resp.json();
      if (!resp.ok || !data || data.success === false) {
        const errMsg = data?.error || data?.message || 'Failed to fetch port statistics';
        const errMsgFa = data?.errorFa || data?.message || 'عدم امکان دریافت آمار ترافیک پورت';
        setError(errMsg);
        setErrorFa(errMsgFa);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setError(null);
      setErrorFa(null);
      setTelemetry(data);

      const now = Date.now();
      const dateObj = new Date();
      const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

      setHistory((prev) => {
        const nextPoint: StatsPoint = {
          timeLabel: timeStr,
          timestamp: now,
          inBps: data.in_bps || 0,
          outBps: data.out_bps || 0,
          inPps: data.in_pps || 0,
          outPps: data.out_pps || 0,
        };
        const updated = [...prev, nextPoint];
        // Keep last 30 samples (smooth rolling window)
        if (updated.length > 30) {
          return updated.slice(updated.length - 30);
        }
        return updated;
      });
    } catch (err: any) {
      setError(err?.message || 'Connection error to NetTopology backend');
      setErrorFa('خطای عدم ارتباط با سرور سامانه');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [deviceId, port.port_id, isOpen, isEn]);

  // Initial fetch and auto-refresh timer
  useEffect(() => {
    if (!isOpen) return;
    fetchStats(true);
  }, [isOpen, fetchStats]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const intervalMs = Math.max(1, refreshIntervalSec) * 1000;
    const timer = setInterval(() => {
      fetchStats(false);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isOpen, autoRefresh, refreshIntervalSec, fetchStats]);

  // Clean dock entry on unmount/close
  useEffect(() => {
    return () => {
      // Keep dock item if minimized, otherwise clean
    };
  }, []);

  // Compute graph bounds & SVG coordinates with smooth spline interpolation
  const graphMetrics = useMemo(() => {
    if (history.length === 0) {
      return {
        maxRate: 1000000,
        pathRx: '',
        pathTx: '',
        areaRx: '',
        areaTx: '',
        coords: [],
        latestCoord: null as { x: number; yRx: number; yTx: number; pt: StatsPoint } | null,
        peakRx: 0,
        peakTx: 0,
        avgRx: 0,
        avgTx: 0,
      };
    }

    const maxSample = Math.max(
      ...history.map((h) => Math.max(h.inBps, h.outBps)),
      10000 // minimum scale 10 Kbps
    );
    // Add 15% headroom
    const maxRate = Math.ceil(maxSample * 1.15);

    const svgWidth = 800;
    const svgHeight = 220;
    const paddingX = 20;
    const paddingY = 20;
    const plotW = svgWidth - paddingX * 2;
    const plotH = svgHeight - paddingY * 2;
    const baselineY = paddingY + plotH;

    const getY = (val: number) => {
      const clamped = Math.max(0, Math.min(val, maxRate));
      return paddingY + plotH - (clamped / maxRate) * plotH;
    };

    // If only 1 sample, span across full graph width to avoid jumping
    const coords =
      history.length === 1
        ? [
            { x: paddingX, yRx: getY(history[0].inBps), yTx: getY(history[0].outBps), pt: history[0] },
            { x: paddingX + plotW, yRx: getY(history[0].inBps), yTx: getY(history[0].outBps), pt: history[0] },
          ]
        : history.map((pt, idx) => {
            const x = paddingX + (idx / (history.length - 1)) * plotW;
            const yRx = getY(pt.inBps);
            const yTx = getY(pt.outBps);
            return { x, yRx, yTx, pt };
          });

    const ptsRx: Point2D[] = coords.map((c) => ({ x: c.x, y: c.yRx }));
    const ptsTx: Point2D[] = coords.map((c) => ({ x: c.x, y: c.yTx }));

    const splineRx = buildSmoothSpline(ptsRx, baselineY);
    const splineTx = buildSmoothSpline(ptsTx, baselineY);

    const latestCoord = coords.length > 0 ? coords[coords.length - 1] : null;

    const peakRx = Math.max(...history.map((h) => h.inBps), 0);
    const peakTx = Math.max(...history.map((h) => h.outBps), 0);
    const avgRx = Math.round(history.reduce((acc, h) => acc + h.inBps, 0) / history.length);
    const avgTx = Math.round(history.reduce((acc, h) => acc + h.outBps, 0) / history.length);

    return {
      maxRate,
      pathRx: splineRx.pathLine,
      pathTx: splineTx.pathLine,
      areaRx: splineRx.pathArea,
      areaTx: splineTx.pathArea,
      coords,
      latestCoord,
      peakRx,
      peakTx,
      avgRx,
      avgTx,
    };
  }, [history]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="cisco-port-stats-backdrop fixed top-0 left-0 right-0 bottom-8 z-[999990] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      dir={isEn ? 'ltr' : 'rtl'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleMinimize();
        }
      }}
    >
      <div
        className={`cisco-port-stats-modal flex flex-col w-full rounded-2xl shadow-2xl transition-all duration-200 overflow-hidden border ${
          isLightMode
            ? 'bg-slate-50 border-slate-200 text-slate-900 shadow-slate-300/50'
            : 'bg-slate-950 border-slate-800 text-slate-100 shadow-cyan-950/40'
        } ${
          isMaximized
            ? 'h-full max-w-full rounded-none'
            : 'max-h-[94vh] max-w-5xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b select-none shrink-0 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base tracking-tight font-mono">
                  {port.port_id}
                </h3>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    telemetry?.status === 'up'
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : telemetry?.status === 'admin_down'
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
                  }`}
                  title={telemetry?.status || port.status}
                />
                <span
                  className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded-md border ${
                    telemetry?.telemetry_source === 'snmp'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                  }`}
                >
                  {isEn
                    ? telemetry?.protocol_badge || 'Adaptive Engine'
                    : telemetry?.protocol_badge_fa || 'موتور هوشمند دوگانه'}
                </span>
                {telemetry?.latency_ms !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{telemetry.latency_ms} ms</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                <span className="font-semibold text-slate-300">{deviceName}</span>
                <span>•</span>
                <span>VLAN {port.vlan}</span>
                {telemetry?.speed && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-cyan-400">{telemetry.speed}</span>
                  </>
                )}
                {telemetry?.duplex && (
                  <>
                    <span>•</span>
                    <span className="font-mono text-slate-400">{telemetry.duplex}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controls: Auto-refresh, Interval, Refresh button & Window Control Buttons */}
          <div className="flex items-center gap-2">
            {/* Auto refresh pause/play */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 text-xs font-mono ${
                autoRefresh
                  ? isLightMode
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : isLightMode
                    ? 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
              title={
                autoRefresh
                  ? (isEn ? 'Pause live auto-refresh' : 'توقف بروزرسانی زنده')
                  : (isEn ? 'Resume live auto-refresh' : 'ادامه بروزرسانی زنده')
              }
            >
              {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {autoRefresh ? (isEn ? 'Live' : 'زنده') : (isEn ? 'Paused' : 'متوقف')}
              </span>
            </button>

            {/* Refresh Interval Selector */}
            <select
              value={refreshIntervalSec}
              onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
              className={`text-[11px] font-mono px-2 py-1 rounded-lg border cursor-pointer outline-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
              title={isEn ? 'Polling Interval' : 'دوره به‌روزرسانی'}
            >
              <option value={1}>1s</option>
              <option value={2}>2s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
            </select>

            {/* Manual Refresh Now */}
            <button
              type="button"
              onClick={() => fetchStats(false)}
              disabled={isRefreshing}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
              title={isEn ? 'Refresh Now' : 'بروزرسانی دستی'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

            {/* 3 Universal Modal Control Buttons: Minimize, Maximize, Close */}
            <button
              type="button"
              onClick={handleMinimize}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
              title={isEn ? 'Minimize to Tools Dock' : 'کمینه‌سازی به نوار داک'}
            >
              <Minus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer"
              title={isMaximized ? (isEn ? 'Restore Window' : 'خروج از حالت تمام‌صفحه') : (isEn ? 'Maximize Window' : 'تمام‌صفحه')}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              title={isEn ? 'Close' : 'بستن'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error Banner if any */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span className="font-mono">{isEn ? error : (errorFa || error)}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchStats(false)}
                className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] font-mono cursor-pointer transition"
              >
                {isEn ? 'Retry' : 'تلاش مجدد'}
              </button>
            </div>
          )}

          {/* Quick Real-Time Rate Cards (RX & TX) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* RX Inbound Rate */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-white border-emerald-200 shadow-sm'
                  : 'bg-slate-900/80 border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ArrowDownCircle className="w-4 h-4" />
                  <span>{isEn ? 'RX Throughput (Download)' : 'نرخ دریافت (RX / دانلود)'}</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {telemetry?.in_pps ? `${telemetry.in_pps.toLocaleString()} pkts/s` : '0 pkts/s'}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold tracking-tight text-emerald-400">
                {telemetry?.in_rate_formatted || '0 bps'}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/40 text-[11px] text-slate-400 flex justify-between font-mono">
                <span>{isEn ? 'Peak:' : 'اوج:'} {formatBps(graphMetrics.peakRx)}</span>
                <span>{isEn ? 'Avg:' : 'میانگین:'} {formatBps(graphMetrics.avgRx)}</span>
              </div>
            </div>

            {/* TX Outbound Rate */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-white border-cyan-200 shadow-sm'
                  : 'bg-slate-900/80 border-cyan-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>{isEn ? 'TX Throughput (Upload)' : 'نرخ ارسال (TX / آپلود)'}</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {telemetry?.out_pps ? `${telemetry.out_pps.toLocaleString()} pkts/s` : '0 pkts/s'}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold tracking-tight text-cyan-400">
                {telemetry?.out_rate_formatted || '0 bps'}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/40 text-[11px] text-slate-400 flex justify-between font-mono">
                <span>{isEn ? 'Peak:' : 'اوج:'} {formatBps(graphMetrics.peakTx)}</span>
                <span>{isEn ? 'Avg:' : 'میانگین:'} {formatBps(graphMetrics.avgTx)}</span>
              </div>
            </div>

            {/* Cumulative Total Bytes Transferred */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-purple-400" />
                  <span>{isEn ? 'Total Volume Transferred' : 'حجم کل بایت‌های پورت'}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div>
                  <div className="text-[10px] text-slate-400">{isEn ? 'Total RX:' : 'دریافتی کل:'}</div>
                  <div className="font-mono text-sm font-bold text-white">
                    {telemetry?.in_bytes_formatted || '0 B'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">{isEn ? 'Total TX:' : 'ارسالی کل:'}</div>
                  <div className="font-mono text-sm font-bold text-white">
                    {telemetry?.out_bytes_formatted || '0 B'}
                  </div>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/40 text-[10px] font-mono text-slate-400">
                {telemetry?.in_packets ? `${(telemetry.in_packets + telemetry.out_packets).toLocaleString()} total pkts` : '0 packets'}
              </div>
            </div>

            {/* Port Health & Error Matrix */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                isLightMode
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{isEn ? 'Interface Health & Drops' : 'سلامت پورت و خطاها'}</span>
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    (telemetry?.in_errors || 0) + (telemetry?.out_errors || 0) + (telemetry?.crc_errors || 0) === 0
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  {(telemetry?.in_errors || 0) + (telemetry?.out_errors || 0) + (telemetry?.crc_errors || 0) === 0
                    ? (isEn ? 'CLEAN' : 'سالم')
                    : (isEn ? 'ERRORS' : 'دارای خطا')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono mt-1">
                <div className="text-slate-400">
                  CRC: <span className={telemetry?.crc_errors > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{telemetry?.crc_errors ?? 0}</span>
                </div>
                <div className="text-slate-400">
                  Drops: <span className={(telemetry?.in_discards || telemetry?.out_discards) > 0 ? 'text-amber-400 font-bold' : 'text-slate-200'}>{(telemetry?.in_discards || 0) + (telemetry?.out_discards || 0)}</span>
                </div>
                <div className="text-slate-400">
                  In Err: <span className={telemetry?.in_errors > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{telemetry?.in_errors ?? 0}</span>
                </div>
                <div className="text-slate-400">
                  Colls: <span className={telemetry?.collisions > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>{telemetry?.collisions ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Dynamic SVG Telemetry Chart */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isLightMode
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-slate-900/90 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-3 h-8 min-h-[32px] overflow-hidden">
              <div className="flex items-center gap-3 shrink-0">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>{isEn ? 'Live Traffic Flow (Rolling 60 Seconds)' : 'نمودار زنده ترافیک پورت (بازه ۶۰ ثانیه اخیر)'}</span>
                </h4>
                <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span>RX (Inbound)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span>TX (Outbound)</span>
                  </span>
                </div>
              </div>

              {/* Hover Tooltip Info - dedicated slot with fixed height and smooth fade, zero layout shift */}
              <div
                className={`h-7 px-2.5 py-1 rounded-lg border font-mono text-[11px] flex items-center gap-2.5 transition-opacity duration-150 shrink-0 select-none ${
                  hoveredPoint
                    ? isLightMode
                      ? 'bg-slate-100 border-slate-300 text-slate-800 opacity-100 shadow-sm'
                      : 'bg-slate-800/90 border-slate-700 text-slate-200 opacity-100 shadow-sm'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                <span className="text-slate-400">{hoveredPoint?.pt.timeLabel || '00:00:00'}</span>
                <span className="text-emerald-400 font-bold">RX: {formatBps(hoveredPoint?.pt.inBps || 0)}</span>
                <span className="text-cyan-400 font-bold">TX: {formatBps(hoveredPoint?.pt.outBps || 0)}</span>
              </div>
            </div>

            {/* SVG Visual Canvas */}
            <div className="relative w-full h-[220px] select-none">
              {isLoading && history.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>{isEn ? 'Connecting to Cisco switch telemetry stream...' : 'در حال اتصال به جریان تلمتری سوئیچ سیسکو...'}</span>
                </div>
              ) : (
                <svg
                  viewBox="0 0 800 220"
                  className="w-full h-full overflow-hidden"
                  preserveAspectRatio="none"
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <defs>
                    <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                    </linearGradient>
                    <clipPath id="chartAreaClip">
                      <rect x="20" y="15" width="760" height="190" rx="4" />
                    </clipPath>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                    const y = 20 + 180 * (1 - pct);
                    const labelVal = formatBps(graphMetrics.maxRate * pct);
                    return (
                      <g key={i}>
                        <line
                          x1="20"
                          y1={y}
                          x2="780"
                          y2={y}
                          stroke={isLightMode ? '#e2e8f0' : '#1e293b'}
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text
                          x="24"
                          y={y - 4}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                        >
                          {labelVal}
                        </text>
                      </g>
                    );
                  })}

                  {/* Clipped Data Paths and Areas */}
                  <g clipPath="url(#chartAreaClip)">
                    {/* RX Filled Area & Smooth Curve */}
                    {graphMetrics.areaRx && (
                      <path
                        d={graphMetrics.areaRx}
                        fill="url(#rxGradient)"
                        className="transition-all duration-300 ease-out"
                      />
                    )}
                    {graphMetrics.pathRx && (
                      <path
                        d={graphMetrics.pathRx}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-300 ease-out"
                      />
                    )}

                    {/* TX Filled Area & Smooth Curve */}
                    {graphMetrics.areaTx && (
                      <path
                        d={graphMetrics.areaTx}
                        fill="url(#txGradient)"
                        className="transition-all duration-300 ease-out"
                      />
                    )}
                    {graphMetrics.pathTx && (
                      <path
                        d={graphMetrics.pathTx}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-all duration-300 ease-out"
                      />
                    )}

                    {/* Interactive Pulsing Dots - Native SVG animation without coordinate drift */}
                    {graphMetrics.latestCoord && (
                      <g>
                        {/* RX Pulsing Dot */}
                        <circle
                          cx={graphMetrics.latestCoord.x}
                          cy={graphMetrics.latestCoord.yRx}
                          r="4"
                          fill="#10b981"
                          opacity="0.6"
                        >
                          <animate attributeName="r" values="3.5;7.5;3.5" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0.15;0.8" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={graphMetrics.latestCoord.x}
                          cy={graphMetrics.latestCoord.yRx}
                          r="3.5"
                          fill="#10b981"
                          stroke={isLightMode ? '#ffffff' : '#064e3b'}
                          strokeWidth="2"
                        />

                        {/* TX Pulsing Dot */}
                        <circle
                          cx={graphMetrics.latestCoord.x}
                          cy={graphMetrics.latestCoord.yTx}
                          r="4"
                          fill="#06b6d4"
                          opacity="0.6"
                        >
                          <animate attributeName="r" values="3.5;7.5;3.5" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.8;0.15;0.8" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                        <circle
                          cx={graphMetrics.latestCoord.x}
                          cy={graphMetrics.latestCoord.yTx}
                          r="3.5"
                          fill="#06b6d4"
                          stroke={isLightMode ? '#ffffff' : '#083344'}
                          strokeWidth="2"
                        />
                      </g>
                    )}

                    {/* Interactive Hover Crosshair and Dual Markers */}
                    {hoveredPoint && (
                      <g className="pointer-events-none">
                        <line
                          x1={hoveredPoint.x}
                          y1={20}
                          x2={hoveredPoint.x}
                          y2={200}
                          stroke={isLightMode ? '#94a3b8' : '#475569'}
                          strokeDasharray="3 3"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={hoveredPoint.x}
                          cy={hoveredPoint.yRx}
                          r="5"
                          fill="#10b981"
                          stroke={isLightMode ? '#ffffff' : '#022c22'}
                          strokeWidth="2"
                        />
                        <circle
                          cx={hoveredPoint.x}
                          cy={hoveredPoint.yTx}
                          r="5"
                          fill="#06b6d4"
                          stroke={isLightMode ? '#ffffff' : '#082f49'}
                          strokeWidth="2"
                        />
                      </g>
                    )}
                  </g>

                  {/* Hover trigger transparent hit areas */}
                  {graphMetrics.coords.map((c, idx) => {
                    const stepW = graphMetrics.coords.length > 1
                      ? 760 / (graphMetrics.coords.length - 1)
                      : 40;
                    return (
                      <rect
                        key={idx}
                        x={c.x - stepW / 2}
                        y={0}
                        width={stepW}
                        height={220}
                        fill="transparent"
                        className="cursor-crosshair"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            pt: c.pt,
                            x: c.x,
                            yRx: c.yRx,
                            yTx: c.yTx,
                          })
                        }
                      />
                    );
                  })}
                </svg>
              )}
            </div>

            {/* Bottom Chart Footer with Time Range */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-800/40">
              <span>{history.length > 0 ? history[0].timeLabel : '00:00:00'}</span>
              <span>{isEn ? 'Samples count:' : 'تعداد نمونه‌های زنده:'} {history.length}</span>
              <span>{history.length > 0 ? history[history.length - 1].timeLabel : '00:00:00'}</span>
            </div>
          </div>

          {/* Physical Link Specifications Card */}
          <div
            className={`p-3.5 rounded-2xl border text-xs ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/40">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>{isEn ? 'Port Link Specification & Hardware Identity' : 'مشخصات سخت‌افزاری و پیوند فیزیکی پورت'}</span>
              </span>
              <span className="font-mono text-slate-400 text-[11px]">
                {telemetry?.bandwidth_kbps ? `${(telemetry.bandwidth_kbps / 1000).toLocaleString()} Mbps BW` : '1000 Mbps'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
              <div>
                <span className="text-slate-500 block text-[10px]">{isEn ? 'Operational Status:' : 'وضعیت خط:'}</span>
                <span className={`font-bold ${telemetry?.status === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {telemetry?.status?.toUpperCase() || port.status?.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">{isEn ? 'Line Protocol:' : 'پروتکل لینک:'}</span>
                <span className={`font-bold ${telemetry?.line_protocol === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {telemetry?.line_protocol?.toUpperCase() || 'UP'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">{isEn ? 'Speed / Duplex:' : 'سرعت و دوبلکس:'}</span>
                <span className="text-slate-200">
                  {telemetry?.speed || '1000Mb/s'} • {telemetry?.duplex || 'Full'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">{isEn ? 'MTU & Encapsulation:' : 'حداکثر MTU:'}</span>
                <span className="text-slate-200">
                  {telemetry?.mtu || 1500} Bytes (ARPA)
                </span>
              </div>
            </div>

            {telemetry?.description && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/40 text-[11px] font-mono text-amber-300/90 flex items-center gap-2">
                <span className="text-slate-500">{isEn ? 'Description:' : 'توضیحات:'}</span>
                <span>"{telemetry.description}"</span>
              </div>
            )}
          </div>

          {/* Collapsible Authentic Output / Diagnostics Drawer (Rule 8 & 9 Transparency) */}
          <div
            className={`rounded-2xl border transition-all ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setShowRawDrawer(!showRawDrawer)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>
                  {isEn
                    ? 'Authentic Telemetry Diagnostics & Raw Command'
                    : 'مشاهده خروجی واقعی دستور و اطلاعات خام تلمتری (شفافیت ۱۰۰٪ داده)'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {telemetry?.telemetry_source?.toUpperCase() || 'SOURCE'}
                </span>
              </div>
              {showRawDrawer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showRawDrawer && (
              <div className="p-3 border-t border-slate-800 font-mono text-xs text-slate-300 space-y-2">
                {telemetry?.raw_command && (
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">
                      {isEn ? 'Executed CLI Command / SNMP Query:' : 'دستور یا کوئری اجرا شده:'}
                    </span>
                    <pre className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 text-[11px] overflow-x-auto">
                      {telemetry.raw_command}
                    </pre>
                  </div>
                )}

                {telemetry?.raw_output && (
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">
                      {isEn ? 'Authentic Cisco IOS-XE CLI Output:' : 'خروجی معتبر و خام سوئیچ سیسکو:'}
                    </span>
                    <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 text-[10px] overflow-x-auto max-h-48 leading-relaxed">
                      {telemetry.raw_output}
                    </pre>
                  </div>
                )}

                {telemetry?.snmp_oids && telemetry.snmp_oids.length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">
                      {isEn ? 'Queried SNMP MIB-2 / IF-MIB OIDs:' : 'شناسه‌های OID خوانده شده از SNMP:'}
                    </span>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {telemetry.snmp_oids.map((oidItem: any, idx: number) => (
                        <div key={idx} className="p-1.5 rounded bg-slate-950 border border-slate-800 text-[10px] flex justify-between">
                          <span className="text-cyan-400">{oidItem.name} ({oidItem.oid})</span>
                          <span className="text-white font-bold">{String(oidItem.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className={`px-4 py-2.5 border-t text-xs flex items-center justify-between select-none shrink-0 ${
            isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isEn ? 'Live Rate Calculation:' : 'منطق محاسبه زنده:'}{' '}
              <span className="text-slate-300 font-bold">Δ Bytes / Δ Time</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleMinimize}
              className={`px-3 py-1 rounded-xl text-xs font-medium border transition cursor-pointer ${
                isLightMode
                  ? 'bg-white hover:bg-slate-50 border-slate-300 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
            >
              {isEn ? 'Minimize' : 'کمینه‌سازی'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1 rounded-xl text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 transition cursor-pointer"
            >
              {isEn ? 'Close' : 'بستن'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
