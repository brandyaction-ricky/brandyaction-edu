import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, modules = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'fetch', 'AbortSignal', output)(exports, name => modules[name], () => { throw new Error('unexpected global fetch'); }, AbortSignal);
  return exports;
}

const baseResult = {
  mode: 'mock', notice: 'mock', inquiry_type: 'prepurchase', topics: [], candidates: [], missing_topics: [], proposed_reply: '', requires_human_review: true,
};
const jev = load('../lib/conversion-jev.ts', { './conversion-review': { createMockJudgment: () => baseResult } });
const inquiry = { subject: '연락처 010-1234-5678', content: '메일 me@example.com 문샷 신청 문의', course_id: 'course', cohort_id: null };
const answers = {
  purchase_intent: { choice: 'high', confidence: 0.9, probabilities: { high: 0.9, medium: 0.1, low: 0, unclear: 0 } },
  primary_barrier: { choice: 'price', confidence: 0.8, probabilities: { price: 0.8, schedule: 0.1, skill_level: 0.05, content_fit: 0.03, trust: 0.01, none_or_unknown: 0.01 } },
  purchase_readiness: { score: 3.2, confidence: 0.85, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.6, 4: 0.3 } },
  next_action: { choice: 'offer_purchase_info', confidence: 0.95, probabilities: { answer_specific_questions: 0.04, invite_webinar: 0, offer_purchase_info: 0.95, human_consult: 0.01, hold_no_contact: 0 } },
};

test('Jev request removes common contact data and returns a validated shadow result', async () => {
  let call;
  const result = await jev.createJevJudgment(inquiry, [], 'private-key', async (url, options) => {
    call = { url, options };
    return Response.json({ model: 'jev-test', answers });
  });
  assert.equal(call.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(call.options.headers.Authorization, 'Bearer private-key');
  const body = JSON.parse(call.options.body);
  assert.doesNotMatch(JSON.stringify(body.state), /010-1234-5678|me@example\.com/);
  assert.match(JSON.stringify(body.state), /전화번호 제거|이메일 제거/);
  assert.equal(result.mode, 'jev');
  assert.equal(result.requires_human_review, true);
  assert.equal(result.decisions.purchase_intent.choice, 'high');
  assert.equal(result.decisions.purchase_readiness.score, 3.2);
});

test('provider errors and malformed choices never expose upstream bodies or secrets', async () => {
  await assert.rejects(jev.createJevJudgment(inquiry, [], 'top-secret', async () => new Response('private upstream body', { status: 500 })), error => {
    assert.equal(error.message, 'JEV_UNAVAILABLE');
    assert.doesNotMatch(error.message, /secret|upstream/);
    return true;
  });
  await assert.rejects(jev.createJevJudgment(inquiry, [], 'top-secret', async () => Response.json({ model: 'jev-test', answers: { ...answers, purchase_intent: { ...answers.purchase_intent, choice: 'invented' } } })), /JEV_INVALID_RESPONSE/);
});

test('Jev is disabled unless review, key, flag and an explicit non-production environment agree', () => {
  const server = load('../lib/conversion-review-server.ts', { 'node:crypto': { createHash() {} } });
  const valid = { EDU_CONVERSION_REVIEW_ENABLED: 'true', EDU_CONVERSION_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'key', NEXT_PUBLIC_APP_ENV: 'development' };
  assert.equal(server.conversionCapabilities(valid).can_jev, true);
  assert.equal(server.conversionCapabilities({ ...valid, VERCEL_ENV: 'production' }).can_jev, true);
  assert.equal(server.conversionCapabilities({ ...valid, NEXT_PUBLIC_APP_ENV: undefined, VERCEL_ENV: 'preview' }).can_jev, true);
  for (const env of [{}, { ...valid, TYPESAFE_API_KEY: '' }, { ...valid, EDU_CONVERSION_JEV_ENABLED: 'false' }, { ...valid, NEXT_PUBLIC_APP_ENV: 'production' }, { ...valid, NEXT_PUBLIC_APP_ENV: 'production', VERCEL_ENV: 'preview' }, { ...valid, NEXT_PUBLIC_APP_ENV: undefined, VERCEL_ENV: 'production' }]) {
    assert.equal(server.conversionCapabilities(env).can_jev, false);
  }
});
