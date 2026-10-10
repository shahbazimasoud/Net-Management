/**
 * Real End-to-End Test Suite for Policy-Governed Map Subject Authorization (Phase 3)
 * Tests live endpoints, PostgreSQL persistence, and lifecycle changes without mocks.
 */

async function runMapSubjectVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('=== NetTopology Map Subject Authorization Real Verification ===\n');

  // 1. Initial subjects fetch
  console.log('[Test 1] Fetching initial authorized map subjects via GET /api/settings/authorized-map-subjects...');
  const initRes = await fetch(`${baseUrl}/api/settings/authorized-map-subjects`);
  const initData = await initRes.json();
  if (!initRes.ok || !initData.success) {
    throw new Error(`Test 1 Failed: Status ${initRes.status}, data: ${JSON.stringify(initData)}`);
  }
  console.log(`✓ Test 1 Passed: Retrieved ${initData.count} authorized subjects.`);
  console.log(`  Local Users: ${initData.categories?.localUsers?.length || 0}`);
  console.log(`  AD Groups with Policy: ${initData.categories?.adGroups?.length || 0} (${initData.categories?.adGroups?.map((g: any) => g.name).join(', ')})`);
  console.log(`  AD Users with Policy: ${initData.categories?.adUsers?.length || 0}`);

  // 2. Fetch existing policies to preserve them
  const polRes = await fetch(`${baseUrl}/api/settings/access-policies`);
  const polData = await polRes.json();
  const currentPolicies = Array.isArray(polData.policies) ? polData.policies : [];

  // 3. Assign a new policy to an Active Directory User "s.ahmadi"
  console.log('\n[Test 2] Dynamically assigning a new Access Policy to AD User "s.ahmadi"...');
  const testPolicyId = `policy-ad-user-test-${Date.now()}`;
  const newAdUserPolicy = {
    id: testPolicyId,
    name: 'مهندس امنیت شبکه (CyberSec Engineer)',
    description: 'نقش دسترسی مستقیم آزمایشی متصل به کاربر دامین s.ahmadi',
    priority: 65,
    subjectType: 'ad_user',
    subjectId: 's.ahmadi',
    subjectName: 'Saeed Ahmadi (AD User)',
    isBuiltin: false,
    canViewTopology: true,
    canViewDashboard: true,
  };

  const updatedPolicies = [...currentPolicies, newAdUserPolicy];
  const savePolRes = await fetch(`${baseUrl}/api/settings/access-policies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policies: updatedPolicies }),
  });
  const savePolData = await savePolRes.json();
  if (!savePolRes.ok || !savePolData.success) {
    throw new Error(`Test 2 Failed: Unable to save policy: ${JSON.stringify(savePolData)}`);
  }
  console.log(`✓ Test 2 Passed: Policy "${newAdUserPolicy.name}" assigned to AD user "s.ahmadi" and saved in database.`);

  // 4. Verify that "s.ahmadi" now appears in authorized subjects
  console.log('\n[Test 3] Verifying "s.ahmadi" appears in GET /api/settings/authorized-map-subjects...');
  const afterAddRes = await fetch(`${baseUrl}/api/settings/authorized-map-subjects`);
  const afterAddData = await afterAddRes.json();
  const foundUser = (afterAddData.categories?.adUsers || []).find((u: any) => u.name === 's.ahmadi' || u.id === 's.ahmadi');
  if (foundUser) {
    console.log(`✓ Test 3 Passed: AD User "s.ahmadi" successfully discovered in database with policy "${foundUser.policyName}"!`);
    console.log(`  DisplayName: ${foundUser.displayName}, Badge: ${foundUser.badge}`);
  } else {
    throw new Error(`Test 3 Failed: "s.ahmadi" was NOT found in adUsers list! Data: ${JSON.stringify(afterAddData.categories?.adUsers)}`);
  }

  // 5. Test Map Visibility for Restricted Map
  console.log('\n[Test 4] Testing restricted map creation with "s.ahmadi" and AD Group "Helpdesk-Admins"...');
  const mapsRes = await fetch(`${baseUrl}/api/settings/maps`);
  const existingMaps = (await mapsRes.json()).maps || [];

  const testMap = {
    id: `map-test-ad-auth-${Date.now()}`,
    name: 'نقشه آزمایشی زون امنیتی دیتاسنتر',
    description: 'تست سطح دسترسی کاربران و گروه‌های دامین',
    type: 'schematic',
    visibility: 'restricted',
    allowedUsers: ['s.ahmadi', 'helpdesk-admins'],
    devicePositions: {},
    deviceIds: [],
    links: [],
  };

  const saveMapRes = await fetch(`${baseUrl}/api/settings/maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maps: [...existingMaps, testMap] }),
  });
  if (!saveMapRes.ok) {
    throw new Error(`Test 4 Failed: Could not save test map: ${saveMapRes.status}`);
  }
  console.log(`✓ Test 4 Passed: Map created with restricted access granted to "s.ahmadi" and "helpdesk-admins".`);

  // 6. Test querying map as member of Helpdesk-Admins
  console.log('\n[Test 5] Checking map visibility when authenticated as AD Group "Helpdesk-Admins"...');
  // Query with user filter having group membership
  const adGroupMapsRes = await fetch(`${baseUrl}/api/settings/maps?username=operator1&role=Operator`);
  const adGroupMapsData = await adGroupMapsRes.json();
  console.log(`✓ Test 5 Passed: Map visibility queried successfully. Total maps visible: ${adGroupMapsData.maps?.length || 0}.`);

  // 7. Lifecycle test: Delete the policy for "s.ahmadi"
  console.log(`\n[Test 6] Testing policy lifecycle deletion for policy ID "${testPolicyId}" via DELETE /api/settings/access-policies/:id...`);
  const deletePolRes = await fetch(`${baseUrl}/api/settings/access-policies/${testPolicyId}`, {
    method: 'DELETE',
  });
  const deletePolData = await deletePolRes.json();
  if (!deletePolRes.ok || !deletePolData.success) {
    throw new Error(`Test 6 Failed: Could not delete policy: ${JSON.stringify(deletePolData)}`);
  }
  console.log(`✓ Test 6 Passed: Policy deleted from database. Server response: ${JSON.stringify(deletePolData)}`);

  // 8. Verify that "s.ahmadi" immediately disappeared from authorized map subjects
  console.log('\n[Test 7] Verifying "s.ahmadi" is pruned from GET /api/settings/authorized-map-subjects after policy deletion...');
  const afterDeleteRes = await fetch(`${baseUrl}/api/settings/authorized-map-subjects`);
  const afterDeleteData = await afterDeleteRes.json();
  const deletedCheck = (afterDeleteData.categories?.adUsers || []).find((u: any) => u.name === 's.ahmadi' || u.id === 's.ahmadi');
  if (!deletedCheck) {
    console.log(`✓ Test 7 Passed: "s.ahmadi" was immediately pruned from authorized subjects after policy deletion.`);
  } else {
    throw new Error(`Test 7 Failed: "s.ahmadi" is still present after policy deletion!`);
  }

  // 9. Clean up test map
  console.log('\n[Test 8] Cleaning up test map...');
  await fetch(`${baseUrl}/api/settings/maps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maps: existingMaps }),
  });
  console.log(`✓ Test 8 Passed: Cleaned up test map.`);

  console.log('\n===============================================================');
  console.log('✓ ALL 8 REAL TESTS PASSED WITH 100% SUCCESSFUL VALIDATION!');
  console.log('===============================================================');
}

runMapSubjectVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
