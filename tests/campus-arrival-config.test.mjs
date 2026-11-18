import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function moduleFrom(relative) {
  const compiled = await build({entryPoints: [fileURLToPath(new URL(relative, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false});
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
}
const config = await moduleFrom('../features/campus/arrival/config.ts');
const content = await moduleFrom('../features/campus/arrival/content.ts');
const model = await moduleFrom('../features/campus/arrival/model.ts');
const draft = () => structuredClone(config.DEFAULT_ARRIVAL);
const rejects = (value) => assert.throws(() => config.validateArrivalConfig(value), error => error instanceof Error && error.status === 400 && Boolean(error.message));

test('editable defaults preserve the examples and all four working requests', () => {
  const validated = config.validateArrivalConfig(config.DEFAULT_ARRIVAL);
  assert.deepEqual(validated, config.DEFAULT_ARRIVAL);
  assert.notEqual(validated.audiences.business.example, config.DEFAULT_ARRIVAL.audiences.business.example);
  assert.equal(validated.instructorName, '퇴사선배 윤익 · 브랜디액션 팀');
  assert.equal(validated.startsAt, '2026-12-07T21:00:00+09:00');
  assert.equal(validated.endsAt, null);
  assert.equal(validated.videoUrl, '');
  assert.equal(validated.liveUrl, '');
  for (const id of content.audiences) {
    assert.deepEqual(validated.audiences[id].example, content.audienceContent[id].example);
    assert.equal(config.buildManagedRequest(validated, id, {a: '내 첫 답변', b: '내 두 번째 답변'}), content.buildRequest(id, {a: '내 첫 답변', b: '내 두 번째 답변'}));
  }
});

test('legacy settings add work and shared welcome benefits without replacing administrator edits', () => {
  const legacy = draft();
  delete legacy.audiences.work;
  delete legacy.welcomeBenefits;
  legacy.title = '운영자가 수정한 첫 제목';
  legacy.audiences.business.goal = '기존 사업 체험 제목';
  legacy.audiences.preparing.example.before = '기존 창업 준비 예시';
  legacy.audiences.exploring.requestTemplate = '{{answer1}}에서 {{answer2}}를 확인하기';
  const before = structuredClone(legacy);
  const normalized = config.validateArrivalConfig(legacy);
  assert.equal(normalized.title, legacy.title);
  for (const audience of ['business', 'preparing', 'exploring']) assert.deepEqual(normalized.audiences[audience], legacy.audiences[audience]);
  assert.deepEqual(normalized.audiences.work, config.DEFAULT_ARRIVAL.audiences.work);
  assert.deepEqual(normalized.welcomeBenefits, config.DEFAULT_ARRIVAL.welcomeBenefits);
  assert.notEqual(normalized.welcomeBenefits, config.DEFAULT_ARRIVAL.welcomeBenefits);
  assert.deepEqual(legacy, before, 'reading older settings does not mutate saved content');
  assert.deepEqual(config.validateArrivalConfig(JSON.parse(JSON.stringify(normalized))), normalized);
});

test('explicit work content and three shared welcome benefits are validated and retain edits', () => {
  const edited = draft();
  edited.audiences.work.label = '팀 업무 초안 만들기';
  edited.audiences.work.requestTemplate = '업무: {{answer1}}\n목적: {{answer2}}\n보고 초안을 작성해줘.';
  edited.welcomeBenefits = ['업무 초안 만들기', '아이디어 정리하기', '내 기준으로 다듬기'];
  const parsed = config.validateArrivalConfig(edited);
  assert.deepEqual(parsed, edited);
  assert.equal(config.buildManagedRequest(parsed, 'work', {a: '내 메모', b: '팀 공유'}), '업무: 내 메모\n목적: 팀 공유\n보고 초안을 작성해줘.');
  for (const work of [null, undefined, {}, [], {...edited.audiences.work, extra: true}]) {
    const invalid = draft(); invalid.audiences.work = work; rejects(invalid);
  }
  for (const welcomeBenefits of [null, undefined, [], ['하나'], ['하나', '둘'], ['하나', '둘', '셋', '넷'], ['하나', '둘', ' '], ['하나', '둘', 3], ['하나', '둘', '가'.repeat(161)]]) {
    const invalid = draft(); invalid.welcomeBenefits = welcomeBenefits; rejects(invalid);
  }
});

test('administrator edits survive validation without changing another audience', () => {
  const value = draft();
  Object.assign(value, {title: '다음 모집 체험', description: '소개 수정', instructorName: '강사 표시 이름', instructorIntro: '강사와 팀을 소개합니다.', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk', liveTitle: '새 라이브 제목', startsAt: '2027-01-03T19:30:00+09:00', endsAt: '2027-01-03T20:30:00+09:00', liveUrl: 'https://www.youtube.com/live/abcdefghijk'});
  Object.assign(value.audiences.preparing, {label: '내 아이디어 확인하기', goal: '고객 질문 한 개', q1: '무엇을 준비하나요?', q2: '무엇을 확인하나요?', hint1: '첫 도움말', hint2: '', example: {a: '상품 예시', b: '고객 질문', before: '첫 결과 예시', after: '수정 결과 예시', revision: '한 문장으로 줄여줘.'}, requestTemplate: '상품: {{answer1}}\n확인할 점: {{answer2}}\n질문 한 개로 작성해줘.'});
  const parsed = config.validateArrivalConfig(value);
  assert.deepEqual(parsed, value);
  assert.deepEqual(parsed.audiences.business, config.DEFAULT_ARRIVAL.audiences.business);
  assert.deepEqual(parsed.audiences.exploring, config.DEFAULT_ARRIVAL.audiences.exploring);
  assert.equal(config.buildManagedRequest(parsed, 'preparing', {a: '나의 상품', b: '궁금한 점'}), '상품: 나의 상품\n확인할 점: 궁금한 점\n질문 한 개로 작성해줘.');
});

test('strict fields prevent unsupported settings at every nesting level', () => {
  for (const invalid of [null, [], 'config', {...draft(), version: 2}, {...draft(), extra: true}]) rejects(invalid);
  const missing = draft(); delete missing.instructorName; rejects(missing);
  const unknownAudience = draft(); unknownAudience.audiences.admin = unknownAudience.audiences.business; rejects(unknownAudience);
  const missingAudience = draft(); delete missingAudience.audiences.exploring; rejects(missingAudience);
  const unknownField = draft(); unknownField.audiences.business.adminOnly = true; rejects(unknownField);
  const unknownExample = draft(); unknownExample.audiences.business.example.html = '<script>no</script>'; rejects(unknownExample);
  const missingAnswer = draft(); delete missingAnswer.audiences.business.example.b; rejects(missingAnswer);
  const wrongType = draft(); wrongType.audiences.business.example.a = 123; rejects(wrongType);
});

test('text trims and normalizes line endings but rejects overflow instead of truncating edits', () => {
  const value = draft();
  value.title = '  첫 줄\r\n두 번째 줄  ';
  value.audiences.business.example.before = '  첫 결과\r\n다음 줄\r마지막 줄  ';
  value.audiences.business.hint1 = '  ';
  const parsed = config.validateArrivalConfig(value);
  assert.equal(parsed.title, '첫 줄\n두 번째 줄');
  assert.equal(parsed.audiences.business.example.before, '첫 결과\n다음 줄\n마지막 줄');
  assert.equal(parsed.audiences.business.hint1, '');
  assert.equal(value.title, '  첫 줄\r\n두 번째 줄  ', 'validation does not mutate the editor draft');
  const atLimit = draft(); atLimit.title = '가'.repeat(config.ARRIVAL_CONFIG_LIMITS.title); config.validateArrivalConfig(atLimit);
  atLimit.title += '나'; rejects(atLimit);
  const longExample = draft(); longExample.audiences.business.example.a = '가'.repeat(content.ANSWER_LIMIT + 1); rejects(longExample);
  const blank = draft(); blank.description = ' \n '; rejects(blank);
  const controls = draft(); controls.instructorIntro = '소개\u0000문'; rejects(controls);
});

test('templates require both exact placeholders and reject unknown or incomplete ones', () => {
  for (const requestTemplate of ['{{answer1}}만 있어요.', '{{answer2}}만 있어요.', '{{answer1}} {{answer2}} {{name}}', '{{ answer1 }} {{answer2}}', '{{answer1}} {{answer2}} {{', '{{answer1}} {{answer2}} }}', ' ']) {
    const value = draft(); value.audiences.business.requestTemplate = requestTemplate; rejects(value);
  }
  const repeated = draft();
  repeated.audiences.business.requestTemplate = '{{answer1}}\n{{answer2}}\n{{answer1}}';
  const parsed = config.validateArrivalConfig(repeated);
  assert.equal(config.buildManagedRequest(parsed, 'business', {a: '첫 답에 {{answer2}}와 $&가 있어요.', b: '둘째 답에 {{answer1}}가 있어요.'}), '첫 답에 {{answer2}}와 $&가 있어요.\n둘째 답에 {{answer1}}가 있어요.\n첫 답에 {{answer2}}와 $&가 있어요.');
  assert.equal(config.buildManagedRequest(parsed, 'business', {a: '', b: '둘째 답'}), '');
  assert.equal(config.buildManagedRequest(parsed, 'business', {a: '첫 답', b: '   '}), '');
});

test('intro video accepts existing YouTube video formats and rejects channels or other websites', () => {
  for (const videoUrl of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://youtube.com/shorts/abcdefghijk', 'https://m.youtube.com/live/abcdefghijk']) {
    const value = draft(); value.videoUrl = videoUrl; assert.equal(config.validateArrivalConfig(value).videoUrl, videoUrl);
  }
  for (const videoUrl of ['https://example.com/video', 'https://www.youtube.com/@teacher', 'https://www.youtube.com/watch?v=short', 'https://youtube.com.evil.example/watch?v=abcdefghijk']) {
    const value = draft(); value.videoUrl = videoUrl; rejects(value);
  }
});

test('public links exclude credentials, local hosts, IPs and credential-bearing query or fragments', () => {
  for (const liveUrl of ['javascript:alert(1)', 'http://example.com/live', 'https://name:password@example.com/live', 'https://example.com:8443/live', 'https://localhost/live', 'https://127.0.0.1/live', 'https://0x7f000001/live', 'https://[::1]/live', 'https://server.local/live', 'https://host.internal/live', 'https://host.localhost/live', 'https://host.test/live', 'https://example.com/live?access_token=private', 'https://example.com/live?apiKey=private', 'https://example.com/live?X-Amz-Signature=private', 'https://example.com/live#access_token=private']) {
    const value = draft(); value.liveUrl = liveUrl; rejects(value);
  }
  const valid = draft(); valid.liveUrl = '  https://example.com/live?source=campus#schedule  ';
  assert.equal(config.validateArrivalConfig(valid).liveUrl, 'https://example.com/live?source=campus#schedule');
});

test('timestamps require a real date and explicit timezone while an unknown end remains allowed', () => {
  for (const startsAt of ['2026-12-07T21:00', '2026-02-30T21:00:00+09:00', '2026-13-07T21:00:00+09:00', '2026-12-00T21:00:00+09:00', '2026-12-07T24:00:00+09:00', '2026-12-07T21:60:00+09:00', '2026-12-07T21:00:60+09:00', '2026-12-07T21:00:00+14:30', 'bad', null]) {
    const value = draft(); value.startsAt = startsAt; rejects(value);
  }
  for (const endsAt of ['', '2026-12-07T21:00:00+09:00', '2026-12-07T20:59:00+09:00']) {
    const value = draft(); value.endsAt = endsAt; rejects(value);
  }
  const leap = draft(); leap.startsAt = '2028-02-29T21:00:00+09:00';
  assert.equal(config.validateArrivalConfig(leap).endsAt, null);
});

test('datetime-local editor ISO output survives save and produces the same Google and iPhone schedule', () => {
  // ArrivalEditor converts a Korean datetime-local value with Date.toISOString().
  const startInput = '2026-12-09T21:30', endInput = '2026-12-09T22:45';
  const startsAt = new Date(startInput + ':00+09:00').toISOString();
  const endsAt = new Date(endInput + ':00+09:00').toISOString();
  assert.equal(startsAt, '2026-12-09T12:30:00.000Z');
  assert.equal(endsAt, '2026-12-09T13:45:00.000Z');
  const saved = config.validateArrivalConfig({...draft(), startsAt, endsAt});
  assert.equal(saved.startsAt, startsAt, 'editor serialization is preserved in saved settings');
  assert.equal(saved.endsAt, endsAt);
  const restored = config.validateArrivalConfig(JSON.parse(JSON.stringify(saved)));
  const koreanInput = value => new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
  assert.equal(koreanInput(restored.startsAt), startInput);
  assert.equal(koreanInput(restored.endsAt), endInput);
  const event = config.arrivalLiveEvent(restored);
  assert.equal(event.date, '2026-12-09');
  assert.equal(model.calendarReady(event), true);
  const google = new URL(model.googleCalendarUrl(event));
  assert.equal(google.searchParams.get('dates'), '20261209T123000Z/20261209T134500Z');
  const ics = model.calendarIcs(event);
  assert.match(ics, /DTSTART:20261209T123000Z\r\n/);
  assert.match(ics, /DTEND:20261209T134500Z\r\n/);
  const startOnly = config.arrivalLiveEvent(config.validateArrivalConfig({...saved, endsAt: null}));
  assert.equal(startOnly.endsAt, null);
  assert.equal(model.calendarReady(startOnly), true);
  assert.ok(!model.calendarIcs(startOnly).includes('DTEND:'));
});

test('calendar uses edited Korean date and time, stable campaign UID and no made-up duration', () => {
  const current = config.arrivalLiveEvent(config.validateArrivalConfig(draft()));
  assert.equal(current.date, '2026-12-07');
  assert.equal(current.startsAt, '2026-12-07T21:00:00+09:00');
  assert.equal(current.endsAt, null);
  assert.equal(current.infoUrl, null);
  assert.ok(!model.calendarIcs(current).includes('DTEND:'));
  assert.ok(!model.calendarIcs(current).includes('URL:'));
  const changed = draft();
  changed.startsAt = '2027-01-03T16:30:00Z';
  changed.liveTitle = '새 일정 제목';
  changed.liveUrl = 'https://example.com/live';
  const edited = config.arrivalLiveEvent(config.validateArrivalConfig(changed));
  assert.equal(edited.date, '2027-01-04', 'calendar date follows Korea even when the editor supplies UTC');
  assert.equal(edited.id, current.id, 'editing the campaign schedule does not invent a second event identity');
  assert.equal(edited.title, '새 일정 제목');
  assert.equal(edited.infoUrl, 'https://example.com/live');
  assert.ok(!edited.description.includes('12월 7일'));
  assert.ok(edited.description.includes('1월 4일'));
  assert.equal(model.calendarReady(edited), true);
  const google = new URL(model.googleCalendarUrl(edited));
  assert.equal(google.searchParams.get('dates'), '20270103T163000Z/20270103T163000Z');
  assert.equal(google.searchParams.get('location'), 'https://example.com/live');
});

test('the optional live hall handout requires a complete public link and survives admin serialization', () => {
  const saved = config.validateArrivalConfig({...draft(), handoutLabel: '  직원 실습 자료  ', handoutUrl: 'https://example.com/guide'});
  assert.equal(saved.handoutLabel, '직원 실습 자료');
  assert.equal(saved.handoutUrl, 'https://example.com/guide');
  assert.deepEqual(config.validateArrivalConfig(JSON.parse(JSON.stringify(saved))), saved);
  const cleared = config.validateArrivalConfig({...saved, handoutLabel: '', handoutUrl: ''});
  assert.deepEqual(cleared, config.validateArrivalConfig(draft()));
  for (const fields of [
    {handoutLabel: '자료'}, {handoutUrl: 'https://example.com/guide'},
    {handoutLabel: '자료', handoutUrl: 'http://example.com/'},
    {handoutLabel: '자료', handoutUrl: 'https://example.com/guide?access_token=example'},
    {handoutLabel: '자료', handoutUrl: null},
  ]) rejects({...draft(), ...fields});
});
