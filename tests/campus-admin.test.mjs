import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const { campusAdminMetrics } = await moduleAt('../features/campus/admin-metrics.ts');
const { loadCampusAdminSnapshot, loadCampusAdminOptions } = await moduleAt('../features/campus/admin-repository.ts');
const { handleCampusAdminGet } = await moduleAt('../features/campus/admin-handler.ts');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-02T10:00:00Z');
function fixture() {
  return {
    now, cohort: { id: uid(1), name: 'QA 기수', course_id: uid(2) }, course: { id: uid(2), title: '문샷', status: 'published' },
    profiles: [3, 4, 5].map(id => ({ id: uid(id), full_name: `QA ${id}`, status: 'active', email: 'PRIVATE' })),
    enrollments: [3, 4, 5].map(id => ({ id: uid(id + 10), user_id: uid(id), course_id: uid(2), cohort_id: uid(1), status: 'active' })),
    weeks: [{ id: uid(20), course_id: uid(2), is_published: true }],
    lessons: [{ id: uid(21), week_id: uid(20), title: '수업1', day_number: 1, is_published: true }, { id: uid(22), week_id: uid(20), title: '수업2', day_number: 2, is_published: true }],
    missions: [{ id: uid(23), lesson_id: uid(21), title: '과제1', is_required: true, is_published: true }, { id: uid(24), lesson_id: uid(22), title: '과제2', is_required: true, is_published: true }],
    submissions: [
      { id: uid(30), enrollment_id: uid(13), mission_id: uid(23), status: 'approved', attempt_number: 1, submitted_at: '2026-10-25T10:00:00Z', response: 'PRIVATE' },
      { id: uid(31), enrollment_id: uid(13), mission_id: uid(24), status: 'submitted', attempt_number: 1, submitted_at: '2026-10-30T10:00:00Z' },
      { id: uid(32), enrollment_id: uid(14), mission_id: uid(23), status: 'changes_requested', attempt_number: 1, submitted_at: '2026-10-29T10:00:00Z' },
    ],
  };
}
function database(input, { fail, truncate } = {}) {
  const data = { cohorts: [input.cohort], courses: [input.course], profiles: input.profiles, enrollments: input.enrollments,
    curriculum_weeks: input.weeks, curriculum_lessons: input.lessons, curriculum_missions: input.missions, mission_submissions: input.submissions };
  const calls = [];
  return { calls, from(table) {
    const filters = []; let columns, limit = Infinity, start = 0;
    calls.push({ table, filters });
    return {
      select(value, options) { assert.equal(options.count, 'exact'); columns = value.split(','); return this; },
      eq(column, value) { filters.push(row => row[column] === value); return this; },
      is(column, value) { filters.push(row => (row[column] ?? null) === value); return this; },
      in(column, values) { filters.push(row => values.includes(row[column])); return this; },
      order() { return this; }, limit(value) { limit = value; return this; },
      range(from, to) { start = from; limit = to - from + 1; return this; },
      then(resolve, reject) {
        const selected = (data[table] || []).filter(row => filters.every(fn => fn(row)));
        return Promise.resolve({ data: selected.slice(start, table === truncate ? start : start + limit).map(row => Object.fromEntries(columns.map(c => [c, row[c]]))),
          error: table === fail ? new Error('PRIVATE DB ERROR') : null, count: selected.length }).then(resolve, reject);
      },
    };
  } };
}

