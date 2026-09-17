import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';

const payment = {
  paymentKey: 'test-payment-key',
  orderId: 'BAE-test-order',
  status: 'DONE',
  currency: 'KRW',
  totalAmount: 1000,
  method: '카드',
  approvedAt: '2026-09-17T10:00:00+09:00',
  receipt: { url: 'https://example.test/receipt' },
};

function webhook({
  env = { TOSS_WEBHOOK_TOKEN: 'webhook-secret', TOSS_SECRET_KEY: 'test_sk_mock' },
  provider = async () => Response.json(payment),
  rpcError = null,
  recordError = null,
} = {}) {
  const providerCalls = [];
  const rpcCalls = [];
  const eventWrites = [];
  const db = {
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      return { error: rpcError };
    },
    from(table) {
      assert.equal(table, 'payment_events');
      return {
        async upsert(value, options) {
          eventWrites.push({ value, options });
          return { error: recordError };
        },
      };
    },
  };
  const source = fs.readFileSync(new URL('../app/api/payments/toss/webhook/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const require = name => {
    if (name === 'node:crypto') return { createHash, timingSafeEqual };
    if (name.endsWith('supabase/admin')) return { createAdminClient: () => db };
    throw new Error(`unexpected import: ${name}`);
  };
  const fetch = async (...args) => {
    providerCalls.push(args);
    return provider(...args);
  };
  new Function('exports', 'require', 'fetch', 'process', 'Buffer', 'AbortSignal', compiled)(
    exports,
    require,
    fetch,
    { env },
    Buffer,
    AbortSignal,
  );
  return { post: exports.POST, providerCalls, rpcCalls, eventWrites };
}

function request(body, {
  token = 'webhook-secret',
  contentType = 'application/json',
  transmissionId = 'transmission-1',
} = {}) {
  return new Request(`https://edu.example/api/payments/toss/webhook?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'tosspayments-webhook-transmission-id': transmissionId,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const paymentEvent = (data = payment) => ({
  eventType: 'PAYMENT_STATUS_CHANGED',
  createdAt: '2026-09-17T10:00:01+09:00',
  data,
});

test('webhook fails closed when its server token is missing or invalid', async () => {
  const missing = webhook({ env: { TOSS_SECRET_KEY: 'test_sk_mock' } });
  assert.equal((await missing.post(request(paymentEvent()))).status, 503);
  assert.equal(missing.providerCalls.length, 0);

  const invalid = webhook();
  assert.equal((await invalid.post(request(paymentEvent(), { token: 'wrong' }))).status, 401);
  assert.equal(invalid.providerCalls.length, 0);
});

test('unsupported events are acknowledged without provider or database work', async () => {
  const handler = webhook();
  const response = await handler.post(request({ eventType: 'METHOD_UPDATED', data: {} }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ignored: true });
  assert.equal(handler.providerCalls.length, 0);
  assert.equal(handler.rpcCalls.length, 0);
});

test('malformed content and missing provider configuration are rejected before database work', async () => {
  const malformed = webhook();
  assert.equal((await malformed.post(request('{', { contentType: 'application/json' }))).status, 400);
  assert.equal((await malformed.post(request('{}', { contentType: 'text/plain' }))).status, 415);

  const missingSecret = webhook({ env: { TOSS_WEBHOOK_TOKEN: 'webhook-secret' } });
  assert.equal((await missingSecret.post(request(paymentEvent()))).status, 503);
  assert.equal(missingSecret.rpcCalls.length, 0);
});

test('DONE event uses provider-authoritative values and records the transmission', async () => {
  const handler = webhook();
  const tampered = { ...payment, totalAmount: 1, orderId: 'body-value-is-not-trusted' };
  const response = await handler.post(request(paymentEvent(tampered)));
  assert.equal(response.status, 200);
  assert.equal(handler.providerCalls[0][0], 'https://api.tosspayments.com/v1/payments/test-payment-key');
  assert.match(handler.providerCalls[0][1].headers.Authorization, /^Basic /);
  assert.equal(handler.rpcCalls[0].name, 'finalize_toss_payment');
  assert.equal(handler.rpcCalls[0].args.p_order_number, payment.orderId);
  assert.equal(handler.rpcCalls[0].args.p_approved_amount, 1000);
  assert.equal(handler.eventWrites[0].value.provider_event_id, 'transmission-1');
  assert.equal(handler.eventWrites[0].value.processing_status, 'processed');
});

test('provider identity mismatch cannot mutate payment state', async () => {
  const handler = webhook({ provider: async () => Response.json({ ...payment, paymentKey: 'another-key' }) });
  assert.equal((await handler.post(request(paymentEvent()))).status, 409);
  assert.equal(handler.rpcCalls.length, 0);
  assert.equal(handler.eventWrites.length, 0);
});

test('DEPOSIT_CALLBACK queries by order and finalizes a verified deposit', async () => {
  const handler = webhook();
  const body = { createdAt: '2026-09-17T10:00:01+09:00', secret: 'provider-secret', status: 'DONE', transactionKey: 'tx-1', orderId: payment.orderId };
  assert.equal((await handler.post(request(body))).status, 200);
  assert.equal(handler.providerCalls[0][0], `https://api.tosspayments.com/v1/payments/orders/${payment.orderId}`);
  assert.equal(handler.rpcCalls[0].name, 'finalize_toss_payment');
});

