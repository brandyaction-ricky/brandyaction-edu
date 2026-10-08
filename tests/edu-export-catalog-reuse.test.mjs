import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const migration = read('20261008035854_edu_export_catalog_reuse.sql');
const oldFragment = migration.split('$old$')[1];
const newFragment = migration.split('$new$')[1];
const helper = read('20261003074442_learning_usage_evidence_e3a.sql')
  .match(/create function public\.edu_learning_usage_catalog\(p_enrollment uuid\)[\s\S]*?\$\$;/)[0];
const sorted = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

test('catalog reuse preserves the canonical multiset and exclusions, calls once per group, and keeps access boundaries', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    create table profiles(id uuid primary key,role text,status text,is_internal boolean,deleted_at timestamptz);
    create table orders(id uuid primary key,user_id uuid,total_amount int,is_test_order boolean);
    create table order_items(id uuid primary key,order_id uuid);
    create table enrollments(id uuid primary key,user_id uuid,order_item_id uuid,course_id uuid,cohort_id uuid,source text);
    create table courses(id uuid primary key,metadata jsonb);
    create table curriculum_weeks(id uuid primary key,course_id uuid,archived_at timestamptz);
    create table curriculum_lessons(id uuid primary key,week_id uuid,title text,archived_at timestamptz);
    create table lesson_contents(lesson_id uuid,vod_url text,resource_storage_path text);
    create table edu_lesson_block_heads(lesson_id uuid,revision uuid);
    create table edu_lesson_block_versions(id uuid,document jsonb);
    create table cohort_sessions(id uuid primary key,cohort_id uuid,title text,is_public boolean);
    create table cohort_session_contents(session_id uuid,live_url text,replay_url text,resource_storage_path text);
    create function public.edu_cohort_lesson_visible(uuid,uuid) returns boolean language sql as 'select false';
  `);
  const e1 = read('20261005020515_edu_internal_order_analytics_e1.sql');
  for (const name of ['edu_analytics_members', 'edu_analytics_orders']) {
    await db.exec(e1.match(new RegExp('create view public\\.' + name + '[\\s\\S]*?;'))[0]);
    await db.exec('grant select on public.' + name + ' to service_role');
  }
  await db.exec(helper);
  await db.exec(`create function public.edu_export_v1_source(p_from date,p_to date,p_asof timestamptz)
    returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='4s' as $$
    begin return jsonb_build_object(${oldFragment} 'sentinel','preserved'); end $$;
    revoke all on function public.edu_export_v1_source(date,date,timestamptz) from public,anon,authenticated;
    grant execute on function public.edu_export_v1_source(date,date,timestamptz) to service_role;`);

  const student = uuid(), course = uuid(), secondCourse = uuid(), cohort = uuid(), secondCohort = uuid();
  await db.query("insert into profiles values($1,'student','active',false,null)", [student]);
  const resource = uuid();
  await db.query('insert into courses values($1,$2),($3,$4)', [course, { product_resources: [
    { id: resource, name: 'synthetic', path: 'synthetic/file', scope: 'enrolled' },
    { id: resource, name: 'synthetic duplicate', path: 'synthetic/file', scope: 'purchaser' },
    { id: uuid(), path: 'synthetic/private', scope: 'authenticated' },
    { id: 'invalid-id', path: 'synthetic/invalid', scope: 'enrolled' },
  ] }, secondCourse, {}]);
  const week = uuid(), archivedWeek = uuid();
  await db.query('insert into curriculum_weeks values($1,$2,null),($3,$2,now())', [week, course, archivedWeek]);
  for (const [w, archived, video, material, block] of [
    [week, false, 'synthetic-video', 'synthetic-material', false],
    [week, false, null, null, true],
    [week, true, 'archived', null, false],
    [archivedWeek, false, 'archived-week', null, false],
  ]) {
    const lesson = uuid(), revision = uuid();
    await db.query('insert into curriculum_lessons values($1,$2,\'synthetic lesson\',$3)', [lesson, w, archived ? '2026-01-01' : null]);
    await db.query('insert into lesson_contents values($1,$2,$3)', [lesson, video, material]);
    if (block) {
      await db.query('insert into edu_lesson_block_heads values($1,$2)', [lesson, revision]);
      await db.query('insert into edu_lesson_block_versions values($1,$2)', [revision, { blocks: [{ type: 'video' }] }]);
    }
  }
  for (const c of [cohort, secondCohort]) {
    const session = uuid();
    await db.query("insert into cohort_sessions values($1,$2,'synthetic session',false)", [session, c]);
    await db.query("insert into cohort_session_contents values($1,'live','replay','material')", [session]);
  }
  const eligible = [];
  async function enroll({ user = student, c = course, h = cohort, source = 'purchase', amount = 10000, isTest = false, keep = true } = {}) {
    const order = uuid(), item = uuid(), enrollment = uuid();
    await db.query('insert into orders values($1,$2,$3,$4)', [order, user, amount, isTest]);
    await db.query('insert into order_items values($1,$2)', [item, order]);
    await db.query('insert into enrollments values($1,$2,$3,$4,$5,$6)', [enrollment, user, item, c, h, source]);
    if (keep) eligible.push(enrollment);
    return enrollment;
  }
  for (let n = 0; n < 40; n++) await enroll();
  await enroll({ h: secondCohort }); await enroll({ h: null }); await enroll({ c: secondCourse });
  await enroll({ source: 'admin_grant', keep: false });
  await enroll({ amount: 0, keep: false }); await enroll({ isTest: true, keep: false });
  for (const [role, status, internal, deleted] of [
    ['admin', 'active', false, null], ['staff', 'active', false, null],
    ['student', 'withdrawn', false, null], ['student', 'active', true, null],
    ['student', 'active', false, '2026-01-01'],
  ]) {
    const user = uuid(); await db.query('insert into profiles values($1,$2,$3,$4,$5)', [user, role, status, internal, deleted]);
    await enroll({ user, keep: false });
  }
  const snapshot = async () => (await db.query("select public.edu_export_v1_source(current_date,current_date,now()) value")).rows[0].value;
  await db.exec('set role service_role');
  const before = await snapshot();
  assert.ok(before.catalog.length > 40);
  assert.deepEqual(new Set(before.catalog.map(r => r.enrollment_id)), new Set(eligible));
  await db.exec('reset role');
  await db.exec(migration); await db.exec(migration); // Safe replay of exactly this migration.
  await db.exec('set role service_role');
  const after = await snapshot();
  assert.equal(after.sentinel, before.sentinel);
  assert.deepEqual(sorted(after.catalog), sorted(before.catalog));
  await db.exec('reset role');
  const metadata = (await db.query("select prosecdef,proconfig from pg_proc where oid='public.edu_export_v1_source(date,date,timestamptz)'::regprocedure")).rows[0];
  assert.equal(metadata.prosecdef, false);
  assert.ok(metadata.proconfig.includes('statement_timeout=4s'));
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role); await assert.rejects(snapshot(), /permission denied/); await db.exec('reset role');
  }

  // Instrument only this isolated synthetic database after the guarded migration.
  await db.exec(`alter function public.edu_learning_usage_catalog(uuid) rename to edu_learning_usage_catalog_original;
    create sequence catalog_calls;
    create function public.edu_learning_usage_catalog(p_enrollment uuid)
    returns table(item_type text,item_id uuid,title text,available boolean)
    language plpgsql volatile security invoker set search_path='' as $$
    begin perform nextval('public.catalog_calls');
      return query select * from public.edu_learning_usage_catalog_original(p_enrollment); end $$;`);
  assert.deepEqual(sorted((await snapshot()).catalog), sorted(before.catalog));
  assert.equal((await db.query('select last_value from catalog_calls')).rows[0].last_value, 4);
  await assert.rejects(db.exec(migration), /EXPORT_CATALOG_DEPENDENCY_CHANGED/); await db.exec('rollback');
  await db.exec('drop function public.edu_learning_usage_catalog(uuid); alter function public.edu_learning_usage_catalog_original(uuid) rename to edu_learning_usage_catalog');
  // A later source rewrite must not be silently overwritten by this patch.
  const definition = (await db.query("select pg_get_functiondef('public.edu_export_v1_source(date,date,timestamptz)'::regprocedure) value")).rows[0].value;
  await db.exec(definition.replace(newFragment, "'catalog','[]'::jsonb,"));
  await assert.rejects(db.exec(migration), /EXPORT_CATALOG_SOURCE_CHANGED/); await db.exec('rollback');
});
