import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id = '11111111-1111-4111-8111-111111111111';
const request = { requestId: id, paymentId: id, amount: 100, reason: '테스트 환불' };
const payment = { id, order_id: id, provider: 'toss', provider_payment_key: 'test-payment', approved_amount: 1000, cancelled_amount: 0 };
const current = { paymentKey: 'test-payment', orderId: 'BAE-test', currency: 'KRW', totalAmount: 1000, balanceAmount: 1000, status: 'DONE', method: '카드', cancels: [] };
const cancellation = { cancelReason: `[EDU:${id}] 테스트 환불`, cancelAmount: 100, cancelStatus: 'DONE', transactionKey: 'test-cancel' };
function handler({ env = { TOSS_SECRET_KEY: 'test_sk_mock' }, claim = { isNew: true, status: 'processing', baseline_cancelled: 0 }, provider, finalizeError = null } = {}) {
  const calls = []; const finalizations = [];
  const db = {
    from(table) { return { select() { return this; }, eq() { return this; }, update() { return this; }, async single() { return { data: table === 'orders' ? { order_number: 'BAE-test' } : payment }; }, then(resolve) { resolve({}); } }; },
    async rpc(name, args) { if (name === 'edu_claim_refund') return { data: claim }; finalizations.push(args); return { error: finalizeError }; },
  };
  const source = fs.readFileSync(new URL('../lib/refunds.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', 'process', 'Buffer', compiled)(exports, name => name.endsWith('supabase/admin') ? { createAdminClient: () => db } : { uuid: value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value) }, async (url, options) => { calls.push({ url, ...options }); return provider(url, options); }, { env }, Buffer);
  return { run: body => exports.processRefund(id, body || request), calls, finalizations };
}
test('live refunds stay blocked without explicit server activation', async () => {
  const h = handler({ env: { TOSS_SECRET_KEY: 'live_sk_mock' }, provider: () => { throw Error('must not call'); } });
  assert.equal((await h.run()).status, 503); assert.equal(h.calls.length, 0);
});
test('refund validates integer amount and reason before provider work', async () => {
  const h = handler();
  for (const body of [{ ...request, amount: 0 }, { ...request, amount: 1.1 }, { ...request, reason: '' }]) assert.equal((await h.run(body)).status, 400);
  assert.equal(h.calls.length, 0);
});
test('partial refund verifies payment identity and commits provider transaction key', async () => {
  const h = handler({ provider: async (_, options) => Response.json(options.method === 'POST' ? { ...current, balanceAmount: 900, status: 'PARTIAL_CANCELED', cancels: [cancellation] } : current) });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.calls.filter(r => r.method === 'POST').length, 1);
  assert.equal(h.calls[1].headers['Idempotency-Key'], 'edu-refund-' + id);
  assert.equal(h.finalizations[0].p_cancel.transactionKey, 'test-cancel');
});
test('unresolved retry only queries; it never sends another cancellation', async () => {
  const h = handler({ claim: { isNew: false, status: 'processing' }, provider: async () => Response.json(current) });
  assert.equal((await h.run()).status, 409);
  assert.equal(h.calls.some(r => r.method === 'POST'), false);
});
test('provider success with DB failure stays unresolved for reconciliation', async () => {
  const h = handler({ finalizeError: { code: 'connection' }, provider: async (_, options) => Response.json(options.method === 'POST' ? { ...current, balanceAmount: 900, cancels: [cancellation] } : current) });
  assert.equal((await h.run()).status, 503);
  assert.equal(h.calls.filter(r => r.method === 'POST').length, 1);
});
test('reconciliation finds only this request and never re-posts a refund', async () => {
  const h = handler({ claim: { isNew: false, status: 'processing' }, provider: async () => Response.json({ ...current, balanceAmount: 900, cancels: [cancellation] }) });
  assert.equal((await h.run()).status, 200); assert.equal(h.calls.some(r => r.method === 'POST'), false);
});
test('already completed refund does not call the provider', async () => {
  const h = handler({ claim: { status: 'completed', isNew: false } });
  assert.equal((await h.run()).status, 200); assert.equal(h.calls.length, 0);
});
test('mismatched provider payment identity prevents cancellation', async () => {
  const h = handler({ provider: async () => Response.json({ ...current, paymentKey: 'another-payment' }) });
  assert.equal((await h.run()).status, 409); assert.equal(h.calls.some(r => r.method === 'POST'), false);
});
