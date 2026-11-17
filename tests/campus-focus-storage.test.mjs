import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
async function moduleAt(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const { loadCampusFocus, saveCampusFocus } = await moduleAt('../features/campus/focus-repository.ts');
const { handleCampusFocus } = await moduleAt('../features/campus/focus-handler.ts');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-02T10:00:00Z');
const viewer = { id: uid(1) };
const start = { kind: 'start', requestId: uid(20), enrollmentId: uid(2), lessonId: uid(6), lessonVersion: 'v1', actionText: '고객 한 명의 문제를 적기' };
function fixture() { return {
  enrollments: [{ id: uid(2), user_id: uid(1), course_id: uid(3), cohort_id: uid(4), status: 'active' }, { id: uid(12), user_id: uid(11), course_id: uid(3), cohort_id: uid(4), status: 'active' }],
  courses: [{ id: uid(3), status: 'published', archived_at: null }], cohorts: [{ id: uid(4), course_id: uid(3), archived_at: null }],
  curriculum_weeks: [{ id: uid(5), course_id: uid(3), is_published: true }],
  curriculum_lessons: [{ id: uid(6), week_id: uid(5), is_published: true, updated_at: 'v1', title: 'PRIVATE TITLE', content: 'PRIVATE BODY' }],
  edu_campus_focus_sessions: [],
}; }
function database(data = fixture(), options = {}) {
  const calls = [];
  return { data, calls, from(table) {
    let columns, mode = 'read', values, limit = Infinity; const filters = [], sorts = [];
    calls.push({ table, filters });
    return {
      select(v) { columns = v.split(','); return this; },
      eq(k, v) { filters.push([k, v]); return this; },
      is(k, v) { filters.push([k, v]); return this; },
      order(k, v) { sorts.push([k, v?.ascending !== false]); return this; },
      limit(v) { limit = v; return this; },
      insert(v) { mode = 'insert'; values = v; return this; },
      update(v) { mode = 'update'; values = v; return this; },
      async maybeSingle() {
        if (options.failTable === table) return { data: null, error: { message: 'PRIVATE DATABASE DETAIL' } };
        if (mode === 'insert') {
          const duplicate = data[table].some(r => r.id === values.id || (r.user_id === values.user_id && r.enrollment_id === values.enrollment_id && r.status !== 'finished'));
          if (duplicate) return { data: null, error: { code: '23505' } };
          data[table].push(structuredClone(values));
          return { data: structuredClone(values), error: null };
        }
        let rows = data[table].filter(r => filters.every(([k, v]) => (r[k] ?? null) === v));
        for (const [k, asc] of sorts.toReversed()) rows.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (asc ? 1 : -1));
        rows = rows.slice(0, limit);
        if (mode === 'update') {
          if (options.loseCas) return { data: null, error: null };
          rows.forEach(r => Object.assign(r, values));
        }
        assert.ok(rows.length <= 1);
        return { data: rows[0] ? Object.fromEntries(columns.map(k => [k, rows[0][k]])) : null, error: null };
      },
    };
  } };
}
test('start, reload, pause, resume, finish preserve own notes and only save commands', async () => {
  const db = database();
  const first = await saveCampusFocus(db, viewer.id, start, now);
  assert.equal(first.session.revision, 1); assert.equal(first.currentLessonVersion, 'v1');
  assert.equal((await loadCampusFocus(db, viewer.id, uid(2), now + 2000)).session.id, uid(20));
  const paused = await saveCampusFocus(db, viewer.id, { kind: 'pause', sessionId: uid(20), expectedRevision: 1 }, now + 30000);
  assert.equal(paused.session.elapsed_seconds, 30);
  await saveCampusFocus(db, viewer.id, { kind: 'resume', sessionId: uid(20), expectedRevision: 2 }, now + 60000);
  const done = await saveCampusFocus(db, viewer.id, { kind: 'finish', sessionId: uid(20), expectedRevision: 3, resultNote: '문제 한 개를 정리함', nextStep: '고객 인터뷰' }, now + 90000);
  assert.equal(done.session.elapsed_seconds, 60); assert.equal(done.session.next_step, '고객 인터뷰');
  assert.equal(db.data.edu_campus_focus_sessions.length, 1);
  assert.ok(!JSON.stringify(done).includes('PRIVATE'));
  assert.ok(!db.calls.some(c => /progress|mission|reward/.test(c.table)));
});
test('start retry returns original without overwriting even after finishing; different payload conflicts', async () => {
  const db = database(); await saveCampusFocus(db, viewer.id, start, now);
  assert.equal((await saveCampusFocus(db, viewer.id, start, now + 1)).session.created_at, new Date(now).toISOString());
  await assert.rejects(saveCampusFocus(db, viewer.id, { ...start, actionText: '바꾸기' }, now + 2), { status: 409 });
  await saveCampusFocus(db, viewer.id, { kind: 'finish', sessionId: uid(20), expectedRevision: 1, resultNote: '결과', nextStep: '다음' }, now + 3000);
  assert.equal((await saveCampusFocus(db, viewer.id, start, now + 5000)).session.result_note, '결과');
  assert.equal(db.data.edu_campus_focus_sessions.length, 1);
});
test('one unfinished action per scope; finished action allows a new action', async () => {
  const db = database(); await saveCampusFocus(db, viewer.id, start, now);
  await assert.rejects(saveCampusFocus(db, viewer.id, { ...start, requestId: uid(21) }, now + 1), { status: 409 });
  await saveCampusFocus(db, viewer.id, { kind: 'finish', sessionId: uid(20), expectedRevision: 1, resultNote: '결과', nextStep: '다음' }, now + 2);
  await saveCampusFocus(db, viewer.id, { ...start, requestId: uid(21) }, now + 3);
  assert.equal((await loadCampusFocus(db, viewer.id, uid(2), now + 4)).session.id, uid(21));
});
test('stale start rejected; hidden or edited lesson does not strand existing notes', async () => {
  const db = database(); await assert.rejects(saveCampusFocus(db, viewer.id, { ...start, lessonVersion: 'old' }, now), { status: 409 });
  await saveCampusFocus(db, viewer.id, start, now);
  db.data.curriculum_lessons[0].is_published = false;
  const current = await loadCampusFocus(db, viewer.id, uid(2), now + 1);
  assert.equal(current.currentLessonVersion, null); assert.equal(current.session.action_text, start.actionText);
  await saveCampusFocus(db, viewer.id, { kind: 'pause', sessionId: uid(20), expectedRevision: 1 }, now + 2);
  await saveCampusFocus(db, viewer.id, { kind: 'resume', sessionId: uid(20), expectedRevision: 2 }, now + 3);
  await saveCampusFocus(db, viewer.id, { kind: 'finish', sessionId: uid(20), expectedRevision: 3, resultNote: '숨겨져도 기록 보존', nextStep: '새 수업 보기' }, now + 4);
  await assert.rejects(saveCampusFocus(db, viewer.id, { ...start, requestId: uid(21) }, now + 5), { status: 403 });
});
test('cross-user, revoked, expired, nonpublished course and foreign lesson blocked', async () => {
  for (const mutate of [d => { d.enrollments[0].status = 'refunded'; }, d => { d.enrollments[0].access_ends_at = new Date(now).toISOString(); },
    d => { d.enrollments[0].revoked_at = new Date(now).toISOString(); }, d => { d.cohorts[0].archived_at = new Date(now).toISOString(); }, d => { d.courses[0].status = 'draft'; },
    d => { d.curriculum_weeks[0].course_id = uid(999); }]) {
    const db = database(); mutate(db.data); await assert.rejects(saveCampusFocus(db, viewer.id, start, now), { status: 403 });
  }
  const db = database(); await saveCampusFocus(db, viewer.id, start, now);
  await assert.rejects(loadCampusFocus(db, uid(11), uid(2), now), { status: 403 });
  await assert.rejects(saveCampusFocus(db, uid(11), { kind: 'pause', sessionId: uid(20), expectedRevision: 1 }, now), { status: 404 });
});
test('revision conflicts and lost compare-and-swap never overwrite', async () => {
  const data = fixture(), db = database(data); await saveCampusFocus(db, viewer.id, start, now);
  await assert.rejects(saveCampusFocus(db, viewer.id, { kind: 'pause', sessionId: uid(20), expectedRevision: 2 }, now + 1), { status: 409 });
  await assert.rejects(saveCampusFocus(database(data, { loseCas: true }), viewer.id, { kind: 'pause', sessionId: uid(20), expectedRevision: 1 }, now + 1), { status: 409 });
  assert.equal(data.edu_campus_focus_sessions[0].revision, 1);
});
const request = (method = 'GET', extra = {}) => new Request(`https://edu.test/api/campus/focus?enrollmentId=${uid(2)}`, { method, ...extra });
const deps = { enabled: true, authenticate: async () => viewer, load: async () => ({ session: null, serverNow: new Date(now).toISOString(), currentLessonVersion: null }), save: async () => ({ session: null }) };
test('HTTP gate, authentication, same origin, shape and error redaction', async () => {
  assert.equal((await handleCampusFocus(request(), { ...deps, enabled: false })).status, 404);
  assert.equal((await handleCampusFocus(request(), { ...deps, authenticate: async () => null })).status, 401);
  for (const headers of [{}, { origin: 'https://evil.test' }, { origin: 'https://edu.test', 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await handleCampusFocus(request('POST', { headers, body: '{}' }), deps)).status, 403);
  }
  const post = body => request('POST', { headers: { origin: 'https://edu.test', 'content-type': 'application/json' }, body });
  for (const body of ['{}', '[]', 'null', 'bad', JSON.stringify({ kind: 'delete' }), 'x'.repeat(12001)]) assert.equal((await handleCampusFocus(post(body), deps)).status, 400);
  const okay = await handleCampusFocus(request(), deps); assert.equal(okay.status, 200); assert.equal(okay.headers.get('cache-control'), 'private, no-store');
  const failed = await handleCampusFocus(request(), { ...deps, load: async () => { throw new Error('PRIVATE SECRET DETAIL'); } });
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('PRIVATE'));
});

