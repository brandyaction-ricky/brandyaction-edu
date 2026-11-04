import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

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
const more = Array.from({ length: 104 }, (_, i) => '55555555-5555-4555-8555-' + String(i).padStart(12, '0'));
const foreign = '44444444-4444-4444-8444-444444444444';

test('buyer history is scoped to its cohort and preserves earlier accepted SMS alongside an active LMS reservation', async () => {
  const requests = [];
  const db = createClient('https://supabase.test', 'fixture-key', { global: { fetch: async (input, options) => {
    assert.equal(options.method, 'GET');
    const url = new URL(input);
    const table = url.pathname.split('/').at(-1);
    requests.push(table);
    if (table === 'edu_purchase_delivery_batches') {
      assert.equal(url.searchParams.get('cohort_id'), `eq.${cohort}`);
      assert.equal(url.searchParams.get('status'), 'in.(scheduled,sending)');
      return Response.json([{ id, channel: 'lms', recipient_ids: [buyer, more[0]] }]);
    }
    assert.equal(table, 'crm_message_logs');
    assert.equal(url.searchParams.get('edu_purchase_delivery_batches.cohort_id'), `eq.${cohort}`);
    assert.match(url.searchParams.get('select'), /edu_purchase_delivery_batches!inner\(cohort_id\)/);
    assert.equal(url.searchParams.get('status'), 'in.(accepted,processing,unknown)');
    return Response.json([
      { id, member_id: buyer, channel: 'sms', status: 'accepted' },
      { id: foreign, member_id: buyer, channel: 'email', status: 'unknown' },
    ]);
  } } });
  const { purchaseBuyerHistory } = load('../lib/purchase-buyer-delivery-server.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/purchase-buyer-delivery': load('../lib/purchase-buyer-delivery.ts'),
  });
  const result = await purchaseBuyerHistory(cohort);
  assert.deepEqual(result.get(buyer), { sms: { accepted: true, pending: true }, email: { uncertain: true } });
  assert.deepEqual(result.get(more[0]), { sms: { pending: true } });
  assert.deepEqual(requests.sort(), ['crm_message_logs', 'edu_purchase_delivery_batches']);
});

test('reservation verifies scope and is idempotent for the same operator request', async () => {
  const rows = [];
  const db = {
    from(table) {
      const filters = {};
      let update;
      const query = {
        select: () => query, gt: () => query, neq: () => query,
        update: values => { update = values; return query; },
        or: condition => { assert.equal(condition, `id.eq.${foreign},reservation_id.eq.${foreign}`); return query; },
        eq: (column, value) => { filters[column] = value; return query; },
        maybeSingle: async () => ({ data: table === 'cohorts' ? filters.id === cohort && { id: cohort } :
          rows.find(row => Object.entries(filters).every(([key, value]) => row[key] === value)) }),
        insert: async batches => { rows.push(...batches.map(batch => ({ status: 'scheduled', ...batch }))); return {}; },
        then(resolve) {
          const matching = rows.filter(row => (row.id === foreign || row.reservation_id === foreign) &&
            Object.entries(filters).every(([key, value]) => row[key] === value));
          matching.forEach(row => Object.assign(row, update));
          return Promise.resolve({ data: matching }).then(resolve);
        },
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
      purchaseBuyers: async selectedCohort => { assert.equal(selectedCohort, cohort); return [buyer, ...more].map(id => ({ id })); },
      purchaseBuyerChannels: async () => ({ email: true, sms: true, lms: true, alimtalk: true }),
      purchaseBuyerTemplates: async () => [],
      reachableBuyers: (_, list) => list,
    },
  });
  const send = (recipients, origin = 'https://edu.test', overrides = {}) => route.POST(new Request('https://edu.test/api/admin/purchase-onboarding/delivery', {
    method: 'POST', headers: { origin }, body: JSON.stringify({
      action: 'schedule', id, cohort, recipients, channel: 'email', subject: '공지', content: '배정 안내', scheduledAt: new Date(Date.now() + 600000).toISOString(), ...overrides,
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
  const text = '공부방 입장 https://t.me/+sample';
  const sms = { id: foreign, channel: 'sms', subject: undefined, content: text };
  assert.equal((await send(more, undefined, { ...sms, content: '가'.repeat(46) })).status, 400);
  assert.equal((await send(more, undefined, { ...sms, content: '공지 🚀' })).status, 400);
  assert.equal((await send(more, undefined, { ...sms, channel: 'alimtalk' })).status, 409);
  assert.equal((await send(more, undefined, sms)).status, 200);
  assert.equal((await send(more, undefined, sms)).status, 200);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(1).map(row => row.recipient_ids.length), [100, 4]);
  assert.deepEqual(rows.slice(1).flatMap(row => row.recipient_ids), more);
  assert.ok(rows.slice(1).every(row => row.reservation_id === foreign && row.template_id === null && row.content === text));
  rows[1].status = 'sending';
  const cancel = () => send([], undefined, { action: 'cancel', id: foreign });
  assert.equal((await cancel()).status, 200);
  assert.deepEqual(rows.map(row => row.status), ['scheduled', 'sending', 'cancelled']);
  assert.equal((await cancel()).status, 409);
});
