import fetch from 'node-fetch';
import { getAuditLogs, getAccessPolicies } from './server/db';

const BASE_URL = 'http://localhost:3000';

interface LoginResponse {
  success: boolean;
  token: string;
  user: any;
  effectivePolicy: any;
  error?: string;
}

async function runPhase4Tests() {
  console.log('========================================================================');
  console.log('🚀 Phase 4: Authoritative Backend RBAC & Audit Log Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // STEP 1: Authenticate as Super Administrator
  // --------------------------------------------------------------------------
  console.log('🔹 Step 1: Authenticating as Super Administrator...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as LoginResponse;
  assert(loginData.success === true, 'Admin login succeeded');
  assert(Boolean(loginData.token), 'Admin received valid cryptographic token');
  const adminToken = loginData.token;

  // --------------------------------------------------------------------------
  // STEP 2: Verify Authorized Access (Super Admin)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 2: Testing Authorized Access for Super Administrator...');
  const templatesRes = await fetch(`${BASE_URL}/api/bulk-config/templates`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  assert(templatesRes.status === 200, `Super Admin GET /api/bulk-config/templates returned HTTP 200 (got ${templatesRes.status})`);
  const templatesData = (await templatesRes.json()) as any;
  assert(Array.isArray(templatesData.templates), `Templates response has templates array (found ${templatesData.templates?.length || 0} templates)`);

  // --------------------------------------------------------------------------
  // STEP 3: Verify Unauthenticated Request Rejection (Zero Token)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 3: Testing Unauthenticated Call Rejection (Zero Token)...');
  const anonRes = await fetch(`${BASE_URL}/api/bulk-config/templates`, {
    headers: {},
  });
  assert(anonRes.status === 403, `Unauthenticated request blocked with HTTP 403 Forbidden (got ${anonRes.status})`);
  const anonData = (await anonRes.json()) as any;
  assert(anonData.success === false, 'Unauthenticated response returns success: false');
  assert(Boolean(anonData.error && anonData.errorFa), 'Unauthenticated response returns strict bilingual error');

  // --------------------------------------------------------------------------
  // STEP 4: Verify Restricted Role Rejection via Policy Simulation (Helpdesk Operator)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 4: Testing Policy-Veto for Restricted Role (canBulkConfigureDevices: false)...');
  const helpdeskTemplatesRes = await fetch(`${BASE_URL}/api/bulk-config/templates`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Simulated-Role': 'policy-helpdesk',
    },
  });
  assert(helpdeskTemplatesRes.status === 403, `Helpdesk Operator GET /api/bulk-config/templates blocked with HTTP 403 (got ${helpdeskTemplatesRes.status})`);
  const helpdeskTemplatesData = (await helpdeskTemplatesRes.json()) as any;
  assert(helpdeskTemplatesData.success === false, 'Response has success: false');
  assert(helpdeskTemplatesData.error.includes('Bulk Device Configuration'), 'Error explains lack of bulk configuration permissions');
  assert(helpdeskTemplatesData.errorFa.includes('پیکربندی گروهی تجهیزات'), 'Bilingual Persian message is present and accurate');

  // Preview endpoint protection
  console.log('\n🔹 Step 5: Testing POST /api/bulk-config/preview Rejection...');
  const helpdeskPreviewRes = await fetch(`${BASE_URL}/api/bulk-config/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'X-Simulated-Role': 'policy-helpdesk',
    },
    body: JSON.stringify({
      template_id: 'cisco_snmpv3_baseline',
      params: {},
      device_ids: ['dev-1'],
    }),
  });
  assert(helpdeskPreviewRes.status === 403, `Helpdesk Operator POST /api/bulk-config/preview blocked with HTTP 403 (got ${helpdeskPreviewRes.status})`);

  // Job launch endpoint protection
  console.log('\n🔹 Step 6: Testing POST /api/bulk-config/jobs Rejection...');
  const helpdeskJobRes = await fetch(`${BASE_URL}/api/bulk-config/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'X-Simulated-Role': 'policy-helpdesk',
    },
    body: JSON.stringify({
      template_id: 'cisco_snmpv3_baseline',
      params: {},
      device_ids: ['dev-1'],
      timeout_sec: 25,
      delay_ms: 1000,
      auto_backup: true,
      save_after_apply: true,
    }),
  });
  assert(helpdeskJobRes.status === 403, `Helpdesk Operator POST /api/bulk-config/jobs blocked with HTTP 403 (got ${helpdeskJobRes.status})`);

  // --------------------------------------------------------------------------
  // STEP 7: Verify Audit Logging in Database
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 7: Verifying Security Audit Log Emission in Database...');
  const recentLogs = await getAuditLogs(20);
  const violationLog = recentLogs.find(
    (l: any) =>
      l.action === 'Bulk Device Config Blocked (RBAC Security Violation)' &&
      l.category === 'security'
  );
  assert(Boolean(violationLog), 'Security audit log entry found for blocked bulk config attempt');
  if (violationLog) {
    assert(violationLog.status === 'warning', `Audit log status is 'warning' (got ${violationLog.status})`);
    assert(Boolean(violationLog.ip_address || violationLog.ipAddress), `Audit log records IP address (${violationLog.ip_address || violationLog.ipAddress})`);
    assert(Boolean(violationLog.user_name || violationLog.userName), `Audit log records username (${violationLog.user_name || violationLog.userName})`);
    assert(Boolean(violationLog.details?.includes('canBulkConfigureDevices')), 'Audit log details specify exact policy permission violation');
  }

  // --------------------------------------------------------------------------
  // STEP 8: Verify Permitted Non-SuperAdmin Policy (Network Administrator)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 8: Testing Authorized Role with canBulkConfigureDevices: true...');
  const netAdminTemplatesRes = await fetch(`${BASE_URL}/api/bulk-config/templates`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'X-Simulated-Role': 'policy-network-admin',
    },
  });
  assert(netAdminTemplatesRes.status === 200, `Network Administrator GET /api/bulk-config/templates allowed with HTTP 200 (got ${netAdminTemplatesRes.status})`);

  console.log('\n========================================================================');
  console.log(`📊 Phase 4 Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
