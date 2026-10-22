import fs from 'fs';
import path from 'path';

async function runPhase3Tests() {
  console.log('===========================================================');
  console.log('🚀 STARTING PHASE 3 NETWORK DEVICE DISCOVERY ONBOARDING TESTS');
  console.log('===========================================================\n');

  // TEST 1: Verify Onboarding & Vault Integration in DeviceDiscoveryModal.tsx
  console.log('▶ Test 1: Verifying Phase 3 features in DeviceDiscoveryModal.tsx...');
  const modalPath = path.resolve('src/components/DeviceDiscoveryModal.tsx');
  if (!fs.existsSync(modalPath)) {
    throw new Error('DeviceDiscoveryModal.tsx does not exist!');
  }
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  const requiredTokens = [
    'VaultPasswordPickerModal',
    'handleOpenSingleEnroll',
    'handleOpenBulkEnroll',
    'handleVaultPasswordSelected',
    'handleConfirmEnroll',
    'enrollTargets',
    'enrollPlatform',
    'enrollRole',
    'enrollEnablePassword',
    'enrollEnableVaultItemId',
    'enrollSshVaultItemId',
    'enrollBuilding',
    'enrollFloor',
    'enrollUnit',
    'enrollRack',
    'enrollTags',
    '/api/devices/discover/bulk-add',
    'zIndex={999999}',
  ];

  for (const token of requiredTokens) {
    if (!modalContent.includes(token)) {
      throw new Error(`DeviceDiscoveryModal.tsx is missing required Phase 3 feature: "${token}"`);
    }
  }
  console.log('  ✔ Test 1 Passed: DeviceDiscoveryModal satisfies all Phase 3 onboarding & vault requirements.\n');

  // TEST 2: Live Test /api/devices/discover/bulk-add endpoint
  console.log('▶ Test 2: Testing live bulk-add endpoint with simulated discovered Cisco & MikroTik devices...');
  const testIp1 = `192.168.99.${Math.floor(Math.random() * 200) + 10}`;
  const testIp2 = `192.168.99.${Math.floor(Math.random() * 200) + 10}`;

  const payload = {
    devices: [
      {
        name: `Test-C9300-${Date.now()}`,
        ip: testIp1,
        type: 'switch',
        role: 'Distribution',
        model: 'Cisco Catalyst 9300 Series',
        platform: 'cisco_ios_xe',
        connection_mode: 'ssh',
        connection_protocol: 'ssh',
        ssh_host: testIp1,
        ssh_port: 22,
        ssh_username: 'cisco_admin',
        ssh_password: 'TestPassword123!',
        enable_password: 'TestEnableSecret!',
        ssh_version: 'modern',
        latency_ms: 12,
        building: 'Main DataCenter',
        floor: 'Floor 2',
        unit: 'Network Core',
        rack: 'Rack-04',
        tags: ['discovered', 'test', 'cisco'],
      },
      {
        name: `Test-MikroTik-${Date.now()}`,
        ip: testIp2,
        type: 'router',
        role: 'Edge',
        model: 'MikroTik CCR1036',
        platform: 'mikrotik_routeros',
        connection_mode: 'ssh',
        connection_protocol: 'ssh',
        ssh_host: testIp2,
        ssh_port: 22,
        ssh_username: 'admin',
        ssh_password: 'MikroTikPassword123!',
        ssh_version: 'legacy',
        latency_ms: 8,
        building: 'Branch Office',
        floor: 'Ground',
        unit: 'Telecom Room',
        rack: 'Rack-B1',
        tags: ['discovered', 'test', 'mikrotik'],
      },
    ],
  };

  const addRes = await fetch('http://localhost:3000/api/devices/discover/bulk-add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-name': 'TestAdmin',
    },
    body: JSON.stringify(payload),
  });

  const addData = await addRes.json();
  console.log('  Bulk add response:', {
    status: addRes.status,
    success: addData.success,
    count: addData.count,
    enrolledNames: addData.devices?.map((d: any) => d.name),
  });

  if (!addRes.ok || !addData.success || addData.count !== 2) {
    throw new Error(`Failed to bulk add devices: ${JSON.stringify(addData)}`);
  }
  console.log('  ✔ Test 2 Passed: Successfully enrolled 2 discovered devices via /api/devices/discover/bulk-add.\n');

  // TEST 3: Verify Enrolled Devices in Inventory
  console.log('▶ Test 3: Verifying enrolled devices exist in inventory...');
  const getDevRes = await fetch('http://localhost:3000/api/devices');
  const devJson = await getDevRes.json();
  const allDevices = Array.isArray(devJson) ? devJson : (devJson.devices || []);
  const foundDev1 = allDevices.find((d: any) => d.ip === testIp1);
  const foundDev2 = allDevices.find((d: any) => d.ip === testIp2);

  if (!foundDev1 || !foundDev2) {
    throw new Error('Enrolled devices not found in /api/devices response!');
  }
  console.log('  Found enrolled Device 1:', { id: foundDev1.id, name: foundDev1.name, platform: foundDev1.platform });
  console.log('  Found enrolled Device 2:', { id: foundDev2.id, name: foundDev2.name, platform: foundDev2.platform });
  console.log('  ✔ Test 3 Passed: Both enrolled devices are confirmed in the inventory database.\n');

  console.log('===========================================================');
  console.log('🎉 ALL PHASE 3 ONBOARDING & VAULT INTEGRATION TESTS PASSED!');
  console.log('===========================================================');
}

runPhase3Tests().catch((err) => {
  console.error('❌ Phase 3 Test Failure:', err);
  process.exit(1);
});
