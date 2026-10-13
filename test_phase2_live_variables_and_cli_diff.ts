import assert from 'assert';
import {
  validateStrictIPv4,
  validateStrictSubnetMask,
  validateStrictCIDR,
  validateStrictVLAN,
  validateStrictHostname,
  validateVariableField,
} from './src/components/ApplyTemplateModal';

console.log('🧪 Starting Phase 2 Live Variables & Rendered CLI Diff Test Suite...\n');

// 1. Strict IPv4 Validation
console.log('🔹 Test 1: Strict IPv4 Validator...');
assert(validateStrictIPv4('192.168.1.1').valid === true, 'Standard IP should be valid');
assert(validateStrictIPv4('10.200.50.254').valid === true, 'Class A private IP should be valid');
assert(validateStrictIPv4('172.16.0.1').valid === true, 'Class B private IP should be valid');
assert(validateStrictIPv4('').valid === false, 'Empty IP should fail');
assert(validateStrictIPv4('192.168.1').valid === false, 'Incomplete IP should fail');
assert(validateStrictIPv4('192.168.1.256').valid === false, 'Octet > 255 should fail');
assert(validateStrictIPv4('192.168.01.1').valid === false, 'Leading zeros should fail');
assert(validateStrictIPv4('127.0.0.1').valid === false, 'Loopback should fail');
assert(validateStrictIPv4('224.0.0.1').valid === false, 'Multicast should fail');
assert(validateStrictIPv4('245.1.1.1').valid === false, 'Class E reserved should fail');
console.log('   ✅ Strict IPv4 Validator passed all assertions.');

// 2. Strict Subnet Mask Validation
console.log('🔹 Test 2: Strict Subnet Mask Validator...');
assert(validateStrictSubnetMask('255.255.255.0').valid === true, '/24 mask should be valid');
assert(validateStrictSubnetMask('255.255.0.0').valid === true, '/16 mask should be valid');
assert(validateStrictSubnetMask('255.255.255.252').valid === true, '/30 mask should be valid');
assert(validateStrictSubnetMask('255.0.0.0').valid === true, '/8 mask should be valid');
assert(validateStrictSubnetMask('255.255.255.1').valid === false, 'Non-contiguous mask should fail');
assert(validateStrictSubnetMask('255.0.255.0').valid === false, 'Discontiguous mask should fail');
assert(validateStrictSubnetMask('invalid-mask').valid === false, 'Gibberish mask should fail');
console.log('   ✅ Strict Subnet Mask Validator passed all assertions.');

// 3. Strict CIDR Prefix Validation
console.log('🔹 Test 3: Strict CIDR Prefix Validator...');
assert(validateStrictCIDR('24').valid === true, '24 should be valid');
assert(validateStrictCIDR('/24').valid === true, '/24 with leading slash should be valid');
assert(validateStrictCIDR('32').valid === true, '32 should be valid');
assert(validateStrictCIDR('1').valid === true, '1 should be valid');
assert(validateStrictCIDR('0').valid === false, '0 should fail');
assert(validateStrictCIDR('33').valid === false, '33 should fail');
assert(validateStrictCIDR('abc').valid === false, 'Non-number should fail');
console.log('   ✅ Strict CIDR Prefix Validator passed all assertions.');

// 4. Strict VLAN ID Validation (802.1Q)
console.log('🔹 Test 4: Strict VLAN ID Validator...');
assert(validateStrictVLAN('1').valid === true, 'VLAN 1 should be valid');
assert(validateStrictVLAN('100').valid === true, 'VLAN 100 should be valid');
assert(validateStrictVLAN('4094').valid === true, 'VLAN 4094 should be valid');
assert(validateStrictVLAN('0').valid === false, 'VLAN 0 should fail');
assert(validateStrictVLAN('4095').valid === false, 'VLAN 4095 should fail');
assert(validateStrictVLAN('5000').valid === false, 'VLAN 5000 should fail');
assert(validateStrictVLAN('vlan10').valid === false, 'Non-integer VLAN should fail');
console.log('   ✅ Strict VLAN ID Validator passed all assertions.');

