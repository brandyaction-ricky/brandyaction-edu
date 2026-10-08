import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { emptySource, logic, contract } from './helpers/edu-export.mjs';

const migration = readFileSync(new URL('../supabase/migrations/20261008041631_edu_export_safe_product_codes.sql', import.meta.url), 'utf8');
const normalize = code => 'PRD-' + createHash('md5').update(code).digest('hex').slice(0, 16).toUpperCase();
const setup = async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table courses(id uuid primary key,course_code text not null unique,slug text,title text,list_price int);
    create table audit_logs(id bigint generated always as identity,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
    grant select,insert,update on courses to service_role;`);
  return db;
};

test('automatic codes retain product identity and retry determinism while all export privacy checks stay enabled', async t => {
  const db = await setup();t.after(() => db.close());
  const id = randomUUID(), code = 'PRD-' + randomUUID(), manual = randomUUID();
  await db.query("insert into courses values($1,$2,'unchanged-url','synthetic product',120000),($3,'moonshot','manual-url','manual product',10000)", [id,code,manual]);
  const before = (await db.query('select * from courses where id=$1', [id])).rows[0];
  const source = emptySource(), cohort = randomUUID();
  source.cohorts = [{id:cohort,course_code:code,cohort_code:'DEFAULT',operation_end_at:null}];
  source.orders = [{id:'synthetic-order',created_at:'2026-10-07T01:00:00Z',paid_at:'2026-10-07T01:00:00Z',status:'paid',entry_src:'paid',first_paid_order_id:'synthetic-order'}];
  source.items = [{order_id:'synthetic-order',cohort_id:cohort}];
  source.payments = [{id:'synthetic-payment',order_id:'synthetic-order',approved_amount:120000,cancelled_amount:0}];
  const build = ds => logic.aggregateExport(ds,source,['2026-10-07'],new Date('2026-10-08T04:00:00Z'));
  const totalsBefore = build('daily_totals'), campaignBefore = build('daily_campaign_perf'), opsBefore = build('ops_daily');
  assert.equal(contract.validExport('daily_totals',totalsBefore),false);
  assert.equal(contract.validExport('daily_campaign_perf',campaignBefore),false);
  assert.equal(contract.validExport('ops_daily',opsBefore),true);

  await db.exec(migration);await db.exec(migration);
  const after = (await db.query('select * from courses where id=$1',[id])).rows[0];
  assert.deepEqual(after,{...before,course_code:normalize(code)});
  assert.equal((await db.query('select course_code from courses where id=$1',[manual])).rows[0].course_code,'moonshot');
  const audit = (await db.query('select * from audit_logs')).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].before_data.course_code,code);assert.equal(audit[0].after_data.course_code,after.course_code);
  source.cohorts[0].course_code = after.course_code;
  for (const ds of ['daily_totals','daily_campaign_perf','ops_daily']) assert.equal(contract.validExport(ds,build(ds)),true);
  const relabel = rows => rows.map(r => r.cohort_code ? {...r,cohort_code:after.course_code+':DEFAULT'} : r);
  assert.deepEqual(build('daily_totals').rows,relabel(totalsBefore.rows));
  assert.deepEqual(build('daily_campaign_perf').rows,relabel(campaignBefore.rows));
  assert.deepEqual(build('ops_daily'),opsBefore);
  assert.equal(contract.exportPrivacySafe({anything:randomUUID()}),false);
  assert.equal(contract.exportPrivacySafe({email:'synthetic@example.test'}),false);

  await db.exec('set role service_role');
  const nextId = randomUUID(), nextCode = 'PRD-' + randomUUID();
  await db.query('insert into courses(id,course_code) values($1,$2)',[nextId,nextCode]);
  await db.query('update courses set course_code=$2 where id=$1',[nextId,nextCode]);
  assert.equal((await db.query('select course_code from courses where id=$1',[nextId])).rows[0].course_code,normalize(nextCode));
  await db.exec('reset role');
  for (const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    await assert.rejects(db.query('update courses set course_code=\'changed\' where id=$1',[id]),/permission denied/);
    await db.exec('reset role');
  }
  // Restore only the recorded migration rows, conditional on the current code still matching.
  await db.exec(`begin; drop trigger edu_normalize_automatic_product_code on courses;
    update courses c set course_code=a.before_data->>'course_code' from audit_logs a
    where a.action='product.export_code_normalized.v1' and a.entity_id=c.id::text
      and c.course_code=a.after_data->>'course_code';commit;`);
  assert.deepEqual((await db.query('select * from courses where id=$1',[id])).rows[0],before);
  assert.equal((await db.query('select course_code from courses where id=$1',[nextId])).rows[0].course_code,normalize(nextCode));
});

test('a colliding existing business code rolls back the whole migration and its trigger',async t => {
  const db=await setup();t.after(()=>db.close());
  const code='PRD-'+randomUUID();
  await db.query('insert into courses(id,course_code) values($1,$2),($3,$4)',[randomUUID(),code,randomUUID(),normalize(code)]);
  const before=(await db.query('select course_code from courses order by course_code')).rows;
  await assert.rejects(db.exec(migration),/duplicate key/);await db.exec('rollback');
  assert.deepEqual((await db.query('select course_code from courses order by course_code')).rows,before);
  assert.equal((await db.query('select * from audit_logs')).rows.length,0);
  assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='edu_normalize_automatic_product_code'")).rows[0].n,0);
});
