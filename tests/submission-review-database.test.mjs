import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const checks = {version:1,answers_complete:true,evidence_consistent:false,criteria_met:true};
before(async () => {
  await db.exec(fs.readFileSync(new URL('./fixtures/submission-review.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260925221921_submission_review_audit.sql',import.meta.url),'utf8'));
});
beforeEach(async () => {
  await db.exec('truncate mission_submissions,audit_logs; update profiles set status=\'active\';');
  await db.query('update site_settings set value=$1',[{members:true}]);
  await db.query('insert into mission_submissions(id) values ($1),($2)',[id(10),id(11)]);
});
after(()=>db.close());
const call = (ids=[id(10)],decision='approved',feedback='가상 피드백',check=checks,mode='single',actor=id(1)) => db.query('select public.review_mission_submissions_with_checks($1,$2,$3,$4,$5,$6)',[actor,ids,decision,feedback,check,mode]);
const state = async () => ({ submissions:(await db.query('select * from mission_submissions order by id')).rows, audit:(await db.query('select * from audit_logs order by id')).rows });
test('review/check/actor/feedback are stored atomically, unchecked is not an approval rule',async()=>{
  await call(); const {submissions,audit}=await state();
  assert.equal(submissions[0].status,'approved'); assert.equal(submissions[0].reviewed_by,id(1));
  assert.equal(submissions[0].reviewer_feedback,'가상 피드백'); assert.equal(audit.length,1);
  assert.deepEqual(audit[0].after_data.review_checks,checks); assert.equal(audit[0].after_data.review_mode,'single');
});
test('legacy four-argument callers and bulk records do not fabricate per-item checks',async()=>{
  await db.query('select review_mission_submissions($1,$2,$3,$4)',[id(1),[id(10)],'approved','']);
  await call([id(11)],'changes_requested','보완 이유',null,'bulk');
  const {audit}=await state(); assert.equal(audit[0].after_data.review_mode,'legacy'); assert.equal(audit[0].after_data.review_checks,null);
  assert.equal(audit[1].after_data.review_mode,'bulk'); assert.equal(audit[1].after_data.review_checks,null);
});
test('completed/missing item in bulk rolls back every row and audit entry',async()=>{
  await call([id(11)]);
  await assert.rejects(call([id(10),id(11)],'rejected','이유',null,'bulk'),{code:'PT409'});
  await assert.rejects(call([id(10),id(99)],'approved','',null,'bulk'),{code:'P0002'});
  const {submissions,audit}=await state(); assert.equal(submissions[0].status,'submitted'); assert.equal(audit.length,1);
});
test('check shape, IDs, decision and feedback are validated inside SQL',async()=>{
  for(const value of [null,{},[],{...checks,version:2},{...checks,criteria_met:'true'},{...checks,other:true}]) await assert.rejects(call(undefined,undefined,undefined,value),{code:'22023'});
  for(const ids of [[],[id(10),id(10)],[id(10),null],Array(51).fill(id(10))]) await assert.rejects(call(ids),{code:'22023'});
  await assert.rejects(call([id(10),id(11)]),{code:'22023'});
  await assert.rejects(call(undefined,'changes_requested',' '),{code:'22023'});
  await assert.rejects(call(undefined,'approved','x'.repeat(2001)),{code:'22023'});
  await assert.rejects(call(undefined,'unknown'),{code:'22023'});
  await assert.rejects(call(undefined,undefined,undefined,checks,'bulk'),{code:'22023'});
  assert.equal((await state()).audit.length,0);
});
test('active members scope is rechecked in SQL and public callers cannot invoke either RPC',async()=>{
  await call(undefined,undefined,undefined,undefined,undefined,id(2));
  await db.query('update site_settings set value=$1',[{products:true,members:'true'}]);
  await assert.rejects(call([id(11)],undefined,undefined,undefined,undefined,id(2)),{code:'42501'});
  await assert.rejects(call([id(11)],undefined,undefined,undefined,undefined,id(3)),{code:'42501'});
  await db.query('update profiles set status=\'inactive\' where id=$1',[id(1)]);
  await assert.rejects(call([id(11)]),{code:'42501'});
  for(const role of ['anon','authenticated']) for(const signature of ['review_mission_submissions(uuid,uuid[],text,text)','review_mission_submissions_with_checks(uuid,uuid[],text,text,jsonb,text)']) {
    assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,signature])).rows[0].ok,false);
  }
  await db.exec('set role authenticated'); assert.equal((await db.query('select * from audit_logs')).rows.length,0); await db.exec('reset role');
});
test('audit insertion failure rolls back the status update',async()=>{
  await db.exec("create function reject_fixture_audit() returns trigger language plpgsql as $$ begin raise exception 'fixture failure'; end $$; create trigger fixture_failure before insert on audit_logs for each row execute function reject_fixture_audit();");
  try { await assert.rejects(call(),/fixture failure/); assert.equal((await state()).submissions[0].status,'submitted'); }
  finally { await db.exec('drop trigger fixture_failure on audit_logs; drop function reject_fixture_audit();'); }
});
