import { getAuditReportSchedule, getAuditLogs } from './db';
import { sendAuditReportEmail } from './auditReportService';

let schedulerTimer: NodeJS.Timeout | null = null;
let isExecuting = false;

/**
 * Checks if the scheduled report should trigger at the current moment
 */
function shouldTriggerReport(schedule: any, now: Date): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.recipients || schedule.recipients.length === 0) return false;

  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMinute = String(now.getMinutes()).padStart(2, '0');
  const currentTimeOfDay = `${currentHour}:${currentMinute}`;

  const lastSentTime = schedule.lastSentAt ? new Date(schedule.lastSentAt).getTime() : 0;
  const nowTime = now.getTime();
  const timeSinceLastSentMs = nowTime - lastSentTime;

  switch (schedule.frequency) {
    case 'hourly': {
      // Must have been at least 50 minutes since last run
      return timeSinceLastSentMs >= 50 * 60 * 1000;
    }

    case 'daily': {
      // Check if current HH:MM matches timeOfDay
      const targetTime = schedule.timeOfDay || '08:00';
      const [targetH, targetM] = targetTime.split(':').map((x: string) => parseInt(x, 10));
      const isTargetMinute = now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) <= 2;
      const atLeast20HoursAgo = timeSinceLastSentMs >= 20 * 60 * 60 * 1000;
      return isTargetMinute && atLeast20HoursAgo;
    }

    case 'weekly': {
      const targetDay = schedule.dayOfWeek !== undefined ? Number(schedule.dayOfWeek) : 1; // 1 = Monday
      const isTargetDay = now.getDay() === targetDay;
      const targetTime = schedule.timeOfDay || '08:00';
      const [targetH, targetM] = targetTime.split(':').map((x: string) => parseInt(x, 10));
      const isTargetMinute = now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) <= 2;
      const atLeast6DaysAgo = timeSinceLastSentMs >= 6 * 24 * 60 * 60 * 1000;
      return isTargetDay && isTargetMinute && atLeast6DaysAgo;
    }

    case 'monthly': {
      const targetDate = schedule.dayOfMonth !== undefined ? Number(schedule.dayOfMonth) : 1;
      const isTargetDate = now.getDate() === targetDate;
      const targetTime = schedule.timeOfDay || '08:00';
      const [targetH, targetM] = targetTime.split(':').map((x: string) => parseInt(x, 10));
      const isTargetMinute = now.getHours() === targetH && Math.abs(now.getMinutes() - targetM) <= 2;
      const atLeast25DaysAgo = timeSinceLastSentMs >= 25 * 24 * 60 * 60 * 1000;
      return isTargetDate && isTargetMinute && atLeast25DaysAgo;
    }

    default:
      return false;
  }
}

/**
 * Executes scheduled audit report check
 */
export async function runAuditReportSchedulerCycle(): Promise<void> {
  if (isExecuting) return;
  isExecuting = true;

  try {
    const schedule = await getAuditReportSchedule();
    const now = new Date();

    if (shouldTriggerReport(schedule, now)) {
      console.log(`[Audit Scheduler] Triggering automated report (${schedule.frequency}) to: ${schedule.recipients.join(', ')}`);
      
      // Pull system audit logs
      const rawLogs = await getAuditLogs(300);
      const portalLogs = rawLogs.map((l: any) => ({
        id: l.id,
        timestamp: l.timestamp,
        category: l.category || 'system_auth',
        action: l.action || 'EVENT',
        title: l.action || 'Event',
        title_en: l.action || 'Event',
        actor: { username: l.user_name || 'system', role: 'System', ipAddress: l.ip_address },
        target: { type: 'system', name: l.target || 'Platform' },
        severity: l.status === 'failed' ? 'critical' : 'info',
        status: l.status || 'success',
        details: l.details || '',
        details_en: l.details || '',
      }));

      const result = await sendAuditReportEmail({
        config: schedule,
        portalLogs,
        commandLogs: [],
        isEn: true,
      });

      if (result.success) {
        console.log(`[Audit Scheduler] Report sent successfully! MessageId: ${result.messageId}, Recipient count: ${result.recipients.length}`);
      } else {
        console.warn(`[Audit Scheduler] Automated report delivery failed: ${result.error}`);
      }
    }
  } catch (err) {
    console.error('[Audit Scheduler] Error running scheduler cycle:', err);
  } finally {
    isExecuting = false;
  }
}

/**
 * Starts the audit report scheduler background daemon
 */
export function startAuditReportSchedulerDaemon(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  // Check every 60 seconds
  schedulerTimer = setInterval(() => {
    runAuditReportSchedulerCycle().catch((err) => {
      console.error('[Audit Scheduler Daemon Error]', err);
    });
  }, 60 * 1000);

  console.log('[Audit Scheduler] Daemon initialized and running (check interval: 60s).');
}
