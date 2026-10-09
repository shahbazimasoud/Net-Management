import React, { useState, useEffect, useRef } from 'react';
import {
  Archive,
  DownloadCloud,
  UploadCloud,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  FileCheck,
  FileX,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Clock,
  HardDrive,
  Database,
  Server,
  Layers,
  Users,
  Eye,
  Trash2,
  Info,
  RefreshCw,
  Sparkles,
  FileText,
  Sliders,
  Check,
  AlertCircle,
  Calendar,
  Play,
  Plus,
  Download,
  ExternalLink,
  Edit2
} from 'lucide-react';
import {
  AccessPolicy,
  BackupScope,
  NetworkBackupPackage,
  BackupMetadata,
  BackupAuditEntry,
  Device,
  ScheduledBackupJob,
  ServerArchiveItem
} from '../../types';
import {
  collectBackupPackage,
  downloadBackupPackage,
  inspectBackupFile,
  executeRestore,
  getSafetySnapshot,
  clearSafetySnapshot,
  loadBackupAuditLogs,
  logBackupAudit,
  clearBackupAuditLogs,
  fetchServerArchiveBackupsApi,
  getServerArchiveDownloadUrl,
  deleteServerArchiveBackupApi,
  restoreServerArchiveBackupApi,
  createManualServerArchiveBackupApi,
  fetchBackupSchedulesApi,
  createBackupScheduleApi,
  updateBackupScheduleApi,
  deleteBackupScheduleApi,
  runBackupScheduleNowApi
} from '../../services/backupService';
import { logPortalEvent } from '../../services/auditLogger';
import { APP_VERSION } from '../../version';
import { BackupScheduleModal } from './BackupScheduleModal';
import { ServerArchiveRestoreModal } from './ServerArchiveRestoreModal';
import { FieldInfoTooltip } from '../common/FieldInfoTooltip';

interface BackupPortalTabProps {
  isEn: boolean;
  activePolicy: AccessPolicy;
  allPolicies: AccessPolicy[];
  onSelectSimulatedPolicy: (policyId: string) => void;
  devices: Device[];
  onRefreshData?: () => void;
  isLightMode?: boolean;
}

type PortalSubTab = 'manual_dr' | 'schedules' | 'server_archive' | 'audit_logs';

