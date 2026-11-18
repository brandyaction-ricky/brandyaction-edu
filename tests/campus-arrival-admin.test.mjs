import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

async function bundle(path) {
  const result = await build({entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false});
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {DEFAULT_ARRIVAL} = await bundle('features/campus/arrival/config.ts');
const {DEFAULT_WELCOME, validateWelcome, visibleWelcome} = await bundle('features/campus/welcome/content.ts');
const {validateWebinar, projectWebinar} = await bundle('features/campus/webinar/domain.ts');
const event = {
  slug: 'arrival-admin-test', title: '체험 관리자 검수', description: '', status: 'draft',
  startsAt: '2026-11-17T12:00:00Z', endsAt: '2026-11-17T13:00:00Z',
  cohortId: '00000000-0000-4000-8000-000000000001',
  detailPath: '/classes/test', kakaoUrl: '', youtubeId: '',
  revision: '00000000-0000-4000-8000-000000000002',
};

test('older webinar settings stay valid without adding recruitment defaults on read', () => {
  const old = validateWebinar({...event, welcome: DEFAULT_WELCOME});
  assert.equal(Object.hasOwn(old, 'arrival'), false);
  assert.equal(Object.hasOwn(validateWelcome(DEFAULT_WELCOME), 'arrival'), false);
});

test('webinar save validation preserves edited recruitment settings and existing purchased welcome content independently', () => {
  const arrival = structuredClone(DEFAULT_ARRIVAL);
  arrival.title = '운영자가 수정한 첫 안내';
  arrival.officeDemo.greeting = '새 광고의 첫 문장을 함께 골라주세요.';
  arrival.officeDemo.choices[1].rule = '회의 중 결정된 내용부터 소개한다.';
  arrival.audiences.preparing.example.after = '운영자가 수정한 창업 질문 세 개';
  arrival.endsAt = null;
  const input = {...event, welcome: DEFAULT_WELCOME, arrival};
  const saved = validateWebinar(JSON.parse(JSON.stringify(input)));
  assert.equal(saved.arrival.title, arrival.title);
  assert.deepEqual(saved.arrival.officeDemo, arrival.officeDemo);
  assert.equal(saved.arrival.audiences.preparing.example.after, arrival.audiences.preparing.example.after);
  assert.equal(saved.arrival.endsAt, null);
  assert.equal(Date.parse(saved.endsAt), Date.parse(event.endsAt));
  assert.deepEqual(saved.welcome, validateWelcome(DEFAULT_WELCOME));
});

test('previously saved recruitment welcome adds the office demo without mutating campaign edits', () => {
  const arrival = structuredClone(DEFAULT_ARRIVAL);
  delete arrival.officeDemo;
  arrival.liveTitle = '기존 행사에서 직접 붙인 라이브 제목';
  const saved = validateWebinar({...event, arrival});
  assert.deepEqual(saved.arrival.officeDemo, DEFAULT_ARRIVAL.officeDemo);
  assert.equal(saved.arrival.liveTitle, arrival.liveTitle);
  assert.equal(Object.hasOwn(arrival, 'officeDemo'), false);
  for (const officeDemo of [null, {}, {...DEFAULT_ARRIVAL.officeDemo, choices: []}]) {
    assert.throws(() => validateWebinar({...event, arrival: {...arrival, officeDemo}}), {status: 400});
  }
});

test('saving recruitment content does not publish it through the existing public webinar projection', () => {
  const saved = validateWebinar({...event, status: 'published', welcome: DEFAULT_WELCOME, arrival: DEFAULT_ARRIVAL});
  const projected = projectWebinar(saved);
  assert.equal(projected.welcome, undefined);
  assert.equal(projected.arrival, undefined);
  assert.equal(JSON.stringify(projected).includes(DEFAULT_ARRIVAL.audiences.business.requestTemplate), false);
});

test('ordinary enrolled welcome projection never receives recruitment content from the separate event field', () => {
  const saved = validateWebinar({...event, welcome: DEFAULT_WELCOME, arrival: DEFAULT_ARRIVAL});
  const member = visibleWelcome(saved.welcome);
  assert.equal(Object.hasOwn(member, 'arrival'), false);
  assert.deepEqual(member.lessons, DEFAULT_WELCOME.lessons);
  assert.equal(saved.arrival.title, DEFAULT_ARRIVAL.title);
});

test('existing webinar save boundary rejects invalid nested recruitment content', () => {
  const bad = structuredClone(DEFAULT_ARRIVAL);
  bad.audiences.business.requestTemplate = '고객 정보를 자동으로 넣어 주세요.';
  assert.throws(() => validateWebinar({...event, arrival: bad}), {status: 400});
  assert.throws(() => validateWebinar({...event, arrival: null}), {status: 400});
  assert.throws(() => validateWelcome({...DEFAULT_WELCOME, arrival: DEFAULT_ARRIVAL}), {status: 400});
});

test('adding recruitment settings to an event without member welcome does not create member content', () => {
  const saved = validateWebinar({...event, arrival: DEFAULT_ARRIVAL});
  assert.equal(Object.hasOwn(saved, 'welcome'), false);
  assert.equal(saved.arrival.title, DEFAULT_ARRIVAL.title);
});

test('a newer recruitment-only event cannot replace the same cohorts existing member welcome', async () => {
  const memberWelcome = {...DEFAULT_WELCOME, title: '기존 기수의 구매자 안내', lessons: DEFAULT_WELCOME.lessons.slice(0, 3)};
  const existing = validateWebinar({...event, slug: 'original-member-welcome', welcome: memberWelcome});
  const newer = validateWebinar({...event, slug: 'new-recruitment-only', arrival: DEFAULT_ARRIVAL});
  const result = await build({entryPoints: ['features/campus/welcome/server.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{name: 'member-welcome-regression', setup(builder) {
      builder.onResolve({filter: /^next\/cache$/}, () => ({path: 'cache', namespace: 'fixture'}));
      builder.onResolve({filter: /^@\/lib\/supabase\/admin$/}, () => ({path: 'db', namespace: 'fixture'}));
      builder.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({loader: 'js', contents: args.path === 'cache'
        ? 'export const unstable_cache = fn => fn;'
        : 'export const createAdminClient = () => globalThis.__arrivalMemberWelcomeDb;'}));
    }}],
  });
  const query = {select() {return this;}, like() {return this;}, eq() {return this;}, order() {return this;}, limit() {return this;},
    abortSignal() {return Promise.resolve({data: [{value: newer}, {value: existing}], error: null});}};
  globalThis.__arrivalMemberWelcomeDb = {from: () => query};
  try {
    const {readWelcome} = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
    const member = await readWelcome(event.cohortId);
    assert.equal(member.settings.title, memberWelcome.title);
    assert.equal(member.settings.lessons.length, 3);
    assert.equal(Object.hasOwn(member.settings, 'arrival'), false);
  } finally {delete globalThis.__arrivalMemberWelcomeDb;}
});
