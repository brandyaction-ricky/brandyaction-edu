import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { loadTs } from './helpers/question-ai.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = fs.readFileSync(new URL('../app/api/platform/question-delete/route.ts', import.meta.url), 'utf8');
function harness({ user = { id: id(1) }, enabled = true, supported = true, readyError, rpcError } = {}) {
  const calls = [], deletedAt = '2026-10-11T08:00:00Z';
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { error: rpcError, data: name === 'edu_can_delete_own_question' ? { canDelete: true, headId: id(3) } : { id: args.p_question, deletedAt } }; } };
  const dependencies = {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/edu-workflows': { uuid: value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) },
    '@/lib/question-deletion-server': { questionDeletionReady: async () => { if (readyError) throw readyError; return supported; } },
  };
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', 'process', code)(exports, name => { assert.ok(name in dependencies, name); return dependencies[name]; }, { env: { NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED: String(enabled) } });
  const post = (body = { questionId: id(2), expectedHeadId: id(3) }, origin = 'https://edu.test', raw = false) => exports.POST(new Request('https://edu.test/api/platform/question-delete', { method: 'POST', headers: { origin }, body: raw ? body : JSON.stringify(body) }));
  return { calls, post, get: (question = id(2)) => exports.GET(new Request('https://edu.test/api/platform/question-delete?question=' + question)) };
}
test('deletion derives the actor from the session, returns private responses, and repeated calls retain the receipt', async () => {
  const h = harness(), status = await h.get(); assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { canDelete: true, headId: id(3), supported: true });
  const a = await h.post(), b = await h.post(); assert.equal(a.status, 200); assert.deepEqual(await a.json(), await b.json());
  for (const call of h.calls) { assert.equal(call.args.p_actor, id(1)); assert.equal(call.args.p_question, id(2)); }
  assert.equal(h.calls[1].args.p_expected_head, id(3));
  assert.equal(a.headers.get('cache-control'), 'private, no-store'); assert.equal(a.headers.get('vary'), 'Cookie');
});
test('auth, origin, forged actors, missing heads and oversized streamed input cannot reach deletion RPC', async () => {
  for (const [config, expected] of [[{ user: null }, 401], [{ enabled: false }, 404]]) {
    const h = harness(config); assert.equal((await h.get()).status, expected); assert.equal((await h.post()).status, expected); assert.equal(h.calls.length, 0);
  }
  const h = harness(); assert.equal((await h.post(undefined, 'https://other.test')).status, 403);
  for (const body of [[], null, { questionId: id(2) }, { questionId: id(2), expectedHeadId: 'invalid' }, { questionId: id(2), expectedHeadId: null, actor: id(4) }]) assert.equal((await h.post(body)).status, 400);
  assert.equal((await h.get('invalid')).status, 400);
  assert.equal((await h.post('{', undefined, true)).status, 400);
  assert.equal((await h.post('한'.repeat(1000), undefined, true)).status, 413);
  assert.equal(h.calls.length, 0);
});
test('old schemas expose an unavailable control and errors fail safely without SQL or question text', async () => {
  const old = harness({ supported: false }); assert.deepEqual(await (await old.get()).json(), { canDelete: false, supported: false });
  assert.equal((await old.post()).status, 404); assert.equal(old.calls.length, 0);
  for (const [message, status] of [['QUESTION_NOT_FOUND', 404], ['MESSAGE_FORBIDDEN', 403], ['QUESTION_CHANGED', 409], ['private SQL with question text', 503]]) {
    const h = harness({ rpcError: { message } }); const r = await h.post(); assert.equal(r.status, status); assert.doesNotMatch(await r.text(), /private SQL|question text/);
  }
  const failed = harness({ readyError: Error('private SQL') }); const r = await failed.get(); assert.equal(r.status, 503); assert.equal(failed.calls.length, 0); assert.doesNotMatch(await r.text(), /private SQL/);
});
test('schema readiness retries missing RPCs, caches confirmed support, and rejects unexpected errors', async () => {
  const helper = loadTs('lib/question-deletion-server.ts'); let calls = 0, response = { data: null, error: { code: 'PGRST202' } };
  const db = { rpc: async name => { assert.equal(name, 'edu_question_delete_ready'); calls++; return response; } };
  assert.equal(await helper.questionDeletionReady(db), false); assert.equal(await helper.questionDeletionReady(db), false); assert.equal(calls, 2);
  response = { data: null, error: Error('DB unavailable') }; await assert.rejects(helper.questionDeletionReady(db), /DB unavailable/);
  response = { data: false }; await assert.rejects(helper.questionDeletionReady(db), /unavailable/);
  response = { data: true }; assert.equal(await helper.questionDeletionReady(db), true);
  response = { error: Error('not used') }; assert.equal(await helper.questionDeletionReady(db), true); assert.equal(calls, 5);
});
