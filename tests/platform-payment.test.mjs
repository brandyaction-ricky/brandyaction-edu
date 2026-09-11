import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function paymentHandler({ user = { id: 'buyer' }, order, provider, finalized = [] }) {
  const source = fs.readFileSync(new URL('../app/api/platform/payment/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const query = { select() { return this; }, eq() { return this; }, async single() { return { data: order }; } };
  const db = { from: () => query, rpc: async (...args) => { finalized.push(args); return { error: null }; } };
  const exports = {};
  new Function('exports', 'require', 'fetch', 'process', 'Buffer', compiled)(exports, name => name.includes('server-auth') ? { getAuthenticatedUser: async () => user } : { createAdminClient: () => db }, provider, { env: { TOSS_SECRET_KEY: 'test-only' } }, Buffer);
  return exports.POST;
}
const request = (body = {}, origin = 'https://edu.example') => new Request('https://edu.example/api/platform/payment', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentKey: 'test-payment', orderId: 'BAE-1', amount: 1000, ...body }) });

test('payment confirmation requires an authenticated user and the same origin', async () => {
  assert.equal((await paymentHandler({ user: null })(request())).status, 401);
  assert.equal((await paymentHandler({})(request({}, 'https://other.example'))).status, 403);
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
test('a verified payment is finalized with the provider-approved values', async () => {
  const finalized = [];
  const providerData = { orderId: 'BAE-1', totalAmount: 1000, status: 'DONE', currency: 'KRW', paymentKey: 'verified', method: 'CARD', approvedAt: '2026-09-11T00:00:00Z' };
  const handler = paymentHandler({ order: { id: 'order', total_amount: 1000, status: 'pending' }, finalized, provider: async () => Response.json(providerData) });
  assert.equal((await handler(request())).status, 200);
  assert.equal(finalized[0][0], 'finalize_toss_payment');
  assert.equal(finalized[0][1].p_approved_amount, 1000);
  assert.equal(finalized[0][1].p_payment_key, 'verified');
});
