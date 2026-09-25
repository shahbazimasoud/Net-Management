import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Play,
  Pause,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  Zap,
  Filter,
  User,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Layers,
  HelpCircle,
  Server,
  Info,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxCronJob,
  LinuxCronOverview,
  LinuxCronExecutionResult,
} from '../../types';
import {
  fetchLinuxCronOverview,
  toggleLinuxCronJob,
  deleteLinuxCronJob,
  runLinuxCronJobNow,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import { LinuxEditCronModal } from './LinuxEditCronModal';
import { LinuxCronRunOutputModal } from './LinuxCronRunOutputModal';

interface LinuxCronJobsTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxCronJobsTab: React.FC<LinuxCronJobsTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = true,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<LinuxCronOverview | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'user' | 'system'>('all');

  // Edit / Create Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<LinuxCronJob | null>(null);

  // Run Now Modal State
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [runningJob, setRunningJob] = useState<LinuxCronJob | null>(null);
  const [runResult, setRunResult] = useState<LinuxCronExecutionResult | null>(null);
  const [runLoading, setRunLoading] = useState(false);

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [deleteConfirmJob, setDeleteConfirmJob] = useState<LinuxCronJob | null>(null);

  // Fetch cron jobs
  const loadCronJobs = useCallback(async (isSilent = false) => {
    if (!server) return;
    if (!isSilent) setLoading(true);
    setError(null);

    try {
      const res = await fetchLinuxCronOverview(server.id, ephemeralPassword);
      if (res.success) {
        setOverview({
          jobs: res.jobs || [],
          systemUsers: res.systemUsers || ['root'],
          cronDaemonStatus: res.cronDaemonStatus || {
            serviceName: 'cron',
            active: true,
            running: true,
            enabled: true,
          },
          currentUser: res.currentUser || server.ssh_username || 'root',
        });
      } else {
        setError(res.error || (isEn ? 'Failed to fetch cron jobs' : 'واکشی کرون‌جاب‌ها ناموفق بود'));
      }
    } catch (err: any) {
      setError(err?.message || (isEn ? 'Error communicating with server' : 'خطای ارتباط با سرور'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [server, ephemeralPassword, isEn]);

  useEffect(() => {
    loadCronJobs();
  }, [loadCronJobs]);

  // Toggle Enable / Pause (Stop)
  const handleToggle = async (job: LinuxCronJob) => {
    if (job.source !== 'user_crontab') {
      alert(
        isEn
          ? 'System cron jobs located in /etc/crontab or /etc/cron.d cannot be toggled directly via user crontab.'
          : 'کرون‌جاب‌های سیستمی مستقر در /etc/crontab یا /etc/cron.d مستقیماً از طریق کرون‌تب کاربر قابل تغییر نیستند.'
      );
      return;
    }

    setActionLoadingId(job.id);
    try {
      const res = await toggleLinuxCronJob(
        server.id,
        {
          user: job.user,
          schedule: job.schedule,
          command: job.command,
          enable: !job.isEnabled,
        },
        ephemeralPassword
      );

      if (res.success) {
        await loadCronJobs(true);
      } else {
        alert(res.error || res.message);
      }
    } catch (err: any) {
      alert(err?.message || (isEn ? 'Action failed' : 'عملیات ناموفق بود'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Run Now
  const handleRunNow = async (job: LinuxCronJob) => {
    setRunningJob(job);
    setRunResult(null);
    setRunLoading(true);
    setIsRunModalOpen(true);

    try {
      const res = await runLinuxCronJobNow(
        server.id,
        { user: job.user, command: job.command },
        ephemeralPassword
      );

      if (res.success && res.result) {
        setRunResult(res.result);
      } else {
        setRunResult({
          command: job.command,
          exitCode: -1,
          stdout: '',
          stderr: res.error || (isEn ? 'Execution failed' : 'اجرای دستور ناموفق بود'),
          durationMs: 0,
          success: false,
        });
      }
    } catch (err: any) {
      setRunResult({
        command: job.command,
        exitCode: -1,
        stdout: '',
        stderr: err?.message || (isEn ? 'Communication error' : 'خطای ارتباطی'),
        durationMs: 0,
        success: false,
      });
    } finally {
      setRunLoading(false);
    }
  };

  // Delete Job
  const handleDeleteConfirm = async () => {
    if (!deleteConfirmJob) return;

    setActionLoadingId(deleteConfirmJob.id);
    try {
      const res = await deleteLinuxCronJob(
        server.id,
        {
          user: deleteConfirmJob.user,
          schedule: deleteConfirmJob.schedule,
          command: deleteConfirmJob.command,
        },
        ephemeralPassword
      );

      if (res.success) {
        setDeleteConfirmJob(null);
        await loadCronJobs(true);
      } else {
        alert(res.error || res.message);
      }
    } catch (err: any) {
      alert(err?.message || (isEn ? 'Deletion failed' : 'حذف جاب ناموفق بود'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    if (!overview?.jobs) return [];

    return overview.jobs.filter((job) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cmdMatch = job.command.toLowerCase().includes(q);
        const schedMatch = job.schedule.toLowerCase().includes(q);
        const commentMatch = (job.comment || '').toLowerCase().includes(q);
        const userMatch = job.user.toLowerCase().includes(q);
        if (!cmdMatch && !schedMatch && !commentMatch && !userMatch) return false;
      }

      // Status filter
      if (statusFilter === 'active' && !job.isEnabled) return false;
      if (statusFilter === 'paused' && job.isEnabled) return false;

      // User filter
      if (userFilter !== 'all' && job.user !== userFilter) return false;

      // Source filter
      if (sourceFilter === 'user' && job.source !== 'user_crontab') return false;
      if (sourceFilter === 'system' && job.source === 'user_crontab') return false;

      return true;
    });
  }, [overview, searchQuery, statusFilter, userFilter, sourceFilter]);

  // Human-readable schedule helper
  const formatScheduleHuman = (schedule: string): string => {
    const s = schedule.trim();
    if (s === '@reboot') return isEn ? 'At boot (@reboot)' : 'هنگام روشن شدن سیستم (@reboot)';
    if (s === '* * * * *') return isEn ? 'Every minute' : 'هر دقیقه';
    if (s === '*/5 * * * *') return isEn ? 'Every 5 min' : 'هر ۵ دقیقه';
    if (s === '*/15 * * * *') return isEn ? 'Every 15 min' : 'هر ۱۵ دقیقه';
    if (s === '*/30 * * * *') return isEn ? 'Every 30 min' : 'هر ۳۰ دقیقه';
    if (s === '0 * * * *') return isEn ? 'Hourly' : 'هر ساعت';
    if (s === '0 0 * * *') return isEn ? 'Daily (00:00)' : 'روزانه (۰۰:۰۰)';
    if (s === '0 2 * * *') return isEn ? 'Daily (02:00)' : 'روزانه (۰۲:۰۰)';
    if (s === '0 0 * * 0') return isEn ? 'Weekly (Sunday)' : 'هفتگی (یکشنبه)';
    if (s === '0 0 1 * *') return isEn ? 'Monthly (1st)' : 'ماهانه (روز اول)';
    return s;
  };

  return (
    <div className="space-y-4">
      {/* ======================================================== */}
      {/* TOP BANNER: CRON DAEMON STATUS & STATS */}
      {/* ======================================================== */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">
                {isEn ? 'Linux Cron Daemon Service' : 'دیمن زمان‌بندی کرون لینوکس (Cron Daemon)'}
              </h3>
              {overview?.cronDaemonStatus ? (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                    overview.cronDaemonStatus.active
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      overview.cronDaemonStatus.active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                    }`}
                  />
                  <span>
                    {overview.cronDaemonStatus.serviceName}: {overview.cronDaemonStatus.active ? (isEn ? 'active' : 'فعال') : (isEn ? 'inactive' : 'غیرفعال')}
                  </span>
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEn
                ? 'Scheduled background jobs dispatched via system crontab and user tables.'
                : 'جاب‌های زمان‌بندی‌شده دوره‌ای از طریق جدول کرون‌تب کاربران و سرویس‌های سیستمی.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadCronJobs()}
            disabled={loading}
            className={`p-2 rounded-lg border text-xs transition cursor-pointer flex items-center gap-1.5 ${
              isLightMode
                ? 'border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50'
                : 'border-slate-700 text-slate-300 hover:bg-white/5 disabled:opacity-50'
            }`}
            title={isEn ? 'Refresh cron jobs' : 'تازه‌سازی کرون‌جاب‌ها'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingJob(null);
              setIsEditModalOpen(true);
            }}
            className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'New Cron Job' : 'ایجاد کرون‌جاب جدید'}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FILTER & SEARCH BAR */}
      {/* ======================================================== */}
      <div
        className={`p-3 rounded-xl border flex flex-col md:flex-row items-center gap-3 ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800'
        }`}
      >
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search by command, schedule, comment, user...' : 'جستجو بر اساس دستور، زمان‌بندی، توضیح، کاربر...'}
            className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs transition outline-none ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
            }`}
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition outline-none ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
            }`}
          >
            <option value="all">{isEn ? 'All Statuses' : 'همه وضعیت‌ها'}</option>
            <option value="active">{isEn ? 'Active Only' : 'فقط فعال‌ها'}</option>
            <option value="paused">{isEn ? 'Paused / Stopped' : 'متوقف / غیرفعال'}</option>
          </select>

          {/* User Filter */}
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition outline-none ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
            }`}
          >
            <option value="all">{isEn ? 'All Users' : 'همه کاربران'}</option>
            {overview?.systemUsers?.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as any)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition outline-none ${
              isLightMode
                ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-cyan-500'
                : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
            }`}
          >
            <option value="all">{isEn ? 'All Sources' : 'همه منابع'}</option>
            <option value="user">{isEn ? 'User Crontab' : 'کرون‌تب کاربر'}</option>
            <option value="system">{isEn ? 'System (/etc/cron*)' : 'سیستمی (/etc/cron*)'}</option>
          </select>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ERROR DISPLAY (Zero Fake Data Guarantee) */}
      {/* ======================================================== */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadCronJobs()}
            className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium cursor-pointer"
          >
            {isEn ? 'Retry Connection' : 'تلاش مجدد'}
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* JOBS TABLE */}
      {/* ======================================================== */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}
      >
        {loading && !overview ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Clock className="w-8 h-8 text-cyan-400 animate-spin" />
            <span className="text-xs">
              {isEn ? 'Connecting to remote host and reading crontabs via SSH...' : 'در حال اتصال به سرور و واکشی کرون‌تب‌ها از طریق SSH...'}
            </span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs space-y-3">
            <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
            <p>
              {searchQuery || statusFilter !== 'all' || userFilter !== 'all' || sourceFilter !== 'all'
                ? isEn
                  ? 'No scheduled cron jobs match the active filters.'
                  : 'هیچ جاب زمان‌بندی‌شده‌ای با فیلترهای انتخابی مطابقت ندارد.'
                : isEn
                ? 'No cron jobs currently defined on this Linux server.'
                : 'در حال حاضر هیچ جاب زمان‌بندی‌شده‌ای روی این سرور لینوکس تعریف نشده است.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingJob(null);
                setIsEditModalOpen(true);
              }}
              className="px-4 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 text-xs font-semibold cursor-pointer"
            >
              {isEn ? 'Create First Cron Job' : 'ایجاد اولین کرون‌جاب'}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr
                  className={`border-b select-none ${
                    isLightMode ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Schedule' : 'زمان‌بندی'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'User' : 'کاربر'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Source' : 'منبع'}</th>
                  <th className="py-2.5 px-3 font-semibold">{isEn ? 'Command & Comment' : 'دستور و توضیحات'}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{isEn ? 'Actions' : 'عملیات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredJobs.map((job) => {
                  const isActing = actionLoadingId === job.id;
                  const isUserCrontab = job.source === 'user_crontab';

                  return (
                    <tr
                      key={job.id}
                      className={`transition ${
                        isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'
                      } ${!job.isEnabled ? 'opacity-65' : ''}`}
                    >
                      {/* STATUS */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {job.isEnabled ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>{isEn ? 'Active' : 'فعال'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>{isEn ? 'Stopped' : 'متوقف'}</span>
                          </span>
                        )}
                      </td>

                      {/* SCHEDULE */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[11px] font-bold text-cyan-400">
                            {job.schedule}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatScheduleHuman(job.schedule)}
                          </span>
                        </div>
                      </td>

                      {/* USER */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/60 text-slate-200">
                          {job.user}
                        </span>
                      </td>

                      {/* SOURCE */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            isUserCrontab
                              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                              : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {job.sourceFile || 'crontab'}
                        </span>
                      </td>

                      {/* COMMAND & COMMENT */}
                      <td className="py-3 px-3 max-w-md">
                        <div className="flex flex-col gap-1">
                          {job.comment && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1 italic">
                              <span>#</span>
                              <span>{job.comment}</span>
                            </span>
                          )}
                          <span className="font-mono text-xs text-slate-200 bg-slate-900/60 px-2 py-1 rounded border border-slate-800/60 break-all select-text">
                            {job.command}
                          </span>
                        </div>
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Run Now Button */}
                          <button
                            type="button"
                            onClick={() => handleRunNow(job)}
                            title={isEn ? 'Run now to test exit code and output' : 'اجرای دستی جهت تست خروجی و کد خطا'}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isLightMode
                                ? 'border-slate-200 text-amber-600 hover:bg-amber-50'
                                : 'border-slate-800 text-amber-400 hover:bg-amber-500/10'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Active / Stopped (Pause) Button */}
                          {isUserCrontab && (
                            <button
                              type="button"
                              onClick={() => handleToggle(job)}
                              disabled={isActing}
                              title={
                                job.isEnabled
                                  ? isEn
                                    ? 'Stop / Pause this cron job'
                                    : 'توقف / غیرفعال‌سازی این جاب'
                                  : isEn
                                  ? 'Resume / Activate this cron job'
                                  : 'فعال‌سازی مجدد این جاب'
                              }
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                job.isEnabled
                                  ? isLightMode
                                    ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                                    : 'border-slate-800 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                  : isLightMode
                                  ? 'border-slate-200 text-emerald-600 hover:bg-emerald-50'
                                  : 'border-slate-800 text-emerald-400 hover:bg-emerald-500/10'
                              } disabled:opacity-50`}
                            >
                              {job.isEnabled ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {/* Edit Button */}
                          {isUserCrontab && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingJob(job);
                                setIsEditModalOpen(true);
                              }}
                              title={isEn ? 'Edit cron job' : 'ویرایش کرون‌جاب'}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                isLightMode
                                  ? 'border-slate-200 text-cyan-600 hover:bg-cyan-50'
                                  : 'border-slate-800 text-cyan-400 hover:bg-cyan-500/10'
                              }`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Button */}
                          {isUserCrontab && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmJob(job)}
                              title={isEn ? 'Delete cron job' : 'حذف کرون‌جاب'}
                              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                isLightMode
                                  ? 'border-slate-200 text-red-600 hover:bg-red-50'
                                  : 'border-slate-800 text-red-400 hover:bg-red-500/10'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* DELETE CONFIRMATION DIALOG */}
      {/* ======================================================== */}
      {deleteConfirmJob && (
        <div
          className={`fixed top-0 left-0 right-0 bottom-8 z-[999995] flex items-center justify-center p-4 backdrop-blur-sm ${
            isLightMode ? 'bg-slate-900/40' : 'bg-black/60'
          }`}
        >
          <div
            className={`w-full max-w-md p-5 rounded-xl border shadow-2xl space-y-4 ${
              isLightMode
                ? 'bg-white border-slate-200 text-slate-800'
                : 'bg-slate-950 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold">
                  {isEn ? 'Delete Scheduled Cron Job?' : 'حذف جاب زمان‌بندی‌شده؟'}
                </h4>
                <p className="text-xs text-slate-400">
                  {isEn
                    ? 'This will permanently remove the entry from crontab on the host.'
                    : 'این دستور به طور دائمی از کرون‌تب هاست لینوکس حذف خواهد شد.'}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-xs break-all text-slate-300">
              {deleteConfirmJob.schedule} {deleteConfirmJob.command}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmJob(null)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                  isLightMode
                    ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-300 hover:bg-white/5'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Delete Job' : 'حذف قطعی'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EDIT / CREATE MODAL */}
      {/* ======================================================== */}
      <LinuxEditCronModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingJob(null);
        }}
        onSaved={() => {
          loadCronJobs(true);
        }}
        server={server}
        ephemeralPassword={ephemeralPassword}
        isLightMode={isLightMode}
        isEn={isEn}
        initialJob={editingJob}
        systemUsers={overview?.systemUsers || ['root']}
      />

      {/* ======================================================== */}
      {/* RUN NOW OUTPUT MODAL */}
      {/* ======================================================== */}
      <LinuxCronRunOutputModal
        isOpen={isRunModalOpen}
        onClose={() => {
          setIsRunModalOpen(false);
          setRunningJob(null);
          setRunResult(null);
        }}
        job={runningJob}
        result={runResult}
        loading={runLoading}
        isLightMode={isLightMode}
        isEn={isEn}
      />
    </div>
  );
};
