import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  UploadCloud,
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
  Minus,
  Database,
  RotateCcw,
} from 'lucide-react';
import {
  BulkServerExecutionReport,
  BulkServerReportServerSummary,
} from '../../types';
import {
  fetchBulkServerReports,
  deleteBulkServerReport,
  clearAllBulkServerReports,
  importBulkServerReports,
  fetchBulkServerReportsStats,
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
  onSelectTemplateToRerun,
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
  const [dbStats, setDbStats] = useState<{
    storageType: 'postgresql' | 'json_store';
    totalReports: number;
    isPostgresReady: boolean;
  } | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ text, type });
    setTimeout(() => setToastNotification(null), 4000);
  };

  const loadReports = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [data, stats] = await Promise.all([
        fetchBulkServerReports(),
        fetchBulkServerReportsStats().catch(() => null),
      ]);
      setReports(data);
      if (stats) setDbStats(stats);
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
    if (!window.confirm(isEn ? 'Are you sure you want to permanently delete this execution report from the database?' : 'آیا از حذف دائمی این گزارش ممیزی از پایگاه‌داده مطمئن هستید؟')) {
      return;
    }
    const success = await deleteBulkServerReport(reportId);
    if (success) {
      setReports((prev) => prev.filter((r) => r.id !== reportId && r.jobId !== reportId));
      if (selectedReport?.id === reportId || selectedReport?.jobId === reportId) {
        setSelectedReport(null);
      }
      showToast(isEn ? 'Report deleted from database.' : 'گزارش ممیزی با موفقیت از دیتابیس حذف شد.', 'success');
      fetchBulkServerReportsStats().then(setDbStats).catch(() => {});
    } else {
      showToast(isEn ? 'Failed to delete report from database.' : 'خطا در حذف گزارش از پایگاه‌داده.', 'error');
    }
  };

  const handleClearAllReports = async () => {
    const success = await clearAllBulkServerReports();
    if (success) {
      setReports([]);
      setSelectedReport(null);
      setShowClearConfirm(false);
      showToast(isEn ? 'All reports cleared from database.' : 'تمام سوابق گزارش با موفقیت از پایگاه‌داده پاکسازی شدند.', 'success');
      fetchBulkServerReportsStats().then(setDbStats).catch(() => {});
    } else {
      showToast(isEn ? 'Failed to clear reports from database.' : 'خطا در پاکسازی گزارش‌ها از دیتابیس.', 'error');
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

  const downloadAllReportsJson = () => {
    if (reports.length === 0) return;
    const jsonStr = JSON.stringify(reports, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-server-reports-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const toImport: BulkServerExecutionReport[] = Array.isArray(parsed) ? parsed : [parsed];
      if (toImport.length === 0 || !toImport[0]?.id && !toImport[0]?.jobId) {
        throw new Error(isEn ? 'Invalid format. Expected execution report JSON.' : 'فرمت نامعتبر است. فایل باید حاوی گزارش ممیزی سرور باشد.');
      }
      const res = await importBulkServerReports(toImport);
      showToast(
        isEn
          ? `Successfully imported and stored ${res.imported} report(s) into database.`
          : `${res.imported} گزارش ممیزی با موفقیت در پایگاه‌داده ذخیره و ثبت شد.`,
        'success'
      );
      loadReports(true);
    } catch (err: any) {
      showToast(
        isEn ? `Import failed: ${err.message}` : `خطا در بارگذاری فایل: ${err.message}`,
        'error'
      );
    } finally {
      if (e.target) e.target.value = '';
    }
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
    <div className={`flex flex-col h-full overflow-hidden ${isLightMode ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100'}`}>
      {/* Toast Notification */}
      {toastNotification && (
        <div
          className={`fixed top-4 right-4 z-[999999] px-4 py-2.5 rounded-xl border text-xs font-mono shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2 duration-200 ${
            toastNotification.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-200'
          }`}
        >
          {toastNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastNotification.text}</span>
        </div>
      )}

      {/* Hidden file input for importing JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportJsonFile}
      />

      {/* Top Metrics Cards */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b shrink-0 ${
        isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-white/5'
      }`}>
        <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-black/40 border-white/5'
        }`}>
          <div>
            <div className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Total Executions' : 'کل عملیات اجرا شده'}
            </div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${isLightMode ? 'text-cyan-700' : 'text-cyan-400'}`}>
              {stats.total}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-black/40 border-white/5'
        }`}>
          <div>
            <div className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Successful Fleet Jobs' : 'موفقیت کامل در ناوگان'}
            </div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${isLightMode ? 'text-emerald-700' : 'text-emerald-400'}`}>
              {stats.completed}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-black/40 border-white/5'
        }`}>
          <div>
            <div className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Partial or Failed' : 'دارای خطا یا ناموفق'}
            </div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${isLightMode ? 'text-rose-700' : 'text-rose-400'}`}>
              {stats.failedOrPartial}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center justify-between transition ${
          isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-black/40 border-white/5'
        }`}>
          <div>
            <div className={`text-[11px] font-medium ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
              {isEn ? 'Servers Configured' : 'کل سرورهای پیکربندی‌شده'}
            </div>
            <div className={`text-xl font-bold font-mono mt-0.5 ${isLightMode ? 'text-amber-700' : 'text-amber-400'}`}>
              {stats.totalServersTouched}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400">
            <Server className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters, Database Indicator & Actions */}
      <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
        isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-white/5'
      }`}>
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
              isLightMode ? 'text-slate-400' : 'text-slate-500'
            }`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search by template, operator, server IP or changed path...' : 'جستجو بر اساس تمپلیت، کاربر مجری، سرور یا مسیر تغییر یافته...'}
              className={`w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-lg transition focus:outline-none ${
                isLightMode
                  ? 'bg-slate-100 border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600 focus:bg-white'
                  : 'bg-black/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Status Filter */}
          <div className={`flex items-center gap-1 border rounded-lg p-1 text-xs font-mono ${
            isLightMode ? 'bg-slate-100 border-slate-300' : 'bg-black/40 border-white/10'
          }`}>
            <Filter className={`w-3.5 h-3.5 ml-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`} />
            {(['all', 'completed', 'partial', 'failed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-0.5 rounded transition capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                    : isLightMode
                    ? 'text-slate-600 hover:text-slate-900'
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
              className={`px-2.5 py-1.5 text-xs font-mono border rounded-lg focus:outline-none ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-800 focus:border-cyan-600'
                  : 'bg-black/50 border-white/10 text-slate-300 focus:border-cyan-500'
              }`}
            >
              <option value="all">{isEn ? 'All Categories' : 'تمام دسته‌بندی‌ها'}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Database Persistence Status Badge */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border ${
                dbStats?.storageType === 'postgresql'
                  ? isLightMode
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                  : isLightMode
                  ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                  : 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                {dbStats?.storageType === 'postgresql'
                  ? (isEn ? 'PostgreSQL Persisted' : 'ذخیره در پایگاه‌داده PostgreSQL')
                  : (isEn ? 'Database Store Active' : 'پایگاه‌داده پایدار فعال')}
              </span>
            </span>
            <FieldInfoTooltip
              title={isEn ? 'Database Persistence Engine' : 'سیستم ماندگاری و ذخیره گزارش‌ها در دیتابیس'}
              whatIsIt={
                isEn
                  ? 'All automated execution reports, terminal logs, operator actions, and changed filesystem paths are permanently committed to the relational database table and persistent store.'
                  : 'تمامی گزارش‌های ممیزی، دستورات اجراشده، لاگ‌های خام ترمینال، کاربر مجری و مسیرهای تغییریافته به طور خودکار و قطعی در جدول دیتابیس رابطه‌ای ذخیره و ماندگار می‌شوند.'
              }
              whyNeeded={
                isEn
                  ? 'Provides unbreakable compliance, audit trails, and the ability to review past fleet maintenance or rerun templates anytime.'
                  : 'ایجاد شفافیت و رهگیری تغییرات زیرساخت، اثبات اجرای موفق دستورات و امکان اجرای مجدد هر سناریو بدون از دست رفتن اطلاعات.'
              }
              example={
                isEn
                  ? 'Stored in bulk_server_reports table with indexed timestamps, job IDs, and JSONB outputs.'
                  : 'ذخیره در جدول bulk_server_reports همراه با ایندکس‌های زمانی، خروجی JSONB و اطلاعات تفکیکی هر سرور.'
              }
              isLightMode={isLightMode}
              isEn={isEn}
            />
          </div>
        </div>

        {/* Action Buttons: Import, Export, Refresh, Clear */}
        <div className="flex items-center gap-2">
          {/* Import JSON button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
            }`}
            title={isEn ? 'Import Reports from JSON file into database' : 'بارگذاری و ذخیره فایل گزارش JSON در دیتابیس'}
          >
            <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isEn ? 'Import JSON' : 'درون‌ریزی JSON'}</span>
          </button>

          {/* Export All button */}
          {reports.length > 0 && (
            <button
              type="button"
              onClick={downloadAllReportsJson}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
              }`}
              title={isEn ? 'Export All Reports as JSON' : 'خروجی کامل کلیه گزارش‌ها به صورت JSON'}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isEn ? 'Export All' : 'خروجی کلی'}</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => loadReports(true)}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>{isEn ? 'Refresh' : 'بروزرسانی'}</span>
          </button>

          {/* Clear reports button */}
          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-mono transition cursor-pointer"
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
                ? 'Are you sure you want to delete all bulk configuration audit reports permanently from the database?'
                : 'آیا از حذف دائمی تمامی سوابق و گزارش‌های ممیزی پیکربندی از پایگاه‌داده اطمینان دارید؟'}
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
              {isEn ? 'Loading execution reports & database records...' : 'در حال بارگذاری سوابق ممیزی و گزارش‌های دیتابیس...'}
            </span>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 border border-dashed rounded-2xl p-6 text-center ${
            isLightMode ? 'bg-white border-slate-300 text-slate-600' : 'bg-black/20 border-white/10 text-slate-400'
          }`}>
            <FileText className={`w-12 h-12 mb-3 ${isLightMode ? 'text-slate-400' : 'text-slate-600'}`} />
            <div className={`text-sm font-semibold ${isLightMode ? 'text-slate-800' : 'text-slate-300'}`}>
              {isEn ? 'No Execution Reports Found' : 'هیچ گزارش ممیزی یا اجرایی یافت نشد'}
            </div>
            <p className={`text-xs mt-1 max-w-md ${isLightMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {isEn
                ? 'When you run automated templates from the Configuration tab, detailed reports of operator, touched files, affected paths, and per-server logs will be stored in the database here.'
                : 'با اجرای الگوهای خودکار در تب پیکربندی، گزارش کامل از کاربر مجری، زمان، فایل‌های ایجادشده، مسیرهای تغییریافته و لاگ هر سرور مستقیماً در پایگاه‌داده ذخیره خواهد شد.'}
            </p>
          </div>
        ) : (
          filteredReports.map((report) => {
            const isSuccess = report.status === 'completed';
            const isPartial = report.status === 'partial';
            const isCancelled = report.status === 'cancelled';

            const statusColor = isLightMode
              ? isSuccess
                ? 'border-emerald-300 bg-emerald-50/60 hover:border-emerald-400'
                : isPartial
                ? 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
                : isCancelled
                ? 'border-slate-300 bg-slate-100 hover:border-slate-400'
                : 'border-rose-300 bg-rose-50/60 hover:border-rose-400'
              : isSuccess
              ? 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50'
              : isPartial
              ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
              : isCancelled
              ? 'border-slate-500/30 bg-slate-500/5 hover:border-slate-500/50'
              : 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50';

            const statusBadge = isSuccess ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3 h-3" />
                {isEn ? 'Completed' : 'تکمیل موفق'}
              </span>
            ) : isPartial ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3 h-3" />
                {isEn ? 'Partial Success' : 'موفقیت جزئی'}
              </span>
            ) : isCancelled ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
                <Clock className="w-3 h-3" />
                {isEn ? 'Cancelled' : 'لغو شده'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
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
                    <div className={`p-2.5 rounded-xl border text-cyan-400 ${
                      isLightMode ? 'bg-white border-slate-200' : 'bg-black/40 border-white/10'
                    }`}>
                      <FileCode className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                          {isEn ? report.templateTitleEn || report.templateTitle : report.templateTitle}
                        </span>
                        {statusBadge}
                      </div>
                      <div className={`flex flex-wrap items-center gap-2 mt-1 text-xs font-mono ${
                        isLightMode ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        <span className={`inline-flex items-center gap-1 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                          <User className="w-3 h-3 text-cyan-400" />
                          <strong className={isLightMode ? 'text-cyan-700 font-medium' : 'text-cyan-300 font-normal'}>
                            {report.operatorUser || 'Administrator'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(report.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}
                        </span>
                        <span>•</span>
                        <span>
                          {isEn ? `Duration: ${(report.durationMs / 1000).toFixed(1)}s` : `مدت: ${(report.durationMs / 1000).toFixed(1)} ثانیه`}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-cyan-500">
                          <Database className="w-3 h-3" />
                          <span>{isEn ? 'DB Persisted' : 'ذخیره در دیتابیس'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Fleet progress & action buttons */}
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-xs font-mono ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                        {isEn
                          ? `${report.successCount} of ${report.totalServers} servers OK`
                          : `${report.successCount} از ${report.totalServers} سرور موفق`}
                      </div>
                      <div className={`w-28 h-1.5 rounded-full overflow-hidden mt-1 border ${
                        isLightMode ? 'bg-slate-200 border-slate-300' : 'bg-black/50 border-white/5'
                      }`}>
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
                      {/* Rerun button */}
                      {onSelectTemplateToRerun && (
                        <button
                          type="button"
                          onClick={() => onSelectTemplateToRerun(report.templateId, report.parameters || {})}
                          title={isEn ? 'Rerun this configuration template with recorded parameters' : 'اجرای مجدد این الگو با پارامترهای ثبت‌شده'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                            isLightMode
                              ? 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300 shadow-sm'
                              : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          }`}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isEn ? 'Rerun' : 'تکرار'}</span>
                        </button>
                      )}

                      {/* Download JSON button */}
                      <button
                        type="button"
                        onClick={() => downloadReportJson(report)}
                        title={isEn ? 'Download Report JSON' : 'دریافت خروجی JSON'}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                        }`}
                      >
                        <Download className="w-4 h-4 text-emerald-400" />
                      </button>

                      {/* View details button */}
                      <button
                        type="button"
                        onClick={() => setSelectedReport(report)}
                        title={isEn ? 'View Detailed Report' : 'مشاهده گزارش تفصیلی'}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 border-slate-300'
                            : 'bg-white/5 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border-white/10'
                        }`}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteReport(report.id, e)}
                        title={isEn ? 'Delete Report from Database' : 'حذف گزارش از دیتابیس'}
                        className={`p-1.5 rounded-lg border transition cursor-pointer ${
                          isLightMode
                            ? 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border-slate-300'
                            : 'bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border-white/10'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Impact Preview Tags (Modified paths & created files) */}
                <div className={`mt-3 pt-3 border-t flex flex-wrap items-center gap-2 text-[11px] font-mono ${
                  isLightMode ? 'border-slate-200' : 'border-white/5'
                }`}>
                  <span className={`flex items-center gap-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{isEn ? 'Changed Paths / Configs:' : 'مسیرها و فایل‌های متاثر:'}</span>
                  </span>
                  {report.impactAnalysis?.affectedPaths?.slice(0, 4).map((p, idx) => (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded border ${
                        isLightMode
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-black/40 text-slate-300 border-white/10'
                      }`}
                    >
                      {p}
                    </span>
                  ))}
                  {(report.impactAnalysis?.affectedPaths?.length || 0) > 4 && (
                    <span className={isLightMode ? 'text-slate-500' : 'text-slate-500'}>
                      +{report.impactAnalysis.affectedPaths.length - 4} {isEn ? 'more' : 'دیگر'}
                    </span>
                  )}
                  {report.impactAnalysis?.createdFiles?.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
            className={`flex flex-col border shadow-2xl rounded-2xl overflow-hidden transition-all duration-300 ${
              isLightMode
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-slate-950 border-cyan-500/30 text-slate-100'
            } ${
              isDetailMaximized
                ? 'w-full h-full'
                : 'w-full max-w-4xl max-h-[90vh]'
            }`}
          >
            {/* Header with standard triad buttons (Close, Minimize, Maximize) */}
            <div className={`px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-white/10'
            }`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    <span>
                      {isEn
                        ? `Execution Report: ${selectedReport.templateTitleEn || selectedReport.templateTitle}`
                        : `گزارش ممیزی اجرا: ${selectedReport.templateTitle}`}
                    </span>
                  </h3>
                  <div className={`text-[11px] font-mono mt-0.5 flex items-center gap-2 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span>{isEn ? 'Job ID:' : 'شناسه عملیات:'} {selectedReport.jobId}</span>
                    <span>•</span>
                    <span>{new Date(selectedReport.createdAt).toLocaleString(isEn ? 'en-US' : 'fa-IR')}</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-cyan-500">
                      <Database className="w-3 h-3" />
                      <span>{isEn ? 'Database Stored' : 'پایگاه‌داده'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Rerun Button in Modal */}
                {onSelectTemplateToRerun && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTemplateToRerun(selectedReport.templateId, selectedReport.parameters || {});
                      setSelectedReport(null);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition cursor-pointer shadow-sm"
                    title={isEn ? 'Rerun this configuration template with parameters' : 'اجرای مجدد این الگو با پارامترهای ثبت‌شده'}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Rerun Template' : 'اجرای مجدد'}</span>
                  </button>
                )}

                {/* Export JSON Button */}
                <button
                  type="button"
                  onClick={() => downloadReportJson(selectedReport)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-lg border transition cursor-pointer ${
                    isLightMode
                      ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
                  }`}
                  title={isEn ? 'Export Full Report as JSON' : 'خروجی کامل فایل JSON'}
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isEn ? 'Export JSON' : 'دریافت JSON'}</span>
                </button>

                {/* Triad buttons: Minimize, Maximize, Close */}
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isLightMode
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                  title={isEn ? 'Minimize / Dock' : 'مینیمایز'}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailMaximized(!isDetailMaximized)}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    isLightMode
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                  title={isDetailMaximized ? (isEn ? 'Restore' : 'خروج از تمام‌صفحه') : (isEn ? 'Maximize' : 'تمام‌صفحه')}
                >
                  {isDetailMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReport(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
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
                <div className={`p-3 rounded-xl border ${
                  isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Operator User' : 'کاربر مجری'}
                  </div>
                  <div className={`text-sm font-semibold font-mono mt-1 flex items-center gap-1.5 ${
                    isLightMode ? 'text-cyan-700' : 'text-cyan-300'
                  }`}>
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{selectedReport.operatorUser || 'Administrator'}</span>
                  </div>
                </div>

                <div className={`p-3 rounded-xl border ${
                  isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Execution Status' : 'وضعیت نهایی'}
                  </div>
                  <div className="text-sm font-semibold font-mono mt-1">
                    {selectedReport.status === 'completed' ? (
                      <span className="text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isEn ? 'Success (100%)' : 'موفقیت‌آمیز'}
                      </span>
                    ) : selectedReport.status === 'partial' ? (
                      <span className="text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {isEn ? 'Partial Success' : 'موفقیت جزئی'}
                      </span>
                    ) : (
                      <span className="text-rose-500 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {isEn ? 'Failed' : 'دارای خطا'}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`p-3 rounded-xl border ${
                  isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Execution Duration' : 'زمان کل اجرا'}
                  </div>
                  <div className={`text-sm font-semibold font-mono mt-1 ${
                    isLightMode ? 'text-amber-700' : 'text-amber-300'
                  }`}>
                    {(selectedReport.durationMs / 1000).toFixed(2)} {isEn ? 'seconds' : 'ثانیه'}
                  </div>
                </div>

                <div className={`p-3 rounded-xl border ${
                  isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn ? 'Targeted Servers' : 'تعداد سرورهای هدف'}
                  </div>
                  <div className={`text-sm font-semibold font-mono mt-1 ${
                    isLightMode ? 'text-slate-700' : 'text-slate-200'
                  }`}>
                    {selectedReport.successCount} / {selectedReport.totalServers} {isEn ? 'nodes' : 'نود'}
                  </div>
                </div>
              </div>

              {/* Impact Analysis & Change Tracking Section */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-cyan-500/20'
              }`}>
                <div className={`flex items-center justify-between border-b pb-2 ${
                  isLightMode ? 'border-slate-200' : 'border-white/5'
                }`}>
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-500 uppercase tracking-wider font-mono">
                    <FolderGit2 className="w-4 h-4 text-cyan-400" />
                    <span>{isEn ? 'Filesystem Changes & Affected Paths' : 'تغییرات فایل‌سیستم و مسیرهای تحت تاثیر'}</span>
                  </div>
                </div>

                <div className={`text-xs font-medium ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                  {isEn
                    ? selectedReport.impactAnalysis?.actionsSummaryEn || selectedReport.impactAnalysis?.actionsSummaryFa
                    : selectedReport.impactAnalysis?.actionsSummaryFa}
                </div>

                {/* Affected Paths */}
                {selectedReport.impactAnalysis?.affectedPaths?.length > 0 && (
                  <div>
                    <div className={`text-[11px] font-mono mb-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {isEn ? 'Target Paths & Directories:' : 'مسیرها و پوشه‌های هدف:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.affectedPaths.map((p, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded border ${
                            isLightMode
                              ? 'bg-white text-cyan-800 border-cyan-300'
                              : 'bg-black/60 text-cyan-300 border border-cyan-500/20'
                          }`}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Created Files */}
                {selectedReport.impactAnalysis?.createdFiles?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-emerald-500 mb-1">
                      {isEn ? 'Created Files / Injected Keys:' : 'فایل‌های ایجاد شده / کلیدهای تزریق‌شده:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.createdFiles.map((f, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded border ${
                            isLightMode
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          + {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modified Configs */}
                {selectedReport.impactAnalysis?.modifiedConfigs?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-mono text-amber-500 mb-1">
                      {isEn ? 'Modified Configuration Files:' : 'تنظیمات سیستمی ویرایش‌شده:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                      {selectedReport.impactAnalysis.modifiedConfigs.map((c, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded border ${
                            isLightMode
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          ~ {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Security Implications */}
                {((isEn ? selectedReport.impactAnalysis?.securityImplicationsEn : selectedReport.impactAnalysis?.securityImplicationsFa) || []).length > 0 && (
                  <div className={`pt-2 border-t ${isLightMode ? 'border-slate-200' : 'border-white/5'}`}>
                    <div className={`text-[11px] font-mono flex items-center gap-1 mb-1 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      <Shield className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isEn ? 'Security & Access Implications:' : 'آثار امنیتی و دسترسی‌های اعمال‌شده:'}</span>
                    </div>
                    <ul className={`list-disc list-inside text-xs space-y-0.5 ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
                      {(isEn ? selectedReport.impactAnalysis.securityImplicationsEn : selectedReport.impactAnalysis.securityImplicationsFa)?.map((sec, idx) => (
                        <li key={idx}>{sec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Parameters Snapshot */}
              {Object.keys(selectedReport.parameters || {}).length > 0 && (
                <div className={`p-4 rounded-xl border space-y-2 ${
                  isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div className={`text-xs font-bold uppercase tracking-wider font-mono ${
                    isLightMode ? 'text-slate-700' : 'text-slate-300'
                  }`}>
                    {isEn ? 'Configuration Parameters Snapshot' : 'پارامترهای تنظیم‌شده برای این اجرا'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Object.entries(selectedReport.parameters).map(([key, val]) => (
                      <div
                        key={key}
                        className={`p-2 rounded-lg border text-xs font-mono ${
                          isLightMode ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/60 border-white/5 text-slate-200'
                        }`}
                      >
                        <span className={isLightMode ? 'text-slate-500' : 'text-slate-400'}>{key}: </span>
                        <span className="font-semibold">
                          {key.toLowerCase().includes('pass') ? '••••••••' : String(val || '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Server Logs & Detailed Execution Accordion */}
              <div className="space-y-3">
                <div className={`text-xs font-bold uppercase tracking-wider font-mono flex items-center justify-between ${
                  isLightMode ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  <span>{isEn ? 'Per-Server Execution Results & Terminal Output' : 'خروجی ترمینال و نتایج به تفکیک هر سرور'}</span>
                  <span className={`text-[11px] font-normal ${isLightMode ? 'text-slate-500' : 'text-slate-500'}`}>
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
                        className={`rounded-xl border overflow-hidden transition ${
                          isLightMode ? 'border-slate-200 bg-white' : 'border-white/5 bg-black/40'
                        }`}
                      >
                        <div
                          onClick={() =>
                            setExpandedServers((prev) => ({
                              ...prev,
                              [srv.serverId]: !prev[srv.serverId]
                            }))
                          }
                          className={`p-3 flex items-center justify-between cursor-pointer transition ${
                            isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/5'
                          }`}
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
                              <div className={`text-xs font-bold font-mono ${isLightMode ? 'text-slate-900' : 'text-slate-200'}`}>
                                {srv.serverName} ({srv.serverIp})
                              </div>
                              <div className={`text-[11px] font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
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
                          <div className={`p-3 border-t space-y-2 ${
                            isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-black/80 border-white/5'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-mono flex items-center gap-1.5 ${
                                isLightMode ? 'text-slate-600' : 'text-slate-400'
                              }`}>
                                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{isEn ? 'Terminal Raw Output & Steps:' : 'خروجی گام‌های خط فرمان:'}</span>
                              </span>
                              {srvResult?.rawOutput && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(srvResult.rawOutput || '', srv.serverId)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition cursor-pointer ${
                                    isLightMode
                                      ? 'bg-white hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border-white/10'
                                  }`}
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

                            <pre className={`p-3 rounded-lg font-mono text-[11px] whitespace-pre-wrap max-h-64 overflow-y-auto border ${
                              isLightMode
                                ? 'bg-slate-900 text-slate-100 border-slate-700'
                                : 'bg-slate-950 text-slate-300 border-white/5'
                            }`}>
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
            <div className={`px-5 py-3 border-t flex items-center justify-between shrink-0 ${
              isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-white/10'
            }`}>
              <span className={`text-xs font-mono ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? `Completed on ${new Date(selectedReport.finishedAt).toLocaleTimeString()}`
                  : `پایان یافته در ${new Date(selectedReport.finishedAt).toLocaleTimeString()}`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className={`px-4 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                  isLightMode
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-300'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/10'
                }`}
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
