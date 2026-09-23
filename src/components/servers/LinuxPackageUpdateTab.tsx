import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PackageCheck,
  RefreshCw,
  ArrowUpCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  CheckSquare,
  Square,
  Terminal,
  ChevronDown,
  ChevronUp,
  Cpu,
  Server,
  Layers,
  Sparkles,
  Trash2,
  XOctagon,
  Copy,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxPackageItem,
  LinuxPackageUpdateOverview,
  PackageUpdateJobStatus,
  PackageUpdateJobStep,
} from '../../types';
import {
  fetchLinuxPackageOverview,
  updateAllLinuxPackages,
  updateSelectedLinuxPackages,
  updateSingleLinuxPackage,
  refreshLinuxPackageRepo,
  autoremoveLinuxPackages,
  fetchPackageUpdateJobStatus,
  cancelPackageUpdateJob,
} from '../../services/api';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface LinuxPackageUpdateTabProps {
  server: RemoteServer;
  ephemeralPassword?: string;
  isLightMode?: boolean;
  isEn?: boolean;
}

export const LinuxPackageUpdateTab: React.FC<LinuxPackageUpdateTabProps> = ({
  server,
  ephemeralPassword,
  isLightMode = false,
  isEn = false,
}) => {
  const [overview, setOverview] = useState<LinuxPackageUpdateOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingMetadata, setRefreshingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Job state
  const [activeJob, setActiveJob] = useState<PackageUpdateJobStatus | null>(null);
  const [expandedStepPackage, setExpandedStepPackage] = useState<string | null>(null);
  const [showFullLogs, setShowFullLogs] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);

  // Table filter & search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'upgradable' | 'security' | 'uptodate'>('upgradable');
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());

  // Confirm modals
  const [confirmAction, setConfirmAction] = useState<{
    type: 'all' | 'dist-upgrade' | 'autoremove' | 'selected';
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  // Polling ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load packages overview
  const loadOverview = useCallback(async (refreshRepo: boolean = false) => {
    try {
      if (refreshRepo) {
        setRefreshingMetadata(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const res = await fetchLinuxPackageOverview(server.id, ephemeralPassword, refreshRepo);
      if (res.success && res.osInfo) {
        setOverview({
          osInfo: res.osInfo,
          totalInstalled: res.totalInstalled || 0,
          upgradableCount: res.upgradableCount || 0,
          securityCount: res.securityCount || 0,
          packages: res.packages || [],
          upgradablePackages: res.upgradablePackages || [],
        });
        // Default filter: if upgradable packages exist, show upgradable; otherwise show all
        if ((res.upgradableCount || 0) === 0 && filterType === 'upgradable') {
          setFilterType('all');
        }
      } else {
        setError(res.error || (isEn ? 'Failed to fetch package status' : 'خطا در دریافت وضعیت پکیج‌ها'));
      }
    } catch (err: any) {
      setError(err.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'));
    } finally {
      setLoading(false);
      setRefreshingMetadata(false);
    }
  }, [server.id, ephemeralPassword, isEn, filterType]);

  useEffect(() => {
    loadOverview(false);
  }, [loadOverview]);

  // Polling effect for running job
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetchPackageUpdateJobStatus(server.id, activeJob.jobId);
        if (res.success && res.job) {
          setActiveJob(res.job);
          if (res.job.status === 'completed' || res.job.status === 'failed' || res.job.status === 'cancelled') {
            clearInterval(interval);
            // Refresh package overview after completion
            setTimeout(() => {
              loadOverview(false);
            }, 1200);
          }
        }
      } catch (err) {
        console.error('Failed to poll package job status:', err);
      }
    }, 1000);

    pollingTimerRef.current = interval;

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [activeJob?.jobId, activeJob?.status, server.id, loadOverview]);

  // Cancel running job
  const handleCancelJob = async () => {
    if (!activeJob) return;
    try {
      await cancelPackageUpdateJob(server.id, activeJob.jobId);
      setActiveJob((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
    } catch (e) {
      console.error('Cancel job error:', e);
    }
  };

  // Trigger Update All
  const triggerUpdateAll = async (distUpgrade: boolean = false) => {
    try {
      setError(null);
      const res = await updateAllLinuxPackages(server.id, distUpgrade, ephemeralPassword);
      if (res.success && res.job) {
        setActiveJob(res.job);
        setShowFullLogs(false);
      } else {
        setError(res.error || (isEn ? 'Failed to start upgrade' : 'شروع به‌روزرسانی با خطا مواجه شد'));
      }
    } catch (e: any) {
      setError(e.message || (isEn ? 'Error triggering upgrade' : 'خطا در ارسال دستور به‌روزرسانی'));
    }
  };

  // Trigger Update Selected
  const triggerUpdateSelected = async () => {
    if (selectedPackages.size === 0 || !overview) return;
    const pkgsToUpdate = overview.packages
      .filter((p) => selectedPackages.has(p.name))
      .map((p) => ({
        name: p.name,
        currentVersion: p.currentVersion,
        targetVersion: p.candidateVersion,
      }));

    try {
      setError(null);
      const res = await updateSelectedLinuxPackages(server.id, pkgsToUpdate, ephemeralPassword);
      if (res.success && res.job) {
        setActiveJob(res.job);
        setSelectedPackages(new Set());
      } else {
        setError(res.error || (isEn ? 'Failed to start selected packages update' : 'خطا در اجرای به‌روزرسانی بسته‌های انتخابی'));
      }
    } catch (e: any) {
      setError(e.message || (isEn ? 'Execution error' : 'خطا در اجرا'));
    }
  };

  // Trigger Single Package Update
  const triggerUpdateSingle = async (pkg: LinuxPackageItem) => {
    try {
      setError(null);
      const res = await updateSingleLinuxPackage(
        server.id,
        pkg.name,
        pkg.currentVersion,
        pkg.candidateVersion,
        ephemeralPassword
      );
      if (res.success && res.job) {
        setActiveJob(res.job);
      } else {
        setError(res.error || (isEn ? `Failed to update ${pkg.name}` : `خطا در به‌روزرسانی پکیج ${pkg.name}`));
      }
    } catch (e: any) {
      setError(e.message || (isEn ? 'Execution error' : 'خطا در اجرا'));
    }
  };

  // Trigger Repository Refresh (apt-get update)
  const triggerRepoUpdate = async () => {
    try {
      setError(null);
      const res = await refreshLinuxPackageRepo(server.id, ephemeralPassword);
      if (res.success && res.job) {
        setActiveJob(res.job);
      } else {
        setError(res.error || (isEn ? 'Failed to refresh repository' : 'خطا در به‌روزرسانی کش مخازن'));
      }
    } catch (e: any) {
      setError(e.message || (isEn ? 'Error' : 'خطا'));
    }
  };

  // Trigger Autoremove
  const triggerAutoremove = async () => {
    try {
      setError(null);
      const res = await autoremoveLinuxPackages(server.id, ephemeralPassword);
      if (res.success && res.job) {
        setActiveJob(res.job);
      } else {
        setError(res.error || (isEn ? 'Failed to clean packages' : 'خطا در پاک‌سازی پکیج‌ها'));
      }
    } catch (e: any) {
      setError(e.message || (isEn ? 'Error' : 'خطا'));
    }
  };

  // Selection toggle
  const toggleSelectPackage = (name: string) => {
    setSelectedPackages((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (selectedPackages.size === filteredPackages.length && filteredPackages.length > 0) {
      setSelectedPackages(new Set());
    } else {
      const next = new Set<string>();
      filteredPackages.forEach((p) => {
        if (p.status !== 'up_to_date') {
          next.add(p.name);
        }
      });
      setSelectedPackages(next);
    }
  };

  // Filtering
  const filteredPackages = (overview?.packages || []).filter((pkg) => {
    // Filter by type
    if (filterType === 'upgradable' && pkg.status === 'up_to_date') return false;
    if (filterType === 'security' && !pkg.isSecurityUpdate) return false;
    if (filterType === 'uptodate' && pkg.status !== 'up_to_date') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = pkg.name.toLowerCase().includes(q);
      const matchVer = pkg.currentVersion.toLowerCase().includes(q) || (pkg.candidateVersion && pkg.candidateVersion.toLowerCase().includes(q));
      const matchSumm = pkg.summary && pkg.summary.toLowerCase().includes(q);
      const matchArch = pkg.architecture && pkg.architecture.toLowerCase().includes(q);
      return matchName || matchVer || matchSumm || matchArch;
    }
    return true;
  });

  const isJobRunning = activeJob?.status === 'running';

  // Copy full log
  const handleCopyLogs = () => {
    if (!activeJob?.fullLog) return;
    navigator.clipboard.writeText(activeJob.fullLog);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ======================================================== */}
      {/* 1. OS & SYSTEM VERSION & REPOSITORY OVERVIEW CARD        */}
      {/* ======================================================== */}
      <div
        className={`relative rounded-2xl p-5 sm:p-6 border overflow-hidden shadow-lg transition ${
          isLightMode
            ? 'bg-gradient-to-br from-white via-cyan-50/20 to-slate-50 border-slate-200 shadow-slate-200/60'
            : 'bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 border-cyan-500/20 shadow-black/40'
        }`}
      >
        {/* Background ambient decorative glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* OS Distro & Identity */}
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-center shrink-0 shadow-inner ${
                isLightMode
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600'
                  : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
              }`}
            >
              <Server className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={`text-lg sm:text-xl font-black tracking-tight ${
                    isLightMode ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {overview?.osInfo.prettyName || (isEn ? 'Linux Operating System' : 'سیستم‌عامل لینوکس')}
                </h3>

                {/* Package manager pill */}
                <span
                  className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full uppercase font-bold border ${
                    isLightMode
                      ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                      : 'bg-cyan-950/60 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  {overview?.osInfo.packageManager.toUpperCase() || 'APT'}
                </span>

                {/* Overall status pill */}
                {overview && (
                  <span
                    className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                      overview.upgradableCount === 0
                        ? isLightMode
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400'
                        : isLightMode
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-amber-950/50 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {overview.upgradableCount === 0 ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isEn ? 'System Fully Up to Date' : 'سیستم کاملاً به‌روز است'}</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpCircle className="w-3 h-3" />
                        <span>
                          {overview.upgradableCount} {isEn ? 'Updates Available' : 'به‌روزرسانی موجود است'}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Kernel & Specs info */}
              <div
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono ${
                  isLightMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-500" />
                  <span>{isEn ? 'Kernel' : 'کرنل'}:</span>
                  <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                    {overview?.osInfo.kernel || '...'}
                  </strong>
                </span>
                <span className="text-slate-500">|</span>
                <span>
                  {isEn ? 'Arch' : 'معماری'}:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                    {overview?.osInfo.arch || 'x86_64'}
                  </strong>
                </span>
                <span className="text-slate-500">|</span>
                <span>
                  {isEn ? 'Host' : 'هاست'}:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                    {overview?.osInfo.hostname || server.ip}
                  </strong>
                </span>
                {overview?.osInfo.uptime && (
                  <>
                    <span className="text-slate-500">|</span>
                    <span>
                      {isEn ? 'Uptime' : 'آپ‌تایم'}:{' '}
                      <strong className={isLightMode ? 'text-slate-800' : 'text-slate-200'}>
                        {overview.osInfo.uptime}
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stat Counters */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Upgradable Stat */}
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[90px] transition ${
                overview && overview.upgradableCount > 0
                  ? isLightMode
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300'
              }`}
            >
              <div className="text-xl sm:text-2xl font-black font-mono leading-none">
                {overview?.upgradableCount ?? '-'}
              </div>
              <div className="text-[11px] font-medium mt-1">
                {isEn ? 'Upgradable' : 'قابل ارتقا'}
              </div>
            </div>

            {/* Security Patches Stat */}
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[90px] transition ${
                overview && overview.securityCount > 0
                  ? isLightMode
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 animate-pulse'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300 animate-pulse'
                  : isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300'
              }`}
            >
              <div className="text-xl sm:text-2xl font-black font-mono leading-none">
                {overview?.securityCount ?? '-'}
              </div>
              <div className="text-[11px] font-medium mt-1 flex items-center justify-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                <span>{isEn ? 'Security' : 'امنیتی'}</span>
              </div>
            </div>

            {/* Total Installed Stat */}
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-center min-w-[90px] ${
                isLightMode
                  ? 'bg-slate-100 border-slate-200 text-slate-700'
                  : 'bg-slate-800/60 border-slate-700 text-slate-300'
              }`}
            >
              <div className="text-xl sm:text-2xl font-black font-mono leading-none">
                {overview?.totalInstalled ?? '-'}
              </div>
              <div className="text-[11px] font-medium mt-1">
                {isEn ? 'Installed' : 'کل پکیج‌ها'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div
          className={`mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3 ${
            isLightMode ? 'border-slate-200/80' : 'border-white/10'
          }`}
        >
          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* UPDATE ALL PACKAGES (PRIMARY ACTION) */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isJobRunning || !overview || overview.upgradableCount === 0}
                onClick={() =>
                  setConfirmAction({
                    type: 'all',
                    title: isEn ? 'Update All Packages' : 'به‌روزرسانی تمام پکیج‌ها',
                    description: isEn
                      ? `Are you sure you want to upgrade all ${overview?.upgradableCount || 0} upgradable packages on ${server.name}?`
                      : `آیا از ارتقای تمام ${overview?.upgradableCount || 0} پکیج نیازمند به‌روزرسانی در سرور ${server.name} اطمینان دارید؟`,
                    action: () => triggerUpdateAll(false),
                  })
                }
                className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-md transition ${
                  overview && overview.upgradableCount > 0 && !isJobRunning
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-cyan-500/25 active:scale-95'
                    : 'bg-slate-700/50 text-slate-400 cursor-not-allowed border border-white/5'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  {isEn ? 'Update All Packages' : 'به‌روزرسانی همه پکیج‌ها'}
                  {overview && overview.upgradableCount > 0 ? ` (${overview.upgradableCount})` : ''}
                </span>
              </button>

              <FieldInfoTooltip
                title={isEn ? 'Update All Packages' : 'به‌روزرسانی تمام پکیج‌ها'}
                whatIsIt={
                  isEn
                    ? 'Automated execution of package manager bulk upgrade (apt-get upgrade -y or dnf upgrade -y).'
                    : 'اجرای خودکار ارتقای جمعی بسته‌ها با دستور apt-get upgrade -y یا dnf upgrade -y بر روی سرور.'
                }
                whyNeeded={
                  isEn
                    ? 'Ensures all software components, runtime libraries, and security fixes are upgraded to their latest stable version.'
                    : 'تضمین می‌کند که تمام نرم‌افزارها، کتابخانه‌ها و اصلاحیه‌های سیستم به جدیدترین نگارش پایدار ارتقا یابند.'
                }
                example={
                  isEn
                    ? 'Updates curl, openssl, nginx, and other outdated packages in a single monitored execution.'
                    : 'به‌روزرسانی هم‌زمان curl، openssl، وب‌سرور nginx و سایر پکیج‌های منسوخ‌شده در قالب یک فرآیند نظارت‌شده.'
                }
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>

            {/* UPDATE SELECTED PACKAGES */}
            {selectedPackages.size > 0 && (
              <button
                type="button"
                disabled={isJobRunning}
                onClick={() =>
                  setConfirmAction({
                    type: 'selected',
                    title: isEn ? 'Update Selected Packages' : 'به‌روزرسانی موارد انتخابی',
                    description: isEn
                      ? `Upgrade ${selectedPackages.size} selected packages sequentially?`
                      : `آیا از به‌روزرسانی متوالی ${selectedPackages.size} بسته انتخاب‌شده اطمینان دارید؟`,
                    action: triggerUpdateSelected,
                  })
                }
                className="px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-2 cursor-pointer shadow-md transition active:scale-95"
              >
                <CheckSquare className="w-4 h-4" />
                <span>
                  {isEn ? 'Update Selected' : 'به‌روزرسانی انتخابی'} ({selectedPackages.size})
                </span>
              </button>
            )}

            {/* CHECK FOR UPDATES / REPO REFRESH */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isJobRunning || refreshingMetadata || loading}
                onClick={() => loadOverview(true)}
                className={`px-3 py-2 rounded-xl font-medium text-xs flex items-center gap-2 border cursor-pointer transition ${
                  isLightMode
                    ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingMetadata ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{refreshingMetadata ? (isEn ? 'Refreshing...' : 'در حال بررسی مخازن...') : (isEn ? 'Check for Updates' : 'بررسی به‌روزرسانی‌ها')}</span>
              </button>

              <FieldInfoTooltip
                title={isEn ? 'Repository Cache Refresh' : 'بررسی و تازه‌سازی مخازن'}
                whatIsIt={
                  isEn
                    ? 'Executes apt-get update or dnf check-update on the target server to pull the newest package lists.'
                    : 'اجرای دستور apt-get update یا dnf check-update جهت دریافت آخرین فهرست پکیج‌ها از مخازن آنلاین سرور.'
                }
                whyNeeded={
                  isEn
                    ? 'Before upgrading, the package manager cache must be synced with upstream repositories to discover new releases.'
                    : 'قبل از هر اقدامی، کش پکیج منیجر باید با مخازن اصلی همگام شود تا نگارش‌های جدید شناسایی شوند.'
                }
                example={isEn ? 'apt-get update' : 'apt-get update'}
                isEn={isEn}
                isLightMode={isLightMode}
              />
            </div>
          </div>

          {/* Advanced System Actions: Dist-Upgrade & Autoremove */}
          <div className="flex items-center gap-2">
            {/* FULL OS DIST-UPGRADE */}
            <button
              type="button"
              disabled={isJobRunning}
              onClick={() =>
                setConfirmAction({
                  type: 'dist-upgrade',
                  title: isEn ? 'Full OS Distribution Upgrade' : 'ارتقای جامع سیستم‌عامل (Dist-Upgrade)',
                  description: isEn
                    ? 'This executes "apt-get dist-upgrade -y", intelligently handling changing dependencies and removing obsolete packages. Recommended for major updates.'
                    : 'دستور apt-get dist-upgrade -y را اجرا می‌کند و تغییرات وابستگی‌های پیچیده و ارتقای هسته سیستم را به صورت هوشمند مدیریت می‌نماید.',
                  action: () => triggerUpdateAll(true),
                })
              }
              className={`px-3 py-2 rounded-xl font-medium text-xs flex items-center gap-1.5 border transition cursor-pointer ${
                isLightMode
                  ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
                  : 'bg-purple-950/40 hover:bg-purple-900/50 border-purple-500/30 text-purple-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>{isEn ? 'OS Dist-Upgrade' : 'ارتقای کامل OS'}</span>
            </button>

            {/* AUTOREMOVE */}
            <button
              type="button"
              disabled={isJobRunning}
              onClick={() =>
                setConfirmAction({
                  type: 'autoremove',
                  title: isEn ? 'Clean Obsolete Packages (Autoremove)' : 'پاک‌سازی پکیج‌های اضافی (Autoremove)',
                  description: isEn
                    ? 'Executes "apt-get autoremove -y" to safely purge unused dependencies, old kernel images, and free disk space.'
                    : 'دستور apt-get autoremove -y را اجرا کرده و پکیج‌های اضافه، وابستگی‌های بلااستفاده و کرنل‌های قدیمی را برای آزادسازی دیسک پاک می‌کند.',
                  action: triggerAutoremove,
                })
              }
              className={`px-3 py-2 rounded-xl font-medium text-xs flex items-center gap-1.5 border transition cursor-pointer ${
                isLightMode
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{isEn ? 'Autoremove' : 'پاک‌سازی اضافی'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. REAL-TIME PROGRESS BAR & EXECUTION TRACKING CARD       */}
      {/* (MODELED EXACTLY AFTER BULK DEVICE CONFIGURATION MODAL)   */}
      {/* ======================================================== */}
      {activeJob && (
        <div
          className={`rounded-2xl p-5 border shadow-xl transition space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 ${
            isLightMode
              ? 'bg-white border-cyan-500/40 shadow-cyan-100'
              : 'bg-slate-900/90 border-cyan-500/30 shadow-black/50'
          }`}
        >
          {/* Header of Progress Card */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${
                  activeJob.status === 'running'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 animate-pulse'
                    : activeJob.status === 'completed'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : activeJob.status === 'failed'
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {activeJob.status === 'running' ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : activeJob.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm sm:text-base font-bold font-mono ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    {activeJob.mode === 'all'
                      ? isEn ? 'Bulk System Packages Upgrade' : 'ارتقای دسته‌جمعی پکیج‌های سیستم'
                      : activeJob.mode === 'dist-upgrade'
                      ? isEn ? 'Full OS Distribution Upgrade' : 'ارتقای جامع سیستم‌عامل'
                      : activeJob.mode === 'repo-update'
                      ? isEn ? 'Repository Metadata Synchronization' : 'همگام‌سازی و تازه‌سازی مخازن'
                      : activeJob.mode === 'autoremove'
                      ? isEn ? 'Cleaning Obsolete Dependencies' : 'پاک‌سازی وابستگی‌های زائد سیستم'
                      : isEn ? 'Individual Packages Upgrade' : 'به‌روزرسانی بسته‌های انتخابی'}
                  </h4>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                      activeJob.status === 'running'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse'
                        : activeJob.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : activeJob.status === 'failed'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        : 'bg-slate-700 text-slate-300 border-slate-600'
                    }`}
                  >
                    {activeJob.status}
                  </span>
                </div>

                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Job ID: <span className="text-slate-300 font-semibold">{activeJob.jobId}</span>
                </div>
              </div>
            </div>

            {/* Action buttons: Cancel / Stop or Toggle Logs */}
            <div className="flex items-center gap-2">
              {activeJob.status === 'running' && (
                <button
                  type="button"
                  onClick={handleCancelJob}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 flex items-center gap-1.5 cursor-pointer transition"
                >
                  <XOctagon className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Stop Job' : 'توقف عملیات'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowFullLogs(!showFullLogs)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition ${
                  showFullLogs
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                    : isLightMode
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{isEn ? 'Terminal Log' : 'لاگ ترمینال'}</span>
                {showFullLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Progress Bar & Stat Counters (Matching Bulk Device Config exactly) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className={isLightMode ? 'text-slate-600' : 'text-slate-300'}>
                {activeJob.status === 'running' && activeJob.currentPackageName ? (
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>
                      {isEn ? 'Processing' : 'پردازش'}: {activeJob.currentPackageName} (
                      {activeJob.currentStepDescription || (isEn ? 'Upgrading...' : 'در حال ارتقا...')})
                    </span>
                  </span>
                ) : (
                  <span>{activeJob.currentStepDescription || (isEn ? 'Overall Progress' : 'پیشرفت کلی عملیات')}</span>
                )}
              </span>
              <span className={`font-black text-sm ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                {activeJob.percentage}%
              </span>
            </div>

            {/* Gradient Bar */}
            <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5 shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${activeJob.percentage}%` }}
              />
            </div>

            {/* Stat Pills */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono pt-1 text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {isEn ? 'Success' : 'موفق'}:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-white'}>{activeJob.successCount}</strong>
                </span>
              </span>

              <span className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>
                  {isEn ? 'Failed' : 'ناموفق'}:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-white'}>{activeJob.failedCount}</strong>
                </span>
              </span>

              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>
                  {isEn ? 'Completed' : 'انجام شده'}:{' '}
                  <strong className={isLightMode ? 'text-slate-800' : 'text-white'}>
                    {activeJob.completedPackages} / {activeJob.totalPackages}
                  </strong>
                </span>
              </span>
            </div>
          </div>

          {/* Detailed Step-by-Step Package Cards (for single or selected packages) */}
          {activeJob.steps && activeJob.steps.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-md">
              <div className="px-4 py-2.5 bg-slate-900/80 border-b border-white/5 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 font-mono">
                  {isEn ? 'Package Execution Details' : 'وضعیت اجرای هر پکیج'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {activeJob.completedPackages} / {activeJob.totalPackages} {isEn ? 'completed' : 'انجام شد'}
                </span>
              </div>

              <div className="divide-y divide-white/5 max-h-60 overflow-y-auto">
                {activeJob.steps.map((step, idx) => {
                  const isExpanded = expandedStepPackage === step.packageName;
                  return (
                    <div key={idx} className="p-3 hover:bg-white/[0.02] transition">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {step.status === 'running' ? (
                            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                          ) : step.status === 'success' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : step.status === 'failed' ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}

                          <span className="font-mono font-bold text-white truncate">{step.packageName}</span>

                          <span className="text-slate-500 font-mono text-[11px]">
                            {step.currentVersion} &rarr;{' '}
                            <span className="text-cyan-300 font-semibold">{step.targetVersion}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {step.durationSec !== undefined && (
                            <span className="text-[11px] font-mono text-slate-400">
                              {step.durationSec}s
                            </span>
                          )}

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                              step.status === 'success'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : step.status === 'failed'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : step.status === 'running'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800 animate-pulse'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {step.status}
                          </span>

                          {(step.output || step.error) && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStepPackage(isExpanded ? null : step.packageName)
                              }
                              className="text-slate-400 hover:text-white p-1 rounded transition"
                              title={isEn ? 'View output' : 'مشاهده خروجی'}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded Output for single step */}
                      {isExpanded && (step.output || step.error) && (
                        <div className="mt-2.5 p-3 rounded-lg bg-black/90 border border-white/10 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap overflow-x-auto max-h-48">
                          {step.error && <div className="text-rose-400 font-bold mb-1">{step.error}</div>}
                          {step.output || (isEn ? 'No terminal output recorded.' : 'خروجی ترمینال ثبت نشده است.')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full Raw Terminal Logs Drawer */}
          {showFullLogs && (
            <div className="rounded-xl border border-white/10 bg-black/95 overflow-hidden shadow-2xl">
              <div className="px-4 py-2 bg-slate-900 border-b border-white/10 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-300">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isEn ? 'Package Manager Execution Stream' : 'جریان مستقیم خروجی پکیج منیجر'}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedLog ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLog ? (isEn ? 'Copied' : 'کپی شد') : (isEn ? 'Copy Log' : 'کپی لاگ')}</span>
                </button>
              </div>

              <div className="p-4 font-mono text-xs text-emerald-400/90 whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed select-text">
                {activeJob.fullLog || (isEn ? 'Waiting for package manager output...' : 'در انتظار دریافت خروجی از پکیج منیجر...')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error alert banner */}
      {error && (
        <div className="rounded-xl p-3.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold"
          >
            {isEn ? 'Dismiss' : 'بستن'}
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. PACKAGES CATALOG, FILTERING & SEARCH TABLE            */}
      {/* ======================================================== */}
      <div
        className={`rounded-2xl border shadow-sm overflow-hidden transition ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Table Controls Header */}
        <div
          className={`p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
            isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType('upgradable')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                filterType === 'upgradable'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>{isEn ? 'Updates Available' : 'دارای آپدیت'}</span>
              {overview && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                  {overview.upgradableCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterType('security')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                filterType === 'security'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{isEn ? 'Security Fixes' : 'اصلاحیه‌های امنیتی'}</span>
              {overview && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                  {overview.securityCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                filterType === 'all'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isEn ? 'All Installed Packages' : 'تمام پکیج‌های نصب‌شده'}</span>
              {overview && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 font-mono">
                  {overview.totalInstalled}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterType('uptodate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5 ${
                filterType === 'uptodate'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isEn ? 'Up to Date' : 'به‌روز'}</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search package name, version...' : 'جستجوی نام بسته، نگارش...'}
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                isLightMode
                  ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  : 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
              }`}
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <span className="text-xs font-mono">
              {isEn ? 'Querying package database on remote server...' : 'در حال واکشی فهرست نرم‌افزارها و پکیج‌ها از سرور...'}
            </span>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <PackageCheck className="w-12 h-12 text-slate-500 mx-auto opacity-40" />
            <div className={`text-sm font-semibold ${isLightMode ? 'text-slate-700' : 'text-slate-300'}`}>
              {filterType === 'upgradable'
                ? isEn ? 'No packages require updating!' : 'هیچ بسته‌ای در حال حاضر نیاز به ارتقا ندارد!'
                : filterType === 'security'
                ? isEn ? 'No security vulnerabilities found.' : 'هیچ پچ امنیتی معوقی یافت نشد.'
                : isEn ? 'No packages match your search criteria.' : 'بسته‌ای با مشخصات جستجویافته پیدا نشد.'}
            </div>
            <p className="text-xs text-slate-500 font-mono">
              {isEn ? 'Your system is clean and fully aligned with upstream repositories.' : 'سیستم کاملاً با مخازن رسمی همگام و ایمن است.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead
                className={`font-mono border-b text-[11px] uppercase tracking-wider ${
                  isLightMode
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800'
                }`}
              >
                <tr>
                  <th className="p-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      className="text-slate-400 hover:text-white cursor-pointer"
                      title={isEn ? 'Select all upgradable' : 'انتخاب همه موارد قابل ارتقا'}
                    >
                      {selectedPackages.size === filteredPackages.length && filteredPackages.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">{isEn ? 'Package Name' : 'نام بسته'}</th>
                  <th className="p-3">{isEn ? 'Current Version' : 'نگارش فعلی'}</th>
                  <th className="p-3">{isEn ? 'Available Update' : 'نگارش جدید'}</th>
                  <th className="p-3">{isEn ? 'Status' : 'وضعیت'}</th>
                  <th className="p-3">{isEn ? 'Architecture' : 'معماری'}</th>
                  <th className="p-3 text-right">{isEn ? 'Action' : 'عملیات'}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 font-mono">
                {filteredPackages.map((pkg) => {
                  const isSelected = selectedPackages.has(pkg.name);
                  const isUpgradable = pkg.status !== 'up_to_date';

                  return (
                    <tr
                      key={pkg.name}
                      className={`transition ${
                        isSelected
                          ? isLightMode
                            ? 'bg-cyan-50/60'
                            : 'bg-cyan-950/20'
                          : isLightMode
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        {isUpgradable ? (
                          <button
                            type="button"
                            onClick={() => toggleSelectPackage(pkg.name)}
                            className="cursor-pointer text-slate-400 hover:text-cyan-400"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Package Name & Summary */}
                      <td className="p-3">
                        <div className="font-bold text-white tracking-tight flex items-center gap-1.5">
                          <span className={isLightMode ? 'text-slate-900 font-bold' : 'text-white'}>
                            {pkg.name}
                          </span>
                          {pkg.isSecurityUpdate && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[10px] font-mono border border-rose-500/40">
                              SEC
                            </span>
                          )}
                        </div>
                        {pkg.summary && (
                          <div className="text-[11px] text-slate-400 font-sans truncate max-w-md mt-0.5">
                            {pkg.summary}
                          </div>
                        )}
                      </td>

                      {/* Current Version */}
                      <td className="p-3 text-slate-300 font-mono">{pkg.currentVersion}</td>

                      {/* Candidate / New Version */}
                      <td className="p-3 font-mono">
                        {pkg.candidateVersion ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1">
                            <span className="text-slate-500">&rarr;</span>
                            <span>{pkg.candidateVersion}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                            pkg.status === 'security_update'
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : pkg.status === 'update_available'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {pkg.status === 'security_update' ? (
                            <>
                              <ShieldAlert className="w-3 h-3" />
                              <span>{isEn ? 'Security Fix' : 'پچ امنیتی'}</span>
                            </>
                          ) : pkg.status === 'update_available' ? (
                            <>
                              <ArrowUpCircle className="w-3 h-3" />
                              <span>{isEn ? 'Update Available' : 'آپدیت موجود'}</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{isEn ? 'Up to date' : 'به‌روز'}</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Architecture */}
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {pkg.architecture || 'amd64'}
                      </td>

                      {/* Action Button: Update single package */}
                      <td className="p-3 text-right">
                        {isUpgradable ? (
                          <button
                            type="button"
                            disabled={isJobRunning}
                            onClick={() => triggerUpdateSingle(pkg)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-slate-950 border border-cyan-500/30 transition cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isEn ? 'Update' : 'به‌روزرسانی'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            {isEn ? 'Latest' : 'آخرین نگارش'}
                          </span>
                        )}
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
      {/* 4. CONFIRMATION MODAL                                    */}
      {/* ======================================================== */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl space-y-4 ${
              isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold">{confirmAction.title}</h4>
            </div>

            <p className={`text-xs leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-300'}`}>
              {confirmAction.description}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isLightMode
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                }`}
              >
                {isEn ? 'Cancel' : 'انصراف'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const act = confirmAction.action;
                  setConfirmAction(null);
                  act();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md transition cursor-pointer active:scale-95"
              >
                {isEn ? 'Confirm & Execute' : 'تأیید و شروع عملیات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
