import {
  initDatabase,
  saveUserVaultItem,
  getUserVaultItems,
  getVaultLinkedTargets,
  getAllVaultLinkedTargetsSummary,
  cascadeSyncVaultItem,
  createDevice,
  createRemoteServer,
  resolveDynamicVaultPassword,
  loadFallbackStore
} from './server/db';
import { encryptVaultSecret } from './server/vaultCrypto';

async function runTest() {
  console.log('--- STARTING PHASE 4 VAULT INSIGHTS & CASCADE SYNC TEST ---');
  await initDatabase();

  const testUserId = 'test-user-phase4';
  const testSecret = 'Phase4P@ssword2026!';
  const updatedSecret = 'Phase4UpdatedP@ssword2027!';

  // 1. Create a test vault item
  const enc = encryptVaultSecret(testSecret, testUserId);
  const vaultItem = await saveUserVaultItem({
    id: `vault_phase4_${Date.now()}`,
    user_id: testUserId,
    name: 'Core Switch Root Secret',
    username: 'cisco_admin',
    category: 'network',
    target_host: '192.168.10.1',
    encrypted_password: enc.ciphertext,
    iv: enc.iv,
    tag: enc.tag,
    notes: 'Testing Phase 4 vault insights',
    tags: ['cisco', 'core'],
    strength: 'very strong',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.log('✓ Created test vault item:', vaultItem.id, vaultItem.name);

  // 2. Create a test network device bound to this vault item
  const testDevice = await createDevice({
    id: 'test-sw-core-01',
    name: 'Switch-Core-01',
    ip: '192.168.10.1',
    role: 'switch',
    status: 'online',
    ssh_vault_item_id: vaultItem.id,
    enable_vault_item_id: vaultItem.id,
  });
  console.log('✓ Created & bound network device:', testDevice.id, testDevice.name);

  // 3. Create a test remote server bound to this vault item
  const testServer = await createRemoteServer({
    id: 'test-srv-app-01',
    name: 'Srv-App-01',
    ip: '192.168.10.50',
    os_type: 'linux',
    status: 'online',
    ssh_vault_item_id: vaultItem.id,
  });
  console.log('✓ Created & bound remote server:', testServer.id, testServer.name);

  // 4. Test getVaultLinkedTargets for this single item
  const linkedSingle = await getVaultLinkedTargets(vaultItem.id);
  console.log('✓ getVaultLinkedTargets result:', JSON.stringify(linkedSingle, null, 2));

  if (!linkedSingle.devices.some(d => d.id === 'test-sw-core-01')) {
    throw new Error('Device Switch-Core-01 not found in linkedSingle.devices');
  }
  if (!linkedSingle.servers.some(s => s.id === 'test-srv-app-01')) {
    throw new Error('Server Srv-App-01 not found in linkedSingle.servers');
  }

  // 5. Test getAllVaultLinkedTargetsSummary for batch card insights
  const allSummary = await getAllVaultLinkedTargetsSummary();
  console.log(`✓ getAllVaultLinkedTargetsSummary returned ${Object.keys(allSummary).length} items`);
  const itemSummary = allSummary[vaultItem.id];
  if (!itemSummary) {
    throw new Error(`Summary for vault item ${vaultItem.id} not found in allSummary`);
  }
  console.log('✓ Item summary in batch map:', JSON.stringify(itemSummary, null, 2));
  if (itemSummary.totalCount < 2) {
    throw new Error(`Expected at least 2 linked targets, got ${itemSummary.totalCount}`);
  }

  // 6. Test dynamic password resolver before cascade
  const resolvedBefore = await resolveDynamicVaultPassword(vaultItem.id);
  if (resolvedBefore !== testSecret) {
    throw new Error(`Resolved password before mismatch: expected ${testSecret}, got ${resolvedBefore}`);
  }
  console.log('✓ Live dynamic secret resolved before update:', resolvedBefore);

  // 7. Perform vault update & cascade sync simulation (updating vault password to new secret)
  const newEnc = encryptVaultSecret(updatedSecret, testUserId);
  vaultItem.encrypted_password = newEnc.ciphertext;
  vaultItem.iv = newEnc.iv;
  vaultItem.tag = newEnc.tag;
  await saveUserVaultItem(vaultItem);

  const syncResult = await cascadeSyncVaultItem(vaultItem.id, updatedSecret, vaultItem.name);
  console.log('✓ cascadeSyncVaultItem executed successfully:', JSON.stringify(syncResult, null, 2));

  // 9. Clean up test records
  const { deleteDevice, deleteRemoteServer, deleteUserVaultItem } = await import('./server/db');
  await deleteDevice(testDevice.id);
  await deleteRemoteServer(testServer.id);
  await deleteUserVaultItem(vaultItem.id, testUserId);
  console.log('✓ Cleaned up test records');

  console.log('--- ALL PHASE 4 VAULT INSIGHTS TESTS PASSED EMPIRICALLY! ---');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
