/**
 * Verification test for User & Admin Password Persistence (Phase 3)
 * Tests real authentication endpoints and database persistence without mocks.
 */

async function runVerification() {
  const baseUrl = 'http://localhost:3000';
  console.log('=== NetTopology User Password Persistence Real Verification ===\n');

  // 1. Initial Login with admin123
  console.log('[Test 1] Logging in with initial password "admin123"...');
  const login1Res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', authType: 'local' }),
  });
  const login1Data = await login1Res.json();
  if (!login1Res.ok || !login1Data.token) {
    throw new Error(`Test 1 Failed: Status ${login1Res.status}, body: ${JSON.stringify(login1Data)}`);
  }
  const token = login1Data.token;
  console.log(`✓ Test 1 Passed: Successfully authenticated. Status: ${login1Res.status}, User: ${login1Data.user.username}`);

  // 2. Change password to "SecretPass@9988"
  console.log('\n[Test 2] Updating admin password to "SecretPass@9988" via POST /api/settings/users...');
  const updateRes = await fetch(`${baseUrl}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      id: 'user-admin',
      username: 'admin',
      fullName: 'مدیر ارشد شبکه (Network Administrator)',
      email: 'admin@nettopology.internal',
      role: 'Super Administrator',
      status: 'active',
      password: 'SecretPass@9988',
    }),
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok || !updateData.success) {
    throw new Error(`Test 2 Failed: Status ${updateRes.status}, body: ${JSON.stringify(updateData)}`);
  }
  console.log(`✓ Test 2 Passed: User saved successfully. Response success: ${updateData.success}, username: ${updateData.user.username}`);

  // 3. Attempt login with OLD password "admin123" -> MUST FAIL (HTTP 401)
  console.log('\n[Test 3] Attempting login with OLD password "admin123" (Should be rejected)...');
  const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', authType: 'local' }),
  });
  const oldLoginData = await oldLoginRes.json();
  if (oldLoginRes.status === 401 && !oldLoginData.success) {
    console.log(`✓ Test 3 Passed: Old password rejected as expected. Status: ${oldLoginRes.status}, Message: "${oldLoginData.message}"`);
  } else {
    throw new Error(`Test 3 Failed: Old password was accepted! Status ${oldLoginRes.status}, body: ${JSON.stringify(oldLoginData)}`);
  }

  // 4. Attempt login with NEW password "SecretPass@9988" -> MUST SUCCEED (HTTP 200)
  console.log('\n[Test 4] Attempting login with NEW password "SecretPass@9988"...');
  const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'SecretPass@9988', authType: 'local' }),
  });
  const newLoginData = await newLoginRes.json();
  if (newLoginRes.ok && newLoginData.success && newLoginData.token) {
    console.log(`✓ Test 4 Passed: Authenticated with new password! Status: ${newLoginRes.status}, Token received.`);
  } else {
    throw new Error(`Test 4 Failed: New password rejected! Status ${newLoginRes.status}, body: ${JSON.stringify(newLoginData)}`);
  }
  const newToken = newLoginData.token;

  // 5. Update profile WITHOUT password (e.g. email or fullName change)
  console.log('\n[Test 5] Updating profile details WITHOUT providing a password...');
  const profileRes = await fetch(`${baseUrl}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newToken}`,
    },
    body: JSON.stringify({
      id: 'user-admin',
      username: 'admin',
      fullName: 'مدیر ارشد زیرساخت شبکه (Primary Superadmin)',
      email: 'admin@nettopology.internal',
      role: 'Super Administrator',
      status: 'active',
    }),
  });
  const profileData = await profileRes.json();
  if (!profileRes.ok || !profileData.success) {
    throw new Error(`Test 5 Failed: Status ${profileRes.status}, body: ${JSON.stringify(profileData)}`);
  }
  console.log(`✓ Test 5 Passed: Profile updated without password. fullName: "${profileData.user.fullName}"`);

  // 6. Verify NEW password "SecretPass@9988" is still valid and not erased by profile update
  console.log('\n[Test 6] Verifying password "SecretPass@9988" is still intact after profile update...');
  const recheckLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'SecretPass@9988', authType: 'local' }),
  });
  const recheckLoginData = await recheckLoginRes.json();
  if (recheckLoginRes.ok && recheckLoginData.success) {
    console.log(`✓ Test 6 Passed: New password is still active and preserved.`);
  } else {
    throw new Error(`Test 6 Failed: Password lost after profile update!`);
  }

  // 7. Reset password back to "admin123" and verify
  console.log('\n[Test 7] Resetting admin password back to initial "admin123" for clean state...');
  const resetRes = await fetch(`${baseUrl}/api/settings/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${newToken}`,
    },
    body: JSON.stringify({
      id: 'user-admin',
      username: 'admin',
      fullName: 'مدیر ارشد شبکه (Network Administrator)',
      email: 'admin@nettopology.internal',
      role: 'Super Administrator',
      status: 'active',
      password: 'admin123',
    }),
  });
  const resetData = await resetRes.json();
  if (!resetRes.ok || !resetData.success) {
    throw new Error(`Test 7 Failed: Status ${resetRes.status}`);
  }
  console.log(`✓ Test 7 Passed: Successfully reset admin password back to "admin123".`);

  // 8. Verify login with "admin123" works again
  console.log('\n[Test 8] Confirming login with "admin123" works after final reset...');
  const finalLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123', authType: 'local' }),
  });
  const finalLoginData = await finalLoginRes.json();
  if (finalLoginRes.ok && finalLoginData.success) {
    console.log(`✓ Test 8 Passed: Successfully logged in with restored password.`);
  } else {
    throw new Error(`Test 8 Failed: Final login failed.`);
  }

  console.log('\n===============================================================');
  console.log('✓ ALL 8 REAL TESTS PASSED WITH 100% SUCCESSFUL VALIDATION!');
  console.log('===============================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
