import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// An isolated, in-memory test model. No connection URL, remote database, Storage
// object write, or production installer is used by this harness.
const root = new URL('../', import.meta.url);
const fixture = new URL('./fixtures/campus-dev-transactional-substrate.sql', import.meta.url);
const smokePath = new URL('integration/campus/dev-migrations/03-transactional-qa.sql', root);
const manifest = JSON.parse(readFileSync(new URL('integration/campus/dev-migrations/manifest.json', root), 'utf8'));
const namespace = 'f03c2026-1103-4000-8000-';
// Reviewed LOCAL fixture fingerprint, deliberately different from the DEV baseline.
// Never regenerate it automatically at runtime to accept unreviewed trigger drift.
const localSeedFingerprint = 'af7e8c1614d789e176ccefd01b204b02';
// This local fixture intentionally implements none of the five CRM/Tips functions.
// md5('') is its frozen baseline, not a claim that live automation was modeled.
const localAutomationFingerprint = 'd41d8cd98f00b204e9800998ecf8427e';
const quote = name => `"${name.replaceAll('"', '""')}"`;

// Model the existing cohort publication gate from its committed migration, not
// a permissive stand-in. Only DDL, visibility functions and the two relevant
// restrictive policies are needed here; historical backfills/admin RPCs are not
// replayed. Marker checks deliberately stop if the canonical source changes.
async function installCohortPublicationModel(db) {
  const sql = readFileSync(new URL('supabase/migrations/20261001180000_cohort_curriculum_visibility.sql', root), 'utf8');
  const section = (start, end) => {
    assert.equal(sql.split(start).length, 2, `Review cohort publication marker: ${start}`);
    assert.equal(sql.split(end).length, 2, `Review cohort publication marker: ${end}`);
    const begin = sql.indexOf(start);
    const finish = sql.indexOf(end, begin);
    assert.ok(finish > begin, 'Cohort publication source section order changed');
    return sql.slice(begin, finish);
  };
  await db.exec(`create schema edu_private;
    grant usage on schema edu_private to authenticated,service_role;
    create table public.site_settings(key text primary key,value jsonb);`);
  await db.exec(section('create table public.edu_cohort_week_visibility (', 'insert into public.edu_cohort_week_visibility(cohort_id,week_id,is_published)\nselect'));
  await db.exec(section('create function edu_private.edu_cohort_week_visible(', '-- Direct PostgREST reads of bodies and missions'));
  await db.exec(section('create function edu_private.edu_member_lesson_visible(', '-- The marketing catalog uses anon'));
  await db.exec(section('create policy cohort_visible_curriculum_weeks ', 'create policy cohort_visible_lesson_contents '));
}

async function setup() {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(fixture, 'utf8'));
    assert.equal(manifest.migrations.length, 11, 'Review any change to the eleven-migration QA scope');
    const paths = manifest.migrations.map(migration => migration.path);
    assert.deepEqual(paths, [...paths].sort());
    for (const path of paths) {
      try { await db.exec(readFileSync(new URL(path, root), 'utf8')); }
      catch (cause) { throw new Error(`Local transactional QA migration failed: ${path}`, { cause }); }
    }
    await installCohortPublicationModel(db);
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function tableSnapshot(db) {
  const tables = (await db.query(`select schemaname, tablename from pg_tables
    where schemaname in ('auth', 'public', 'private', 'realtime', 'storage')
    order by schemaname, tablename`)).rows;
  const snapshot = {};
  for (const { schemaname, tablename } of tables) {
    const name = `${quote(schemaname)}.${quote(tablename)}`;
    snapshot[name] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) rows from ${name} t`)).rows[0].rows;
  }
  return snapshot;
}

async function assertNoFixtureRows(db) {
  const columns = (await db.query(`select table_schema, table_name, column_name
    from information_schema.columns where table_schema in ('auth', 'public', 'private')
    and data_type='uuid' order by table_schema, table_name, ordinal_position`)).rows;
  for (const { table_schema, table_name, column_name } of columns) {
    const name = `${quote(table_schema)}.${quote(table_name)}`;
    const count = (await db.query(`select count(*)::int n from ${name} where ${quote(column_name)}::text like $1`, [`${namespace}%`])).rows[0].n;
    assert.equal(count, 0, `Transactional fixture leaked into ${name}.${column_name}`);
  }
}

test('transactional QA substrate composes with all eleven migrations and models profile creation plus owner RLS', async () => {
  const db = await setup();
  try {
    await db.exec(`begin;
      insert into auth.users(id,email,raw_user_meta_data) values
        ('${namespace}000000000001','local-owner@example.invalid','{"full_name":"Local owner"}'),
        ('${namespace}000000000002','local-peer@example.invalid','{}');
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${namespace}000000000001',true);`);
    const profiles = (await db.query('select id,full_name from public.profiles')).rows;
    assert.deepEqual(profiles, [{ id: `${namespace}000000000001`, full_name: 'Local owner' }]);
    await db.exec('rollback;');
    await assertNoFixtureRows(db);
  } finally { await db.close(); }
});

