import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261001180000_cohort_curriculum_visibility.sql', import.meta.url), 'utf8');

test('existing cohort remains visible; new cohort starts hidden; scoped saves are atomic', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create schema edu_private;
      grant usage on schema edu_private to authenticated, service_role;
      create table public.profiles(id uuid primary key, role text, status text);
      create table public.site_settings(key text primary key,value jsonb);
      create table public.courses(id uuid primary key);
      create table public.cohorts(id uuid primary key,course_id uuid references public.courses(id),name text);
      create table public.curriculum_weeks(id uuid primary key,course_id uuid references public.courses(id),is_published boolean,archived_at timestamptz,week_number integer);
      create table public.curriculum_lessons(id uuid primary key,week_id uuid references public.curriculum_weeks(id),is_published boolean,archived_at timestamptz,title text,day_number integer);
      create table public.lesson_contents(lesson_id uuid primary key,body_text text,vod_url text,external_url text,resource_storage_path text);
      create table public.curriculum_missions(id uuid primary key,lesson_id uuid);
      create table public.enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
      create table public.edu_lesson_block_heads(lesson_id uuid primary key,revision uuid);
      create table public.edu_lesson_block_versions(id uuid primary key,document jsonb);
      create table public.lesson_progress(enrollment_id uuid,lesson_id uuid,updated_at timestamptz);
      create function public.edu_is_graduate_enrollment(uuid) returns boolean language sql stable as $$select false$$;
      create function public.edu_lesson_progression_gate(uuid,uuid) returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function public.edu_assert_message_actor(uuid) returns void language plpgsql as $$begin null; end;$$;
      grant all on all tables in schema public to service_role;
    `);
    const [admin, course, otherCourse, fourth, fifth, week, lesson, otherWeek, otherLesson] = Array.from({ length: 9 }, randomUUID);
    await db.query("insert into public.profiles values ($1,'admin','active')", [admin]);
    await db.query('insert into public.courses values ($1),($2)', [course, otherCourse]);
    await db.query("insert into public.cohorts values ($1,$2,'4기')", [fourth, course]);
    await db.query('insert into public.curriculum_weeks values ($1,$2,true,null,1),($3,$4,true,null,1)', [week, course, otherWeek, otherCourse]);
    await db.query("insert into public.curriculum_lessons values ($1,$2,true,null,'기존 수업',1),($3,$4,true,null,'다른 상품',1)", [lesson, week, otherLesson, otherWeek]);
    await db.query("insert into public.lesson_contents values ($1,'기존 내용',null,null,null),($2,'다른 내용',null,null,null)", [lesson, otherLesson]);
    await db.exec(migration);
    await db.query("insert into public.cohorts values ($1,$2,'5기')", [fifth, course]);

    const visible = cohort => db.query('select public.edu_cohort_lesson_visible($1,$2) as value', [cohort, lesson]).then(result => result.rows[0].value);
    assert.equal(await visible(fourth), true);
    assert.equal(await visible(fifth), false);
    const save = (cohort, changes) => db.query('select public.edu_save_cohort_curriculum_visibility($1,$2,$3::jsonb)', [admin, cohort, JSON.stringify(changes)]);
    await db.exec('set role service_role');
    await save(fifth, [{ kind: 'week', id: week, expected: false, published: true }, { kind: 'lesson', id: lesson, expected: false, published: true }]);
    assert.equal(await visible(fifth), true);
    assert.equal(await visible(fourth), true);
    await assert.rejects(save(fifth, [{ kind: 'week', id: week, expected: true, published: false }, { kind: 'lesson', id: lesson, expected: false, published: false }]), /COHORT_VISIBILITY_STALE/);
    assert.equal(await visible(fifth), true, 'stale batch must roll back its earlier week update');
    await assert.rejects(save(fifth, [{ kind: 'lesson', id: otherLesson, expected: false, published: true }]), /COHORT_VISIBILITY_INVALID/);
    await save(fourth, [{ kind: 'lesson', id: lesson, expected: true, published: false }]);
    assert.equal(await visible(fourth), false);
    assert.equal(await visible(fifth), true);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query("select has_function_privilege($1,'public.edu_save_cohort_curriculum_visibility(uuid,uuid,jsonb)','EXECUTE') as allowed", [role])).rows[0].allowed, role === 'service_role');
    }
    const learner = randomUUID();
    await db.query("insert into public.profiles values ($1,'member','active')", [learner]);
    await db.query("insert into public.enrollments(id,user_id,course_id,cohort_id,status,access_starts_at) values ($1,$2,$3,$4,'active',now()-interval '1 day')", [randomUUID(), learner, course, fifth]);
    await db.exec(`
      create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
      alter table public.curriculum_weeks enable row level security;
      alter table public.curriculum_lessons enable row level security;
      alter table public.lesson_contents enable row level security;
      create policy published_weeks on public.curriculum_weeks for select to authenticated using(is_published);
      create policy published_lessons on public.curriculum_lessons for select to authenticated using(is_published);
      create policy enrolled_contents on public.lesson_contents for select to authenticated using(true);
      grant select on public.curriculum_weeks,public.curriculum_lessons,public.lesson_contents to authenticated;
      set role authenticated;
    `);
    await db.query("select set_config('test.actor',$1,false)", [learner]);
    assert.deepEqual((await db.query('select id from public.curriculum_weeks')).rows.map(row => row.id), [week]);
    assert.deepEqual((await db.query('select id from public.curriculum_lessons')).rows.map(row => row.id), [lesson]);
    assert.deepEqual((await db.query('select lesson_id from public.lesson_contents')).rows.map(row => row.lesson_id), [lesson]);
    await db.exec('reset role');
  } finally { await db.close(); }
});
