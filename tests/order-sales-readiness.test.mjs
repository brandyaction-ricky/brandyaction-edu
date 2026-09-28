import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(file, imports = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', compiled)(exports, name => imports[name] || {}, { env: { NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_synthetic' } });
  return exports;
}
const rules = compile('../lib/platform-rules.ts');
const course = { id: 'course', category: 'paid_class', status: 'published', description: 'Course details', duration_label: '6 weeks', schedule_label: 'Monday' };
const offer = { id: '11111111-1111-4111-8111-111111111111', course_id: course.id, price: 1650000, recruitment_end_at: '2099-10-01T00:00:00Z' };

function setup(patch = {}, orderError = null, options = {}) {
  const calls = [];
  const attribution = [];
  const attributionFilters = [];
  const db = {
    from(table) {
      // A curriculum query would fail: sales must not depend on teaching material availability.
      if (table === 'orders') return {
        update(values) { attribution.push(values); return this; },
        eq(key, value) { attributionFilters.push([key, value]); return this; },
        select() { return this; },
        async single() { return options.attributionError ? { error: { message: 'synthetic attribution failure' } } : { data: { id: 'order' } }; },
      };
      assert.equal(table, 'cohorts');
      return { select() { return this; }, eq() { return this; }, async single() { return { data: { ...offer, courses: { ...course, ...patch } } }; } };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'edu_checkout_with_coupon') return orderError ? { error: { message: orderError } } : { data: { orderId: 'order', totalAmount: options.free ? 0 : offer.price, ...(options.free ? { free: true } : {}) } };
      assert.fail('Unexpected RPC ' + name);
      return { data: { totalAmount: offer.price } };
    },
  };
  const { POST } = compile('../app/api/platform/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/server-auth': { getAuthenticatedUser: async () => ({ id: 'member', email: 'member@example.test' }) },
    '@/lib/platform-rules': rules,
    '@/lib/qa-rules': { phoneNumber: () => '01000000000' },
    '@/lib/legal-policies': { POLICY_VERSION: 'test-policy' },
  });
  return { calls, attribution, attributionFilters, send: (entrySource) => POST(new Request('https://edu.example/api/platform', { method: 'POST', headers: { origin: 'https://edu.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'order', cohortId: offer.id, agreed: true, name: 'Synthetic', phone: '01000000000', entrySource }) })) };
}

test('paid order reaches the existing checkout RPC without any curriculum query or publication mutation', async () => {
  const { calls, attribution, send } = setup();
  const response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).orderId, 'order');
  assert.deepEqual(calls.map(call => call.name), ['edu_checkout_with_coupon']);
  assert.equal(calls[0].args.p_user_id, 'member');
  assert.deepEqual(attribution, [{ entry_src: null }]);
});

test('checkout stores only the four agreed campaign sources on the order', async () => {
  for (const source of ['paid', 'organic', 'alumni', 'youtube', 'unknown']) {
    const { attribution, send } = setup();
    assert.equal((await send(source)).status, 200);
    assert.deepEqual(attribution, [{ entry_src: source === 'unknown' ? null : source }]);
  }
});

test('zero-total checkout records the source after atomic coupon finalization without a pending-status filter', async () => {
  const { calls, attribution, attributionFilters, send } = setup({}, null, { free: true });
  const response = await send('paid');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).free, true);
  assert.deepEqual(calls.map(call => call.name), ['edu_checkout_with_coupon']);
  assert.deepEqual(attribution, [{ entry_src: 'paid' }]);
  assert.deepEqual(attributionFilters, [['id', 'order'], ['user_id', 'member']]);
});

test('an attribution failure never reports a completed zero-total order as failed', async () => {
  const { send } = setup({}, null, { free: true, attributionError: true });
  const response = await send('paid');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entrySourceRecorded, false);
});

test('missing commercial details still block checkout before any order is created', async () => {
  for (const patch of [{ description: '' }, { duration_label: '' }, { schedule_label: '' }, { metadata: { detail_html: '무료 라이브 강의 https://open.kakao.com/o/test' } }]) {
    const { calls, send } = setup(patch);
    assert.equal((await send()).status, 409);
    assert.deepEqual(calls, []);
  }
});

test('closed recruitment and capacity checks remain delegated to the transactional checkout RPC', async () => {
  for (const error of ['RECRUIT_CLOSED', 'CAPACITY_EXCEEDED', 'ALREADY_ENROLLED']) {
    const { calls, send } = setup({}, error);
    assert.equal((await send()).status, 409);
    assert.deepEqual(calls.map(call => call.name), ['edu_checkout_with_coupon']);
  }
});
