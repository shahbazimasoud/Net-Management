import crypto from 'crypto';
import {
  deriveUserKey,
  decryptVaultSecretWithMeta,
  decryptVaultSecret,
  encryptVaultSecret,
} from './server/vaultCrypto';
import {
  initDatabase,
  saveUserVaultItem,
  getVaultItemById,
  resolveDynamicVaultPassword,
  loadFallbackStore,
} from './server/db';

async function runVaultDecryptionHealingTests() {
  console.log('====================================================================');
  console.log('⚡ STARTING EMPIRICAL PROOF: VAULT ADAPTIVE DECRYPTION & AUTO-HEALING');
  console.log('====================================================================');

  await initDatabase();
  console.log('✓ Database initialized.');

  // Test 1: Decrypt legacy secret encrypted with fallback master key
  console.log('\n[Test 1] Testing legacy secret encrypted with fallback master key...');
  const legacySecret = 'SuperSecretLegacyP@ssword2026!';
  const legacyMasterKey = 'nettopology_super_secret_jwt_key_2026_cisco_ops';
  const legacyUserId = 'user-admin';

  // Manually encrypt using legacy key
  const legacyDerivedKey = crypto.scryptSync(legacyMasterKey, `vault_user_salt_${legacyUserId}`, 32);
  const legacyIv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', legacyDerivedKey, legacyIv);
  let legacyCiphertext = cipher.update(legacySecret, 'utf8', 'hex');
  legacyCiphertext += cipher.final('hex');
  const legacyTag = cipher.getAuthTag().toString('hex');

  console.log('  Legacy Ciphertext created:', legacyCiphertext.slice(0, 16) + '...');

  // Now decrypt using decryptVaultSecretWithMeta
  const result1 = decryptVaultSecretWithMeta(
    legacyCiphertext,
    legacyIv.toString('hex'),
    legacyTag,
    legacyUserId
  );

  console.log('  Decrypted Text:', result1.plainText);
  console.log('  Is Legacy Key:', result1.isLegacyKey);
  console.log('  Has New Payload for Auto-Healing:', Boolean(result1.newPayload));

  if (result1.plainText === legacySecret && result1.isLegacyKey && result1.newPayload) {
    console.log('✓ PASS: Successfully decrypted legacy secret and generated auto-heal payload.');
  } else {
    throw new Error('Test 1 Failed: Could not decrypt legacy secret');
  }

  // Test 2: Decrypt secret created with alternate user salt (e.g. "admin" instead of "user-admin")
  console.log('\n[Test 2] Testing alternate salt decryption (admin salt vs user-admin query)...');
  const alternateSecret = 'AltSaltSecret#9988!';
  const altKey = crypto.scryptSync(legacyMasterKey, `vault_user_salt_admin`, 32);
  const altIv = crypto.randomBytes(12);
  const altCipher = crypto.createCipheriv('aes-256-gcm', altKey, altIv);
  let altCiphertext = altCipher.update(alternateSecret, 'utf8', 'hex');
  altCiphertext += altCipher.final('hex');
  const altTag = altCipher.getAuthTag().toString('hex');

  const result2 = decryptVaultSecretWithMeta(
    altCiphertext,
    altIv.toString('hex'),
    altTag,
    'user-admin'
  );

  console.log('  Decrypted Text:', result2.plainText);
  console.log('  Is Legacy Key:', result2.isLegacyKey);

  if (result2.plainText === alternateSecret) {
    console.log('✓ PASS: Alternate salt fallback successfully resolved the credential.');
  } else {
    throw new Error('Test 2 Failed: Alternate salt decryption failed');
  }

  // Test 3: Active key decryption should flag isLegacyKey = false
  console.log('\n[Test 3] Testing active master key encryption and decryption...');
  const activeSecret = 'ActiveNewPassword@2027!';
  const encActive = encryptVaultSecret(activeSecret, 'user-admin');
  const result3 = decryptVaultSecretWithMeta(
    encActive.ciphertext,
    encActive.iv,
    encActive.tag,
    'user-admin'
  );

  console.log('  Decrypted Text:', result3.plainText);
  console.log('  Is Legacy Key:', result3.isLegacyKey);

  if (result3.plainText === activeSecret && !result3.isLegacyKey) {
    console.log('✓ PASS: Active key decrypted in primary fast-path without fallback.');
  } else {
    throw new Error('Test 3 Failed: Active key test failed');
  }

  // Test 4: End-to-end Database Auto-Healing via resolveDynamicVaultPassword
  console.log('\n[Test 4] Testing end-to-end database auto-healing on device/server resolve...');
  const healTestId = `vault_test_heal_${Date.now()}`;
  const healSecret = 'HealMeDynamically@2026!';

  // Save item with legacy ciphertext
  const legacyHealIv = crypto.randomBytes(12);
  const healKey = crypto.scryptSync(legacyMasterKey, `vault_user_salt_user-admin`, 32);
  const healCipher = crypto.createCipheriv('aes-256-gcm', healKey, legacyHealIv);
  let healCiphertext = healCipher.update(healSecret, 'utf8', 'hex');
  healCiphertext += healCipher.final('hex');
  const healTag = healCipher.getAuthTag().toString('hex');

  await saveUserVaultItem({
    id: healTestId,
    user_id: 'user-admin',
    name: 'Legacy Switch Root Credential',
    username: 'cisco_admin',
    encrypted_password: healCiphertext,
    iv: legacyHealIv.toString('hex'),
    tag: healTag,
    category: 'network',
    target_host: '10.10.10.254',
    notes: 'Testing auto-healing migration',
    tags: ['legacy', 'healing'],
    strength: 'very strong',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log('  Created legacy vault record:', healTestId);

  // Call resolveDynamicVaultPassword (simulates switch or router connecting to this vault password)
  const resolvedSecret = await resolveDynamicVaultPassword(healTestId);
  console.log('  Resolved Secret:', resolvedSecret);

  if (resolvedSecret !== healSecret) {
    throw new Error('Test 4 Failed: resolveDynamicVaultPassword failed to decrypt legacy secret');
  }

  // Wait 100ms for async auto-healing persistence
  await new Promise((r) => setTimeout(r, 200));

  // Inspect the record in database: it should now be encrypted with active key
  const healedItem = await getVaultItemById(healTestId);
  if (!healedItem) {
    throw new Error('Test 4 Failed: Healed item not found');
  }

  console.log('  Original Ciphertext:', healCiphertext.slice(0, 16) + '...');
  console.log('  Healed Ciphertext:  ', healedItem.encrypted_password.slice(0, 16) + '...');

  const verifyHealed = decryptVaultSecretWithMeta(
    healedItem.encrypted_password,
    healedItem.iv,
    healedItem.tag,
    healedItem.user_id
  );

  console.log('  Verify Healed isLegacyKey:', verifyHealed.isLegacyKey);

  if (verifyHealed.plainText === healSecret && verifyHealed.isLegacyKey === false) {
    console.log('✓ PASS: Database record was automatically healed and re-encrypted with active key!');
  } else {
    throw new Error('Test 4 Failed: Item was not properly auto-healed');
  }

  console.log('\n====================================================================');
  console.log('🏆 ALL ADAPTIVE DECRYPTION & AUTO-HEALING TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================================');
}

runVaultDecryptionHealingTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