test('the exact DEV transactional smoke SQL executes locally and rolls back every fixture row', async () => {
  const db = await setup();
  try {
    const sql = readFileSync(smokePath, 'utf8');
    const statements = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim();
    assert.match(statements, /^begin\s*;/i, 'Smoke must own a single rollback transaction');
    assert.match(statements, /rollback\s*;\s*$/i, 'Smoke must end in ROLLBACK');
    await assertNoFixtureRows(db);
    const before = await tableSnapshot(db);
    await assert.rejects(db.exec(sql), /caller has not verified the DEV project identity/);
    await db.exec('rollback;reset role;');
    assert.deepEqual(await tableSnapshot(db), before, 'Unverified target changed the local fixture');
    // This is a simulated target guard inside a newly created in-memory database,
    // not evidence that any external connection points at the DEV project.
    await db.query("select set_config('campus.qa.verified_project_ref',$1,false)", [manifest.targetProject]);
    await assert.rejects(db.exec(sql), /seed trigger\/function metadata differs from the reviewed baseline/);
    await db.exec('rollback;reset role;');
    assert.deepEqual(await tableSnapshot(db), before, 'Missing reviewed seed baseline changed the local fixture');
    await db.query("select set_config('campus.qa.reviewed_seed_fingerprint',$1,false)", [localSeedFingerprint]);
    await assert.rejects(db.exec(sql), /automation functions differ from the reviewed baseline/);
    await db.exec('rollback;reset role;');
    assert.deepEqual(await tableSnapshot(db), before, 'Missing reviewed automation baseline changed the local fixture');
    await db.query("select set_config('campus.qa.reviewed_automation_fingerprint',$1,false)", [localAutomationFingerprint]);
    await db.exec(sql);
    await db.exec('reset role;');
    await assertNoFixtureRows(db);
    assert.deepEqual(await tableSnapshot(db), before, 'Smoke changed persistent local data despite ROLLBACK');
  } finally { await db.close(); }
});

test('the unchanged smoke rejects seed-trigger drift against the frozen local baseline before inserting fixtures', async () => {
  const db = await setup();
  try {
    await db.query("select set_config('campus.qa.verified_project_ref',$1,false)", [manifest.targetProject]);
    await db.query("select set_config('campus.qa.reviewed_seed_fingerprint',$1,false)", [localSeedFingerprint]);
    await db.query("select set_config('campus.qa.reviewed_automation_fingerprint',$1,false)", [localAutomationFingerprint]);
    await db.exec(`create function private.qa_unreviewed_profile_trigger() returns trigger language plpgsql as $$
      begin raise exception 'Unreviewed trigger must never execute'; end; $$;
      create trigger qa_unreviewed_profile before insert on public.profiles
      for each row execute function private.qa_unreviewed_profile_trigger();`);
    const before = await tableSnapshot(db);
    await assert.rejects(db.exec(readFileSync(smokePath, 'utf8')), /seed trigger\/function metadata differs from the reviewed baseline/);
    await db.exec('rollback;reset role;');
    await assertNoFixtureRows(db);
    assert.deepEqual(await tableSnapshot(db), before, 'Trigger drift was detected only after fixture mutation');
  } finally { await db.close(); }
});

test('the unchanged smoke rejects automation-function drift against its empty local baseline', async () => {
  const db = await setup();
  try {
    await db.query("select set_config('campus.qa.verified_project_ref',$1,false)", [manifest.targetProject]);
    await db.query("select set_config('campus.qa.reviewed_seed_fingerprint',$1,false)", [localSeedFingerprint]);
    await db.query("select set_config('campus.qa.reviewed_automation_fingerprint',$1,false)", [localAutomationFingerprint]);
    await db.exec(`create function public.crm_enqueue_automation() returns void language plpgsql as $$
      begin raise exception 'Unreviewed automation must never execute'; end; $$;`);
    const before = await tableSnapshot(db);
    await assert.rejects(db.exec(readFileSync(smokePath, 'utf8')), /automation functions differ from the reviewed baseline/);
    await db.exec('rollback;reset role;');
    await assertNoFixtureRows(db);
    assert.deepEqual(await tableSnapshot(db), before, 'Automation drift was detected only after fixture mutation');
  } finally { await db.close(); }
});


test('cohort publication is required for focus QA and every synthetic visibility row rolls back', async () => {
  const db = await setup();
  try {
    await db.query("select set_config('campus.qa.verified_project_ref',$1,false)", [manifest.targetProject]);
    await db.query("select set_config('campus.qa.reviewed_seed_fingerprint',$1,false)", [localSeedFingerprint]);
    await db.query("select set_config('campus.qa.reviewed_automation_fingerprint',$1,false)", [localAutomationFingerprint]);
    const sql = readFileSync(smokePath, 'utf8');
    const before = await tableSnapshot(db);
    const publication = kind => new RegExp(`insert into public\\.edu_cohort_${kind}_visibility\\([^;]+;`, 'g');
    for (const omitted of [['week', 'lesson'], ['week'], ['lesson']]) {
      let incomplete = sql;
      for (const kind of omitted) {
        assert.equal([...incomplete.matchAll(publication(kind))].length, 1, 'Review QA cohort visibility seed statements');
        incomplete = incomplete.replace(publication(kind), '');
      }
      await assert.rejects(db.exec(incomplete), error => {
        assert.equal(error.code, '42501');
        assert.match(error.message, /row-level security policy for table "edu_campus_focus_sessions"/);
        return true;
      }, `Missing ${omitted.join('/')} publication must not bypass the existing learner gate`);
      await db.exec('rollback;reset role;');
      await assertNoFixtureRows(db);
      assert.deepEqual(await tableSnapshot(db), before, 'Failed QA left a synthetic publication or account behind');
    }
    await db.exec(sql);
    await db.exec('reset role;');
    await assertNoFixtureRows(db);
    assert.deepEqual(await tableSnapshot(db), before, 'Successful QA must also roll back all four publication rows');
  } finally { await db.close(); }
});
