import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, modules, env) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', output)(exports, name => modules[name], { env });
  return exports;
}

const runId = '33333333-3333-4333-8333-333333333333';
const caseId = '55555555-5555-4555-8555-555555555555';
const reviewId = '44444444-4444-4444-8444-444444444444';
const env = { EDU_CONVERSION_REVIEW_ENABLED: 'true', EDU_CONVERSION_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'private', NEXT_PUBLIC_APP_ENV: 'development' };
const run = { id: runId, case_id: caseId, input_version: 1, provider: 'jev', result: { mode: 'jev', decision_version: 1 }, input_snapshot: { subject: '당시 문의', content: '당시 원문' } };
const review = { id: reviewId, run_id: runId, calibration_sample_kind: 'operational', calibration: { purchase_intent: 'medium' } };
const result = { contract_version: 3, model: 'jev-test', decisions: {} };
const request = (origin = 'https://edu.example') => new Request('https://edu.example/api/conversion/jev-v3', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ v1_run_id: runId }),
});

function harness(options = {}) {
  const events = [];
  let stored = options.existing || null;
  const db = { from(table) {
    events.push(`read:${table}`);
    const query = {
      select() { return this; }, eq() { return this; }, not() { return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() {
        if (table === 'edu_conversion_runs') return { data: options.run === undefined ? run : options.run, error: null };
        if (table === 'edu_conversion_cases') return { data: { id: caseId, input_version: options.caseVersion || 1 }, error: null };
        if (table === 'edu_conversion_reviews') return { data: options.review === undefined ? review : options.review, error: null };
        if (table === 'edu_conversion_jev_v3_runs') return { data: stored, error: null };
        throw new Error(`Unexpected ${table}`);
      },
      insert(value) { events.push('reserve'); stored = { id: '66666666-6666-4666-8666-666666666666', ...value }; return { select: () => ({ single: async () => ({ data: stored, error: null }) }) }; },
      update(value) { events.push(`update:${value.status}`); stored = { ...stored, ...value }; return {
        eq() { return this; }, select() { return this; }, async maybeSingle() { return { data: { id: stored.id }, error: null }; },
      }; },
    };
    return query;
  } };
  const server = load('../lib/conversion-review-server.ts', { 'node:crypto': awaitlessCrypto() }, options.env || env);
  const handlers = load('../app/api/conversion/jev-v3/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/operator-permissions': { getOperatorUser: async () => options.user === undefined ? { id: '11111111-1111-4111-8111-111111111111' } : options.user },
    '@/lib/conversion-jev-v3': { createJevV3Judgment: async (...args) => { events.push('provider'); assert.deepEqual(args.slice(0, 2), ['당시 문의', '당시 원문']); if (options.providerFails) throw new Error('private upstream response'); return result; } },
    '@/lib/conversion-review-server': server,
  }, options.env || env);
  return { ...handlers, events };
}

function awaitlessCrypto() { return { createHash() { throw new Error('not used'); } }; }

test('v3 requires DEV, same origin, and operator before accessing inquiry data', async () => {
  for (const [options, origin] of [
    [{ env: { ...env, NEXT_PUBLIC_APP_ENV: 'production' } }, undefined],
    [{}, 'https://other.example'],
    [{ user: null }, undefined],
  ]) {
    const h = harness(options);
    assert.equal((await h.POST(request(origin))).status, 403);
    assert.deepEqual(h.events, []);
  }
});

test('v3 only sends the unchanged v1 snapshot with an operational first review and stores separately', async () => {
  const h = harness();
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(h.events.filter(event => !event.startsWith('read:')), ['reserve', 'provider', 'update:completed']);
  assert.equal((await response.json()).result.contract_version, 3);
  for (const options of [{ caseVersion: 2 }, { review: { ...review, calibration_sample_kind: 'test' } }]) {
    const invalid = harness(options);
    assert.equal((await invalid.POST(request())).status, 409);
    assert.equal(invalid.events.includes('provider'), false);
  }
});

test('completed v3 result is idempotently returned without a second provider call', async () => {
  const h = harness({ existing: { id: '66666666-6666-4666-8666-666666666666', status: 'completed', result } });
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).already_saved, true);
  assert.equal(h.events.includes('provider'), false);
});

test('provider failure leaves a retryable failed reservation without leaking upstream detail', async () => {
  const h = harness({ providerFails: true });
  const response = await h.POST(request());
  assert.equal(response.status, 503);
  assert.deepEqual(h.events.filter(event => !event.startsWith('read:')), ['reserve', 'provider', 'update:failed']);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private upstream/);
});
