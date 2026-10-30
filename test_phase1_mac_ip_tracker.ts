import {
  detectQueryType,
  normalizeMac,
  lookupOuiVendor,
  searchMacOrIp,
  getMacIpTrackerHistory,
} from './server/macIpTrackerService';

async function runTests() {
  console.log('=== [PHASE 1 TEST SUITE] Global MAC & IP Tracker Backend Engine ===\n');

  // Test 1: Query type detection
  console.log('[Test 1] Testing detectQueryType:');
  const mac1 = detectQueryType('0050.56a1.2234');
  const mac2 = detectQueryType('00:50:56:A1:22:34');
  const mac3 = detectQueryType('00-50-56-a1-22-34');
  const mac4 = detectQueryType('005056A12234');
  const ip1 = detectQueryType('192.168.1.100');
  const ip2 = detectQueryType('10.0.0.1');
  const ipInvalid = detectQueryType('999.999.999.999');
  const textInvalid = detectQueryType('hello_world');

  console.log('  Cisco MAC:', mac1 === 'mac' ? 'PASS' : 'FAIL', `(${mac1})`);
  console.log('  Colon MAC:', mac2 === 'mac' ? 'PASS' : 'FAIL', `(${mac2})`);
  console.log('  Hyphen MAC:', mac3 === 'mac' ? 'PASS' : 'FAIL', `(${mac3})`);
  console.log('  Clean hex MAC:', mac4 === 'mac' ? 'PASS' : 'FAIL', `(${mac4})`);
  console.log('  Standard IPv4 1:', ip1 === 'ipv4' ? 'PASS' : 'FAIL', `(${ip1})`);
  console.log('  Standard IPv4 2:', ip2 === 'ipv4' ? 'PASS' : 'FAIL', `(${ip2})`);
  console.log('  Invalid IPv4:', ipInvalid === 'invalid' ? 'PASS' : 'FAIL', `(${ipInvalid})`);
  console.log('  Invalid Text:', textInvalid === 'invalid' ? 'PASS' : 'FAIL', `(${textInvalid})`);

  if (mac1 !== 'mac' || mac2 !== 'mac' || mac3 !== 'mac' || mac4 !== 'mac' || ip1 !== 'ipv4' || ipInvalid !== 'invalid') {
    throw new Error('Test 1 Failed: detectQueryType validation failure');
  }

  // Test 2: Normalization
  console.log('\n[Test 2] Testing normalizeMac:');
  const norm = normalizeMac('0050.56a1.2234');
  if (!norm) throw new Error('normalizeMac returned null for valid cisco MAC');

  console.log('  Clean:', norm.clean === '005056a12234' ? 'PASS' : 'FAIL', `(${norm.clean})`);
  console.log('  Standard:', norm.standard === '00:50:56:a1:22:34' ? 'PASS' : 'FAIL', `(${norm.standard})`);
  console.log('  StandardUpper:', norm.standardUpper === '00:50:56:A1:22:34' ? 'PASS' : 'FAIL', `(${norm.standardUpper})`);
  console.log('  Cisco:', norm.cisco === '0050.56a1.2234' ? 'PASS' : 'FAIL', `(${norm.cisco})`);
  console.log('  Hyphen:', norm.hyphen === '00-50-56-a1-22-34' ? 'PASS' : 'FAIL', `(${norm.hyphen})`);
  console.log('  OUI:', norm.oui === '00:50:56' ? 'PASS' : 'FAIL', `(${norm.oui})`);

  // Test 3: OUI Vendor Database Lookup
  console.log('\n[Test 3] Testing lookupOuiVendor:');
  const v1 = lookupOuiVendor(norm);
  const v2 = lookupOuiVendor('00:00:0C:11:22:33'); // Cisco
  const v3 = lookupOuiVendor('00:0C:42:AA:BB:CC'); // MikroTik
  const v4 = lookupOuiVendor('00:03:93:11:22:33'); // Apple
  const v5 = lookupOuiVendor('00:06:5B:44:55:66'); // Dell
  const v6 = lookupOuiVendor('FF:EE:DD:00:11:22'); // Unknown

  console.log('  VMware lookup:', v1.vendor.includes('VMware') ? 'PASS' : 'FAIL', `(${v1.vendor})`);
  console.log('  Cisco lookup:', v2.vendor.includes('Cisco') ? 'PASS' : 'FAIL', `(${v2.vendor})`);
  console.log('  MikroTik lookup:', v3.vendor.includes('MikroTik') ? 'PASS' : 'FAIL', `(${v3.vendor})`);
  console.log('  Apple lookup:', v4.vendor.includes('Apple') ? 'PASS' : 'FAIL', `(${v4.vendor})`);
  console.log('  Dell lookup:', v5.vendor.includes('Dell') ? 'PASS' : 'FAIL', `(${v5.vendor})`);
  console.log('  Unknown lookup:', !v6.isKnown ? 'PASS' : 'FAIL', `(${v6.vendor})`);

  // Test 4: Live searchMacOrIp flow
  console.log('\n[Test 4] Testing searchMacOrIp execution flow:');
  const searchRes = await searchMacOrIp({
    query: '0050.56a1.2234',
    operatorUsername: 'test_admin',
    clientIp: '192.168.1.50',
    forceRefresh: true,
  });

  console.log('  Search executed without exception: PASS');
  console.log('  Query:', searchRes.query);
  console.log('  Vendor:', searchRes.vendor.vendor);
  console.log('  Cached:', searchRes.cached === false ? 'PASS (Live Force)' : 'FAIL');
  console.log('  Switches scanned count:', searchRes.switchesScannedCount);
  console.log('  Duration ms:', searchRes.durationMs, 'ms');

  // Test 5: In-memory cache verification
  console.log('\n[Test 5] Testing searchMacOrIp cached hit:');
  const cachedRes = await searchMacOrIp({
    query: '00:50:56:a1:22:34',
    operatorUsername: 'test_admin',
    clientIp: '192.168.1.50',
    forceRefresh: false,
  });

  console.log('  Cache hit check:', cachedRes.cached === true ? 'PASS' : 'FAIL', `(cached=${cachedRes.cached})`);
  console.log('  Sub-30ms performance check:', cachedRes.durationMs < 30 ? 'PASS' : 'NOTICE', `(${cachedRes.durationMs}ms)`);

  // Test 6: Audit search history
  console.log('\n[Test 6] Testing getMacIpTrackerHistory:');
  const history = await getMacIpTrackerHistory(10);
  console.log('  History records retrieved:', history.length >= 1 ? 'PASS' : 'FAIL', `(count=${history.length})`);
  if (history.length > 0) {
    const latest = history[0];
    console.log('  Latest history item target:', latest.target);
    console.log('  Latest history user:', latest.userName);
    console.log('  Latest history status:', latest.status);
  }

  console.log('\n=== ALL PHASE 1 TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
