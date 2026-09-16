import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function paymentHandler({ user = { id: 'buyer' }, order, provider, finalized = [], updates = [], rpcError = null }) {
  const source = fs.readFileSync(new URL('../app/api/platform/payment/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const query = {
    select() { return this; },
    update(value) { updates.push(value); return this; },
    eq() { return this; },
    async single() { return { data: order }; },
    then(resolve) { resolve({ data: null, error: null }); },
  };
  const db = { from: () => query, rpc: async (...args) => { finalized.push(args); return { error: rpcError }; } };
  const exports = {};
  new Function('exports', 'require', 'fetch', 'process', 'Buffer', compiled)(exports, name => name.includes('server-auth') ? { getAuthenticatedUser: async () => user } : { createAdminClient: () => db }, provider, { env: { TOSS_SECRET_KEY: 'test-only' } }, Buffer);
  return exports.POST;
}
const request = (body = {}, origin = 'https://edu.example') => new Request('https://edu.example/api/platform/payment', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentKey: 'test-payment', orderId: 'BAE-1', amount: 1000, ...body }) });

test('payment confirmation requires an authenticated user and the same origin', async () => {
  assert.equal((await paymentHandler({ user: null })(request())).status, 401);
  assert.equal((await paymentHandler({})(request({}, 'https://other.example'))).status, 403);
});
test('empty payment identity and zero amount are rejected', async () => {
  assert.equal((await paymentHandler({})(request({ paymentKey: '  ' }))).status, 400);
  assert.equal((await paymentHandler({})(request({ orderId: '  ' }))).status, 400);
  assert.equal((await paymentHandler({})(request({ amount: 0 }))).status, 400);
});
test('tampering with the amount never reaches the payment provider', async () => {
  let called = false;
  const handler = paymentHandler({ order: { id: 'order', total_amount: 1000, status: 'pending' }, provider: async () => { called = true; } });
  assert.equal((await handler(request({ amount: 1 }))).status, 409);
  assert.equal(called, false);
});
test('a completed order is idempotent and does not charge again', async () => {
  const handler = paymentHandler({ order: { id: 'order', total_amount: 1000, status: 'paid' }, provider: () => { throw Error('must not call provider'); } });
  assert.equal((await handler(request())).status, 200);
});
test('mismatched provider receipts cannot grant an enrollment', async () => {
  const finalized = [];
  const handler = paymentHandler({ order: { id: 'order', total_amount: 1000, status: 'pending' }, finalized, provider: async () => Response.json({ orderId: 'ANOTHER-ORDER', totalAmount: 1000, status: 'DONE', currency: 'KRW' }) });
  assert.equal((await handler(request())).status, 409);
  assert.equal(finalized.length, 0);
});
test('provider status, currency, amount and payment key must all match', async () => {
  const order = { id: 'order', total_amount: 1000, status: 'pending' };
  for (const changed of [
    { paymentKey: 'another-payment' },
    { totalAmount: 999 },
    { status: 'IN_PROGRESS' },
    { currency: 'USD' },
  ]) {
    const finalized = [];
    const receipt = { orderId: 'BAE-1', totalAmount: 1000, status: 'DONE', currency: 'KRW', paymentKey: 'test-payment', ...changed };
    const response = await paymentHandler({ order, finalized, provider: async () => Response.json(receipt) })(request());
    assert.equal(response.status, 409);
    assert.equal(finalized.length, 0);
  }
});
test('a confirmed provider failure marks the pending order failed so its coupon can be released', async () => {
  const updates = [];
  const handler = paymentHandler({
    order: { id: 'order', total_amount: 1000, status: 'pending' },
    updates,
    provider: async () => Response.json({ code: 'REJECT_CARD_COMPANY' }, { status: 400 }),
  });
  assert.equal((await handler(request())).status, 409);
  assert.deepEqual(updates, [{ status: 'payment_failed' }]);
});
test('an already processed payment is fetched and finalized without a second approval', async () => {
  const finalized = [];
  const requests = [];
  const providerData = { orderId: 'BAE-1', totalAmount: 1000, status: 'DONE', currency: 'KRW', paymentKey: 'test-payment', method: 'CARD', approvedAt: '2026-09-11T00:00:00Z' };
  const handler = paymentHandler({
    order: { id: 'order', total_amount: 1000, status: 'payment_failed' },
    finalized,
    provider: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? Response.json({ code: 'ALREADY_PROCESSED_PAYMENT' }, { status: 409 })
        : Response.json(providerData);
    },
  });
  assert.equal((await handler(request())).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers['Idempotency-Key'], 'edu-confirm-order');
  assert.equal(finalized.length, 1);
});
test('a verified payment is finalized with the provider-approved values', async () => {
  const finalized = [];
  const providerData = { orderId: 'BAE-1', totalAmount: 1000, status: 'DONE', currency: 'KRW', paymentKey: 'test-payment', method: 'CARD', approvedAt: '2026-09-11T00:00:00Z' };
  const handler = paymentHandler({ order: { id: 'order', total_amount: 1000, status: 'pending' }, finalized, provider: async () => Response.json(providerData) });
  assert.equal((await handler(request())).status, 200);
  assert.equal(finalized[0][0], 'finalize_toss_payment');
  assert.equal(finalized[0][1].p_approved_amount, 1000);
  assert.equal(finalized[0][1].p_payment_key, 'test-payment');
});
test('a database finalization failure is retryable and does not expose provider data', async () => {
  const handler = paymentHandler({
    order: { id: 'order', total_amount: 1000, status: 'pending' },
    rpcError: { code: 'P0001' },
    provider: async () => Response.json({ orderId: 'BAE-1', totalAmount: 1000, status: 'DONE', currency: 'KRW', paymentKey: 'test-payment', method: 'CARD', approvedAt: '2026-09-11T00:00:00Z' }),
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: '결제 승인 후 수강권 확인 중입니다. 새로고침해 다시 확인해 주세요.' });
});
