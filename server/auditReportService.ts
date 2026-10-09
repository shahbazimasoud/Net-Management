import nodemailer from 'nodemailer';
import { getEmailConfig, getAuditReportSchedule, saveAuditReportSchedule, addAuditLog, AuditReportScheduleConfig } from './db';
import { createMailTransport } from './emailService';

export interface AuditReportDataPayload {
  config?: Partial<AuditReportScheduleConfig>;
  portalLogs?: any[];
  commandLogs?: any[];
  isEn?: boolean;
}

export interface CategorySummaryItem {
  category: string;
  labelEn: string;
  labelFa: string;
  color: string;
  count: number;
  percentage: number;
}

const CATEGORY_META: Record<string, { labelEn: string; labelFa: string; color: string }> = {
  user_management: { labelEn: 'User Management', labelFa: 'مدیریت کاربران', color: '#3b82f6' },
  rbac_policy: { labelEn: 'RBAC & Policies', labelFa: 'خط‌مشی‌ها و دسترسی', color: '#8b5cf6' },
  device_inventory: { labelEn: 'Device Inventory', labelFa: 'تجهیزات و دارایی‌ها', color: '#06b6d4' },
  backup_recovery: { labelEn: 'Backup & Recovery', labelFa: 'پشتیبان‌گیری و بازیابی', color: '#10b981' },
  topology_network: { labelEn: 'Topology & Network', labelFa: 'توپولوژی و نقشه شبکه', color: '#f59e0b' },
  port_interface: { labelEn: 'Port & Interfaces', labelFa: 'پورت‌ها و اینترفیس‌ها', color: '#ec4899' },
  system_auth: { labelEn: 'System & Security', labelFa: 'امنیت و احراز هویت', color: '#6366f1' },
  device_commands: { labelEn: 'Terminal Commands', labelFa: 'دستورات ترمینال', color: '#ef4444' },
};

/**
 * Filter logs based on schedule configuration
 */
export function filterLogsForReport(
  portalLogs: any[] = [],
  commandLogs: any[] = [],
  config: AuditReportScheduleConfig
): { filteredPortal: any[]; filteredCommands: any[] } {
  const cutoffTime = config.timeframeHours > 0
    ? Date.now() - (config.timeframeHours * 3600 * 1000)
    : 0;

  // Filter Portal logs
  const filteredPortal = portalLogs.filter((log) => {
    // 1. Timeframe
    if (cutoffTime > 0) {
      const logTime = new Date(log.timestamp).getTime();
      if (logTime < cutoffTime) return false;
    }

    // 2. Category
    if (config.selectedCategories && config.selectedCategories.length > 0) {
      if (!config.selectedCategories.includes(log.category)) {
        return false;
      }
    }

    // 3. Minimum Severity
    if (config.minSeverity && config.minSeverity !== 'all') {
      const severityWeights: Record<string, number> = { info: 1, notice: 2, warning: 3, critical: 4 };
      const minWeight = severityWeights[config.minSeverity] || 1;
      const logWeight = severityWeights[log.severity] || 1;
      if (logWeight < minWeight) return false;
    }

    // 4. Status Filter
    if (config.statusFilter === 'failed_only') {
      if (log.status !== 'failed' && log.status !== 'denied') return false;
    } else if (config.statusFilter === 'success_and_failed') {
      if (log.status !== 'success' && log.status !== 'failed' && log.status !== 'denied') return false;
    }

    return true;
  });

  // Filter Command logs
  let filteredCommands: any[] = [];
  if (config.includeCommands) {
    filteredCommands = commandLogs.filter((cmd) => {
      if (cutoffTime > 0) {
        const cmdTime = new Date(cmd.timestamp).getTime();
        if (cmdTime < cutoffTime) return false;
      }

      if (config.statusFilter === 'failed_only') {
        if (cmd.status !== 'failed' && cmd.status !== 'denied') return false;
      }

      if (config.minSeverity === 'critical') {
        if (cmd.riskLevel !== 'critical') return false;
      } else if (config.minSeverity === 'warning') {
        if (cmd.riskLevel !== 'critical' && cmd.riskLevel !== 'high') return false;
      } else if (config.minSeverity === 'notice') {
        if (cmd.riskLevel === 'low') return false;
      }

      return true;
    });
  }

  return { filteredPortal, filteredCommands };
}

