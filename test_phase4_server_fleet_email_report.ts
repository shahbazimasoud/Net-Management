import {
  filterLogsForReport,
  calculateReportSummary,
  generateAuditReportHtml,
  generateServerFleetAuditCsv,
  generateAuditReportCsv
} from './server/auditReportService';
import { AuditReportScheduleConfig, ServerCommandAuditLogEntry } from './src/types';

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 4 SERVER FLEET AUDIT REPORT TESTS');
  console.log('====================================================\n');

  // 1. Mock Server Command Logs
  const mockServerLogs: ServerCommandAuditLogEntry[] = [
    {
      id: 'srv-log-001',
      timestamp: new Date().toISOString(),
      serverId: 'srv-prod-01',
      serverName: 'Production K8s Master',
      serverIp: '192.168.10.15',
      osType: 'linux',
      osDistro: 'Ubuntu 24.04 LTS',
      channel: 'SSH_SHELL',
      actionModule: 'STORAGE_LVM',
      actionName: 'Format Partition & Mount',
      actionNameEn: 'Format Partition & Mount',
      command: 'mkfs.ext4 /dev/vg_data/lv_app && mount /dev/vg_data/lv_app /data',
      riskLevel: 'critical',
      status: 'SUCCESS',
      actor: {
        username: 'admin',
        role: 'SuperAdmin',
        ipAddress: '10.0.0.100'
      },
      durationMs: 450
    },
    {
      id: 'srv-log-002',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      serverId: 'srv-win-dc',
      serverName: 'Primary Domain Controller',
      serverIp: '192.168.10.5',
      osType: 'windows',
      osDistro: 'Windows Server 2022',
      channel: 'REMOTE_DESKTOP_RDP',
      actionModule: 'REMOTE_DESKTOP_SESSION',
      actionName: 'Active Directory User Reset',
      actionNameEn: 'Active Directory User Reset',
      command: 'Set-ADAccountPassword -Identity "finance_lead" -Reset',
      riskLevel: 'high',
      status: 'SUCCESS',
      actor: {
        username: 'sysadmin_sec',
        role: 'SecOps',
        ipAddress: '10.0.0.105'
      },
      durationMs: 1200
    },
    {
      id: 'srv-log-003',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      serverId: 'srv-web-nginx',
      serverName: 'Nginx Edge Gateway',
      serverIp: '192.168.10.80',
      osType: 'linux',
      osDistro: 'Debian 12 Bookworm',
      channel: '3DOTS_ACTION',
      actionModule: 'FIREWALL_UFW',
      actionName: 'Block Malicious Subnet',
      actionNameEn: 'Block Malicious Subnet',
      command: 'ufw insert 1 deny from 198.51.100.0/24 to any port 443',
      riskLevel: 'high',
      status: 'SUCCESS',
      actor: {
        username: 'sec_officer',
        role: 'SecOps',
        ipAddress: '10.0.0.110'
      },
      durationMs: 180
    },
    {
      id: 'srv-log-004',
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      serverId: 'srv-db-pg',
      serverName: 'PostgreSQL Primary Cluster',
      serverIp: '192.168.10.20',
      osType: 'linux',
      osDistro: 'Rocky Linux 9',
      channel: 'SSH_SHELL',
      actionModule: 'POSTGRESQL',
      actionName: 'Drop Table Attempt Blocked',
      actionNameEn: 'Drop Table Attempt Blocked',
      command: 'DROP TABLE user_audit_tokens CASCADE;',
      riskLevel: 'critical',
      status: 'ACCESS_DENIED',
      actor: {
        username: 'junior_dev',
        role: 'Operator',
        ipAddress: '10.0.0.220'
      },
      durationMs: 65,
      outputSummary: 'Permission denied: User does not hold table ownership',
      outputSummaryEn: 'Permission denied: User does not hold table ownership'
    }
  ];

  const testConfig: AuditReportScheduleConfig = {
    id: 'test-sched-001',
    reportTitle: 'Server Fleet Executive Security Audit',
    recipients: ['ciso@company.local', 'masoud.shahbazi.ai4@gmail.com'],
    frequency: 'daily',
    timeOfDay: '08:00',
    timeframeHours: 24,
    enabled: true,
    selectedCategories: ['user_management', 'system_auth'],
    minSeverity: 'all',
    statusFilter: 'all',
    includeCommands: true,
    includeServerCommands: true,
    selectedServerChannels: ['SSH_SHELL', 'REMOTE_DESKTOP_RDP', '3DOTS_ACTION'],
    selectedServerModules: ['STORAGE_LVM', 'FIREWALL_UFW', 'REMOTE_DESKTOP_SESSION', 'POSTGRESQL'],
    selectedServerIds: [], // All servers
    serverRiskFilter: 'all',
    attachCsv: true
  };

  // TEST 1: Filter Logs
  console.log('▶ Test 1: Testing filterLogsForReport with Server Fleet Logs...');
  const filtered = filterLogsForReport(
    [],
    [],
    testConfig,
    mockServerLogs
  );
  console.log(`  Filtered server command logs count: ${filtered.filteredServerCommands.length} (Expected: 4)`);
  if (filtered.filteredServerCommands.length !== 4) {
    throw new Error(`Expected 4 filtered server logs, got ${filtered.filteredServerCommands.length}`);
  }
  console.log('  ✔ Test 1 Passed: Filter correctly matched all configured channels and modules.\n');

  // TEST 2: Calculate Summary
  console.log('▶ Test 2: Testing calculateReportSummary for Server Fleet KPIs...');
  const summary = calculateReportSummary(
    [],
    [],
    mockServerLogs
  );
  console.log('  Server Fleet KPI Summary:', {
    totalEvents: summary.totalEvents,
    serverCommandEvents: summary.serverCommandEvents,
    criticalCount: summary.criticalCount,
    warningCount: summary.warningCount,
    failedCount: summary.failedCount,
    serverSshSessionsCount: summary.serverSshSessionsCount,
    serverRdpVncSessionsCount: summary.serverRdpVncSessionsCount,
    server3DotsActionsCount: summary.server3DotsActionsCount,
    serverSuspiciousCommandsCount: summary.serverSuspiciousCommandsCount,
    serverBlockedActionsCount: summary.serverBlockedActionsCount
  });
  if (summary.totalEvents !== 4) throw new Error('Expected 4 totalEvents');
  if (summary.serverCommandEvents !== 4) throw new Error('Expected 4 serverCommandEvents');
  if (summary.criticalCount !== 2) throw new Error('Expected 2 criticalCount');
  if (summary.failedCount !== 1) throw new Error('Expected 1 failedCount');
  if (summary.serverSshSessionsCount !== 2) throw new Error('Expected 2 serverSshSessionsCount');
  if (summary.serverRdpVncSessionsCount !== 1) throw new Error('Expected 1 serverRdpVncSessionsCount');
  if (summary.server3DotsActionsCount !== 1) throw new Error('Expected 1 server3DotsActionsCount');
  console.log('  ✔ Test 2 Passed: Server Fleet KPIs accurately aggregated.\n');

  // TEST 3: Generate CSV
  console.log('▶ Test 3: Testing generateServerFleetAuditCsv...');
  const csvOutput = generateServerFleetAuditCsv(mockServerLogs);
  console.log(`  Generated CSV Size: ${csvOutput.length} characters`);
  console.log('  CSV Preview (First 3 lines):');
  console.log(csvOutput.split('\n').slice(0, 3).join('\n'));
  if (!csvOutput.includes('Production K8s Master') || !csvOutput.includes('mkfs.ext4')) {
    throw new Error('CSV output does not contain expected server log details');
  }
  console.log('  ✔ Test 3 Passed: Server Fleet CSV correctly generated and escaped.\n');

  // TEST 4: Generate HTML Report (English Mode)
  console.log('▶ Test 4: Testing generateAuditReportHtml in English (Strict No-Persian Rule)...');
  const enHtml = generateAuditReportHtml({
    config: testConfig,
    portalLogs: [],
    commandLogs: [],
    serverCommandLogs: mockServerLogs,
    isEn: true
  });
  console.log(`  Generated English HTML Size: ${enHtml.length} characters`);
  if (!enHtml.includes('Production K8s Master') || !enHtml.includes('mkfs.ext4')) {
    throw new Error('English HTML does not render table row items');
  }
  // Check for Persian character leak in English mode
  const persianCharRegex = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const hasPersianInEn = persianCharRegex.test(enHtml);
  console.log(`  Persian character check in English mode: ${hasPersianInEn ? 'FAILED (Persian detected)' : 'PASSED (Zero Persian)'}`);
  if (hasPersianInEn) {
    throw new Error('Persian text leaked into English mode HTML!');
  }
  console.log('  ✔ Test 4 Passed: English HTML report rendered cleanly without any Persian characters.\n');

  // TEST 5: Generate HTML Report (Persian Mode)
  console.log('▶ Test 5: Testing generateAuditReportHtml in Persian Mode...');
  const faHtml = generateAuditReportHtml({
    config: testConfig,
    portalLogs: [],
    commandLogs: [],
    serverCommandLogs: mockServerLogs,
    isEn: false
  });
  console.log(`  Generated Persian HTML Size: ${faHtml.length} characters`);
  if (!faHtml.includes('سرور') && !faHtml.includes('ناوگان')) {
    throw new Error('Persian HTML does not contain Persian Server Fleet section title');
  }
  console.log('  ✔ Test 5 Passed: Persian HTML report rendered cleanly with localized badges.\n');

  console.log('====================================================');
  console.log('🎉 ALL PHASE 4 SERVER FLEET REPORT TESTS PASSED!');
  console.log('====================================================');
}

runPhase4Tests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
