import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Server,
  Layers,
  Trash2,
  ChevronRight,
  ChevronDown,
  Download,
  Copy,
  Check,
  Terminal,
  FolderGit2,
  FileCode,
  Shield,
  Filter,
  Maximize2,
  Minimize2,
  X,
  Minus
} from 'lucide-react';
import {
  BulkServerExecutionReport,
  BulkServerReportServerSummary
} from '../../types';
import {
  fetchBulkServerReports,
  deleteBulkServerReport,
  clearAllBulkServerReports
} from '../../services/bulkServerConfigService';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface BulkServerReportsTabProps {
  isLightMode: boolean;
  isEn: boolean;
  onSelectTemplateToRerun?: (templateId: string, parameters: Record<string, any>) => void;
}

export const BulkServerReportsTab: React.FC<BulkServerReportsTabProps> = ({
  isLightMode,
  isEn,
  onSelectTemplateToRerun
}) => {
  const [reports, setReports] = useState<BulkServerExecutionReport[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'partial' | 'failed' | 'cancelled'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<BulkServerExecutionReport | null>(null);
  const [isDetailMaximized, setIsDetailMaximized] = useState<boolean>(false);
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  const loadReports = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await fetchBulkServerReports();
      setReports(data);
    } catch (err) {
      console.error('Failed to load bulk server reports:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDeleteReport = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(isEn ? 'Are you sure you want to delete this execution report?' : 'آیا از حذف این گزارش ممیزی مطمئن هستید؟')) {
      return;
    }
    const success = await deleteBulkServerReport(reportId);
    if (success) {
      setReports((prev) => prev.filter((r) => r.id !== reportId && r.jobId !== reportId));
      if (selectedReport?.id === reportId || selectedReport?.jobId === reportId) {
        setSelectedReport(null);
      }
    }
  };

  const handleClearAllReports = async () => {
    const success = await clearAllBulkServerReports();
    if (success) {
      setReports([]);
      setSelectedReport(null);
      setShowClearConfirm(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const downloadReportJson = (report: BulkServerExecutionReport) => {
    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-report-${report.templateId}-${new Date(report.createdAt).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set);
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchTitle = (r.templateTitle || '').toLowerCase().includes(q) || (r.templateTitleEn || '').toLowerCase().includes(q);
      const matchUser = (r.operatorUser || '').toLowerCase().includes(q);
      const matchTemplateId = (r.templateId || '').toLowerCase().includes(q);
      const matchServer = r.serverSummaries?.some((s) => s.serverName.toLowerCase().includes(q) || s.serverIp.includes(q));
      const matchPaths = r.impactAnalysis?.affectedPaths?.some((p) => p.toLowerCase().includes(q));

      return matchTitle || matchUser || matchTemplateId || matchServer || matchPaths;
    });
  }, [reports, statusFilter, categoryFilter, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = reports.length;
    const completed = reports.filter((r) => r.status === 'completed').length;
    const failedOrPartial = reports.filter((r) => r.status === 'failed' || r.status === 'partial').length;
    const totalServersTouched = reports.reduce((acc, r) => acc + (r.totalServers || 0), 0);
    return { total, completed, failedOrPartial, totalServersTouched };
  }, [reports]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-white/5 bg-slate-900/40">
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">
              {isEn ? 'Total Executions' : 'کل عملیات اجرا شده'}
            </div>
            <div className="text-xl font-bold font-mono text-cyan-400 mt-0.5">
              {stats.total}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">
              {isEn ? 'Successful Fleet Jobs' : 'موفقیت کامل در ناوگان'}
            </div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {stats.completed}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">
              {isEn ? 'Partial or Failed' : 'دارای خطا یا ناموفق'}
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">
              {stats.failedOrPartial}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">
              {isEn ? 'Servers Configured' : 'کل سرورهای پیکربندی‌شده'}
            </div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {stats.totalServersTouched}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Server className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & Actions */}
      <div className="p-4 border-b border-white/5 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search by template, operator, server IP or changed path...' : 'جستجو بر اساس تمپلیت، کاربر مجری، سرور یا مسیر تغییر یافته...'}
              className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-black/50 border border-white/10 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-1 text-xs font-mono">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
            {(['all', 'completed', 'partial', 'failed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded transition capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'all'
                  ? (isEn ? 'All' : 'همه')
                  : st === 'completed'
                  ? (isEn ? 'Success' : 'موفق')
                  : st === 'partial'
                  ? (isEn ? 'Partial' : 'بخشی')
                  : (isEn ? 'Failed' : 'ناموفق')}
              </button>
            ))}
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-mono bg-black/50 border border-white/10 rounded-lg text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">{isEn ? 'All Categories' : 'تمام دسته‌بندی‌ها'}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadReports(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-mono transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-mono transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Clear Reports' : 'پاکسازی تاریخچه'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Clearing Reports */}
      {showClearConfirm && (
        <div className="p-3 mx-4 my-2 rounded-xl bg-rose-950/60 border border-rose-500/30 flex items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              {isEn
                ? 'Are you sure you want to delete all bulk configuration audit reports permanently?'
                : 'آیا از حذف دائمی تمامی سوابق و گزارش‌های ممیزی پیکربندی اطمینان دارید؟'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAllReports}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition cursor-pointer"
            >
              {isEn ? 'Yes, Delete All' : 'بله، حذف همه'}
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(false)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg transition cursor-pointer"
            >
              {isEn ? 'Cancel' : 'انصراف'}
            </button>
          </div>
        </div>
      )}

      {/* Main Reports List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
            <span className="text-xs font-mono">
              {isEn ? 'Loading execution reports & change records...' : 'در حال بارگذاری گزارش‌های ممیزی و تغییرات ناوگان...'}
            </span>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/10 rounded-2xl bg-black/20 text-slate-400 p-6 text-center">
            <FileText className="w-12 h-12 text-slate-600 mb-3" />
            <div className="text-sm font-semibold text-slate-300">
              {isEn ? 'No Execution Reports Found' : 'هیچ گزارش ممیزی یا اجرایی یافت نشد'}
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              {isEn
                ? 'When you run automated templates from the Configuration tab, detailed reports of which user ran what, modified files, affected paths, and per-server logs will be saved here.'
                : 'با اجرای الگوهای خودکار در تب پیکربندی، گزارش کامل از کاربر مجری، زمان، فایل‌های ایجادشده، مسیرهای تغییریافته و لاگ هر سرور در اینجا ثبت خواهد شد.'}
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isSuccess = report.status === 'completed';
            const isPartial = report.status === 'partial';
            const isFailed = report.status === 'failed';
            const isCancelled = report.status === 'cancelled';

            const statusColor = isSuccess
              ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
              : isPartial
              ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
              : isCancelled
              ? 'border-slate-500/30 bg-slate-500/5 hover:border-slate-500/50'
              : 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50';

            const statusBadge = isSuccess ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                {isEn ? 'Completed' : 'تکمیل موفق'}
              </span>
            ) : isPartial ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" />
                {isEn ? 'Partial Success' : 'موفقیت جزئی'}
              </span>
            ) : isCancelled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
                <Clock className="w-3 h-3" />
                {isEn ? 'Cancelled' : 'لغو شده'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <XCircle className="w-3 h-3" />
                {isEn ? 'Failed' : 'ناموفق'}
              </span>
            );

            return (
              <div
                key={report.id || report.jobId}
                onClick={() => setSelectedReport(report)}
                className={`p-4 rounded-xl border transition cursor-pointer shadow-lg hover:shadow-cyan-500/5 ${statusColor}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left: Template info and operator */}
                  <div className="flex items-center gap-3 min-w-[240px]">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-cyan-400">
                      <FileCode className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {isEn ? report.templateTitleEn || report.templateTitle : report.templateTitle}
                        </span>
                        {statusBadge}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <User className="w-3 h-3 text-cyan-400" />
                          <strong className="text-cyan-300 font-normal">{report.operatorUser || 'Administrator'}</strong>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(report.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                        </span>
                        <span>•</span>
                        <span>
                          {isEn ? `Duration: ${(report.durationMs / 1000).toFixed(1)}s` : `مدت: ${(report.durationMs / 1000).toFixed(1)} ثانیه`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Fleet progress & buttons */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-mono text-slate-300">
                        {isEn
                          ? `${report.successCount} of ${report.totalServers} servers OK`
                          : `${report.successCount} از ${report.totalServers} سرور موفق`}
                      </div>
                      <div className="w-28 h-1.5 bg-black/50 rounded-full overflow-hidden mt-1 border border-white/5">
                        <div
                          className={`h-full ${
                            isSuccess ? 'bg-emerald-500' : isPartial ? 'bg-amber-500' : 'bg-rose-500'
                          }`}
                          style={{
                            width: `${report.totalServers > 0 ? (report.successCount / report.totalServers) * 100 : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedReport(report)}
                        title={isEn ? 'View Detailed Report' : 'مشاهده گزارش تفصیلی'}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/10 transition cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteReport(report.id, e)}
                        title={isEn ? 'Delete Report' : 'حذف گزارش'}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/10 transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Impact Preview Tags (Modified paths & created files) */}
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                  <span className="text-slate-400 flex items-center gap-1">
                    <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isEn ? 'Changed Paths / Configs:' : 'مسیرها و فایل‌های متاثر:'}</span>
                  </span>
                  {report.impactAnalysis?.affectedPaths?.slice(0, 4).map((p, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-black/40 text-slate-300 border border-white/10"
                    >
                      {p}
                    </span>
                  ))}
                  {(report.impactAnalysis?.affectedPaths?.length || 0) > 4 && (
                    <span className="text-slate-500">
                      +{report.impactAnalysis.affectedPaths.length - 4} {isEn ? 'more' : 'دیگر'}
                    </span>
                  )}
                  {report.impactAnalysis?.createdFiles?.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      +{report.impactAnalysis.createdFiles.length} {isEn ? 'created' : 'فایل جدید'}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Drill-Down Detailed Execution Report Modal */}
      {selectedReport && (
        <div className="fixed top-0 left-0 right-0 bottom-8 z-[999990] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`flex flex-col bg-slate-950 border border-cyan-500/30 shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ${
              isDetailMaximized
                ? 'w-full h-full'
                : 'w-full max-w-4xl max-h-[90vh]'
            }`}
          >
            {/* Header with standard triad buttons */}
            <div className="px-5 py-3.5 bg-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>
                      {isEn
                        ? `Execution Report: ${selectedReport.templateTitleEn || selectedReport.templateTitle}`
                        : `گزارش ممیزی اجرا: ${selectedReport.templateTitle}`}
                    </span>
                  </h3>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {isEn ? 'Job ID:' : 'شناسه عملیات:'} {selectedReport.jobId} •{' '}
                    {new Date(selectedReport.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadReportJson(selectedReport)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title={isEn ? 'Export Full Report as JSON' : 'خروجی کامل فایل JSON'}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Export JSON' : 'دریافت JSON'}</span>
                </button>

                {/* Triad buttons: Minimize, Maximize, Close */}
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
                  title={isEn ? 'Minimize / Dock' : 'مینیمایز'}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailMaximized(!isDetailMaximized)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
                  title={isDetailMaximized ? (isEn ? 'Restore' : 'خروج از تمام‌صفحه') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
                >
                  {isDetailMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title={isEn ? 'Close' : 'بستن'}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Executive Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[11px] text-slate-400">{isEn ? 'Operator User' : 'کاربر مجری'}</div>
                  <div className="text-sm font-semibold font-mono text-cyan-300 mt-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{selectedReport.operatorUser || 'Administrator'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[11px] text-slate-400">{isEn ? 'Execution Status' : 'وضعیت نهایی'}</div>
                  <div className="text-sm font-semibold font-mono mt-1">
                    {selectedReport.status === 'completed' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isEn ? 'Success (100%)' : 'موفقیت‌آمیز'}
                      </span>
                    ) : selectedReport.status === 'partial' ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {isEn ? 'Partial Success' : 'موفقیت جزئی'}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {isEn ? 'Failed' : 'دارای خطا'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[11px] text-slate-400">{isEn ? 'Execution Duration' : 'زمان کل اجرا'}</div>
                  <div className="text-sm font-semibold font-mono text-amber-300 mt-1">
                    {(selectedReport.durationMs / 1000).toFixed(2)} {isEn ? 'seconds' : 'ثانیه'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <div className="text-[11px] text-slate-400">{isEn ? 'Targeted Servers' : 'تعداد سرورهای هدف'}</div>
                  <div className="text-sm font-semibold font-mono text-slate-200 mt-1">
                    {selectedReport.successCount} / {selectedReport.totalServers} {isEn ? 'nodes' : 'نود'}
                  </div>
                </div>
              </div>

              {/* Impact Analysis & Change Tracking Section */}
              <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/20 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                    <FolderGit2 className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'Filesystem Changes & Affected Paths' : 'تغییرات فایل‌سیستم و مسیرهای تحت تاثیر'}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-300 font-medium">
                  {isEn
                    ? selectedReport.impactAnalysis?.actionsSummaryEn || selectedReport.impactAnalysis?.actionsSummaryFa
                    : selectedReport.impactAnalysis?.actionsSummaryFa}
                </div>

                {/* Affected Paths */}
                {selectedReport.impactAnalysis?.affectedPaths?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-slate-400 mb-1">
                      {isEn ? 'Target Paths & Directories:' : 'مسیرها و پوشه‌های هدف:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.affectedPaths.map((p, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-black/60 text-cyan-300 border border-cyan-500/20">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Created Files */}
                {selectedReport.impactAnalysis?.createdFiles?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-emerald-400 mb-1">
                      {isEn ? 'Created Files / Injected Keys:' : 'فایل‌های ایجاد شده / کلیدهای تزریق‌شده:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.createdFiles.map((f, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                          + {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modified Configs */}
                {selectedReport.impactAnalysis?.modifiedConfigs?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-amber-400 mb-1">
                      {isEn ? 'Modified Configuration Files:' : 'تنظیمات سیستمی ویرایش‌شده:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.modifiedConfigs.map((c, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/30">
                          ~ {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Security Implications */}
                {((isEn ? selectedReport.impactAnalysis?.securityImplicationsEn : selectedReport.impactAnalysis?.securityImplicationsFa) || []).length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mb-1">
                      <Shield className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? 'Security & Access Implications:' : 'آثار امنیتی و دسترسی‌های اعمال‌شده:'}</span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                      {(isEn ? selectedReport.impactAnalysis.securityImplicationsEn : selectedReport.impactAnalysis.securityImplicationsFa)?.map((sec, idx) => (
                        <li key={idx}>{sec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Parameters Snapshot */}
              {Object.keys(selectedReport.parameters || {}).length > 0 && (
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    {isEn ? 'Configuration Parameters Snapshot' : 'پارامترهای تنظیم‌شده برای این اجرا'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Object.entries(selectedReport.parameters).map(([key, val]) => (
                      <div key={key} className="p-2 rounded-lg bg-black/60 border border-white/5 text-xs font-mono">
                        <span className="text-slate-400">{key}: </span>
                        <span className="text-slate-200 font-semibold">
                          {key.toLowerCase().includes('pass') ? '••••••••' : String(val || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Server Logs & Detailed Execution Accordion */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center justify-between">
                  <span>{isEn ? 'Per-Server Execution Results & Terminal Output' : 'خروجی ترمینال و نتایج به تفکیک هر سرور'}</span>
                  <span className="text-[11px] text-slate-500 font-normal">
                    {isEn ? 'Click any server to inspect stdout/stderr' : 'روی هر سرور برای مشاهده لاگ خروجی کلیک کنید'}
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedReport.serverSummaries?.map((srv) => {
                    const isExpanded = !!expandedServers[srv.serverId];
                    const srvResult = selectedReport.results?.[srv.serverId];

                    return (
                      <div
                        key={srv.serverId}
                        className="rounded-xl border border-white/5 bg-black/40 overflow-hidden"
                      >
                        <div
                          onClick={() =>
                            setExpandedServers((prev) => ({
                              ...prev,
                              [srv.serverId]: !prev[srv.serverId]
                            }))
                          }
                          className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition"
                        >
                          <div className="flex items-center gap-3">
                            {srv.status === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : srv.status === 'partial' ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <div>
                              <div className="text-xs font-bold font-mono text-slate-200">
                                {srv.serverName} ({srv.serverIp})
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {srv.osDistro} • {srv.durationMs}ms
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {srv.error && (
                              <span className="text-[10px] text-rose-400 font-mono truncate max-w-xs">
                                {srv.error}
                              </span>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Terminal Output */}
                        {isExpanded && (
                          <div className="p-3 bg-black/80 border-t border-white/5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{isEn ? 'Terminal Raw Output & Steps:' : 'خروجی گام‌های خط فرمان:'}</span>
                              </span>
                              {srvResult?.rawOutput && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(srvResult.rawOutput || '', srv.serverId)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                                >
                                  {copiedText === srv.serverId ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-400" />
                                      <span className="text-emerald-400">{isEn ? 'Copied' : 'کپی شد'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>{isEn ? 'Copy Output' : 'کپی خروجی'}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            <pre className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto border border-white/5">
                              {srvResult?.rawOutput || srv.error || (isEn ? 'No terminal output available.' : 'هیچ لاگ خروجی ثبت نشده است.')}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-900 border-t border-white/10 flex items-center justify-between shrink-0">
              <span className="text-xs font-mono text-slate-400">
                {isEn
                  ? `Completed on ${new Date(selectedReport.finishedAt).toLocaleTimeString()}`
                  : `پایان یافته در ${new Date(selectedReport.finishedAt).toLocaleTimeString()}`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-mono transition cursor-pointer"
              >
                {isEn ? 'Close Details' : 'بستن پنجره'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
