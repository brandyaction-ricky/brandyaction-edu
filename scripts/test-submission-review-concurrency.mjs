// Explicit opt-in integration QA against this disposable, network-isolated container only.
// No URL, password or external database parameter is accepted.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const container = 'edu-review-audit-88c6e7c7';
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(info.Config.Labels['edu-review-audit'], 'isolated-fixture');
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.deepEqual(info.HostConfig.PortBindings, {});
const database = `review_audit_fixture_${Date.now()}`;
const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At'];
const sql = (input, db = database) => execFileSync('docker', [...args, '-d', db], { input, encoding: 'utf8', timeout: 15000 });
sql(`create database ${database};`, 'postgres');
sql(readFileSync(new URL('../tests/fixtures/submission-review.sql', import.meta.url), 'utf8'));
sql(readFileSync(new URL('../supabase/migrations/20260925221921_submission_review_audit.sql', import.meta.url), 'utf8'));
const actor = '00000000-0000-4000-8000-000000000001', target = '00000000-0000-4000-8000-000000000010';
sql(`insert into mission_submissions(id) values('${target}');`);
const checks = JSON.stringify({ version: 1, answers_complete: true, evidence_consistent: false, criteria_met: true });
const command = feedback => `select review_mission_submissions_with_checks('${actor}',array['${target}']::uuid[],'approved','${feedback}','${checks}','single');`;
function connection(name) {
  const child = spawn('docker', [...args, '-d', database], { stdio: ['pipe', 'pipe', 'pipe'] });
  const state = { child, output: '', code: null };
  child.stdout.on('data', chunk => { state.output += chunk; }); child.stderr.on('data', chunk => { state.output += chunk; });
  state.closed = new Promise(resolve => child.once('close', code => { state.code = code; resolve(code); }));
  child.stdin.write(`set application_name='${name}'; set statement_timeout='10s';\n`);
  return state;
}
async function until(check) {
  const end = Date.now() + 10000;
  while (!check()) { if (Date.now() > end) throw Error('Timed out waiting for concurrent lock evidence'); await new Promise(resolve => setTimeout(resolve, 100)); }
}
const first = connection('review-first'), second = connection('review-second');
try {
  first.child.stdin.write(`begin; ${command('first-writer')} select 'LOCK_HELD';\n`);
  await until(() => first.output.includes('LOCK_HELD'));
  second.child.stdin.end(command('second-writer'));
  await until(() => sql("select count(*) from pg_stat_activity where application_name='review-second' and wait_event_type='Lock';").trim() === '1');
  first.child.stdin.end('commit;\n');
  assert.equal(await first.closed, 0);
  assert.notEqual(await second.closed, 0);
  assert.match(second.output, /PT409/);
  const result = sql("select status||'|'||reviewer_feedback||'|'||(select count(*) from audit_logs) from mission_submissions;").trim();
  assert.equal(result, 'approved|first-writer|1');
  assert.equal(sql("select after_data->'review_checks'->>'evidence_consistent' from audit_logs;").trim(), 'false');
  console.log('PASS: separate PostgreSQL connections waited on a real row lock; second writer received PT409; first result and exactly one audit survived.');
  console.log(`Synthetic QA database: ${database}; removed with the disposable container, never a remote DB.`);
} finally {
  first.child.stdin.end(); second.child.stdin.end();
  if (first.code === null) first.child.kill('SIGTERM');
  if (second.code === null) second.child.kill('SIGTERM');
}
