import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/conversion-jev-v2.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const v2 = {};
new Function('exports', 'require', 'fetch', 'AbortSignal', compiled)(v2, name => {
  assert.equal(name, './conversion-jev');
  return { redactJevText: value => value.replace(/\d{3}-\d{4}-\d{4}/g, '[전화번호 제거]') };
}, () => { throw new Error('unexpected global fetch'); }, AbortSignal);

function answers() {
  return Object.fromEntries(Object.entries(v2.JEV_V2_CHOICES).map(([key, choices]) => [key, {
    choice: choices[0], confidence: 0.75, probabilities: Object.fromEntries(choices.map((choice, index) => [choice, index === 0 ? 0.75 : 0.25 / (choices.length - 1)])),
  }]));
}

test('v2 explicitly separates information requests, confirmed barriers, operational failures and observed behavior', () => {
  assert.deepEqual(Object.keys(v2.JEV_V2_QUESTIONS), ['information_need', 'confirmed_barrier', 'operational_issue', 'observable_stage']);
  assert.match(v2.JEV_V2_QUESTIONS.confirmed_barrier.instructions, /단순 가격·일정·난이도 질문만으로 장애물을 추론하지 마세요/);
  assert.match(v2.JEV_V2_QUESTIONS.observable_stage.instructions, /신청 시도를 추정하지 마세요/);
  assert.ok(v2.JEV_V2_CHOICES.operational_issue.includes('registration_failure'));
  assert.ok(v2.JEV_V2_CHOICES.operational_issue.includes('replay_access_failure'));
});

test('v2 sends only redacted old inquiry, preserves its version and rejects malformed provider answers', async () => {
  let body;
  const requester = async (_url, options) => { body = JSON.parse(options.body); return Response.json({ model: 'jev-test', answers: answers() }); };
  const result = await v2.createJevV2Judgment('가격 문의', '010-1234-5678 신청했습니다', 'secret', requester);
  assert.equal(result.contract_version, 2);
  assert.equal(result.decisions.observable_stage.choice, 'no_purchase_signal');
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(body.questions, v2.JEV_V2_QUESTIONS);
  assert.doesNotMatch(body.state.inquiry, /010-1234-5678/);
  const bad = answers();
  bad.confirmed_barrier.choice = 'invented';
  await assert.rejects(v2.createJevV2Judgment('문의', '내용', 'secret', async () => Response.json({ answers: bad })), /JEV_INVALID_RESPONSE/);
});
