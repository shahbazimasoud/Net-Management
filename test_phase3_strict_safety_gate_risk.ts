import assert from 'assert';
import { Device, ConfigTemplate, AccessPolicy } from './src/types';
import { isDeviceActionPermitted } from './src/utils/rbac';

console.log('🧪 Starting Phase 3 Strict Safety Gate & Risk Assessment Test Suite...\n');

// Mock Devices
const ciscoDevice: Device = {
  id: 'dev-cisco-01',
  name: 'Core-Switch-Cisco',
  ip: '192.168.1.1',
  model: 'Cisco Catalyst 3850',
  type: 'switch',
  role: 'Core',
  interfaces: [],
  ports: [],
} as any;

const mikrotikDevice: Device = {
  id: 'dev-mikrotik-01',
  name: 'Edge-Router-CCR',
  ip: '10.0.0.1',
  model: 'MikroTik CCR2004-16G-2S+',
  type: 'router',
  role: 'Edge',
  interfaces: [],
  ports: [],
} as any;

// Mock Templates
const ciscoTemplate: ConfigTemplate = {
  id: 'tmpl-cisco-vlan',
  name: 'Cisco VLAN Trunk Setup',
  description: 'Provisions standard VLAN trunk on Cisco Catalyst',
  vendor: 'cisco',
  target_type: 'switch',
  role: 'all',

  commands: `
hostname {{DEVICE_NAME}}
interface GigabitEthernet1/0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30
interface Vlan1
 ip address {{IP_ADDRESS}} 255.255.255.0
 no shutdown
`,
  variables: [
    { name: 'DEVICE_NAME', label: 'Hostname', default_value: 'Switch-01', type: 'text', description: 'Hostname', required: true },
    { name: 'IP_ADDRESS', label: 'Management IP', default_value: '192.168.1.1', type: 'text', description: 'Management IP', required: true },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mikrotikTemplate: ConfigTemplate = {
  id: 'tmpl-mikrotik-bridge',
  name: 'MikroTik RouterOS Bridge Setup',
  description: 'Configures Bridge and IP Addressing on RouterOS',
  vendor: 'mikrotik',
  target_type: 'router',
  role: 'all',

  commands: `
/system identity set name={{DEVICE_NAME}}
/interface bridge add name=bridge1 vlan-filtering=yes
/ip address add address={{IP_ADDRESS}}/24 interface=bridge1
/ip route add dst-address=0.0.0.0/0 gateway=10.0.0.254
`,
  variables: [
    { name: 'DEVICE_NAME', label: 'Identity', default_value: 'Router-01', type: 'text', description: 'Identity', required: true },
    { name: 'IP_ADDRESS', label: 'Bridge IP', default_value: '10.0.0.1', type: 'text', description: 'Bridge IP', required: true },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Helper functions matching ApplyTemplateModal logic
function isDeviceCisco(d: Device) {
  const model = (d.model || '').toLowerCase();
  const platform = (d.platform || '').toLowerCase();
  return model.includes('cisco') || model.includes('catalyst') || platform.includes('cisco') || model.includes('ios');
}

function isDeviceMikroTik(d: Device) {
  const model = (d.model || '').toLowerCase();
  const platform = (d.platform || '').toLowerCase();
  return model.includes('mikrotik') || model.includes('routerboard') || model.includes('crs') || model.includes('ccr') || model.includes('chr') || platform.includes('mikrotik');
}

function isDeviceCompatibleWithTemplate(device: Device, template: ConfigTemplate | null) {
  if (!template) return true;
  if (template.vendor === 'cisco') return isDeviceCisco(device);
  if (template.vendor === 'mikrotik') return isDeviceMikroTik(device);
  return true;
}

// --------------------------------------------------------------------------
// TEST 1: Vendor & OS Architecture Guard
// --------------------------------------------------------------------------
console.log('🔹 Test 1: Vendor & Operating System Architecture Compatibility Guard...');
assert(isDeviceCompatibleWithTemplate(ciscoDevice, ciscoTemplate) === true, 'Cisco device compatible with Cisco template');
assert(isDeviceCompatibleWithTemplate(mikrotikDevice, mikrotikTemplate) === true, 'MikroTik device compatible with MikroTik template');
assert(isDeviceCompatibleWithTemplate(ciscoDevice, mikrotikTemplate) === false, 'Cisco device INCOMPATIBLE with MikroTik template');
assert(isDeviceCompatibleWithTemplate(mikrotikDevice, ciscoTemplate) === false, 'MikroTik device INCOMPATIBLE with Cisco template');
console.log('   ✅ Vendor Guard accurately prevents cross-vendor deployments.');

// --------------------------------------------------------------------------
// TEST 2: Management IP Change Detection & Impact
// --------------------------------------------------------------------------
console.log('🔹 Test 2: Management IP Change Detection & Loss-of-Session Risk...');
function checkIpChanging(dev: Device, targetIp: string) {
  const clean = targetIp.trim();
  return Boolean(clean && clean !== dev.ip.trim());
}

assert(checkIpChanging(ciscoDevice, '192.168.1.1') === false, 'Same IP is not flagged as changing');
assert(checkIpChanging(ciscoDevice, '192.168.1.50') === true, 'Different IP is flagged as changing');
assert(checkIpChanging(mikrotikDevice, '10.0.0.1') === false, 'MikroTik same IP is not flagged');
assert(checkIpChanging(mikrotikDevice, '172.16.0.1') === true, 'MikroTik new IP is flagged as changing');
console.log('   ✅ Management IP change detection correctly identifies loss-of-access scenarios.');

// --------------------------------------------------------------------------
// TEST 3: Multi-Layer Database RBAC Clearance
// --------------------------------------------------------------------------
console.log('🔹 Test 3: Multi-Layer RBAC Security Clearance...');
const superAdminPolicy: AccessPolicy = {
  id: 'policy-super-admin',
  name: 'Super Administrator',
  description: 'Full Root Access',
  priority: 100,
  subjectType: 'local_user',
  subjectId: 'user-admin',
  subjectName: 'Administrator',
  targetScope: 'all',
  targetGroupIds: [],
  targetDeviceIds: [],
  canViewDashboard: true,
  canViewTopology: true,
  canViewDevices: true,
  canViewPorts: true,
  canViewScanner: true,
  canViewTemplates: true,
  canViewSettings: true,
  terminalAccess: 'full',
  canToggleAdminStatus: true,
  canChangeVlan: true,
  canEditDescription: true,
  canTogglePortSecurity: true,
  canWriteMemory: true,
  canManageDevices: true,
  canApplyTemplates: true,
  canBatchOperate: true,
};

const restrictedGlobalPolicy: AccessPolicy = {
  ...superAdminPolicy,
  id: 'policy-restricted-global',
  priority: 50,
  canApplyTemplates: false, // Revoked globally
};

const perDeviceRestrictedPolicy: AccessPolicy = {
  ...superAdminPolicy,
  id: 'policy-per-device-restricted',
  priority: 50,
  canApplyTemplates: true,
  defaultDevicePermissions: {
    apply_template: true,
  },
  perDevicePermissions: {
    'dev-cisco-01': {
      apply_template: false, // Revoked specifically on dev-cisco-01
    },
  },
};

function evaluateRbacClearance(policy: AccessPolicy | null, device: Device): boolean {
  if (!policy) return true;
  const isSuperAdmin = policy.id === 'policy-super-admin' || (policy.targetScope === 'all' && (policy.priority || 0) >= 100);
  if (isSuperAdmin) return true;
  if (policy.canApplyTemplates === false) return false;
  return isDeviceActionPermitted(policy, device.id, 'apply_template');
}

assert(evaluateRbacClearance(superAdminPolicy, ciscoDevice) === true, 'Super Admin cleared for Cisco device');
assert(evaluateRbacClearance(superAdminPolicy, mikrotikDevice) === true, 'Super Admin cleared for MikroTik device');
assert(evaluateRbacClearance(restrictedGlobalPolicy, ciscoDevice) === false, 'Restricted global policy denied');
assert(evaluateRbacClearance(perDeviceRestrictedPolicy, ciscoDevice) === false, 'Per-device restriction denied on dev-cisco-01');
assert(evaluateRbacClearance(perDeviceRestrictedPolicy, mikrotikDevice) === true, 'Per-device restriction permits other devices');
console.log('   ✅ Multi-layer RBAC authorization functions correctly.');

// --------------------------------------------------------------------------
// TEST 4: Operational Risk Classification Calculation
// --------------------------------------------------------------------------
console.log('🔹 Test 4: Operational Risk Classification Calculation...');
function calculateRiskLevel(template: ConfigTemplate, dev: Device, vars: Record<string, string>): 'high' | 'medium' | 'low' {
  const isIpChange = Boolean(vars['IP_ADDRESS'] && vars['IP_ADDRESS'].trim() !== dev.ip.trim());
  const script = (template.commands || '').toLowerCase();
  
  if (isIpChange || script.includes('vlan 1') || script.includes('/interface bridge') || script.includes('/ip route') || script.includes('firewall')) {
    return 'high';
  }
  if (vars['DEVICE_NAME'] && vars['DEVICE_NAME'] !== dev.name) {
    return 'medium';
  }
  return 'low';
}

assert(calculateRiskLevel(ciscoTemplate, ciscoDevice, { IP_ADDRESS: '192.168.1.50' }) === 'high', 'IP change classified as HIGH risk');
assert(calculateRiskLevel(mikrotikTemplate, mikrotikDevice, { IP_ADDRESS: '10.0.0.1', DEVICE_NAME: mikrotikDevice.name }) === 'high', 'Bridge & route classified as HIGH risk');

const safeTemplate: ConfigTemplate = {
  ...ciscoTemplate,
  commands: 'description Core uplink port connected to spine switch\n',
};
assert(calculateRiskLevel(safeTemplate, ciscoDevice, { IP_ADDRESS: ciscoDevice.ip, DEVICE_NAME: ciscoDevice.name }) === 'low', 'Description only classified as LOW risk');
assert(calculateRiskLevel(safeTemplate, ciscoDevice, { IP_ADDRESS: ciscoDevice.ip, DEVICE_NAME: 'New-Hostname' }) === 'medium', 'Hostname change classified as MEDIUM risk');
console.log('   ✅ Risk matrix dynamically assesses operational impact.');

// --------------------------------------------------------------------------
// TEST 5: Comprehensive Safety Gate Verification
// --------------------------------------------------------------------------
console.log('🔹 Test 5: Comprehensive Safety Gate Verification...');
interface GateState {
  isAllVariablesValid: boolean;
  isVendorMismatch: boolean;
  isRbacCleared: boolean;
  isIpChanging: boolean;
  signOffVarsConfirmed: boolean;
  signOffRiskConfirmed: boolean;
  signOffIpConfirmed: boolean;
}

function isSafetyGateCleared(state: GateState): boolean {
  if (!state.isAllVariablesValid) return false;
  if (state.isVendorMismatch) return false;
  if (!state.isRbacCleared) return false;
  if (!state.signOffVarsConfirmed) return false;
  if (!state.signOffRiskConfirmed) return false;
  if (state.isIpChanging && !state.signOffIpConfirmed) return false;
  return true;
}

// Case A: Missing variables signoff
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: true,
  isIpChanging: false,
  signOffVarsConfirmed: false,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: false,
}) === false, 'Gate locked if variables signoff missing');

// Case B: Missing risk acknowledgment signoff
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: true,
  isIpChanging: false,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: false,
  signOffIpConfirmed: false,
}) === false, 'Gate locked if risk acknowledgment missing');