/**
 * Calculates summary metrics
 */
export function calculateReportSummary(portalLogs: any[], commandLogs: any[]) {
  const totalEvents = portalLogs.length + commandLogs.length;
  let criticalCount = 0;
  let warningCount = 0;
  let failedCount = 0;
  const categoryCounts: Record<string, number> = {};
  const activeActors = new Set<string>();
  const targetAssets = new Set<string>();

  for (const log of portalLogs) {
    if (log.severity === 'critical') criticalCount++;
    if (log.severity === 'warning') warningCount++;
    if (log.status === 'failed' || log.status === 'denied') failedCount++;
    const cat = log.category || 'general';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    if (log.actor?.username) activeActors.add(log.actor.username);
    if (log.target?.name) targetAssets.add(log.target.name);
  }

  for (const cmd of commandLogs) {
    if (cmd.riskLevel === 'critical') criticalCount++;
    if (cmd.riskLevel === 'high') warningCount++;
    if (cmd.status === 'failed' || cmd.status === 'denied') failedCount++;
    categoryCounts['device_commands'] = (categoryCounts['device_commands'] || 0) + 1;
    if (cmd.actor?.username) activeActors.add(cmd.actor.username);
    if (cmd.deviceName) targetAssets.add(cmd.deviceName);
  }

  return {
    totalEvents,
    portalEvents: portalLogs.length,
    commandEvents: commandLogs.length,
    criticalCount,
    warningCount,
    failedCount,
    categoryCounts,
    uniqueActorsCount: activeActors.size,
    targetAssetsCount: targetAssets.size,
  };
}

/**
 * Generates an executive, beautifully styled HTML email report
 */
