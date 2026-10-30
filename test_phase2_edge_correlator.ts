import {
  correlateEdgeAndUplinkPorts,
  CamTableEntry,
} from './server/macIpTrackerService';

async function runPhase2Tests() {
  console.log('=== [PHASE 2 TEST SUITE] Edge Port Correlator & Topology Hop Graph Engine ===\n');

  // Define realistic multi-switch enterprise topology
  const mockDevices = [
    {
      id: 'sw-core-01',
      name: 'Core-Switch-DC01',
      ip: '10.0.0.1',
      type: 'switch',
      role: 'Core Switch',
      model: 'Cisco Catalyst 9500',
    },
    {
      id: 'sw-dist-01',
      name: 'Distro-Switch-BldgA',
      ip: '10.0.0.10',
      type: 'switch',
      role: 'Distribution Switch',
      model: 'Cisco Catalyst 9300',
    },
    {
      id: 'sw-acc-02',
      name: 'Access-Switch-Floor2',
      ip: '10.0.0.22',
      type: 'switch',
      role: 'Access Switch',
      model: 'Cisco Catalyst 2960X',
    },
  ];

  // Simulating the MAC 00:50:56:A1:22:34 appearing in CAM tables across all 3 switches
  const mockCamEntries: CamTableEntry[] = [
    {
      switchId: 'sw-core-01',
      switchName: 'Core-Switch-DC01',
      switchIp: '10.0.0.1',
      switchVendor: 'Cisco',
      vlan: '10',
      mac: '00:50:56:A1:22:34',
      type: 'DYNAMIC',
      port: 'TenGigabitEthernet1/0/24', // Uplink to distro
    },
    {
      switchId: 'sw-dist-01',
      switchName: 'Distro-Switch-BldgA',
      switchIp: '10.0.0.10',
      switchVendor: 'Cisco',
      vlan: '10',
      mac: '00:50:56:A1:22:34',
      type: 'DYNAMIC',
      port: 'Port-channel1', // Trunk port to access switch
    },
    {
      switchId: 'sw-acc-02',
      switchName: 'Access-Switch-Floor2',
      switchIp: '10.0.0.22',
      switchVendor: 'Cisco',
      vlan: '10',
      mac: '00:50:56:A1:22:34',
      type: 'DYNAMIC',
      port: 'FastEthernet0/5', // Client workstation physical cable port
    },
  ];

  console.log('[Test 1] Running Edge Port Correlator with multi-tier CAM observations:');
  const result = correlateEdgeAndUplinkPorts(mockCamEntries, mockDevices, '00:50:56:A1:22:34');

  console.log('  Total CAM observations processed:', result.correlatedEntries.length);
  console.log('  Uplink ports filtered:', result.edgeSummary.uplinksFilteredCount);
  console.log('  Final edge port identified:', result.finalEdgePort?.switchName, `[${result.finalEdgePort?.port}]`);
  console.log('  Confidence level:', result.edgeSummary.confidence);

  // Assertions
  if (!result.finalEdgePort) {
    throw new Error('Test 1 Failed: Final edge port was not identified');
  }

  if (result.finalEdgePort.switchId !== 'sw-acc-02' || result.finalEdgePort.port !== 'FastEthernet0/5') {
    throw new Error(`Test 1 Failed: Expected sw-acc-02 [FastEthernet0/5], got ${result.finalEdgePort.switchId} [${result.finalEdgePort.port}]`);
  }

  if (result.edgeSummary.uplinksFilteredCount !== 2) {
    throw new Error(`Test 1 Failed: Expected 2 uplinks filtered, got ${result.edgeSummary.uplinksFilteredCount}`);
  }

  console.log('  [PASS] Final edge port correctly isolated to Access-Switch-Floor2 Fa0/5.');

  // Test 2: Hop-by-Hop path ordering
  console.log('\n[Test 2] Verifying Hop-by-Hop Path Sequence:');
  console.log('  Path hops count:', result.pathHops.length);
  result.pathHops.forEach((hop) => {
    console.log(`    Hop ${hop.hopNumber}: ${hop.switchName} (${hop.port}) [${hop.switchRole}] - Edge: ${hop.isEdge}`);
  });

  if (result.pathHops[0].switchId !== 'sw-core-01' || result.pathHops[1].switchId !== 'sw-dist-01' || result.pathHops[2].switchId !== 'sw-acc-02') {
    throw new Error('Test 2 Failed: Hops are not ordered hierarchically from Core to Access');
  }

  console.log('  [PASS] Hierarchical Core -> Distro -> Access order verified.');

  // Test 3: Path diagram representation
  console.log('\n[Test 3] Verifying Linear Path Diagram:');
  console.log('  Generated Diagram:\n  ' + result.pathDiagram);

  if (!result.pathDiagram.includes('Core-Switch-DC01') || !result.pathDiagram.includes('Endpoint Device')) {
    throw new Error('Test 3 Failed: Path diagram is missing expected nodes');
  }
  console.log('  [PASS] Visual path diagram generated accurately.');

  // Test 4: Topology Graph Structure
  console.log('\n[Test 4] Verifying Graph Nodes & Edges:');
  console.log('  Graph nodes count:', result.graphNodes.length);
  console.log('  Graph edges count:', result.graphEdges.length);

  const endpointNode = result.graphNodes.find((n) => n.type === 'endpoint');
  if (!endpointNode) throw new Error('Test 4 Failed: Endpoint graph node missing');

  console.log('  [PASS] Graph nodes and topology edges generated cleanly.');

  // Test 5: Explanations bilingual check
  console.log('\n[Test 5] Verifying Bilingual Explanations:');
  console.log('  FA:', result.edgeSummary.explanationFa);
  console.log('  EN:', result.edgeSummary.explanationEn);

  if (!result.edgeSummary.explanationFa.includes('پورت نهایی') || !result.edgeSummary.explanationEn.includes('final client edge port')) {
    throw new Error('Test 5 Failed: Explanations missing required bilingual texts');
  }
  console.log('  [PASS] Bilingual explanations confirmed.');

  console.log('\n=== ALL PHASE 2 TESTS PASSED WITH 100% SUCCESS! ===');
}

runPhase2Tests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
