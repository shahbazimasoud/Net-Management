import fs from 'fs';
import path from 'path';
import {
  exportDatabaseBackup,
  restoreDatabaseBackup,
  calculateSha256,
  ServerBackupScope,
  ServerRestoreMode,
} from './backupEngine';
import {
  ScheduledBackupJob,
  getAllScheduledBackupJobs,
  getScheduledBackupJobById,
  saveScheduledBackupJob,
  deleteScheduledBackupJob,
  addAuditLog,
} from './db';

// Server-side backups storage directory
const DEFAULT_BACKUPS_DIR = path.join(process.cwd(), 'backend', 'server_backups');
export const SERVER_BACKUPS_DIR = process.env.SERVER_BACKUPS_DIR || DEFAULT_BACKUPS_DIR;

export interface ServerArchiveItem {
  id: string; // filename without path
  filename: string;
  filePath: string;
  fileSize: number; // in bytes
  fileSizeFormatted: string;
  createdAt: string;
  createdAtFormatted: string;
  scope: string;
  scopeLabel: string;
  scopeLabel_en?: string;
  isEncrypted: boolean;
  isSanitized: boolean;
  checksumSha256: string;
  storageEngine: string;
  jobId?: string;
  jobName?: string;
  counts: {
    servers: number;
    serverCategories: number;
    devices: number;
    devicePlacements: number;
    deviceGroups: number;
    stickyNotes: number;
    customMaps: number;
    users: number;
    userGroups: number;
    accessPolicies: number;
  };
}

