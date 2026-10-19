import crypto from 'crypto';
import {
  initOrLoadSystemSecurityKeys,
  loadSecurityKeysFromDb,
  syncSecurityKeyToDb,
  getCachedSecurityKeychain,
  resolveDeviceCredentials,
  resolveServerCredentials,
  getDeviceById,
} from './server/db';
import {
  getActiveVaultMasterSecret,
  getAllCandidateMasterSecrets,
  encryptVaultSecret,
  decryptVaultSecretWithMeta,
  encryptServerSecret,
  decryptServerSecret,
  decryptServerSecretWithMeta,
  deriveUserKey,
} from './server/vaultCrypto';

async function runEmpiricalAutoHealVerification() {
  console.log('===============================================================');
  console.log('STARTING PHASE 2: DATABASE KEYCHAIN & AUTO-HEAL VERIFICATION');
  console.log('===============================================================');

  // Step 1: Initialize authoritative keychain from DB / store
  console.log('\n[1] Initializing authoritative security keychain...');
  const keychain = await syncSecurityKeyToDb();
  console.log('Active DB Master Key:', keychain.masterKey);
  console.log('Database Legacy Keys Count:', keychain.legacyKeys.length);
  if (!keychain.masterKey) {
    throw new Error('FAIL: Master key is empty!');
  }

  // Step 2: Test that aliases work
  const loadedKeychain = await loadSecurityKeysFromDb();
  if (loadedKeychain.masterKey !== keychain.masterKey) {
    throw new Error('FAIL: loadSecurityKeysFromDb did not return the expected master key!');
  }
  console.log('✓ loadSecurityKeysFromDb and syncSecurityKeyToDb aliases verified.');

  // Step 3: Simulate environment variable wipe (Zero-env dependency test)
  console.log('\n[2] Wiping environment variables to test zero-.env reliance...');
  const originalVaultSecret = process.env.VAULT_SECRET;
  const originalJwtSecret = process.env.JWT_SECRET;
  delete process.env.VAULT_SECRET;
  delete process.env.JWT_SECRET;

  const activeMasterSecret = getActiveVaultMasterSecret();
  console.log('Active Master Secret (with empty env):', activeMasterSecret);
  if (activeMasterSecret !== keychain.masterKey) {
    throw new Error('FAIL: getActiveVaultMasterSecret failed to read from DB keychain when env is empty!');
  }
  console.log('✓ Verified: System reads active key authoritatively from database without .env!');

  // Step 4: Encrypt secret with an OLD legacy key (e.g. from an older panel version)
  const legacyKey = 'nettopology_vault_master_key_2026_aes256gcm_safe';
  const testPlainPassword = 'MySecretCiscoRouterEnablePassword!2026#';
  const testUserId = 'user-admin';

  console.log('\n[3] Testing Vault Credential Decryption with Legacy Key Fallback & Auto-Heal...');
  // Manually encrypt with old legacy key
  const oldKeyBuf = crypto.scryptSync(legacyKey, `vault_user_salt_${testUserId}`, 32);
  const oldIv = crypto.randomBytes(12);
  const oldCipher = crypto.createCipheriv('aes-256-gcm', oldKeyBuf, oldIv);
  let oldEnc = oldCipher.update(testPlainPassword, 'utf8', 'hex');
  oldEnc += oldCipher.final('hex');
  const oldTag = oldCipher.getAuthTag().toString('hex');

  // Decrypt using decryptVaultSecretWithMeta
  const vaultResult = decryptVaultSecretWithMeta(oldEnc, oldIv.toString('hex'), oldTag, testUserId);
  console.log('Decrypted Vault Plaintext:', vaultResult.plainText);
  console.log('isLegacyKey Flag:', vaultResult.isLegacyKey);
  console.log('New Re-encrypted Payload generated:', Boolean(vaultResult.newPayload));

  if (vaultResult.plainText !== testPlainPassword) {
    throw new Error('FAIL: Decrypted vault plaintext does not match original password!');
  }
  if (!vaultResult.isLegacyKey) {
    throw new Error('FAIL: isLegacyKey flag should be true for legacy encrypted secret!');
  }
  if (!vaultResult.newPayload) {
    throw new Error('FAIL: newPayload was not generated for auto-healing!');
  }

  // Now decrypt the newPayload to verify it was re-encrypted with current active master key
  const healedResult = decryptVaultSecretWithMeta(
    vaultResult.newPayload.ciphertext,
    vaultResult.newPayload.iv,
    vaultResult.newPayload.tag,
    testUserId
  );
  if (healedResult.plainText !== testPlainPassword || healedResult.isLegacyKey !== false) {
    throw new Error('FAIL: Re-encrypted payload could not be decrypted with active master key!');
  }
  console.log('✓ Verified: Legacy vault credential auto-healed and re-encrypted with active DB master key.');

  // Step 5: Test Server & Network Equipment Credential Decryption & Auto-Heal
  console.log('\n[4] Testing Server & Network Equipment Decryption & Auto-Heal...');
  const serverPlainPassword = 'SuperSecretSwitchSSHPassword99$!';
  // Encrypt with legacy key using old salt
  const oldServerKey = crypto.scryptSync(legacyKey, 'server_credential_system_salt', 32);
  const oldServerIv = crypto.randomBytes(12);
  const oldServerCipher = crypto.createCipheriv('aes-256-gcm', oldServerKey, oldServerIv);
  let oldServerEnc = oldServerCipher.update(serverPlainPassword, 'utf8', 'hex');
  oldServerEnc += oldServerCipher.final('hex');
  const oldServerTag = oldServerCipher.getAuthTag().toString('hex');
  const legacyEncryptedServerString = `enc:v1:${oldServerIv.toString('hex')}:${oldServerTag}:${oldServerEnc}`;

  const serverResult = decryptServerSecretWithMeta(legacyEncryptedServerString);
  console.log('Decrypted Server Secret:', serverResult.plainText);
  console.log('isLegacyKey Flag:', serverResult.isLegacyKey);
  console.log('New Encrypted String generated:', Boolean(serverResult.newEncryptedString));

  if (serverResult.plainText !== serverPlainPassword) {
    throw new Error('FAIL: Decrypted server plaintext does not match original password!');
  }
  if (!serverResult.isLegacyKey) {
    throw new Error('FAIL: isLegacyKey should be true for legacy server secret!');
  }

  // Check that new encrypted string decrypts directly with active master key
  const activeDecrypted = decryptServerSecretWithMeta(serverResult.newEncryptedString!);
  if (activeDecrypted.plainText !== serverPlainPassword || activeDecrypted.isLegacyKey !== false) {
    throw new Error('FAIL: Auto-healed server secret does not decrypt directly with active key!');
  }
  console.log('✓ Verified: Legacy server/device credential auto-healed and re-encrypted with active DB master key.');

  // Step 6: Test Device Credential Resolution Auto-Healing
  console.log('\n[5] Testing resolveDeviceCredentials with legacy password auto-heal...');
  const mockDevice = {
    id: 'device_core_switch_test',
    name: 'Core Switch Alpha',
    ssh_username: 'cisco_admin',
    ssh_password: legacyEncryptedServerString,
    enable_password: legacyEncryptedServerString,
  };

  const resolved = await resolveDeviceCredentials(mockDevice);
  if (resolved.password !== serverPlainPassword || resolved.enablePassword !== serverPlainPassword) {
    throw new Error('FAIL: resolveDeviceCredentials failed to decrypt legacy device credentials!');
  }
  console.log('✓ Verified: resolveDeviceCredentials correctly resolved passwords:', resolved.username, resolved.password ? '✓ Password OK' : '✗');

  // Step 7: Test Server Credential Resolution Auto-Healing
  console.log('\n[6] Testing resolveServerCredentials with legacy password auto-heal...');
  const mockServer = {
    id: 'srv_ubuntu_01',
    name: 'Ubuntu Gateway',
    ssh_username: 'sysadmin',
    ssh_password: legacyEncryptedServerString,
  };

  const resolvedServer = await resolveServerCredentials(mockServer, 'ssh');
  if (resolvedServer.password !== serverPlainPassword) {
    throw new Error('FAIL: resolveServerCredentials failed to decrypt legacy server credentials!');
  }
  console.log('✓ Verified: resolveServerCredentials correctly resolved password:', resolvedServer.username, resolvedServer.password ? '✓ Password OK' : '✗');

  // Restore env vars
  if (originalVaultSecret) process.env.VAULT_SECRET = originalVaultSecret;
  if (originalJwtSecret) process.env.JWT_SECRET = originalJwtSecret;

  console.log('\n===============================================================');
  console.log('ALL PHASE 2 EMPIRICAL TESTS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================');
}

runEmpiricalAutoHealVerification().catch((err) => {
  console.error('\n❌ EMPIRICAL TEST FAILED:', err);
  process.exit(1);
});
