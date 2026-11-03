import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, modules = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', output)(exports, name => modules[name]);
  return exports;
}

const cohort = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const buyer = '33333333-3333-4333-8333-333333333333';
const foreign = '44444444-4444-4444-8444-444444444444';

test('reservation verifies scope and is idempotent for the same operator request', async () => {
  const rows = [];
  const db = {
    from(table) {
      const filters = {};
      const query = {
        select: () => query, gt: () => query, neq: () => query,
        eq: (column, value) => { filters[column] = value; return query; },
        maybeSingle: async () => ({ data: table === 'cohorts' ? filters.id === cohort && { id: cohort } :
          rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) }),
        insert: async row => { rows.push(row); return {}; },
      };
      return query;
    },
  };
  let marketing = false;
  const route = load('../app/api/admin/purchase-onboarding/delivery/route.ts', {
    '@/lib/operator-permissions': { getOperatorUser: async () => ({ id, permissions: { orders: true, marketing } }) },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/purchase-onboarding': load('../lib/purchase-onboarding.ts'),
    '@/lib/purchase-buyer-delivery': load('../lib/purchase-buyer-delivery.ts'),
    '@/lib/purchase-buyer-delivery-server': {
      purchaseBuyers: async selectedCohort => { assert.equal(selectedCohort, cohort); return [{ id: buyer }]; },
      purchaseBuyerChannels: async () => ({ email: true }),
      purchaseBuyerTemplates: async () => [],
      reachableBuyers: (_, list) => list,
    },
  });
  const send = (recipients, origin = 'https://edu.test') => route.POST(new Request('https://edu.test/api/admin/purchase-onboarding/delivery', {
    method: 'POST', headers: { origin }, body: JSON.stringify({
      action: 'schedule', id, cohort, recipients, channel: 'email', subject: '공지', content: '배정 안내', scheduledAt: new Date(Date.now() + 600000).toISOString(),
    }),
  }));
  assert.equal((await send([buyer])).status, 403);
  marketing = true;
  assert.equal((await send([buyer], 'https://other.test')).status, 403);
  assert.equal((await send([buyer, foreign])).status, 409);
  assert.deepEqual(rows, []);
  assert.equal((await send([buyer])).status, 200);
  assert.equal((await send([buyer])).status, 200);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].recipient_ids, [buyer]);
});
