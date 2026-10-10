import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { fixture, id, receipt } from './helpers/edu-tips-erasure.mjs';

const require = createRequire(import.meta.url);
function load(path, resolve = require) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, resolve);
  return exports;
}
const { monitorErasureDeadlines: monitor } = load('../lib/edu-tips-erasure-monitor.ts');
const env = {
  CRON_SECRET: 'synthetic-monitor-secret', NEXT_PUBLIC_APP_ENV: 'development',
  EDU_TIPS_ERASURE_MONITOR_ENABLED: 'true', EDU_TIPS_ERASURE_MONITOR_CONSUMERS: id(90),
};
const counts = {
  total_requests: 0, unpublished_requests: 0, no_receipt_requests: 0,
  pending_overdue_requests: 0, reported_late_requests: 0, breach_history_requests: 0,
  awaiting_ack_requests: 0, awaiting_global_verification_requests: 0, oldest_overdue_at: null,
};
function report(consumer = id(90), summary = {}, extra = {}) {
  return { consumer_id: consumer, environment: 'dev', checked_at: '2026-10-10T01:00:00Z',
    summary: { ...counts, ...summary }, items: [{ request_id: 'must-not-be-returned' }], truncated: false, ...extra };
}
async function call({ environment = env, method = 'GET', token = env.CRON_SECRET, query = '',
  rpc = async () => ({ data: report(), error: null }) } = {}) {
  const res = await monitor(new Request(`https://synthetic.invalid/api/cron/tips-erasure-deadlines${query}`, {
    method, headers: token === null ? {} : { authorization: `Bearer ${token}` },
  }), { env: environment, rpc });
  return { status: res.status, headers: res.headers, body: method === 'HEAD' ? null : await res.json() };
}
const noRpc = () => { assert.fail('must not touch the database'); };

test('cron authentication, disabled and incomplete configuration never claim a successful scan', async () => {
  for (const token of [null, '', 'wrong', 'synthetic-monitor-secreu']) {
    const r = await call({ token, rpc: noRpc }); assert.equal(r.status, 401); assert.equal(r.body.checked, false);
  }
  assert.equal((await call({ environment: { ...env, CRON_SECRET: '' }, rpc: noRpc })).status, 401);
  for (const enabled of [undefined, 'false', 'TRUE']) {
    const r = await call({ environment: { ...env, EDU_TIPS_ERASURE_MONITOR_ENABLED: enabled }, rpc: noRpc });
    assert.equal(r.status, 503); assert.deepEqual(r.body, { status: 'disabled', checked: false });
  }
  for (const consumers of ['', 'not-a-uuid', `${id(90)},`, `${id(90)},${id(90).toUpperCase()}`,
    Array.from({ length: 9 }, (_, i) => id(90 + i)).join(',')]) {
    const r = await call({ environment: { ...env, EDU_TIPS_ERASURE_MONITOR_CONSUMERS: consumers }, rpc: noRpc });
    assert.equal(r.status, 503); assert.equal(r.body.status, 'configuration_required');
  }
  assert.equal((await call({ environment: { ...env, NEXT_PUBLIC_APP_ENV: 'preview' }, rpc: noRpc })).status, 503);
  assert.equal((await call({ query: '?consumer=' + id(91), rpc: noRpc })).status, 400);
});

test('HEAD cannot invoke the observing RPC, including the actual Next route export', async () => {
  assert.equal((await call({ method: 'HEAD', rpc: noRpc })).status, 405);
  const route = load('../app/api/cron/tips-erasure-deadlines/route.ts', name =>
    name.endsWith('edu-tips-erasure-scheduled-monitor') ? { scheduledErasureMonitor: noRpc } : { createAdminClient: noRpc });
  const r = await route.HEAD(); assert.equal(r.status, 405); assert.equal(r.headers.get('allow'), 'GET');
});

test('full summary survives truncated details; output contains no identifiers or RPC error material', async () => {
  const r = await call({ rpc: async (name, args, signal) => {
    assert.equal(name, 'edu_tips_check_erasure_deadlines');
    assert.deepEqual(args, { p_consumer: id(90), p_limit: 1 }); assert(signal instanceof AbortSignal);
    return { data: report(id(90), { total_requests: 400, no_receipt_requests: 400, unpublished_requests: 400,
      pending_overdue_requests: 400, breach_history_requests: 400, oldest_overdue_at: '2026-01-06T00:00:00Z' },
    { truncated: true, payload: 'private receipt' }), error: null };
  } });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'overdue'); assert(r.body.checked);
  assert.equal(r.body.summary.pending_overdue_requests, 400); assert(r.body.signals.awaiting_receipt);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const output = JSON.stringify(r.body);
  for (const forbidden of [id(90), 'request_id', 'payload', 'private receipt', 'must-not-be-returned', 'items']) assert(!output.includes(forbidden));
});