export function generateAuditReportHtml(options: {
  config: AuditReportScheduleConfig;
  portalLogs: any[];
  commandLogs: any[];
  smtpSenderEmail?: string;
  isEn?: boolean;
}): string {
  const { config, portalLogs, commandLogs, smtpSenderEmail, isEn = true } = options;
  const summary = calculateReportSummary(portalLogs, commandLogs);
  const nowStr = new Date().toUTCString();
  const reportTitle = config.reportTitle || (isEn ? 'NetTopology Enterprise Audit & Activity Report' : 'گزارش جامع ممیزی، وقایع و دستورات شبکه');

  // Build category stats rows
  const catEntries = Object.entries(summary.categoryCounts);
  const catRowsHtml = catEntries.map(([catKey, count]) => {
    const meta = CATEGORY_META[catKey] || { labelEn: catKey, labelFa: catKey, color: '#64748b' };
    const pct = summary.totalEvents > 0 ? Math.round((count / summary.totalEvents) * 100) : 0;
    const catLabel = isEn ? meta.labelEn : meta.labelFa;
    return `
      <tr style="border-bottom: 1px solid #1e293b;">
        <td style="padding: 10px 14px; color: #f1f5f9; font-weight: 600; font-size: 13px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${meta.color}; margin-right: 8px;"></span>
          ${catLabel}
        </td>
        <td style="padding: 10px 14px; text-align: center; color: #94a3b8; font-size: 13px; font-weight: bold;">
          ${count}
        </td>
        <td style="padding: 10px 14px; text-align: right; color: #38bdf8; font-size: 13px;">
          ${pct}%
        </td>
      </tr>
    `;
  }).join('');

  // Build portal events rows (top 40 most recent for email legibility)
  const displayPortal = portalLogs.slice(0, 40);
  const portalRowsHtml = displayPortal.map((log) => {
    const severityColor =
      log.severity === 'critical' ? '#ef4444' :
      log.severity === 'warning' ? '#f59e0b' :
      log.severity === 'notice' ? '#06b6d4' : '#64748b';

    const statusBadge =
      log.status === 'success'
        ? '<span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">SUCCESS</span>'
        : log.status === 'failed'
        ? '<span style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">FAILED</span>'
        : '<span style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">DENIED</span>';

    const catMeta = CATEGORY_META[log.category] || { labelEn: log.category, labelFa: log.category, color: '#64748b' };
    const catLabel = isEn ? catMeta.labelEn : catMeta.labelFa;
    const logTitle = isEn ? (log.title_en || log.title) : (log.title || log.title_en);
    const actorStr = `${log.actor?.username || 'system'}${log.actor?.ipAddress ? ` (${log.actor.ipAddress})` : ''}`;
    const targetStr = log.target?.name || log.target?.id || '-';
    const timeFormatted = new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19);

    return `
      <tr style="border-bottom: 1px solid #1e293b;">
        <td style="padding: 10px 12px; color: #94a3b8; font-size: 11px; white-space: nowrap; font-family: monospace;">
          ${timeFormatted}
        </td>
        <td style="padding: 10px 12px;">
          <span style="background: ${severityColor}22; color: ${severityColor}; border: 1px solid ${severityColor}44; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase;">
            ${log.severity}
          </span>
        </td>
        <td style="padding: 10px 12px; color: #cbd5e1; font-size: 12px;">
          <span style="color: ${catMeta.color}; font-weight: 600;">${catLabel}</span>
        </td>
        <td style="padding: 10px 12px; color: #e2e8f0; font-size: 12px; font-weight: 500;">
          ${actorStr}
        </td>
        <td style="padding: 10px 12px; color: #38bdf8; font-size: 12px;">
          ${targetStr}
        </td>
        <td style="padding: 10px 12px; color: #f1f5f9; font-size: 12px;">
          <div style="font-weight: 600; margin-bottom: 2px;">${logTitle}</div>
          <div style="color: #94a3b8; font-size: 11px; line-height: 1.4;">${isEn ? (log.details_en || log.details) : (log.details || log.details_en)}</div>
        </td>
        <td style="padding: 10px 12px; text-align: center;">
          ${statusBadge}
        </td>
      </tr>
    `;
  }).join('');

  // Build command events rows (if included)
  let commandSectionHtml = '';
  if (config.includeCommands && commandLogs.length > 0) {
    const displayCommands = commandLogs.slice(0, 30);
    const commandRowsHtml = displayCommands.map((cmd) => {
      const riskColor =
        cmd.riskLevel === 'critical' ? '#ef4444' :
        cmd.riskLevel === 'high' ? '#f59e0b' :
        cmd.riskLevel === 'medium' ? '#38bdf8' : '#64748b';

      const timeFormatted = new Date(cmd.timestamp).toISOString().replace('T', ' ').substring(0, 19);
      const statusBadge =
        cmd.status === 'success'
          ? '<span style="color: #34d399; font-size: 11px; font-weight: bold;">PASS</span>'
          : '<span style="color: #f87171; font-size: 11px; font-weight: bold;">FAIL</span>';

      return `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 8px 10px; color: #94a3b8; font-size: 11px; font-family: monospace;">
            ${timeFormatted}
          </td>
          <td style="padding: 8px 10px; color: #f1f5f9; font-size: 12px; font-weight: 600;">
            ${cmd.deviceName} <span style="color: #64748b; font-size: 11px;">(${cmd.deviceIp})</span>
          </td>
          <td style="padding: 8px 10px; color: #cbd5e1; font-size: 11px; text-transform: uppercase;">
            ${cmd.deviceVendor}
          </td>
          <td style="padding: 8px 10px; color: #e2e8f0; font-size: 12px;">
            ${cmd.actor?.username || 'admin'}
          </td>
          <td style="padding: 8px 10px;">
            <span style="color: ${riskColor}; font-size: 11px; font-weight: 700; text-transform: uppercase;">
              ${cmd.riskLevel}
            </span>
          </td>
          <td style="padding: 8px 10px; font-family: monospace; font-size: 11px; color: #38bdf8;">
            <code style="background: #0f172a; padding: 3px 6px; border-radius: 4px; border: 1px solid #334155; display: inline-block;">${cmd.command}</code>
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            ${statusBadge}
          </td>
        </tr>
      `;
    }).join('');

    commandSectionHtml = `
      <div style="margin-top: 32px;">
        <h3 style="color: #f1f5f9; font-size: 16px; margin: 0 0 12px 0; display: flex; align-items: center;">
          <span style="display: inline-block; width: 4px; height: 18px; background: #ef4444; margin-right: 8px; border-radius: 2px;"></span>
          ${isEn ? 'Device Interactive Terminal & CLI Executions' : 'دستورات اجرایی کنسول و ترمینال تجهیزات'}
          <span style="font-size: 12px; font-weight: normal; color: #94a3b8; margin-left: 8px;">(${commandLogs.length} ${isEn ? 'Commands' : 'دستور'})</span>
        </h3>
        <table style="width: 100%; border-collapse: collapse; background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #111827; border-bottom: 2px solid #1e293b; text-align: left;">
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Time' : 'زمان'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Device' : 'تجهیز'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Vendor' : 'سازنده'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Operator' : 'اپراتور'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Risk' : 'سطح ریسک'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Command' : 'دستور'}</th>
              <th style="padding: 10px 10px; color: #94a3b8; font-size: 11px; text-transform: uppercase; text-align: center;">${isEn ? 'Status' : 'وضعیت'}</th>
            </tr>
          </thead>
          <tbody>
            ${commandRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // High risk callout banner if critical events exist
  let alertBannerHtml = '';
  if (summary.criticalCount > 0 || summary.warningCount > 0) {
    alertBannerHtml = `
      <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-left: 5px solid #ef4444; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center;">
          <strong style="color: #f87171; font-size: 14px;">⚠️ ${isEn ? 'Security Attention Required' : 'توجه امنیتی مورد نیاز'}</strong>
        </div>
        <p style="color: #cbd5e1; font-size: 13px; margin: 6px 0 0 0; line-height: 1.5;">
          ${isEn 
            ? `This report includes <strong>${summary.criticalCount} critical</strong> and <strong>${summary.warningCount} warning</strong> events, as well as <strong>${summary.failedCount} failed or denied</strong> operations during the selected monitoring window.`
            : `این گزارش شامل <strong>${summary.criticalCount} رخداد بحرانی</strong>، <strong>${summary.warningCount} هشدار</strong> و <strong>${summary.failedCount} عملیات ناموفق یا منع‌شده</strong> در بازه زمانی پایش شده است.`
          }
        </p>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'fa'}" dir="${isEn ? 'ltr' : 'rtl'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 960px; margin: 0 auto; padding: 24px 16px;">
    
    <!-- Top Corporate Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border: 1px solid #312e81; border-radius: 12px; padding: 28px 24px; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: middle;">
            <div style="display: flex; align-items: center;">
              <div style="display: inline-block; background: #6366f1; color: #ffffff; padding: 8px 12px; border-radius: 8px; font-weight: 800; font-size: 18px; letter-spacing: 0.5px; margin-right: 12px;">
                NET•TOPOLOGY
              </div>
              <span style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600;">
                ${isEn ? 'Audit & Command Center' : 'مرکز ممیزی و وقایع'}
              </span>
            </div>
            <h1 style="color: #ffffff; font-size: 22px; margin: 12px 0 6px 0; font-weight: 700;">
              ${reportTitle}
            </h1>
            <p style="color: #94a3b8; font-size: 13px; margin: 0;">
              ${isEn ? 'Automated Periodic Infrastructure & Security Governance Audit Dispatch' : 'گزارش ممیزی خودکار زیرساخت شبکه و تغییرات امنیتی'}
            </p>
          </td>
          <td style="text-align: right; vertical-align: middle;">
            <div style="background: #0b0f19; border: 1px solid #1e293b; padding: 10px 14px; border-radius: 8px; display: inline-block; text-align: left;">
              <div style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Generated At' : 'تاریخ صدور'}</div>
              <div style="color: #e2e8f0; font-size: 12px; font-weight: 600; margin-top: 2px;">${nowStr}</div>
              <div style="color: #38bdf8; font-size: 11px; margin-top: 4px;">
                ${isEn ? `Window: Last ${config.timeframeHours}h` : `بازه: ${config.timeframeHours} ساعت گذشته`}
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${alertBannerHtml}

    <!-- Executive Metric Cards -->
    <div style="margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0;">
        <tr>
          <!-- Total Events -->
          <td style="background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; text-align: center; width: 20%;">
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Total Events' : 'کل رویدادها'}</div>
            <div style="color: #f8fafc; font-size: 26px; font-weight: 800; margin: 6px 0 2px 0;">${summary.totalEvents}</div>
            <div style="color: #38bdf8; font-size: 11px;">${isEn ? 'Logged operations' : 'وقایع ثبت‌شده'}</div>
          </td>
          <!-- Critical / High -->
          <td style="background: #0f172a; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 16px; text-align: center; width: 20%;">
            <div style="color: #f87171; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Critical Alerts' : 'شدت بحرانی'}</div>
            <div style="color: #ef4444; font-size: 26px; font-weight: 800; margin: 6px 0 2px 0;">${summary.criticalCount}</div>
            <div style="color: #fca5a5; font-size: 11px;">${isEn ? 'High priority' : 'اولویت بالا'}</div>
          </td>
          <!-- Warnings -->
          <td style="background: #0f172a; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 16px; text-align: center; width: 20%;">
            <div style="color: #fbbf24; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Warnings' : 'هشدارها'}</div>
            <div style="color: #f59e0b; font-size: 26px; font-weight: 800; margin: 6px 0 2px 0;">${summary.warningCount}</div>
            <div style="color: #fde68a; font-size: 11px;">${isEn ? 'Modifications' : 'تغییرات حساس'}</div>
          </td>
          <!-- Failed / Denied -->
          <td style="background: #0f172a; border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 10px; padding: 16px; text-align: center; width: 20%;">
            <div style="color: #c084fc; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Failed / Denied' : 'ناموفق / رد شده'}</div>
            <div style="color: #a855f7; font-size: 26px; font-weight: 800; margin: 6px 0 2px 0;">${summary.failedCount}</div>
            <div style="color: #e9d5ff; font-size: 11px;">${isEn ? 'Exceptions' : 'خطا یا منع دسترسی'}</div>
          </td>
          <!-- Target Assets -->
          <td style="background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; padding: 16px; text-align: center; width: 20%;">
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600;">${isEn ? 'Target Assets' : 'دارایی‌های هدف'}</div>
            <div style="color: #34d399; font-size: 26px; font-weight: 800; margin: 6px 0 2px 0;">${summary.targetAssetsCount}</div>
            <div style="color: #6ee7b7; font-size: 11px;">${isEn ? 'Devices & Objects' : 'تجهیزات و اشیاء'}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Category Distribution Breakdown -->
    <div style="background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;">
      <h3 style="color: #f1f5f9; font-size: 15px; margin: 0 0 14px 0; font-weight: 600;">
        📊 ${isEn ? 'Distribution by Operational Category' : 'تفکیک رخدادها بر اساس دسته‌بندی‌های عملیاتی'}
      </h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #334155; text-align: left;">
            <th style="padding: 8px 14px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Category' : 'دسته‌بندی'}</th>
            <th style="padding: 8px 14px; color: #94a3b8; font-size: 11px; text-transform: uppercase; text-align: center;">${isEn ? 'Events Count' : 'تعداد'}</th>
            <th style="padding: 8px 14px; color: #94a3b8; font-size: 11px; text-transform: uppercase; text-align: right;">${isEn ? 'Share (%)' : 'سهم'}</th>
          </tr>
        </thead>
        <tbody>
          ${catRowsHtml || '<tr><td colspan="3" style="padding: 12px; text-align: center; color: #64748b;">No events logged for selected categories</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Detailed Audit Events Table -->
    <div style="background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h3 style="color: #f1f5f9; font-size: 16px; margin: 0; font-weight: 600;">
          📜 ${isEn ? 'Infrastructure & Security Audit Trail' : 'ثبت تفصیلی وقایع ممیزی و امنیت'}
          <span style="font-size: 12px; font-weight: normal; color: #94a3b8; margin-left: 8px;">(${portalLogs.length} ${isEn ? 'Events' : 'رویداد'})</span>
        </h3>
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #111827; border-bottom: 2px solid #1e293b; text-align: left;">
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Timestamp (UTC)' : 'زمان'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Severity' : 'شدت'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Category' : 'دسته'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Actor' : 'اپراتور'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Target' : 'هدف'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">${isEn ? 'Action & Description' : 'عملیات و شرح'}</th>
            <th style="padding: 10px 12px; color: #94a3b8; font-size: 11px; text-transform: uppercase; text-align: center;">${isEn ? 'Status' : 'وضعیت'}</th>
          </tr>
        </thead>
        <tbody>
          ${portalRowsHtml || '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #64748b;">No audit records matching the specified filters</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Commands Section (if enabled) -->
    ${commandSectionHtml}

    <!-- Enterprise Confidentiality Footer -->
    <div style="border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 36px; text-align: center;">
      <p style="color: #64748b; font-size: 12px; margin: 0 0 6px 0;">
        ${isEn 
          ? 'Automated delivery powered by NetTopology SMTP Gateway. This is a strictly confidential network security audit document intended exclusively for authorized system administrators.' 
          : 'ارسال خودکار از طریق درگاه SMTP نت‌توپولوژی. این گزارش یک سند محرمانه امنیتی بوده و صرفاً جهت استفاده مدیران مجاز سامانه است.'}
      </p>
      <p style="color: #475569; font-size: 11px; margin: 0;">
        NetTopology Management Suite • System Architecture v1.301.0 • Host: ${smtpSenderEmail || 'Core Gateway'}
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Creates CSV export string of logs for attachment
 */
export function generateAuditReportCsv(portalLogs: any[] = [], commandLogs: any[] = []): string {
  const lines: string[] = [];
  lines.push('Type,Timestamp,Severity,Category,Actor,Actor_IP,Target,Action,Details,Status');

  for (const log of portalLogs) {
    const row = [
      'PORTAL_AUDIT',
      `"${log.timestamp || ''}"`,
      `"${log.severity || ''}"`,
      `"${log.category || ''}"`,
      `"${log.actor?.username || ''}"`,
      `"${log.actor?.ipAddress || ''}"`,
      `"${(log.target?.name || log.target?.id || '').replace(/"/g, '""')}"`,
      `"${(log.action || '').replace(/"/g, '""')}"`,
      `"${(log.details || log.title || '').replace(/"/g, '""')}"`,
      `"${log.status || ''}"`,
    ];
    lines.push(row.join(','));
  }

  for (const cmd of commandLogs) {
    const row = [
      'DEVICE_COMMAND',
      `"${cmd.timestamp || ''}"`,
      `"${cmd.riskLevel || ''}"`,
      '"device_commands"',
      `"${cmd.actor?.username || ''}"`,
      `"${cmd.actor?.ipAddress || ''}"`,
      `"${(cmd.deviceName || cmd.deviceIp || '').replace(/"/g, '""')}"`,
      `"${(cmd.command || '').replace(/"/g, '""')}"`,
      `"${(cmd.outputSummary || cmd.notes || '').replace(/"/g, '""')}"`,
      `"${cmd.status || ''}"`,
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Sends the audit report email to configured recipients using the system SMTP configuration
 */
export async function sendAuditReportEmail(payload: AuditReportDataPayload): Promise<{
  success: boolean;
  messageId?: string;
  recipients: string[];
  totalLogs: number;
  portalLogsCount: number;
  commandLogsCount: number;
  latencyMs: number;
  timestamp: string;
  error?: string;
  error_fa?: string;
}> {
  const startTime = Date.now();
  const smtpConfig = await getEmailConfig();
  const storedSchedule = await getAuditReportSchedule();

  // Merge override config with stored schedule
  const effectiveConfig: AuditReportScheduleConfig = {
    ...storedSchedule,
    ...(payload.config || {}),
  };

  // 1. Validate SMTP Configuration
  if (!smtpConfig.smtp_host || smtpConfig.smtp_host.trim().length === 0) {
    return {
      success: false,
      recipients: effectiveConfig.recipients,
      totalLogs: 0,
      portalLogsCount: 0,
      commandLogsCount: 0,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      error: 'SMTP host is not configured. Please configure SMTP Connection & Account Parameters first in Settings > Email.',
      error_fa: 'مشخصات سرور SMTP تنظیم نشده است. لطفاً ابتدا در بخش تنظیمات > ایمیل، اطلاعات سرور SMTP را وارد نمایید.',
    };
  }

  // 2. Validate Recipients
  const validRecipients = (effectiveConfig.recipients || [])
    .map((r: string) => r.trim())
    .filter((r: string) => r.length > 3 && r.includes('@'));

  if (validRecipients.length === 0) {
    return {
      success: false,
      recipients: [],
      totalLogs: 0,
      portalLogsCount: 0,
      commandLogsCount: 0,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      error: 'No valid recipient email addresses configured for this audit report.',
      error_fa: 'هیچ آدرس ایمیل معتبری برای دریافت گزارش مشخص نشده است.',
    };
  }

  // 3. Filter Logs
  const { filteredPortal, filteredCommands } = filterLogsForReport(
    payload.portalLogs || [],
    payload.commandLogs || [],
    effectiveConfig
  );

  const totalLogs = filteredPortal.length + filteredCommands.length;

  // 4. Generate HTML and optional CSV attachment
  const htmlContent = generateAuditReportHtml({
    config: effectiveConfig,
    portalLogs: filteredPortal,
    commandLogs: filteredCommands,
    smtpSenderEmail: smtpConfig.from_email || smtpConfig.smtp_user,
    isEn: payload.isEn !== undefined ? payload.isEn : true,
  });

  const attachments: any[] = [];
  if (effectiveConfig.attachCsv) {
    const csvContent = generateAuditReportCsv(filteredPortal, filteredCommands);
    const dateStr = new Date().toISOString().substring(0, 10);
    attachments.push({
      filename: `nettopology_audit_report_${dateStr}.csv`,
      content: csvContent,
      contentType: 'text/csv',
    });
  }

  // 5. Send Email via Mail Transport
  try {
    const transport = createMailTransport(smtpConfig);
    const dateStr = new Date().toISOString().substring(0, 10);
    const resolvedSubject = effectiveConfig.reportTitle
      ? `${effectiveConfig.reportTitle} [${dateStr}]`
      : `[NetTopology] Enterprise Audit & Activity Report - ${dateStr}`;

    const mailOptions = {
      from: `"${smtpConfig.from_name || 'NetTopology Alerts'}" <${smtpConfig.from_email || smtpConfig.smtp_user}>`,
      to: validRecipients.join(', '),
      subject: resolvedSubject,
      html: htmlContent,
      attachments,
    };

    const info = await transport.sendMail(mailOptions);
    const latencyMs = Date.now() - startTime;

    // Update last sent timestamp
    await saveAuditReportSchedule({
      lastSentAt: new Date().toISOString(),
      lastSendStatus: 'success',
      lastSendError: undefined,
    });

    // Record system audit log
    await addAuditLog({
      action: 'AUDIT_REPORT_EMAIL_SENT',
      category: 'system_auth',
      target: validRecipients.join(', '),
      status: 'success',
      details: `Audit report successfully dispatched to ${validRecipients.length} recipients (${totalLogs} total events included, latency: ${latencyMs}ms).`,
    });

    return {
      success: true,
      messageId: info.messageId,
      recipients: validRecipients,
      totalLogs,
      portalLogsCount: filteredPortal.length,
      commandLogsCount: filteredCommands.length,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err.message || String(err);

    // Update last sent status as failed
    await saveAuditReportSchedule({
      lastSentAt: new Date().toISOString(),
      lastSendStatus: 'failed',
      lastSendError: errorMsg,
    });

    // Record system audit log
    await addAuditLog({
      action: 'AUDIT_REPORT_EMAIL_FAILED',
      category: 'system_auth',
      target: validRecipients.join(', '),
      status: 'failed',
      details: `Failed to dispatch audit report: ${errorMsg}`,
    });

    return {
      success: false,
      recipients: validRecipients,
      totalLogs,
      portalLogsCount: filteredPortal.length,
      commandLogsCount: filteredCommands.length,
      latencyMs,
      timestamp: new Date().toISOString(),
      error: `Failed to send email via SMTP: ${errorMsg}`,
      error_fa: `خطا در ارسال ایمیل از طریق سرور SMTP: ${errorMsg}`,
    };
  }
}
