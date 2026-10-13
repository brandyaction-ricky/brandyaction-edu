import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture, document, answers } from './helpers/lesson-block-review.mjs';
const root=new URL('../supabase/migrations/',import.meta.url);
const migration=fs.readFileSync(new URL('20261013044006_alumni_personal_practice.sql',root),'utf8');
const reentryMigration=fs.readFileSync(new URL('20261013080958_alumni_reentry_cohort_access.sql',root),'utf8');
async function setup(){
 const f=await fixture();const {db}=f;
 try{
 await db.exec(`reset role;alter table courses add column category text default 'paid_class';alter table cohorts add column status text default 'in_progress';alter table cohorts add column operation_end_at timestamptz;
 create schema if not exists edu_private;
 create table edu_ongoing_rules(lesson_id uuid primary key,cadence text);
 create table edu_ongoing_rounds(enrollment_id uuid,lesson_id uuid,revision uuid);
 create table edu_lesson_block_feedback(id uuid primary key,submission_id uuid references edu_lesson_block_submissions);
 create table mission_submissions(id uuid primary key,enrollment_id uuid references enrollments,status text);
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid references enrollments);
 grant select,insert,update on all tables in schema public to service_role;`);
 const visibility=fs.readFileSync(new URL('20261001180000_cohort_curriculum_visibility.sql',root),'utf8');
 await db.exec(visibility.split('\n').slice(0,62).join('\n').replace(/^begin;/,'')+'\ncommit;');
 const access=visibility.slice(visibility.indexOf('create or replace function public.edu_assert_block_access'),visibility.indexOf('create or replace function public.edu_read_lesson_progression'));
 await db.exec(access);
 await db.exec(fs.readFileSync(new URL('20261001024207_alumni_read_mode.sql',root),'utf8').split('\n').slice(0,21).join('\n').replace(/^begin;/,''));
 await db.exec(migration);await db.exec(reentryMigration);await db.exec('set role service_role');
 const query=async(sql,args)=>(await db.query(sql,args)).rows[0]?.result;
 const read=(actor=f.student,revision=f.revision)=>query('select edu_read_alumni_practice($1,$2,$3,$4) as result',[actor,f.lesson,f.enrollment,revision]);
 const save=({actor=f.student,revision=f.revision,expected=null,write=id(),values=answers}={})=>query('select edu_save_alumni_practice($1,$2,$3,$4,$5,$6,$7) as result',[actor,f.lesson,f.enrollment,revision,expected,write,values]);
 const graduate=()=>db.query("update cohorts set status='completed' where id=$1",[f.cohort]);
 return {...f,query,read,save,graduate};
 }catch(e){await db.close();throw e;}
}

test('recruiting alumni re-entry grants personal practice immediately but closes official submissions',async()=>{
 const f=await setup();try{
  const draft=await f.draft();
  await f.db.query("update cohorts set status='recruiting',operation_end_at=now()+interval '30 days' where id=$1",[f.cohort]);
  assert.equal((await f.db.query('select edu_is_graduate_enrollment($1) graduate',[f.enrollment])).rows[0].graduate,false);
  await f.db.query('update cohorts set alumni_access_on_enroll=true where id=$1',[f.cohort]);
  assert.equal((await f.db.query('select edu_is_graduate_enrollment($1) graduate',[f.enrollment])).rows[0].graduate,true);
  assert.equal((await f.save()).writeId.length>0,true);
  await assert.rejects(f.db.query("insert into edu_lesson_block_submissions(id,enrollment_id,lesson_id,revision,draft_write_id,values,assessment,outcome) values($1,$2,$3,$4,$5,$6,'{}','submitted')",[id(),f.enrollment,f.lesson,f.revision,draft,answers]),/ALUMNI_PARTICIPATION_CLOSED/);
  await f.db.query('update cohorts set alumni_access_on_enroll=false where id=$1',[f.cohort]);
  assert.equal((await f.db.query('select edu_is_graduate_enrollment($1) graduate',[f.enrollment])).rows[0].graduate,false);
 }finally{await f.db.close();}
});

test('personal input survives rereading with optimistic conflicts and leaves official drafts, submissions and progress intact',async()=>{
 const f=await setup();try{
 assert.deepEqual(await f.read(),{enabled:false,draft:null});await assert.rejects(f.save(),/BLOCK_FORBIDDEN/);
 const old=await f.draft();await f.submit();await f.graduate();
 const progressBefore=(await f.db.query('select count(*)::int n from lesson_progress')).rows[0].n;
 const before=await f.db.query('select values from edu_lesson_block_drafts where enrollment_id=$1',[f.enrollment]);
 const write=id(),personal={blocks:{q:'졸업 후 새로운 실습',quiz:{a:0}},checklist:[]};
 const saved=await f.save({write,values:personal});assert.deepEqual(await f.save({write,values:personal}),saved);
 assert.equal((await f.read()).draft.values.blocks.q,'졸업 후 새로운 실습');
 assert.deepEqual((await f.db.query('select values from edu_lesson_block_drafts where enrollment_id=$1',[f.enrollment])).rows,before.rows);
 await assert.rejects(f.save({write,values:answers}),/BLOCK_REQUEST_REUSED/);await assert.rejects(f.save(),/BLOCK_DRAFT_CHANGED/);
 const edited=await f.save({expected:saved.writeId});assert.deepEqual((await f.read()).draft.values,answers);assert.equal((await f.read()).draft.writeId,edited.writeId);
 assert.equal((await f.db.query('select count(*)::int n from edu_lesson_block_submissions')).rows[0].n,1);
 assert.equal((await f.db.query('select count(*)::int n from lesson_progress')).rows[0].n,progressBefore);
 for(const table of ['edu_lesson_block_reviews','edu_ongoing_completions','mission_submissions'])assert.equal((await f.db.query('select count(*)::int n from '+table)).rows[0].n,0);
 }finally{await f.db.close();}
});

