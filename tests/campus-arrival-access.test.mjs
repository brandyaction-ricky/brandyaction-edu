import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as previewGate from '../features/campus/arrival/preview-gate.ts';
import ts from 'typescript';

const pageSource = await readFile('app/experience/moonshot/page.tsx', 'utf8');
const calendarSource = await readFile('app/experience/moonshot/live.ics/route.ts', 'utf8');
const compileOptions = {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX};
const defaultArrival = {title: '기본 체험', liveTitle: '문샷 무료 라이브', startsAt: '2026-12-07T12:00:00.000Z', endsAt: null, liveUrl: ''};

function loadModule(source, mocks, env) {
  const exports = {};
  const compiled = ts.transpileModule(source, {compilerOptions: compileOptions}).outputText;
  new Function('exports', 'require', 'process', compiled)(exports, name => {
    assert.ok(name in mocks, name);
    return mocks[name];
  }, {env});
  return exports;
}

function fixture(env = {}) {
  let allowed = false;
  let reads = 0;
  let authReads = 0;
  let publicReads = 0;
  let arrival = {...defaultArrival, title: '관리자 모집 초안', liveTitle: '아직 편집 중인 라이브'};
  let published = null;
  const jsx = (type, props) => ({type, props});
  const mocks = {
    '@/features/campus/arrival/preview-gate': previewGate,
    'react/jsx-runtime': {jsx, jsxs: jsx}, 'next/link': {default: 'link'},
    'next/navigation': {notFound: () => {throw Error('404');}},
    '@/features/campus/arrival/config': {
      DEFAULT_ARRIVAL: defaultArrival,
      arrivalLiveEvent: config => ({id: 'moonshot-test', title: config.liveTitle}),
    },
    '@/features/campus/arrival/experience': {ArrivalExperience: 'arrival'},
    '@/features/campus/arrival/model': {
      calendarIcs: event => `SUMMARY:${event.title}`,
    },
    '@/features/campus/arrival/live-reminder-server': {
      arrivalLiveReminderEnabled: () => env.reminder === true,
      arrivalLiveReminderOpen: () => true,
    },
    '@/features/campus/arrival/publication-server': {readPublishedArrival: async () => {publicReads++; return published;}},
    '@/lib/operator-permissions': {
      getOperatorUser: async scope => {assert.equal(scope, 'marketing'); authReads++; return allowed ? {id: 'operator'} : null;},
    },
    '@/features/campus/webinar/server': {
      readWebinar: async () => {
        reads++;
        return {arrival, revision: '00000000-0000-4000-8000-000000000001', welcome: {notices: [{body: '구매자 전용 공지'}]}};
      },
    },
    '@/features/campus/webinar/domain': {slugPattern: /^[a-z0-9][a-z0-9-]{2,59}$/, uuid: value => /^[a-f0-9-]{36}$/.test(value)},
  };
  const page = loadModule(pageSource, mocks, env);
  const calendar = loadModule(calendarSource, mocks, env);
  return {
    render: query => page.default({searchParams: Promise.resolve(query)}),
    calendar: () => calendar.GET(),
    allow: () => {allowed = true;},
    reads: () => reads,
    publicReads: () => publicReads,
    authReads: () => authReads,
    draft: () => arrival,
    saveDraft: next => {arrival = next;},
    publishDraft: () => {published = {config: structuredClone(arrival)};},
  };
}

test('production never reads drafts or publications for the experience or calendar', async () => {
  for (const env of [{VERCEL_ENV: 'production'}, {NEXT_PUBLIC_APP_ENV: 'production'}]) {
    const f = fixture(env);
    f.allow();
    for (const query of [{}, {event: 'test-event'}]) await assert.rejects(f.render(query), /404/);
    assert.equal((await f.calendar()).status, 404);
    assert.equal(f.reads(), 0);
    assert.equal(f.publicReads(), 0);
    assert.equal(f.authReads(), 0);
  }
});

test('anonymous preset never reads member settings and saved draft requires marketing access first', async () => {
  const f = fixture({reminder: true});
  const publicPage = await f.render({});
  assert.equal(publicPage.type, 'arrival');
  assert.equal(f.reads(), 0);
  assert.equal(f.authReads(), 0);
  assert.equal(publicPage.props.liveReminderEnabled, true);
  assert.notEqual((await f.render({event: 'test-event'})).type, 'arrival');
  assert.equal(f.reads(), 0);
  f.allow();
  const result = await f.render({event: 'test-event'});
  assert.equal(result.type, 'arrival');
  assert.equal(result.props.config, f.draft());
  assert.equal(result.props.persistenceKey, null);
  assert.equal(result.props.preview, true);
  assert.equal(result.props.liveReminderEnabled, undefined);
  assert.equal(JSON.stringify(result).includes('구매자 전용 공지'), false);
  assert.equal(f.reads(), 1);
  assert.equal(f.publicReads(), 1);
});

test('fixed DEV visitor and calendar use the same published snapshot through later draft edits', async () => {
  const f = fixture({VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development'});
  const assertPublic = async (config) => {
    const page = await f.render({});
    assert.deepEqual(page.props.config, config);
    const calendar = await f.calendar();
    assert.equal(calendar.status, 200);
    assert.equal(calendar.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(await calendar.text(), `SUMMARY:${config.liveTitle}`);
  };
  const firstDraft = {...f.draft(), liveTitle: '검수용 변경 일정 안내'};
  f.saveDraft(firstDraft);
  await assertPublic(defaultArrival);

  f.publishDraft();
  await assertPublic(firstDraft);
  f.saveDraft({...firstDraft, liveTitle: '다음 검수용 초안'});
  await assertPublic(firstDraft);
  assert.equal(f.reads(), 0);
  assert.equal(f.authReads(), 0);

  f.allow();
  const preview = await f.render({event: 'test-event'});
  assert.equal(preview.props.config.liveTitle, '다음 검수용 초안');
});

test('branch preview uses the preset without reading a fixed DEV publication', async () => {
  const f = fixture({VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development'});
  f.publishDraft();
  assert.deepEqual((await f.render({})).props.config, defaultArrival);
  assert.equal(await (await f.calendar()).text(), `SUMMARY:${defaultArrival.liveTitle}`);
  assert.equal(f.publicReads(), 0);
});

test('private preview rejects a stale revision and accepts the matching saved revision', async () => {
  const f = fixture();
  const revision = '00000000-0000-4000-8000-000000000001';
  f.allow();
  const correctPreview = await f.render({event: 'test-event', revision});
  assert.equal(correctPreview.props.config, f.draft());
  const stale = await f.render({event: 'test-event', revision: '00000000-0000-4000-8000-000000000002'});
  assert.notEqual(stale.type, 'arrival');
  assert.match(JSON.stringify(stale), /저장된 설정이 바뀌었어요/);
  assert.equal(JSON.stringify(stale).includes(f.draft().title), false);
});

test('malformed and repeated event parameters do not query stored content', async () => {
  const f = fixture();
  f.allow();
  for (const event of ['../private', '', ['test-event', 'other-event']]) await assert.rejects(f.render({event}), /404/);
  for (const revision of ['', 'not-a-revision', ['first', 'second']]) {
    await assert.rejects(f.render({event: 'test-event', revision}), /404/);
  }
  assert.equal(f.reads(), 0);
  assert.equal(f.authReads(), 0);
  assert.equal(f.publicReads(), 0);
});
