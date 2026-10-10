import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { fixture } from './helpers/edu-tips-erasure.mjs';

const require = createRequire(import.meta.url);
const load = (path, resolve = require) => {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, resolve);
  return exports;
};
const { classifyErasureMonitorStatus: classify } = load('../lib/edu-tips-erasure-monitor-status.ts');
const scheduled = load('../lib/edu-tips-erasure-scheduled-monitor.ts', name =>
  name.endsWith('edu-tips-erasure-monitor') ? { monitorErasureDeadlines: async () => Response.json({ status: 'overdue', checked: true,
    checked_consumers: 1, summary: { pending_overdue_requests: 2, oldest_overdue_at: '2026-10-09T00:00:00Z' } }) } : require(name)).scheduledErasureMonitor;

test('scheduled scan persists a summary but fails closed if heartbeat is unavailable', async () => {
  let captured;
  const request = new Request('https://synthetic.invalid/api/cron/tips-erasure-deadlines');
  const env = { NEXT_PUBLIC_APP_ENV: 'development' };
  const ok = await scheduled(request, { env, rpc: async (name, args) => {
    captured = { name, args }; return { data: { status: 'overdue', recorded_at: '2026-10-10T10:00:00Z' }, error: null };
  } });
  assert.equal(ok.status, 200);
  assert.equal(captured.name, 'edu_tips_record_erasure_monitor_run');
  assert.deepEqual(captured.args, { p_environment: 'dev', p_status: 'overdue', p_checked_consumers: 1,
    p_pending_overdue_requests: 2, p_oldest_overdue_at: '2026-10-09T00:00:00Z' });
  const failed = await scheduled(request, { env, rpc: async () => ({ error: { message: 'private SQL error' } }) });
  assert.equal(failed.status, 503);
  assert(!JSON.stringify(await failed.json()).includes('private SQL error'));
  const ambiguous = await scheduled(request, { env, rpc: async () => ({ data: null, error: null }) });
  assert.equal(ambiguous.status, 503);
});

test('missing runs, expired run, failure and overdue are distinct operator states', () => {
  const now = Date.parse('2026-10-10T10:00:00Z');
  const base = { last_attempt_at: null, last_success_at: null, last_status: null,
    checked_consumers: null, pending_overdue_requests: null, oldest_overdue_at: null };
  assert.equal(classify(base, now).state, 'not_started');
  const recent = { ...base, last_attempt_at: '2026-10-10T09:00:00Z', last_success_at: '2026-10-10T09:00:00Z',
    last_status: 'no_overdue', checked_consumers: 1, pending_overdue_requests: 0 };
  assert.equal(classify(recent, now).state, 'ok');
  assert.equal(classify({ ...recent, last_attempt_at: '2026-10-10T08:29:59Z' }, now).state, 'stale');
  assert.equal(classify({ ...recent, last_attempt_at: '2026-10-10T10:06:00Z' }, now).state, 'stale');
  assert.equal(classify({ ...recent, last_status: 'check_unavailable' }, now).state, 'check_failed');
  assert.equal(classify({ ...recent, last_status: 'overdue', pending_overdue_requests: 2 }, now).state, 'overdue');
  assert.throws(() => classify({ ...recent, pending_overdue_requests: '0' }, now));
});

test('heartbeat SQL is service-only, environment-scoped, append-only and never stores subjects', async t => {
  const f = await fixture(t, ['20261010055310_edu_tips_erasure_deadline_report_v2.sql',
    '20261010121624_edu_tips_erasure_monitor_runs.sql']);
  const record = (environment, status, count, pending, due = null) => f.value(
    'select edu_tips_record_erasure_monitor_run($1,$2,$3,$4,$5) as v', [environment, status, count, pending, due]);
  const read = env => f.value('select edu_tips_read_erasure_monitor_status($1) as v', [env]);
  assert.equal((await read('dev')).last_attempt_at, null);
  await record('dev', 'no_overdue', 1, 0);
  await record('production', 'overdue', 1, 2, '2026-10-09T00:00:00Z');
  await record('dev', 'check_unavailable', 0, 0);
  assert.equal((await read('dev')).last_status, 'check_unavailable');
  assert.equal((await read('dev')).pending_overdue_requests, 0);
  assert.equal((await read('production')).pending_overdue_requests, 2);
  assert.equal((await read('dev')).last_success_at !== null, true);
  await assert.rejects(record('dev', 'no_overdue', 0, 0));
  await assert.rejects(record('dev', 'overdue', 1, 0));
  await assert.rejects(f.db.exec('delete from edu_tips_private.erasure_monitor_runs'), /permission denied/);
  await assert.rejects(f.db.exec("update edu_tips_private.erasure_monitor_runs set status='no_overdue'"), /permission denied/);
  for (const role of ['anon', 'authenticated']) {
    await f.db.exec('reset role;set role ' + role);
    await assert.rejects(read('dev'), /permission denied/);
    await assert.rejects(record('dev', 'no_overdue', 1, 0), /permission denied/);
  }
});