test('graduated learner can practice a progression-locked lesson; wrong owner, hidden cohort, revocation and stale revisions fail closed',async()=>{
 const f=await setup({...document});try{
 await f.db.query("update edu_lesson_block_versions set document=jsonb_set(document,'{progression}','{\"track\":\"daily\",\"dayNumber\":2}') where id=$1",[f.revision]);
 await assert.rejects(f.db.query('select edu_assert_block_access($1,$2,$3)',[f.student,f.lesson,f.enrollment]),/BLOCK_LESSON_LOCKED/);
 await f.graduate();const first=await f.save();assert.equal((await f.read()).draft.writeId,first.writeId);
 for(const run of [()=>f.read(f.other),()=>f.save({actor:f.other})])await assert.rejects(run(),/BLOCK_FORBIDDEN/);
 await f.db.query('update edu_cohort_lesson_visibility set is_published=false where cohort_id=$1',[f.cohort]);await assert.rejects(f.save({expected:first.writeId}),/BLOCK_FORBIDDEN/);
 await f.db.query('update edu_cohort_lesson_visibility set is_published=true where cohort_id=$1',[f.cohort]);
 const revision=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,revision,document]);
 await assert.rejects(f.save({expected:first.writeId}),/BLOCK_CONTENT_CHANGED/);assert.equal((await f.read(f.student,f.revision)).draft.writeId,first.writeId);
 const historic=(await f.db.query('select edu_read_lesson_blocks($1,$2,$3,$4) result',[f.student,f.lesson,f.enrollment,f.revision])).rows[0].result;assert.equal(historic.revision,f.revision);assert.equal(historic.previousDrafts.some(d=>d.revision===f.revision),true);
 await f.db.query("update profiles set status='inactive' where id=$1",[f.student]);await assert.rejects(f.save({revision}),/BLOCK_FORBIDDEN/);await f.db.query("update profiles set status='active' where id=$1",[f.student]);
 await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await assert.rejects(f.save({revision}),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});

test('official submissions, completion credit and mentor decisions stay closed after graduation, including direct server writes',async()=>{
 const f=await setup();try{
 const old=await f.draft(),submitted=await f.submit();await f.graduate();
 await assert.rejects(f.db.query("insert into edu_lesson_block_submissions(id,enrollment_id,lesson_id,revision,draft_write_id,values,assessment,outcome) values($1,$2,$3,$4,$5,$6,'{}','submitted')",[id(),f.enrollment,f.lesson,f.revision,old,answers]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.db.query("insert into edu_lesson_block_reviews(id,submission_id,actor_id,expected_state,decision) values($1,$2,$3,$2,'approved')",[id(),submitted.id,f.admin]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.db.query('insert into edu_lesson_block_feedback values($1,$2)',[id(),submitted.id]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.db.query("insert into mission_submissions values($1,$2,'submitted')",[id(),f.enrollment]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.db.query('insert into edu_ongoing_completions values($1,$2)',[id(),f.enrollment]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.db.query('update lesson_progress set progress_percent=99 where enrollment_id=$1 and lesson_id=$2',[f.enrollment,f.lesson]),/ALUMNI_PARTICIPATION_CLOSED/);
 for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.read(),/permission denied/);await assert.rejects(f.save(),/permission denied/);await assert.rejects(f.db.query('select * from edu_alumni_practice_drafts'),/permission denied/);}
 }finally{await f.db.close();}
});

test('authenticated learners retain owned progress writes before graduation and RLS ownership while alumni writes close',async()=>{
 const f=await setup();try{
 await f.db.exec(`reset role;grant select on enrollments to authenticated;
 alter table lesson_progress enable row level security;
 create policy own_progress on lesson_progress for all to authenticated using (enrollment_id in (select id from enrollments where user_id=auth.uid())) with check (enrollment_id in (select id from enrollments where user_id=auth.uid()));`);
 await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.student]);await f.db.exec('set role authenticated');
 await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent) values($1,$2,10)',[f.enrollment,f.lesson]);
 assert.equal((await f.db.query('select progress_percent from lesson_progress where enrollment_id=$1',[f.enrollment])).rows[0].progress_percent,10);
 await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.other]);
 assert.equal((await f.db.query('update lesson_progress set progress_percent=20 where enrollment_id=$1 returning id',[f.enrollment])).rows.length,0);
 await f.db.exec('reset role');await f.graduate();await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.student]);await f.db.exec('set role authenticated');
 await assert.rejects(f.db.query('update lesson_progress set progress_percent=30 where enrollment_id=$1',[f.enrollment]),/ALUMNI_PARTICIPATION_CLOSED/);
 await assert.rejects(f.read(),/permission denied/);
 }finally{await f.db.close();}
});
