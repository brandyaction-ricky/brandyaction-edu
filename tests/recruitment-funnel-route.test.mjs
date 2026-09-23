import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash, randomUUID } from 'node:crypto';

function load(path, modules, env = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  new Function('exports','require','process',ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, name => {
    assert.ok(modules[name], name); return modules[name];
  }, { env });
  return exports;
}
const server = load('../lib/conversion-review-server.ts', { 'node:crypto': { createHash } });
const actor = randomUUID();
const input = { requestId: randomUUID(), expected_version: 0, freeCourseId: randomUUID(), freeCohortId: randomUUID(), paidCourseId: randomUUID(), paidCohortId: randomUUID() };
const request = (body = input, origin = 'https://example.test') => new Request('https://example.test/api/conversion/funnel', { method:'POST', headers: { origin }, body: JSON.stringify(body) });
function harness({ enabled = true, allowed = true, error = null } = {}) {
  const calls = [];
  const row = { version: 1, actor_id: actor, request_id: input.requestId };
  const query = { select() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: null, error }; } };
  const route = load('../app/api/conversion/funnel/route.ts', {
    '@/lib/conversion-review-server': server,
    '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'marketing'); return { id: actor, permissions: { products: allowed } }; } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from() { calls.push('read'); return query; }, async rpc(name,args) { calls.push({name,args}); return {data:row,error}; } }) },
  }, enabled ? { EDU_CONVERSION_REVIEW_ENABLED: 'true' } : {});
  return { ...route, calls };
}
test('funnel flag and permissions fail closed before database access', async () => {
  for (const [options,status] of [[{enabled:false},404],[{allowed:false},403]]) {
    const h = harness(options);
    assert.equal((await h.GET()).status,status);
    assert.equal((await h.POST(request())).status,status);
    assert.deepEqual(h.calls,[]);
  }
});
test('forged actor and readiness are ignored, and audit identities are not returned', async () => {
  const h = harness();
  const response = await h.POST(request({...input, actor_id:randomUUID(), measurement:'ready'}));
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(h.calls[0].args.p_actor,actor);
  assert.equal(result.measurement,'unverified');
  assert.equal('actor_id' in result.draft,false);
  assert.equal('request_id' in result.draft,false);
});
test('bad origin, invalid ids, and stale revision errors cannot become success', async () => {
  const h = harness();
  assert.equal((await h.POST(request(input,'https://other.test'))).status,403);
  assert.equal((await h.POST(request({...input,freeCourseId:'page-slug'}))).status,400);
  assert.equal((await h.POST(request({...input,expected_version:-1}))).status,409);
  assert.deepEqual(h.calls,[]);
  assert.equal((await harness({error:{message:'CONVERSION_STALE'}}).POST(request())).status,409);
});

test('a free product without a cohort reaches the RPC as null', async () => {
  for (const value of [undefined, null, '']) {
    const h = harness();
    assert.equal((await h.POST(request({...input, freeCohortId:value}))).status, 200);
    assert.equal(h.calls[0].args.p_free_cohort, null);
  }
});
