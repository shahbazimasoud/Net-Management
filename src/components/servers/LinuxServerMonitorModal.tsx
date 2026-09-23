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
  Play,
  Square,
  RotateCw,
  Ban,
  MoreVertical,
  Sliders,
  ServerCog,
  Check,
  Flame,
  ShieldAlert,
  Users,
  Globe,
  Edit3,
  Settings,
  Plus,
  FolderCog,
  FileText,
} from 'lucide-react';
import { RemoteServer, LinuxServerLiveMetrics, LinuxServerProcessMetric, LinuxSystemService, LinuxNetworkInterfaceDetail, LinuxSystemDetailedInfo } from '../../types';
import {
  fetchLinuxServerLiveMetrics,
  fetchLinuxServerServices,
  controlLinuxServerService,
  controlLinuxServerProcess,
  fetchLinuxServerSysConfig,
  unmountLinuxFilesystem,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { ProcessActionModals } from './ProcessActionModals';
import { LinuxUsersTab } from './LinuxUsersTab';
import { LinuxSysConfigTab } from './LinuxSysConfigTab';
import { LinuxLogsTab } from './LinuxLogsTab';
import { LinuxNetworkConfigModal } from './LinuxNetworkConfigModal';
import { LinuxMountModal } from './LinuxMountModal';
import { LinuxServiceWatchdogModal } from './LinuxServiceWatchdogModal';
import { LinuxDirectoryPolicyTab } from './LinuxDirectoryPolicyTab';
import { LinuxStorageManager } from './storage';
import { useModalDock } from '../../context/ModalDockContext';

export interface LinuxServerMonitorModalProps {
  isOpen: boolean;
  server: RemoteServer | null;
  sessionPassword?: string;
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
  sessionPassword,
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
  const [ephemeralPassword, setEphemeralPassword] = useState(sessionPassword || '');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(3000); // 3 seconds default
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'services' | 'processes' | 'disks' | 'directories' | 'network' | 'users' | 'sysconfig' | 'logs'>('overview');
  const [processSearch, setProcessSearch] = useState('');
  const [sortProcessBy, setSortProcessBy] = useState<'cpu' | 'mem'>('cpu');

  // Network Interface Configuration Modal State & SysInfo
  const [selectedInterfaceForConfig, setSelectedInterfaceForConfig] = useState<LinuxNetworkInterfaceDetail | null>(null);
  const [detailedInterfaces, setDetailedInterfaces] = useState<LinuxNetworkInterfaceDetail[]>([]);
  const [sysInfo, setSysInfo] = useState<LinuxSystemDetailedInfo | null>(null);

  // Watchdog & Auto-Recovery Modal State
  const [isWatchdogModalOpen, setIsWatchdogModalOpen] = useState(false);
  const [selectedWatchdogService, setSelectedWatchdogService] = useState<string | undefined>(undefined);

  // Services Management State
  const [services, setServices] = useState<LinuxSystemService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'active' | 'inactive' | 'failed'>('all');
  const [serviceActionLoading, setServiceActionLoading] = useState<Record<string, string>>({});
  
  // Feedback notification
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Timeline chart filter and hover state
  const [timelineMetricFilter, setTimelineMetricFilter] = useState<'both' | 'cpu' | 'memory'>('both');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Process Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    process: LinuxServerProcessMetric | null;
  }>({ visible: false, x: 0, y: 0, process: null });

  // Renice Dialog State
  const [reniceDialog, setReniceDialog] = useState<{
    isOpen: boolean;
    process: LinuxServerProcessMetric | null;
    niceValue: number;
    loading: boolean;
  }>({ isOpen: false, process: null, niceValue: 0, loading: false });

  const [processActionLoading, setProcessActionLoading] = useState(false);

  // Storage & Mount State
  const [showMountModal, setShowMountModal] = useState(false);
  const [unmountingMount, setUnmountingMount] = useState<string | null>(null);

  const { dockModal, undockModal } = useModalDock();

  const handleMinimizeWatchdog = () => {
    setIsWatchdogModalOpen(false);
    if (!server) return;
    dockModal({
      id: `linux_watchdog_${server.id}`,
      labelEn: `Watchdog (${server.name || server.ip})`,
      labelFa: `ناظر خودکار (${server.name || server.ip})`,
      category: 'system',
      badge: 'Watchdog',
      onRestore: () => {
        setIsWatchdogModalOpen(true);
        undockModal(`linux_watchdog_${server.id}`);
      },
      onClose: () => {
        setIsWatchdogModalOpen(false);
        undockModal(`linux_watchdog_${server.id}`);
      },
    });
  };

  const handleCloseWatchdog = () => {
    setIsWatchdogModalOpen(false);
    if (server) undockModal(`linux_watchdog_${server.id}`);
  };

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const isTelemetryTab = activeTab === 'overview' || activeTab === 'disks' || activeTab === 'network' || activeTab === 'processes';

  // Fetch telemetry from physical or virtual device
  const fetchMetrics = useCallback(async (customPassword?: string, isBackground = false) => {
    if (!server) return;
    if (!isBackground) {
      setLoading(true);
      setError(null);
    }

    const pwdToUse = customPassword !== undefined ? customPassword : ephemeralPassword;

    try {
      const res = await fetchLinuxServerLiveMetrics(server.id, pwdToUse);
      if (res.success && res.metrics) {
        setMetrics(res.metrics);
        setRequiresPassword(false);
        setError(null);

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
        if (!isBackground) {
          setError(res.error || (isEn ? 'Failed to fetch telemetry metrics' : 'واکشی متریک‌های سیستم ناموفق بود'));
        }
      }
    } catch (err: any) {
      if (!isBackground) {
        setError(err?.message || (isEn ? 'Network connection error while contacting server' : 'خطای اتصال به سرور'));
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [server, ephemeralPassword, isEn]);

  // Fetch detailed sys info & interfaces
  const loadSysConfig = useCallback(async (customPassword?: string) => {
    if (!server) return;
    const pwdToUse = customPassword !== undefined ? customPassword : ephemeralPassword;
    try {
      const res = await fetchLinuxServerSysConfig(server.id, pwdToUse);
      if (res && res.success) {
        if (res.sysInfo) setSysInfo(res.sysInfo);
        if (res.interfaces) setDetailedInterfaces(res.interfaces);
      }
    } catch {
      // Ignore background sysinfo error
    }
  }, [server, ephemeralPassword]);

  // Initial load and periodic polling
  useEffect(() => {
    if (isOpen && server) {
      fetchMetrics();
      loadSysConfig();
    } else {
      setMetrics(null);
      setError(null);
      setHistory([]);
      setSysInfo(null);
      setDetailedInterfaces([]);
    }
  }, [isOpen, server?.id, fetchMetrics, loadSysConfig]);

  useEffect(() => {
    // Only poll automatically if on telemetry tabs to avoid disrupting configuration tabs (SysConfig, Users, Logs)
    if (!isOpen || autoRefreshInterval <= 0 || requiresPassword || error || !isTelemetryTab) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      fetchMetrics(undefined, true);
    }, autoRefreshInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, autoRefreshInterval, fetchMetrics, requiresPassword, !!error, isTelemetryTab]);

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

  // Load Linux System Services
  const loadServices = useCallback(async () => {
    if (!server) return;
    setServicesLoading(true);
    setServicesError(null);
    try {
      const res = await fetchLinuxServerServices(server.id, ephemeralPassword);
      if (res.success && res.services) {
        setServices(res.services);
      } else {
        setServicesError(res.error || (isEn ? 'Failed to fetch system services' : 'خطا در واکشی سرویس‌های سیستم'));
      }
    } catch (err: any) {
      setServicesError(err?.message || (isEn ? 'Network error while loading services' : 'خطای ارتباط در بارگذاری سرویس‌ها'));
    } finally {
      setServicesLoading(false);
    }
  }, [server, ephemeralPassword, isEn]);

  // Handle Service Control Action
  const handleServiceAction = async (serviceName: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') => {
    if (!server) return;
    setServiceActionLoading((prev) => ({ ...prev, [serviceName]: action }));
    try {
      const res = await controlLinuxServerService(server.id, serviceName, action, ephemeralPassword);
      if (res.success) {
        setActionFeedback({
          message: res.message || (isEn ? `Action ${action} on ${serviceName} executed successfully` : `عملیات ${action} روی ${serviceName} با موفقیت اجرا شد`),
          type: 'success',
        });
        loadServices();
      } else {
        setActionFeedback({
          message: res.message || res.error || (isEn ? `Failed to execute ${action} on ${serviceName}` : `خطا در اجرای ${action} روی ${serviceName}`),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        message: err?.message || (isEn ? 'Network failure while executing service action' : 'خطای شبکه در اجرای دستور سرویس'),
        type: 'error',
      });
    } finally {
      setServiceActionLoading((prev) => {
        const next = { ...prev };
        delete next[serviceName];
        return next;
      });
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Handle unmounting a filesystem
  const handleUnmount = async (mountPath: string) => {
    if (!server) return;
    if (['/', '/boot', '/proc', '/sys', '/dev', '/run', '/etc', '/var', '/usr'].includes(mountPath)) {
      setActionFeedback({
        message: isEn
          ? `Protected system path "${mountPath}" cannot be unmounted`
          : `مسیر محافظت‌شده سیستم "${mountPath}" قابل آن‌مانت نیست`,
        type: 'error',
      });
      return;
    }
    const confirmed = window.confirm(
      isEn
        ? `Are you sure you want to unmount "${mountPath}"?`
        : `آیا از آن‌مانت کردن مسیر "${mountPath}" اطمینان دارید؟`
    );
    if (!confirmed) return;

    setUnmountingMount(mountPath);
    try {
      const res = await unmountLinuxFilesystem(server.id, mountPath, false, ephemeralPassword);
      if (res.success) {
        setActionFeedback({
          message: res.message || (isEn ? `Successfully unmounted ${mountPath}` : `مسیر ${mountPath} با موفقیت آن‌مانت شد`),
          type: 'success',
        });
        fetchMetrics();
      } else {
        setActionFeedback({
          message: res.message || res.error || (isEn ? `Failed to unmount ${mountPath}` : `خطا در آن‌مانت ${mountPath}`),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        message: err?.message || (isEn ? 'Failed to unmount filesystem' : 'خطا در ارتباط جهت آن‌مانت'),
        type: 'error',
      });
    } finally {
      setUnmountingMount(null);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Service state helper classifiers (Strict & Accurate)
  const isServiceActive = (s: LinuxSystemService) => {
    const act = (s.activeState || '').toLowerCase().trim();
    const sub = (s.subState || '').toLowerCase().trim();
    if (act === 'failed' || sub === 'failed') return false;
    if (act === 'inactive' || sub === 'dead') return false;
    return act === 'active' || act === 'activating' || sub === 'running';
  };

  const isServiceFailed = (s: LinuxSystemService) => {
    const act = (s.activeState || '').toLowerCase().trim();
    const sub = (s.subState || '').toLowerCase().trim();
    return act === 'failed' || sub === 'failed';
  };

  const isServiceInactive = (s: LinuxSystemService) => {
    return !isServiceActive(s) && !isServiceFailed(s);
  };

  // Filtered Services List
  const filteredServices = useMemo(() => {
    let list = [...services];
    if (serviceStatusFilter !== 'all') {
      if (serviceStatusFilter === 'active') {
        list = list.filter(isServiceActive);
      } else if (serviceStatusFilter === 'inactive') {
        list = list.filter(isServiceInactive);
      } else if (serviceStatusFilter === 'failed') {
        list = list.filter(isServiceFailed);
      }
    }
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase().trim();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }
    return list;
  }, [services, serviceStatusFilter, serviceSearch]);

  // Close context menu on outside click
  useEffect(() => {
    const handleCloseMenu = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, process: null });
      }
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, [contextMenu.visible]);

  // Context Menu Trigger
  const handleProcessContextMenu = (e: React.MouseEvent, p: LinuxServerProcessMetric) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 240;
    const menuHeight = 220;
    const posX = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
    const posY = Math.min(e.clientY, window.innerHeight - menuHeight - 12);
    setContextMenu({
      visible: true,
      x: Math.max(12, posX),
      y: Math.max(12, posY),
      process: p,
    });
  };

  // Kill Process Execution
  const handleKillProcess = async (signal: 15 | 9) => {
    if (!server || !contextMenu.process) return;
    const proc = contextMenu.process;
    setContextMenu({ visible: false, x: 0, y: 0, process: null });
    setProcessActionLoading(true);
    try {
      const res = await controlLinuxServerProcess(server.id, proc.pid, 'kill', { signal }, ephemeralPassword);
      if (res.success) {
        setActionFeedback({
          message: isEn
            ? `Signal ${signal === 9 ? 'SIGKILL (Force Kill)' : 'SIGTERM (Terminate)'} sent to PID ${proc.pid} (${proc.command})`
            : `سیگنال ${signal === 9 ? 'SIGKILL (اجباری)' : 'SIGTERM (عادی)'} به پردازش ${proc.pid} ارسال شد`,
          type: 'success',
        });
        setTimeout(() => fetchMetrics(), 1200);
      } else {
        setActionFeedback({
          message: res.message || res.error || (isEn ? `Failed to kill process ${proc.pid}` : `خطا در متوقف کردن پردازش ${proc.pid}`),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        message: err?.message || (isEn ? 'Network error during process action' : 'خطای شبکه در ارسال دستور به پردازش'),
        type: 'error',
      });
    } finally {
      setProcessActionLoading(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  const handleOpenRenice = (proc: LinuxServerProcessMetric) => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
    setReniceDialog({
      isOpen: true,
      process: proc,
      niceValue: 0,
      loading: false,
    });
  };

  // Apply Renice Execution
  const handleApplyRenice = async () => {
    if (!server || !reniceDialog.process) return;
    const proc = reniceDialog.process;
    const niceVal = reniceDialog.niceValue;
    setReniceDialog({ isOpen: false, process: null, niceValue: 0, loading: false });
    setProcessActionLoading(true);
    try {
      const res = await controlLinuxServerProcess(server.id, proc.pid, 'renice', { nice: niceVal }, ephemeralPassword);
      if (res.success) {
        setActionFeedback({
          message: isEn
            ? `Nice priority of PID ${proc.pid} successfully set to ${niceVal}`
            : `اولویت پردازش PID ${proc.pid} به ${niceVal} تغییر یافت`,
          type: 'success',
        });
        setTimeout(() => fetchMetrics(), 1200);
      } else {
        setActionFeedback({
          message: res.message || res.error || (isEn ? `Failed to renice process ${proc.pid}` : `خطا در تغییر اولویت پردازش ${proc.pid}`),
          type: 'error',
        });
      }
    } catch (err: any) {
      setActionFeedback({
        message: err?.message || (isEn ? 'Network error during renice' : 'خطای شبکه در تغییر اولویت پردازش'),
        type: 'error',
      });
    } finally {
      setProcessActionLoading(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  if (!isOpen || !server) return null;

  // Real-time Stable Dual Timeline Chart (CPU & RAM)
  const renderDualTimelineChart = () => {
    if (history.length < 2) {
      return (
        <div className="h-32 flex flex-col items-center justify-center text-xs text-slate-400 font-mono gap-2">
          <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
          <span>{isEn ? 'Streaming live telemetry data...' : 'در حال دریافت داده‌های زنده و همگام‌سازی...'}</span>
        </div>
      );
    }

    const width = 640;
    const height = 130;
    const paddingX = 35;
    const paddingY = 15;
    const chartWidth = width - 2 * paddingX;
    const chartHeight = height - 2 * paddingY;

    // Use a fixed slot scale (25 points) to completely prevent horizontal jumpiness/jitter
    const MAX_POINTS = 25;
    const xStep = chartWidth / (MAX_POINTS - 1);

    const cpuPoints = history.map((pt, idx) => {
      const x = paddingX + idx * xStep;
      const y = height - paddingY - (Math.min(100, Math.max(0, pt.cpu)) / 100) * chartHeight;
      return { x, y, val: pt.cpu, time: pt.timeStr };
    });

    const memPoints = history.map((pt, idx) => {
      const x = paddingX + idx * xStep;
      const y = height - paddingY - (Math.min(100, Math.max(0, pt.memory)) / 100) * chartHeight;
      return { x, y, val: pt.memory, time: pt.timeStr };
    });

    const buildPath = (pts: { x: number; y: number }[]) => {
      return pts.reduce(
        (acc, p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
        ''
      );
    };

    const cpuPath = buildPath(cpuPoints);
    const memPath = buildPath(memPoints);

    const lastCpu = cpuPoints[cpuPoints.length - 1];
    const lastMem = memPoints[memPoints.length - 1];

    const cpuArea = `${cpuPath} L ${lastCpu.x.toFixed(1)} ${height - paddingY} L ${cpuPoints[0].x.toFixed(1)} ${height - paddingY} Z`;
    const memArea = `${memPath} L ${lastMem.x.toFixed(1)} ${height - paddingY} L ${memPoints[0].x.toFixed(1)} ${height - paddingY} Z`;

    const activePoint =
      hoveredPointIndex !== null && history[hoveredPointIndex]
        ? {
            time: history[hoveredPointIndex].timeStr,
            cpu: history[hoveredPointIndex].cpu,
            memory: history[hoveredPointIndex].memory,
            cpuPt: cpuPoints[hoveredPointIndex],
            memPt: memPoints[hoveredPointIndex],
          }
        : null;

    return (
      <div className="relative w-full select-none">
        {/* Filter toggles & Metric readout */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400 font-mono">{isEn ? 'Metric:' : 'متریک:'}</span>
            <div className="inline-flex rounded-lg border border-slate-700/60 p-0.5 bg-slate-900/50 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setTimelineMetricFilter('both')}
                className={`px-2.5 py-0.5 rounded cursor-pointer transition ${
                  timelineMetricFilter === 'both' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isEn ? 'Dual (CPU + RAM)' : 'هردو (CPU + RAM)'}
              </button>
              <button
                type="button"
                onClick={() => setTimelineMetricFilter('cpu')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  timelineMetricFilter === 'cpu' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                CPU
              </button>
              <button
                type="button"
                onClick={() => setTimelineMetricFilter('memory')}
                className={`px-2 py-0.5 rounded cursor-pointer transition ${
                  timelineMetricFilter === 'memory' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                RAM
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            {activePoint ? (
              <span className="text-slate-200 font-semibold flex items-center gap-2 bg-slate-800/90 px-2.5 py-1 rounded border border-white/10 shadow-sm">
                <span className="text-slate-400">@{activePoint.time}:</span>
                <span className="text-cyan-400 font-bold">CPU: {activePoint.cpu}%</span>
                <span className="text-emerald-400 font-bold">RAM: {activePoint.memory}%</span>
              </span>
            ) : (
              <>
                {(timelineMetricFilter === 'both' || timelineMetricFilter === 'cpu') && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-500/50" />
                    <span className="text-slate-300 font-bold">CPU: {lastCpu.val}%</span>
                  </span>
                )}
                {(timelineMetricFilter === 'both' || timelineMetricFilter === 'memory') && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />
                    <span className="text-slate-300 font-bold">RAM: {lastMem.val}%</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* SVG Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden bg-slate-950/40 border border-white/5 p-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-32 overflow-visible"
            onMouseLeave={() => setHoveredPointIndex(null)}
          >
            <defs>
              <linearGradient id="cpuGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="memGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines and percentage markers */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = height - paddingY - (pct / 100) * chartHeight;
              return (
                <g key={pct}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={width - paddingX}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={pct === 0 ? 0.2 : 0.08}
                    strokeDasharray={pct === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={paddingX - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="currentColor"
                    fillOpacity="0.4"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* RAM (Memory) Area & Line */}
            {(timelineMetricFilter === 'both' || timelineMetricFilter === 'memory') && (
              <>
                <path d={memArea} fill="url(#memGradient)" />
                <path
                  d={memPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={lastMem.x} cy={lastMem.y} r="3.5" fill="#10b981" />
              </>
            )}

            {/* CPU Area & Line */}
            {(timelineMetricFilter === 'both' || timelineMetricFilter === 'cpu') && (
              <>
                <path d={cpuArea} fill="url(#cpuGradient)" />
                <path
                  d={cpuPath}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={lastCpu.x} cy={lastCpu.y} r="3.5" fill="#06b6d4" />
              </>
            )}

            {/* Hover overlay columns */}
            {history.map((_, idx) => {
              const colX = paddingX + idx * xStep - xStep / 2;
              return (
                <rect
                  key={idx}
                  x={Math.max(0, colX)}
                  y={paddingY}
                  width={xStep}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  onMouseEnter={() => setHoveredPointIndex(idx)}
                />
              );
            })}

            {/* Active hover crosshair line */}
            {activePoint && (
              <line
                x1={activePoint.cpuPt.x}
                y1={paddingY}
                x2={activePoint.cpuPt.x}
                y2={height - paddingY}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>
        </div>

        <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1 px-1">
          <span>{history[0]?.timeStr || '00:00'}</span>
          <span>{isEn ? `Live Timeline (${history.length} snapshots)` : `روند زنده (${history.length} نمونه اخیر)`}</span>
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
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {isEn ? 'Server Management' : 'مدیریت سرور'}
                </span>
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
              title={isEn ? 'Close Server Management' : 'بستن مدیریت سرور'}
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
              onClick={() => setActiveTab('directories')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'directories'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FolderCog className="w-3.5 h-3.5 text-amber-400" />
              <span>{isEn ? 'Directory Lifecycle & Backups' : 'سیاست‌های دایرکتوری و بکاپ'}</span>
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
              onClick={() => {
                setActiveTab('services');
                if (services.length === 0) loadServices();
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'services'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <ServerCog className="w-3.5 h-3.5" />
              <span>{isEn ? 'System Services' : 'سرویس‌های سیستم'}</span>
              {services.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/40 font-mono">
                  {services.length}
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

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'users'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isEn ? 'Users & Sessions' : 'کاربران و نشست‌ها'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sysconfig')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'sysconfig'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isEn ? 'System & Proxy / SSH' : 'سیستم، پروکسی و SSH'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isEn ? 'System Logs' : 'لاگ‌های سیستم'}</span>
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
          {/* Action Feedback Banner */}
          {actionFeedback && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-all ${
                actionFeedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {actionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-medium font-mono">{actionFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionFeedback(null)}
                className="text-slate-400 hover:text-white transition cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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

          {/* Genuine Error Display (Zero Fake Data Guarantee) - Shown only on telemetry tabs to avoid disrupting config tabs */}
          {isTelemetryTab && error && !requiresPassword && (
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

          {/* Loading Initial State - Shown only on telemetry tabs */}
          {isTelemetryTab && loading && !metrics && !error && (
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

          {/* TAB 1: OVERVIEW & GAUGES */}
          {activeTab === 'overview' && metrics && (
                <div className="space-y-6">
                  {/* Operating System, Distribution & Kernel Details */}
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
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-bold">
                              {isEn ? 'Operating System & Kernel Details' : 'مشخصات توزیع لینوکس و نسخه کرنل'}
                            </h4>
                            <FieldInfoTooltip
                              fieldName={isEn ? 'Operating System & Kernel' : 'سیستم‌عامل و کرنل لینوکس'}
                              infoWhatEn="Detailed distribution metadata, kernel release version, architecture, and system hostname."
                              infoWhatFa="اطلاعات تکمیلی توزیع، نسخه انتشار کرنل، معماری پردازنده و نام هاست سرور لینوکس."
                              infoWhyEn="Essential for verifying kernel security patch levels, distribution lifecycles, and architecture compatibility for installed software."
                              infoWhyFa="ضروری برای بررسی وصله‌های امنیتی کرنل، چرخه پشتیبانی توزیع و سازگاری معماری برای نصب نرم‌افزارها."
                              infoExampleEn="Ubuntu 22.04.4 LTS on Linux 5.15.0-105-generic (x86_64)"
                              infoExampleFa="اوبونتو ۲۲.۰۴ روی کرنل ۵.۱۵ به همراه معماری ۶۴ بیتی"
                              isEn={isEn}
                              isLightMode={isLightMode}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {sysInfo?.distro || metrics.os?.distro || server.os_distro || (isEn ? 'Detecting via /etc/os-release...' : 'در حال شناسایی از /etc/os-release...')}
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                        {sysInfo?.arch || metrics.os?.arch || 'x86_64'}
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
                          {sysInfo?.distro || metrics.os?.distro || server.os_distro || 'Linux'}
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
                          {sysInfo?.distroVersion || metrics.os?.system || 'Linux'}
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
                        <span className="text-xs sm:text-sm font-bold text-emerald-400 block mt-1 font-mono truncate" title={sysInfo?.kernelRelease || metrics.os?.kernel}>
                          {sysInfo?.kernelRelease || metrics.os?.kernel || 'Linux'}
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
                        <span className="text-xs sm:text-sm font-bold text-slate-200 block mt-1 font-mono truncate" title={metrics.hostname || sysInfo?.hostname || server.hostname || server.ip}>
                          {metrics.hostname || sysInfo?.hostname || server.hostname || server.ip}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                          {metrics.uptimeFormatted || sysInfo?.uptime || '-'}
                        </span>
                      </div>
                    </div>
                  </div>

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
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Dual Telemetry Timeline' : 'نمودار زنده بار منابع'}
                          infoWhatEn="Dual-series timeline tracking authentic processor load and physical RAM utilization across sequential time snapshots."
                          infoWhatFa="نمودار همزمان دوگانه که بار پردازنده و مصرف فیزیکی رم سرور را در طول زمان به صورت پیوسته رصد می‌کند."
                          infoWhyEn="Reveals sudden spikes, resource saturation, memory leaks, and historical performance trends on the Linux host."
                          infoWhyFa="تشخیص جهش‌های ناگهانی بار، اشباع پردازشی، نشت حافظه (Memory Leak) و روند پایدار سرور."
                          infoExampleEn="Cyan line: CPU% load; Emerald line: Memory% consumption"
                          infoExampleFa="خط فیروزه‌ای: درصد بار CPU؛ خط سبز زمردی: درصد اشغال حافظه RAM"
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                    </div>

                    {renderDualTimelineChart()}
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
                  <div className="flex items-center justify-between pb-1">
                    <div>
                      <h3 className="text-sm font-bold">{isEn ? 'Storage, Disks & Filesystems' : 'مدیریت ذخیره‌ساز، دیسک‌ها و فایل‌سیستم‌ها'}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? 'Real-time Linux block device topology, LVM volume groups, and live mounted filesystems.'
                          : 'توپولوژی زنده تجهیزات بلاک لینوکس، گروه‌های حجمی LVM و فایل‌سیستم‌های مانت‌شده.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('directories')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-colors shadow-sm cursor-pointer"
                      >
                        <FolderCog className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isEn ? 'Directory Policies & Backups' : 'سیاست‌های دایرکتوری و بکاپ'}</span>
                      </button>
                    </div>
                  </div>

                  <LinuxStorageManager
                    server={server}
                    isLightMode={isLightMode}
                    onRefreshParent={() => fetchMetrics(ephemeralPassword)}
                  />
                </div>
              )}

              {/* TAB 3: NETWORK INTERFACES */}
              {activeTab === 'network' && metrics && (
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
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              UP
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const detailed = detailedInterfaces.find((i) => i.name === net.interface);
                                setSelectedInterfaceForConfig(
                                  detailed || {
                                    name: net.interface,
                                    state: 'UP',
                                    mac: '',
                                    ipv4: '',
                                    netmask: '',
                                    cidr: 24,
                                    ipv6: '',
                                    gateway: '',
                                    mtu: 1500,
                                    rxBytes: net.rxBytes,
                                    txBytes: net.txBytes,
                                  }
                                );
                              }}
                              className="px-2 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{isEn ? 'Configure' : 'پیکربندی'}</span>
                            </button>
                          </div>
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
              {activeTab === 'processes' && metrics && (
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

                  {/* Context menu instruction notice */}
                  <div
                    className={`px-4 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      isLightMode
                        ? 'bg-cyan-50/70 border-cyan-200 text-cyan-900'
                        : 'bg-cyan-950/20 border-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>
                        {isEn
                          ? 'Right-click any process or click the action button to Terminate (SIGTERM), Force Kill (SIGKILL), or Renice (-20 to +19).'
                          : 'برای خاتمه (SIGTERM)، توقف اجباری (SIGKILL) یا تغییر اولویت پردازش (Renice)، روی هر سطر راست‌کلیک کرده یا از دکمه عملیات استفاده کنید.'}
                      </span>
                    </div>
                    <FieldInfoTooltip
                      fieldName={isEn ? 'Linux Process Management' : 'مدیریت پردازش‌های لینوکس'}
                      infoWhatEn="Interactive process task manager enabling signals (SIGTERM 15, SIGKILL 9) and priority scheduling (nice value)."
                      infoWhatFa="ابزار کنترل پردازش‌ها جهت ارسال سیگنال خاتمه نرم، نابودی اجباری یا تنظیم ضریب اولویت CPU بین -20 تا +19."
                      infoWhyEn="Critical for stopping runaway tasks, hung workers, memory hoggers, or prioritizing mission-critical background daemons."
                      infoWhyFa="ضروری برای متوقف‌سازی کارهای معلق، پردازش‌های مصرف‌کننده بیش از حد رم و تنظیم اولویت سرویس‌های حیاتی."
                      infoExampleEn="Nice -10 (High priority), Nice +10 (Low background priority), Kill (SIGKILL -9)"
                      infoExampleFa="نایس -۱۰ (اولویت بالا)، نایس +۱۰ (اولویت کم پس‌زمینه)، کیل اجباری (SIGKILL)"
                      isEn={isEn}
                      isLightMode={isLightMode}
                    />
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
                            <th className="p-3 w-20 text-center">{isEn ? 'Action' : 'عملیات'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredProcesses.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400">
                                {isEn ? 'No matching processes found.' : 'پردازشی یافت نشد.'}
                              </td>
                            </tr>
                          ) : (
                            filteredProcesses.map((p) => (
                              <tr
                                key={p.pid}
                                onContextMenu={(e) => handleProcessContextMenu(e, p)}
                                className={`transition-colors cursor-context-menu select-none ${
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
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => handleProcessContextMenu(e, p)}
                                    title={isEn ? 'Manage Process' : 'مدیریت پردازش'}
                                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5 mx-auto" />
                                  </button>
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

              {/* ======================================================== */}
              {/* TAB: SYSTEM SERVICES (SYSTEMD UNIT CONTROLS) */}
              {/* ======================================================== */}
              {activeTab === 'services' && (
                <div className="space-y-4">
                  {/* Services Subheader & Filter Bar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <ServerCog className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm font-bold">
                          {isEn ? 'Systemd Services & Daemons' : 'سرویس‌ها و دیمون‌های سیستمی لینوکس'}
                        </h3>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Linux Systemd Services' : 'سرویس‌های Systemd'}
                          infoWhatEn="Core background service daemons managed by systemctl on this Linux host."
                          infoWhatFa="سرویس‌ها و پردازش‌های پس‌زمینه لینوکس که از طریق systemctl و Systemd مدیریت می‌شوند."
                          infoWhyEn="Allows direct starting, stopping, restarting, or enabling/disabling auto-start at boot for servers like Nginx, SSH, Docker, Database, etc."
                          infoWhyFa="امکان راه‌اندازی، توقف، راه‌اندازی مجدد و فعال یا غیرفعال‌سازی اجرای خودکار سرویس‌ها هنگام بوت سرور."
                          infoExampleEn="nginx.service (web server), sshd.service (remote shell), docker.service (containers)"
                          infoExampleFa="سرویس nginx.service (وب‌سرور)، sshd.service (دسترسی ترمینال)، docker.service (کانتینرها)"
                          isEn={isEn}
                          isLightMode={isLightMode}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isEn
                          ? 'Real-time daemon statuses with live Start, Stop, Restart, and Boot-Enable controls.'
                          : 'مشاهده وضعیت زنده سرویس‌ها به همراه امکان استارت، استاپ، ریستارت و فعال‌سازی در بوت.'}
                      </p>
                    </div>

                    {/* Filter and Refresh Controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder={isEn ? 'Filter services (e.g. nginx, ssh)...' : 'جستجوی سرویس (مثلاً nginx)...'}
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                          className={`pl-8 pr-3 py-1 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono w-48 sm:w-56 ${
                            isLightMode
                              ? 'bg-white border-slate-300 text-slate-800'
                              : 'bg-slate-900 border-slate-700 text-white'
                          }`}
                        />
                      </div>

                      {/* State Filter Buttons */}
                      <div className="flex items-center border rounded-lg overflow-hidden text-xs font-mono">
                        {(['all', 'active', 'inactive', 'failed'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setServiceStatusFilter(st)}
                            className={`px-2 py-1 transition cursor-pointer capitalize ${
                              serviceStatusFilter === st
                                ? 'bg-cyan-500 text-slate-950 font-bold'
                                : isLightMode
                                ? 'bg-white text-slate-700 hover:bg-slate-100'
                                : 'bg-slate-900 text-slate-400 hover:bg-white/5'
                            }`}
                          >
                            {st === 'all'
                              ? isEn
                                ? 'All'
                                : 'همه'
                              : st === 'active'
                              ? isEn
                                ? 'Active'
                                : 'فعال'
                              : st === 'inactive'
                              ? isEn
                                ? 'Inactive'
                                : 'متوقف'
                              : isEn
                              ? 'Failed'
                              : 'خطادار'}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWatchdogService(undefined);
                          setIsWatchdogModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition cursor-pointer flex items-center gap-1.5 text-xs font-mono font-medium shadow-sm"
                      >
                        <Shield className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isEn ? 'Service Watchdog & Auto-Recovery' : 'ناظر خودکار و خودترمیمی'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={servicesLoading}
                        onClick={() => loadServices()}
                        className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-mono"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${servicesLoading ? 'animate-spin' : ''}`} />
                        <span>{isEn ? 'Reload' : 'بارگذاری مجدد'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">
                          {isEn ? 'Total Units' : 'کل سرویس‌ها'}
                        </span>
                        <p className="text-lg font-mono font-bold text-slate-200">{services.length}</p>
                      </div>
                      <Layers className="w-5 h-5 text-cyan-400/60" />
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">
                          {isEn ? 'Active / Running' : 'در حال اجرا'}
                        </span>
                        <p className="text-lg font-mono font-bold text-emerald-400">
                          {services.filter(isServiceActive).length}
                        </p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400/60" />
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">
                          {isEn ? 'Inactive / Dead' : 'غیرفعال و متوقف'}
                        </span>
                        <p className="text-lg font-mono font-bold text-slate-400">
                          {services.filter(isServiceInactive).length}
                        </p>
                      </div>
                      <Square className="w-5 h-5 text-slate-500" />
                    </div>

                    <div
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">
                          {isEn ? 'Failed Units' : 'سرویس‌های معیوب'}
                        </span>
                        <p className="text-lg font-mono font-bold text-rose-400">
                          {services.filter(isServiceFailed).length}
                        </p>
                      </div>
                      <AlertTriangle className="w-5 h-5 text-rose-400/60" />
                    </div>
                  </div>

                  {/* Services Table */}
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
                            <th className="p-3">{isEn ? 'Service Name' : 'نام سرویس'}</th>
                            <th className="p-3 w-28">{isEn ? 'Status' : 'وضعیت اجرا'}</th>
                            <th className="p-3 w-24">{isEn ? 'Boot Startup' : 'وضعیت بوت'}</th>
                            <th className="p-3">{isEn ? 'Description' : 'توضیحات سرویس'}</th>
                            <th className="p-3 w-64 text-center">{isEn ? 'Controls' : 'فرمان‌های کنترلی'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {servicesLoading && services.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400">
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                                  <span>{isEn ? 'Fetching live systemctl services over SSH...' : 'در حال دریافت لیست سرویس‌های زنده لینوکس...'}</span>
                                </div>
                              </td>
                            </tr>
                          ) : filteredServices.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-slate-400">
                                {isEn ? 'No services found matching filters.' : 'سرویسی با فیلترهای انتخابی یافت نشد.'}
                              </td>
                            </tr>
                          ) : (
                            filteredServices.map((s) => {
                              const isActive = isServiceActive(s);
                              const isFailed = isServiceFailed(s);
                              const isEnabled = s.unitFileState === 'enabled';
                              const currentAction = serviceActionLoading[s.name];

                              return (
                                <tr
                                  key={s.name}
                                  className={`transition-colors ${
                                    isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'
                                  }`}
                                >
                                  {/* Service Name */}
                                  <td className="p-3 font-bold text-slate-200">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          isFailed
                                            ? 'bg-rose-500 animate-pulse'
                                            : isActive
                                            ? 'bg-emerald-400'
                                            : 'bg-slate-500'
                                        }`}
                                      />
                                      <span className="truncate max-w-xs">{s.name}</span>
                                    </div>
                                  </td>

                                  {/* Active State */}
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 ${
                                        isFailed
                                          ? 'bg-rose-500/20 text-rose-400'
                                          : isActive
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : 'bg-slate-800 text-slate-400'
                                      }`}
                                    >
                                      {s.activeState || s.subState || 'unknown'}
                                    </span>
                                  </td>

                                  {/* Boot Unit File State */}
                                  <td className="p-3">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                        isEnabled
                                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                          : 'bg-slate-800/80 text-slate-400'
                                      }`}
                                    >
                                      {s.unitFileState || 'static'}
                                    </span>
                                  </td>

                                  {/* Description */}
                                  <td className="p-3 text-slate-400 font-sans truncate max-w-sm">
                                    {s.description || '—'}
                                  </td>

                                  {/* Control Buttons (Start, Stop, Restart, Enable/Disable) */}
                                  <td className="p-3">
                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                      {/* Start Button */}
                                      {!isActive && (
                                        <button
                                          type="button"
                                          disabled={!!currentAction}
                                          onClick={() => handleServiceAction(s.name, 'start')}
                                          title={isEn ? 'Start Service' : 'شروع سرویس'}
                                          className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-1 text-[11px]"
                                        >
                                          {currentAction === 'start' ? (
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <Play className="w-3 h-3" />
                                          )}
                                          <span>{isEn ? 'Start' : 'استارت'}</span>
                                        </button>
                                      )}

                                      {/* Stop Button */}
                                      {isActive && (
                                        <button
                                          type="button"
                                          disabled={!!currentAction}
                                          onClick={() => handleServiceAction(s.name, 'stop')}
                                          title={isEn ? 'Stop Service' : 'توقف سرویس'}
                                          className="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-1 text-[11px]"
                                        >
                                          {currentAction === 'stop' ? (
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <Square className="w-3 h-3" />
                                          )}
                                          <span>{isEn ? 'Stop' : 'استاپ'}</span>
                                        </button>
                                      )}

                                      {/* Restart Button */}
                                      <button
                                        type="button"
                                        disabled={!!currentAction}
                                        onClick={() => handleServiceAction(s.name, 'restart')}
                                        title={isEn ? 'Restart Service' : 'راه‌اندازی مجدد'}
                                        className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 border border-cyan-500/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-1 text-[11px]"
                                      >
                                        {currentAction === 'restart' ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <RotateCw className="w-3 h-3" />
                                        )}
                                        <span>{isEn ? 'Restart' : 'ریستارت'}</span>
                                      </button>

                                      {/* Enable Button */}
                                      <button
                                        type="button"
                                        disabled={!!currentAction || isEnabled}
                                        onClick={() => handleServiceAction(s.name, 'enable')}
                                        title={
                                          isEnabled
                                            ? (isEn ? 'Already enabled at boot' : 'در بوت فعال است')
                                            : (isEn ? 'Enable Boot Auto-start' : 'فعال‌سازی در بوت')
                                        }
                                        className={`px-2 py-1 rounded transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] ${
                                          isEnabled
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                            : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30'
                                        }`}
                                      >
                                        {currentAction === 'enable' ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                                        )}
                                        <span>{isEn ? 'Enable' : 'فعال‌سازی'}</span>
                                      </button>

                                      {/* Disable Button */}
                                      <button
                                        type="button"
                                        disabled={!!currentAction || (!isEnabled && s.unitFileState === 'disabled')}
                                        onClick={() => handleServiceAction(s.name, 'disable')}
                                        title={
                                          s.unitFileState === 'disabled'
                                            ? (isEn ? 'Already disabled at boot' : 'در بوت غیرفعال است')
                                            : (isEn ? 'Disable Boot Auto-start' : 'غیرفعال‌سازی در بوت')
                                        }
                                        className={`px-2 py-1 rounded transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 text-[11px] ${
                                          s.unitFileState === 'disabled'
                                            ? 'bg-slate-800 text-slate-500 border border-slate-700'
                                            : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                                        }`}
                                      >
                                        {currentAction === 'disable' ? (
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Ban className="w-3 h-3 text-rose-400" />
                                        )}
                                        <span>{isEn ? 'Disable' : 'غیرفعال‌سازی'}</span>
                                      </button>

                                      {/* Watchdog / Self-Healing Button */}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedWatchdogService(s.name);
                                          setIsWatchdogModalOpen(true);
                                        }}
                                        title={
                                          s.hasWatchdog
                                            ? (isEn ? `Watchdog Active (${s.watchdogStatus || 'monitoring'}) - Click to configure` : `ناظر خودکار فعال (${s.watchdogStatus || 'در حال پایش'}) - کلیک جهت تنظیم`)
                                            : (isEn ? 'Configure Auto-Recovery Watchdog & Anti-Loop Policy' : 'پیکربندی ناظر خودکار، استارت مجدد و محافظت ضدلوپ')
                                        }
                                        className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 text-[11px] ${
                                          s.hasWatchdog
                                            ? s.watchdogStatus === 'anti_loop_halted'
                                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                                            : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                                        }`}
                                      >
                                        <Shield className={`w-3 h-3 ${s.hasWatchdog ? 'text-cyan-400' : 'text-slate-400'}`} />
                                        <span>{s.hasWatchdog ? (isEn ? 'Watchdog: ON' : 'ناظر: فعال') : isEn ? 'Watchdog' : 'ناظر خودکار'}</span>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: USERS & SESSIONS */}
              {activeTab === 'users' && (
                <LinuxUsersTab
                  server={server}
                  ephemeralPassword={ephemeralPassword}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
              )}

              {/* TAB 6: SYSTEM & PROXY / SSH CONFIG */}
              {activeTab === 'sysconfig' && (
                <LinuxSysConfigTab
                  server={server}
                  ephemeralPassword={ephemeralPassword}
                  isLightMode={isLightMode}
                  isEn={isEn}
                  onSshPortChanged={(newPort) => {
                    if (server) server.ssh_port = newPort;
                  }}
                />
              )}

              {/* TAB: DIRECTORY POLICIES & BACKUPS */}
              {activeTab === 'directories' && server && (
                <div className="space-y-4">
                  <LinuxDirectoryPolicyTab
                    server={server}
                    ephemeralPassword={ephemeralPassword}
                    isLightMode={isLightMode}
                    isEn={isEn}
                  />
                </div>
              )}

              {/* TAB 7: LINUX SYSTEM LOGS */}
              {activeTab === 'logs' && (
                <LinuxLogsTab
                  server={server}
                  ephemeralPassword={ephemeralPassword}
                  isLightMode={isLightMode}
                  isEn={isEn}
                />
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

  return (
    <>
      {createPortal(modalNode, document.body)}
      {selectedInterfaceForConfig && (
        <LinuxNetworkConfigModal
          key={selectedInterfaceForConfig.name}
          isOpen={true}
          server={server}
          iface={selectedInterfaceForConfig}
          ephemeralPassword={ephemeralPassword}
          onClose={() => setSelectedInterfaceForConfig(null)}
          onMinimize={() => setSelectedInterfaceForConfig(null)}
          onSuccess={() => {
            setSelectedInterfaceForConfig(null);
            fetchMetrics();
            loadSysConfig();
          }}
          isLightMode={isLightMode}
          isEn={isEn}
        />
      )}
      {showMountModal && (
        <LinuxMountModal
          isOpen={true}
          server={server}
          ephemeralPassword={ephemeralPassword}
          onClose={() => setShowMountModal(false)}
          onMinimize={() => setShowMountModal(false)}
          onSuccess={() => {
            setShowMountModal(false);
            fetchMetrics();
          }}
          isLightMode={isLightMode}
          isEn={isEn}
        />
      )}
      {isWatchdogModalOpen && server && (
        <LinuxServiceWatchdogModal
          isOpen={true}
          server={server}
          services={services}
          initialServiceName={selectedWatchdogService}
          ephemeralPassword={ephemeralPassword}
          onClose={handleCloseWatchdog}
          onMinimize={handleMinimizeWatchdog}
          isLightMode={isLightMode}
          isEn={isEn}
          onRefreshServices={loadServices}
        />
      )}
      <ProcessActionModals
        contextMenu={contextMenu}
        onCloseContextMenu={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        onKillProcess={handleKillProcess}
        onOpenRenice={handleOpenRenice}
        reniceDialog={reniceDialog}
        setReniceDialog={setReniceDialog}
        onApplyRenice={handleApplyRenice}
        isEn={isEn}
        isLightMode={isLightMode}
      />
    </>
  );
};
