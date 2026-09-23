import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/conversion-jev-v4.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const v4 = {};
new Function('exports', 'require', 'fetch', 'AbortSignal', compiled)(v4, name => {
  assert.equal(name, './conversion-jev');
  return { redactJevText: value => value.replace(/\d{3}-\d{4}-\d{4}/g, '[전화번호 제거]') };
}, () => { throw new Error('unexpected global fetch'); }, AbortSignal);

function answers(overrides = {}) {
  return Object.fromEntries(Object.entries(v4.JEV_V4_CHOICES).map(([key, choices]) => {
    const choice = overrides[key] || choices[0];
    return [key, { choice, confidence: 0.8, probabilities: Object.fromEntries(choices.map(option => [option, option === choice ? 0.8 : 0.2 / (choices.length - 1)])) }];
  }));
}

test('v4 distinguishes free replay access, paid reference, and attempted paid application', () => {
  assert.deepEqual(Object.keys(v4.JEV_V4_QUESTIONS), ['information_need', 'confirmed_barrier', 'attempted_action_target', 'operational_issue', 'paid_program_reference', 'observable_stage']);
  assert.match(v4.JEV_V4_QUESTIONS.attempted_action_target.instructions, /결제창이 나타났다는 사실만으로 유료 신청·결제 시도를 선택하지 마세요/);
  assert.match(v4.JEV_V4_QUESTIONS.operational_issue.instructions, /무료 콘텐츠 접근 실패/);
  assert.ok(v4.JEV_V4_CHOICES.attempted_action_target.includes('free_live_or_replay'));
  assert.ok(v4.JEV_V4_CHOICES.attempted_action_target.includes('paid_application'));
  assert.ok(v4.JEV_V4_CHOICES.paid_program_reference.includes('future_consideration_after_free_content'));
});

test('free replay access with a payment page remains a free access problem, while paid application failure remains paid', async () => {
  const free = answers({ attempted_action_target: 'free_live_or_replay', operational_issue: 'free_content_access_failure', paid_program_reference: 'future_consideration_after_free_content', observable_stage: 'future_consideration_after_free_content' });
  const paid = answers({ attempted_action_target: 'paid_application', operational_issue: 'paid_application_failure', paid_program_reference: 'paid_application_or_payment', observable_stage: 'paid_application_or_payment_attempt' });
  let sent;
  const result = await v4.createJevV4Judgment('다시보기 문의', '무료 강의를 다시 보려고 했는데 결제창이 뜹니다. 유료 교육은 영상을 본 뒤 결정하겠습니다. 010-1234-5678', 'secret', async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ model: 'jev-test', answers: free });
  });
  assert.equal(result.contract_version, 4);
  assert.deepEqual(result.consistency_flags, []);
  assert.equal(result.decisions.attempted_action_target.choice, 'free_live_or_replay');
  assert.equal(result.decisions.observable_stage.choice, 'future_consideration_after_free_content');
  assert.doesNotMatch(sent.state.inquiry, /010-1234-5678/);
  assert.deepEqual(sent.questions, v4.JEV_V4_QUESTIONS);
  const paidResult = await v4.createJevV4Judgment('신청 오류', '유료 교육 신청 버튼을 눌렀지만 신청되지 않습니다.', 'secret', async () => Response.json({ answers: paid }));
  assert.deepEqual(paidResult.consistency_flags, []);
});

test('conflicting paid attempt or failure is flagged for human review rather than silently corrected', async () => {
  const contradictory = answers({ attempted_action_target: 'free_live_or_replay', operational_issue: 'paid_application_failure', paid_program_reference: 'paid_application_or_payment', observable_stage: 'paid_application_or_payment_attempt' });
  const result = await v4.createJevV4Judgment('무료 영상', '무료 영상 링크를 눌렀습니다.', 'secret', async () => Response.json({ answers: contradictory }));
  assert.deepEqual(result.consistency_flags, ['paid_attempt_without_paid_target', 'paid_failure_without_paid_target']);
  assert.equal(result.decisions.observable_stage.choice, 'paid_application_or_payment_attempt');
});

test('v4 flags an explicit future paid consideration that the stage overlooks', async () => {
  const contradictory = answers({ attempted_action_target: 'free_live_or_replay', operational_issue: 'free_content_access_failure', paid_program_reference: 'future_consideration_after_free_content', observable_stage: 'no_purchase_signal' });
  const result = await v4.createJevV4Judgment('무료 다시보기', '영상을 보고 유료 교육을 결정하겠습니다.', 'secret', async () => Response.json({ answers: contradictory }));
  assert.deepEqual(result.consistency_flags, ['paid_reference_without_stage']);
  assert.equal(result.decisions.observable_stage.choice, 'no_purchase_signal');
});

test('v4 rejects invented choices and malformed probability distributions', async () => {
  const invalid = answers();
  invalid.attempted_action_target.choice = 'invented';
  await assert.rejects(v4.createJevV4Judgment('문의', '내용', 'secret', async () => Response.json({ answers: invalid })), /JEV_INVALID_RESPONSE/);
  const missing = answers();
  delete missing.operational_issue.probabilities.none_stated;
  await assert.rejects(v4.createJevV4Judgment('문의', '내용', 'secret', async () => Response.json({ answers: missing })), /JEV_INVALID_RESPONSE/);
});
