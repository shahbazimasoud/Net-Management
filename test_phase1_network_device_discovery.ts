import {
  fingerprintNetworkDevice,
  getNetworkServiceName,
  executeChunkedNetworkDeviceDiscoveryScan,
  abortNetworkDeviceDiscoveryScan,
  DiscoveredNetworkPortDetail
} from './server/networkDeviceDiscoveryEngine';
import { parseAndValidateIpRange, MAX_SCAN_IPS } from './server/discoveryEngine';

async function runPhase1Tests() {
  console.log('===========================================================');
  console.log('🚀 STARTING PHASE 1 NETWORK DEVICE DISCOVERY TESTS');
  console.log('===========================================================\n');

  // TEST 1: IP Range & CIDR Parsing
  console.log('▶ Test 1: Testing IP range parsing and interval generation...');
  const rangeResult = parseAndValidateIpRange('192.168.10.0/24', MAX_SCAN_IPS);
  console.log(`  Parsed range: requested=${rangeResult.requested}, total=${rangeResult.total}, intervals=${rangeResult.intervals.length}`);
  if (rangeResult.total !== 254) {
    throw new Error(`Expected 254 usable IPs for /24, got ${rangeResult.total}`);
  }
  console.log('  ✔ Test 1 Passed: CIDR parsed and network/broadcast skipped accurately.\n');

  // TEST 2: Network Service Name Mapping
  console.log('▶ Test 2: Testing network service port resolution...');
  const testPorts = [22, 23, 80, 443, 161, 8291, 8080, 2222];
  const portNames = testPorts.map((p) => `${p}->${getNetworkServiceName(p)}`);
  console.log('  Port resolution:', portNames.join(', '));
  if (getNetworkServiceName(22) !== 'SSH' || getNetworkServiceName(23) !== 'Telnet' || getNetworkServiceName(161) !== 'SNMP') {
    throw new Error('Service name mapping failed');
  }
  console.log('  ✔ Test 2 Passed: Service names resolved accurately for standard & custom ports.\n');

  // TEST 3: Fingerprinting Network Devices (Cisco, MikroTik, etc.)
  console.log('▶ Test 3: Testing device fingerprinting heuristics...');

  // 3.1: Cisco Catalyst 2960 Switch with Telnet & SSH
  const ciscoDetails: DiscoveredNetworkPortDetail[] = [
    { port: 22, service: 'SSH', state: 'open', banner: 'SSH-2.0-Cisco-1.25' },
    { port: 23, service: 'Telnet', state: 'open', banner: 'User Access Verification - Cisco Systems' },
    { port: 80, service: 'HTTP (Web)', state: 'open', banner: 'Server: cisco-IOS' }
  ];
  const ciscoFp = fingerprintNetworkDevice('192.168.10.2', [22, 23, 80], ciscoDetails, 'sw-access-floor1.corp.local');
  console.log('  Cisco Switch Fingerprint:', ciscoFp);
  if (ciscoFp.deviceType !== 'switch' || ciscoFp.platform !== 'cisco_ios') {
    throw new Error(`Expected Cisco IOS Switch, got ${ciscoFp.platform} / ${ciscoFp.deviceType}`);
  }
  if (ciscoFp.preferredProtocol !== 'ssh') {
    throw new Error('Expected SSH preferred protocol');
  }

  // 3.2: Cisco Catalyst 9300 IOS-XE
  const ciscoXeDetails: DiscoveredNetworkPortDetail[] = [
    { port: 22, service: 'SSH', state: 'open', banner: 'SSH-2.0-Cisco-1.25 Catalyst 9300 IOS-XE' }
  ];
  const ciscoXeFp = fingerprintNetworkDevice('192.168.10.1', [22], ciscoXeDetails, 'c9300-dist-01');
  console.log('  Cisco Catalyst 9300 Fingerprint:', ciscoXeFp);
  if (ciscoXeFp.platform !== 'cisco_ios_xe') {
    throw new Error(`Expected cisco_ios_xe, got ${ciscoXeFp.platform}`);
  }

  // 3.3: MikroTik Router
  const mikrotikDetails: DiscoveredNetworkPortDetail[] = [
    { port: 22, service: 'SSH', state: 'open', banner: 'SSH-2.0-ROSSSH' },
    { port: 8291, service: 'WinBox', state: 'open' }
  ];
  const mikrotikFp = fingerprintNetworkDevice('192.168.10.254', [22, 8291], mikrotikDetails, 'edge-gw.local');
  console.log('  MikroTik Router Fingerprint:', mikrotikFp);
  if (mikrotikFp.platform !== 'mikrotik_routeros' || mikrotikFp.deviceType !== 'router') {
    throw new Error(`Expected MikroTik router, got ${mikrotikFp.platform} / ${mikrotikFp.deviceType}`);
  }

  console.log('  ✔ Test 3 Passed: Fingerprinting heuristics correctly classify Cisco & network platforms.\n');

  // TEST 4: Chunked Network Scan Execution & Event Callbacks
  console.log('▶ Test 4: Testing live scan execution and real-time callbacks...');
  const localParsed = parseAndValidateIpRange('127.0.0.1', MAX_SCAN_IPS);
  let progressCount = 0;
  const scanResults = await executeChunkedNetworkDeviceDiscoveryScan('test-scan-001', localParsed, {
    ports: [3000], // dev server port on localhost
    timeoutMs: 400,
    concurrency: 50,
    chunkSize: 16,
    onProgress: (evt) => {
      progressCount++;
    },
    onDeviceFound: (dev) => {
      console.log(`    Discovered active host: ${dev.ip} (openPorts: ${dev.openPorts.join(', ')})`);
    }
  });

  console.log(`  Scan completed: scanned=${localParsed.total}, found=${scanResults.length}, progressEvents=${progressCount}`);
  if (progressCount === 0) {
    throw new Error('Expected at least 1 progress event');
  }
  console.log('  ✔ Test 4 Passed: Real-time scan callbacks executed properly.\n');

  // TEST 5: Abort Controller
  console.log('▶ Test 5: Testing scan abort...');
  const abortTestId = 'test-scan-abort-002';
  const abortParsed = parseAndValidateIpRange('10.254.254.0/24', MAX_SCAN_IPS);
  // Start scan in background and abort immediately
  const scanPromise = executeChunkedNetworkDeviceDiscoveryScan(abortTestId, abortParsed, {
    ports: [22, 23],
    timeoutMs: 500,
    concurrency: 20,
    chunkSize: 32,
  });

  const abortSuccess = abortNetworkDeviceDiscoveryScan(abortTestId);
  const abortedResults = await scanPromise;
  console.log(`  Abort triggered: ${abortSuccess}, partial results count: ${abortedResults.length}`);
  if (!abortSuccess) {
    throw new Error('Failed to abort scan');
  }
  console.log('  ✔ Test 5 Passed: Scan aborted successfully and cleanly.\n');

  console.log('===========================================================');
  console.log('🎉 ALL PHASE 1 NETWORK DEVICE DISCOVERY TESTS PASSED!');
  console.log('===========================================================');
}

runPhase1Tests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
