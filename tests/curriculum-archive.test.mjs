import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260929120000_product_curriculum_archive.sql', import.meta.url), 'utf8');

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key, role text not null, status text not null);
    create table site_settings(key text primary key, value jsonb not null);
    create table courses(id uuid primary key);
    create table curriculum_weeks(id uuid primary key, course_id uuid not null references courses, archived_at timestamptz, is_published boolean not null default false);
    create table curriculum_lessons(id uuid primary key, week_id uuid not null references curriculum_weeks, archived_at timestamptz, is_published boolean not null default false);
    create table curriculum_missions(id uuid primary key, lesson_id uuid not null references curriculum_lessons, archived_at timestamptz, is_published boolean not null default false);
    create table lesson_progress(id int primary key, lesson_id uuid references curriculum_lessons);
    create table mission_submissions(id int primary key, mission_id uuid references curriculum_missions);
    create table audit_logs(id int generated always as identity primary key, actor_user_id uuid, action text, entity_type text, entity_id text, after_data jsonb);
  `);
  await db.exec(migration);
  await db.exec(`
    insert into profiles values
      ('12345678-1234-1234-1234-123456789012','admin','active'),
      ('12345678-1234-1234-1234-123456789013','staff','active'),
      ('12345678-1234-1234-1234-123456789014','staff','suspended');
    insert into site_settings values ('edu_staff_permissions_12345678-1234-1234-1234-123456789013','{"products":true}');
    insert into courses values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    insert into curriculum_weeks(id,course_id,is_published) values
      ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true),
      ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
    insert into curriculum_lessons(id,week_id,is_published) values
      ('aaaaaaaa-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000001',true),
      ('aaaaaaaa-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000001',true);
    insert into curriculum_missions(id,lesson_id,is_published) values
      ('aaaaaaaa-0000-0000-0000-000000000021','aaaaaaaa-0000-0000-0000-000000000011',true),
      ('aaaaaaaa-0000-0000-0000-000000000022','aaaaaaaa-0000-0000-0000-000000000012',true);
    update curriculum_missions set archived_at=now(),is_published=false where lesson_id='aaaaaaaa-0000-0000-0000-000000000012';
    insert into lesson_progress values (1,'aaaaaaaa-0000-0000-0000-000000000011');
    insert into mission_submissions values (1,'aaaaaaaa-0000-0000-0000-000000000021');
  `);
  return db;
}

const actor = '12345678-1234-1234-1234-123456789012';
const course = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const week = 'aaaaaaaa-0000-0000-0000-000000000001';
const lesson = 'aaaaaaaa-0000-0000-0000-000000000011';

async function call(db, kind, id, archived, user = actor, targetCourse = course) {
  return db.query('select public.edu_set_curriculum_archive($1,$2,$3,$4,$5) as result', [user, targetCourse, kind, id, archived]);
}

test('archiving a week preserves learner records, hides its lessons/missions, and restores in reviewable stages', async () => {
  const db = await fixture();
  try {
    await call(db, 'week', week, true);
    const archived = await db.query(`select
      (select archived_at is not null and not is_published from curriculum_weeks where id=$1) as week_hidden,
      (select count(*) from curriculum_lessons where week_id=$1 and archived_at is not null and not is_published) as lessons_hidden,
      (select count(*) from curriculum_missions m join curriculum_lessons l on l.id=m.lesson_id where l.week_id=$1 and m.archived_at is not null and not m.is_published) as missions_hidden,
      (select count(*) from lesson_progress) as progress_count,
      (select count(*) from mission_submissions) as submission_count`, [week]);
    assert.deepEqual(archived.rows[0], { week_hidden: true, lessons_hidden: 2, missions_hidden: 2, progress_count: 1, submission_count: 1 });

    await call(db, 'week', week, false);
    const staged = await db.query('select (select archived_at is null from curriculum_weeks where id=$1) as week_restored, (select count(*) from curriculum_lessons where week_id=$1 and archived_at is not null) as lessons_still_archived', [week]);
    assert.deepEqual(staged.rows[0], { week_restored: true, lessons_still_archived: 2 });

    await call(db, 'lesson', lesson, false);
    const restored = await db.query(`select
      (select archived_at is null and not is_published from curriculum_lessons where id=$1) as lesson_private,
      (select archived_at is null and not is_published from curriculum_missions where lesson_id=$1) as mission_private,
      (select archived_at is not null and not archived_by_curriculum from curriculum_missions where lesson_id='aaaaaaaa-0000-0000-0000-000000000012') as prior_mission_archive_preserved,
      (select count(*) from audit_logs) as audit_count`, [lesson]);
    assert.deepEqual(restored.rows[0], { lesson_private: true, mission_private: true, prior_mission_archive_preserved: true, audit_count: 3 });
  } finally { await db.close(); }
});

test('archive RPC enforces active staff scope and item/course boundaries before mutation', async () => {
  const db = await fixture();
  try {
    const staff = '12345678-1234-1234-1234-123456789013';
    const suspended = '12345678-1234-1234-1234-123456789014';
    await assert.rejects(call(db, 'lesson', lesson, true, '12345678-1234-1234-1234-123456789015'), /CURRICULUM_FORBIDDEN/);
    await assert.rejects(call(db, 'lesson', lesson, true, suspended), /CURRICULUM_FORBIDDEN/);
    await call(db, 'lesson', lesson, true, staff);
    await assert.rejects(call(db, 'lesson', lesson, true, actor, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), /CURRICULUM_NOT_FOUND/);
    await assert.rejects(call(db, 'content', lesson, true), /CURRICULUM_INVALID/);
    const unchanged = await db.query('select count(*)::int as audit_count from audit_logs');
    assert.equal(unchanged.rows[0].audit_count, 1);
  } finally { await db.close(); }
});

test('archive RPC is executable only by service role, behind the permission-checked API', async () => {
  const db = await fixture();
  try {
    const privileges = await db.query(`select
      has_function_privilege('anon','public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean)','EXECUTE') as anon_exec,
      has_function_privilege('authenticated','public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean)','EXECUTE') as auth_exec,
      has_function_privilege('service_role','public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean)','EXECUTE') as service_exec`);
    assert.deepEqual(privileges.rows[0], { anon_exec: false, auth_exec: false, service_exec: true });
  } finally { await db.close(); }
});
