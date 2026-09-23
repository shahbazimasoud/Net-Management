import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderCog,
  FolderArchive,
  Trash2,
  Play,
  RotateCw,
  Plus,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  RefreshCw,
  ArrowRight,
  Shield,
  Layers,
  Calendar,
  Settings2,
  Sliders,
  Check,
  X,
  FileArchive,
  HelpCircle,
  Copy,
  Activity,
} from 'lucide-react';
import {
  RemoteServer,
  LinuxDirectoryPolicyRule,
  LinuxDirectoryActionType,
} from '../../types';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';
import {
  fetchLinuxDirectoryPolicies,
  saveLinuxDirectoryPolicy,
  deleteLinuxDirectoryPolicy,
  runLinuxDirectoryPolicyNow,
  fetchLinuxDirectoryPolicyLogs,
} from '../../services/api';

interface LinuxDirectoryPolicyTabProps {
  server: RemoteServer;
  isLightMode: boolean;
  isEn: boolean;
  ephemeralPassword?: string;
}

const CRON_PRESETS: Record<string, string> = {
  hourly: '0 * * * *',
  every_6h: '0 */6 * * *',
  daily: '0 2 * * *',
  weekly: '0 2 * * 0',
  monthly: '0 2 1 * *',
};

export const LinuxDirectoryPolicyTab: React.FC<LinuxDirectoryPolicyTabProps> = ({
  server,
  isLightMode,
  isEn,
  ephemeralPassword,
}) => {
  const [subTab, setSubTab] = useState<'list' | 'form' | 'logs'>('list');
  const [policies, setPolicies] = useState<LinuxDirectoryPolicyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [actionType, setActionType] = useState<LinuxDirectoryActionType>('cleanup');
  const [enabled, setEnabled] = useState(true);
  const [schedulePreset, setSchedulePreset] = useState<'hourly' | 'every_6h' | 'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [scheduleCron, setScheduleCron] = useState('0 2 * * *');

  // Cleanup Options
  const [cleanupAgeDays, setCleanupAgeDays] = useState(7);
  const [cleanupFilePattern, setCleanupFilePattern] = useState('*');
  const [cleanupRemoveEmptyDirs, setCleanupRemoveEmptyDirs] = useState(true);

  // Backup Options
  const [backupFormat, setBackupFormat] = useState<'tar.gz' | 'tar.bz2' | 'tar.xz' | 'zip'>('tar.gz');
  const [backupDestinationPath, setBackupDestinationPath] = useState('/backup/archives');
  const [backupKeepSourceFiles, setBackupKeepSourceFiles] = useState(true);
  const [backupMaxRetainedCount, setBackupMaxRetainedCount] = useState(7);

  // Size Cap Options
  const [sizeCapMb, setSizeCapMb] = useState(1024);

  // Sync Options
  const [syncDestinationPath, setSyncDestinationPath] = useState('');
  const [syncDeleteExtraneous, setSyncDeleteExtraneous] = useState(false);

  const [saving, setSaving] = useState(false);

  // Manual Run / Test State
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    id: string;
    message: string;
    output: string;
    success: boolean;
  } | null>(null);

  // Logs State
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Clear notifications
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Load Policies
  const loadPolicies = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchLinuxDirectoryPolicies(server.id, ephemeralPassword);
      if (res.success && Array.isArray(res.policies)) {
        setPolicies(res.policies);
      } else {
        setErrorMsg(res.error || (isEn ? 'Failed to fetch directory policies' : 'خطا در دریافت سیاست‌های دایرکتوری'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Connection error' : 'خطای ارتباط با سرور'));
    } finally {
      setLoading(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  // Load Logs
  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetchLinuxDirectoryPolicyLogs(server.id, 150, ephemeralPassword);
      if (res.success) {
        setLogs(res.logs || (isEn ? 'No directory lifecycle logs recorded.' : 'هیچ لاگی برای چرخه حیات دایرکتوری ثبت نشده است.'));
      } else {
        setLogs(res.error || (isEn ? 'Failed to load logs.' : 'خطا در بارگیری لاگ‌ها.'));
      }
    } catch (err: any) {
      setLogs(`Error: ${err?.message || err}`);
    } finally {
      setLoadingLogs(false);
    }
  }, [server.id, ephemeralPassword, isEn]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  // Reset Form
  const resetForm = () => {
    setEditingId(null);
    setName('');
    setTargetPath('');
    setActionType('cleanup');
    setEnabled(true);
    setSchedulePreset('daily');
    setScheduleCron('0 2 * * *');
    setCleanupAgeDays(7);
    setCleanupFilePattern('*');
    setCleanupRemoveEmptyDirs(true);
    setBackupFormat('tar.gz');
    setBackupDestinationPath('/backup/archives');
    setBackupKeepSourceFiles(true);
    setBackupMaxRetainedCount(7);
    setSizeCapMb(1024);
    setSyncDestinationPath('');
    setSyncDeleteExtraneous(false);
  };

  const handleEditRule = (rule: LinuxDirectoryPolicyRule) => {
    setEditingId(rule.id);
    setName(rule.name);
    setTargetPath(rule.targetPath);
    setActionType(rule.actionType);
    setEnabled(rule.enabled);
    setSchedulePreset(rule.schedulePreset || 'daily');
    setScheduleCron(rule.scheduleCron || '0 2 * * *');
    setCleanupAgeDays(rule.cleanupAgeDays ?? 7);
    setCleanupFilePattern(rule.cleanupFilePattern || '*');
    setCleanupRemoveEmptyDirs(rule.cleanupRemoveEmptyDirs !== false);
    setBackupFormat(rule.backupFormat || 'tar.gz');
    setBackupDestinationPath(rule.backupDestinationPath || '/backup/archives');
    setBackupKeepSourceFiles(rule.backupKeepSourceFiles !== false);
    setBackupMaxRetainedCount(rule.backupMaxRetainedCount ?? 7);
    setSizeCapMb(rule.sizeCapMb ?? 1024);
    setSyncDestinationPath(rule.syncDestinationPath || '');
    setSyncDeleteExtraneous(Boolean(rule.syncDeleteExtraneous));
    setSubTab('form');
  };

  const handleSchedulePresetChange = (preset: typeof schedulePreset) => {
    setSchedulePreset(preset);
    if (preset !== 'custom' && CRON_PRESETS[preset]) {
      setScheduleCron(CRON_PRESETS[preset]);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPath.trim()) {
      setErrorMsg(isEn ? 'Target directory path is required.' : 'مشخص کردن مسیر دایرکتوری هدف الزامی است.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: LinuxDirectoryPolicyRule = {
        id: editingId || `dir_${(name || 'policy').toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${Date.now()}`,
        name: name.trim() || targetPath.trim(),
        targetPath: targetPath.trim(),
        actionType,
        enabled,
        schedulePreset,
        scheduleCron: scheduleCron.trim() || '0 2 * * *',
        cleanupAgeDays: Number(cleanupAgeDays) || 0,
        cleanupFilePattern: cleanupFilePattern.trim() || '*',
        cleanupRemoveEmptyDirs,
        backupFormat,
        backupDestinationPath: backupDestinationPath.trim() || '/backup/archives',
        backupKeepSourceFiles,
        backupMaxRetainedCount: Number(backupMaxRetainedCount) || 7,
        sizeCapMb: Number(sizeCapMb) || 1024,
        syncDestinationPath: syncDestinationPath.trim(),
        syncDeleteExtraneous,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await saveLinuxDirectoryPolicy(server.id, payload, ephemeralPassword);
      if (res.success) {
        setSuccessMsg(res.message || (isEn ? 'Directory policy saved successfully.' : 'سیاست دایرکتوری با موفقیت ذخیره و زمان‌بندی شد.'));
        await loadPolicies();
        resetForm();
        setSubTab('list');
      } else {
        setErrorMsg(res.error || (isEn ? 'Failed to save directory policy' : 'خطا در ذخیره سیاست دایرکتوری'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'An error occurred' : 'خطایی رخ داد'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePolicy = async (ruleId: string, ruleName: string) => {
    const confirmPrompt = isEn
      ? `Are you sure you want to delete policy "${ruleName}"? The schedule and runner file on the host will be removed.`
      : `آیا از حذف سیاست "${ruleName}" اطمینان دارید؟ زمان‌بندی روی سرور مقصد حذف خواهد شد.`;
    if (!window.confirm(confirmPrompt)) return;

    try {
      const res = await deleteLinuxDirectoryPolicy(server.id, ruleId, ephemeralPassword);
      if (res.success) {
        setSuccessMsg(isEn ? `Policy "${ruleName}" removed.` : `سیاست "${ruleName}" حذف شد.`);
        setPolicies((prev) => prev.filter((p) => p.id !== ruleId));
      } else {
        setErrorMsg(res.error || (isEn ? 'Failed to delete policy' : 'خطا در حذف سیاست'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Failed to delete policy' : 'خطا در حذف سیاست'));
    }
  };

  const handleRunNow = async (rule: LinuxDirectoryPolicyRule) => {
    setRunningId(rule.id);
    setRunResult(null);
    try {
      const res = await runLinuxDirectoryPolicyNow(server.id, rule.id, ephemeralPassword);
      setRunResult({
        id: rule.id,
        message: res.message || '',
        output: res.output || (isEn ? 'Execution completed without output.' : 'عملیات بدون خروجی متنی پایان یافت.'),
        success: res.success,
      });
      await loadPolicies();
    } catch (err: any) {
      setRunResult({
        id: rule.id,
        message: isEn ? 'Execution failed' : 'خطا در اجرا',
        output: err?.message || String(err),
        success: false,
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-Tabs Bar */}
      <div
        className={`flex items-center justify-between px-5 py-2 border-b shrink-0 ${
          isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === 'list'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-200/60'
                : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            <FolderCog className="w-3.5 h-3.5" />
            <span>{isEn ? 'Active Policies' : 'سیاست‌های فعال'}</span>
            <span
              className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                policies.length > 0 ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-400'
              }`}
            >
              {policies.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setSubTab('form');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === 'form'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-200/60'
                : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingId ? (isEn ? 'Edit Policy' : 'ویرایش سیاست') : isEn ? 'New Policy' : 'سیاست جدید'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadLogs();
              setSubTab('logs');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              subTab === 'logs'
                ? isLightMode
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : isLightMode
                ? 'text-slate-600 hover:bg-slate-200/60'
                : 'text-slate-400 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isEn ? 'Policy Audit Logs' : 'لاگ‌های اجرای سیاست‌ها'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={subTab === 'logs' ? loadLogs : loadPolicies}
            disabled={loading || loadingLogs}
            title={isEn ? 'Refresh' : 'بروزرسانی'}
            className={`p-1.5 rounded-lg border transition cursor-pointer disabled:opacity-50 ${
              isLightMode
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingLogs ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-400 hover:text-rose-200 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Run Now Result Banner */}
      {runResult && (
        <div className="mx-5 mt-3 p-3.5 rounded-xl border bg-slate-950/90 border-slate-800 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Activity className="w-4 h-4 text-amber-400" />
              <span className={runResult.success ? 'text-emerald-400' : 'text-rose-400'}>
                {isEn ? 'On-Demand Execution Result:' : 'نتیجه اجرای دستی سیاست:'}
              </span>
              <span className="text-slate-300 font-mono">{runResult.id}</span>
            </div>
            <button
              type="button"
              onClick={() => setRunResult(null)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded bg-slate-800"
            >
              {isEn ? 'Dismiss' : 'بستن'}
            </button>
          </div>
          <pre className="text-[11px] font-mono text-emerald-300/90 bg-black/60 p-2.5 rounded-lg overflow-x-auto max-h-36 whitespace-pre-wrap">
            {runResult.output}
          </pre>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* SUBTAB: LIST */}
        {subTab === 'list' && (
          <div className="space-y-4">
            {/* Overview Banner */}
            <div
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                isLightMode ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl ${
                    isLightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  <FolderCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-200">
                    {isEn ? 'Directory & Storage Automation Engine' : 'موتور خودکارسازی و مدیریت چرخه حیات دایرکتوری‌ها'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isEn
                      ? 'Automate periodic cleanup of old files, compression backups with retention, and size-capped storage quotas directly on the destination Linux host via native Cron & Bash scripts.'
                      : 'پاکسازی دوره‌ای فایل‌های قدیمی، فشرده‌سازی و بکاپ خودکار با انتقال به مسیر دیگر و مدیریت سقف حجم با استفاده از کران و اسکریپت نیتیو در سرور مقصد.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setSubTab('form');
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Create Policy' : 'ایجاد سیاست جدید'}</span>
              </button>
            </div>

            {/* Policies Cards Grid */}
            {loading && policies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-amber-500 mb-2" />
                <span className="text-xs">{isEn ? 'Loading directory policies...' : 'در حال بارگیری سیاست‌ها...'}</span>
              </div>
            ) : policies.length === 0 ? (
              <div
                className={`py-12 px-6 rounded-2xl border text-center flex flex-col items-center justify-center ${
                  isLightMode ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <FolderArchive className="w-10 h-10 text-slate-500 mb-2" />
                <h4 className="text-xs font-semibold text-slate-300">
                  {isEn ? 'No Directory Policies Configured' : 'هیچ سیاستی برای دایرکتوری‌ها تعریف نشده است'}
                </h4>
                <p className="text-[11px] text-slate-400 max-w-md mt-1 mb-4">
                  {isEn
                    ? 'Define a policy to automatically purge old logs, archive directories to backup folders, or enforce storage quotas.'
                    : 'می‌توانید برای پاکسازی فایل‌های قدیمی لاگ، فشرده‌سازی و انتقال فایل‌های بکاپ به مقصدی دیگر، یا سقف حجم، یک سیاست خودکار بسازید.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setSubTab('form');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition cursor-pointer"
                >
                  {isEn ? 'Create First Policy' : 'تعریف اولین سیاست'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {policies.map((rule) => {
                  const isRunningThis = runningId === rule.id;
                  return (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isLightMode
                          ? 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2.5 rounded-xl shrink-0 ${
                              rule.actionType === 'cleanup'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : rule.actionType === 'backup'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : rule.actionType === 'size_cap'
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {rule.actionType === 'cleanup' && <Trash2 className="w-5 h-5" />}
                            {rule.actionType === 'backup' && <FolderArchive className="w-5 h-5" />}
                            {rule.actionType === 'size_cap' && <HardDrive className="w-5 h-5" />}
                            {rule.actionType === 'sync' && <RotateCw className="w-5 h-5" />}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-200">{rule.name}</h4>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  rule.enabled
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-700 text-slate-400 border border-slate-600'
                                }`}
                              >
                                {rule.enabled ? (isEn ? 'Enabled' : 'فعال') : isEn ? 'Disabled' : 'غیرفعال'}
                              </span>

                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                                {rule.actionType === 'cleanup' && (isEn ? 'Retention Cleanup' : 'پاکسازی دوره‌ای')}
                                {rule.actionType === 'backup' && (isEn ? 'Archive & Backup' : 'آرشیو و بکاپ')}
                                {rule.actionType === 'size_cap' && (isEn ? 'Size-Capped Quota' : 'سقف حجم دایرکتوری')}
                                {rule.actionType === 'sync' && (isEn ? 'Directory Mirror' : 'آینه‌سازی دایرکتوری')}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-400">{isEn ? 'Target:' : 'مسیر مبدا:'}</span>
                              <code className="font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-800/40 text-[11px]">
                                {rule.targetPath}
                              </code>
                            </div>

                            {/* Action-Specific Details */}
                            <div className="text-[11px] text-slate-400 space-y-0.5">
                              {rule.actionType === 'cleanup' && (
                                <p>
                                  {isEn
                                    ? `Deletes files matching "${rule.cleanupFilePattern || '*'}" older than ${rule.cleanupAgeDays || 0} days.`
                                    : `حذف فایل‌های منطبق با "${rule.cleanupFilePattern || '*'}" با قدمت بیشتر از ${rule.cleanupAgeDays || 0} روز.`}
                                </p>
                              )}

                              {rule.actionType === 'backup' && (
                                <p>
                                  {isEn
                                    ? `Compresses (${rule.backupFormat || 'tar.gz'}) to "${rule.backupDestinationPath}". ${
                                        rule.backupKeepSourceFiles
                                          ? 'Retains source files.'
                                          : 'Purges source contents.'
                                      } (Keeps last ${rule.backupMaxRetainedCount || 7} archives)`
                                    : `فشرده‌سازی (${rule.backupFormat || 'tar.gz'}) به مسیر "${rule.backupDestinationPath}". ${
                                        rule.backupKeepSourceFiles
                                          ? 'فایل‌های مبدا حفظ می‌شوند.'
                                          : 'محتوای مبدا پس از فشرده‌سازی پاک می‌شود.'
                                      } (نگهداری ${rule.backupMaxRetainedCount || 7} نسخه اخیر)`}
                                </p>
                              )}

                              {rule.actionType === 'size_cap' && (
                                <p>
                                  {isEn
                                    ? `Limits folder size to ${rule.sizeCapMb || 1024} MB by auto-purging oldest files.`
                                    : `محدودسازی حجم به ${rule.sizeCapMb || 1024} مگابایت با حذف خودکار فایل‌های قدیمی‌تر.`}
                                </p>
                              )}

                              {rule.actionType === 'sync' && (
                                <p>
                                  {isEn
                                    ? `Synchronizes with "${rule.syncDestinationPath}".`
                                    : `همگام‌سازی با مسیر "${rule.syncDestinationPath}".`}
                                </p>
                              )}
                            </div>

                            {/* Schedule & Last Run */}
                            <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span className="font-mono text-slate-300">{rule.scheduleCron}</span>
                                <span className="text-slate-500">({rule.schedulePreset})</span>
                              </span>

                              {rule.lastRunAt && (
                                <span className="flex items-center gap-1">
                                  <span className="text-slate-500">{isEn ? 'Last Run:' : 'آخرین اجرا:'}</span>
                                  <span className="font-mono text-slate-300">{rule.lastRunAt}</span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] ${
                                      rule.lastRunStatus === 'success'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : rule.lastRunStatus === 'failed'
                                        ? 'bg-rose-500/20 text-rose-400'
                                        : 'bg-slate-700 text-slate-400'
                                    }`}
                                  >
                                    {rule.lastRunStatus}
                                  </span>
                                </span>
                              )}
                            </div>

                            {rule.lastRunMessage && (
                              <p className="text-[11px] text-slate-400 italic">
                                &quot;{rule.lastRunMessage}&quot;
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={isRunningThis}
                            onClick={() => handleRunNow(rule)}
                            title={isEn ? 'Run Policy Now (Test Execution)' : 'اجرای فوری سیاست (تست لحظه‌ای)'}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          >
                            <Play className={`w-3.5 h-3.5 ${isRunningThis ? 'animate-spin' : ''}`} />
                            <span>{isRunningThis ? (isEn ? 'Running...' : 'در حال اجرا...') : isEn ? 'Run Now' : 'اجرای فوری'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEditRule(rule)}
                            title={isEn ? 'Edit Policy' : 'ویرایش سیاست'}
                            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs transition cursor-pointer"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePolicy(rule.id, rule.name)}
                            title={isEn ? 'Delete Policy' : 'حذف سیاست'}
                            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB: FORM */}
        {subTab === 'form' && (
          <form onSubmit={handleSavePolicy} className="space-y-5 max-w-3xl mx-auto">
            <div
              className={`p-5 rounded-2xl border ${
                isLightMode ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
              }`}
            >
              <h3 className="text-xs font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>
                  {editingId
                    ? isEn
                      ? 'Edit Directory Lifecycle Policy'
                      : 'ویرایش سیاست چرخه حیات دایرکتوری'
                    : isEn
                    ? 'Configure New Directory Lifecycle Policy'
                    : 'پیکربندی سیاست جدید برای دایرکتوری'}
                </span>
              </h3>

              <div className="space-y-4">
                {/* Policy Name & Target Path */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Policy Name' : 'نام سیاست'}
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Policy Name' : 'نام سیاست'}
                        infoWhatEn="A descriptive human-readable label identifying this automated policy."
                        infoWhatFa="یک نام واضح و توصیفی جهت شناسایی این وظیفه خودکار در پنل و لاگ‌ها."
                        infoWhyEn="Helps distinguish between multiple directory maintenance policies."
                        infoWhyFa="کمک می‌کند وظایف مختلف پاکسازی و بکاپ را به‌سادگی از یکدیگر تفکیک کنید."
                        infoExampleEn="e.g. Nginx Access Logs Purge or Daily DB Dump Archive"
                        infoExampleFa="مثال: پاکسازی لاگ‌های وب‌سرور یا آرشیو دیتابیس"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={isEn ? 'e.g. Purge Temp Uploads' : 'مثال: پاکسازی فایل‌های موقت'}
                      className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">
                        {isEn ? 'Target Directory Path' : 'مسیر دایرکتوری مقصد'} <span className="text-rose-400">*</span>
                      </label>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Target Directory' : 'دایرکتوری هدف'}
                        infoWhatEn="The absolute filesystem path on the remote Linux server to apply this policy to."
                        infoWhatFa="مسیر مطلق پوشه در سرور لینوکس مقصد که این عملیات روی آن اجرا خواهد شد."
                        infoWhyEn="Required to locate where files should be purged, backed up, or checked."
                        infoWhyFa="تعیین دقیق محدوده اجرای اسکریپت جهت جلوگیری از تغییرات ناخواسته در سیستم."
                        infoExampleEn="e.g. /var/log/myapp, /tmp, or /var/backups"
                        infoExampleFa="مثال: /var/log/nginx یا /tmp یا /home/app/uploads"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                    <input
                      type="text"
                      required
                      value={targetPath}
                      onChange={(e) => setTargetPath(e.target.value)}
                      placeholder="/var/log/myapp"
                      className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                        isLightMode
                          ? 'bg-slate-50 border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-800 text-slate-100'
                      }`}
                    />
                    {/* Quick Path suggestions */}
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-400 flex-wrap">
                      <span>{isEn ? 'Presets:' : 'پیشنهادات:'}</span>
                      {['/var/log', '/tmp', '/var/tmp', '/var/backups', '/home'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTargetPath(p)}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Type Selector */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      {isEn ? 'Policy Action / Operation' : 'نوع عملیات و کارکرد سیاست'}
                    </label>
                    <FieldInfoTooltip
                      fieldName={isEn ? 'Policy Action' : 'نوع عملیات'}
                      infoWhatEn="Select what task should be performed on files inside the target directory."
                      infoWhatFa="مشخص می‌کند چه عملیاتی (حذف فایل‌های قدیمی، فشرده‌سازی و بکاپ، سقف حجم دیسک یا همگام‌سازی) روی پوشه انجام شود."
                      infoWhyEn="Defines the core operational logic of the automated background bash engine."
                      infoWhyFa="تعیین‌کننده عملکرد اسکریپت لینوکس در زمان اجرای کران در سرور مقصد."
                      infoExampleEn="Recommended: Cleanup for logs, Backup for critical directories"
                      infoExampleFa="پیشنهادی: پاکسازی برای لاگ‌ها، بکاپ برای داده‌های کاربردی"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {/* Action 1: Cleanup */}
                    <button
                      type="button"
                      onClick={() => setActionType('cleanup')}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                        actionType === 'cleanup'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Trash2 className="w-4 h-4 text-amber-400" />
                        {actionType === 'cleanup' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                      </div>
                      <span className="text-xs font-bold text-slate-200 mt-1">
                        {isEn ? 'Retention & Purge' : 'حذف و پاکسازی دوره‌ای'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Delete files older than X days/hours' : 'حذف فایل‌های قدیمی بر اساس سن و الگو'}
                      </span>
                    </button>

                    {/* Action 2: Backup */}
                    <button
                      type="button"
                      onClick={() => setActionType('backup')}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                        actionType === 'backup'
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <FolderArchive className="w-4 h-4 text-blue-400" />
                        {actionType === 'backup' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <span className="text-xs font-bold text-slate-200 mt-1">
                        {isEn ? 'Compress & Backup' : 'فشرده‌سازی و انتقال بکاپ'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Archive to dest, optional source purge' : 'آرشیو به مقصد دیگر، نگهداری یا حذف مبدا'}
                      </span>
                    </button>

                    {/* Action 3: Size Cap */}
                    <button
                      type="button"
                      onClick={() => setActionType('size_cap')}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                        actionType === 'size_cap'
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <HardDrive className="w-4 h-4 text-purple-400" />
                        {actionType === 'size_cap' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <span className="text-xs font-bold text-slate-200 mt-1">
                        {isEn ? 'Size-Capped Quota' : 'سقف حجم دایرکتوری'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Prune oldest files if size exceeds cap' : 'حذف فایل‌های قدیمی در صورت عبور از سقف'}
                      </span>
                    </button>

                    {/* Action 4: Sync */}
                    <button
                      type="button"
                      onClick={() => setActionType('sync')}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition cursor-pointer ${
                        actionType === 'sync'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <RotateCw className="w-4 h-4 text-emerald-400" />
                        {actionType === 'sync' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <span className="text-xs font-bold text-slate-200 mt-1">
                        {isEn ? 'Mirror / Sync' : 'آینه‌سازی و همگام‌سازی'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isEn ? 'Sync folder to replica path via rsync' : 'انتقال و همگام‌سازی با مسیر ثانویه'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* DYNAMIC ACTION PARAMETERS */}
                {/* 1. Retention & Cleanup Parameters */}
                {actionType === 'cleanup' && (
                  <div className="p-4 rounded-xl border bg-amber-500/5 border-amber-500/20 space-y-3">
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Retention & File Purge Configuration' : 'تنظیمات پاکسازی و نگهداری فایل‌ها'}</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Age in Days */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            {isEn ? 'Delete Files Older Than (Days)' : 'حذف فایل‌های قدیمی‌تر از (روز)'}
                          </label>
                          <FieldInfoTooltip
                            fieldName={isEn ? 'Age in Days' : 'سن فایل برحسب روز'}
                            infoWhatEn="Threshold in days. Files with last modification time older than this number will be deleted."
                            infoWhatFa="تعداد روزهایی که پس از آن، فایل‌های پوشه مشمول حذف دائم خواهند شد."
                            infoWhyEn="Prevents log files and transient dumps from exhausting server storage over time."
                            infoWhyFa="جلوگیری از پر شدن فضای هارد توسط فایل‌های قدیمی لاگ و فایل‌های موقت."
                            infoExampleEn="e.g. 7 (delete older than 1 week), 30 (older than 1 month)"
                            infoExampleFa="مثال: ۷ روز برای لاگ‌ها، ۳۰ روز برای آرشیوها"
                            isLightMode={isLightMode}
                            isEn={isEn}
                          />
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="3650"
                          value={cleanupAgeDays}
                          onChange={(e) => setCleanupAgeDays(Number(e.target.value))}
                          className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-800 text-slate-100'
                          }`}
                        />
                      </div>

                      {/* File Pattern Filter */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            {isEn ? 'File Name Pattern Filter' : 'الگوی تطبیق نام فایل‌ها'}
                          </label>
                          <FieldInfoTooltip
                            fieldName={isEn ? 'File Pattern' : 'الگوی فایل'}
                            infoWhatEn="Wildcard pattern matching filenames to purge (e.g. *.log, *.tmp, or *)."
                            infoWhatFa="فیلتر نام فایل‌ها مانند *.log یا *.tmp یا علامت * جهت انتخاب تمامی فایل‌ها."
                            infoWhyEn="Ensures only targeted files are purged while configuration or database files are protected."
                            infoWhyFa="محافظت از فایل‌های دیگر و هدف‌گیری دقیق فایل‌های مورد نظر جهت حذف."
                            infoExampleEn="e.g. *.log or access_*.log or *"
                            infoExampleFa="مثال: *.log یا *.tar.gz یا *"
                            isLightMode={isLightMode}
                            isEn={isEn}
                          />
                        </div>
                        <input
                          type="text"
                          value={cleanupFilePattern}
                          onChange={(e) => setCleanupFilePattern(e.target.value)}
                          placeholder="*.log"
                          className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-800 text-slate-100'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Remove Empty Subfolders */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="emptyDirsToggle"
                          checked={cleanupRemoveEmptyDirs}
                          onChange={(e) => setCleanupRemoveEmptyDirs(e.target.checked)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                        <label htmlFor="emptyDirsToggle" className="text-xs text-slate-300 cursor-pointer">
                          {isEn ? 'Remove empty subdirectories after cleaning files' : 'حذف زیرپوشه‌های خالی پس از پاکسازی فایل‌ها'}
                        </label>
                      </div>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Remove Empty Directories' : 'حذف پوشه‌های خالی'}
                        infoWhatEn="Automatically prunes empty directories left behind after older files are deleted."
                        infoWhatFa="پوشه‌های توخالی باقی‌مانده پس از پاکسازی را نیز از مسیر حذف می‌کند."
                        infoWhyEn="Keeps filesystem clean and prevents cluttering directory trees."
                        infoWhyFa="حفظ نظم ساختار فایل‌سیستم سرور و جلوگیری از انباشت پوشه‌های بلااستفاده."
                        infoExampleEn="Enabled (recommended)"
                        infoExampleFa="فعال (پیشنهادی)"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                  </div>
                )}

                {/* 2. Archive & Backup Parameters */}
                {actionType === 'backup' && (
                  <div className="p-4 rounded-xl border bg-blue-500/5 border-blue-500/20 space-y-4">
                    <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <FolderArchive className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Archive, Compression & Backup Destination' : 'تنظیمات فشرده‌سازی، بکاپ و مقصد'}</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Compression Format */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            {isEn ? 'Compression Format' : 'فرمت فشرده‌سازی'}
                          </label>
                          <FieldInfoTooltip
                            fieldName={isEn ? 'Compression Format' : 'فرمت فشرده‌سازی'}
                            infoWhatEn="Archive compression utility (tar.gz, tar.bz2, tar.xz, or zip)."
                            infoWhatFa="نوع الگوریتم فشرده‌سازی آرشیو بکاپ در سرور مقصد."
                            infoWhyEn="tar.gz is fast and universal; tar.xz achieves highest compression ratio."
                            infoWhyFa="فرمت tar.gz سریع و استاندارد است و tar.xz بالاترین نسبت کاهش حجم را دارد."
                            infoExampleEn="Recommended: tar.gz"
                            infoExampleFa="پیشنهادی: tar.gz"
                            isLightMode={isLightMode}
                            isEn={isEn}
                          />
                        </div>
                        <select
                          value={backupFormat}
                          onChange={(e) => setBackupFormat(e.target.value as any)}
                          className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-800 text-slate-100'
                          }`}
                        >
                          <option value="tar.gz">tar.gz (Gzip - Fast & Universal)</option>
                          <option value="tar.bz2">tar.bz2 (Bzip2 - High Compression)</option>
                          <option value="tar.xz">tar.xz (XZ - Maximum Compression)</option>
                          <option value="zip">zip (Standard Zip)</option>
                        </select>
                      </div>

                      {/* Backup Destination Path */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-300">
                            {isEn ? 'Backup Destination Folder' : 'مسیر پوشه ذخیره بکاپ'}
                          </label>
                          <FieldInfoTooltip
                            fieldName={isEn ? 'Backup Destination' : 'مسیر مقصد بکاپ'}
                            infoWhatEn="Local or mounted folder path where the compressed archive files will be placed."
                            infoWhatFa="مسیری در هارد محلی یا استوریج مونت‌شده که فایل آرشیو به آنجا منتقل می‌شود."
                            infoWhyEn="Separates archives from working source files for safe offsite replication or storage."
                            infoWhyFa="تفکیک فایل‌های فشرده بکاپ از دایرکتوری در حال کار سیستم."
                            infoExampleEn="e.g. /backup/archives or /mnt/nas/backups"
                            infoExampleFa="مثال: /backup/archives یا /var/backups"
                            isLightMode={isLightMode}
                            isEn={isEn}
                          />
                        </div>
                        <input
                          type="text"
                          value={backupDestinationPath}
                          onChange={(e) => setBackupDestinationPath(e.target.value)}
                          placeholder="/backup/archives"
                          className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            isLightMode
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-800 text-slate-100'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Post-Archive Source Handling: Keep vs Delete */}
                    <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Post-Archive Source Files Handling' : 'وضعیت فایل‌های مبدا پس از فشرده‌سازی و انتقال'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Source Handling' : 'وضعیت فایل‌های مبدا'}
                          infoWhatEn="Choose whether to keep original files in source or purge them to free up disk space."
                          infoWhatFa="انتخاب اینکه آیا فایل‌های موجود در دایرکتوری مبدا باقی بمانند یا پس از ساخت آرشیو پاک شوند."
                          infoWhyEn="For temporary uploads or staging folders, deleting source frees precious server disk immediately."
                          infoWhyFa="در پوشه‌های آپلود موقت یا لاگ‌ها، پاکسازی مبدا باعث آزاد شدن سریع فضای دیسک می‌شود."
                          infoExampleEn="Keep for production data; Purge for spool/staging folders"
                          infoExampleFa="نگهداری برای داده‌های مهم؛ پاکسازی برای فایل‌های موقت"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            backupKeepSourceFiles
                              ? 'bg-blue-500/20 border-blue-500/50 text-blue-200'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="backupKeepSource"
                            checked={backupKeepSourceFiles}
                            onChange={() => setBackupKeepSourceFiles(true)}
                            className="text-blue-500"
                          />
                          <div className="text-xs">
                            <span className="font-semibold block">
                              {isEn ? 'Keep Original Files' : 'نگهداری فایل‌های مبدا (پیش‌فرض)'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {isEn ? 'Source files remain intact' : 'فایل‌های موجود در دایرکتوری دست‌نخورده باقی می‌مانند'}
                            </span>
                          </div>
                        </label>

                        <label
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                            !backupKeepSourceFiles
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-200'
                              : 'bg-slate-900/60 border-slate-800 text-slate-400'
                          }`}
                        >
                          <input
                            type="radio"
                            name="backupKeepSource"
                            checked={!backupKeepSourceFiles}
                            onChange={() => setBackupKeepSourceFiles(false)}
                            className="text-rose-500"
                          />
                          <div className="text-xs">
                            <span className="font-semibold block text-rose-300">
                              {isEn ? 'Purge Source Files' : 'پاکسازی فایل‌های مبدا پس از بکاپ'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {isEn ? 'Frees up disk space in source' : 'محتوای مبدا حذف شده و فضا بلافاصله آزاد می‌شود'}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Retention: Max number of archives to keep */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Max Retained Backup Archives (Auto-Rotate)' : 'حداکثر تعداد نسخه‌های بکاپ نگهداری‌شده (چرخش خودکار)'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Max Retained Backups' : 'سقف نسخه‌های بکاپ'}
                          infoWhatEn="Maximum number of backup archives kept in the destination folder. Older archives are purged."
                          infoWhatFa="تعداد نسخه‌های اخیری که در پوشه بکاپ نگهداری می‌شود و نسخه‌های قدیمی‌تر به‌طور خودکار حذف می‌شوند."
                          infoWhyEn="Prevents the backup disk from overflowing with years of stale archive files."
                          infoWhyFa="جلوگیری از پر شدن دیسک بکاپ با فایل‌های آرشیو بسیار قدیمی."
                          infoExampleEn="e.g. 7 (keep last 7 days) or 14"
                          infoExampleFa="پیشنهادی: ۷ نسخه (یک هفته اخیر)"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={backupMaxRetainedCount}
                        onChange={(e) => setBackupMaxRetainedCount(Number(e.target.value))}
                        className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* 3. Size-Capped Quota Parameters */}
                {actionType === 'size_cap' && (
                  <div className="p-4 rounded-xl border bg-purple-500/5 border-purple-500/20 space-y-3">
                    <h4 className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Directory Storage Quota & Pruning' : 'سقف حجم دایرکتوری و پاکسازی بر اساس آستانه'}</span>
                    </h4>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Maximum Allowed Directory Size (MB)' : 'حداکثر سقف مجاز حجم دایرکتوری (مگابایت)'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Size Cap' : 'سقف حجم'}
                          infoWhatEn="Total size limit in Megabytes. If the folder exceeds this limit, oldest files are purged until under cap."
                          infoWhatFa="سقف حجم مجاز پوشه به مگابایت. در صورت فراتر رفتن، قدیمی‌ترین فایل‌ها حذف می‌شوند تا حجم به زیر سقف برسد."
                          infoWhyEn="Ensures high-churn logging or scratch folders never cause 100% disk usage outages."
                          infoWhyFa="جلوگیری قطعی از کرش سرور به دلیل پر شدن ۱۰۰ درصدی هارد."
                          infoExampleEn="e.g. 1024 (1 GB) or 5120 (5 GB)"
                          infoExampleFa="مثال: ۱۰۲۴ (۱ گیگابایت) یا ۵۱۲۰ (۵ گیگابایت)"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>
                      <input
                        type="number"
                        min="10"
                        max="1000000"
                        value={sizeCapMb}
                        onChange={(e) => setSizeCapMb(Number(e.target.value))}
                        className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                      <span className="text-[10px] text-slate-400">
                        {isEn
                          ? `Approx. ${(sizeCapMb / 1024).toFixed(2)} GB`
                          : `معادل تقریبی ${(sizeCapMb / 1024).toFixed(2)} گیگابایت`}
                      </span>
                    </div>
                  </div>
                )}

                {/* 4. Sync Parameters */}
                {actionType === 'sync' && (
                  <div className="p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/20 space-y-3">
                    <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Directory Mirror & Replication Settings' : 'تنظیمات آینه‌سازی و تکثیر دایرکتوری'}</span>
                    </h4>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Sync Destination Directory' : 'مسیر مقصد همگام‌سازی'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Sync Destination' : 'مسیر مقصد همگام‌سازی'}
                          infoWhatEn="Filesystem destination path where files from the target directory will be replicated."
                          infoWhatFa="پوشه مقصدی که فایل‌های پوشه مبدا به آنجا تکثیر و همگام می‌شوند."
                          infoWhyEn="Creates an exact clone or backup copy using rsync on the remote system."
                          infoWhyFa="ایجاد نسخه همگام‌سازی‌شده جهت پشتیبان‌گیری سریع."
                          infoExampleEn="e.g. /mnt/mirror/myapp or /backup/mirror"
                          infoExampleFa="مثال: /mnt/mirror/myapp"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>
                      <input
                        type="text"
                        value={syncDestinationPath}
                        onChange={(e) => setSyncDestinationPath(e.target.value)}
                        placeholder="/mnt/mirror/myapp"
                        className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="syncDeleteToggle"
                          checked={syncDeleteExtraneous}
                          onChange={(e) => setSyncDeleteExtraneous(e.target.checked)}
                          className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        />
                        <label htmlFor="syncDeleteToggle" className="text-xs text-slate-300 cursor-pointer">
                          {isEn
                            ? 'Delete extraneous files in destination (exact 1:1 mirror)'
                            : 'حذف فایل‌های اضافی در مقصد که در مبدا حذف شده‌اند (آینه‌سازی دقیق ۱:۱)'}
                        </label>
                      </div>
                      <FieldInfoTooltip
                        fieldName={isEn ? 'Delete Extraneous' : 'حذف فایل‌های زائد در مقصد'}
                        infoWhatEn="Passes --delete to rsync so files removed from source are also deleted from mirror."
                        infoWhatFa="اعمال فلگ --delete در rsync تا فایل‌های حذف شده در مبدا در مقصد هم حذف شوند."
                        infoWhyEn="Ensures the destination does not accumulate obsolete deleted files."
                        infoWhyFa="تضمین تطابق صددرصدی کپی با ساختار لحظه‌ای مبدا."
                        infoExampleEn="Recommended for exact mirrors"
                        infoExampleFa="پیشنهادی برای همگام‌سازی کامل"
                        isLightMode={isLightMode}
                        isEn={isEn}
                      />
                    </div>
                  </div>
                )}

                {/* SCHEDULE CONFIGURATION */}
                <div className="p-4 rounded-xl border bg-slate-950/40 border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isEn ? 'Execution Schedule (How Often Should It Run?)' : 'زمان‌بندی اجرا (هر چند وقت یک‌بار اجرا شود؟)'}</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Schedule Preset */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Frequency Preset' : 'دوره زمانی اجرا'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Execution Frequency' : 'تناوب زمانی'}
                          infoWhatEn="How often the host cron daemon executes this policy on the target directory."
                          infoWhatFa="دوره زمانی که کران‌جاب سرور مقصد اسکریپت را اجرا می‌کند."
                          infoWhyEn="Allows matching execution frequency with rate of file accumulation."
                          infoWhyFa="تنظیم دقیق متناسب با سرعت تولید لاگ یا اهمیت بکاپ."
                          infoExampleEn="Recommended: Daily at 02:00 AM"
                          infoExampleFa="پیشنهادی: روزانه ساعت ۲ بامداد"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>
                      <select
                        value={schedulePreset}
                        onChange={(e) => handleSchedulePresetChange(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      >
                        <option value="hourly">{isEn ? 'Every 1 Hour (0 * * * *)' : 'هر ۱ ساعت (ابتدای هر ساعت)'}</option>
                        <option value="every_6h">{isEn ? 'Every 6 Hours (0 */6 * * *)' : 'هر ۶ ساعت یک‌بار'}</option>
                        <option value="daily">{isEn ? 'Daily at 02:00 AM (0 2 * * *)' : 'روزانه ساعت ۲:۰۰ بامداد (پیشنهادی)'}</option>
                        <option value="weekly">{isEn ? 'Weekly on Sunday (0 2 * * 0)' : 'هفتگی (یکشنبه‌ها ساعت ۲ بامداد)'}</option>
                        <option value="monthly">{isEn ? 'Monthly on 1st (0 2 1 * *)' : 'ماهانه (اول هر ماه)'}</option>
                        <option value="custom">{isEn ? 'Custom Cron Expression' : 'عبارت کران سفارشی (Custom Cron)'}</option>
                      </select>
                    </div>

                    {/* Cron Expression */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          {isEn ? 'Linux Cron Expression' : 'عبارت استاندارد کران لینوکس'}
                        </label>
                        <FieldInfoTooltip
                          fieldName={isEn ? 'Cron Expression' : 'عبارت کران'}
                          infoWhatEn="Standard 5-field cron syntax: minute hour day month day-of-week."
                          infoWhatFa="فرمت ۵ بخشی کران استاندارد لینوکس: دقیقه ساعت روز ماه روز_هفته."
                          infoWhyEn="Directly written to /etc/cron.d/nettopology-dir-lifecycle on the host."
                          infoWhyFa="به‌صورت مستقیم در فایل کران‌تب سرور ثبت می‌شود."
                          infoExampleEn="0 2 * * * (At 02:00 every day)"
                          infoExampleFa="0 2 * * * (هر شب ساعت ۲ بامداد)"
                          isLightMode={isLightMode}
                          isEn={isEn}
                        />
                      </div>
                      <input
                        type="text"
                        value={scheduleCron}
                        onChange={(e) => {
                          setScheduleCron(e.target.value);
                          setSchedulePreset('custom');
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-amber-500 ${
                          isLightMode
                            ? 'bg-slate-50 border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Active / Enabled toggle */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="policyEnabledToggle"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                      <label htmlFor="policyEnabledToggle" className="text-xs text-slate-300 cursor-pointer">
                        {isEn ? 'Enable policy immediately upon saving' : 'فعال‌سازی و شروع بلافاصله پس از ذخیره'}
                      </label>
                    </div>
                    <FieldInfoTooltip
                      fieldName={isEn ? 'Policy Enabled' : 'وضعیت فعال'}
                      infoWhatEn="Controls whether the policy is active in crontab or temporarily muted."
                      infoWhatFa="مشخص می‌کند آیا سیاست در کران فعال باشد یا موقتاً غیرفعال و خاموش گردد."
                      infoWhyEn="Allows pausing automated tasks without losing configuration."
                      infoWhyFa="امکان توقف موقت عملیات بدون پاک شدن تنظیمات ثبت‌شده."
                      infoExampleEn="Enabled (default)"
                      infoExampleFa="فعال (پیش‌فرض)"
                      isLightMode={isLightMode}
                      isEn={isEn}
                    />
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setSubTab('list');
                    }}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    {isEn ? 'Cancel' : 'انصراف'}
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{isEn ? 'Deploying to Server...' : 'در حال استقرار در سرور...'}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{editingId ? (isEn ? 'Update Policy' : 'بروزرسانی سیاست') : isEn ? 'Save & Schedule Policy' : 'ذخیره و زمان‌بندی سیاست'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* SUBTAB: LOGS */}
        {subTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-slate-200">
                  {isEn ? 'Live Audit Logs:' : 'لاگ‌های زنده اجرا:'}
                </span>
                <code className="font-mono text-cyan-400 text-[11px]">/var/log/nettopology-dir-lifecycle.log</code>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  title={isEn ? 'Copy Logs' : 'کپی لاگ‌ها'}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedLogs ? (isEn ? 'Copied!' : 'کپی شد!') : isEn ? 'Copy' : 'کپی'}</span>
                </button>

                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={loadingLogs}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Refresh' : 'تازه‌سازی'}</span>
                </button>
              </div>
            </div>

            <div className="relative rounded-2xl border bg-black/90 border-slate-800 p-4 font-mono text-xs overflow-hidden shadow-inner">
              {loadingLogs ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
                  <span>{isEn ? 'Streaming logs from remote host...' : 'در حال دریافت لاگ‌ها از سرور...'}</span>
                </div>
              ) : (
                <pre className="text-emerald-400/90 whitespace-pre-wrap overflow-y-auto max-h-[460px] leading-relaxed select-text">
                  {logs}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
