import fs from 'fs';
import path from 'path';
import {
  getLogRetentionConfig,
  saveLogRetentionConfig,
  purgeOldLogs,
  getAuditStorageStats,
  exportAllAuditLogsPackage,
  addAuditLog,
  addPortalAuditLog,
} from './db';

let daemonTimer: NodeJS.Timeout | null = null;
let isExecuting = false;

const RETENTION_BACKUPS_DIR = path.resolve(process.cwd(), 'backups', 'retention');

export function ensureRetentionBackupsDir(): string {
  try {
    if (!fs.existsSync(RETENTION_BACKUPS_DIR)) {
      fs.mkdirSync(RETENTION_BACKUPS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('[Log Retention Daemon] Warning creating retention backups directory:', err);
  }
  return RETENTION_BACKUPS_DIR;
}

/**
 * Checks if the retention purge job should trigger automatically at the current moment
 */
function shouldTriggerRetentionPurge(config: any, now: Date): boolean {
  if (!config || !config.autoPurgeEnabled) return false;
  if (!config.retentionDays || config.retentionDays <= 0) return false;

  const targetTime = config.purgeScheduleTime || '02:00';
  const [targetH, targetM] = targetTime.split(':').map((x: string) => parseInt(x, 10) || 0);

  const isTargetMinute = now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) <= 2;

  const lastCleanupTime = config.lastCleanupTimestamp ? new Date(config.lastCleanupTimestamp).getTime() : 0;
  const timeSinceLastCleanupMs = now.getTime() - lastCleanupTime;
  const atLeast20HoursAgo = timeSinceLastCleanupMs >= 20 * 60 * 60 * 1000;

  return isTargetMinute && atLeast20HoursAgo;
}

export interface RetentionJobOptions {
  retentionDays?: number;
  backupBeforePurge?: boolean;
  requestedBy?: {
    username?: string;
    role?: string;
    ip?: string;
  };
}

/**
 * Executes a log retention purge job (automated or manual)
 */
export async function runRetentionPurgeJob(isManual = false, options: RetentionJobOptions = {}) {
  const startTime = Date.now();
  const config = await getLogRetentionConfig();

  const retentionDays = options.retentionDays !== undefined ? options.retentionDays : (config.retentionDays ?? 90);
  const backupBeforePurge = options.backupBeforePurge !== undefined ? options.backupBeforePurge : (config.backupBeforePurge ?? true);
  const actor = options.requestedBy || {
    username: isManual ? 'admin' : 'System / Auto Retention Daemon',
    role: isManual ? 'Super Administrator' : 'System Daemon',
    ip: '127.0.0.1',
  };

  let backupFilePath: string | null = null;
  let backupFileName: string | null = null;
  let backupFileSize: number = 0;

  // 1. Standalone backup creation before purge
  if (backupBeforePurge && retentionDays > 0) {
    try {
      ensureRetentionBackupsDir();
      const exportPkg = await exportAllAuditLogsPackage();
      const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
      backupFileName = `audit_logs_retention_backup_${timestampStr}.json`;
      backupFilePath = path.join(RETENTION_BACKUPS_DIR, backupFileName);

      const jsonStr = JSON.stringify(exportPkg, null, 2);
      fs.writeFileSync(backupFilePath, jsonStr, 'utf-8');
      backupFileSize = Buffer.byteLength(jsonStr, 'utf-8');
      console.log(`[Log Retention Engine] Standalone pre-purge backup created successfully: ${backupFileName} (${backupFileSize} bytes)`);
    } catch (bkErr: any) {
      console.error('[Log Retention Engine] Pre-purge backup failed:', bkErr.message);
    }
  }

  // 2. Execute purge
  const purgeResult = await purgeOldLogs(retentionDays);

  // 3. Update configuration last cleanup metrics
  try {
    await saveLogRetentionConfig({
      lastCleanupTimestamp: new Date().toISOString(),
      lastCleanupDeletedCount: purgeResult.totalDeleted || 0,
    }, actor.username || 'System');
  } catch (saveErr) {
    console.error('[Log Retention Engine] Failed updating retention config timestamp:', saveErr);
  }

  // 4. Record audit logs
  try {
    await addAuditLog({
      userName: actor.username || 'System',
      action: isManual ? 'MANUAL_LOG_RETENTION_PURGE' : 'AUTO_LOG_RETENTION_PURGE',
      category: 'security',
      target: 'Database Logs',
      status: purgeResult.success ? 'success' : 'failed',
      details: `Purged ${purgeResult.totalDeleted} expired log records older than ${retentionDays} days. Pre-purge backup: ${backupFileName || 'None'}`,
      ipAddress: actor.ip || '127.0.0.1',
    });

    await addPortalAuditLog({
      category: 'system_security',
      action: isManual ? 'MANUAL_PURGE' : 'SCHEDULED_PURGE',
      title: isManual ? 'پاکسازی دستی لاگ‌های قدیمی دیتابیس' : 'پاکسازی خودکار دوره‌ای لاگ‌های دیتابیس',
      title_en: isManual ? 'Manual Database Log Retention Purge' : 'Automated Database Log Retention Purge',
      user_name: actor.username || 'System',
      user_role: actor.role || 'Super Administrator',
      client_ip: actor.ip || '127.0.0.1',
      target_type: 'database',
      target_name: 'PostgreSQL Audit Logs',
      severity: purgeResult.totalDeleted > 0 ? 'warning' : 'info',
      status: 'success',
      details: `پاکسازی ${purgeResult.totalDeleted} رکورد لاگ قدیمی‌تر از ${retentionDays} روز در دیتابیس با موفقیت انجام شد.`,
      details_en: `Successfully purged ${purgeResult.totalDeleted} log records older than ${retentionDays} days from database.`,
      changes_diff: [
        { field: 'deletedDeviceLogs', oldValue: '-', newValue: String(purgeResult.deletedDeviceLogs || 0) },
        { field: 'deletedServerLogs', oldValue: '-', newValue: String(purgeResult.deletedServerLogs || 0) },
        { field: 'deletedPortalLogs', oldValue: '-', newValue: String(purgeResult.deletedPortalLogs || 0) },
        { field: 'deletedAuditLogs', oldValue: '-', newValue: String(purgeResult.deletedAuditLogs || 0) },
        { field: 'totalDeleted', oldValue: '-', newValue: String(purgeResult.totalDeleted || 0) },
      ],
    });
  } catch (auditErr) {
    console.error('[Log Retention Engine] Error recording retention audit log:', auditErr);
  }

  const duration = Date.now() - startTime;
  return {
    ...purgeResult,
    isManual,
    executedBy: actor.username,
    backupCreated: Boolean(backupFileName),
    backupFileName,
    backupFileSize,
    durationMs: duration,
  };
}

/**
 * Starts the Log Retention Background Daemon
 */
export function startLogRetentionDaemon() {
  if (daemonTimer) {
    clearInterval(daemonTimer);
  }

  console.log('[Log Retention Daemon] Initializing scheduled database log retention engine...');

  daemonTimer = setInterval(async () => {
    if (isExecuting) return;
    try {
      const now = new Date();
      const config = await getLogRetentionConfig();
      if (shouldTriggerRetentionPurge(config, now)) {
        isExecuting = true;
        console.log(`[Log Retention Daemon] Triggering scheduled auto-purge for logs older than ${config.retentionDays} days...`);
        await runRetentionPurgeJob(false);
      }
    } catch (err: any) {
      console.error('[Log Retention Daemon] Error during check cycle:', err.message);
    } finally {
      isExecuting = false;
    }
  }, 60 * 1000); // Check every minute
}

/**
 * Stops the Log Retention Background Daemon
 */
export function stopLogRetentionDaemon() {
  if (daemonTimer) {
    clearInterval(daemonTimer);
    daemonTimer = null;
    console.log('[Log Retention Daemon] Stopped.');
  }
}
