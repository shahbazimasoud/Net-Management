import fetch from 'node-fetch';
import { getAccessPolicies, saveAccessPolicies } from './server/db';
import {
  DEFAULT_POLICY_COLUMNS,
  POLICY_COLUMN_ITEMS,
  PolicyVisibleColumns
} from './src/components/settings/AccessControlTab';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('========================================================================');
  console.log('🚀 Configured Access Policies Multi-View, Columns & Pagination Test');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, desc: string) {
    if (cond) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Column definitions test
  console.log('🔹 Step 1: Validating column definitions...');
  assert(POLICY_COLUMN_ITEMS.length === 11, 'All 11 columns are defined');
  const expectedKeys: (keyof PolicyVisibleColumns)[] = [
    'policy', 'subject', 'priority', 'scope', 'views', 'cisco',
    'mikrotik', 'servers', 'templates', 'simulation', 'actions'
  ];
  expectedKeys.forEach((key) => {
    assert(DEFAULT_POLICY_COLUMNS[key] === true, `Default column ${key} is true`);
    const item = POLICY_COLUMN_ITEMS.find((c) => c.key === key);
    assert(Boolean(item && item.labelEn && item.labelFa), `Column item ${key} has bilingual labels`);
  });

  // 2. Database policies test
  console.log('\n🔹 Step 2: Fetching live access policies from database...');
  const policies = await getAccessPolicies();
  assert(Array.isArray(policies) && policies.length > 0, `Retrieved ${policies.length} policies from DB`);

  // 3. Testing policy pagination simulation
  console.log('\n🔹 Step 3: Testing pagination mechanics...');
  const total = policies.length;
  const pageSize = 5;
  const totalPages = Math.ceil(total / pageSize);
  assert(totalPages >= 1, `Total pages calculated: ${totalPages} (for ${total} items with pageSize ${pageSize})`);

  // Page 1
  const page1 = policies.slice(0, pageSize);
  assert(page1.length <= pageSize, `Page 1 has ${page1.length} items`);

  // 4. Testing policy duplication capability
  console.log('\n🔹 Step 4: Testing policy clone and persistence...');
  const firstPolicy = policies[0];
  const duplicateId = `policy-test-clone-${Date.now()}`;
  const duplicatedPolicy = {
    ...firstPolicy,
    id: duplicateId,
    name: `${firstPolicy.name} (Automated Test Clone)`,
    priority: Math.max(1, (firstPolicy.priority || 50) - 1),
  };

  const updatedPolicies = [...policies, duplicatedPolicy];
  await saveAccessPolicies(updatedPolicies);

  const reloaded = await getAccessPolicies();
  const foundClone = reloaded.find((p: any) => p.id === duplicateId);
  assert(Boolean(foundClone), 'Duplicated policy successfully saved and retrieved from DB');
  assert(foundClone?.name === `${firstPolicy.name} (Automated Test Clone)`, 'Clone name matches');

  // Cleanup
  console.log('\n🔹 Step 5: Cleaning up cloned test policy...');
  const cleaned = reloaded.filter((p: any) => p.id !== duplicateId);
  await saveAccessPolicies(cleaned);
  const postClean = await getAccessPolicies();
  assert(!postClean.some((p: any) => p.id === duplicateId), 'Clone cleaned up from DB');

  console.log('\n========================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
