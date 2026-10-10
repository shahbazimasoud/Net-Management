import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Server,
  Cpu,
  Database,
  Layers,
  Globe,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HardDrive,
  ShieldCheck,
  Terminal,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  X,
  Minus,
  Sliders,
  Radio,
  Zap,
  Info
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import {
  fetchPanelServices,
  executePanelServiceAction,
  fetchPanelServiceLogs,
  PanelServiceDto,
  PanelServerMetricsDto,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface PanelServicesViewProps {
  isLightMode?: boolean;
}

export const PanelServicesView: React.FC<PanelServicesViewProps> = ({
  isLightMode = false,
}) => {
  const { isEn } = useLanguage();

  const [services, setServices] = useState<PanelServiceDto[]>([]);
  const [metrics, setMetrics] = useState<PanelServerMetricsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(10); // seconds, 0 = off
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');

  // Confirmation Modal state for Stop / Restart actions
  const [confirmModal, setConfirmModal] = useState<{
    service: PanelServiceDto;
    action: 'start' | 'stop' | 'restart' | 'reload';
  } | null>(null);

  // Log Viewer Modal state
  const [logModal, setLogModal] = useState<{
    service: PanelServiceDto;
    logs: string[];
    loading: boolean;
    isMaximized: boolean;
    isMinimized: boolean;
    filterText: string;
    autoRefresh: boolean;
  } | null>(null);

  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);

  // Fetch Services & Metrics
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetchPanelServices();
      if (res.success) {
        setServices(res.services || []);
        setMetrics(res.metrics || null);
        setLastUpdated(new Date().toLocaleTimeString(isEn ? 'en-US' : 'fa-IR'));
      } else if (!isSilent) {
        setActionFeedback({
          type: 'error',
          message: res.error || (isEn ? 'Failed to fetch host services' : 'خطا در دریافت لیست سرویس‌ها'),
        });
      }
    } catch (err: any) {
      if (!isSilent) {
        setActionFeedback({
          type: 'error',
          message: err?.message || (isEn ? 'Connection error' : 'خطا در ارتباط با سرور'),
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isEn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto Refresh Interval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      loadData(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, loadData]);

  // Handle Service Action Execution
  const handleExecuteAction = async (service: PanelServiceDto, action: 'start' | 'stop' | 'restart' | 'reload') => {
    setConfirmModal(null);
    setActionLoadingId(`${service.id}-${action}`);
    setActionFeedback(null);

    try {
      const res = await executePanelServiceAction(service.id, action);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || (isEn ? `Action "${action}" completed.` : `عملیات «${action}» با موفقیت انجام شد.`),
        });
        // Reload services to reflect new status
        await loadData(true);
      } else {
        setActionFeedback({
          type: 'error',
          message: res.message || res.error || (isEn ? 'Action execution failed' : 'خطا در اجرای عملیات سرویس'),
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err?.message || (isEn ? 'Network error' : 'خطای شبکه در ارتباط با سرور'),
      });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => {
        setActionFeedback(null);
      }, 5000);
    }
  };

  // Open Log Modal
  const handleOpenLogs = async (service: PanelServiceDto) => {
    setLogModal({
      service,
      logs: [],
      loading: true,
      isMaximized: false,
      isMinimized: false,
      filterText: '',
      autoRefresh: true,
    });

    try {
      const res = await fetchPanelServiceLogs(service.id, 100);
      setLogModal((prev) => (prev ? { ...prev, logs: res.logs || [], loading: false } : null));
    } catch (err: any) {
      setLogModal((prev) =>
        prev
          ? {
              ...prev,
              logs: [`Error fetching logs: ${err?.message || 'Network error'}`],
              loading: false,
            }
          : null
      );
    }
  };

  // Refresh logs in modal
  const handleRefreshLogs = async () => {
    if (!logModal) return;
    setLogModal((prev) => (prev ? { ...prev, loading: true } : null));
    try {
      const res = await fetchPanelServiceLogs(logModal.service.id, 100);
      setLogModal((prev) => (prev ? { ...prev, logs: res.logs || [], loading: false } : null));
    } catch (err: any) {
      setLogModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  // Copy logs to clipboard
  const handleCopyLogs = () => {
    if (!logModal) return;
    const text = logModal.logs.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  // Auto-refresh logs inside modal
  useEffect(() => {
    if (!logModal || !logModal.autoRefresh || logModal.isMinimized) return;
    const interval = setInterval(() => {
      fetchPanelServiceLogs(logModal.service.id, 100).then((res) => {
        setLogModal((prev) => (prev ? { ...prev, logs: res.logs || [] } : null));
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [logModal?.service.id, logModal?.autoRefresh, logModal?.isMinimized]);

  // Filtered Services list
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'running' && s.status === 'running') ||
        (statusFilter === 'stopped' && s.status === 'stopped');

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.name_fa.includes(q) ||
        s.serviceName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.description_fa.includes(q) ||
        s.ports.some((p) => String(p).includes(q));

      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [services, selectedCategory, statusFilter, searchQuery]);

  // Summary counts
  const summary = useMemo(() => {
    const total = services.length;
    const running = services.filter((s) => s.status === 'running').length;
    const stopped = services.filter((s) => s.status === 'stopped').length;
    const failed = services.filter((s) => s.status === 'failed').length;
    return { total, running, stopped, failed };
  }, [services]);

  // Categories list
  const categories = [
    { id: 'all', labelEn: 'All Services', labelFa: 'همه سرویس‌ها', icon: Layers },
    { id: 'frontend', labelEn: 'Frontend & Web', labelFa: 'فرانت‌اند و وب‌سرور', icon: Globe },
    { id: 'backend', labelEn: 'Backend & Discovery', labelFa: 'بک‌اند و موتور کاوش', icon: Cpu },
    { id: 'database', labelEn: 'Database Engine', labelFa: 'موتور پایگاه داده', icon: Database },
    { id: 'system', labelEn: 'System Daemons', labelFa: 'سرویس‌های سیستم', icon: Server },
  ];

  return (
    <div
      className={`min-h-full p-4 lg:p-8 space-y-6 transition-colors duration-200 pb-16 ${
        isLightMode ? 'text-slate-900' : 'text-slate-100'
      }`}
    >
      {/* Top Banner & Header */}
      <div
        className={`p-6 rounded-2xl border backdrop-blur-xl shadow-xl transition relative overflow-hidden ${
          isLightMode
            ? 'bg-white/90 border-slate-200 shadow-slate-200/50 text-slate-800'
            : 'bg-slate-950/70 border-white/10 shadow-black/40 text-slate-100'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 shrink-0">
              <Activity className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {isEn ? 'Panel Host Services Manager' : 'مدیریت و کنترل سرویس‌های سرور پنل'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {isEn ? 'Host System' : 'سیستم میزبان'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Real-time telemetry and process lifecycle management (Start, Stop, Restart, Reload) for panel web services, engines, and database.'
                  : 'پایش لحظه‌ای تلمتری، مدیریت چرخه حیات پروسس‌ها (استارت، استاپ، ریست، ریلود) و مشاهده لاگ‌های سرویس‌های فعال پنل روی سرور.'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto justify-end">
            {/* Auto refresh dropdown */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>
                {isEn ? 'Auto-Refresh:' : 'به‌روزرسانی خودکار:'}
              </span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className={`px-2 py-1.5 rounded-lg text-xs border focus:outline-none cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 border-slate-300 text-slate-800'
                    : 'bg-slate-900 border-white/10 text-white'
                }`}
              >
                <option value={0}>{isEn ? 'Off (Manual)' : 'غیرفعال (دستی)'}</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={30}>30s</option>
              </select>
            </div>

            {/* Manual Refresh button */}
            <button
              type="button"
              onClick={() => loadData(false)}
              disabled={refreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition shadow-sm ${
                isLightMode
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>{isEn ? 'Refresh Status' : 'بروزرسانی وضعیت'}</span>
            </button>
          </div>
        </div>

        {/* System Host Metrics Bar */}
        {metrics && (
          <div className={`mt-5 pt-4 border-t grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs ${
            isLightMode ? 'border-slate-200' : 'border-white/10'
          }`}>
            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'Host Machine' : 'نام سرور میزبان'}
              </span>
              <span className="font-semibold font-mono truncate block" title={metrics.hostname}>
                {metrics.hostname}
              </span>
            </div>

            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'OS Kernel' : 'کرنل سیستم‌عامل'}
              </span>
              <span className="font-semibold font-mono truncate block" title={metrics.kernelVersion}>
                {metrics.platform} ({metrics.osRelease})
              </span>
            </div>

            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'CPU Load' : 'بار پردازنده'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold font-mono text-indigo-400">
                  {metrics.cpuLoadPercent}%
                </span>
                <span className={`text-[10px] ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  ({metrics.cpuCores} {isEn ? 'Cores' : 'هسته'})
                </span>
              </div>
            </div>

            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'RAM Usage' : 'مصرف حافظه رم'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold font-mono text-cyan-400">
                  {metrics.usedMemoryMb} / {metrics.totalMemoryMb} MB
                </span>
              </div>
            </div>

            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'System Uptime' : 'مدت زمان روشن بودن'}
              </span>
              <span className="font-semibold font-mono">
                {Math.floor(metrics.uptimeSeconds / 3600)}h {Math.floor((metrics.uptimeSeconds % 3600) / 60)}m
              </span>
            </div>

            <div>
              <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEn ? 'Last Sync' : 'آخرین همگام‌سازی'}
              </span>
              <span className="font-semibold font-mono text-emerald-400">
                {lastUpdated || (isEn ? 'Connecting...' : 'در حال اتصال...')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Feedback Notification */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-lg transition-all ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : actionFeedback.type === 'error'
              ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
              : 'bg-indigo-950/70 border-indigo-500/40 text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : actionFeedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs hover:opacity-75 cursor-pointer px-2 py-0.5"
          >
            ×
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div
          className={`p-4 rounded-xl border backdrop-blur-md flex items-center justify-between ${
            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950/50 border-white/10 text-white'
          }`}
        >
          <div>
            <span className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Total Managed' : 'کل سرویس‌ها'}
            </span>
            <div className="text-xl font-bold font-mono mt-0.5">{summary.total}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border backdrop-blur-md flex items-center justify-between ${
            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950/50 border-white/10 text-white'
          }`}
        >
          <div>
            <span className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Active & Running' : 'فعال و در حال اجرا'}
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">{summary.running}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border backdrop-blur-md flex items-center justify-between ${
            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950/50 border-white/10 text-white'
          }`}
        >
          <div>
            <span className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Stopped / Standby' : 'متوقف / آماده‌باش'}
            </span>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">{summary.stopped}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Square className="w-4 h-4" />
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border backdrop-blur-md flex items-center justify-between ${
            isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950/50 border-white/10 text-white'
          }`}
        >
          <div>
            <span className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Errors / Failed' : 'خطادار / متوقف‌شده'}
            </span>
            <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">{summary.failed}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((c) => {
            const Icon = c.icon;
            const isSelected = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap border ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                    : isLightMode
                    ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                    : 'bg-slate-900/60 hover:bg-slate-800 border-white/10 text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{isEn ? c.labelEn : c.labelFa}</span>
              </button>
            );
          })}
        </div>

        {/* Search input & status filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search service, port, PID...' : 'جستجوی سرویس، پورت، پروسس...'}
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border focus:outline-none focus:border-indigo-500 transition ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
                  : 'bg-slate-900 border-white/10 text-white placeholder:text-slate-500'
              }`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`px-2.5 py-1.5 rounded-xl text-xs border focus:outline-none cursor-pointer ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-900 border-white/10 text-white'
            }`}
          >
            <option value="all">{isEn ? 'All Status' : 'همه وضعیت‌ها'}</option>
            <option value="running">{isEn ? 'Running Only' : 'فقط فعال'}</option>
            <option value="stopped">{isEn ? 'Stopped Only' : 'فقط متوقف'}</option>
          </select>
        </div>
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="p-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
          <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {isEn ? 'Scanning host services and telemetry...' : 'در حال اسکن و دریافت اطلاعات سرویس‌های هاست...'}
          </p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div
          className={`p-12 rounded-2xl border text-center space-y-2 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-950/40 border-white/10 text-slate-400'
          }`}
        >
          <Server className="w-10 h-10 mx-auto text-slate-500 opacity-60" />
          <p className="text-sm font-semibold">
            {isEn ? 'No matching host services found' : 'هیچ سرویسی با این مشخصات یافت نشد'}
          </p>
          <p className="text-xs">
            {isEn ? 'Try adjusting your search query or filter category.' : 'لطفاً فیلتر جستجو یا دسته‌بندی را تغییر دهید.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServices.map((service) => {
            const isRunning = service.status === 'running';
            const isFailed = service.status === 'failed';
            const isActionRunning = actionLoadingId?.startsWith(service.id);

            return (
              <div
                key={service.id}
                className={`p-5 rounded-2xl border transition-all flex flex-col justify-between shadow-lg relative ${
                  isLightMode
                    ? 'bg-white hover:border-indigo-400 border-slate-200 shadow-slate-100 text-slate-800'
                    : 'bg-slate-950/60 hover:border-indigo-500/40 border-white/10 shadow-black/30 text-white'
                }`}
              >
                <div>
                  {/* Service Header: Name, Category, Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2.5 rounded-xl border shrink-0 ${
                          isRunning
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/20'
                            : isFailed
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-sm shadow-rose-500/20'
                            : 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                        }`}
                      >
                        {service.category === 'frontend' ? (
                          <Globe className="w-5 h-5" />
                        ) : service.category === 'backend' ? (
                          <Cpu className="w-5 h-5" />
                        ) : service.category === 'database' ? (
                          <Database className="w-5 h-5" />
                        ) : (
                          <Server className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold tracking-tight">
                            {isEn ? service.name : service.name_fa}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono text-indigo-400 font-semibold">
                            {service.serviceName}
                          </span>
                          <span className="text-slate-500 text-[10px]">•</span>
                          <span
                            className={`text-[10px] uppercase font-mono px-1.5 py-0.2 rounded border ${
                              isLightMode
                                ? 'bg-slate-100 border-slate-200 text-slate-600'
                                : 'bg-white/5 border-white/10 text-slate-400'
                            }`}
                          >
                            {service.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border shrink-0 ${
                        isRunning
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : isFailed
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                          : 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isRunning
                            ? 'bg-emerald-400 animate-pulse'
                            : isFailed
                            ? 'bg-rose-400'
                            : 'bg-slate-400'
                        }`}
                      />
                      <span>
                        {isRunning
                          ? isEn
                            ? 'Running'
                            : 'در حال اجرا'
                          : isFailed
                          ? isEn
                            ? 'Failed'
                            : 'خطادار'
                          : isEn
                          ? 'Stopped'
                          : 'متوقف'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className={`text-xs mt-3 line-clamp-2 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {isEn ? service.description : service.description_fa}
                  </p>

                  {/* Telemetry Metrics Bar */}
                  <div
                    className={`mt-4 p-3 rounded-xl border grid grid-cols-4 gap-2 text-center text-xs ${
                      isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-white/5'
                    }`}
                  >
                    <div>
                      <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        PID
                      </span>
                      <span className="font-bold font-mono text-[11px]">
                        {service.pids.length > 0 ? service.pids[0] : isEn ? 'N/A' : 'ندارد'}
                      </span>
                    </div>

                    <div>
                      <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isEn ? 'CPU' : 'پردازنده'}
                      </span>
                      <span className="font-bold font-mono text-[11px] text-indigo-400">
                        {service.cpuPercent}%
                      </span>
                    </div>

                    <div>
                      <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isEn ? 'Memory' : 'رم'}
                      </span>
                      <span className="font-bold font-mono text-[11px] text-cyan-400">
                        {service.memoryMb} MB
                      </span>
                    </div>

                    <div>
                      <span className={`text-[10px] uppercase font-mono block ${isLightMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isEn ? 'Port' : 'پورت'}
                      </span>
                      <span
                        className={`font-bold font-mono text-[11px] ${
                          service.portsActive ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {service.ports.length > 0 ? service.ports.join(', ') : isEn ? 'Internal' : 'داخلی'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Controls Bar */}
                <div className={`mt-5 pt-3.5 border-t flex items-center justify-between gap-2 flex-wrap ${
                  isLightMode ? 'border-slate-200' : 'border-white/10'
                }`}>
                  {/* Left: View Logs */}
                  <button
                    type="button"
                    onClick={() => handleOpenLogs(service)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      isLightMode
                        ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                        : 'bg-slate-900 hover:bg-slate-800 border-white/15 text-slate-300'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isEn ? 'Service Logs' : 'لاگ‌های سرویس'}</span>
                  </button>

                  {/* Right: Lifecycle Actions (Start, Restart, Stop, Reload) */}
                  <div className="flex items-center gap-1.5">
                    {/* Start Button */}
                    {!isRunning && service.canStart && (
                      <button
                        type="button"
                        disabled={Boolean(isActionRunning)}
                        onClick={() => handleExecuteAction(service, 'start')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isEn ? 'Start' : 'استارت'}</span>
                      </button>
                    )}

                    {/* Restart Button */}
                    {service.canRestart && (
                      <button
                        type="button"
                        disabled={Boolean(isActionRunning)}
                        onClick={() =>
                          setConfirmModal({
                            service,
                            action: 'restart',
                          })
                        }
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isActionRunning ? 'animate-spin' : ''}`} />
                        <span>{isEn ? 'Restart' : 'ری‌استارت'}</span>
                      </button>
                    )}

                    {/* Reload Button */}
                    {isRunning && service.canReload && (
                      <button
                        type="button"
                        disabled={Boolean(isActionRunning)}
                        onClick={() => handleExecuteAction(service, 'reload')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition disabled:opacity-50 ${
                          isLightMode
                            ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400'
                        }`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{isEn ? 'Reload' : 'ریلود'}</span>
                      </button>
                    )}

                    {/* Stop Button */}
                    {isRunning && service.canStop && (
                      <button
                        type="button"
                        disabled={Boolean(isActionRunning)}
                        onClick={() =>
                          setConfirmModal({
                            service,
                            action: 'stop',
                          })
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-400 text-xs font-bold cursor-pointer transition shadow-sm disabled:opacity-50"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>{isEn ? 'Stop' : 'استاپ'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Stop/Restart */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
          <div
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
              isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-white/20 text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl ${
                  confirmModal.action === 'stop'
                    ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-indigo-500/20 text-indigo-400'
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold">
                  {confirmModal.action === 'stop'
                    ? isEn
                      ? `Stop Service: ${confirmModal.service.name}?`
                      : `توقف سرویس: ${confirmModal.service.name_fa}؟`
                    : isEn
                    ? `Restart Service: ${confirmModal.service.name}?`
                    : `ری‌استارت سرویس: ${confirmModal.service.name_fa}؟`}
                </h3>
                <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {confirmModal.action === 'stop'
                    ? isEn
                      ? 'Stopping this service may temporarily interrupt connected panel operations or traffic.'
                      : 'توقف این سرویس ممکن است موقتاً عملکردهای وابسته به آن در پنل یا انتقال ترافیک را متوقف نماید.'
                    : isEn
                    ? 'The service will be restarted and its process memory refreshed.'
                    : 'سرویس متوقف و مجدداً راه‌اندازی شده و پروسس‌های آن بازنشانی خواهند شد.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={() => handleExecuteAction(confirmModal.service, confirmModal.action)}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer transition ${
                  confirmModal.action === 'stop'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmModal.action === 'stop'
                  ? isEn
                    ? 'Yes, Stop Service'
                    : 'بله، سرویس متوقف شود'
                  : isEn
                  ? 'Yes, Restart'
                  : 'بله، ری‌استارت شود'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Viewer Modal (strictly follows all 5 Universal Modal Rules) */}
      {logModal && !logModal.isMinimized && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[9999] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
          <div
            className={`w-full flex flex-col rounded-2xl border shadow-2xl transition-all duration-200 overflow-hidden ${
              logModal.isMaximized ? 'h-full max-h-full' : 'max-h-[90vh] h-[640px] max-w-4xl'
            } ${isLightMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-950 border-indigo-500/30 text-white'}`}
          >
            {/* Header: Title and Universal Triple Control Buttons (Close, Minimize, Maximize) */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold font-mono">
                      {isEn
                        ? `Live Logs: ${logModal.service.name}`
                        : `لاگ‌های زنده: ${logModal.service.name_fa}`}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {logModal.service.status}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {logModal.service.serviceName}
                  </span>
                </div>
              </div>

              {/* Triple Header Control Buttons */}
              <div className="flex items-center gap-1.5">
                {/* Minimize Button */}
                <button
                  type="button"
                  title={isEn ? 'Minimize' : 'کمینه‌سازی'}
                  onClick={() => setLogModal({ ...logModal, isMinimized: true })}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition"
                >
                  <Minus className="w-4 h-4" />
                </button>

                {/* Maximize / Restore Button */}
                <button
                  type="button"
                  title={logModal.isMaximized ? (isEn ? 'Restore' : 'اندازه عادی') : isEn ? 'Maximize' : 'تمام‌صفحه'}
                  onClick={() => setLogModal({ ...logModal, isMaximized: !logModal.isMaximized })}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition"
                >
                  {logModal.isMaximized ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  title={isEn ? 'Close' : 'بستن'}
                  onClick={() => setLogModal(null)}
                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Toolbar: Filter, Copy, Refresh */}
            <div className="flex items-center justify-between gap-2 px-5 py-2.5 bg-slate-900/60 border-b border-white/5 text-xs shrink-0 flex-wrap">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={logModal.filterText}
                  onChange={(e) => setLogModal({ ...logModal, filterText: e.target.value })}
                  placeholder={isEn ? 'Filter logs output...' : 'فیلتر کردن خروجی لاگ...'}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={logModal.autoRefresh}
                    onChange={(e) => setLogModal({ ...logModal, autoRefresh: e.target.checked })}
                    className="rounded border-white/20"
                  />
                  <span>{isEn ? 'Auto-tail' : 'اسکرول و استریم خودکار'}</span>
                </label>

                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono cursor-pointer transition"
                >
                  {copiedLogs ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-300" />
                      <span>{isEn ? 'Copy Logs' : 'کپی لاگ‌ها'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRefreshLogs}
                  disabled={logModal.loading}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs cursor-pointer transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${logModal.loading ? 'animate-spin text-indigo-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Terminal Log Console Body */}
            <div className="flex-1 p-4 bg-black/90 font-mono text-xs overflow-y-auto space-y-1 select-text">
              {logModal.loading && logModal.logs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                  <span>{isEn ? 'Fetching live service logs...' : 'در حال خواندن لاگ‌های سرویس...'}</span>
                </div>
              ) : (
                logModal.logs
                  .filter((line) => !logModal.filterText || line.toLowerCase().includes(logModal.filterText.toLowerCase()))
                  .map((line, idx) => {
                    const isErr = line.includes('error') || line.includes('ERROR') || line.includes('Failed') || line.includes('fail');
                    const isWarn = line.includes('warn') || line.includes('WARN');
                    const isInfo = line.includes('notice') || line.includes('info') || line.includes('OK');

                    return (
                      <div
                        key={idx}
                        className={`leading-relaxed whitespace-pre-wrap break-all ${
                          isErr
                            ? 'text-rose-400'
                            : isWarn
                            ? 'text-amber-300'
                            : isInfo
                            ? 'text-emerald-300'
                            : 'text-slate-300'
                        }`}
                      >
                        <span className="text-slate-600 select-none mr-3 text-[10px]">
                          {String(idx + 1).padStart(3, '0')}
                        </span>
                        {line}
                      </div>
                    );
                  })
              )}
            </div>

            {/* Footer status */}
            <div className="px-4 py-2 border-t border-white/10 bg-slate-900/90 text-[11px] font-mono text-slate-400 flex items-center justify-between shrink-0">
              <span>
                {isEn ? `Total lines: ${logModal.logs.length}` : `تعداد خطوط: ${logModal.logs.length}`}
              </span>
              <span>
                {logModal.service.logFile || `/var/log/${logModal.service.serviceName}`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Minimized Dock Tile if minimized */}
      {logModal && logModal.isMinimized && (
        <div className="fixed bottom-10 right-6 z-[9999] shadow-2xl">
          <button
            type="button"
            onClick={() => setLogModal({ ...logModal, isMinimized: false })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-indigo-500 text-white text-xs font-mono font-bold cursor-pointer hover:bg-slate-800 transition"
          >
            <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span>{isEn ? `Logs: ${logModal.service.name}` : `لاگ: ${logModal.service.name_fa}`}</span>
          </button>
        </div>
      )}
    </div>
  );
};
