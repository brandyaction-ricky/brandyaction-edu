import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createEduBridge } from '../public/campus/edu-bridge.mjs';

async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const { loadCampusSnapshot } = await moduleAt('../features/campus/repository.ts');
const { handleCampusGet } = await moduleAt('../features/campus/handler.ts');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: uid(1), full_name: 'QA 동료', email: 'PRIVATE' };
const now = Date.parse('2026-11-02T10:00:00Z');
function fixture() {
  return {
    enrollments: [{ id: uid(2), user_id: user.id, course_id: uid(3), cohort_id: uid(4), status: 'active' },
      { id: uid(12), user_id: uid(11), course_id: uid(3), cohort_id: uid(4), status: 'active' }],
    courses: [{ id: uid(3), title: '문샷', status: 'published', archived_at: null }],
    cohorts: [{ id: uid(4), course_id: uid(3), name: 'QA 기수' }],
    curriculum_weeks: [{ id: uid(5), course_id: uid(3), is_published: true }],
    edu_cohort_week_visibility:[{cohort_id:uid(4),week_id:uid(5),is_published:true}],
    edu_cohort_lesson_visibility:[{cohort_id:uid(4),lesson_id:uid(6),is_published:true}],
    curriculum_lessons: [{ id: uid(6), week_id: uid(5), title: '공개 수업', day_number: 1, updated_at: 'v1', is_published: true },
      { id: uid(16), week_id: uid(5), title: '비공개 수업', day_number: 2, is_published: false }],
    curriculum_missions: [{ id: uid(7), lesson_id: uid(6), title: '과제', updated_at: 'm1', is_required: true, is_published: true, archived_at: null }],
    mission_submissions: [{ id: uid(8), enrollment_id: uid(2), mission_id: uid(7), attempt_number: 1, status: 'approved', response: { secret: 'PRIVATE' } },
      { id: uid(9), enrollment_id: uid(2), mission_id: uid(7), attempt_number: 2, status: 'changes_requested', reviewer_feedback: 'PRIVATE' },
      { id: uid(18), enrollment_id: uid(12), mission_id: uid(7), attempt_number: 3, status: 'approved' }],
    lesson_progress: [{ id: uid(10), enrollment_id: uid(2), lesson_id: uid(6), completed_at: '2026-11-01' }],
  };
}
function database(data, { failTable, truncateTable } = {}) {
  const calls = [];
  return { calls, from(table) {
    const filters = []; let columns, limit = Infinity;
    calls.push({ table, filters });
    const query = {
      select(value, options) { assert.equal(options.count, 'exact'); columns = value.split(','); return this; },
      eq(column, value) { filters.push([column, value]); filters.push(row => row[column] === value); return this; },
      is(column, value) { filters.push(row => (row[column] ?? null) === value); return this; },
      in(column, values) { filters.push(row => values.includes(row[column])); return this; },
      order() { return this; },
      limit(value) { limit = value; return this; },
      then(resolve, reject) {
        const selected = (data[table] || []).filter(row => filters.every(fn => typeof fn !== 'function' || fn(row)));
        const result = { data: selected.slice(0, table === truncateTable ? 0 : limit).map(row => Object.fromEntries(columns.map(c => [c, row[c]]))),
          error: table === failTable ? new Error('PRIVATE DATABASE ERROR') : null, count: selected.length };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  } };
}
const load = (data = fixture(), options) => loadCampusSnapshot(database(data, options), user, uid(2), now);
test('selected cohort hides another cohorts published lesson and fails closed on visibility lookup',async()=>{
 for(const table of ['edu_cohort_week_visibility','edu_cohort_lesson_visibility']){
  const data=fixture();data[table][0].cohort_id=uid(99);assert.equal((await load(data)).lessons.length,0);
  await assert.rejects(load(fixture(),{failTable:table}),{status:503});
 }
 const data=fixture();data.curriculum_lessons[0].archived_at='2026-01-01';assert.equal((await load(data)).lessons.length,0);
});

test('context reads only current owner scopes and no lesson bodies', async () => {
  const db = database(fixture());
  const result = await loadCampusSnapshot(db, user, null, now);
  assert.deepEqual(result.scopes.map(s => s.enrollmentId), [uid(2)]);
  assert.deepEqual(db.calls.map(c => c.table), ['enrollments', 'courses', 'cohorts']);
  assert.equal(result.viewer.email, undefined);
  assert.deepEqual(result.lessons, []);
});

test('selected scope maps published lessons, real completion and latest own submission', async () => {
  const result = await load();
  assert.equal(result.lessons.length, 1);
  assert.equal(result.lessons[0].completed, true);
  assert.equal(result.lessons[0].missions[0].status, 'changes_requested');
  assert.equal(result.lessons[0].missions[0].href, `/learn/${uid(2)}/${uid(6)}/mission?mission=${uid(7)}`);
  assert.equal(result.launchEligibility, null);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('other owner rejected before any course reads even when same course', async () => {
  const db = database(fixture());
  await assert.rejects(loadCampusSnapshot(db, user, uid(12), now), { status: 403 });
  assert.deepEqual(db.calls.map(c => c.table), ['enrollments']);
});

for (const change of [{ status: 'refunded' }, { revoked_at: '2026-11-01' }, { access_ends_at: new Date(now).toISOString() }, { access_starts_at: new Date(now + 1).toISOString() }, { access_ends_at: 'invalid' }]) {
  test('access blocked: ' + JSON.stringify(change), async () => {
    const data = fixture(); Object.assign(data.enrollments[0], change);
    await assert.rejects(load(data), { status: 403 });
  });
}

test('unpublished course and inconsistent cohort/course denied', async () => {
  for (const modify of [d => { d.courses[0].status = 'draft'; }, d => { d.cohorts[0].course_id = uid(99); }]) {
    const data = fixture(); modify(data); await assert.rejects(load(data), { status: 403 });
  }
});

test('hidden weeks, archived missions and edits reflected on next request', async () => {
  const data = fixture(); data.curriculum_weeks[0].is_published = false;
  assert.deepEqual((await load(data)).lessons, []);
  data.curriculum_weeks[0].is_published = true;
  data.curriculum_missions[0].archived_at = '2026-11-02';
  data.curriculum_lessons[0].title = '수정한 수업'; data.curriculum_lessons[0].updated_at = 'v2';
  const result = await load(data);
  assert.equal(result.lessons[0].title, '수정한 수업');
  assert.equal(result.lessons[0].version, 'v2');
  assert.deepEqual(result.lessons[0].missions, []);
});

test('query failure or truncated rows cannot masquerade as complete map', async () => {
  await assert.rejects(load(fixture(), { failTable: 'mission_submissions' }), { status: 503 });
  await assert.rejects(load(fixture(), { truncateTable: 'curriculum_lessons' }), { status: 503 });
});

function request(search = '', headers) { return new Request('https://edu.example/api/campus' + search, { headers }); }
const deps = overrides => ({ enabled: true, authenticate: async () => user, load: async () => load(), ...overrides });

test('default off blocks before authentication or database', async () => {
  const response = await handleCampusGet(request(), deps({ enabled: false, authenticate: () => { throw Error('should not run'); } }));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('API rejects cross-origin, malformed IDs, anonymous and expired sessions', async () => {
  assert.equal((await handleCampusGet(request('', { origin: 'https://other.example' }), deps())).status, 403);
  assert.equal((await handleCampusGet(request('?enrollmentId=../admin'), deps())).status, 400);
  assert.equal((await handleCampusGet(request(), deps({ authenticate: async () => null }))).status, 401);
  const result = await handleCampusGet(request(), deps({ authenticate: async () => { throw Error('PRIVATE AUTH'); } }));
  assert.equal(result.status, 503); assert.equal((await result.text()).includes('PRIVATE'), false);
});

test('server response remains private and no-store on success and access failure', async () => {
  const response = await handleCampusGet(request('?enrollmentId=' + uid(2)), deps());
  assert.equal(response.status, 200); assert.equal(response.headers.get('Vary'), 'Cookie');
  const denied = await handleCampusGet(request(), deps({ load: async () => { throw Object.assign(Error('PRIVATE'), { status: 403 }); } }));
  assert.equal(denied.status, 403); assert.equal((await denied.text()).includes('PRIVATE'), false);
});

const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
test('bridge uses same-origin session, refreshes before navigation, constructs safe destination', async () => {
  const snapshot = await load(); snapshot.lessons[0].href = 'https://evil.example';
  const calls = [], destinations = [];
  const bridge = createEduBridge({ fetcher: async (url, options) => { calls.push({ url, options }); return response(snapshot); }, navigate: url => destinations.push(url) });
  await bridge.openLesson(uid(2), uid(6));
  await bridge.openMission(uid(2), uid(6), uid(7));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(destinations, [`/learn/${uid(2)}/${uid(6)}`, `/learn/${uid(2)}/${uid(6)}/mission?mission=${uid(7)}`]);
});

test('bridge blocks expired access or newly hidden lesson instead of using cached destination', async () => {
  const snapshots = [response(await load()), new Response('', { status: 403 })];
  const states = [], destinations = [];
  const bridge = createEduBridge({ fetcher: async () => snapshots.shift(), onState: s => states.push(s), navigate: href => destinations.push(href) });
  await bridge.load(uid(2));
  await assert.rejects(bridge.openLesson(uid(2), uid(6)), { status: 403 });
  assert.deepEqual(destinations, []); assert.equal(states.at(-1).snapshot, null);
  const hidden = await load(); hidden.lessons = [];
  const other = createEduBridge({ fetcher: async () => response(hidden), navigate: href => destinations.push(href) });
  await assert.rejects(other.openLesson(uid(2), uid(6)), { status: 403 });
  assert.deepEqual(destinations, []);
});

test('scope change and dispose suppress late responses even if fetch ignores abort', async () => {
  const pending = [], states = [];
  const bridge = createEduBridge({ fetcher: () => new Promise(resolve => pending.push(resolve)), onState: s => states.push(s) });
  const first = bridge.load(uid(2)); const firstCheck = assert.rejects(first, { name: 'AbortError' });
  const second = bridge.load();
  pending[1](response(await loadCampusSnapshot(database(fixture()), user, null, now))); await second;
  pending[0](response(await load())); await firstCheck;
  assert.equal(states.filter(s => s.status === 'ready').length, 1);
  const third = bridge.load(uid(2)); const thirdCheck = assert.rejects(third, { name: 'AbortError' });
  bridge.dispose(); pending[2](response(await load())); await thirdCheck;
  assert.equal(states.at(-1).status, 'closed');
});

test('bridge schema mismatch clears state and unsupported paths do not fetch', async () => {
  let count = 0; const states = [];
  const bridge = createEduBridge({ fetcher: async () => { count++; return response({ schemaVersion: 2 }); }, onState: s => states.push(s) });
  await assert.rejects(bridge.openMission(uid(2), uid(6), 'https://evil.example'), { status: 400 });
  await assert.rejects(bridge.openMission(uid(2), uid(6)), { status: 400 });
  assert.equal(count, 0);
  await assert.rejects(bridge.load()); assert.equal(states.at(-1).snapshot, null);
});
