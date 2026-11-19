import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import ts from 'typescript';
import * as previewGate from '../features/campus/arrival/preview-gate.ts';

async function loadModule(path, mocks) {
  const source = await readFile(path, 'utf8');
  const {outputText} = ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => {
    assert.ok(name in mocks, name);
    return mocks[name];
  });
  return exports;
}

const bundled = await build({
  stdin: {
    contents: `export * from './features/campus/webinar/domain'; export {DEFAULT_ARRIVAL, validateArrivalConfig} from './features/campus/arrival/config';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const domain = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const publication = await loadModule('features/campus/arrival/publication.ts', {'../webinar/domain': domain});
const body = await loadModule('features/campus/space/body.ts', {
  '../snapshot': {campusError: (status, message) => {throw Object.assign(Error(message), {status});}},
});
const origin = 'https://fixed-dev.example.com';
const slug = 'arrival-qa';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const operatorId = '00000000-0000-4000-8000-000000000003';

function fakeSettings() {
  const rows = new Map();
  const reads = [];
  const writes = [];
  function from(table) {
    assert.equal(table, 'site_settings');
    let command = 'read';
    let value;
    let columns;
    const filters = new Map();
    return {
      select(selection) {columns = selection; return this;},
      eq(key, expected) {filters.set(key, expected); return this;},
      abortSignal(signal) {assert.ok(signal instanceof AbortSignal); return this;},
      insert(row) {command = 'insert'; value = row; return this;},
      update(row) {command = 'update'; value = row; return this;},
      async maybeSingle() {
        const key = command === 'insert' ? value.key : filters.get('key');
        assert.equal(typeof key, 'string');
        const row = rows.get(key);
        if (command === 'read') {
          assert.equal(columns, 'value');
          assert.equal(filters.get('is_public'), false);
          reads.push(key);
          return {data: row?.is_public === false ? {value: structuredClone(row.value)} : null, error: null};
        }
        assert.equal(columns, 'key');
        assert.equal(value.is_public, false);
        if (command === 'insert' && row) return {data: null, error: {code: '23505'}};
        if (command === 'update') {
          assert.equal(filters.get('is_public'), false);
          const expected = filters.get('value->>revision');
          assert.equal(typeof expected, 'string');
          if (!row || row.is_public || row.value.revision !== expected) return {data: null, error: null};
        }
        rows.set(key, structuredClone(value));
        writes.push({command, key, updatedBy: value.updated_by});
        return {data: {key}, error: null};
      },
    };
  }
  return {rows, reads, writes, from};
}

async function fixture() {
  const settings = fakeSettings();
  const client = {createAdminClient: () => settings};
  const webinarServer = await loadModule('features/campus/webinar/server.ts', {
    'next/cache': {unstable_cache: fn => fn},
    '@/lib/supabase/admin': client,
    './domain': domain,
  });
  const publicationServer = await loadModule('features/campus/arrival/publication-server.ts', {
    '@/lib/supabase/admin': client,
    '../webinar/domain': domain,
    '../webinar/server': webinarServer,
    './config': domain,
  });
  let allowed = true;
  let env = {VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development'};
  const route = await loadModule('app/api/admin/campus/webinars/arrival-publication/route.ts', {
    '@/lib/operator-permissions': {getOperatorUser: async scope => {assert.equal(scope, 'marketing'); return allowed ? {id: operatorId} : null;}},
    '@/features/campus/arrival/preview-gate': {arrivalPublicationEnabled: () => previewGate.arrivalPublicationEnabled(env)},
    '@/features/campus/arrival/publication': publication,
    '@/features/campus/arrival/publication-server': publicationServer,
    '@/features/campus/space/body': body,
    '@/features/campus/webinar/domain': domain,
    '@/features/campus/webinar/server': webinarServer,
  });
  function saveDraft(revision, title, eventSlug = slug, teamIntro = '') {
    const arrival = {...domain.DEFAULT_ARRIVAL, title, teamIntro};
    const value = domain.validateWebinar({
      slug: eventSlug, title: '검수 행사', description: '', status: 'draft',
      startsAt: '2026-12-07T12:00:00Z', endsAt: '2026-12-07T13:00:00Z',
      revision, cohortId: operatorId, detailPath: '/classes/test', kakaoUrl: '', youtubeId: '',
      arrival,
    });
    settings.rows.set(domain.WEBINAR_PREFIX + eventSlug, {is_public: false, value});
  }
  function post(value, source = origin) {
    return route.POST(new Request(origin + '/api/admin/campus/webinars/arrival-publication', {
      method: 'POST', headers: {origin: source, 'content-type': 'application/json'}, body: JSON.stringify(value),
    }));
  }
  return {
    get: route.GET, post, read: publicationServer.readPublishedArrival, saveDraft, settings,
    setAllowed: value => {allowed = value;}, setEnv: value => {env = value;},
  };
}

const requestBody = (sourceRevision = first, expectedPublicationRevision = null, eventSlug = slug) => ({
  slug: eventSlug, sourceRevision, expectedPublicationRevision,
});

test('publication requires same origin, marketing permission and a non-preview environment', async () => {
  const f = await fixture();
  f.setAllowed(false);
  assert.equal((await f.get()).status, 403);
  assert.equal((await f.post(requestBody())).status, 403);
  f.setAllowed(true);
  assert.equal((await f.post(requestBody(), 'https://other.example.com')).status, 403);
  assert.equal((await f.post({...requestBody(), config: domain.DEFAULT_ARRIVAL})).status, 400);
  f.setEnv({VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development'});
  assert.equal((await f.get()).status, 404);
  assert.equal((await f.post(requestBody())).status, 404);
  assert.deepEqual(f.settings.reads, []);
  assert.deepEqual(f.settings.writes, []);
});

test('publication copies only the exact saved draft and requires the current publication for replacement', async () => {
  const f = await fixture();
  f.saveDraft(first, '첫 저장 초안');
  assert.equal(await f.read(), null);
  assert.deepEqual(await (await f.get()).json(), {publication: null});
  const response = await f.post(requestBody());
  assert.equal(response.status, 200);
  const {publication: initial} = await response.json();
  assert.equal(initial.slug, slug);
  assert.equal(initial.sourceRevision, first);
  assert.equal(Object.hasOwn(initial, 'config'), false);
  assert.equal((await f.read()).config.title, '첫 저장 초안');
  assert.equal(Object.hasOwn((await f.read()).config, 'teamIntro'), false);

  assert.deepEqual(await (await f.post(requestBody())).json(), {publication: initial});
  assert.equal(f.settings.writes.length, 1);
  const teamIntro = '팀 소개 첫 문단\n\n팀 소개 두 번째 문단';
  f.saveDraft(second, '두 번째 저장 초안', slug, teamIntro);
  assert.equal((await f.read()).config.title, '첫 저장 초안');
  assert.equal(Object.hasOwn((await f.read()).config, 'teamIntro'), false);
  assert.equal((await f.post(requestBody(first, initial.revision))).status, 409);
  assert.equal((await f.post(requestBody(second))).status, 409);
  assert.equal(f.settings.writes.length, 1);

  const replacement = await f.post(requestBody(second, initial.revision));
  assert.equal(replacement.status, 200);
  const {publication: current} = await replacement.json();
  assert.equal(current.sourceRevision, second);
  assert.notEqual(current.revision, initial.revision);
  assert.deepEqual(await (await f.get()).json(), {publication: current});
  assert.equal((await f.read()).config.title, '두 번째 저장 초안');
  assert.equal((await f.read()).config.teamIntro, teamIntro);
  assert.deepEqual(f.settings.writes.map(({command, updatedBy}) => ({command, updatedBy})), [
    {command: 'insert', updatedBy: operatorId}, {command: 'update', updatedBy: operatorId},
  ]);
});

test('two admins publishing distinct drafts from the same baseline cannot both replace it', async () => {
  const f = await fixture();
  f.saveDraft(first, '첫 행사 초안');
  f.saveDraft(second, '다른 행사 초안', 'other-qa');
  const responses = await Promise.all([
    f.post(requestBody()),
    f.post(requestBody(second, null, 'other-qa')),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const {publication: winner} = await responses.find(response => response.ok).json();
  assert.equal((await f.read()).sourceRevision, winner.sourceRevision);
  assert.equal(f.settings.writes.length, 1);
});