test('aggregates real latest required task states with explicit denominators and no private content', () => {
  const result = campusAdminMetrics(fixture());
  assert.deepEqual(result.metrics, { activeLearners: 3, requiredMissions: 2, participatingLearners: 2, allApprovedLearners: 0,
    revisionLearners: 1, unstartedLearners: 1, pendingReviews: 1, pendingOver2Days: 1, oldestPendingDays: 3, unknownStatuses: 0 });
  assert.equal(result.lessons[0].submittedLearners, 2);
  assert.equal(result.lessons[0].approvedLearners, 1);
  assert.equal(result.queue[0].waitingDays, 3);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('counts a person once across duplicate enrollments and selects the newest actual submission', () => {
  const data = fixture();
  data.enrollments.push({ ...data.enrollments[0], id: uid(99) });
  data.submissions.push({ ...data.submissions[1], id: uid(98), enrollment_id: uid(99), status: 'approved', submitted_at: '2026-11-01T10:00:00Z' });
  const result = campusAdminMetrics(data);
  assert.equal(result.metrics.activeLearners, 3);
  assert.equal(result.metrics.allApprovedLearners, 1);
  assert.equal(result.metrics.pendingReviews, 1); // Another active enrollment still has a real pending review.
  assert.equal(result.queue.some(q => q.enrollmentId === uid(13) && q.status === 'submitted'), true);
});

test('latest attempt within one enrollment takes precedence over inconsistent timestamps', () => {
  const data = fixture();
  data.submissions.push({ ...data.submissions[1], id: uid(97), attempt_number: 2, status: 'approved', submitted_at: '2026-10-01' });
  const result = campusAdminMetrics(data);
  assert.equal(result.metrics.pendingReviews, 0);
  assert.equal(result.metrics.allApprovedLearners, 1);
});

test('revoked, future, expired and withdrawn members and other cohort data excluded', () => {
  const data = fixture();
  data.enrollments[0].access_ends_at = new Date(now).toISOString();
  data.profiles[1].status = 'withdrawn';
  data.enrollments[2].cohort_id = uid(80);
  const result = campusAdminMetrics(data);
  assert.equal(result.metrics.activeLearners, 0);
  assert.equal(result.queueTotal, 0);
  assert.equal(result.metrics.allApprovedLearners, 0);
});

test('unpublished/optional/archived missions do not inflate success or pending counts', () => {
  for (const change of [{ is_required: false }, { is_published: false }, { archived_at: '2026-01-01' }]) {
    const data = fixture(); data.missions = data.missions.map(m => ({ ...m, ...change }));
    const result = campusAdminMetrics(data);
    assert.equal(result.metrics.requiredMissions, 0);
    assert.equal(result.metrics.allApprovedLearners, 0);
    assert.equal(result.metrics.unstartedLearners, 0);
    assert.equal(result.queueTotal, 0);
  }
});

test('unknown state or invalid/future timestamp is not fabricated into a success or overdue wait', () => {
  const data = fixture(); data.submissions[0].status = 'legacy_unknown';
  data.submissions[1].submitted_at = 'invalid';
  let result = campusAdminMetrics(data);
  assert.equal(result.metrics.unknownStatuses, 1);
  assert.equal(result.metrics.oldestPendingDays, null);
  assert.equal(result.metrics.pendingOver2Days, 0);
  data.submissions[1].submitted_at = new Date(now + 1).toISOString();
  result = campusAdminMetrics(data);
  assert.equal(result.queue[0].waitingDays, null);
});

test('inputs unchanged and empty curriculum cannot make every learner successful', () => {
  const data = fixture(), before = JSON.stringify(data);
  campusAdminMetrics(data); assert.equal(JSON.stringify(data), before);
  data.lessons = []; data.missions = [];
  const result = campusAdminMetrics(data);
  assert.equal(result.metrics.allApprovedLearners, 0);
  assert.equal(result.metrics.participatingLearners, 0);
});

test('repository narrows all reads to selected course/cohort and active profile', async () => {
  const data = fixture();
  data.enrollments.push({ ...data.enrollments[0], id: uid(77), cohort_id: uid(88) });
  data.submissions.push({ ...data.submissions[1], enrollment_id: uid(77), id: uid(76) });
  data.profiles[1].status = 'suspended';
  const db = database(data);
  const result = await loadCampusAdminSnapshot(db, uid(1), now);
  assert.equal(result.metrics.activeLearners, 2);
  assert.equal(result.metrics.pendingReviews, 1);
  assert.equal(result.metrics.revisionLearners, 0);
  assert.equal(db.calls.length, 8);
});

test('repository fails closed on missing cohort, errors and count truncation', async () => {
  await assert.rejects(loadCampusAdminSnapshot(database(fixture()), uid(90), now), { status: 404 });
  for (const options of [{ fail: 'profiles' }, { truncate: 'mission_submissions' }])
    await assert.rejects(loadCampusAdminSnapshot(database(fixture(), options), uid(1), now), { status: 503 });
});

test('admin selector returns only minimal cohort labels', async () => {
  const options = await loadCampusAdminOptions(database(fixture()));
  assert.deepEqual(options, { schemaVersion: 1, cohorts: [{ id: uid(1), name: 'QA 기수', courseTitle: '문샷' }] });
});

test('cohort history beyond 1,000 rows is fully read rather than silently clipped', async () => {
  const data = fixture();
  data.submissions = Array.from({ length: 1001 }, (_, i) => ({ ...data.submissions[1], id: uid(1000 + i), attempt_number: i + 1,
    status: i === 1000 ? 'approved' : 'submitted', submitted_at: new Date(now - (1001 - i) * 1000).toISOString() }));
  const db = database(data), result = await loadCampusAdminSnapshot(db, uid(1), now);
  assert.equal(db.calls.filter(c => c.table === 'mission_submissions').length, 2);
  assert.equal(result.metrics.pendingReviews, 0);
  assert.equal(result.lessons[1].approvedLearners, 1);
});

const req = (query = '?cohortId=' + uid(1), headers) => new Request('https://edu.example/api/campus/admin' + query, { headers });
function deps(overrides = {}) { return { enabled: true, authorize: async () => ({ id: uid(3) }), load: async () => campusAdminMetrics(fixture()), ...overrides }; }

test('disabled and unauthorized requests never access cohort data; unauthorized options also denied', async () => {
  let loads = 0;
  const noLoad = async () => { loads++; throw Error('must not read'); };
  assert.equal((await handleCampusAdminGet(req(), deps({ enabled: false, load: noLoad }))).status, 404);
  assert.equal((await handleCampusAdminGet(req(), deps({ authorize: async () => null, load: noLoad }))).status, 403);
  assert.equal((await handleCampusAdminGet(req(''), deps({ authorize: async () => null, load: noLoad }))).status, 403);
  assert.equal(loads, 0);
});

test('invalid/cross-origin input is rejected and private failures never leak', async () => {
  assert.equal((await handleCampusAdminGet(req('?cohortId=../../../'), deps())).status, 400);
  assert.equal((await handleCampusAdminGet(req('', { origin: 'https://other.example' }), deps())).status, 403);
  const result = await handleCampusAdminGet(req(), deps({ authorize: async () => { throw Error('PRIVATE AUTH ERROR'); } }));
  assert.equal(result.status, 503); assert.equal((await result.text()).includes('PRIVATE'), false);
});

test('authorized metrics and options remain private/no-store', async () => {
  const metrics = await handleCampusAdminGet(req(), deps());
  assert.equal(metrics.status, 200); assert.equal(metrics.headers.get('Cache-Control'), 'private, no-store');
  const options = await handleCampusAdminGet(req(''), deps({ load: async id => { assert.equal(id, null); return { schemaVersion: 1, cohorts: [] }; } }));
  assert.equal(options.status, 200); assert.equal(options.headers.get('Vary'), 'Cookie');
});
