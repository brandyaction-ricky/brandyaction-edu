import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const env = { EDU_CONVERSION_REVIEW_ENABLED: 'true', EDU_CONVERSION_JEV_ENABLED: 'true', NEXT_PUBLIC_APP_ENV: 'development', TYPESAFE_API_KEY: 'secret' };
function compile(path, modules, processEnv = env) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', output)(exports, name => modules[name], { env: processEnv });
  return exports;
}

const cases = compile('../lib/conversion-jev-v4-boundary-cases.ts', {}).JEV_V4_BOUNDARY_CASES;
const request = (caseId = cases[0].id, origin = 'https://edu.example') => new Request('https://edu.example/api/conversion/jev-v4-synthetic', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseId }),
});

function harness(options = {}) {
  const events = [];
  const server = compile('../lib/conversion-review-server.ts', { 'node:crypto': { createHash() { throw new Error('unused'); } } }, options.env || env);
  const handlers = compile('../app/api/conversion/jev-v4-synthetic/route.ts', {
    '@/lib/operator-permissions': { getOperatorUser: async () => options.user === undefined ? { id: '11111111-1111-4111-8111-111111111111' } : options.user },
    '@/lib/conversion-jev-v4-boundary-cases': { JEV_V4_BOUNDARY_CASES: cases },
    '@/lib/conversion-jev-v4': { createJevV4Judgment: async (subject, content, key) => { events.push({ subject, content, key }); return { contract_version: 4, decisions: {}, consistency_flags: [], uncertainty_flags: [] }; } },
    '@/lib/conversion-review-server': server,
  }, options.env || env);
  return { ...handlers, events };
}

test('synthetic v4 endpoint is DEV-only, same-origin, and requires a member operator', async () => {
  for (const [options, origin] of [
    [{ env: { ...env, NEXT_PUBLIC_APP_ENV: 'production' } }, 'https://edu.example'],
    [{}, 'https://other.example'],
    [{ user: null }, 'https://edu.example'],
  ]) {
    const h = harness(options);
    assert.equal((await h.POST(request(undefined, origin))).status, 403);
    assert.deepEqual(h.events, []);
  }
});

test('synthetic v4 endpoint only calls Jev with an allowlisted synthetic case and never persists', async () => {
  const h = harness();
  const response = await h.POST(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.case.id, cases[0].id);
  assert.equal(payload.result.contract_version, 4);
  assert.deepEqual(h.events, [{ subject: cases[0].subject, content: cases[0].content, key: 'secret' }]);
});

test('synthetic v4 endpoint rejects unknown case IDs without a provider call', async () => {
  const h = harness();
  const response = await h.POST(request('customer-record-not-allowed'));
  assert.equal(response.status, 400);
  assert.deepEqual(h.events, []);
});

test('boundary fixture contains nine synthetic cases with distinct review questions', () => {
  assert.equal(cases.length, 9);
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  assert.ok(cases.every(item => item.reviewGuide.length > 10));
  assert.ok(cases.some(item => item.id === 'free-replay-plus-future-consideration'));
  assert.ok(cases.some(item => item.id === 'paid-application-failure'));
  assert.ok(cases.some(item => item.id === 'ambiguous-link-failure'));
});
