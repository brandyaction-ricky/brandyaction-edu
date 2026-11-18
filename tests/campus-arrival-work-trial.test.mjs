import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function moduleFrom(relative) {
  const compiled = await build({entryPoints: [fileURLToPath(new URL(relative, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
}
const trial = await moduleFrom('../features/campus/arrival/work-trial.ts');
const arrival = await moduleFrom('../features/campus/arrival/config.ts');
const model = await moduleFrom('../features/campus/arrival/model.ts');
const config = trial.DEFAULT_WORK_TRIAL;
const configured = () => trial.updateWorkTrial(trial.initialWorkTrialState(), {role: '회의를 실행 계획으로 정리', reader: '팀장이 범위와 도움을 결정', priority: 'support'});
function completed() {
  let state = configured();
  state = trial.updateWorkTrial(state, {firstTask: config.firstTask.sample, step: 1});
  state = trial.updateWorkTrial(state, {firstConfirmed: true, step: 2});
  state = trial.updateWorkTrial(state, {feedback: '결정할 사항마다 선택지를 함께 보여줘.'});
  state = trial.updateWorkTrial(state, {feedbackConfirmed: true, step: 3});
  state = trial.updateWorkTrial(state, {secondTask: config.secondTask.sample});
  return trial.updateWorkTrial(state, {secondConfirmed: true, checks: [true, false, true], step: 4});
}
const rejects = value => assert.throws(() => trial.validateWorkTrialConfig(value), error => error.status === 400 && Boolean(error.message));

test('legacy campaigns gain the employee exercise without overwriting saved content', () => {
  const legacy = structuredClone(arrival.DEFAULT_ARRIVAL);
  delete legacy.workTrial;
  legacy.title = '기존 제목';
  legacy.audiences.work.goal = '기존 관리자가 쓴 설명';
  const before = structuredClone(legacy);
  const parsed = arrival.validateArrivalConfig(legacy);
  assert.deepEqual(parsed.workTrial, config);
  assert.notEqual(parsed.workTrial, config);
  assert.equal(parsed.title, legacy.title);
  assert.equal(parsed.audiences.work.goal, legacy.audiences.work.goal);
  assert.deepEqual(legacy, before);
  assert.deepEqual(arrival.validateArrivalConfig(JSON.parse(JSON.stringify(parsed))), parsed);
  for (const workTrial of [null, undefined, {}, []]) {
    assert.throws(() => arrival.validateArrivalConfig({...legacy, workTrial}), error => error.status === 400);
  }
});

test('administrator changes survive validation and change the actual manual and prompts', () => {
  const edited = structuredClone(config);
  edited.title = '실행 판단을 맡기는 직원';
  edited.priorities[2].label = '필요한 협업부터';
  edited.priorities[2].rule = '다른 팀에 확인할 질문을 맨 위에 둔다.';
  edited.boundaryDefault = '예산은 내 승인 없이 확정하지 않는다.';
  edited.firstTask.sample = '새 첫 예시';
  edited.firstTemplate = '{{manual}}\n원자료={{task}}\n관리자 작성 지침';
  const parsed = trial.validateWorkTrialConfig(edited);
  assert.deepEqual(parsed, edited);
  assert.notEqual(parsed.priorities, edited.priorities);
  const state = trial.updateWorkTrial(configured(), {firstTask: '내 실제 메모'});
  const prompt = trial.buildWorkPrompt(parsed, state, 'first');
  assert.match(prompt, /다른 팀에 확인할 질문/);
  assert.match(prompt, /예산은 내 승인 없이/);
  assert.match(prompt, /원자료=내 실제 메모/);
  assert.match(prompt, /관리자 작성 지침/);
  assert.ok(!prompt.includes('새 첫 예시'), 'sample text is only used when the visitor chooses it');
});

test('saved work trials add only missing value explanation and preserve every existing editorial choice', () => {
  const legacy = structuredClone(config);
  delete legacy.valueExplanation;
  legacy.summaryTitle = '관리자가 작성한 기존 마무리';
  legacy.secondTask.hint = '기존 자료 입력 도움말';
  const snapshot = structuredClone(legacy);
  const restored = trial.validateWorkTrialConfig(legacy);
  assert.deepEqual(restored.valueExplanation, config.valueExplanation);
  assert.notEqual(restored.valueExplanation, config.valueExplanation);
  const existing = {...restored}; delete existing.valueExplanation;
  assert.deepEqual(existing, snapshot);
  assert.deepEqual(legacy, snapshot, 'reading a legacy campaign does not write back defaults');
  const edited = {...restored, valueExplanation: {title: '편집한 가치 제목', before: '이전 요청 작성 설명', after: '새 자료와 기준을 함께 전달', takeaway: '관리자가 편집한 체험 활용 안내'}};
  assert.deepEqual(trial.validateWorkTrialConfig(JSON.parse(JSON.stringify(edited))), edited);
  for (const valueExplanation of [null, undefined, [], {}, {...config.valueExplanation, extra: true}, {...config.valueExplanation, before: ''}, {...config.valueExplanation, after: '가'.repeat(trial.WORK_TRIAL_LIMITS.description + 1)}]) {
    rejects({...legacy, valueExplanation});
  }
});

test('invalid editable schema, repeated priorities, duplicate sample tasks and unknown tokens are rejected', () => {
  for (const value of [null, {}, [], {...config, extra: true}]) rejects(value);
  for (const mutate of [
    v => delete v.firstTask.sample,
    v => {v.feedback.suggestions = ['하나'];},
    v => {v.checks = ['하나', '둘', ''];},
    v => {v.priorities[1].id = 'decisions';},
    v => {v.priorities[1].id = 'other';},
    v => {v.secondTask.sample = '  ' + v.firstTask.sample.replaceAll(' ', '\n') + ' ';},
    v => {v.roleDefault = '가'.repeat(trial.WORK_TRIAL_LIMITS.role + 1);},
    v => {v.firstTemplate = '{{manual}} {{task}} {{secret}}';},
    v => {v.updateTemplate = '{{manual}} {{task}}';},
    v => {v.reuseTemplate = '{{manual}} {{task}} {{';},
  ]) {
    const value = structuredClone(config); mutate(value); rejects(value);
  }
});

test('manual uses personal role, reader and selected judgement with editable default safeguards', () => {
  const empty = trial.initialWorkTrialState();
  assert.equal(trial.criteriaReady(config, empty), false);
  assert.equal(trial.buildWorkManual(config, empty), '');
  const state = configured();
  assert.equal(trial.criteriaReady(config, state), true);
  const manual = trial.buildWorkManual(config, state);
  for (const text of [state.role, state.reader, config.priorities[2].rule, config.boundaryDefault, config.formatDefault]) assert.ok(manual.includes(text));
  assert.ok(!manual.includes(config.priorities[0].rule));
  const custom = trial.updateWorkTrial(state, {boundary: '일정 변경은 내게 확인', format: '표로 정리'});
  const changed = trial.buildWorkManual(config, custom);
  assert.match(changed, /일정 변경은 내게 확인/);
  assert.match(changed, /표로 정리/);
  assert.ok(!changed.includes(config.boundaryDefault));
  assert.equal(trial.updateWorkTrial(state, {role: '작성 중 '}).role, '작성 중 ', 'typing keeps spaces');
});

test('four stages require explicit reports; copying or a saved step never manufactures an AI reply', () => {
  let state = configured();
  state = trial.updateWorkTrial(state, {firstTask: config.firstTask.sample, step: 4});
  assert.equal(state.step, 1);
  assert.equal(state.firstConfirmed, false);
  assert.equal(trial.buildWorkPrompt(config, state, 'feedback'), '');
  state = trial.updateWorkTrial(state, {firstConfirmed: true, step: 2});
  assert.equal(state.step, 2);
  state = trial.updateWorkTrial(state, {feedback: '선택지를 함께 정리해줘.', step: 3});
  assert.equal(state.step, 2);
  state = trial.updateWorkTrial(state, {feedbackConfirmed: true, step: 3});
  assert.equal(state.step, 3);
  state = trial.updateWorkTrial(state, {secondTask: config.secondTask.sample, step: 4});
  assert.equal(state.step, 3);
  state = trial.updateWorkTrial(state, {secondConfirmed: true, step: 4});
  assert.equal(state.step, 4);
  assert.deepEqual(state.checks, [false, false, false], 'answer receipt does not mean quality passed');
  const untrusted = trial.parseWorkTrialState({...trial.initialWorkTrialState(), step: 4, firstConfirmed: true, feedbackConfirmed: true, secondConfirmed: true, checks: [true, true, true]});
  assert.deepEqual(untrusted, trial.initialWorkTrialState());
});

test('feedback is added to the manual and reused with only the new task facts', () => {
  const state = completed();
  const first = trial.buildWorkPrompt(config, state, 'first');
  const update = trial.buildWorkPrompt(config, state, 'feedback');
  const reuse = trial.buildWorkPrompt(config, state, 'reuse');
  assert.ok(first.includes(state.firstTask));
  assert.ok(!first.includes(state.feedback), 'earlier first request does not silently include later feedback');
  assert.ok(update.includes(state.feedback) && update.includes(state.firstTask));
  assert.ok(reuse.includes(state.feedback) && reuse.includes(state.secondTask));
  assert.ok(!reuse.includes(state.firstTask), 'previous task facts are not a reusable working standard');
  assert.ok(!trial.buildWorkManual(config, state).includes(state.secondTask));
  const same = trial.updateWorkTrial(state, {secondTask: '  ' + state.firstTask.replaceAll(' ', '\n') + ' '});
  assert.equal(trial.secondTaskReady(same), false);
  assert.equal(trial.buildWorkPrompt(config, same, 'reuse'), '');
  assert.equal(same.secondConfirmed, false);
});

test('literal template-looking content remains literal through one substitution pass', () => {
  const state = trial.updateWorkTrial(configured(), {role: '역할에 {{task}}와 $&가 포함됨', firstTask: '메모에 {{manual}} 포함'});
  const prompt = trial.buildWorkPrompt(config, state, 'first');
  assert.ok(prompt.includes(state.role));
  assert.ok(prompt.includes(state.firstTask));
});

test('editing earlier decisions clears dependent completion but keeps the visitor’s drafts', () => {
  const before = completed();
  for (const [patch, expectedStep, firstConfirmed, feedbackConfirmed] of [
    [{role: '새 역할'}, 0, false, false],
    [{priority: 'scope'}, 0, false, false],
    [{firstTask: '새 첫 메모'}, 1, false, false],
    [{feedback: '새 피드백'}, 2, true, false],
    [{secondTask: '새 두 번째 메모'}, 3, true, true],
  ]) {
    const next = trial.updateWorkTrial(before, patch);
    assert.equal(next.step, expectedStep);
    assert.equal(next.firstConfirmed, firstConfirmed);
    assert.equal(next.feedbackConfirmed, feedbackConfirmed);
    assert.equal(next.secondConfirmed, false);
    assert.deepEqual(next.checks, [false, false, false]);
    for (const key of ['role', 'reader', 'firstTask', 'feedback', 'secondTask']) if (!(key in patch)) assert.equal(next[key], before[key]);
  }
  assert.deepEqual(trial.updateWorkTrial(before, {step: 0}), {...before, step: 0}, 'back navigation itself does not destroy progress');
});

test('leaving for personal AI restores the real drafts and self-reported checks without creating them', () => {
  const state = model.initialArrivalState();
  state.workTrial = completed(); state.step = 1; state.station = 6;
  assert.deepEqual(model.parseArrivalState(model.serializeArrivalState(state)), state);
  const legacy = {...state}; delete legacy.workTrial;
  assert.deepEqual(model.parseArrivalState(JSON.stringify(legacy)).workTrial, trial.initialWorkTrialState());
  const allMax = model.initialArrivalState();
  for (const answers of Object.values(allMax.answers)) {answers.a = '"'.repeat(500); answers.b = '"'.repeat(500);}
  allMax.workTrial = trial.parseWorkTrialState({...completed(), role: '"'.repeat(240), reader: '"'.repeat(400), boundary: '"'.repeat(700), format: '"'.repeat(700), firstTask: '"'.repeat(2400), secondTask: 'a' + '"'.repeat(2399), feedback: '"'.repeat(700)});
  assert.ok(JSON.stringify(allMax).length < model.ARRIVAL_STORAGE_LIMIT);
  assert.deepEqual(model.parseArrivalState(model.serializeArrivalState(allMax)), allMax, 'maximum valid state fits the browser storage boundary');
});
