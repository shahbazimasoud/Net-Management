import fetch from 'node-fetch';
import { isTemplateApplyPermitted, isServerActionPermitted, isDeviceActionPermitted } from './src/utils/rbac';
import { getAccessPolicies, saveAccessPolicies } from './server/db';

const BASE_URL = 'http://localhost:3000';

interface LoginResponse {
  success: boolean;
  token: string;
  user: any;
  effectivePolicy: any;
  error?: string;
}

async function runPolicyModalTests() {
  console.log('========================================================================');
  console.log('🚀 Phase 4: Universal Tabbed Access Policy Modal End-to-End Verification');
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
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const adminLogin = (await adminLoginRes.json()) as LoginResponse;
  assert(adminLogin.success === true, 'Admin login succeeded');
  assert(Boolean(adminLogin.token), 'Admin received valid JWT token');

  // --------------------------------------------------------------------------
  // STEP 2: Save policy crafted via the 7-Tab AccessPolicyModal
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 2: Testing saving 7-tab policy structure into database...');
  const testPolicyId = 'policy-test-phase4-modal';
  const customModalPolicy = {
    id: testPolicyId,
    name: 'Modal Automated Verification Policy',
    description: 'Generated through 7-Tab Universal Access Policy Modal architecture',
    subjectType: 'user',
    subjectId: 'admin',
    targetScope: 'all',
    priority: 85,
    // Tab 2: Navigation
    canViewDashboard: true,
    canViewTopology: true,
    canViewDevices: true,
    canViewPorts: true,
    canViewDiscovery: true,
    canViewTemplates: true,
    canViewServers: true,
    canViewNetworkTools: true,
    canViewPhysicalPlacement: true,
    canViewSettings: false,
    // Tab 3: Cisco
    terminalAccess: 'full',
    canToggleAdminStatus: true,
    canChangeVlan: true,
    canTogglePortSecurity: true,
    canEditDescription: true,
    canWriteMemory: true,
    canBulkConfigurePorts: true,
    // Tab 4: MikroTik
    canMikrotikSafeMode: true,
    canMikrotikFirewall: true,
    canMikrotikBackup: true,
    canMikrotikBridgeVlan: true,
    canMikrotikToggleInterface: true,
    canMikrotikComment: true,
    canMikrotikIpPool: true,
    // Tab 5: Servers
    defaultServerPermissions: {
      terminal: true,
      file_explorer: true,
      server_management: true,
      web_management: true,
      database_management: true,
      power_control: false,
      edit_properties: false,
      delete_server: false,
    },
    // Tab 6: Global & Templates
    canApplyTemplates: true,
    canExportTemplates: true,
    canImportTemplates: true,
    canManageDevices: true,
    canExportBackup: true,
    canImportBackup: false,
    canBatchOperate: true,
    // Tab 7: Matrix Overrides
    perDevicePermissions: {
      'dev-core-01': {
        terminal: false,
        apply_template: true,
        write_memory: false,
      },
    },
    perServerPermissions: {
      'srv-web-prod01': {
        terminal: true,
        file_explorer: false,
        power_control: false,
      },
    },
  };

  const policies = await getAccessPolicies();
  const filtered = policies.filter((p: any) => p.id !== testPolicyId);
  filtered.push(customModalPolicy);
  await saveAccessPolicies(filtered);

  const reloadedPolicies = await getAccessPolicies();
  const savedPolicy = reloadedPolicies.find((p: any) => p.id === testPolicyId);
  assert(Boolean(savedPolicy), 'Saved 7-tab modal policy retrieved from database');
  assert(savedPolicy.name === 'Modal Automated Verification Policy', 'Policy name verified in DB');
  assert(savedPolicy.priority === 85, 'Priority weight 85 verified in DB');
  assert(savedPolicy.canApplyTemplates === true, 'canApplyTemplates is true in DB');
  assert(savedPolicy.canExportTemplates === true, 'canExportTemplates is true in DB');
  assert(savedPolicy.canImportTemplates === true, 'canImportTemplates is true in DB');
  assert(savedPolicy.terminalAccess === 'full', 'Cisco terminalAccess is full in DB');
  assert(savedPolicy.canMikrotikSafeMode === true, 'MikroTik Safe Mode is true in DB');
  assert(
    savedPolicy.defaultServerPermissions?.database_management === true,
    'Server database_management permission is true in DB'
  );
  assert(
    savedPolicy.perDevicePermissions?.['dev-core-01']?.terminal === false,
    'Per-device terminal override is false in DB'
  );
  assert(
    savedPolicy.perServerPermissions?.['srv-web-prod01']?.file_explorer === false,
    'Per-server file_explorer override is false in DB'
  );

  // --------------------------------------------------------------------------
  // STEP 3: Test RBAC helper functions against modal-configured policy
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 3: Testing helper functions with modal policy...');
  assert(
    isTemplateApplyPermitted(savedPolicy, false) === true,
    'isTemplateApplyPermitted returns true for saved modal policy'
  );
  assert(
    isServerActionPermitted(savedPolicy, 'srv-web-prod01', 'file_explorer') === false,
    'isServerActionPermitted respects srv-web-prod01 file_explorer override (false)'
  );
  assert(
    isServerActionPermitted(savedPolicy, 'srv-web-prod01', 'terminal') === true,
    'isServerActionPermitted allows srv-web-prod01 terminal (true)'
  );

  // --------------------------------------------------------------------------
  // STEP 4: Cleanup
  // --------------------------------------------------------------------------
  console.log('\n🔹 Step 4: Cleaning up test policy...');
  const cleaned = (await getAccessPolicies()).filter((p: any) => p.id !== testPolicyId);
  await saveAccessPolicies(cleaned);
  console.log('  Cleaned up test policy from database');

  console.log('\n========================================================================');
  console.log(`📊 PHASE 4 MODAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPolicyModalTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
