import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

function load(path, modules = {}, env = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', output)(exports, name => {
    if (!modules[name]) throw new Error(`Unexpected dependency ${name}`);
    return modules[name];
  }, { env });
  return exports;
}

const server = load('../lib/conversion-review-server.ts', { 'node:crypto': { createHash } });
const actor = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const reviewId = '44444444-4444-4444-8444-444444444444';
const caseId = '55555555-5555-4555-8555-555555555555';
const env = { EDU_CONVERSION_REVIEW_ENABLED: 'true', EDU_CONVERSION_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'test-key', NEXT_PUBLIC_APP_ENV: 'development' };
const payload = { requestId, run_id: runId, calibration_review_id: reviewId, dimension: 'purchase_readiness',
  assessment: 'both_plausible', basis: 'interpretation', rationale: '구체적인 결제 행동이 확인되지 않아 두 해석 모두 가능합니다.' };
const run = { id: runId, case_id: caseId, input_version: 1, provider: 'jev', result: { mode: 'jev', decisions: {
  purchase_intent: { choice: 'medium' }, primary_barrier: { choice: 'price' }, purchase_readiness: { score: 3.0 }, next_action: { choice: 'answer_specific_questions' },
} } };
const review = { id: reviewId, case_id: caseId, run_id: runId, calibration_sample_kind: 'operational', calibration: {
  purchase_intent: 'medium', primary_barrier: 'price', purchase_readiness: 2, next_action: 'answer_specific_questions',
} };

const request = (body = payload, origin = 'https://edu.example') => new Request('https://edu.example/api/conversion/adjudication', {
  method: 'POST', headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function harness(options = {}) {
  const reads = [], writes = [];
  const db = { from(table) {
    reads.push(table);
    const filters = {};
    return {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      not() { return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() {
        if (table === 'edu_conversion_runs') return { data: options.run === undefined ? run : options.run, error: null };
        if (table === 'edu_conversion_cases') return { data: options.case === undefined ? { id: caseId, input_version: 1 } : options.case, error: null };
        if (table === 'edu_conversion_reviews') return { data: filters.id ? (options.review === undefined ? review : options.review) : { id: options.firstReviewId || reviewId }, error: null };
        if (table === 'edu_conversion_adjudication_notes') return { data: options.previous || null, error: null };
        throw new Error(`Unexpected table ${table}`);
      },
      insert(value) {
        writes.push({ table, value });
        return { select: () => ({ single: async () => options.insertError ? { data: null, error: options.insertError } : {
          data: { id: '66666666-6666-4666-8666-666666666666', ...value, created_at: '2026-09-23T00:00:00Z' }, error: null,
        } }) };
      },
    };
  } };
  const handlers = load('../app/api/conversion/adjudication/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'members'); return options.user === undefined ? { id: actor } : options.user; } },
    '@/lib/conversion-review-server': server,
  }, options.env || env);
  return { ...handlers, reads, writes };
}

test('adjudication intent is validated and excludes direct identifiers', () => {
  const a = server.conversionAdjudicationPayload(payload);
  assert.equal(a.payload.dimension, 'purchase_readiness');
  assert.equal(a.payloadHash, server.conversionAdjudicationPayload({ ...payload }).payloadHash);
  for (const invalid of [
    { ...payload, dimension: 'made_up' },
    { ...payload, assessment: 'correct' },
    { ...payload, rationale: '짧음' },
    { ...payload, rationale: '010-1234-5678로 연락받은 뒤 판단하겠습니다.' },
    { ...payload, rationale: 'https://example.com/customer 링크를 검토했습니다.' },
  ]) assert.throws(() => server.conversionAdjudicationPayload(invalid));
});

test('adjudication is disabled outside DEV and requires same origin and operator access', async () => {
  const production = harness({ env: { ...env, NEXT_PUBLIC_APP_ENV: 'production' } });
  assert.equal((await production.POST(request())).status, 403);
  assert.deepEqual(production.reads, []);
  const foreign = harness();
  assert.equal((await foreign.POST(request(payload, 'https://other.example'))).status, 403);
  assert.deepEqual(foreign.reads, []);
  const anonymous = harness({ user: null });
  assert.equal((await anonymous.POST(request())).status, 403);
  assert.deepEqual(anonymous.reads, []);
});

test('separate note is saved without changing the first calibration or sending a message', async () => {
  const h = harness();
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(h.writes.map(item => item.table), ['edu_conversion_adjudication_notes']);
  assert.equal(h.writes[0].value.calibration_review_id, reviewId);
  assert.equal(h.writes[0].value.actor_id, actor);
  assert.equal(h.writes[0].value.payload_hash.length, 64);
  assert.equal((await response.json()).note.assessment, 'both_plausible');
});

test('same choices cannot claim one side is better and stale or wrong review is refused', async () => {
  const same = harness();
  assert.equal((await same.POST(request({ ...payload, dimension: 'purchase_intent', assessment: 'jev_better_supported' }))).status, 400);
  assert.deepEqual(same.writes, []);
  const stale = harness({ case: { id: caseId, input_version: 2 } });
  assert.equal((await stale.POST(request())).status, 409);
  assert.deepEqual(stale.writes, []);
  const replaced = harness({ firstReviewId: '77777777-7777-4777-8777-777777777777' });
  assert.equal((await replaced.POST(request())).status, 409);
  assert.deepEqual(replaced.writes, []);
});

test('idempotent retry returns only the same saved intent', async () => {
  const hash = server.conversionAdjudicationPayload(payload).payloadHash;
  const previous = { id: '66666666-6666-4666-8666-666666666666', run_id: runId, calibration_review_id: reviewId,
    dimension: payload.dimension, assessment: payload.assessment, basis: payload.basis, rationale: payload.rationale,
    actor_id: actor, created_at: '2026-09-23T00:00:00Z', payload_hash: hash };
  const replay = harness({ insertError: { code: '23505' }, previous });
  assert.equal((await replay.POST(request())).status, 200);
  const reused = harness({ insertError: { code: '23505' }, previous: { ...previous, payload_hash: 'a'.repeat(64) } });
  assert.equal((await reused.POST(request())).status, 409);
});
