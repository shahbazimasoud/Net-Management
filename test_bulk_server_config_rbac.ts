import {
  isBulkServerConfigPermitted,
  getAccessPolicies,
} from './server/db';
import { generateToken } from './server/auth';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failCount++;
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('Empirical Test: Bulk Server Configuration RBAC & Endpoint Security');
  console.log('='.repeat(80));

  // Test 1: Evaluator with super-admin policy
  const superAdminPolicy = {
    id: 'policy-super-admin',
    name: 'Super Admin',
    priority: 100,
    canBulkConfigureServers: true,
  };
  assert(
    isBulkServerConfigPermitted(superAdminPolicy) === true,
    'Super Admin policy evaluates to true for isBulkServerConfigPermitted'
  );

  // Test 2: Evaluator with restricted policy (canBulkConfigureServers: false)
  const restrictedPolicy = {
    id: 'policy-restricted',
    name: 'Restricted User',
    priority: 10,
    canBulkConfigureServers: false,
  };
  assert(
    isBulkServerConfigPermitted(restrictedPolicy) === false,
    'Restricted policy (canBulkConfigureServers: false) evaluates to false'
  );

  // Test 3: Evaluator with policy where canBulkConfigureServers is true
  const customAllowedPolicy = {
    id: 'policy-custom-devops',
    name: 'DevOps Lead',
    priority: 50,
    canBulkConfigureServers: true,
  };
  assert(
    isBulkServerConfigPermitted(customAllowedPolicy) === true,
    'Custom policy with canBulkConfigureServers: true evaluates to true'
  );

  // Test 4: Evaluator with null or undefined policy
  assert(
    isBulkServerConfigPermitted(null) === false,
    'Null policy evaluates to false'
  );
  assert(
    isBulkServerConfigPermitted(undefined) === false,
    'Undefined policy evaluates to false'
  );

  // Test 5: End-to-end HTTP endpoint check against running server on port 3000
  console.log('\n--- Group B: Server-Side HTTP RBAC Guard on /api/bulk-server-config/* ---');
  try {
    const restrictedToken = generateToken({
      id: 'test-user-restricted',
      username: 'operator_noc',
      role: 'operator',
    });

    const resRestricted = await fetch('http://localhost:3000/api/bulk-server-config/templates', {
      headers: {
        Authorization: `Bearer ${restrictedToken}`,
      },
    });

    assert(
      resRestricted.status === 403,
      `Unprivileged user receives 403 Forbidden on /api/bulk-server-config/templates (got HTTP ${resRestricted.status})`
    );

    const restrictedBody = await resRestricted.json().catch(() => ({}));
    assert(
      restrictedBody.success === false && Boolean(restrictedBody.errorFa),
      'Unprivileged user receives structured bilingual 403 response with errorFa'
    );

    // Test POST /jobs endpoint with restricted user
    const resJobsRestricted = await fetch('http://localhost:3000/api/bulk-server-config/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${restrictedToken}`,
      },
      body: JSON.stringify({
        templateId: 'sys-ping',
        serverIds: ['srv-1'],
      }),
    });
    assert(
      resJobsRestricted.status === 403,
      `Unprivileged user receives 403 Forbidden on POST /api/bulk-server-config/jobs (got HTTP ${resJobsRestricted.status})`
    );

    // Test Super Admin token
    const adminToken = generateToken({
      id: 'admin',
      username: 'admin',
      role: 'superadmin',
    });

    const resAdmin = await fetch('http://localhost:3000/api/bulk-server-config/templates', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert(
      resAdmin.status === 200,
      `SuperAdmin receives 200 OK on /api/bulk-server-config/templates (got HTTP ${resAdmin.status})`
    );
    const adminBody = await resAdmin.json().catch(() => ({}));
    assert(
      adminBody.success === true && Array.isArray(adminBody.templates),
      'SuperAdmin successfully retrieves templates array'
    );
  } catch (err: any) {
    console.error('HTTP test error:', err.message);
    failCount++;
  }

  console.log('='.repeat(80));
  console.log(`Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('='.repeat(80));

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
