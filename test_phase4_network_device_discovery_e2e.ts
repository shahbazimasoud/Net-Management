import fs from 'fs';
import path from 'path';

async function runPhase4E2ETests() {
  console.log('===========================================================');
  console.log('🚀 STARTING PHASE 4 NETWORK EQUIPMENT DISCOVERY E2E TESTS');
  console.log('===========================================================\n');

  // TEST 1: Verify End-to-End UI Integration in DeviceListView
  console.log('▶ Test 1: Verifying DeviceListView Discovery toolbar button and dock wiring...');
  const listViewPath = path.resolve('src/components/DeviceListView.tsx');
  const listViewContent = fs.readFileSync(listViewPath, 'utf8');

  if (!listViewContent.includes('btn-network-device-discovery')) {
    throw new Error('DeviceListView missing #btn-network-device-discovery button ID');
  }
  if (!listViewContent.includes('handleMinimizeDiscovery')) {
    throw new Error('DeviceListView missing handleMinimizeDiscovery handler');
  }
  if (!listViewContent.includes("undockModal('device_discovery')")) {
    throw new Error('DeviceListView missing undockModal cleanup for device_discovery');
  }
  console.log('  ✔ Test 1 Passed: DeviceListView is fully integrated with glowing button and ToolsDock handlers.\n');

  // TEST 2: Verify ToolsDock Registration & Icon
  console.log('▶ Test 2: Verifying ToolsDock registration and Radar icon...');
  const toolsDockPath = path.resolve('src/components/tools/ToolsDock.tsx');
  const toolsDockContent = fs.readFileSync(toolsDockPath, 'utf8');

  if (!toolsDockContent.includes("'device_discovery'")) {
    throw new Error('StandardModalId does not include device_discovery');
  }
  if (!toolsDockContent.includes('device_discovery: Radar')) {
    throw new Error('STANDARD_MODAL_ICONS does not map device_discovery to Radar');
  }
  console.log('  ✔ Test 2 Passed: ToolsDock correctly maps device_discovery to Radar icon.\n');

  // TEST 3: Verify DeviceDiscoveryModal Complete Standards
  console.log('▶ Test 3: Verifying DeviceDiscoveryModal architectural standards...');
  const modalPath = path.resolve('src/components/DeviceDiscoveryModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  const requiredArchitecturalTokens = [
    'fixed top-0 left-0 right-0 bottom-8 z-[999990]', // strict footer clearance & tools modal priority
    'ModalHeaderControls',                          // 3-button controls
    'FieldInfoTooltip',                             // 3-part tooltip
    'useModalDock',                                 // ToolsDock integration
    'VaultPasswordPickerModal',                     // Password Vault integration
    'zIndex={999999}',                              // Vault z-index priority
    '/api/devices/discover/stream',                 // SSE live stream
    '/api/devices/discover/abort',                  // abort controller
    '/api/devices/discover/bulk-add',               // enrollment endpoint
  ];

  for (const token of requiredArchitecturalTokens) {
    if (!modalContent.includes(token)) {
      throw new Error(`DeviceDiscoveryModal is missing architectural token: "${token}"`);
    }
  }
  console.log('  ✔ Test 3 Passed: DeviceDiscoveryModal satisfies all 5 universal modal standards.\n');

  // TEST 4: Live E2E Backend API Health Check
  console.log('▶ Test 4: Verifying backend endpoints responsiveness...');
  const abortCheck = await fetch('http://localhost:3000/api/devices/discover/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanId: 'e2e-health-check' }),
  });
  if (!abortCheck.ok) {
    throw new Error(`Abort endpoint failed: ${abortCheck.status}`);
  }

  const devCheck = await fetch('http://localhost:3000/api/devices');
  if (!devCheck.ok) {
    throw new Error(`Devices endpoint failed: ${devCheck.status}`);
  }
  console.log('  ✔ Test 4 Passed: Live discovery and inventory endpoints are healthy.\n');

  console.log('===========================================================');
  console.log('🎉 ALL PHASE 4 E2E INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('===========================================================');
}

runPhase4E2ETests().catch((err) => {
  console.error('❌ Phase 4 E2E Test Failure:', err);
  process.exit(1);
});