// 5. Strict Hostname Validation (RFC 1123)
console.log('🔹 Test 5: Strict Hostname Validator...');
assert(validateStrictHostname('Core-SW-01').valid === true, 'Standard hostname should be valid');
assert(validateStrictHostname('edge_router_01').valid === true, 'Hostname with underscores should be valid');
assert(validateStrictHostname('sw1').valid === true, 'Short hostname should be valid');
assert(validateStrictHostname('Core SW').valid === false, 'Hostname with spaces should fail');
assert(validateStrictHostname('-invalid').valid === false, 'Hostname starting with hyphen should fail');
assert(validateStrictHostname('invalid!@#').valid === false, 'Hostname with symbols should fail');
assert(validateStrictHostname('a'.repeat(64)).valid === false, 'Hostname > 63 chars should fail');
console.log('   ✅ Strict Hostname Validator passed all assertions.');

// 6. Universal Variable Field Dispatcher
console.log('🔹 Test 6: Universal Variable Field Dispatcher...');
assert(validateVariableField('IP_ADDRESS', '192.168.1.1').valid === true, 'IP_ADDRESS routes to IPv4 validator');
assert(validateVariableField('IP_ADDRESS', '999.1.1.1').valid === false, 'Invalid IP_ADDRESS correctly rejected');
assert(validateVariableField('SUBNET_MASK', '255.255.255.0').valid === true, 'SUBNET_MASK routes to mask validator');
assert(validateVariableField('SUBNET_MASK', '255.255.255.5').valid === false, 'Invalid SUBNET_MASK correctly rejected');
assert(validateVariableField('SUBNET_CIDR', '24').valid === true, 'SUBNET_CIDR routes to CIDR validator');
assert(validateVariableField('MANAGEMENT_VLAN', '100').valid === true, 'MANAGEMENT_VLAN routes to VLAN validator');
assert(validateVariableField('MANAGEMENT_VLAN', '9999').valid === false, 'Invalid VLAN correctly rejected');
assert(validateVariableField('DEVICE_NAME', 'Dist-Switch-02').valid === true, 'DEVICE_NAME routes to hostname validator');
assert(validateVariableField('CUSTOM_TEXT', 'SecretPassword123').valid === true, 'Custom non-empty text passes');
assert(validateVariableField('CUSTOM_TEXT', '').valid === false, 'Empty custom field rejected');
console.log('   ✅ Universal Variable Field Dispatcher passed all assertions.');

// 7. Script Variable Replacement Simulation
console.log('🔹 Test 7: CLI Script Variable Replacement Simulation...');
const sampleTemplate = `
hostname {{DEVICE_NAME}}
interface Vlan{{MANAGEMENT_VLAN}}
 ip address {{IP_ADDRESS}} {{SUBNET_MASK}}
 no shutdown
ip default-gateway {{DEFAULT_GATEWAY}}
`;

const vars: Record<string, string> = {
  DEVICE_NAME: 'Core-Switch-01',
  MANAGEMENT_VLAN: '10',
  IP_ADDRESS: '192.168.10.1',
  SUBNET_MASK: '255.255.255.0',
  DEFAULT_GATEWAY: '192.168.10.254',
};

let rendered = sampleTemplate;
for (const [k, v] of Object.entries(vars)) {
  rendered = rendered.split(`{{${k}}}`).join(v);
}

assert(rendered.includes('hostname Core-Switch-01'), 'DEVICE_NAME replaced');
assert(rendered.includes('interface Vlan10'), 'MANAGEMENT_VLAN replaced');
assert(rendered.includes('ip address 192.168.10.1 255.255.255.0'), 'IP and Mask replaced');
assert(rendered.includes('ip default-gateway 192.168.10.254'), 'DEFAULT_GATEWAY replaced');
assert(!rendered.includes('{{'), 'No placeholder tokens remain');
console.log('   ✅ CLI Script Variable Replacement passed all assertions.');

console.log('\n🎉 ALL Phase 2 Live Variables & Rendered CLI Diff Tests PASSED SUCCESSFULLY!\n');
