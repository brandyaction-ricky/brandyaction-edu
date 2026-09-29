import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const archiveMigration = fs.readFileSync(new URL('../supabase/migrations/20260929120000_product_curriculum_archive.sql', import.meta.url), 'utf8');
const numberingMigration = fs.readFileSync(new URL('../supabase/migrations/20260929130000_curriculum_week_reuse_and_restore.sql', import.meta.url), 'utf8');

async function fixture({ generatedActiveNumber = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.profiles(id uuid primary key, role text not null, status text not null);
    create table public.site_settings(key text primary key, value jsonb not null);
    create table public.courses(id uuid primary key);
    create table public.curriculum_weeks(
      id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id),
      week_number integer not null check (week_number >= 0), title text not null, goal text,
      is_published boolean not null default false, display_order integer not null default 0,
      archived_at timestamptz, updated_at timestamptz not null default now(),
      ${generatedActiveNumber ? "active_week_number integer generated always as (case when archived_at is null then week_number else null end) stored," : ""}
      constraint curriculum_weeks_course_id_week_number_key unique(course_id,${generatedActiveNumber ? 'active_week_number' : 'week_number'}) deferrable initially immediate
    );
    create table public.curriculum_lessons(
      id uuid primary key default gen_random_uuid(), week_id uuid not null references public.curriculum_weeks(id),
      archived_at timestamptz, is_published boolean not null default false
    );
    create table public.curriculum_missions(
      id uuid primary key default gen_random_uuid(), lesson_id uuid not null references public.curriculum_lessons(id),
      archived_at timestamptz, is_published boolean not null default false
    );
    create table public.lesson_progress(id integer primary key, lesson_id uuid references public.curriculum_lessons(id));
    create table public.mission_submissions(id integer primary key, mission_id uuid references public.curriculum_missions(id));
    create table public.edu_mutation_receipts(
      actor_id uuid not null, request_id uuid not null, target_table text not null, fingerprint text not null,
      result jsonb, created_at timestamptz not null default now(), primary key(actor_id,request_id)
    );
    create table public.audit_logs(
      id integer generated always as identity primary key, actor_user_id uuid not null, action text not null,
      entity_type text not null, entity_id text, before_data jsonb, after_data jsonb
    );
    create function public.mission_operator_allowed(p_actor uuid, p_scope text)
    returns boolean language sql stable as $$
      select exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and (
        p.role='admin' or (p.role='staff' and coalesce((select (s.value->>p_scope)::boolean from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text),false))
      ));
    $$;
    create function public.save_course_curriculum(p_course_id uuid, p_actor uuid, p_weeks jsonb)
    returns void language plpgsql as $$ begin return; end; $$;
    ${generatedActiveNumber ? "create function public.edu_create_curriculum_week(p_actor uuid,p_course uuid,p_request uuid,p_title text) returns jsonb language sql as $$ select '{}'::jsonb $$;" : ""}
    grant all on all tables in schema public to service_role;
  `);
  await db.exec(archiveMigration);
  await db.exec(numberingMigration);
  if (generatedActiveNumber) {
    assert.equal((await db.query("select to_regprocedure('public.edu_create_curriculum_week(uuid,uuid,uuid,text)') is null as retired")).rows[0].retired, true);
  }
  const admin = randomUUID();
  await db.query("insert into public.profiles values ($1,'admin','active')", [admin]);
  await db.exec('set role service_role');
  return { db, admin };
}

async function createWeek(db, actor, request, course, title, goal = null) {
  return db.query('select public.edu_create_curriculum_week($1,$2,$3,$4,$5) as result', [actor, request, course, title, goal]);
}

async function setArchived(db, actor, course, id, archived, reassign = false) {
  return db.query('select public.edu_set_curriculum_archive($1,$2,$3,$4,$5,$6) as result', [actor, course, 'week', id, archived, reassign]);
}

test('new weeks reuse the lowest active slot; a conflicting restore requires confirmation and preserves history', async () => {
  const { db, admin } = await fixture({ generatedActiveNumber: true });
  try {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query("select has_function_privilege($1,'public.save_course_curriculum(uuid,uuid,jsonb)','EXECUTE') as allowed", [role])).rows[0].allowed, false);
    }
    const course = randomUUID(), original = randomUUID(), originalLesson = randomUUID(), originalMission = randomUUID();
    const createFirstRequest = randomUUID(), createSecondRequest = randomUUID();
    await db.query('insert into public.courses values ($1)', [course]);
    await db.query('insert into public.curriculum_weeks(id,course_id,week_number,title,archived_at) values ($1,$2,1,$3,now())', [original, course, '기존 1주차']);
    await db.query('insert into public.curriculum_lessons(id,week_id,archived_at) values ($1,$2,now())', [originalLesson, original]);
    await db.query('insert into public.curriculum_missions(id,lesson_id,archived_at) values ($1,$2,now())', [originalMission, originalLesson]);
    await db.query('insert into public.lesson_progress values (1,$1)', [originalLesson]);
    await db.query('insert into public.mission_submissions values (1,$1)', [originalMission]);

    const first = (await createWeek(db, admin, createFirstRequest, course, '새로 만든 1주차')).rows[0].result;
    assert.equal(first.week_number, 1);
    const replay = (await createWeek(db, admin, createFirstRequest, course, '새로 만든 1주차')).rows[0].result;
    assert.equal(replay.id, first.id, 'the same create request must be idempotent');
    const second = (await createWeek(db, admin, createSecondRequest, course, '새로 만든 2주차')).rows[0].result;
    assert.equal(second.week_number, 2);
    await assert.rejects(createWeek(db, admin, createFirstRequest, course, '다른 내용'), /같은 요청 ID로 다른 내용을 저장할 수 없습니다/);

    await assert.rejects(setArchived(db, admin, course, original, false), /CURRICULUM_WEEK_NUMBER_IN_USE/);
    const unchanged = await db.query('select archived_at is not null as archived, week_number from public.curriculum_weeks where id=$1', [original]);
    assert.deepEqual(unchanged.rows[0], { archived: true, week_number: 1 });

    const restored = (await setArchived(db, admin, course, original, false, true)).rows[0].result;
    assert.equal(restored.week_number, 3);
    assert.equal(restored.previous_week_number, 1);
    const history = await db.query(`select
      (select count(*)::int from public.lesson_progress where lesson_id=$1) as progress,
      (select count(*)::int from public.mission_submissions where mission_id=$2) as submissions,
      (select week_id=$3 from public.curriculum_lessons where id=$1) as original_link`, [originalLesson, originalMission, original]);
    assert.deepEqual(history.rows[0], { progress: 1, submissions: 1, original_link: true });
    const active = await db.query('select week_number from public.curriculum_weeks where course_id=$1 and archived_at is null order by week_number', [course]);
    assert.deepEqual(active.rows.map(row => row.week_number), [1, 2, 3]);

    const otherCourse = randomUUID();
    await db.query('insert into public.courses values ($1)', [otherCourse]);
    await db.query('insert into public.curriculum_weeks(course_id,week_number,title) values ($1,1,$2),($1,3,$3)', [otherCourse, '활성 1주차', '활성 3주차']);
    const gap = (await createWeek(db, admin, randomUUID(), otherCourse, '빈 번호 채우기')).rows[0].result;
    assert.equal(gap.week_number, 2);
    const concurrentCourse = randomUUID();
    await db.query('insert into public.courses values ($1)', [concurrentCourse]);
    const parallelCreates = await Promise.all([
      createWeek(db, admin, randomUUID(), concurrentCourse, '동시 생성 A'),
      createWeek(db, admin, randomUUID(), concurrentCourse, '동시 생성 B'),
    ]);
    assert.deepEqual(parallelCreates.map(result => result.rows[0].result.week_number).sort((a, b) => a - b), [1, 2]);
    const oldArchived = randomUUID();
    await db.query('insert into public.curriculum_weeks(id,course_id,week_number,title,archived_at) values ($1,$2,5,$3,now())', [oldArchived, otherCourse, '번호가 비어 있는 복구 주차']);
    const unoccupiedRestore = (await setArchived(db, admin, otherCourse, oldArchived, false)).rows[0].result;
    assert.equal(unoccupiedRestore.week_number, 5, 'a collision-free restore keeps the original number');
  } finally { await db.close(); }
});

test('reordering uses active weeks only and leaves archived numbers untouched', async () => {
  const { db, admin } = await fixture();
  try {
    const course = randomUUID();
    const [intro, one, two, three, archived] = Array.from({ length: 5 }, () => randomUUID());
    await db.query('insert into public.courses values ($1)', [course]);
    await db.query(`insert into public.curriculum_weeks(id,course_id,week_number,title,archived_at) values
      ($1,$6,0,'온보딩',null),($2,$6,1,'1주차',null),($3,$6,2,'2주차',null),($4,$6,3,'3주차',null),($5,$6,1,'보관된 예전 1주차',now())`, [...[intro, one, two, three, archived], course]);
    const result = await db.query('select public.edu_admin_reorder_weeks($1,$2,$3) as changed', [admin, course, [intro, three, one, two]]);
    assert.equal(result.rows[0].changed, 4);
    const values = await db.query('select id,week_number,archived_at is not null as archived from public.curriculum_weeks where course_id=$1 order by archived_at nulls first,week_number', [course]);
    assert.deepEqual(values.rows.map(row => [row.id, row.week_number, row.archived]), [
      [intro, 0, false], [three, 1, false], [one, 2, false], [two, 3, false], [archived, 1, true],
    ]);
    await assert.rejects(db.query('insert into public.curriculum_weeks(course_id,week_number,title) values ($1,1,$2)', [course, '중복 활성 주차']), /curriculum_weeks_active_course_week_number_key/);
    assert.equal((await db.query("select count(*)::int as count from public.audit_logs where action='curriculum.weeks_reordered'")).rows[0].count, 1);
  } finally { await db.close(); }
});
