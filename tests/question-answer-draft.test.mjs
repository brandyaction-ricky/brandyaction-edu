import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const questionId = '11111111-1111-4111-8111-111111111111';

function routeHarness({ user = { id: 'operator' }, question = { id: questionId, title: '질문 제목', content: '질문 본문' }, env = { OPENAI_API_KEY: 'test-key' }, providerResponse = { output: [{ type: 'message', content: [{ type: 'output_text', text: '검수할 답변 초안입니다.' }] }] } } = {}) {
  const reads = [];
  const source = fs.readFileSync(new URL('../app/api/admin/questions/answer-draft/route.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', 'fetch', output)(exports, name => {
    if (name === '@/lib/operator-permissions') return { getOperatorUser: async scope => { assert.equal(scope, 'members'); return user; } };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => ({ from(table) {
      assert.equal(table, 'edu_questions');
      const filters = {};
      const query = { select(columns) { assert.equal(columns, 'id,title,content'); return this; }, eq(key, value) { filters[key] = value; return this; }, async maybeSingle() { reads.push({ ...filters }); return { data: question, error: null }; } };
      return query;
    } }) };
    throw new Error(`Unexpected dependency ${name}`);
  }, { env }, async (url, options) => {
    reads.push({ url, options });
    return new Response(JSON.stringify(providerResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { ...exports, reads };
}

const request = (body = { questionId }, origin = 'https://edu.example') => new Request('https://edu.example/api/admin/questions/answer-draft', {
  method: 'POST',
  headers: { ...(origin ? { origin } : {}), 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('AI question drafts require same-origin member operations permission before question access', async () => {
  const unauthorized = routeHarness({ user: null });
  assert.equal((await unauthorized.POST(request())).status, 403);
  assert.equal(unauthorized.reads.length, 0);
  const crossOrigin = routeHarness();
  assert.equal((await crossOrigin.POST(request({ questionId }, 'https://other.example'))).status, 403);
  assert.equal(crossOrigin.reads.length, 0);
});

test('AI answer generation fetches the question server-side and returns an unregistered draft', async () => {
  const route = routeHarness();
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { draft: '검수할 답변 초안입니다.' });
  const provider = route.reads.find(item => item.url === 'https://api.openai.com/v1/responses');
  assert.ok(provider);
  const payload = JSON.parse(provider.options.body);
  assert.equal(payload.model, 'gpt-5-mini');
  assert.equal(payload.store, false);
  assert.match(payload.input, /질문 본문/);
  assert.equal(route.reads.find(item => item.id === questionId)?.['is_archived'], false);
});

test('AI answer generation fails closed when OpenAI configuration is missing', async () => {
  const route = routeHarness({ env: {} });
  const response = await route.POST(request());
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
  assert.equal(route.reads.length, 0);
});