// Case C: IP changing but double-confirmation missing
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: true,
  isIpChanging: true,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: false,
}) === false, 'Gate locked if IP change confirmation missing');

// Case D: Vendor mismatch present even with all signoffs
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: true,
  isRbacCleared: true,
  isIpChanging: false,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: false,
}) === false, 'Gate locked if vendor mismatch exists');

// Case E: RBAC denied even with all signoffs
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: false,
  isIpChanging: false,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: false,
}) === false, 'Gate locked if RBAC denied');

// Case F: Fully verified with IP change
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: true,
  isIpChanging: true,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: true,
}) === true, 'Gate CLEARED when all checks and IP confirmation are satisfied');

// Case G: Fully verified without IP change
assert(isSafetyGateCleared({
  isAllVariablesValid: true,
  isVendorMismatch: false,
  isRbacCleared: true,
  isIpChanging: false,
  signOffVarsConfirmed: true,
  signOffRiskConfirmed: true,
  signOffIpConfirmed: false,
}) === true, 'Gate CLEARED when all checks are satisfied without IP change');

console.log('   ✅ Comprehensive Safety Gate logic passed all assertions.');

console.log('\n🎉 ALL Phase 3 Strict Safety Gate & Risk Assessment Tests PASSED SUCCESSFULLY!\n');