test('local PostgreSQL enforces RLS, identity, version transitions, uniqueness and finished preservation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table profiles(id uuid primary key, status text);
      create table courses(id uuid primary key, status text, archived_at timestamptz);
      create table cohorts(id uuid primary key, course_id uuid, archived_at timestamptz);
      create table enrollments(id uuid primary key, user_id uuid, course_id uuid, cohort_id uuid, status text, revoked_at timestamptz, access_starts_at timestamptz, access_ends_at timestamptz);
      create table curriculum_weeks(id uuid primary key, course_id uuid, is_published boolean);
      create table curriculum_lessons(id uuid primary key, week_id uuid, is_published boolean, updated_at timestamptz);
      insert into profiles values ('${uid(1)}','active'), ('${uid(11)}','active');
      insert into courses values ('${uid(3)}','published',null);
      insert into cohorts(id,course_id) values ('${uid(4)}','${uid(3)}');
      insert into enrollments(id,user_id,course_id,cohort_id,status) values ('${uid(2)}','${uid(1)}','${uid(3)}','${uid(4)}','active'), ('${uid(12)}','${uid(11)}','${uid(3)}','${uid(4)}','active');
      insert into curriculum_weeks values ('${uid(5)}','${uid(3)}',true);
      insert into curriculum_lessons values ('${uid(6)}','${uid(5)}',true,'2026-11-01T10:00:00Z');
      grant select on profiles,courses,cohorts,enrollments,curriculum_weeks,curriculum_lessons to authenticated;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261102114237_edu_campus_focus_sessions.sql', import.meta.url), 'utf8'));
    const login = async user => { await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`); };
    const insert = (sessionId = uid(20), enrollment = uid(2), owner = uid(1)) => db.query(`insert into edu_campus_focus_sessions(id,user_id,enrollment_id,lesson_id,lesson_version,action_text,status,running_since,created_at,updated_at) values($1,$2,$3,$4,'2026-11-01T10:00:00Z','테스트 실행','running','2026-11-02T10:00:00Z','2026-11-02T10:00:00Z','2026-11-02T10:00:00Z')`, [sessionId, owner, enrollment, uid(6)]);
    await login(uid(1)); await insert();
    await assert.rejects(insert(uid(21)), /unique/i);
    await assert.rejects(insert(uid(21), uid(12)), /row-level security/i);
    await assert.rejects(db.exec(`update edu_campus_focus_sessions set action_text='변조',revision=2,status='paused',running_since=null`), /immutable/i);
    await assert.rejects(db.exec(`update edu_campus_focus_sessions set revision=3,status='paused',running_since=null`), /transition/i);
    await assert.rejects(db.exec(`delete from edu_campus_focus_sessions`), /permission denied/i);
    await login(uid(11));
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 0);
    assert.equal((await db.query("update edu_campus_focus_sessions set revision=2,status='paused',running_since=null returning id")).rows.length, 0);
    await db.exec('reset role; update curriculum_lessons set is_published=false;');
    await login(uid(1));
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 1);
    await db.exec("update edu_campus_focus_sessions set revision=2,status='paused',running_since=null,elapsed_seconds=30,updated_at='2026-11-02T10:00:30Z' where revision=1;");
    assert.equal((await db.query("update edu_campus_focus_sessions set revision=2,status='paused',running_since=null where revision=1 returning id")).rows.length, 0);
    await db.exec("update edu_campus_focus_sessions set revision=3,status='finished',result_note='결과',next_step='다음' where revision=2;");
    await assert.rejects(db.exec("update edu_campus_focus_sessions set revision=4,result_note='덮어쓰기'"), /immutable/i);
    await assert.rejects(insert(uid(21)), /row-level security/i);
    await db.exec("reset role; update curriculum_lessons set is_published=true,updated_at='2026-11-02T10:00:00Z';"); await login(uid(1));
    await assert.rejects(insert(uid(21)), /row-level security/i);
    await db.exec("reset role; update curriculum_lessons set updated_at='2026-11-01T10:00:00Z';");
    await db.exec("reset role; update curriculum_lessons set is_published=true;"); await login(uid(1)); await insert(uid(21));
    await db.exec("reset role; delete from curriculum_lessons;"); await login(uid(1));
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 2);
    await db.exec(`update edu_campus_focus_sessions set revision=2,status='finished',running_since=null,result_note='삭제된 수업 기록 보존',next_step='다른 수업' where id='${uid(21)}';`);
    await db.exec("reset role; update cohorts set archived_at=now();"); await login(uid(1));
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 0);
    await assert.rejects(insert(uid(22)), /row-level security/i);
    await db.exec("reset role; update cohorts set archived_at=null;");
    await db.exec("reset role; update enrollments set revoked_at=now();"); await login(uid(1));
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 0);
    assert.equal((await db.query("update edu_campus_focus_sessions set revision=2,status='paused',running_since=null returning id")).rows.length, 0);
    await assert.rejects(insert(uid(22)), /row-level security/i);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from edu_campus_focus_sessions'), /permission denied/i);
    await db.exec(`reset role; delete from profiles where id='${uid(1)}';`);
    assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length, 0);
  } finally { await db.close(); }
});
