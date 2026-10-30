import fs from 'fs';
import path from 'path';

async function runPhase4Validation() {
  console.log('=== [PHASE 4 TEST SUITE] Full Footer Menu, Dock & System Integration ===\n');

  // Test 1: Verify NetworkToolsMenu.tsx integration
  console.log('[Test 1] Inspecting NetworkToolsMenu.tsx:');
  const menuPath = path.resolve(process.cwd(), 'src/components/tools/NetworkToolsMenu.tsx');
  const menuCode = fs.readFileSync(menuPath, 'utf-8');

  const hasToolItem = menuCode.includes("'mac_ip_tracker'") || menuCode.includes('"mac_ip_tracker"');
  const hasLocateFixed = menuCode.includes('LocateFixed');
  const hasCamArpBadge = menuCode.includes('CAM / ARP') || menuCode.includes('CAM/ARP');
  const hasBilingualTitles = menuCode.includes('Global MAC & IP Tracker') && menuCode.includes('ردیاب سراسری مک و آی‌پی');

  console.log('  Tool item ID "mac_ip_tracker" present:', hasToolItem ? 'PASS' : 'FAIL');
  console.log('  LocateFixed icon imported & mapped:', hasLocateFixed ? 'PASS' : 'FAIL');
  console.log('  Bilingual titles (EN/FA) configured:', hasBilingualTitles ? 'PASS' : 'FAIL');
  console.log('  CAM / ARP badge configured:', hasCamArpBadge ? 'PASS' : 'FAIL');

  if (!hasToolItem || !hasLocateFixed || !hasBilingualTitles || !hasCamArpBadge) {
    throw new Error('Test 1 Failed: NetworkToolsMenu.tsx missing mac_ip_tracker configuration');
  }

  // Test 2: Verify ToolsDock.tsx integration
  console.log('\n[Test 2] Inspecting ToolsDock.tsx:');
  const dockPath = path.resolve(process.cwd(), 'src/components/tools/ToolsDock.tsx');
  const dockCode = fs.readFileSync(dockPath, 'utf-8');

  const hasDockIcon = dockCode.includes('mac_ip_tracker: LocateFixed');
  const hasDockLocateImport = dockCode.includes('LocateFixed');

  console.log('  Dock icon mapped in TOOL_ICONS:', hasDockIcon ? 'PASS' : 'FAIL');
  console.log('  LocateFixed imported in ToolsDock:', hasDockLocateImport ? 'PASS' : 'FAIL');

  if (!hasDockIcon || !hasDockLocateImport) {
    throw new Error('Test 2 Failed: ToolsDock.tsx missing mac_ip_tracker mapping');
  }

  // Test 3: Verify App.tsx modal & labelMap wiring
  console.log('\n[Test 3] Inspecting App.tsx:');
  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');

  const hasAppModalImport = appCode.includes("import { MacIpTrackerModal } from './components/tools/MacIpTrackerModal';");
  const hasAppLabelMap = appCode.includes('mac_ip_tracker:');
  const hasAppModalRender = appCode.includes("<MacIpTrackerModal") && appCode.includes("isOpen={isToolOpen('mac_ip_tracker')}");

  console.log('  MacIpTrackerModal imported in App.tsx:', hasAppModalImport ? 'PASS' : 'FAIL');
  console.log('  mac_ip_tracker entry in labelMap:', hasAppLabelMap ? 'PASS' : 'FAIL');
  console.log('  MacIpTrackerModal rendered with isToolOpen:', hasAppModalRender ? 'PASS' : 'FAIL');

  if (!hasAppModalImport || !hasAppLabelMap || !hasAppModalRender) {
    throw new Error('Test 3 Failed: App.tsx missing modal wiring');
  }

  // Test 4: Verify types.ts
  console.log('\n[Test 4] Inspecting types.ts:');
  const typesPath = path.resolve(process.cwd(), 'src/components/tools/types.ts');
  const typesCode = fs.readFileSync(typesPath, 'utf-8');
  const hasType = typesCode.includes("'mac_ip_tracker'");
  console.log("  'mac_ip_tracker' in NetworkToolId:", hasType ? 'PASS' : 'FAIL');

  if (!hasType) {
    throw new Error('Test 4 Failed: types.ts missing mac_ip_tracker');
  }

  console.log('\n=== ALL PHASE 4 INTEGRATION TESTS PASSED! ===\n');
}

runPhase4Validation().catch((err) => {
  console.error('[PHASE 4 FAILED]:', err);
  process.exit(1);
});