test('no current overdue is not deletion clearance; receipt, ACK, global verification and historical breach stay distinct', async () => {
  const r = await call({ rpc: async () => ({ data: report(id(90), { total_requests: 4,
    no_receipt_requests: 1, awaiting_ack_requests: 1, awaiting_global_verification_requests: 2,
    reported_late_requests: 1, breach_history_requests: 2 }), error: null }) });
  assert.equal(r.body.status, 'no_overdue');
  assert.deepEqual(r.body.signals, { awaiting_receipt: true, awaiting_ack: true, awaiting_global_verification: true, historical_breach: true });
  assert(!('completed' in r.body)); assert(!('healthy' in r.body));
});

test('all configured consumers are counted as consumer-request pairs, not unique people', async () => {
  const r = await call({ environment: { ...env, EDU_TIPS_ERASURE_MONITOR_CONSUMERS: `${id(90)}, ${id(92)}` },
    rpc: async (_, { p_consumer }) => ({ error: null, data: report(p_consumer, { total_requests: 4,
      pending_overdue_requests: 2, breach_history_requests: 2,
      oldest_overdue_at: p_consumer === id(90) ? '2026-01-06T00:00:00Z' : '2026-01-05T00:00:00Z' }) }) });
  assert.equal(r.body.checked_consumers, 2); assert.equal(r.body.summary.total_requests, 8);
  assert.equal(r.body.summary.pending_overdue_requests, 4);
  assert.equal(r.body.summary.oldest_overdue_at, '2026-01-05T00:00:00Z');
  assert.equal(r.body.count_unit, 'consumer_request_pairs');
});

test('partial error, wrong environment/consumer and malformed reports fail closed without partial totals', async () => {
  const corrupt = [null, {}, report(id(91)), report(id(90), {}, { environment: 'production' }),
    report(id(90), {}, { checked_at: 'invalid' }), report(id(90), { total_requests: '0' }),
    report(id(90), { total_requests: -1 }), report(id(90), { total_requests: Number.MAX_SAFE_INTEGER + 1 }),
    report(id(90), { no_receipt_requests: 1 }), report(id(90), { oldest_overdue_at: '2026-01-01T00:00:00Z' }),
    report(id(90), { total_requests: 1, pending_overdue_requests: 1, breach_history_requests: 1 }),
    report(id(90), { total_requests: 1, pending_overdue_requests: 1, breach_history_requests: 1, oldest_overdue_at: '2099-01-01T00:00:00Z' })];
  for (const data of corrupt) {
    const r = await call({ rpc: async () => ({ data, error: null }) });
    assert.equal(r.status, 503); assert.deepEqual(r.body, { status: 'check_unavailable', checked: false });
  }
  for (const throws of [false, true]) {
    const r = await call({ environment: { ...env, EDU_TIPS_ERASURE_MONITOR_CONSUMERS: `${id(90)},${id(92)}` }, rpc: async (_, args) => {
      if (args.p_consumer === id(90)) return { data: report(), error: null };
      if (throws) throw new Error('private database detail');
      return { data: report(id(92)), error: { message: 'private database detail' } };
    } });
    assert.equal(r.status, 503); assert.deepEqual(r.body, { status: 'check_unavailable', checked: false });
  }
});

test('a stalled RPC is bounded and aborts rather than returning zero overdue', async () => {
  let signal;
  const r = await call({ rpc: async (_, __, s) => { signal = s; return new Promise(() => {}); } });
  assert.equal(r.status, 503); assert.equal(r.body.checked, false); assert(signal.aborted);
});

test('actual SQL detects unpublished no-receipt deadlines; later evidence and ACK preserve audit and verification wait', async t => {
  const f = await fixture(t, ['20261010055310_edu_tips_erasure_deadline_report_v2.sql']);
  const rpc = async (_, args) => ({ error: null, data: await f.value('select edu_tips_check_erasure_deadlines($1,$2) as v', [args.p_consumer, args.p_limit]) });
  await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06',model_due_at='2026-01-31',residual_due_at='2026-01-31'");
  const first = await call({ rpc }); assert.equal(first.body.summary.pending_overdue_requests, 4);
  assert.equal(first.body.summary.unpublished_requests, 4); assert.equal(first.body.summary.no_receipt_requests, 4);
  await f.publish(); const deliveries = await f.deliveries();
  for (let i = 0; i < deliveries.length; i++) await f.accept(receipt(deliveries[i], 100 + i));
  const reported = await call({ rpc }); assert.equal(reported.body.status, 'no_overdue');
  assert.equal(reported.body.summary.awaiting_ack_requests, 4); assert.equal(reported.body.summary.breach_history_requests, 4);
  await f.ack(deliveries.at(-1).delivery_id);
  const acked = await call({ rpc }); assert.equal(acked.body.summary.awaiting_ack_requests, 0);
  assert.equal(acked.body.summary.awaiting_global_verification_requests, 4);
  assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_deadline_breaches'), 12);
  assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'), 0);
});
