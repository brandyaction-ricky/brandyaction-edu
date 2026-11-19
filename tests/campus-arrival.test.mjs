import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function moduleFrom(relative) {
  const compiled = await build({entryPoints: [fileURLToPath(new URL(relative, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
}
const content = await moduleFrom('../features/campus/arrival/content.ts');
const model = await moduleFrom('../features/campus/arrival/model.ts');
const office = await moduleFrom('../features/campus/arrival/office-demo.ts');
const officeCase = await moduleFrom('../features/campus/arrival/office-demo-case.ts');

test('live countdown uses Seoul calendar days across midnight and follows a rescheduled date', () => {
  const {liveCountdownLabel} = model;
  assert.equal(liveCountdownLabel('2026-12-07', new Date('2026-12-06T14:59:59Z')), '라이브까지 1일');
  assert.equal(liveCountdownLabel('2026-12-07', new Date('2026-12-06T15:00:00Z')), '오늘 라이브');
  assert.equal(liveCountdownLabel('2026-12-09', new Date('2026-12-06T15:00:00Z')), '라이브까지 2일');
  assert.equal(liveCountdownLabel('2026-12-07', new Date('2026-12-07T15:00:00Z')), '');
});

test('each visitor gets an immediately usable request based on their own two answers', () => {
  const answers = {a: '임시 입력 A — 나의 상품·고객·경험', b: '임시 입력 B — 나의 장점·질문·상황'};
  const requests = Object.fromEntries(content.audiences.map(audience => [audience, content.buildRequest(audience, answers)]));
  assert.equal(new Set(Object.values(requests)).size, 4);
  for (const request of Object.values(requests)) {
    assert.ok(request.includes(answers.a));
    assert.ok(request.includes(answers.b));
    assert.ok(!request.includes(content.audienceContent.business.example.a));
  }
  assert.match(requests.work, /보고용 초안/);
  assert.match(requests.work, /수치·담당자·일정은 '확인 필요'/);
  assert.match(requests.business, /가격, 일정, 후기, 효과는 만들지 마/);
  assert.match(requests.preparing, /고객의 최근 경험/);
  assert.match(requests.preparing, /답을 유도하지 말고/);
  assert.match(requests.exploring, /탐색용 가설/);
  assert.match(requests.exploring, /수익이 날 것이라고 판단하지 마/);
});

test('work visitors get a reporting task and criteria without being redirected into business planning', () => {
  const input = {a: '자료 목차는 완료, 신청 안내는 회신 대기, 완료일은 미정', b: '팀장이 진행 상황과 결정할 일을 확인'};
  const request = content.buildRequest('work', input);
  assert.ok(request.includes(input.a)); assert.ok(request.includes(input.b));
  assert.match(request, /계획을 완료한 사실로 바꾸지 마/);
  assert.match(request, /성과, KPI, 마감일, 담당자를 만들지 마/);
  assert.doesNotMatch(request, /사업|상품|창업|고객/);
  const criteria = content.buildCriteria('work', input, 'short');
  assert.equal(criteria.find(item => item.label === '업무와 메모').value, input.a);
  assert.equal(criteria.find(item => item.label === '읽는 사람과 목적').value, input.b);
  assert.match(content.buildRevision('work', 'short'), /완료·대기·다음 행동/);
  assert.match(content.buildRevision('work', 'vague'), /사실과 제안하는 행동을 구분/);
});

test('empty personal input cannot silently turn into an example or request', () => {
  for (const audience of content.audiences) {
    assert.equal(content.buildRequest(audience, {a: ' ', b: '개인 입력'}), '');
    assert.equal(content.buildRequest(audience, {a: '개인 입력', b: '\n'}), '');
    const example = content.audienceContent[audience].example;
    assert.equal(content.requestReady(example), true);
    assert.ok(content.buildRequest(audience, example).includes(example.a));
  }
});

test('revision requests keep the selected task and require a correction for mismatched facts', () => {
  assert.match(content.buildRevision('business', 'short'), /두 문장/);
  assert.match(content.buildRevision('preparing', 'short'), /질문 하나/);
  assert.match(content.buildRevision('exploring', 'short'), /행동 하나와 질문 하나/);
  assert.equal(content.buildRevision('business', 'different', '  '), '');
  assert.match(content.buildRevision('business', 'different', '대상은 성인이 아니라 학부모예요.'), /대상은 성인이 아니라 학부모예요/);
  assert.match(content.buildRevision('business', 'different', '수정 내용'), /확인되지 않은 내용은 추가하지 마/);
  for (const audience of content.audiences) {
    const d = content.audienceContent[audience];
    assert.ok(d.example.before && d.example.revision && d.example.after);
    assert.equal(d.checks.length, 3);
    const criteria = content.buildCriteria(audience, {a: '내 첫 답', b: '내 두 번째 답'}, 'easy');
    assert.ok(criteria.some(item => item.value === '내 첫 답'));
    assert.ok(criteria.some(item => item.value === '내 두 번째 답'));
    assert.ok(criteria.some(item => item.value === '더 쉬운 말로'));
  }
});

test('the reusable criteria preserve a personal correction and follow the demonstrated example', () => {
  const correction = '대상은 선생님이 아니라 아이 사진을 정리하려는 학부모예요.';
  const personal = content.buildCriteria('business', {a: '사진 정리 수업', b: '직접 분류하는 실습'}, 'different', {mode: 'personal', extra: correction});
  assert.equal(personal.find(item => item.label === '결과를 다듬는 기준').value, correction);
  assert.ok(personal.map(item => `${item.label}: ${item.value}`).join('\n').includes(correction), 'copying the complete criteria retains the actual correction');
  const unfinished = content.buildCriteria('business', {a: '사진 정리 수업', b: '직접 분류하는 실습'}, 'different', {mode: 'personal', extra: '  '});
  assert.ok(!unfinished.some(item => item.label === '결과를 다듬는 기준'), 'an unwritten correction is not represented as a finished standard');
  for (const audience of content.audiences) {
    const example = content.audienceContent[audience].example;
    for (const previousRevision of ['easy', 'different']) {
      const criteria = content.buildCriteria(audience, example, previousRevision, {mode: 'example', extra: correction});
      assert.equal(criteria.find(item => item.label === '결과를 다듬는 기준').value, example.revision);
      assert.ok(!criteria.some(item => item.value === correction), 'personal corrections do not leak into the prepared example');
    }
  }
});

test('leaving for a personal AI and returning restores all four draft paths', () => {
  const state = model.initialArrivalState();
  state.step = 3; state.station = 6;
  state.entryStarted = true;
  state.handoff = 'copied';
  state.audience = 'preparing';
  state.answers.work = {a: '업무 메모', b: '읽는 사람과 목적'};
  state.answers.business = {a: '내 상품', b: '내 장점'};
  state.answers.preparing = {a: '준비 중인 서비스', b: '고객에게 궁금한 점'};
  state.answers.exploring = {a: '도와준 경험', b: '그때의 상황'};
  state.extra = '바꾸고 싶은 점';
  state.revision = 'different';
  const restored = model.parseArrivalState(model.serializeArrivalState(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.experience, 'none', 'leaving and reopening never pretends the AI has replied');
});

test('legacy three-route drafts retain their selected route and answers when work is added', () => {
  assert.equal(model.initialArrivalState().audience, 'work');
  assert.equal(content.audiences[0], 'work');
  for (const audience of ['business', 'preparing', 'exploring']) {
    const legacy = {...model.initialArrivalState(), audience, step: 3, handoff: 'copied'};
    delete legacy.answers.work; delete legacy.station; delete legacy.companyRule;
    legacy.answers[audience] = {a: '원래 저장한 첫 답', b: '원래 저장한 두 번째 답'};
    const restored = model.parseArrivalState(JSON.stringify(legacy));
    assert.equal(restored.audience, audience);
    assert.equal(restored.step, 3);
    assert.equal(restored.station, 6);
    assert.equal(restored.handoff, 'copied');
    assert.deepEqual(restored.answers[audience], legacy.answers[audience]);
    assert.deepEqual(restored.answers.work, {a: '', b: ''});
    assert.equal(restored.experience, 'none');
  }
  const work = model.initialArrivalState();
  work.step = 3; work.station = 6;
  work.entryStarted = true;
  work.answers.work = {a: '보고할 메모', b: '팀장에게 진행 상황 공유'};
  assert.deepEqual(model.parseArrivalState(model.serializeArrivalState(work)), work);
});

test('previous handoff and criteria drafts resume in the consolidated flow without losing their content', () => {
  const legacy = {...model.initialArrivalState(), audience: 'preparing', step: 4};
  delete legacy.handoff;
  legacy.answers.preparing = {a: '기존에 입력한 상품', b: '고객에게 궁금한 점'};
  const handoff = model.parseArrivalState(JSON.stringify(legacy));
  assert.equal(handoff.step, 3);
  assert.equal(handoff.handoff, 'ready');
  assert.equal(handoff.experience, 'none');
  assert.deepEqual(handoff.answers.preparing, legacy.answers.preparing);
  const outcome = model.parseArrivalState(JSON.stringify({...legacy, step: 6, experience: 'self-reported'}));
  assert.equal(outcome.step, 5);
  assert.equal(outcome.experience, 'self-reported');
  assert.deepEqual(outcome.answers, handoff.answers);
});

test('copy status persists independently of AI completion and rejects unrecognized statuses', () => {
  const state = {...model.initialArrivalState(), step: 3, handoff: 'copied'};
  const restored = model.parseArrivalState(model.serializeArrivalState(state));
  assert.equal(restored.handoff, 'copied');
  assert.equal(restored.step, 3);
  assert.equal(restored.experience, 'none');
  for (const handoff of ['opened', 'answered', true, null]) {
    const invalid = model.parseArrivalState(JSON.stringify({...state, handoff}));
    assert.equal(invalid.handoff, 'ready');
    assert.equal(invalid.experience, 'none');
  }
});

test('back navigation follows the personal, example and direct-calendar paths', () => {
  const state = model.initialArrivalState();
  for (const [step, expected] of [[0, 0], [8, 7], [1, 8], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 8]]) {
    assert.equal(model.arrivalBackStep({...state, step}), expected);
  }
  assert.equal(model.arrivalBackStep({...state, step: 5, mode: 'example', experience: 'example-viewed'}), 1);
  assert.equal(model.arrivalBackStep({...state, step: 7, audience: 'business', experience: 'self-reported'}), 5);
  assert.equal(model.arrivalBackStep({...state, step: 7, audience: 'business', mode: 'example', experience: 'example-viewed'}), 5);
  assert.equal(model.arrivalBackStep({...state, step: 7, hallReturnStep: 1}), 1);
});

test('the delivered proposal and the exact return step survive reopening the walk', () => {
  const state = {...model.initialArrivalState(), proposalSent: true, station: 7, hallReturnStep: 2};
  state.answers.preparing = {a: '이번에 준비 중인 서비스', b: '고객에게 확인할 점'};
  const walking = model.parseArrivalState(model.serializeArrivalState(state));
  assert.equal(walking.station, 7);
  assert.equal(walking.hallReturnStep, 2);
  const inHall = model.parseArrivalState(model.serializeArrivalState({...walking, step: 7}));
  assert.equal(model.arrivalBackStep(inHall), 2);
  assert.equal(inHall.proposalSent, true);
  assert.deepEqual(inHall.answers.preparing, state.answers.preparing);
  const invalid = model.parseArrivalState(JSON.stringify({...state, proposalSent: 'true', hallReturnStep: 7}));
  assert.equal(invalid.proposalSent, false);
  assert.equal(invalid.hallReturnStep, null);
});

test('the canon demo persists its phase and the retired desks resume on the active corridor', () => {
  assert.deepEqual(model.corridorNext, {1: 2, 2: 3, 3: 4, 4: 7});
  const parse = patch => model.parseArrivalState(JSON.stringify({...model.initialArrivalState(), spyPhase: 'handed-off', ...patch}));
  assert.equal(parse({station: 5, canonPhase: 2}).station, 4);
  assert.equal(parse({station: 5, canonPhase: 2}).canonPhase, 2);
  assert.equal(parse({station: 6}).station, 7);
  assert.equal(parse({station: 6, step: 3}).station, 6);
  assert.equal(parse({station: 4, canonPhase: 5}).canonPhase, 0);
});

test('the audience selection resumes separately from the welcome introduction without losing drafts', () => {
  const state = model.initialArrivalState();
  assert.equal(state.step, 0, 'new visitors start with the welcome introduction');
  state.step = 8; state.station = 6;
  state.entryStarted = true;
  state.audience = 'exploring';
  state.answers.exploring = {a: '동료에게 엑셀 정리를 설명했어요.', b: '엑셀을 처음 쓰는 동료예요.'};
  const restored = model.parseArrivalState(model.serializeArrivalState(state));
  assert.deepEqual(restored, state);
  assert.equal(restored.experience, 'none');
  const oldWelcome = model.parseArrivalState(JSON.stringify({...state, step: 0}));
  assert.equal(oldWelcome.step, 0, 'an older welcome draft remains on the welcome introduction');
  assert.deepEqual(oldWelcome.answers, state.answers);
  for (const step of [9, -1, 8.5, '8']) {
    assert.equal(model.parseArrivalState(JSON.stringify({...state, step})).step, 0);
  }
});

test('example viewing and self-reported AI completion stay separate on restoration', () => {
  const initial = model.initialArrivalState();
  assert.equal(model.parseArrivalState(JSON.stringify({...initial, mode: 'example', experience: 'example-viewed'})).experience, 'example-viewed');
  assert.equal(model.parseArrivalState(JSON.stringify({...initial, mode: 'personal', experience: 'self-reported'})).experience, 'self-reported');
  assert.equal(model.parseArrivalState(JSON.stringify({...initial, mode: 'example', experience: 'self-reported'})).experience, 'none');
  assert.equal(model.parseArrivalState(JSON.stringify({...initial, mode: 'personal', experience: 'example-viewed'})).experience, 'none');
});

test('old, malformed and oversized browser state has a safe fresh start', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{"version":99,"step":7}', 'x'.repeat(16001)]) {
    assert.deepEqual(model.parseArrivalState(raw), model.initialArrivalState());
  }
  const restored = model.parseArrivalState(JSON.stringify({version: 1, step: 999, audience: '__proto__', answers: {business: {a: 123, b: 'b'.repeat(600)}}, experience: 'complete', revision: 'score'}));
  assert.equal(restored.step, 0);
  assert.equal(restored.audience, 'work');
  assert.equal(restored.answers.business.a, '');
  assert.equal(restored.answers.business.b.length, content.ANSWER_LIMIT);
  assert.equal(restored.experience, 'none');
  assert.equal(restored.revision, 'short');
});

// Synthetic fixture, not the announced event time or a user calendar write.
const configured = {...model.liveEvent, startsAt: '2026-12-07T19:00:00+09:00', endsAt: '2026-12-07T20:00:00+09:00', infoUrl: 'https://example.com/live-info'};

test('the confirmed 21:00 start is usable without inventing an end or YouTube destination', () => {
  assert.equal(model.liveEvent.date, '2026-12-07');
  assert.equal(model.liveEvent.startsAt, '2026-12-07T21:00:00+09:00');
  assert.equal(model.calendarReady(model.liveEvent), true);
  const startOnly = model.calendarIcs(model.liveEvent);
  assert.match(startOnly, /DTSTART:20261207T120000Z\r\n/);
  assert.ok(!startOnly.includes('DTEND:'));
  assert.ok(!startOnly.includes('DURATION:'));
  assert.ok(!startOnly.includes('URL:'));
  assert.ok(!startOnly.includes('example.com'));
  const unfolded = startOnly.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('종료 시간은 추후 안내'));
  assert.ok(unfolded.includes('YouTube 참여 링크는 카톡방에서 추가 안내'));
  const google = new URL(model.googleCalendarUrl(model.liveEvent));
  assert.equal(google.searchParams.get('dates'), '20261207T120000Z/20261207T120000Z');
  assert.equal(google.searchParams.has('location'), false);
  assert.equal(model.googleCalendarUrl({...model.liveEvent, startsAt: null}), null);
  assert.equal(model.calendarIcs({...model.liveEvent, startsAt: null}), null);
});

test('calendar draft uses the same Korean event time and stable information URL on both platforms', () => {
  assert.equal(model.calendarReady(configured), true);
  const url = new URL(model.googleCalendarUrl(configured));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261207T100000Z/20261207T110000Z');
  assert.equal(url.searchParams.get('stz'), 'Asia/Seoul');
  assert.equal(url.searchParams.get('etz'), 'Asia/Seoul');
  assert.match(url.searchParams.get('details'), /https:\/\/example.com\/live-info/);
  const ics = model.calendarIcs(configured, new Date('2026-11-17T00:00:00Z'));
  assert.match(ics, /DTSTART:20261207T100000Z\r\n/);
  assert.match(ics, /DTEND:20261207T110000Z\r\n/);
  assert.match(ics, /URL:https:\/\/example.com\/live-info/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(!ics.includes('ATTENDEE:'));
  assert.ok(!ics.includes('METHOD:REQUEST'));
});

test('invalid event times and unsafe destinations cannot produce calendar links', () => {
  const cases = [
    {...configured, endsAt: configured.startsAt},
    {...configured, endsAt: '2026-12-07T18:00:00+09:00'},
    {...configured, startsAt: '2026-12-07T19:00:00'},
    {...configured, startsAt: 'invalid'},
    {...configured, date: '2026-12-08'},
    {...configured, infoUrl: 'javascript:alert(1)'},
    {...configured, infoUrl: 'http://example.com'},
    {...configured, infoUrl: 'https://username:password@example.com'},
    {...configured, id: 'event\r\nATTENDEE:mailto:someone@example.com'},
  ];
  for (const event of cases) {
    assert.equal(model.googleCalendarUrl(event), null);
    assert.equal(model.calendarIcs(event), null);
  }
});

test('calendar text cannot inject another event and Korean lines fold by UTF-8 bytes', () => {
  const event = {...configured, title: '문샷; 함께, 시작\\해요', description: '가나다라마바사'.repeat(30) + '\r\nEND:VEVENT\r\nBEGIN:VEVENT\n다음 줄;쉼표,역슬래시\\'};
  const ics = model.calendarIcs(event, new Date('2026-11-17T00:00:00Z'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.equal(ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(ics.split('\r\n').filter(line => line === 'END:VEVENT').length, 1);
  assert.ok(unfolded.includes('SUMMARY:문샷\\; 함께\\, 시작\\\\해요'));
  assert.ok(unfolded.includes('\\nEND:VEVENT\\nBEGIN:VEVENT\\n다음 줄\\;쉼표\\,역슬래시\\\\'));
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, 'every physical line respects the 75-octet limit');
    assert.ok(!line.includes('\ufffd'), 'folding never splits a Korean character');
  }
});

test('a stable URL retains URI punctuation instead of applying TEXT-only escapes', () => {
  const url = 'https://example.com/live;guide?source=campus,calendar';
  const ics = model.calendarIcs({...configured, infoUrl: url}).replace(/\r\n /g, '');
  assert.ok(ics.includes(`URL:${url}\r\n`));
});

test('a personal request reuses only the exact, explicitly selected company rule', () => {
  const state = {...model.initialArrivalState(), audience: 'business', companyRule: 0, step: 2};
  const rule = '먼저 실제 결과를 보여준다.';
  assert.equal(model.personalRequestRule(state, rule), '');
  const optedIn = model.parseArrivalState(model.serializeArrivalState({...state, consentedCompanyRule: rule}));
  assert.equal(model.personalRequestRule(optedIn, rule), rule);
  for (const other of [{...optedIn, audience: 'work'}, {...optedIn, mode: 'example'}, {...optedIn, companyRule: null}]) {
    assert.equal(model.personalRequestRule(other, rule), '');
  }
  assert.equal(model.personalRequestRule(optedIn, '나중에 편집한 기준'), '');
  assert.equal(model.parseArrivalState(JSON.stringify({...state, consentedCompanyRule: true})).consentedCompanyRule, '');
  const request = '내 자료로 소개글을 써줘.';
  assert.equal(model.addPersonalRequestRule(request, ''), request);
  assert.equal(model.addPersonalRequestRule('', rule), '');
  const withRule = model.addPersonalRequestRule(request, rule);
  assert.ok(withRule.startsWith(request));
  assert.equal(withRule.split(rule).length - 1, 1);
  assert.equal(model.addPersonalRequestRule(withRule, rule), withRule);
});

test('case revisions follow the displayed review copy while cosmetic edits preserve an approval', () => {
  const demo = office.DEFAULT_OFFICE_DEMO;
  const revision = officeCase.officeCaseRevision(demo);
  const displayed = officeCase.officeCaseContent(demo);
  assert.equal(officeCase.officeCaseRevision(displayed), revision, 'effective legacy defaults and their displayed replacement are the same case');
  for (const field of ['greeting', 'deskLabel', 'teamNote']) {
    assert.equal(officeCase.officeCaseRevision({...demo, [field]: '주변 안내만 바꿈'}), revision);
  }
  for (const field of ['brief', 'material', 'draft']) {
    assert.notEqual(officeCase.officeCaseRevision({...demo, [field]: '검토할 본문을 바꿈'}), revision);
  }
  for (const field of ['feedback', 'revised', 'rule', 'approvedAnswer']) {
    const edited = structuredClone(demo);
    edited.choices[1][field] = '두 번째 선택의 내용을 바꿈';
    assert.notEqual(officeCase.officeCaseRevision(edited), revision);
  }
  const approved = {...model.initialArrivalState(), deskReviewRevision: revision, deskReview: {phase: 'approved', choice: 1}};
  assert.strictEqual(model.reconcileArrivalOfficeCase(approved, revision), approved);
  assert.deepEqual(model.parseArrivalState(model.serializeArrivalState(approved)), {...approved, station: 1});
});

test('an edited case resets its old review and selected rule while preserving the corridor stop and personal drafts', () => {
  const before = officeCase.officeCaseRevision(office.DEFAULT_OFFICE_DEMO);
  const after = officeCase.officeCaseRevision({...office.DEFAULT_OFFICE_DEMO, draft: '관리자가 바꾼 새 초안'});
  for (const station of [4, 5]) {
    const state = {...model.initialArrivalState(), station, spyPhase: 'handed-off', visitorAvatar: 'male-d', proposalSent: true,
      deskReviewRevision: before, deskReview: {phase: 'approved', choice: 1}, companyRule: 1};
    state.answers.business = {a: '내 상품 설명', b: '내가 직접 쓴 장점'};
    state.workTrial.role = '내가 만든 개인 AI 직원';
    state.workTrial.firstTask = '내 첫 업무 메모';
    const changed = model.reconcileArrivalOfficeCase(model.parseArrivalState(model.serializeArrivalState(state)), after);
    assert.equal(changed.station, 4);
    assert.deepEqual(changed.deskReview, {phase: 'draft', choice: 0});
    assert.equal(changed.companyRule, null);
    assert.equal(changed.deskReviewRevision, after);
    assert.equal(changed.visitorAvatar, state.visitorAvatar);
    assert.equal(changed.proposalSent, true, 'the separate support exercise stays completed');
    assert.deepEqual(changed.answers, state.answers);
    assert.deepEqual(changed.workTrial, state.workTrial);
    assert.deepEqual(model.parseArrivalState(model.serializeArrivalState(changed)), changed);
  }
});

test('legacy case approvals enter the new example at the spy desk while preserving later personal work', () => {
  const revision = officeCase.officeCaseRevision(office.DEFAULT_OFFICE_DEMO);
  for (const [step, station] of [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [3, 6], [5, 6], [7, 7]]) {
    const legacy = {...model.initialArrivalState(), step, station, audience: 'business', handoff: 'copied',
      experience: 'self-reported', deskReview: {phase: 'approved', choice: 1}, companyRule: 1};
    delete legacy.deskReviewRevision;
    delete legacy.spyPhase;
    legacy.answers.business = {a: '원래 상품', b: '원래 장점'};
    const changed = model.reconcileArrivalOfficeCase(model.parseArrivalState(JSON.stringify(legacy)), revision);
    assert.equal(changed.step, step);
    assert.equal(changed.station, step === 0 && station >= 3 && station <= 5 ? 2 : step === 0 && station === 6 ? 7 : station);
    assert.equal(changed.handoff, 'copied');
    assert.equal(changed.experience, 'self-reported');
    assert.deepEqual(changed.answers.business, legacy.answers.business);
    assert.deepEqual(changed.deskReview, {phase: 'draft', choice: 0});
    assert.strictEqual(model.reconcileArrivalOfficeCase(changed, revision), changed, 'the migration happens only once');
  }
});

test('the competitor spy restores exactly one valid conversation phase alongside the corridor stop', () => {
  const base = {...model.initialArrivalState(), station: 2};
  for (const spyPhase of ['intro', 'reviews', 'guide', 'handed-off']) {
    const restored = model.parseArrivalState(model.serializeArrivalState({...base, spyPhase}));
    assert.equal(restored.spyPhase, spyPhase);
    assert.equal(restored.station, 2);
  }
  for (const spyPhase of [undefined, null, 'invalid', 2, ['guide']]) {
    assert.equal(model.parseArrivalState(JSON.stringify({...base, spyPhase})).spyPhase, 'intro');
  }
});

test('removing a selected case rule rechecks only the personal prompt that used it', () => {
  const revision = officeCase.officeCaseRevision(office.DEFAULT_OFFICE_DEMO);
  const before = {...model.initialArrivalState(), step: 3, station: 6, audience: 'business', companyRule: 0,
    consentedCompanyRule: '직원이 완성한 결과물을 먼저 보여준다.', handoff: 'copied', experience: 'self-reported'};
  before.answers.business = {a: '내 상품', b: '내 장점'};
  const changed = model.reconcileArrivalOfficeCase(before, revision);
  assert.equal(changed.companyRule, null);
  assert.equal(changed.consentedCompanyRule, '');
  assert.equal(changed.handoff, 'ready');
  assert.equal(changed.experience, 'none');
  assert.equal(changed.step, 3);
  assert.deepEqual(changed.answers, before.answers);
  for (const unrelated of [{...before, audience: 'work'}, {...before, mode: 'example', experience: 'example-viewed'}]) {
    const next = model.reconcileArrivalOfficeCase(unrelated, revision);
    assert.equal(next.handoff, unrelated.handoff);
    assert.equal(next.experience, unrelated.experience);
  }
  for (const invalid of [42, 'unrecognized', 'office-case-v1-' + 'a'.repeat(100)]) {
    assert.equal(model.parseArrivalState(JSON.stringify({...before, deskReviewRevision: invalid})).deskReviewRevision, '');
  }
});
