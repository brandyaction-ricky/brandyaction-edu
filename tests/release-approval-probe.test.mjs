import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/release-coordinator.yml', import.meta.url), 'utf8');
const source = workflow.split("          python3 - <<'PY'\n")[1]?.split('          PY\n')[0]?.split('\n').map(line => line.slice(10)).join('\n');
assert.ok(source, 'The exact shipped workflow program must be tested');
const run = (env = {}) => spawnSync('python3', ['-c', source], {
  encoding: 'utf8', timeout: 5000,
  env: {...process.env, PROBE_ID: 'approval-test', HOLD_SECONDS: '1', GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '123', GITHUB_SHA: 'a'.repeat(40), ...env},
});

test('valid verification emits a bounded receipt with no operational effects', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(rows.map(r => r.event), ['environment-entered', 'verification-completed']);
  for (const row of rows) {
    assert.equal(row.productionWrites, 0);
    assert.equal(row.sqlStatements, 0);
    assert.equal(row.verificationOnly, true);
    assert.equal(row.runId, '123');
  }
  assert.ok(rows[1].at >= rows[0].at + 0.9);
});

test('invalid, oversized, and shell-like identifiers fail before entering the gate', () => {
  const sentinel = fileURLToPath(new URL('./.approval-probe-injection', import.meta.url));
  for (const probe of ['', 'a'.repeat(81), '../request', `$(touch ${sentinel})`, 'x\ny', 'a;exit 0']) {
    const result = run({PROBE_ID: probe});
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
  assert.equal(existsSync(sentinel), false);
});

test('non-main references and unbounded waits fail closed', () => {
  for (const hold of ['0', '-1', '91', '1e3', '1; echo bad', '']) {
    const result = run({HOLD_SECONDS: hold});
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  }
  const result = run({GITHUB_REF: 'refs/heads/develop'});
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});

test('verification workflow cannot become a credential-bearing production executor', () => {
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /environment: production-release-review/);
  assert.match(workflow, /group: brandyaction-shared-production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  const executableLines = workflow.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(executableLines, /pull_request|push:|uses:|secrets\.|self-hosted|run-request\.mjs|sudo|curl|fetch\(/);
  assert.equal((workflow.match(/^        run:/gm) || []).length, 1);
});
