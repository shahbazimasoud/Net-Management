import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FileText,
  RefreshCw,
  Search,
  Filter,
  Download,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Terminal,
  Trash2,
  Folder,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldAlert,
  Server,
  Activity,
  Layers,
  FileCode,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxLogCategory,
  LinuxLogEntry,
  LinuxSystemLogsResponse,
  LinuxLogFileMetadata,
} from '../../types';
import { fetchLinuxServerLogs, truncateLinuxServerLog } from '../../services/api';
import { LINUX_LOG_CATEGORIES } from './logs/linuxLogCategories';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

export interface LinuxLogsTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxLogsTab: React.FC<LinuxLogsTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<LinuxLogCategory>('journal');
  const [logsResponse, setLogsResponse] = useState<LinuxSystemLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [lines, setLines] = useState<number>(200);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'errors' | 'warnings' | 'info'>('all');
  const [journalPriority, setJournalPriority] = useState<string>('');
  const [customPath, setCustomPath] = useState<string>('/var/log/');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'table' | 'terminal'>('table');
  const [showCategoryInfoCard, setShowCategoryInfoCard] = useState<boolean>(true);
  const [showAvailableFilesDrawer, setShowAvailableFilesDrawer] = useState<boolean>(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Feedback states
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showTruncateModal, setShowTruncateModal] = useState(false);
  const [truncateLoading, setTruncateLoading] = useState(false);

  // Active Category Details
  const activeCategoryInfo = useMemo(() => {
    return (
      LINUX_LOG_CATEGORIES.find((c) => c.id === selectedCategory) ||
      LINUX_LOG_CATEGORIES[0]
    );
  }, [selectedCategory]);

  // Load logs function
  const loadLogs = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      setError(null);

      try {
        const resp = await fetchLinuxServerLogs(
          server.id,
          {
            category: selectedCategory,
            lines,
            grepFilter: searchQuery.trim(),
            customPath: selectedCategory === 'custom' ? customPath : undefined,
            priority: selectedCategory === 'journal' ? journalPriority : undefined,
          },
          ephemeralPassword
        );

        if (!resp.success && resp.error) {
          setError(resp.error);
        } else {
          setLogsResponse(resp);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch Linux system logs');
      } finally {
        if (!isSilent) setLoading(false);
      }
    },
    [server.id, selectedCategory, lines, searchQuery, customPath, journalPriority, ephemeralPassword]
  );

  // Fetch when category, lines, or priority changes
  useEffect(() => {
    loadLogs();
  }, [selectedCategory, lines, journalPriority]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      loadLogs(true);
    }, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, loadLogs]);

  // Filtered log entries based on client-side severity and search
  const filteredLogs = useMemo(() => {
    if (!logsResponse?.logs) return [];
    return logsResponse.logs.filter((log) => {
      // Level filter
      if (levelFilter === 'errors') {
        if (
          log.level !== 'error' &&
          log.level !== 'critical' &&
          log.level !== 'alert' &&
          log.level !== 'emergency'
        ) {
          return false;
        }
      } else if (levelFilter === 'warnings') {
        if (log.level !== 'warning') return false;
      } else if (levelFilter === 'info') {
        if (log.level === 'error' || log.level === 'critical' || log.level === 'warning') {
          return false;
        }
      }

      // Client search text (if grep was already applied or user filters further)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          (log.service && log.service.toLowerCase().includes(q)) ||
          (log.hostname && log.hostname.toLowerCase().includes(q)) ||
          (log.timestamp && log.timestamp.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [logsResponse, levelFilter, searchQuery]);

  // Copy logs to clipboard
  const handleCopyLogs = () => {
    const text = filteredLogs.map((l) => l.raw).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download logs as .log file
  const handleDownloadLogs = () => {
    const text = filteredLogs.map((l) => l.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${server.name || 'linux-server'}-${selectedCategory}-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, '-')}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Truncate / Clear log file
  const handleTruncateLog = async () => {
    if (!logsResponse?.filePath || logsResponse.filePath === 'systemd-journal') return;
    setTruncateLoading(true);
    try {
      const res = await truncateLinuxServerLog(server.id, logsResponse.filePath, ephemeralPassword);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: isEn
            ? `Log file ${logsResponse.filePath} truncated successfully.`
            : `فایل لاگ ${logsResponse.filePath} با موفقیت پاکسازی شد.`,
        });
        setShowTruncateModal(false);
        loadLogs();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || (isEn ? 'Failed to truncate log file' : 'خطا در پاکسازی لاگ'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || (isEn ? 'Failed to truncate log file' : 'خطا در پاکسازی لاگ'),
      });
    } finally {
      setTruncateLoading(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  return (
    <div className="space-y-4">
      {/* ======================================================== */}
      {/* 1. LOG CATEGORY SELECTION PILLS */}
      {/* ======================================================== */}
      <div
        className={`p-3 rounded-2xl border transition-all ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold tracking-tight">
                {isEn ? 'Linux System & Service Logs' : 'لاگ‌های سیستم و سرویس‌های لینوکس'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {isEn
                  ? 'Select category to inspect live logs & telemetry'
                  : 'دسته لاگ موردنظر را جهت مشاهده و تحلیل زنده انتخاب کنید'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Category Detailed Info Card */}
            <button
              type="button"
              onClick={() => setShowCategoryInfoCard(!showCategoryInfoCard)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                showCategoryInfoCard
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                  : isLightMode
                  ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-400 hover:bg-white/5'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>{isEn ? 'Log Info Card' : 'کارت توضیحات لاگ'}</span>
              {showCategoryInfoCard ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {/* Quick Available Log Files Drawer Toggle */}
            {logsResponse?.availableLogFiles && logsResponse.availableLogFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAvailableFilesDrawer(!showAvailableFilesDrawer)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                  showAvailableFilesDrawer
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                    : isLightMode
                    ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-400 hover:bg-white/5'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {isEn ? 'Detected Files' : 'فایل‌های شناسایی‌شده'} (
                  {logsResponse.availableLogFiles.length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Categories scrollable pill list */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
          {LINUX_LOG_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <div key={cat.id} className="relative flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap border ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md font-bold'
                      : isLightMode
                      ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{isEn ? cat.name_en.split('(')[0].trim() : cat.name.split('(')[0].trim()}</span>
                </button>

                {/* Info Tooltip Icon for each category */}
                <div className="ml-1">
                  <FieldInfoTooltip
                    isEn={isEn}
                    isLightMode={isLightMode}
                    whatIsIt={isEn ? cat.whatSitsHere_en : cat.whatSitsHere}
                    whyNeeded={isEn ? cat.whyNeeded_en : cat.whyNeeded}
                    practicalExample={
                      (isEn ? cat.practicalExamples_en : cat.practicalExamples).slice(0, 2).join('\n')
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. COMPREHENSIVE CATEGORY INFO CARD (Mandatory Requirement) */}
      {/* ======================================================== */}
      {showCategoryInfoCard && (
        <div
          className={`p-4 rounded-2xl border transition-all relative ${
            isLightMode
              ? 'bg-gradient-to-br from-cyan-50/70 to-slate-50 border-cyan-200/80 text-slate-800'
              : 'bg-gradient-to-br from-cyan-950/20 via-slate-900/60 to-slate-950 border-cyan-500/30 text-slate-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                <Info className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-cyan-400">
                  {isEn ? activeCategoryInfo.name_en : activeCategoryInfo.name}
                </h4>
                <p className="text-[11px] text-slate-400">
                  {isEn ? activeCategoryInfo.shortDesc_en : activeCategoryInfo.shortDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700/60 text-slate-300">
                {isEn ? 'Default Sources:' : 'منابع پیش‌فرض:'}{' '}
                <strong className="text-cyan-400">
                  {activeCategoryInfo.defaultPaths.join(', ')}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setShowCategoryInfoCard(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded transition"
                title={isEn ? 'Hide info card' : 'مخفی‌سازی'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Section 1: What sits here */}
            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold mb-1">
                <FileCode className="w-3.5 h-3.5" />
                <span>{isEn ? 'What logs sit in this section?' : 'چه لاگ‌هایی در این قسمت می‌نشیند؟'}</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {isEn ? activeCategoryInfo.whatSitsHere_en : activeCategoryInfo.whatSitsHere}
              </p>
            </div>

            {/* Section 2: Why it is needed */}
            <div
              className={`p-3 rounded-xl border ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
                <Activity className="w-3.5 h-3.5" />
                <span>{isEn ? 'Why is it needed & monitored?' : 'چرا لازم است و چه کاربردی دارد؟'}</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {isEn ? activeCategoryInfo.whyNeeded_en : activeCategoryInfo.whyNeeded}
              </p>
            </div>
          </div>

          {/* Section 3: Practical Examples */}
          <div
            className={`mt-2.5 p-2.5 rounded-xl border font-mono text-[11px] ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                <span>{isEn ? 'Realistic Log Examples & Patterns:' : 'نمونه خطوط واقعی لاگ در این فایل:'}</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {isEn ? 'Commands: ' : 'دستورات: '}{activeCategoryInfo.commandsUsed.join(' | ')}
              </span>
            </div>
            <div className="space-y-0.5 text-slate-300 overflow-x-auto">
              {(isEn ? activeCategoryInfo.practicalExamples_en : activeCategoryInfo.practicalExamples).map(
                (ex, i) => (
                  <div key={i} className="truncate hover:text-white transition">
                    <span className="text-slate-500 select-none mr-2 font-mono">[{i + 1}]</span>
                    {ex}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. DETECTED LOG FILES DRAWER (Quick Switcher) */}
      {/* ======================================================== */}
      {showAvailableFilesDrawer && logsResponse?.availableLogFiles && (
        <div
          className={`p-3.5 rounded-2xl border ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <Folder className="w-4 h-4" />
              <span>
                {isEn
                  ? 'All Log Files Discovered on Remote Host (/var/log/)'
                  : 'فهرست تمام فایل‌های لاگ شناسایی‌شده در سرور ریموت (/var/log/)'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setShowAvailableFilesDrawer(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {logsResponse.availableLogFiles.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSelectedCategory('custom');
                  setCustomPath(f.path);
                  setShowAvailableFilesDrawer(false);
                }}
                className={`p-2 rounded-xl border text-left flex items-center justify-between transition cursor-pointer text-xs font-mono ${
                  customPath === f.path && selectedCategory === 'custom'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : isLightMode
                    ? 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="truncate mr-2" title={f.path}>
                  {f.path}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                  {f.sizeHuman || 'file'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. CONTROLS TOOLBAR & FILTERS */}
      {/* ======================================================== */}
      <div
        className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[240px]">
          {/* Search / Grep Filter input */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Filter logs (keyword, IP, user, PID)...' : 'فیلتر لاگ‌ها (کلمه، IP، کاربر)...'}
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                  : 'bg-slate-950 border-slate-700/80 text-slate-100 placeholder-slate-500'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Custom Path Input (only when custom category selected) */}
          {selectedCategory === 'custom' && (
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="/var/log/..."
                className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                  isLightMode
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950 border-slate-700 text-slate-100'
                }`}
              />
              <button
                type="button"
                onClick={() => loadLogs()}
                className="px-2.5 py-1.5 rounded-xl bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 transition cursor-pointer shrink-0"
              >
                {isEn ? 'Inspect' : 'بررسی'}
              </button>
            </div>
          )}

          {/* Journal Priority Filter */}
          {selectedCategory === 'journal' && (
            <select
              value={journalPriority}
              onChange={(e) => setJournalPriority(e.target.value)}
              className={`px-2 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                isLightMode
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-700 text-slate-200'
              }`}
            >
              <option value="">{isEn ? 'Priority: All Levels' : 'اولویت: همه سطوح'}</option>
              <option value="emerg">0: Emergency</option>
              <option value="alert">1: Alert</option>
              <option value="crit">2: Critical</option>
              <option value="err">3: Error</option>
              <option value="warning">4: Warning</option>
              <option value="notice">5: Notice</option>
              <option value="info">6: Info</option>
              <option value="debug">7: Debug</option>
            </select>
          )}

          {/* Severity Quick Pills */}
          <div className="flex items-center rounded-xl border border-slate-700/60 p-0.5 bg-slate-950/60">
            <button
              type="button"
              onClick={() => setLevelFilter('all')}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer ${
                levelFilter === 'all'
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isEn ? 'All' : 'همه'}
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter('errors')}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                levelFilter === 'errors'
                  ? 'bg-rose-500 text-white font-bold'
                  : 'text-rose-400 hover:text-white'
              }`}
            >
              <span>{isEn ? 'Errors' : 'خطاها'}</span>
              {logsResponse?.errorCount ? (
                <span className="text-[10px] px-1 rounded-full bg-rose-950 text-rose-200 font-mono">
                  {logsResponse.errorCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setLevelFilter('warnings')}
              className={`px-2 py-0.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
                levelFilter === 'warnings'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-amber-400 hover:text-white'
              }`}
            >
              <span>{isEn ? 'Warns' : 'هشدارها'}</span>
              {logsResponse?.warnCount ? (
                <span className="text-[10px] px-1 rounded-full bg-amber-950 text-amber-200 font-mono">
                  {logsResponse.warnCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* Right side controls: Lines, Auto-refresh, View mode, Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lines Count Selector */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px] font-mono">{isEn ? 'Lines:' : 'تعداد:'}</span>
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className={`px-2 py-1 rounded-lg border text-xs font-mono focus:outline-none ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-700 text-slate-200'
              }`}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          {/* Auto Refresh Dropdown */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className={`px-2 py-1 rounded-lg border text-xs font-mono focus:outline-none ${
                isLightMode
                  ? 'bg-white border-slate-200 text-slate-800'
                  : 'bg-slate-950 border-slate-700 text-slate-200'
              }`}
            >
              <option value={0}>{isEn ? 'Manual' : 'دستی'}</option>
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="inline-flex rounded-lg border border-slate-700/60 p-0.5 bg-slate-950/60">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title={isEn ? 'Table View' : 'نمایش جدولی'}
              className={`p-1 rounded cursor-pointer transition ${
                viewMode === 'table' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('terminal')}
              title={isEn ? 'Raw Terminal View' : 'نمایش متنی کنسول'}
              className={`p-1 rounded cursor-pointer transition ${
                viewMode === 'terminal' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadLogs()}
            disabled={loading}
            title={isEn ? 'Refresh Logs' : 'بروزرسانی لاگ'}
            className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Copy Logs */}
          <button
            type="button"
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            title={isEn ? 'Copy Logs to Clipboard' : 'کپی کردن لاگ‌ها'}
            className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download Logs */}
          <button
            type="button"
            onClick={handleDownloadLogs}
            disabled={filteredLogs.length === 0}
            title={isEn ? 'Download Logs (.log)' : 'دانلود فایل لاگ'}
            className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Truncate / Clear file button (blocked for auth.log) */}
          {logsResponse?.filePath &&
            logsResponse.filePath !== 'systemd-journal' &&
            !logsResponse.filePath.includes('auth.log') &&
            !logsResponse.filePath.includes('secure') && (
              <button
                type="button"
                onClick={() => setShowTruncateModal(true)}
                title={isEn ? 'Truncate / Clear Log File' : 'پاکسازی محتوای فایل لاگ'}
                className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
        </div>
      </div>

      {/* Action feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. LOG TARGET METADATA STRIP */}
      {/* ======================================================== */}
      <div
        className={`px-3.5 py-2 rounded-xl border flex items-center justify-between flex-wrap gap-2 text-xs font-mono ${
          isLightMode ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-slate-950/70 border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>
            {isEn ? 'Target:' : 'تارگت:'}{' '}
            <strong className="text-cyan-400">{logsResponse?.filePath || selectedCategory}</strong>
          </span>
          {logsResponse?.fileMetadata?.sizeHuman && (
            <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {logsResponse.fileMetadata.sizeHuman}
            </span>
          )}
          {logsResponse?.fileMetadata?.lastModified && (
            <span className="text-[10px] text-slate-500 hidden sm:inline">
              mod: {logsResponse.fileMetadata.lastModified}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span>
            {isEn ? 'Showing:' : 'نمایش:'}{' '}
            <strong className="text-white">{filteredLogs.length}</strong> / {logsResponse?.lineCount || 0}
          </span>
          {logsResponse?.errorCount ? (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>{logsResponse.errorCount} {isEn ? 'errors' : 'خطا'}</span>
            </span>
          ) : null}
          {logsResponse?.warnCount ? (
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>{logsResponse.warnCount} {isEn ? 'warnings' : 'هشدار'}</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 6. MAIN LOG VIEWER (TABLE OR TERMINAL) */}
      {/* ======================================================== */}
      {loading && !logsResponse ? (
        <div
          className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-3 ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">
            {isEn ? 'Tailing live system logs via SSH...' : 'در حال خواندن لاگ‌های زنده از طریق SSH...'}
          </p>
        </div>
      ) : error ? (
        <div
          className={`p-8 rounded-2xl border text-center flex flex-col items-center justify-center gap-3 ${
            isLightMode ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
          }`}
        >
          <AlertTriangle className="w-8 h-8 text-rose-400" />
          <h4 className="text-sm font-bold">{isEn ? 'Failed to read logs' : 'خطا در خواندن لاگ‌ها'}</h4>
          <p className="text-xs font-mono max-w-xl">{error}</p>
          <button
            type="button"
            onClick={() => loadLogs()}
            className="px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition cursor-pointer"
          >
            {isEn ? 'Retry' : 'تلاش مجدد'}
          </button>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div
          className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center gap-2 ${
            isLightMode ? 'bg-white border-slate-200 text-slate-600' : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <FileText className="w-8 h-8 text-slate-500 opacity-60" />
          <p className="text-xs font-medium">
            {searchQuery
              ? isEn
                ? 'No log entries match the search criteria.'
                : 'هیچ لاگی با فیلتر جستجوی وارد شده یافت نشد.'
              : isEn
              ? 'No log records returned for this target or file is currently empty.'
              : 'هیچ رکوردی برای این تارگت ثبت نشده یا فایل لاگ فعلاً خالی است.'}
          </p>
        </div>
      ) : viewMode === 'terminal' ? (
        /* ======================== TERMINAL RAW VIEW ======================== */
        <div
          className={`rounded-2xl border p-4 font-mono text-xs overflow-x-auto max-h-[550px] overflow-y-auto select-text ${
            isLightMode ? 'bg-slate-950 text-slate-200 border-slate-800' : 'bg-black text-slate-200 border-slate-800'
          }`}
        >
          <div className="space-y-1">
            {filteredLogs.map((log, idx) => {
              const isError =
                log.level === 'error' ||
                log.level === 'critical' ||
                log.level === 'alert' ||
                log.level === 'emergency';
              const isWarn = log.level === 'warning';
              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 py-0.5 px-2 rounded hover:bg-white/5 transition ${
                    isError
                      ? 'text-rose-300 bg-rose-950/20'
                      : isWarn
                      ? 'text-amber-300 bg-amber-950/10'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-600 select-none text-[11px] w-9 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 break-all whitespace-pre-wrap">{log.raw}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ======================== STRUCTURED TABLE VIEW ======================== */
        <div
          className={`rounded-2xl border overflow-hidden transition-all ${
            isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead
                className={`sticky top-0 z-10 text-[11px] font-mono border-b ${
                  isLightMode ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center">#</th>
                  <th className="py-2.5 px-3 w-40">{isEn ? 'Timestamp' : 'زمان'}</th>
                  <th className="py-2.5 px-3 w-20 text-center">{isEn ? 'Severity' : 'سطح'}</th>
                  <th className="py-2.5 px-3 w-36">{isEn ? 'Service / Host' : 'سرویس / هاست'}</th>
                  <th className="py-2.5 px-4">{isEn ? 'Message' : 'پیام لاگ'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredLogs.map((log, idx) => {
                  const isExpanded = expandedLogId === log.id;
                  const isError =
                    log.level === 'error' ||
                    log.level === 'critical' ||
                    log.level === 'alert' ||
                    log.level === 'emergency';
                  const isWarn = log.level === 'warning';

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className={`transition cursor-pointer font-mono ${
                          isError
                            ? 'bg-rose-500/5 hover:bg-rose-500/10'
                            : isWarn
                            ? 'bg-amber-500/5 hover:bg-amber-500/10'
                            : isLightMode
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="py-2 px-3 text-center text-slate-500 text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-400 whitespace-nowrap">
                          {log.timestamp || '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                              isError
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : isWarn
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {log.level || 'info'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-cyan-400 text-[11px] truncate max-w-[140px]">
                          {log.service || log.hostname || '-'}
                        </td>
                        <td className="py-2 px-4 text-slate-200 break-words leading-relaxed text-[11px]">
                          {log.message}
                        </td>
                      </tr>

                      {/* Expanded Raw Detail Drawer */}
                      {isExpanded && (
                        <tr className={isLightMode ? 'bg-slate-100' : 'bg-slate-950'}>
                          <td colSpan={5} className="p-3">
                            <div className="p-3 rounded-xl border border-slate-700 bg-black/40 font-mono text-[11px] text-slate-200 select-text whitespace-pre-wrap break-all">
                              <div className="text-slate-400 mb-1 flex items-center justify-between border-b border-slate-700 pb-1">
                                <span>{isEn ? 'Full Raw Log Stream Entry:' : 'خط کامل لاگ خام:'}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(log.raw);
                                  }}
                                  className="text-cyan-400 hover:text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>{isEn ? 'Copy Line' : 'کپی خط'}</span>
                                </button>
                              </div>
                              {log.raw}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 7. MODAL CONFIRMATION: TRUNCATE LOG FILE */}
      {/* ======================================================== */}
      {showTruncateModal && logsResponse?.filePath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-2xl border p-5 space-y-4 shadow-2xl ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold">
                {isEn ? 'Confirm Log File Truncation' : 'تأیید پاکسازی محتوای فایل لاگ'}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isEn ? (
                <>
                  Are you sure you want to truncate{' '}
                  <strong className="text-rose-400 font-mono">{logsResponse.filePath}</strong> to 0 bytes?
                  All historical log entries currently stored in this file will be permanently cleared.
                </>
              ) : (
                <>
                  آیا از خالی کردن فایل{' '}
                  <strong className="text-rose-400 font-mono">{logsResponse.filePath}</strong> به اندازه ۰ بایت اطمینان
                  دارید؟ کلیه رکوردهای قبلی ذخیره‌شده در این فایل به صورت غیرقابل بازگشت پاک خواهند شد.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTruncateModal(false)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>
              <button
                type="button"
                disabled={truncateLoading}
                onClick={handleTruncateLog}
                className="px-3.5 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {truncateLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isEn ? 'Truncate Now' : 'پاکسازی فوری'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
