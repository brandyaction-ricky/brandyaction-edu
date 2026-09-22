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
const core = load('../lib/conversion-review.ts');
const ids = { actor: '11111111-1111-4111-8111-111111111111', request: '22222222-2222-4222-8222-222222222222', course: '33333333-3333-4333-8333-333333333333', inquiry: '44444444-4444-4444-8444-444444444444', question: '55555555-5555-4555-8555-555555555555' };
const env = { EDU_CONVERSION_REVIEW_ENABLED: 'true', EDU_CONVERSION_MOCK_ENABLED: 'true', NEXT_PUBLIC_APP_ENV: 'test' };
const base = { action: 'save_case', requestId: ids.request, course_id: ids.course, subject: '수강 수준', content: '초보자도 따라갈 수 있나요?', source_label: '외부 문의 발췌', received_at: '2026-01-01T00:00:00Z' };
const req = (body = base, origin = 'https://edu.example') => new Request('https://edu.example/api/conversion', { method: 'POST', headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
function harness(options = {}) {
  const calls = [], reads = [], selections = {};
  const user = options.user === undefined ? { id: ids.actor, permissions: { members: true, products: true } } : options.user;
  const db = {
    from(table) {
      reads.push(table);
      const query = { select(columns) { selections[table] = columns; return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        async maybeSingle() { return { data: options.inquiry || { id: ids.inquiry, course_id: ids.course, cohort_id: null, input_version: 1, subject: '초보', content: '난이도 문의' }, error: null }; },
        then(resolve) { return Promise.resolve({ data: options.rows?.[table] || [], error: null }).then(resolve); } };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return options.rpcResult || { data: { case: { id: ids.inquiry } }, error: null }; },
  };
  const handlers = load('../app/api/conversion/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'members'); if (options.authError) throw options.authError; return user; } },
    '@/lib/conversion-review-server': server,
    '@/lib/conversion-review': core,
    '@/lib/conversion-jev': { createJevJudgment: options.createJevJudgment || (async () => { throw new Error('unexpected Jev call'); }) },
  }, options.env || env);
  return { ...handlers, calls, reads, selections };
}

test('conversion is off by default, including reads, before touching any data', async () => {
  const h = harness({ env: {} });
  assert.equal((await h.GET()).status, 404);
  assert.equal((await h.POST(req())).status, 404);
  assert.deepEqual(h.reads, []); assert.deepEqual(h.calls, []);
});
test('mutation requires an exact Origin and members authorization', async () => {
  for (const origin of ['', 'https://other.example']) assert.equal((await harness().POST(req(base, origin))).status, 403);
  const h = harness({ user: null });
  assert.equal((await h.POST(req())).status, 403); assert.equal((await h.GET()).status, 403); assert.deepEqual(h.reads, []);
});
test('authentication outage is retryable and never logs or echoes source data', async () => {
  const h = harness({ authError: Object.assign(new Error('secret database detail'), { status: 503 }) });
  const result = await h.GET(); assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /secret/);
});
test('evidence mutation also requires products permission', async () => {
  const h = harness({ user: { id: ids.actor, permissions: { members: true, products: false } } });
  const result = await h.POST(req({ action: 'save_evidence', requestId: ids.request, course_id: ids.course, title: '대상', body: '초보자 대상 안내', source_url: 'https://edu.example/classes/course', status: 'approved' }));
  assert.equal(result.status, 403); assert.deepEqual(h.calls, []);
});
test('invalid body, ID, timestamps and unsafe source URLs never reach persistence', async () => {
  const malformed = [ '{', { ...base, requestId: 'no' }, { ...base, received_at: 'yesterday' }, { ...base, received_at: '2026-01-01T09:00:00' }, { action: 'save_evidence', requestId: ids.request, course_id: ids.course, title: 'test', body: 'body', source_url: 'javascript:alert(1)', status: 'approved' } ];
  for (const payload of malformed) { const h = harness(); assert.equal((await h.POST(req(payload))).status, 400); assert.deepEqual(h.calls, []); }
});
test('manual customer identity and native inquiry text cannot be injected', async () => {
  const manual = harness(); await manual.POST(req({ ...base, customer_id: ids.actor }));
  assert.equal('customer_id' in manual.calls[0].args.p_payload, false);
  const native = harness(); await native.POST(req({ ...base, question_id: ids.question, content: 'forged content', subject: 'forged title', customer_id: ids.actor }));
  assert.equal(native.calls[0].args.p_payload.content, ''); assert.equal(native.calls[0].args.p_payload.subject, '');
  assert.equal('customer_id' in native.calls[0].args.p_payload, false);
});
test('stable intent fingerprints preserve retries and distinguish changed content', () => {
  const a = server.conversionPayload(base), b = server.conversionPayload({ ...base }), changed = server.conversionPayload({ ...base, content: '다른 문의' });
  assert.equal(a.payload_hash, b.payload_hash); assert.notEqual(a.payload_hash, changed.payload_hash);
  assert.equal(a.requestId, ids.request);
});
test('review does not call original question writes, message delivery or order APIs', async () => {
  const h = harness(); const result = await h.POST(req({ action: 'review', requestId: ids.request, case_id: ids.inquiry, run_id: ids.question, decision: 'hold', reply_text: '', reason: '자료 확인 필요' }));
  assert.equal(result.status, 200); assert.deepEqual(h.reads, []);
  assert.equal(h.calls[0].name, 'edu_conversion_mutate'); assert.equal(h.calls[0].args.p_action, 'review');
});
test('mock cannot run in the operating app or an unknown environment', async () => {
  const environments = [{ ...env, NEXT_PUBLIC_APP_ENV: 'production' }, { ...env, NEXT_PUBLIC_APP_ENV: 'production', VERCEL_ENV: 'preview' }, { ...env, NEXT_PUBLIC_APP_ENV: undefined }, { ...env, NEXT_PUBLIC_APP_ENV: undefined, VERCEL_ENV: 'production' }, { ...env, EDU_CONVERSION_MOCK_ENABLED: 'false' }];
  for (const values of environments) { const h = harness({ env: values }); const result = await h.POST(req({ action: 'analyze', requestId: ids.request, case_id: ids.inquiry, expected_version: 1 })); assert.equal(result.status, 403); assert.deepEqual(h.reads, []); }
});
test('mock result is generated by server and snapshots every approved in-scope candidate', async () => {
  const evidence = [ { id: 'e1', course_id: ids.course, cohort_id: null, status: 'approved', version: 1, title: '초보자', body: '초보자의 수강 기준', source_url: 'https://example.com' } ];
  const h = harness({ rows: { edu_conversion_evidence: evidence } });
  const response = await h.POST(req({ action: 'analyze', requestId: ids.request, case_id: ids.inquiry, expected_version: 1, result: { mode: 'real' } }));
  assert.equal(response.status, 200); assert.equal(h.calls[0].args.p_result.mode, 'mock');
  assert.deepEqual(h.calls[0].args.p_evidence_versions, { e1: 1 });
  assert.equal(h.calls[0].args.p_observed_version, 1);
});
test('Jev shadow mode takes precedence over mock and persists only the server result', async () => {
  const jev = { ...core.createMockJudgment({ id: ids.inquiry, course_id: ids.course, cohort_id: null, subject: '문의', content: '내용' }, []), mode: 'jev', model: 'jev-test', decision_version: 1, decisions: {} };
  const h = harness({ env: { ...env, TYPESAFE_API_KEY: 'secret', EDU_CONVERSION_JEV_ENABLED: 'true' }, createJevJudgment: async (_item, _evidence, key) => { assert.equal(key, 'secret'); return jev; } });
  const response = await h.POST(req({ action: 'analyze', requestId: ids.request, case_id: ids.inquiry, expected_version: 1, result: { mode: 'client-forged' } }));
  assert.equal(response.status, 200);
  assert.equal(h.calls[0].args.p_result.mode, 'jev');
});
test('database stale versions and reused request IDs are returned as conflicts', async () => {
  for (const message of ['CONVERSION_STALE', 'CONVERSION_REQUEST_REUSED']) {
    const h = harness({ rpcResult: { data: null, error: { message } } }); assert.equal((await h.POST(req())).status, 409);
  }
});
test('snapshot contains no orders or profile query and is private no-store', async () => {
  const h = harness(); const response = await h.GET(); assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(h.reads.includes('profiles'), false); assert.equal(h.reads.includes('orders'), false); assert.equal(h.reads.includes('payments'), false);
  const body = await response.json(); assert.equal(body.capabilities.can_mock, true); assert.equal(body.capabilities.can_manage_evidence, true);
});
test('run history returns the original inquiry and evidence snapshots', async () => {
  const run = { id: ids.question, case_id: ids.inquiry, input_snapshot: { subject: '당시 문의', content: '당시 원문', input_version: 1 }, evidence_snapshot: [{ id: ids.course, version: 1, body: '당시 승인자료' }] };
  const h = harness({ rows: { edu_conversion_runs: [run] } });
  const body = await (await h.GET()).json();
  assert.deepEqual(body.runs[0].input_snapshot, run.input_snapshot);
  assert.deepEqual(body.runs[0].evidence_snapshot, run.evidence_snapshot);
  assert.ok(h.selections.edu_conversion_runs.split(',').includes('input_snapshot'));
  assert.ok(h.selections.edu_conversion_runs.split(',').includes('evidence_snapshot'));
});
