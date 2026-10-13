import fetch from 'node-fetch';
import { isTemplateApplyPermitted, isUserSuperAdmin } from './src/utils/rbac';
import { getAccessPolicies, saveAccessPolicies } from './server/db';

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
  console.log('🚀 Phase 4: RBAC Governance & Server Veto for Initial Template Registration');
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
  // STEP 1: Test Client-Side Helper Function isTemplateApplyPermitted
  // --------------------------------------------------------------------------
  console.log('🔹 Step 1: Testing client-side RBAC helper isTemplateApplyPermitted...');
  
  const superAdminPolicy = { id: 'policy-super-admin', targetScope: 'all', priority: 100, canApplyTemplates: true };
  assert(
    isTemplateApplyPermitted(superAdminPolicy as any, true) === true,
    'isTemplateApplyPermitted returns true for Super Admin'
  );

  const restrictedPolicy = { id: 'policy-restricted', canManageDevices: true, canApplyTemplates: false };
  assert(
    isTemplateApplyPermitted(restrictedPolicy as any, false) === false,
    'isTemplateApplyPermitted returns false when canApplyTemplates is false'
  );

  const allowedPolicy = { id: 'policy-allowed', canManageDevices: true, canApplyTemplates: true };
  assert(
    isTemplateApplyPermitted(allowedPolicy as any, false) === true,
    'isTemplateApplyPermitted returns true when canApplyTemplates is true'
  );

  // --------------------------------------------------------------------------
  // STEP 2: Super Administrator Authentication & Authorized Device Registration
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 2: Authenticating as Super Administrator...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const adminLogin = (await adminLoginRes.json()) as LoginResponse;
  assert(adminLogin.success === true, 'Super Admin login succeeded');
  assert(Boolean(adminLogin.token), 'Super Admin received valid JWT token');

  console.log('\n🔹 Step 3: Registering device WITH initial template as Super Admin...');
  const adminDeviceRes = await fetch(`${BASE_URL}/api/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminLogin.token}`,
    },
    body: JSON.stringify({
      name: 'Phase4-Admin-CoreSwitch',
      ip: '10.240.10.1',
      type: 'switch',
      platform: 'cisco_ios',
      total_ports: 24,
      initial_template_id: 'tpl-cisco-base-v1',
    }),
  });
  const adminDeviceJson: any = await adminDeviceRes.json();
  assert(adminDeviceRes.status === 201, `Super Admin registration with initial template returned HTTP 201 (got ${adminDeviceRes.status})`);
  assert(adminDeviceJson.success === true, 'Device successfully created for Super Admin with initial template');
  const adminCreatedDeviceId = adminDeviceJson.device?.id;

  // --------------------------------------------------------------------------
  // STEP 4: Create Restricted Policy and User (canApplyTemplates = false)
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 4: Creating restricted user & policy with canApplyTemplates: false...');
  
  // 4A: Create local user
  const createUserRes = await fetch(`${BASE_URL}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminLogin.token}`,
    },
    body: JSON.stringify({
      username: 'operator_notpl',
      password: 'OperatorPassword123!',
      fullName: 'Network Operator (No Templates)',
      email: 'operator@nettest.local',
      role: 'operator',
      isActive: true,
    }),
  });
  const createUserJson: any = await createUserRes.json();
  assert(createUserJson.success === true, 'Created test user "operator_notpl"');

  // 4B: Save custom access policy for operator_notpl
  const policies = await getAccessPolicies();
  const testPolicyId = 'policy-operator-notpl-test';
  const updatedPolicies = policies.filter((p: any) => p.id !== testPolicyId);
  updatedPolicies.push({
    id: testPolicyId,
    name: 'Operator Prohibited from Applying Templates',
    description: 'Enforces strict prohibition on configuration templates execution',
    subjectType: 'user',
    subjectId: 'operator_notpl',
    targetScope: 'all',
    priority: 80,
    canViewDevices: true,
    canManageDevices: true,
    canApplyTemplates: false, // EXPLICITLY DISABLED
    canExportTemplates: false,
    canImportTemplates: false,
    terminalAccess: 'full',
  });
  await saveAccessPolicies(updatedPolicies);
  console.log('  Saved authoritative policy in DB with canApplyTemplates: false');

  // --------------------------------------------------------------------------
  // STEP 5: Restricted User Login & Permission Verification
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 5: Authenticating as operator_notpl...');
  const operatorLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator_notpl', password: 'OperatorPassword123!' }),
  });
  const operatorLogin = (await operatorLoginRes.json()) as LoginResponse;
  assert(operatorLogin.success === true, 'operator_notpl login succeeded');
  assert(Boolean(operatorLogin.token), 'operator_notpl received valid JWT token');
  assert(
    operatorLogin.effectivePolicy?.canApplyTemplates === false,
    'operator_notpl effective policy authoritatively has canApplyTemplates: false'
  );
  assert(
    operatorLogin.effectivePolicy?.canManageDevices === true,
    'operator_notpl has canManageDevices: true'
  );

  // --------------------------------------------------------------------------
  // STEP 6: Server-Side Veto Check - Attempt Registration WITH Initial Template
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 6: Testing server-side RBAC veto when operator_notpl supplies template ID...');
  const vetoRes = await fetch(`${BASE_URL}/api/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorLogin.token}`,
    },
    body: JSON.stringify({
      name: 'Phase4-Illegal-Template-Device',
      ip: '10.240.10.99',
      type: 'switch',
      platform: 'cisco_ios',
      total_ports: 24,
      initial_template_id: 'tpl-cisco-base-v1', // Should be VETOED by server
    }),
  });
  const vetoJson: any = await vetoRes.json();
  assert(vetoRes.status === 403, `Server rejected unauthorized template assignment with HTTP 403 (got ${vetoRes.status})`);
  assert(vetoJson.success === false, 'Response has success: false');
  assert(
    typeof vetoJson.error === 'string' && vetoJson.error.includes('canApplyTemplates required'),
    `Bilingual error contains detailed explanation: "${vetoJson.error}"`
  );
  assert(
    typeof vetoJson.errorFa === 'string' && vetoJson.errorFa.includes('canApplyTemplates'),
    `Persian error provided: "${vetoJson.errorFa}"`
  );

  // --------------------------------------------------------------------------
  // STEP 7: Legitimate Device Registration WITHOUT Initial Template
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 7: Testing legitimate device registration without template by operator_notpl...');
  const legitRes = await fetch(`${BASE_URL}/api/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${operatorLogin.token}`,
    },
    body: JSON.stringify({
      name: 'Phase4-Permitted-Device',
      ip: '10.240.10.100',
      type: 'switch',
      platform: 'cisco_ios',
      total_ports: 24,
      // No initial_template_id
    }),
  });
  const legitJson: any = await legitRes.json();
  assert(legitRes.status === 201, `Legitimate device registration returned HTTP 201 (got ${legitRes.status})`);
  assert(legitJson.success === true, 'Device successfully registered without template by operator_notpl');
  const operatorCreatedDeviceId = legitJson.device?.id;

  // --------------------------------------------------------------------------
  // STEP 8: Cleanup Test Artifacts
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 8: Cleaning up test artifacts...');
  if (adminCreatedDeviceId) {
    await fetch(`${BASE_URL}/api/devices/${adminCreatedDeviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    }).catch(() => {});
  }
  if (operatorCreatedDeviceId) {
    await fetch(`${BASE_URL}/api/devices/${operatorCreatedDeviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminLogin.token}` },
    }).catch(() => {});
  }

  // Restore access policies
  const restoredPolicies = (await getAccessPolicies()).filter((p: any) => p.id !== testPolicyId);
  await saveAccessPolicies(restoredPolicies);
  console.log('  Cleaned up test policies and temporary test devices');

  console.log('\n========================================================================');
  console.log(`📊 PHASE 4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