test('waiting and terminal states use their dedicated idempotent RPCs', async () => {
  const waitingPayment = { ...payment, status: 'WAITING_FOR_DEPOSIT', approvedAt: null, method: '가상계좌', virtualAccount: { dueDate: '2026-09-18T10:00:00+09:00' } };
  const waiting = webhook({ provider: async () => Response.json(waitingPayment) });
  assert.equal((await waiting.post(request(paymentEvent(waitingPayment)))).status, 200);
  assert.equal(waiting.rpcCalls[0].name, 'record_toss_waiting_payment');
  assert.equal(waiting.rpcCalls[0].args.p_expires_at, waitingPayment.virtualAccount.dueDate);

  const expiredPayment = { ...payment, status: 'EXPIRED', approvedAt: null, method: null };
  const expired = webhook({ provider: async () => Response.json(expiredPayment) });
  assert.equal((await expired.post(request(paymentEvent(expiredPayment)))).status, 200);
  assert.equal(expired.rpcCalls[0].name, 'record_toss_terminal_payment');
  assert.equal(expired.rpcCalls[0].args.p_status, 'EXPIRED');
});

test('completed cancellations are reconciled by transaction key', async () => {
  const cancelled = {
    ...payment,
    status: 'PARTIAL_CANCELED',
    balanceAmount: 600,
    cancels: [
      { cancelAmount: 400, cancelReason: '관리자 환불', cancelStatus: 'DONE', transactionKey: 'cancel-tx-1' },
    ],
  };
  const handler = webhook({ provider: async () => Response.json(cancelled) });
  assert.equal((await handler.post(request(paymentEvent(cancelled)))).status, 200);
  assert.equal(handler.rpcCalls[0].name, 'finalize_toss_refund');
  assert.equal(handler.rpcCalls[0].args.p_refund_key, 'cancel-tx-1');
  assert.equal(handler.rpcCalls[0].args.p_amount, 400);
});

test('database failures request a retry and do not claim successful processing', async () => {
  const reconcileFailure = webhook({ rpcError: { code: 'database_unavailable' } });
  assert.equal((await reconcileFailure.post(request(paymentEvent()))).status, 503);
  assert.equal(reconcileFailure.eventWrites.length, 0);

  const recordFailure = webhook({ recordError: { code: 'database_unavailable' } });
  assert.equal((await recordFailure.post(request(paymentEvent()))).status, 503);
  assert.equal(recordFailure.rpcCalls.length, 1);
});

test('event body hash is used when Toss transmission id is absent', async () => {
  const handler = webhook();
  const body = paymentEvent();
  assert.equal((await handler.post(request(body, { transmissionId: '' }))).status, 200);
  const expected = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  assert.equal(handler.eventWrites[0].value.provider_event_id, expected);
});