export function ensureBackupsDir(): string {
  try {
    if (!fs.existsSync(SERVER_BACKUPS_DIR)) {
      fs.mkdirSync(SERVER_BACKUPS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[DR Scheduler] Warning creating backups directory:', err);
  }
  return SERVER_BACKUPS_DIR;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================
// 1. Server Storage Archive Management
// ============================================================

export async function listServerArchiveBackups(): Promise<ServerArchiveItem[]> {
  const dir = ensureBackupsDir();
  const items: ServerArchiveItem[] = [];

  try {
    const files = fs.readdirSync(dir);
    for (const filename of files) {
      if (!filename.endsWith('.json') && !filename.endsWith('.sql')) continue;
      // Skip hidden files or lock files
      if (filename.startsWith('.')) continue;

      const filePath = path.join(dir, filename);
      try {
        const stats = fs.statSync(filePath);
        let parsedPkg: any = null;
        let metadata: any = null;

        if (filename.endsWith('.json')) {
          try {
            const rawContent = fs.readFileSync(filePath, 'utf-8');
            parsedPkg = JSON.parse(rawContent);
            metadata = parsedPkg.metadata;
          } catch {}
        }

        const createdAt = metadata?.timestamp || stats.mtime.toISOString();
        const counts = metadata?.counts || {
          servers: 0,
          serverCategories: 0,
          devices: 0,
          devicePlacements: 0,
          deviceGroups: 0,
          stickyNotes: 0,
          customMaps: 0,
          users: 0,
          userGroups: 0,
          accessPolicies: 0,
        };

        const isEnc = !!metadata?.isEncrypted || filename.includes('.enc.');
        const isSan = !!metadata?.isSanitized;
        const scope = metadata?.scope || (filename.includes('servers_only') ? 'servers_only' : 'full');

        // Extract job id from filename if created by scheduler (e.g. auto_backup_full_2026-..._job-xxx.json)
        let extractedJobId: string | undefined;
        let extractedJobName: string | undefined;
        const match = filename.match(/_(job-[a-zA-Z0-9_-]+)\./);
        if (match) {
          extractedJobId = match[1];
          const job = await getScheduledBackupJobById(extractedJobId).catch(() => null);
          if (job) extractedJobName = job.name;
        }

        items.push({
          id: filename,
          filename,
          filePath,
          fileSize: stats.size,
          fileSizeFormatted: formatBytes(stats.size),
          createdAt,
          createdAtFormatted: new Date(createdAt).toLocaleString('fa-IR'),
          scope,
          scopeLabel: metadata?.scopeLabel || scope,
          scopeLabel_en: metadata?.scopeLabel_en || scope,
          isEncrypted: isEnc,
          isSanitized: isSan,
          checksumSha256: metadata?.checksumSha256 || '',
          storageEngine: metadata?.storageEngine || 'server_disk',
          jobId: extractedJobId,
          jobName: extractedJobName,
          counts,
        });
      } catch (fileErr) {
        console.warn(`[DR Archive] Error reading backup file ${filename}:`, fileErr);
      }
    }
  } catch (dirErr) {
    console.warn('[DR Archive] Error listing backups directory:', dirErr);
  }

  // Sort newest first
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getServerArchiveBackupPath(fileId: string): string | null {
  const dir = ensureBackupsDir();
  // Prevent directory traversal
  const cleanId = path.basename(fileId);
  const targetPath = path.join(dir, cleanId);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }
  return null;
}

export async function deleteServerArchiveBackup(fileId: string, operatorUsername: string = 'admin'): Promise<boolean> {
  const filePath = getServerArchiveBackupPath(fileId);
  if (!filePath) {
    throw new Error(`Backup file ${fileId} not found on server`);
  }

  fs.unlinkSync(filePath);

  await addAuditLog({
    user_name: operatorUsername,
    action: 'BACKUP_FILE_DELETE',
    category: 'disaster_recovery',
    target: fileId,
    status: 'success',
    details: `Backup archive file ${fileId} deleted from server disk storage.`,
  }).catch(() => {});

  return true;
}

export async function restoreServerArchiveBackup(
  fileId: string,
  options: {
    passphrase?: string;
    mode?: ServerRestoreMode;
    performedBy?: { username: string; role: string; ip?: string; userAgent?: string };
  }
): Promise<any> {
  const filePath = getServerArchiveBackupPath(fileId);
  if (!filePath) {
    throw new Error(`Backup file ${fileId} does not exist in server archive storage.`);
  }

  const rawContent = fs.readFileSync(filePath, 'utf-8');
  let pkg: any;
  try {
    pkg = JSON.parse(rawContent);
  } catch (err: any) {
    throw new Error(`Invalid JSON format in stored backup ${fileId}: ${err.message}`);
  }

  return restoreDatabaseBackup({
    package: pkg,
    passphrase: options.passphrase,
    mode: options.mode || 'overwrite',
    performedBy: options.performedBy,
  });
}

// ============================================================
// 2. Retention Policy Enforcer
// ============================================================

export async function enforceRetentionPolicy(options: {
  jobId?: string;
  scope?: string;
  retentionCount?: number;
  retentionDays?: number;
}): Promise<{ deletedFiles: string[]; keptCount: number }> {
  const retentionCount = options.retentionCount && options.retentionCount > 0 ? options.retentionCount : 10;
  const retentionDays = options.retentionDays && options.retentionDays > 0 ? options.retentionDays : 30;

  const allBackups = await listServerArchiveBackups();

  // Filter backups related to this job or scope
  const targetBackups = allBackups.filter((item) => {
    if (options.jobId && item.jobId === options.jobId) return true;
    if (options.scope && item.scope === options.scope) return true;
    return !options.jobId && !options.scope;
  });

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const deletedFiles: string[] = [];

  // 1. Prune by retention count (keep top N newest)
  if (targetBackups.length > retentionCount) {
    const surplus = targetBackups.slice(retentionCount);
    for (const item of surplus) {
      try {
        if (fs.existsSync(item.filePath)) {
          fs.unlinkSync(item.filePath);
          deletedFiles.push(item.filename);
        }
      } catch (err) {
        console.warn(`[Retention] Error deleting surplus backup ${item.filename}:`, err);
      }
    }
  }

  // 2. Prune by retention days (files older than maxAgeMs, but always keep at least 1 backup)
  const remaining = targetBackups.filter((item) => !deletedFiles.includes(item.filename));
  if (remaining.length > 1) {
    for (let i = 1; i < remaining.length; i++) {
      const item = remaining[i];
      const itemAge = now - new Date(item.createdAt).getTime();
      if (itemAge > maxAgeMs) {
        try {
          if (fs.existsSync(item.filePath)) {
            fs.unlinkSync(item.filePath);
            deletedFiles.push(item.filename);
          }
        } catch (err) {
          console.warn(`[Retention] Error deleting expired backup ${item.filename}:`, err);
        }
      }
    }
  }

  if (deletedFiles.length > 0) {
    await addAuditLog({
      user_name: 'system_retention_daemon',
      action: 'RETENTION_PRUNE',
      category: 'disaster_recovery',
      target: `Job: ${options.jobId || 'all'}, Scope: ${options.scope || 'all'}`,
      status: 'info',
      details: `Pruned ${deletedFiles.length} older backups adhering to retention policy (Count: ${retentionCount}, Days: ${retentionDays}). Deleted: ${deletedFiles.join(', ')}`,
    }).catch(() => {});
  }

  return {
    deletedFiles,
    keptCount: targetBackups.length - deletedFiles.length,
  };
}

// ============================================================
// 3. Automated Scheduling Engine (Cron Calculation & Daemon)
// ============================================================

export function calculateNextRunDate(
  scheduleType: ScheduledBackupJob['schedule_type'],
  runTime: string = '02:00',
  daysOfWeek: number[] = [0, 1, 2, 3, 4, 5, 6],
  intervalMinutes: number = 1440,
  fromDate: Date = new Date()
): Date {
  const [hoursStr, minsStr] = (runTime || '02:00').split(':');
  const targetHour = parseInt(hoursStr || '2', 10);
  const targetMinute = parseInt(minsStr || '0', 10);

  const next = new Date(fromDate.getTime());

  if (scheduleType === 'custom_interval') {
    return new Date(fromDate.getTime() + Math.max(intervalMinutes, 1) * 60 * 1000);
  }

  if (scheduleType === 'hourly') {
    next.setMinutes(targetMinute, 0, 0);
    if (next <= fromDate) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  if (scheduleType === 'daily') {
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next <= fromDate) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (scheduleType === 'weekly') {
    const validDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0 ? daysOfWeek : [0];
    next.setHours(targetHour, targetMinute, 0, 0);

    for (let i = 0; i < 8; i++) {
      const dayMatches = validDays.includes(next.getDay());
      if (dayMatches && next > fromDate) {
        return next;
      }
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // Default fallback 24 hours
  return new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
}

export async function executeScheduledJob(jobId: string, triggeredBy: string = 'scheduler_daemon'): Promise<{
  success: boolean;
  backupFile: string;
  durationMs: number;
  message: string;
}> {
  const startTime = Date.now();
  const job = await getScheduledBackupJobById(jobId);
  if (!job) {
    throw new Error(`Scheduled backup job "${jobId}" not found`);
  }

  // Update status to running
  await saveScheduledBackupJob({
    ...job,
    last_status: 'running',
    updated_at: new Date().toISOString(),
  });

  const dir = ensureBackupsDir();

  try {
    const exportResult = await exportDatabaseBackup({
      scope: job.scope as ServerBackupScope,
      sanitize: job.sanitize,
      encrypt: job.encrypt,
      passphrase: job.passphrase,
      customNote: `Automated Scheduled Backup for job "${job.name}" (${job.schedule_type})`,
      requestedBy: {
        username: triggeredBy,
        role: 'Automated DR Scheduler Daemon',
      },
    });

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = job.encrypt ? 'enc.json' : 'json';
    const filename = `auto_backup_${job.scope}_${timestampStr}_${job.id}.${ext}`;
    const filePath = path.join(dir, filename);

    fs.writeFileSync(filePath, JSON.stringify(exportResult.package, null, 2), 'utf-8');

    // Enforce retention policy for this job
    await enforceRetentionPolicy({
      jobId: job.id,
      retentionCount: job.retention_count || 10,
      retentionDays: job.retention_days || 30,
    });

    const now = new Date();
    const nextRun = calculateNextRunDate(
      job.schedule_type,
      job.run_time,
      job.days_of_week,
      job.interval_minutes,
      now
    );

    const durationMs = Date.now() - startTime;
    const details = `Backup generated successfully in ${durationMs}ms. File: ${filename} (${formatBytes(fs.statSync(filePath).size)}).`;

    await saveScheduledBackupJob({
      ...job,
      last_run_at: now.toISOString(),
      next_run_at: nextRun.toISOString(),
      last_status: 'success',
      last_result_details: details,
      last_backup_file: filename,
      updated_at: now.toISOString(),
    });

    await addAuditLog({
      user_name: triggeredBy,
      action: 'SCHEDULED_BACKUP_EXECUTE',
      category: 'disaster_recovery',
      target: `Job: ${job.name} (${job.id})`,
      status: 'success',
      details,
    }).catch(() => {});

    return {
      success: true,
      backupFile: filename,
      durationMs,
      message: details,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorDetails = `Execution failed after ${durationMs}ms: ${err.message}`;

    const now = new Date();
    const nextRun = calculateNextRunDate(
      job.schedule_type,
      job.run_time,
      job.days_of_week,
      job.interval_minutes,
      now
    );

    await saveScheduledBackupJob({
      ...job,
      last_run_at: now.toISOString(),
      next_run_at: nextRun.toISOString(),
      last_status: 'failed',
      last_result_details: errorDetails,
      updated_at: now.toISOString(),
    });

    await addAuditLog({
      user_name: triggeredBy,
      action: 'SCHEDULED_BACKUP_FAILED',
      category: 'disaster_recovery',
      target: `Job: ${job.name} (${job.id})`,
      status: 'error',
      details: errorDetails,
    }).catch(() => {});

    throw err;
  }
}

// Background scheduler daemon state
let schedulerIntervalId: NodeJS.Timeout | null = null;
let isJobRunning = false;

export async function checkAndRunDueJobs(): Promise<void> {
  if (isJobRunning) return; // Prevent concurrent overlap

  try {
    const jobs = await getAllScheduledBackupJobs();
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled) continue;

      let isDue = false;
      if (!job.next_run_at) {
        // Calculate next run if not set
        const next = calculateNextRunDate(
          job.schedule_type,
          job.run_time,
          job.days_of_week,
          job.interval_minutes,
          now
        );
        job.next_run_at = next.toISOString();
        await saveScheduledBackupJob(job);
      } else {
        const nextDate = new Date(job.next_run_at);
        if (nextDate <= now) {
          isDue = true;
        }
      }

      if (isDue) {
        isJobRunning = true;
        try {
          console.log(`[DR Scheduler Daemon] Executing due backup job: "${job.name}" (${job.id})`);
          await executeScheduledJob(job.id, 'cron_daemon');
        } catch (jobErr) {
          console.error(`[DR Scheduler Daemon] Error executing job "${job.id}":`, jobErr);
        } finally {
          isJobRunning = false;
        }
      }
    }
  } catch (err) {
    console.warn('[DR Scheduler Daemon] Error in checkAndRunDueJobs:', err);
  }
}

export function startBackupSchedulerDaemon(intervalMs: number = 30000): void {
  ensureBackupsDir();

  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
  }

  // Initial check after 5 seconds of startup
  setTimeout(() => {
    checkAndRunDueJobs().catch(() => {});
  }, 5000);

  schedulerIntervalId = setInterval(() => {
    checkAndRunDueJobs().catch(() => {});
  }, intervalMs);

  console.log(`[DR Scheduler Daemon] Automated Disaster Recovery Scheduler active (Interval: ${intervalMs / 1000}s).`);
}

export function stopBackupSchedulerDaemon(): void {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    console.log('[DR Scheduler Daemon] Automated Disaster Recovery Scheduler stopped.');
  }
}
