import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = Array.from({ length: 6 }, () => randomUUID());
const [admin, staff, free, paid, session, cohort] = ids;
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table profiles(id uuid primary key,role text,status text);
    create table site_settings(key text primary key,value jsonb);
    create table courses(id uuid primary key);
    create table cohorts(id uuid primary key,course_id uuid references courses(id));`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609210001_recruitment_funnel_draft.sql', import.meta.url), 'utf8'));
  await db.query("insert into profiles values ($1,'admin','active'),($2,'staff','active')", [admin, staff]);
  await db.query('insert into courses values ($1),($2)', [free, paid]);
  await db.query('insert into cohorts values ($1,$2),($3,$4)', [session, free, cohort, paid]);
});
after(() => db.close());
const save = async (actor, request, version, targetSession = session) => (await db.query(
  'select edu_save_recruitment_funnel($1,$2,$3,$4,$5,$6,$7) as value', [actor,request,version,free,targetSession,paid,cohort])).rows[0].value;

test('funnel storage preserves audit, rejects stale writes, and replays identical requests only', async () => {
  const request = randomUUID();
  const one = await save(admin, request, 0);
  assert.equal(one.version, 1);
  assert.deepEqual(await save(admin, request, 0), one);
  await assert.rejects(save(admin, request, 1), /CONVERSION_REQUEST_REUSED/);
  await assert.rejects(save(admin, randomUUID(), 0), /CONVERSION_STALE/);
  assert.equal((await save(admin, randomUUID(), 1)).version, 2);
  assert.equal((await db.query('select count(*)::int as n from edu_recruitment_funnel_revisions')).rows[0].n, 2);
});
test('cross-product cohorts and revoked operator access are checked in the transaction', async () => {
  await assert.rejects(save(admin, randomUUID(), 2, cohort), /CONVERSION_INVALID/);
  await assert.rejects(save(staff, randomUUID(), 2), /CONVERSION_FORBIDDEN/);
  await db.query('insert into site_settings values ($1,$2)', [`edu_staff_permissions_${staff}`, { marketing: true, products: true }]);
  const request = randomUUID();
  assert.equal((await save(staff, request, 2)).version, 3);
  await db.query('update site_settings set value=$1', [{ marketing: true, products: false }]);
  await assert.rejects(save(staff, request, 2), /CONVERSION_FORBIDDEN/);
});
test('default Supabase grants cannot expose or directly mutate funnel revisions', async () => {
  const table = 'public.edu_recruitment_funnel_revisions';
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'SELECT']) {
      const result = await db.query('select has_table_privilege($1,$2,$3) as allowed', [role,table,privilege]);
      assert.equal(result.rows[0].allowed, role === 'service_role' && privilege === 'SELECT');
    }
    const result = await db.query('select has_function_privilege($1,$2,$3) as allowed', [role,'public.edu_save_recruitment_funnel(uuid,uuid,integer,uuid,uuid,uuid,uuid)','EXECUTE']);
    assert.equal(result.rows[0].allowed, role === 'service_role');
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.edu_recruitment_funnel_revisions'::regclass")).rows[0].relrowsecurity, true);
});