export const BackupPortalTab: React.FC<BackupPortalTabProps> = ({
  isEn,
  activePolicy,
  allPolicies,
  onSelectSimulatedPolicy,
  devices,
  onRefreshData,
  isLightMode = false
}) => {
  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState<PortalSubTab>('manual_dr');

  // RBAC Permission Check
  const canExport = activePolicy.canExportBackup !== false && (activePolicy.id === 'policy-super-admin' || !!activePolicy.canExportBackup);
  const canImport = activePolicy.canImportBackup === true || activePolicy.id === 'policy-super-admin';

  // -------------------------------------------------------------
  // State: Export Configuration (Manual)
  // -------------------------------------------------------------
  const [exportScope, setExportScope] = useState<BackupScope>('full');
  const [encryptExport, setEncryptExport] = useState<boolean>(false);
  const [exportPassphrase, setExportPassphrase] = useState<string>('');
  const [confirmPassphrase, setConfirmPassphrase] = useState<string>('');
  const [sanitizeSecrets, setSanitizeSecrets] = useState<boolean>(false);
  const [customNote, setCustomNote] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // -------------------------------------------------------------
  // State: Import / Restore (Manual)
  // -------------------------------------------------------------
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [inspectionResult, setInspectionResult] = useState<{
    valid: boolean;
    isEncrypted: boolean;
    needsPassphrase: boolean;
    metadata?: BackupMetadata;
    unpackedData?: any;
    error?: string;
    checksumMatched: boolean;
  } | null>(null);
  const [importPassphrase, setImportPassphrase] = useState<string>('');
  const [restoreMode, setRestoreMode] = useState<'overwrite' | 'merge'>('overwrite');
  const [confirmKeyword, setConfirmKeyword] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string; details?: string } | null>(null);

  // -------------------------------------------------------------
  // State: Safety Snapshot & Rollback
  // -------------------------------------------------------------
  const [hasSnapshot, setHasSnapshot] = useState<boolean>(false);
  const [snapshotMeta, setSnapshotMeta] = useState<BackupMetadata | null>(null);
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);

  // -------------------------------------------------------------
  // State: Audit Logs
  // -------------------------------------------------------------
  const [auditLogs, setAuditLogs] = useState<BackupAuditEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('all');

  // -------------------------------------------------------------
  // State: Scheduled Backups (Phase 2 & 3)
  // -------------------------------------------------------------
  const [schedules, setSchedules] = useState<ScheduledBackupJob[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [selectedJobForEdit, setSelectedJobForEdit] = useState<ScheduledBackupJob | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState<string | null>(null);

  // -------------------------------------------------------------
  // State: Server Storage Archive (Phase 2 & 3)
  // -------------------------------------------------------------
  const [serverArchives, setServerArchives] = useState<ServerArchiveItem[]>([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState<boolean>(false);
  const [isCreatingServerBackup, setIsCreatingServerBackup] = useState<boolean>(false);
  const [archiveSuccessMsg, setArchiveSuccessMsg] = useState<string | null>(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState<boolean>(false);
  const [selectedArchiveForRestore, setSelectedArchiveForRestore] = useState<ServerArchiveItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    refreshAuditLogs();
    checkSafetySnapshot();
    loadSchedules();
    loadServerArchives();
  }, []);

  const refreshAuditLogs = () => {
    setAuditLogs(loadBackupAuditLogs());
  };

  const checkSafetySnapshot = () => {
    const snap = getSafetySnapshot();
    if (snap) {
      setHasSnapshot(true);
      setSnapshotMeta(snap.metadata);
    } else {
      setHasSnapshot(false);
      setSnapshotMeta(null);
    }
  };

  // -------------------------------------------------------------
  // Schedules Load & Handlers
  // -------------------------------------------------------------
  const loadSchedules = async () => {
    setIsLoadingSchedules(true);
    try {
      const res = await fetchBackupSchedulesApi();
      if (res && res.jobs) {
        setSchedules(res.jobs);
      }
    } catch (err: any) {
      console.error('Failed to load backup schedules:', err);
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  const handleToggleSchedule = async (job: ScheduledBackupJob) => {
    try {
      const updatedStatus = !job.enabled;
      setSchedules((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, enabled: updatedStatus } : j))
      );
      await updateBackupScheduleApi(job.id, { enabled: updatedStatus });
      setScheduleSuccessMsg(
        isEn
          ? `Schedule "${job.name}" ${updatedStatus ? 'activated' : 'paused'}.`
          : `جاب «${job.name}» با موفقیت ${updatedStatus ? 'فعال' : 'متوقف'} شد.`
      );
      setTimeout(() => setScheduleSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`خطا در تغییر وضعیت زمانبندی: ${err.message}`);
      loadSchedules();
    }
  };

  const handleSaveScheduleJob = async (jobData: Partial<ScheduledBackupJob>) => {
    if (selectedJobForEdit) {
      await updateBackupScheduleApi(selectedJobForEdit.id, jobData);
    } else {
      await createBackupScheduleApi(jobData);
    }
    await loadSchedules();
    setScheduleSuccessMsg(
      isEn
        ? `Schedule job "${jobData.name}" saved successfully!`
        : `جاب زمانبندی «${jobData.name}» با موفقیت در سرور ثبت گردید.`
    );
    setTimeout(() => setScheduleSuccessMsg(null), 4000);
  };

  const handleDeleteSchedule = async (id: string, name: string) => {
    const confirmText = isEn
      ? `Are you sure you want to delete scheduled backup job "${name}"?`
      : `آیا از حذف جاب زمانبندی «${name}» اطمینان دارید؟`;
    if (!window.confirm(confirmText)) return;

    try {
      await deleteBackupScheduleApi(id);
      setSchedules((prev) => prev.filter((j) => j.id !== id));
      setScheduleSuccessMsg(
        isEn ? `Schedule "${name}" deleted.` : `جاب «${name}» با موفقیت حذف شد.`
      );
      setTimeout(() => setScheduleSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`خطا در حذف زمانبندی: ${err.message}`);
    }
  };

  const handleRunScheduleNow = async (job: ScheduledBackupJob) => {
    setRunningJobId(job.id);
    try {
      const res = await runBackupScheduleNowApi(job.id);
      setScheduleSuccessMsg(
        isEn
          ? `Backup job "${job.name}" executed successfully! Snapshot stored on server.`
          : `جاب «${job.name}» با موفقیت اجرا شد و فایل بکاپ در آرشیو سرور ذخیره گردید.`
      );
      setTimeout(() => setScheduleSuccessMsg(null), 5000);
      await Promise.all([loadSchedules(), loadServerArchives()]);
      refreshAuditLogs();
    } catch (err: any) {
      alert(`خطا در اجرای فوری زمانبندی: ${err.message}`);
    } finally {
      setRunningJobId(null);
    }
  };

  // -------------------------------------------------------------
  // Server Storage Archive Load & Handlers
  // -------------------------------------------------------------
  const loadServerArchives = async () => {
    setIsLoadingArchives(true);
    try {
      const res = await fetchServerArchiveBackupsApi();
      if (res && res.backups) {
        setServerArchives(res.backups);
      }
    } catch (err: any) {
      console.error('Failed to load server archive backups:', err);
    } finally {
      setIsLoadingArchives(false);
    }
  };

  const handleCreateManualServerBackup = async () => {
    if (!canExport) {
      alert(isEn ? 'Export restricted by active policy.' : 'عدم دسترسی جهت ایجاد بکاپ.');
      return;
    }

    setIsCreatingServerBackup(true);
    try {
      const res = await createManualServerArchiveBackupApi({
        scope: exportScope,
        sanitize: sanitizeSecrets,
        encrypt: encryptExport,
        passphrase: encryptExport ? exportPassphrase : undefined,
        customNote: customNote.trim() || undefined
      });

      setArchiveSuccessMsg(
        isEn
          ? `Disaster recovery backup (${res.filename}) generated and archived on server!`
          : `پکیج پشتیبان با موفقیت تولید و در آرشیو سرور ذخیره گردید (${res.filename}).`
      );
      setTimeout(() => setArchiveSuccessMsg(null), 5000);
      await loadServerArchives();
      refreshAuditLogs();
    } catch (err: any) {
      alert(`خطا در ایجاد بکاپ در سرور: ${err.message}`);
    } finally {
      setIsCreatingServerBackup(false);
    }
  };

  const handleDeleteArchiveBackup = async (fileId: string, filename: string) => {
    const confirmText = isEn
      ? `Are you sure you want to permanently delete "${filename}" from server storage?`
      : `آیا از حذف دائمی فایل پشتیبان «${filename}» از دیسک سرور اطمینان دارید؟`;
    if (!window.confirm(confirmText)) return;

    try {
      await deleteServerArchiveBackupApi(fileId);
      setServerArchives((prev) => prev.filter((a) => a.id !== fileId));
      setArchiveSuccessMsg(
        isEn ? `Backup file ${filename} deleted from server.` : `فایل «${filename}» با موفقیت از سرور حذف شد.`
      );
      setTimeout(() => setArchiveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`خطا در حذف فایل از سرور: ${err.message}`);
    }
  };

  const handleExecuteArchiveRestore = async (
    fileId: string,
    options: { mode: 'overwrite' | 'merge'; passphrase?: string }
  ) => {
    const res = await restoreServerArchiveBackupApi(fileId, options);
    setArchiveSuccessMsg(
      isEn
        ? `Server state successfully restored via ${options.mode === 'overwrite' ? 'Full Overwrite' : 'Smart Merge'}! Safety point created.`
        : `وضعیت سرور با موفقیت از طریق ${options.mode === 'overwrite' ? 'جایگزینی کامل' : 'ادغام هوشمند'} بازیابی شد!`
    );
    setTimeout(() => setArchiveSuccessMsg(null), 6000);
    checkSafetySnapshot();
    refreshAuditLogs();
    if (onRefreshData) onRefreshData();
  };

  // -------------------------------------------------------------
  // Manual Export Handler
  // -------------------------------------------------------------
  const handleExport = async () => {
    if (!canExport) {
      logBackupAudit({
        action: 'export_blocked',
        username: activePolicy.subjectName,
        role: activePolicy.name,
        scope: exportScope,
        itemCount: 0,
        status: 'error',
        details: 'درخواست دانلود بکاپ به دلیل عدم دسترسی پالیسی فعال مسدود گردید (RBAC Blocked).'
      });
      refreshAuditLogs();
      return;
    }

    if (encryptExport) {
      if (!exportPassphrase || exportPassphrase.length < 4) {
        alert(isEn ? 'Please enter an encryption passphrase with at least 4 characters.' : 'لطفاً یک رمز عبور حداقل ۴ کاراکتری جهت رمزنگاری وارد کنید.');
        return;
      }
      if (exportPassphrase !== confirmPassphrase) {
        alert(isEn ? 'Passphrases do not match.' : 'تکرار کلمه عبور با رمز عبور مطابقت ندارد.');
        return;
      }
    }

    setIsExporting(true);
    setExportSuccessMsg(null);

    try {
      const pkg = await collectBackupPackage({
        scope: exportScope,
        sanitizeSecrets,
        passphrase: encryptExport ? exportPassphrase : undefined,
        createdBy: activePolicy.subjectName,
        createdRole: activePolicy.name,
        customNote: customNote.trim() || undefined
      });

      downloadBackupPackage(pkg);

      const totalItems =
        (pkg.metadata.counts.servers || 0) +
        pkg.metadata.counts.devices +
        pkg.metadata.counts.customMaps +
        pkg.metadata.counts.accessPolicies +
        pkg.metadata.counts.deviceGroups;

      setExportSuccessMsg(
        isEn
          ? `Backup package (${pkg.metadata.scopeLabel}) exported successfully!`
          : `پکیج پشتیبان (${pkg.metadata.scopeLabel}) با موفقیت ایجاد و دانلود شد.`
      );

      logBackupAudit({
        action: 'export',
        username: activePolicy.subjectName,
        role: activePolicy.name,
        fileName: `nettopology-backup-${pkg.metadata.scope}.${pkg.metadata.isEncrypted ? 'enc.json' : 'json'}`,
        scope: pkg.metadata.scopeLabel,
        itemCount: totalItems,
        status: 'success',
        details: `تولید موفق پکیج بکاپ شامل ${pkg.metadata.counts.servers || 0} سرور، ${pkg.metadata.counts.devices} تجهیز، ${pkg.metadata.counts.customMaps} نقشه.`,
        checksum: pkg.metadata.checksumSha256
      });

      refreshAuditLogs();
    } catch (err: any) {
      alert(`خطا در ایجاد پکیج بکاپ: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // -------------------------------------------------------------
  // Manual File Upload & Inspection
  // -------------------------------------------------------------
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setInspectionResult(null);
    setRestoreResult(null);
    setConfirmKeyword('');
    setImportPassphrase('');

    const reader = new FileReader();
    setIsAnalyzing(true);
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        setFileContent(text);
        const result = await inspectBackupFile(text);
        setInspectionResult(result);
      } catch (err: any) {
        setInspectionResult({
          valid: false,
          isEncrypted: false,
          needsPassphrase: false,
          checksumMatched: false,
          error: err.message
        });
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsText(file);
  };

  const handleDecryptInspection = async () => {
    if (!fileContent || !importPassphrase) return;
    setIsAnalyzing(true);
    try {
      const result = await inspectBackupFile(fileContent, importPassphrase);
      setInspectionResult(result);
    } catch (err: any) {
      setInspectionResult({
        valid: false,
        isEncrypted: true,
        needsPassphrase: true,
        checksumMatched: false,
        error: err.message
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRestore = async () => {
    if (!canImport) {
      logBackupAudit({
        action: 'import_blocked',
        username: activePolicy.subjectName,
        role: activePolicy.name,
        scope: inspectionResult?.metadata?.scopeLabel || 'unknown',
        itemCount: 0,
        status: 'error',
        details: 'درخواست بازیابی به دلیل عدم مجوز پالیسی مسدود شد (canImportBackup: false).'
      });
      refreshAuditLogs();
      return;
    }

    if (restoreMode === 'overwrite' && confirmKeyword.trim().toUpperCase() !== 'RESTORE') {
      alert(isEn ? 'Please type RESTORE to confirm overwrite.' : 'جهت تایید نهایی، کلمه RESTORE را تایپ کنید.');
      return;
    }

    if (!inspectionResult || !inspectionResult.valid || !inspectionResult.unpackedData) {
      alert(isEn ? 'Invalid backup data' : 'اطلاعات فایل پشتیبان معتبر نیست.');
      return;
    }

    setIsRestoring(true);
    setRestoreResult(null);

    try {
      const result = await executeRestore(
        inspectionResult.unpackedData,
        restoreMode
      );

      setRestoreResult({
        success: true,
        message: isEn ? 'Disaster recovery restore executed successfully!' : 'عملیات بازیابی با موفقیت انجام شد.',
        details: isEn
          ? `Mode: ${restoreMode === 'overwrite' ? 'Full Overwrite' : 'Smart Merge'}. ${result.details}`
          : `استراتژی: ${restoreMode === 'overwrite' ? 'جایگزینی کامل' : 'ادغام هوشمند'}. ${result.details}`
      });

      checkSafetySnapshot();
      refreshAuditLogs();

      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message: isEn ? 'Restore failed' : 'خطا در بازیابی اطلاعات',
        details: err.message
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRollback = async () => {
    if (!canImport) return;
    const confirm = window.confirm(
      isEn
        ? 'Rollback system state to the safety point captured before the last restore?'
        : 'آیا می‌خواهید تنظیمات را دقیقاً به نقطه ایمن قبل از آخرین بازیابی بازگردانید؟'
    );
    if (!confirm) return;

    setIsRollingBack(true);
    try {
      const snap = getSafetySnapshot();
      if (!snap) throw new Error('Safety snapshot not found.');

      await executeRestore(snap.data, 'overwrite');

      logBackupAudit({
        action: 'rollback',
        username: activePolicy.subjectName,
        role: activePolicy.name,
        scope: snap.metadata.scopeLabel,
        itemCount: snap.metadata.counts.devices,
        status: 'success',
        details: `بازگشت فوری (Rollback) به نقطه امن قبل از آخرین بازیابی.`
      });

      clearSafetySnapshot();
      checkSafetySnapshot();
      refreshAuditLogs();

      alert(isEn ? 'Rollback completed successfully!' : 'بازگشت به نقطه امن با موفقیت انجام شد.');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      alert(`خطا در Rollback: ${err.message}`);
    } finally {
      setIsRollingBack(false);
    }
  };

  // Metrics for Server Archives
  const totalArchiveBytes = serverArchives.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
  const totalArchiveSizeFormatted =
    totalArchiveBytes > 1024 * 1024
      ? `${(totalArchiveBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalArchiveBytes / 1024).toFixed(1)} KB`;
  const encryptedArchiveCount = serverArchives.filter((a) => a.isEncrypted).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* -------------------------------------------------------------
          Header & Role Switch
      ------------------------------------------------------------- */}
      <div
        className={`p-5 rounded-2xl border shadow-xl relative overflow-hidden ${
          isLightMode
            ? 'bg-white border-slate-200'
            : 'bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border-indigo-500/30'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl border shadow-inner ${
                isLightMode
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-gradient-to-br from-blue-600/30 to-indigo-600/30 text-blue-400 border-blue-500/40'
              }`}
            >
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold">
                  {isEn ? 'Enterprise Disaster Recovery & Backup Portal' : 'پورتال جامع پشتیبان‌گیری و بازیابی اطلاعات (DR Portal)'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold">
                  v{APP_VERSION}
                </span>
              </div>
              <p className={`text-xs mt-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'Authoritative PostgreSQL database export, 1-click restore, automated cron scheduler & server archive vault'
                  : 'استخراج معتبر دیتابیس PostgreSQL، بازیابی اتمیک، زمانبندی خودکار پشتیبان‌گیری و آرشیو محافظت‌شده سرور'}
              </p>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                canExport
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              {canExport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isEn ? 'Export:' : 'خروجی:'} {canExport ? (isEn ? 'Allowed' : 'مجاز') : (isEn ? 'Locked' : 'مسدود')}</span>
            </span>

            <span
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                canImport
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              }`}
            >
              {canImport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isEn ? 'Restore:' : 'بازیابی:'} {canImport ? (isEn ? 'Allowed' : 'مجاز') : (isEn ? 'Locked' : 'مسدود')}</span>
            </span>
          </div>
        </div>

        {/* RBAC Notice if restricted */}
        {(!canExport || !canImport) && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">
                {isEn ? 'RBAC Policy Restriction Active: ' : 'محدودیت سطح دسترسی RBAC: '}
              </span>
              <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>
                {isEn
                  ? 'Your current simulated identity lacks full backup portal privileges. You can switch role below.'
                  : 'نقش شبیه‌سازی‌شده جاری شما اختیارات کامل پورتال پشتیبان‌گیری را ندارد. می‌توانید نقش را تغییر دهید.'}
              </span>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold">{isEn ? 'Switch Role:' : 'تغییر نقش شبیه‌سازی:'}</span>
                <select
                  value={activePolicy.id}
                  onChange={(e) => onSelectSimulatedPolicy(e.target.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border focus:outline-none cursor-pointer ${
                    isLightMode
                      ? 'bg-white border-slate-300 text-slate-800'
                      : 'bg-slate-800 border-white/20 text-white'
                  }`}
                >
                  {allPolicies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.canExportBackup ? 'Exp✓' : 'Exp✕'} / {p.canImportBackup ? 'Imp✓' : 'Imp✕'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          Portal Sub-Tab Navigation Bar (Phase 3 Core Feature)
      ------------------------------------------------------------- */}
      <div
        className={`flex items-center gap-2 p-1.5 rounded-2xl border overflow-x-auto ${
          isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/80 border-white/10'
        }`}
      >
        {[
          {
            id: 'manual_dr',
            label_fa: 'استخراج و بازیابی دستی',
            label_en: 'Manual Export & Restore',
            icon: DownloadCloud
          },
          {
            id: 'schedules',
            label_fa: 'بکاپ‌های زمانبندی شده',
            label_en: 'Scheduled Automated Backups',
            icon: Calendar,
            badge: schedules.filter((s) => s.enabled).length
          },
          {
            id: 'server_archive',
            label_fa: 'آرشیو ذخیره‌ساز سرور',
            label_en: 'Server Storage Archive',
            icon: Server,
            badge: serverArchives.length
          },
          {
            id: 'audit_logs',
            label_fa: 'ممیزی امنیتی و لاگ رویدادها',
            label_en: 'Audit Trail & Safety Rollback',
            icon: Clock,
            badge: hasSnapshot ? 'Safety Point' : undefined
          }
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as PortalSubTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? isLightMode
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30'
                  : isLightMode
                  ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{isEn ? tab.label_en : tab.label_fa}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive
                      ? 'bg-white/25 text-white'
                      : isLightMode
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-slate-800 text-cyan-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------
          TAB 1: Manual Export & Restore (Manual DR)
      ------------------------------------------------------------- */}
      {activeSubTab === 'manual_dr' && (
        <div className="space-y-6">
          {/* Quick Telemetry Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Managed Devices' : 'تجهیزات فعال شبکه'}</div>
                <div className="text-lg font-bold mt-0.5 flex items-center gap-1.5">
                  <span>{devices.length}</span>
                  <span className="text-[11px] text-blue-400 font-normal">Switch / Router</span>
                </div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Custom Topology Maps' : 'نقشه‌های سفارشی'}</div>
                <div className="text-lg font-bold mt-0.5">
                  {(() => {
                    try {
                      const m = JSON.parse(localStorage.getItem('nettopology_custom_maps_v2') || '[]');
                      return m.length;
                    } catch (e) {
                      return 0;
                    }
                  })()}
                </div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Access Policies & Users' : 'پالیسی‌های RBAC و کاربران'}</div>
                <div className="text-lg font-bold mt-0.5">{allPolicies.length}</div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className={`p-2.5 rounded-lg border ${hasSnapshot ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Disaster Recovery Status' : 'آمادگی بازیابی از بحران'}</div>
                <div className="text-sm font-bold mt-0.5">
                  {hasSnapshot ? (
                    <span className="text-amber-400">Safety Point Ready</span>
                  ) : (
                    <span className="text-emerald-400">100% Operational</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action: Instant Server Archive Snapshot */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLightMode ? 'bg-indigo-50/70 border-indigo-200' : 'bg-indigo-950/20 border-indigo-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-xs">
                  {isEn ? 'Direct Server Storage Snapshot' : 'ذخیره مستقیم در آرشیو محافظت‌شده سرور'}
                </div>
                <div className={`text-[11px] ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Generate an immediate DR snapshot and store it directly onto the server without downloading.'
                    : 'ایجاد نسخه پشتیبان فوری و ذخیره‌سازی مستقیم آن در مسیر پشتیبان‌های سرور (/backend/server_backups) بدون نیاز به دانلود.'}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={!canExport || isCreatingServerBackup}
              onClick={handleCreateManualServerBackup}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isCreatingServerBackup ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isEn ? 'Archiving onto Server...' : 'در حال ذخیره‌سازی روی سرور...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{isEn ? 'Create Server Archive Snapshot' : 'ایجاد اسنپ‌شات در سرور'}</span>
                </>
              )}
            </button>
          </div>

          {archiveSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{archiveSuccessMsg}</span>
            </div>
          )}

          {/* 2-Column Grid: Export & Import */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Column 1: Export */}
            <div
              className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between space-y-5 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-indigo-500/25'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      <DownloadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">
                        {isEn ? 'Export Network Backup Package' : 'استخراج و ایجاد پکیج پشتیبان (Export)'}
                      </h3>
                      <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Select backup scope and export signed JSON with optional 256-bit encryption'
                          : 'انتخاب دامنه پشتیبان‌گیری و دانلود فایل با رمزنگاری اختیاری و هش SHA-256'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Scope Selection */}
                <div>
                  <label className="block text-xs font-semibold mb-2">
                    {isEn ? 'Select Backup Scope:' : 'دامنه اطلاعات پکیج پشتیبان:'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      {
                        id: 'full',
                        title: isEn ? 'Full Disaster Recovery' : 'پکیج جامع فاجعه (Full DR)',
                        desc: isEn ? 'All servers, devices, placements, custom maps, hierarchy, RBAC, users & settings' : 'تمام سرورها، تجهیزات، جانمایی‌ها، نقشه‌ها، سلسله‌مراتب، پالیسی‌ها و کاربران',
                        icon: Database
                      },
                      {
                        id: 'servers_only',
                        title: isEn ? 'Server Fleet & Categories' : 'ناوگان سرورها و دسته‌بندی‌ها',
                        desc: isEn ? 'Linux/Windows servers, roles, hardware specs, ports & categories' : 'سرورهای لینوکس و ویندوز، دسته‌بندی‌ها، مشخصات سخت‌افزاری و پورت‌ها',
                        icon: Server
                      },
                      {
                        id: 'devices_topology',
                        title: isEn ? 'Devices & Topology Maps' : 'نقشه‌ها و موجودی تجهیزات',
                        desc: isEn ? 'Switch inventory, ports, links, coordinates & custom maps' : 'اطلاعات دیوایس‌ها، پورت‌ها، لینک‌ها و نقشه‌های شماتیک',
                        icon: Layers
                      },
                      {
                        id: 'security_rbac',
                        title: isEn ? 'Identity & Access Control' : 'هویت، امنیت و سطوح دسترسی',
                        desc: isEn ? 'Local users, groups, AD config & multi-vendor RBAC policies' : 'کاربران، گروه‌های امنیتی، کانفیگ AD و پالیسی‌های دسترسی',
                        icon: Shield
                      },
                      {
                        id: 'templates_only',
                        title: isEn ? 'Configuration Templates' : 'الگوها و تمپلیت‌های کانفیگ',
                        desc: isEn ? 'CLI templates, automation scripts & variables' : 'الگوهای دستوری سیسکو، میکروتیک و اسکریپت‌های شبکه',
                        icon: FileText
                      }
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setExportScope(s.id as BackupScope)}
                        className={`p-3 rounded-xl border text-right transition cursor-pointer flex items-start gap-2.5 ${
                          exportScope === s.id
                            ? isLightMode
                              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm'
                              : 'bg-blue-600/20 border-blue-500/60 text-white shadow-md'
                            : isLightMode
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <s.icon className={`w-4 h-4 mt-0.5 shrink-0 ${exportScope === s.id ? 'text-blue-500' : 'text-slate-400'}`} />
                        <div>
                          <div className="font-bold text-xs">{s.title}</div>
                          <div className="text-[10px] opacity-75 mt-0.5 leading-snug">{s.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Security Options */}
                <div
                  className={`p-3.5 rounded-xl border space-y-3 ${
                    isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-white/10'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-500" />
                    <span>{isEn ? 'Security & Sanitization' : 'تنظیمات امنیتی و محرمانگی داده‌ها'}</span>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sanitizeSecrets}
                      onChange={(e) => setSanitizeSecrets(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-cyan-500 rounded"
                    />
                    <div>
                      <div className="text-xs font-semibold">
                        {isEn ? 'Sanitize Passwords & Secrets' : 'پاکسازی و ماسک کردن رمزهای عبور و سکرت‌ها'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isEn
                          ? 'Strips AD bind password, SSH credentials, and SNMP strings for auditing compliance.'
                          : 'حذف رمز عبور بایند AD، کلمات عبور SSH تجهیزات و SNMP قبل از خروجی.'}
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-white/5">
                    <input
                      type="checkbox"
                      checked={encryptExport}
                      onChange={(e) => setEncryptExport(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-indigo-500 rounded"
                    />
                    <div>
                      <div className="text-xs font-semibold flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{isEn ? 'Encrypt Package with AES-GCM 256-bit' : 'رمزنگاری پیشرفته پکیج با کلید AES-GCM'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isEn
                          ? 'Derives key via PBKDF2 from a custom passphrase. Unreadable without it.'
                          : 'مشتق‌گیری کلید امن از طریق PBKDF2. بدون داشتن رمز عبور، فایل باز نخواهد شد.'}
                      </div>
                    </div>
                  </label>

                  {encryptExport && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 animate-fadeIn">
                      <div>
                        <label className="block text-[11px] mb-1 font-semibold">{isEn ? 'Passphrase' : 'رمز عبور فایل بکاپ:'}</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={exportPassphrase}
                          onChange={(e) => setExportPassphrase(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none ${
                            isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/20 text-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] mb-1 font-semibold">{isEn ? 'Confirm Passphrase' : 'تکرار رمز عبور:'}</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassphrase}
                          onChange={(e) => setConfirmPassphrase(e.target.value)}
                          className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none ${
                            isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/20 text-white'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5">
                    <label className="block text-[11px] mb-1 font-semibold">{isEn ? 'Backup Memo / Tag (Optional):' : 'یادداشت یا برچسب اختیاری:'}</label>
                    <input
                      type="text"
                      placeholder={isEn ? 'e.g. Pre-upgrade snapshot' : 'مثال: بکاپ قبل از تغییر توپولوژی کور'}
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      className={`w-full px-3 py-1.5 rounded-lg text-xs border focus:outline-none ${
                        isLightMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/15 text-white'
                      }`}
                    />
                  </div>
                </div>

                {exportSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{exportSuccessMsg}</span>
                  </div>
                )}
              </div>

              {/* Action Trigger */}
              <div className="pt-3 border-t border-white/10">
                <button
                  type="button"
                  disabled={!canExport || isExporting}
                  onClick={handleExport}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                    canExport
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Generating Backup Package...' : 'در حال تولید پکیج پشتیبان و محاسبه هش...'}</span>
                    </>
                  ) : (
                    <>
                      {canExport ? <DownloadCloud className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      <span>
                        {canExport
                          ? isEn
                            ? 'Download Network Backup Package'
                            : 'تولید و دانلود فایل پشتیبان شبکه'
                          : isEn
                          ? 'Export Locked (RBAC Restricted)'
                          : 'قفل امنیتی: نیازمند مجوز Export در پالیسی'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Column 2: Import & Restore */}
            <div
              className={`p-5 rounded-2xl border shadow-xl flex flex-col justify-between space-y-5 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-cyan-500/25'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">
                        {isEn ? 'Import & Restore Network Data' : 'بازیابی و ایمپورت اطلاعات شبکه (Restore)'}
                      </h3>
                      <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isEn
                          ? 'Pre-flight integrity inspection and disaster recovery restoration'
                          : 'بررسی اصالت فایل، پیش‌نمایش محتوا و بازیابی ایمن با نقطه بازگشت خودکار'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dropzone */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => {
                    if (canImport) fileInputRef.current?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (canImport && e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`p-5 rounded-xl border-2 border-dashed text-center transition ${
                    !canImport
                      ? 'border-white/10 bg-black/10 opacity-60 cursor-not-allowed'
                      : 'border-cyan-500/40 hover:border-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="p-3 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="font-bold text-xs">
                      {selectedFile
                        ? selectedFile.name
                        : isEn
                        ? 'Click or Drag & Drop Backup JSON File'
                        : 'کلیک کنید یا فایل پشتیبان (.json / .enc.json) را به اینجا بکشید'}
                    </div>
                    <div className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(1)} KB - آماده برای بازرسی امنیتی`
                        : isEn
                        ? 'Supported formats: NetTopology Disaster Recovery v1.0'
                        : 'فرمت‌های پشتیبانی شده: پکیج‌های رسمی نت‌توپولوژی نسخه ۱.۰'}
                    </div>
                  </div>
                </div>

                {/* Pre-flight inspection results */}
                {isAnalyzing && (
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-white/10 flex items-center justify-center gap-2 text-xs text-slate-300">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>{isEn ? 'Inspecting integrity and verifying SHA-256 hash...' : 'در حال بررسی ساختار، کلید رمزنگاری و اعتبارسنجی هش SHA-256...'}</span>
                  </div>
                )}

                {inspectionResult && (
                  <div className="space-y-3 animate-fadeIn">
                    {inspectionResult.isEncrypted && inspectionResult.needsPassphrase && (
                      <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/40 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                          <Lock className="w-4 h-4" />
                          <span>{isEn ? 'Encrypted Package Detected' : 'این فایل پشتیبان رمزنگاری شده است'}</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={importPassphrase}
                            onChange={(e) => setImportPassphrase(e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/20 text-white text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleDecryptInspection}
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer"
                          >
                            {isEn ? 'Unlock' : 'رمزگشایی'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!inspectionResult.valid && inspectionResult.error && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2 text-xs text-rose-300">
                        <FileX className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold">{isEn ? 'Verification Failed' : 'خطای اعتبارسنجی فایل پشتیبان'}</div>
                          <div className="text-[11px] mt-0.5">{inspectionResult.error}</div>
                        </div>
                      </div>
                    )}

                    {inspectionResult.valid && inspectionResult.metadata && !inspectionResult.needsPassphrase && (
                      <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                            <FileCheck className="w-4 h-4" />
                            <span>{isEn ? 'Pre-flight Integrity Check Passed' : 'تایید اصالت ساختار (SHA-256 Valid)'}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 font-bold">
                            MATCHED
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-300 pt-1">
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                            <span className="text-slate-400 block">{isEn ? 'Servers Fleet' : 'ناوگان سرورها:'}</span>
                            <span className="font-bold text-white block">{inspectionResult.metadata.counts.servers ?? 0}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                            <span className="text-slate-400 block">{isEn ? 'Devices' : 'تجهیزات شبکه:'}</span>
                            <span className="font-bold text-white block">{inspectionResult.metadata.counts.devices}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                            <span className="text-slate-400 block">{isEn ? 'Custom Maps' : 'نقشه‌ها:'}</span>
                            <span className="font-bold text-white block">{inspectionResult.metadata.counts.customMaps}</span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                            <span className="text-slate-400 block">{isEn ? 'Policies' : 'پالیسی‌ها:'}</span>
                            <span className="font-bold text-white block">{inspectionResult.metadata.counts.accessPolicies}</span>
                          </div>
                        </div>

                        {/* Strategy Selection */}
                        <div className="pt-2 border-t border-white/10 space-y-2">
                          <label className="block text-xs font-semibold">
                            {isEn ? 'Restore Strategy:' : 'روش اعمال و بازگردانی اطلاعات:'}
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                              restoreMode === 'overwrite' ? 'bg-amber-500/15 border-amber-500/40 text-amber-200' : 'bg-slate-900/60 border-white/10 text-slate-400'
                            }`}>
                              <input
                                type="radio"
                                name="manualRestoreMode"
                                checked={restoreMode === 'overwrite'}
                                onChange={() => setRestoreMode('overwrite')}
                                className="mt-0.5 accent-amber-500"
                              />
                              <div>
                                <div className="font-bold text-xs text-white">{isEn ? 'Full Overwrite' : 'جایگزینی کامل'}</div>
                                <div className="text-[10px] text-slate-400 leading-snug">{isEn ? 'Replaces entire state' : 'بازنویسی کلیه موارد با فایل'}</div>
                              </div>
                            </label>

                            <label className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 ${
                              restoreMode === 'merge' ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200' : 'bg-slate-900/60 border-white/10 text-slate-400'
                            }`}>
                              <input
                                type="radio"
                                name="manualRestoreMode"
                                checked={restoreMode === 'merge'}
                                onChange={() => setRestoreMode('merge')}
                                className="mt-0.5 accent-cyan-500"
                              />
                              <div>
                                <div className="font-bold text-xs text-white">{isEn ? 'Smart Merge' : 'ادغام هوشمند'}</div>
                                <div className="text-[10px] text-slate-400 leading-snug">{isEn ? 'Appends new items' : 'افزودن بدون حذف موارد فعلی'}</div>
                              </div>
                            </label>
                          </div>

                          {restoreMode === 'overwrite' && (
                            <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/30 space-y-1.5 animate-fadeIn">
                              <div className="flex items-center gap-1.5 text-[11px] text-amber-300 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{isEn ? 'Type RESTORE to confirm overwrite:' : 'جهت اطمینان، کلمه RESTORE را تایپ کنید:'}</span>
                              </div>
                              <input
                                type="text"
                                placeholder="RESTORE"
                                value={confirmKeyword}
                                onChange={(e) => setConfirmKeyword(e.target.value)}
                                className="w-full px-3 py-1.5 rounded bg-slate-900 border border-amber-500/30 text-white font-mono text-xs focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {restoreResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    restoreResult.success
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                  }`}>
                    {restoreResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">{restoreResult.message}</div>
                      {restoreResult.details && <div className="text-[11px] text-slate-300 mt-0.5">{restoreResult.details}</div>}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Trigger */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <button
                  type="button"
                  disabled={
                    !canImport ||
                    isRestoring ||
                    !inspectionResult?.valid ||
                    inspectionResult?.needsPassphrase ||
                    (restoreMode === 'overwrite' && confirmKeyword.trim().toUpperCase() !== 'RESTORE')
                  }
                  onClick={handleRestore}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                    canImport &&
                    inspectionResult?.valid &&
                    !inspectionResult?.needsPassphrase &&
                    (restoreMode !== 'overwrite' || confirmKeyword.trim().toUpperCase() === 'RESTORE')
                      ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 hover:from-amber-500 hover:to-rose-500 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isEn ? 'Restoring Database...' : 'در حال بازیابی پایگاه داده...'}</span>
                    </>
                  ) : (
                    <>
                      {canImport ? <UploadCloud className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      <span>
                        {canImport
                          ? isEn
                            ? 'Execute Disaster Recovery Restore'
                            : 'اجرای بازیابی اطلاعات شبکه (Apply Restore)'
                          : isEn
                          ? 'Restore Locked (RBAC Restricted)'
                          : 'قفل امنیتی: نیازمند مجوز Import در پالیسی'}
                      </span>
                    </>
                  )}
                </button>

                {hasSnapshot && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-amber-200">
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-bold">{isEn ? 'Safety Point Available' : 'نقطه بازگشت امن موجود است:'}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {snapshotMeta ? `${snapshotMeta.createdAt} (${snapshotMeta.counts.devices} دیوایس)` : 'آخرین وضعیت قبل از بازیابی'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!canImport || isRollingBack}
                      onClick={handleRollback}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
                    >
                      {isRollingBack ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      <span>{isEn ? 'Rollback Now' : 'بازگشت فوری (Rollback)'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 2: Scheduled Automated Backups (Schedules)
      ------------------------------------------------------------- */}
      {activeSubTab === 'schedules' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Daemon Status & Action Bar */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-cyan-500/25 shadow-xl'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Automated Backup Scheduler Daemon' : 'موتور زمان‌بندی پشتیبان‌گیری خودکار (Cron Daemon)'}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {isEn ? 'Active & Running' : 'فعال و در حال اجرا'}
                  </span>
                </div>
                <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isEn
                    ? 'Background daemon monitors schedules every minute and applies retention policies automatically'
                    : 'سرویس پس‌زمینه سرور هر ۱ دقیقه زمانبندی‌ها را ارزیابی کرده و سیاست‌های نگهداری را اعمال می‌کند.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadSchedules}
                disabled={isLoadingSchedules}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-600 border-slate-300'
                    : 'hover:bg-slate-800 text-slate-300 border-white/10'
                }`}
                title={isEn ? 'Refresh Schedules' : 'بروزرسانی لیست'}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingSchedules ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                disabled={!canExport}
                onClick={() => {
                  setSelectedJobForEdit(null);
                  setScheduleModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Create New Schedule' : 'تعریف زمانبندی جدید'}</span>
              </button>
            </div>
          </div>

          {scheduleSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{scheduleSuccessMsg}</span>
            </div>
          )}

          {/* Schedules List / Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((job) => {
              const isRunning = runningJobId === job.id;
              return (
                <div
                  key={job.id}
                  className={`p-4 rounded-2xl border transition shadow-lg flex flex-col justify-between space-y-4 ${
                    isLightMode
                      ? job.enabled
                        ? 'bg-white border-slate-300'
                        : 'bg-slate-50 border-slate-200 opacity-70'
                      : job.enabled
                      ? 'bg-slate-900/90 border-cyan-500/25'
                      : 'bg-slate-950/60 border-white/5 opacity-60'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header: Name & Enable Toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-cyan-400">{job.name}</h4>
                          {job.encrypt && (
                            <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" title="AES-GCM Encrypted">
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="capitalize font-semibold text-white">
                            {job.schedule_type === 'daily'
                              ? isEn
                                ? `Daily at ${job.run_time}`
                                : `روزانه رأس ساعت ${job.run_time}`
                              : job.schedule_type === 'hourly'
                              ? isEn
                                ? 'Hourly'
                                : 'ساعتی (سر ساعت)'
                              : job.schedule_type === 'weekly'
                              ? isEn
                                ? `Weekly at ${job.run_time}`
                                : `هفتگی در ساعت ${job.run_time}`
                              : isEn
                              ? `Every ${job.interval_minutes} mins`
                              : `هر ${job.interval_minutes} دقیقه`}
                          </span>
                          <span>•</span>
                          <span className="text-blue-400">{job.scope}</span>
                        </div>
                      </div>

                      {/* Enable Switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleSchedule(job)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                          job.enabled
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border-white/10'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${job.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                        <span>{job.enabled ? (isEn ? 'Enabled' : 'فعال') : (isEn ? 'Paused' : 'متوقف')}</span>
                      </button>
                    </div>

                    {/* Frequency Details & Badges */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-black/30 border border-white/10 text-slate-300">
                        {isEn ? 'Retention:' : 'نگهداری:'} {job.retention_count} {isEn ? 'backups' : 'نسخه'} / {job.retention_days} {isEn ? 'days' : 'روز'}
                      </span>
                      {job.sanitize && (
                        <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                          {isEn ? 'Sanitized' : 'سکرت‌ها پاکسازی‌شده'}
                        </span>
                      )}
                    </div>

                    {/* Run Stats */}
                    <div className="p-2.5 rounded-xl bg-black/20 border border-white/5 space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>{isEn ? 'Next Execution:' : 'اجرای بعدی:'}</span>
                        <span className="font-mono text-white">{job.next_run_at || (isEn ? 'Calculated on trigger' : 'در انتظار زمان')}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>{isEn ? 'Last Status:' : 'وضعیت آخرین اجرا:'}</span>
                        <span className={`font-semibold flex items-center gap-1 ${
                          job.last_status === 'success'
                            ? 'text-emerald-400'
                            : job.last_status === 'failed'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}>
                          {job.last_status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                          {job.last_status === 'failed' && <AlertCircle className="w-3 h-3" />}
                          <span className="capitalize">{job.last_status || (isEn ? 'Never run' : 'هنوز اجرا نشده')}</span>
                          {job.last_run_at && <span className="text-[10px] text-slate-500">({job.last_run_at})</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isRunning || !canExport}
                      onClick={() => handleRunScheduleNow(job)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                      <span>{isRunning ? (isEn ? 'Executing...' : 'در حال اجرا...') : (isEn ? 'Run Now' : 'اجرای فوری')}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedJobForEdit(job);
                          setScheduleModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        title={isEn ? 'Edit Schedule' : 'ویرایش زمانبندی'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSchedule(job.id, job.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title={isEn ? 'Delete Schedule' : 'حذف زمانبندی'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {schedules.length === 0 && !isLoadingSchedules && (
              <div className="col-span-2 p-10 rounded-2xl border text-center border-dashed border-white/10 bg-slate-900/40 text-slate-400">
                <Calendar className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-50" />
                <div className="font-bold text-sm text-white">
                  {isEn ? 'No Automated Schedules Configured' : 'هیچ زمانبندی پشتیبان‌گیری فعالی تعریف نشده است'}
                </div>
                <div className="text-xs mt-1">
                  {isEn
                    ? 'Create a schedule to automate hourly, daily, or weekly backups with zero manual effort.'
                    : 'جهت اجرای منظم و دوره‌ای پشتیبان‌گیری و ذخیره خودکار در سرور، روی دکمه «تعریف زمانبندی جدید» کلیک کنید.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 3: Server Storage Archive (Server Archive Vault)
      ------------------------------------------------------------- */}
      {activeSubTab === 'server_archive' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Metrics Top Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Total Server Backups' : 'تعداد پکیج‌های سرور'}</div>
                <div className="text-lg font-bold mt-0.5">{serverArchives.length}</div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Archive Storage Used' : 'حجم اشغال‌شده در سرور'}</div>
                <div className="text-lg font-bold mt-0.5">{totalArchiveSizeFormatted}</div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Encrypted Snapshots' : 'پکیج‌های رمزنگاری‌شده'}</div>
                <div className="text-lg font-bold mt-0.5">{encryptedArchiveCount}</div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border flex items-center gap-3 ${
                isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/70 border-white/10'
              }`}
            >
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-semibold">{isEn ? 'Storage Engine' : 'وضعیت موتور ذخیره‌ساز'}</div>
                <div className="text-sm font-bold text-emerald-400 mt-0.5">Protected Vault</div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
            }`}
          >
            <div>
              <h3 className="font-bold text-sm">
                {isEn ? 'Protected Server Storage Archive' : 'آرشیو فایل‌های ذخیره‌شده در دیسک سرور'}
              </h3>
              <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {isEn
                  ? 'All automated and manual server snapshots stored securely in backend storage with 1-click restore'
                  : 'تمامی فایل‌های پشتیبان خودکار و دستی ذخیره‌شده در سرور با قابلیت دانلود مستقیم و بازگردانی فوری با یک کلیک'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadServerArchives}
                disabled={isLoadingArchives}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  isLightMode
                    ? 'hover:bg-slate-100 text-slate-600 border-slate-300'
                    : 'hover:bg-slate-800 text-slate-300 border-white/10'
                }`}
                title={isEn ? 'Refresh Archive' : 'بروزرسانی آرشیو'}
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingArchives ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                disabled={!canExport || isCreatingServerBackup}
                onClick={handleCreateManualServerBackup}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isEn ? 'Create Archive Backup Now' : 'ایجاد بکاپ فوری در سرور'}</span>
              </button>
            </div>
          </div>

          {archiveSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{archiveSuccessMsg}</span>
            </div>
          )}

          {/* Table of Server Archive Backups */}
          <div
            className={`rounded-2xl border overflow-hidden shadow-xl ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className={`border-b text-[11px] font-semibold ${isLightMode ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-white/10 text-slate-400'}`}>
                    <th className="py-3 px-4">{isEn ? 'Backup File & Origin' : 'نام فایل و منشأ تولید'}</th>
                    <th className="py-3 px-4">{isEn ? 'Created At' : 'زمان تولید'}</th>
                    <th className="py-3 px-4">{isEn ? 'Scope' : 'دامنه اطلاعات'}</th>
                    <th className="py-3 px-4">{isEn ? 'File Size' : 'حجم فایل'}</th>
                    <th className="py-3 px-4">{isEn ? 'Security' : 'امنیت'}</th>
                    <th className="py-3 px-4">{isEn ? 'Contents Breakdown' : 'محتوای موجود'}</th>
                    <th className="py-3 px-4 text-center">{isEn ? 'Actions' : 'عملیات'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLightMode ? 'divide-slate-200' : 'divide-white/5'}`}>
                  {serverArchives.map((archive) => (
                    <tr
                      key={archive.id}
                      className={`transition ${isLightMode ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'}`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-cyan-400 text-xs truncate max-w-xs" title={archive.filename}>
                          {archive.filename}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {archive.jobName ? (
                            <span>{isEn ? 'Job:' : 'زمانبندی:'} {archive.jobName}</span>
                          ) : (
                            <span>{isEn ? 'Manual DR Snapshot' : 'بکاپ دستی سرور'}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        {archive.createdAtFormatted || archive.createdAt}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {isEn ? archive.scopeLabel_en || archive.scopeLabel : archive.scopeLabel}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-xs font-semibold">
                        {archive.fileSizeFormatted}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {archive.isEncrypted ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              <span>AES-GCM</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">
                              {isEn ? 'Plain' : 'عادی'}
                            </span>
                          )}
                          {archive.isSanitized && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300">
                              Sanitized
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-[11px] text-slate-300">
                        {archive.counts ? (
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span>{archive.counts.servers || 0} {isEn ? 'Servers' : 'سرور'}</span>
                            <span>•</span>
                            <span>{archive.counts.devices || 0} {isEn ? 'Devices' : 'دیوایس'}</span>
                            <span>•</span>
                            <span>{archive.counts.customMaps || 0} {isEn ? 'Maps' : 'نقشه'}</span>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Download Button */}
                          <a
                            href={getServerArchiveDownloadUrl(archive.id)}
                            download={archive.filename}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              isLightMode
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-white/10'
                            }`}
                            title={isEn ? 'Direct Download' : 'دانلود مستقیم فایل'}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          {/* 1-Click Restore Button */}
                          <button
                            type="button"
                            disabled={!canImport}
                            onClick={() => {
                              setSelectedArchiveForRestore(archive);
                              setRestoreModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title={isEn ? '1-Click Server Restore' : 'بازگردانی مستقیم روی سرور'}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isEn ? 'Restore' : 'بازگردانی'}</span>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteArchiveBackup(archive.id, archive.filename)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            title={isEn ? 'Delete from Server' : 'حذف از سرور'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {serverArchives.length === 0 && !isLoadingArchives && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                        {isEn ? 'No backup files found in server archive.' : 'هیچ فایل پشتیبانی در آرشیو سرور یافت نشد.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 4: DR Audit Trail & Safety Rollback (Audit Logs)
      ------------------------------------------------------------- */}
      {activeSubTab === 'audit_logs' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Safety Rollback Banner if snapshot is present */}
          {hasSnapshot && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-amber-300">
                    {isEn ? 'Pre-Restore Safety Point Ready' : 'نقطه بازگشت امن قبل از آخرین بازیابی فعال است'}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {snapshotMeta ? `${snapshotMeta.createdAt} (${snapshotMeta.counts.devices} دیوایس)` : 'آخرین وضعیت سالم سیستم'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={!canImport || isRollingBack}
                onClick={handleRollback}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shrink-0"
              >
                {isRollingBack ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span>{isEn ? 'Execute Instant Safety Rollback' : 'بازگشت فوری به نقطه امن (Rollback)'}</span>
              </button>
            </div>
          )}

          {/* Audit Logs Table */}
          <div
            className={`p-5 rounded-2xl border shadow-xl space-y-4 ${
              isLightMode ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-white/10'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-800 text-indigo-300 border border-white/10">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {isEn ? 'Disaster Recovery Audit Trail' : 'لاگ رویدادها و ممیزی امنیتی بکاپ (Audit Trail)'}
                  </h3>
                  <p className={`text-[11px] ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isEn
                      ? 'Detailed tamper-evident log of all export, restore, scheduled jobs, and blocked attempts'
                      : 'ثبت جامع و ممیزی‌پذیر تمامی رویدادهای تولید پشتیبان، بازیابی، جاب‌های زمانبندی‌شده و دسترسی‌های مسدود شده'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs border focus:outline-none ${
                    isLightMode ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-slate-800 border-white/15 text-white'
                  }`}
                >
                  <option value="all">{isEn ? 'All Actions' : 'تمامی رویدادها'}</option>
                  <option value="export">{isEn ? 'Exports Only' : 'فقط استخراج‌ها'}</option>
                  <option value="import_success">{isEn ? 'Restores' : 'فقط بازیابی‌ها'}</option>
                  <option value="blocked">{isEn ? 'Blocked (RBAC)' : 'مسدودشده‌ها (RBAC)'}</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(isEn ? 'Clear all backup audit logs?' : 'آیا از پاکسازی تاریخچه لاگ‌های بکاپ اطمینان دارید؟')) {
                      clearBackupAuditLogs();
                      refreshAuditLogs();
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title={isEn ? 'Clear Audit Logs' : 'پاکسازی لاگ‌ها'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                    <th className="pb-2 font-semibold">{isEn ? 'Timestamp' : 'زمان رویداد'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'User & Role' : 'کاربر و پالیسی'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'Action' : 'نوع عملیات'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'Scope / File' : 'دامنه / فایل'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'Status' : 'وضعیت'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'Checksum (SHA-256)' : 'هش SHA-256'}</th>
                    <th className="pb-2 font-semibold">{isEn ? 'Details' : 'جزئیات'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditLogs
                    .filter((l) => {
                      if (logFilter === 'all') return true;
                      if (logFilter === 'export') return l.action === 'export';
                      if (logFilter === 'import_success') return l.action === 'import_success' || l.action === 'rollback';
                      if (logFilter === 'blocked') return l.action === 'export_blocked' || l.action === 'import_blocked';
                      return true;
                    })
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-2.5 font-mono text-[11px] text-slate-300">{log.timestamp}</td>
                        <td className="py-2.5">
                          <div className="font-semibold text-white">{log.username}</div>
                          <div className="text-[10px] text-slate-400">{log.role}</div>
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action === 'export'
                              ? 'bg-blue-500/20 text-blue-300'
                              : log.action === 'import_success'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : log.action === 'rollback'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {log.action === 'export'
                              ? 'Export'
                              : log.action === 'import_success'
                              ? 'Restore'
                              : log.action === 'rollback'
                              ? 'Rollback'
                              : 'RBAC Blocked'}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300 truncate max-w-[140px]">
                          {log.fileName || log.scope}
                        </td>
                        <td className="py-2.5">
                          <span className={`flex items-center gap-1 text-[11px] font-semibold ${
                            log.status === 'success'
                              ? 'text-emerald-400'
                              : log.status === 'warning'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}>
                            {log.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                            {log.status === 'warning' && <AlertTriangle className="w-3 h-3" />}
                            {log.status === 'error' && <FileX className="w-3 h-3" />}
                            <span className="capitalize">{log.status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[10px] text-slate-400">
                          {log.checksum ? `${log.checksum.slice(0, 10)}...` : 'N/A'}
                        </td>
                        <td className="py-2.5 text-slate-300 text-[11px] max-w-xs truncate" title={log.details}>
                          {log.details}
                        </td>
                      </tr>
                    ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                        {isEn ? 'No audit records logged yet.' : 'هنوز رویدادی ثبت نشده است.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODALS
      ------------------------------------------------------------- */}
      {/* Create / Edit Schedule Modal */}
      <BackupScheduleModal
        isOpen={scheduleModalOpen}
        isEn={isEn}
        isLightMode={isLightMode}
        job={selectedJobForEdit}
        onClose={() => setScheduleModalOpen(false)}
        onSave={handleSaveScheduleJob}
      />

      {/* 1-Click Server Archive Restore Modal */}
      <ServerArchiveRestoreModal
        isOpen={restoreModalOpen}
        isEn={isEn}
        isLightMode={isLightMode}
        file={selectedArchiveForRestore}
        onClose={() => setRestoreModalOpen(false)}
        onConfirmRestore={handleExecuteArchiveRestore}
      />
    </div>
  );
};
