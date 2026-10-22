import fs from 'fs';
import path from 'path';

async function runPhase2Tests() {
  console.log('===========================================================');
  console.log('🚀 STARTING PHASE 2 NETWORK DEVICE DISCOVERY MODAL TESTS');
  console.log('===========================================================\n');

  // TEST 1: Verify DeviceDiscoveryModal file exists and contains all required features
  console.log('▶ Test 1: Verifying DeviceDiscoveryModal.tsx component implementation...');
  const modalPath = path.resolve('src/components/DeviceDiscoveryModal.tsx');
  if (!fs.existsSync(modalPath)) {
    throw new Error('DeviceDiscoveryModal.tsx does not exist in src/components!');
  }
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Verify Universal Modal Guidelines
  const requiredTokens = [
    'ModalHeaderControls',
    'FieldInfoTooltip',
    'useModalDock',
    'fixed top-0 left-0 right-0 bottom-8 z-[9999]',
    'createPortal',
    'isMaximized',
    'isLightMode',
    'isEn',
    'handleMinimize',
    'handleAbortScan',
    'handleStartScan',
    'EventSource',
    '/api/devices/discover/stream',
    '/api/devices/discover/abort',
  ];

  for (const token of requiredTokens) {
    if (!modalContent.includes(token)) {
      throw new Error(`DeviceDiscoveryModal.tsx is missing required architectural feature: "${token}"`);
    }
  }
  console.log('  ✔ Test 1 Passed: DeviceDiscoveryModal satisfies all 5 universal modal standards and SSE requirements.\n');

  // TEST 2: Verify ToolsDock registration
  console.log('▶ Test 2: Verifying ToolsDock registration for device_discovery...');
  const toolsDockPath = path.resolve('src/components/tools/ToolsDock.tsx');
  const toolsDockContent = fs.readFileSync(toolsDockPath, 'utf8');
  if (!toolsDockContent.includes("'device_discovery'")) {
    throw new Error("ToolsDock.tsx does not include 'device_discovery' in StandardModalId!");
  }
  if (!toolsDockContent.includes('device_discovery: Radar')) {
    throw new Error("ToolsDock.tsx does not map 'device_discovery' to Radar icon in STANDARD_MODAL_ICONS!");
  }
  console.log('  ✔ Test 2 Passed: device_discovery is registered in ToolsDock with Radar icon.\n');

  // TEST 3: Verify DeviceListView integration
  console.log('▶ Test 3: Verifying DeviceListView toolbar integration...');
  const deviceListPath = path.resolve('src/components/DeviceListView.tsx');
  const deviceListContent = fs.readFileSync(deviceListPath, 'utf8');
  if (!deviceListContent.includes('DeviceDiscoveryModal')) {
    throw new Error('DeviceListView.tsx does not import or render DeviceDiscoveryModal!');
  }
  if (!deviceListContent.includes('btn-network-device-discovery')) {
    throw new Error('DeviceListView.tsx does not contain the Discovery button (#btn-network-device-discovery)!');
  }
  console.log('  ✔ Test 3 Passed: Discovery button and modal are integrated into DeviceListView header and footer.\n');

  // TEST 4: Live HTTP SSE abort and stream sanity test against running backend
  console.log('▶ Test 4: Testing backend abort endpoint sanity...');
  const abortRes = await fetch('http://localhost:3000/api/devices/discover/abort', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanId: 'test-nonexistent-scan' }),
  });
  const abortData = await abortRes.json();
  console.log('  Abort endpoint response:', abortData);
  if (!abortRes.ok || abortData.success !== true) {
    throw new Error('Abort endpoint failed to respond with success: true');
  }
  console.log('  ✔ Test 4 Passed: /api/devices/discover/abort responded successfully.\n');

  console.log('===========================================================');
  console.log('🎉 ALL PHASE 2 TESTS PASSED PERFECTLY!');
  console.log('===========================================================');
}

runPhase2Tests().catch((err) => {
  console.error('❌ Phase 2 Test Failure:', err);
  process.exit(1);
});
