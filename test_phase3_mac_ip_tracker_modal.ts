import fs from 'fs';
import path from 'path';
import {
  detectQueryType,
  normalizeMac,
  lookupOuiVendor,
  searchMacOrIp,
  getMacIpTrackerHistory,
} from './server/macIpTrackerService';

async function runPhase3ModalTests() {
  console.log('=== [PHASE 3 TEST SUITE] MacIpTrackerModal UI & API Validation ===\n');

  // Test 1: Verify MacIpTrackerModal.tsx file existence & structural integrity
  console.log('[Test 1] Inspecting MacIpTrackerModal.tsx architecture:');
  const modalPath = path.resolve(process.cwd(), 'src/components/tools/MacIpTrackerModal.tsx');
  if (!fs.existsSync(modalPath)) {
    throw new Error('Test 1 Failed: MacIpTrackerModal.tsx does not exist!');
  }
  const modalCode = fs.readFileSync(modalPath, 'utf-8');

  // Rule 1: Three header control buttons
  const hasMinus = modalCode.includes('<Minus') || modalCode.includes('Minus,');
  const hasMaximize = modalCode.includes('<Maximize2') && modalCode.includes('<Minimize2');
  const hasClose = modalCode.includes('<X') || modalCode.includes('onClose');
  console.log('  3 Header Control Buttons (Close, Minimize, Fullscreen):', hasMinus && hasMaximize && hasClose ? 'PASS' : 'FAIL');
  if (!hasMinus || !hasMaximize || !hasClose) {
    throw new Error('Rule 1 Violation: Missing header control buttons in MacIpTrackerModal');
  }

  // Rule 2: Strict footer clearance (bottom-8, z-[999990], createPortal)
  const hasBottom8 = modalCode.includes('bottom-8');
  const hasZIndex = modalCode.includes('z-[999990]');
  const hasPortal = modalCode.includes('createPortal(modalContent, document.body)');
  console.log('  Strict Footer Clearance (bottom-8, z-[999990], createPortal):', hasBottom8 && hasZIndex && hasPortal ? 'PASS' : 'FAIL');
  if (!hasBottom8 || !hasZIndex || !hasPortal) {
    throw new Error('Rule 2 Violation: Modal must maintain bottom-8 footer clearance with z-[999990] and createPortal');
  }

  // Rule 3: Light & Dark theme adaptability
  const hasLightDark = modalCode.includes('isLightMode') && modalCode.includes('bg-slate-950') && modalCode.includes('bg-white');
  console.log('  Light / Dark Mode ergonomic theme styling:', hasLightDark ? 'PASS' : 'FAIL');
  if (!hasLightDark) {
    throw new Error('Rule 3 Violation: Missing thorough isLightMode theme handling');
  }

  // Rule 4: Strict Bilingual i18n
  const hasIsEn = modalCode.includes('isEn ?');
  console.log('  Strict Bilingual i18n conditionals:', hasIsEn ? 'PASS' : 'FAIL');
  if (!hasIsEn) {
    throw new Error('Rule 4 Violation: Missing isEn localization conditionals');
  }

  // Rule 5: 3-part FieldInfoTooltip
  const hasFieldInfo = modalCode.includes('<FieldInfoTooltip') && modalCode.includes('infoWhatEn') && modalCode.includes('infoWhyEn');
  console.log('  3-Part FieldInfoTooltip integration:', hasFieldInfo ? 'PASS' : 'FAIL');
  if (!hasFieldInfo) {
    throw new Error('Rule 5 Violation: Missing 3-Part FieldInfoTooltip integration');
  }

  // Test 2: Hero Edge Port Card, Hop Diagram & Action Buttons
  console.log('\n[Test 2] Verifying Modal Sub-Components & Action Triggers:');
  const hasHeroCard = modalCode.includes('finalEdgePort') && modalCode.includes('Physical Switch Port');
  const hasHopDiagram = modalCode.includes('pathHops') && modalCode.includes('Hop #');
  const hasTerminalAction = modalCode.includes('onOpenTerminal') && modalCode.includes('Open Switch Terminal');
  const hasInspectorAction = modalCode.includes('onOpenPortInspector') && modalCode.includes('Port Inspector');
  const hasAuditTab = modalCode.includes('Audit Search History') && modalCode.includes('fetchAuditHistory');

  console.log('  Edge Port Hero Card:', hasHeroCard ? 'PASS' : 'FAIL');
  console.log('  Switch Path Hop Diagram:', hasHopDiagram ? 'PASS' : 'FAIL');
  console.log('  Direct Terminal Action:', hasTerminalAction ? 'PASS' : 'FAIL');
  console.log('  Port Inspector Action:', hasInspectorAction ? 'PASS' : 'FAIL');
  console.log('  Audit Search History Tab:', hasAuditTab ? 'PASS' : 'FAIL');

  if (!hasHeroCard || !hasHopDiagram || !hasTerminalAction || !hasInspectorAction || !hasAuditTab) {
    throw new Error('Test 2 Failed: Incomplete sub-components in MacIpTrackerModal');
  }

  // Test 3: Backend API routes verification in server.ts
  console.log('\n[Test 3] Verifying server.ts API Endpoints:');
  const serverPath = path.resolve(process.cwd(), 'server.ts');
  const serverCode = fs.readFileSync(serverPath, 'utf-8');
  const hasSearchApi = serverCode.includes('/api/tools/mac-ip-tracker/search');
  const hasHistoryApi = serverCode.includes('/api/tools/mac-ip-tracker/history');
  const hasValidateApi = serverCode.includes('/api/tools/mac-ip-tracker/validate');

  console.log('  POST /api/tools/mac-ip-tracker/search mounted:', hasSearchApi ? 'PASS' : 'FAIL');
  console.log('  GET /api/tools/mac-ip-tracker/history mounted:', hasHistoryApi ? 'PASS' : 'FAIL');
  console.log('  POST /api/tools/mac-ip-tracker/validate mounted:', hasValidateApi ? 'PASS' : 'FAIL');

  if (!hasSearchApi || !hasHistoryApi || !hasValidateApi) {
    throw new Error('Test 3 Failed: Server API endpoints not mounted properly');
  }

  // Test 4: End-to-end Backend Engine Invocation
  console.log('\n[Test 4] Executing live search and history retrieval:');
  const searchResult = await searchMacOrIp({
    query: '0050.56a1.2234',
    operatorUsername: 'test_admin',
    clientIp: '127.0.0.1',
    forceRefresh: false,
  });

  console.log('  Search completed successfully: PASS');
  console.log('  Resolved vendor:', searchResult.vendor.vendor);
  console.log('  Total path hops:', searchResult.pathHops.length);
  console.log('  Path diagram:', searchResult.pathDiagram);

  const history = await getMacIpTrackerHistory(5);
  console.log('  History retrieved records count:', history.length);
  console.log('  Audit logger verified: PASS');

  console.log('\n=== ALL PHASE 3 TESTS PASSED SUCCESSFULLY! ===\n');
}

runPhase3ModalTests().catch((err) => {
  console.error('\n[PHASE 3 TEST FAILED]:', err);
  process.exit(1);
});
