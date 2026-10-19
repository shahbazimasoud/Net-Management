import {
  initDatabase,
  getDatabaseSecurityKeys,
  saveDatabaseSecurityKeys,
  initOrLoadSystemSecurityKeys,
  getCachedSecurityKeychain,
} from './server/db';

async function runDatabaseKeychainTests() {
  console.log('====================================================================');
  console.log('🛡️ STARTING EMPIRICAL PROOF: DATABASE-AUTHORITATIVE SECURITY KEYCHAIN (PHASE 1)');
  console.log('====================================================================');

  // Step 1: Database Initialization
  console.log('\n[Step 1] Initializing Database & Executing Table Migrations...');
  await initDatabase();
  console.log('✓ Database initialized successfully.');

  // Step 2: Fetch Anchored Keychain
  console.log('\n[Step 2] Querying persistent security keychain from database...');
  const keychain = await getDatabaseSecurityKeys('vault_master');
  console.log('  Active Master Key length:', keychain.masterKey.length);
  console.log('  Active Master Key preview:', keychain.masterKey.slice(0, 10) + '...');
  console.log('  Retained Legacy Keys count:', keychain.legacyKeys.length);
  console.log('  Retained Legacy Keys list:', keychain.legacyKeys);

  if (!keychain.masterKey || keychain.masterKey.length < 16) {
    throw new Error('Step 2 Failed: Master key is missing or invalid');
  }
  if (!Array.isArray(keychain.legacyKeys) || keychain.legacyKeys.length === 0) {
    throw new Error('Step 2 Failed: Legacy keys array should contain historical candidates');
  }
  console.log('✓ PASS: Master key is solidly anchored in the database with retained historical keys.');

  // Step 3: Fast In-Memory Cache Verification
  console.log('\n[Step 3] Verifying zero-latency in-memory cache...');
  const cached = getCachedSecurityKeychain();
  if (cached && cached.masterKey === keychain.masterKey) {
    console.log('✓ PASS: Cached keychain matches database authoritative record.');
  } else {
    throw new Error('Step 3 Failed: In-memory cache is out of sync');
  }

  // Step 4: Adding a Candidate Historical Key (Simulating Key Rotation / Migration)
  console.log('\n[Step 4] Anchoring an additional legacy key into the database keychain...');
  const testCandidateKey = 'legacy_panel_update_seed_key_october_2026';
  await saveDatabaseSecurityKeys('vault_master', keychain.masterKey, [
    ...keychain.legacyKeys,
    testCandidateKey,
  ]);

  const updatedKeychain = await getDatabaseSecurityKeys('vault_master');
  console.log('  Updated Legacy Keys count:', updatedKeychain.legacyKeys.length);
  if (!updatedKeychain.legacyKeys.includes(testCandidateKey)) {
    throw new Error('Step 4 Failed: Newly anchored legacy key was not found in database');
  }
  console.log('✓ PASS: Successfully persisted new historical key into database.');

  // Step 5: Re-running initOrLoadSystemSecurityKeys to verify idempotency
  console.log('\n[Step 5] Testing idempotency of database keychain initialization...');
  const reloaded = await initOrLoadSystemSecurityKeys();
  if (reloaded.masterKey === keychain.masterKey && reloaded.legacyKeys.includes(testCandidateKey)) {
    console.log('✓ PASS: Database keychain is completely idempotent and preserves existing keys on restart.');
  } else {
    throw new Error('Step 5 Failed: Idempotency check failed');
  }

  console.log('\n====================================================================');
  console.log('🏆 ALL PHASE 1 DATABASE KEYCHAIN TESTS PASSED WITH 100% SUCCESS!');
  console.log('====================================================================');
}

runDatabaseKeychainTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
