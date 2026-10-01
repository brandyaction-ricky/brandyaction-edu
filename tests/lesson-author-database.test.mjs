import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {fixture,document} from './helpers/lesson-block-review.mjs';
const sql=readFileSync(new URL('../supabase/migrations/20261001065746_lesson_author_drafts.sql',import.meta.url),'utf8');
async function setup(){
 const f=await fixture();await f.db.exec('reset role');
 await f.db.exec(`alter table curriculum_lessons add column day_number integer not null default 1,add column description text,add column duration_label text,add column content_type text not null default 'text',add column is_preview boolean not null default false,add column display_order integer not null default 0,add column updated_at timestamptz not null default now();
 alter table curriculum_lessons add constraint lesson_day unique(week_id,day_number);
 alter table lesson_contents add column vod_url text,add column external_url text,add column resource_storage_path text,add column resource_name text,add column updated_at timestamptz not null default now();
 alter table lesson_contents add constraint content_kind check(num_nonnulls(body_text,vod_url,external_url,resource_storage_path)=1);
 create table audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 grant select,insert on audit_logs to service_role;
 create function mission_operator_allowed(actor uuid, scope text) returns boolean language sql as $$ select exists(select 1 from public.profiles where id=actor and role='admin' and status='active') $$;`);
 await f.db.exec(sql);await f.db.exec('set role service_role');
 const read=async(lesson=f.lesson,actor=f.admin,version=null)=>(await f.db.query('select edu_read_lesson_author($1,$2,$3) as v',[actor,lesson,version])).rows[0].v;
 const save=async(payload,snapshot,opts={})=>(await f.db.query('select edu_save_lesson_author($1,$2,$3,$4,$5,$6,$7,$8) as v',[opts.actor||f.admin,opts.lesson||f.lesson,snapshot.revision,opts.request||id(),snapshot.public.stamp,payload,opts.create||false,opts.rebase||false])).rows[0].v;
 const publish=async(revision,request=id(),actor=f.admin)=>(await f.db.query('select edu_publish_lesson_author($1,$2,$3,$4) as v',[actor,f.lesson,revision,request])).rows[0].v;
 return{...f,read,save,publish};
}
test('author drafts stay private until atomic publication; student answer and prior content survive, and history restores only to a draft',async()=>{
 const f=await setup();const {db,read,save,publish}=f;
 try{
  await f.draft();await f.submit();
  const before=await read(),payload=structuredClone(before.payload);payload.form.basic.title='수정 중인 새 제목';payload.blocks.document.blocks[0].question.label='새 질문';
  const first=id();await save(payload,before,{request:first});await save(payload,before,{request:first});
  assert.equal((await read()).revision,first);
  assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'시험 수업');
  assert.equal((await db.query('select revision from edu_lesson_block_heads where lesson_id=$1',[f.lesson])).rows[0].revision,f.revision);
  const privateTables=['edu_lesson_author_versions','edu_lesson_author_heads','edu_lesson_author_publications'];
  for(const table of privateTables){assert.equal((await db.query('select relrowsecurity as ok from pg_class where relname=$1',[table])).rows[0].ok,true);for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT') as ok",[role,table])).rows[0].ok,false);}
  await assert.rejects(read(f.lesson,f.student),/BLOCK_FORBIDDEN/);await assert.rejects(save(payload,before,{actor:f.student}),/AUTHOR_FORBIDDEN/);
  await assert.rejects(save(payload,before),/AUTHOR_CHANGED/);
  const request=id();await publish(first,request);await publish(first,request);
  assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'수정 중인 새 제목');
  assert.equal((await db.query('select revision from edu_lesson_block_heads where lesson_id=$1',[f.lesson])).rows[0].revision,request);
  assert.equal((await db.query('select count(*)::int n from edu_lesson_block_submissions')).rows[0].n,1);
  assert.deepEqual((await db.query('select document from edu_lesson_block_versions where id=$1',[f.revision])).rows[0].document,document);
  const latest=await read();assert.equal(latest.publishedRevision,first);assert.equal(latest.publishedStamp,latest.public.stamp);
  const baseline=latest.history.find(x=>x.baseline);const previous=await read(f.lesson,f.admin,baseline.revision);
  const restored=await save(previous.payload,latest,{rebase:true});assert.notEqual(restored.revision,first);
  assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'수정 중인 새 제목');
  await publish(restored.revision);assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'시험 수업');
  assert.equal((await db.query('select count(*)::int n from edu_lesson_block_submissions')).rows[0].n,1);
 }finally{await db.close();}
});
test('stale publication, archived lessons, failed audit and cross-course drafts cannot partially change a public lesson',async()=>{
 const f=await setup();const {db,read,save,publish}=f;
 try{
  const before=await read(),payload=structuredClone(before.payload);payload.form.basic.title='공개하면 바뀔 제목';
  const {revision}=await save(payload,before);await db.query('update curriculum_lessons set is_published=false where id=$1',[f.lesson]);
  await assert.rejects(publish(revision),/AUTHOR_PUBLIC_CHANGED/);
  const stale=await read();await assert.rejects(save(payload,stale),/AUTHOR_PUBLIC_CHANGED/);
  assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'시험 수업');
  const current=await read();const freshPayload=structuredClone(current.public.payload);freshPayload.form.basic.title='명시적 재편집';
  const rebased=await save(freshPayload,current,{rebase:true});
  await db.exec('reset role');await db.exec(`create function reject_author_audit() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_FAILURE'; end $$;create trigger reject_author_audit before insert on audit_logs for each row execute function reject_author_audit();`);await db.exec('set role service_role');
  await assert.rejects(publish(rebased.revision),/AUDIT_FAILURE/);
  assert.equal((await db.query('select title from curriculum_lessons where id=$1',[f.lesson])).rows[0].title,'시험 수업');assert.equal((await db.query('select revision from edu_lesson_block_heads where lesson_id=$1',[f.lesson])).rows[0].revision,f.revision);
  const course=id(),week=id();await db.query('insert into courses(id) values($1)',[course]);await db.query('insert into curriculum_weeks(id,course_id,is_published) values($1,$2,false)',[week,course]);freshPayload.form.basic.week_id=week;await assert.rejects(save(freshPayload,await read(),{rebase:true}),/AUTHOR_COURSE_FIXED/);
  await db.query('update curriculum_lessons set archived_at=now() where id=$1',[f.lesson]);await assert.rejects(read(),/BLOCK_NOT_FOUND/);
 }finally{await db.close();}
});
test('new draft is an unpublished shell, first-save retries are safe and legacy content publishes atomically',async()=>{
 const f=await setup();const {db,save,read}=f;
 try{
  const original=await read(),payload=structuredClone(original.payload),lesson=id(),request=id();
  payload.form.basic.day_number='2';payload.form.basic.title='아직 안 보이는 새 수업';payload.form.basic.is_published=true;payload.blocks={active:false,document:{schemaVersion:1,blocks:[],checklist:[]}};payload.form.bodyText='초안 본문';
  const initial={revision:null,public:{stamp:null}};await save(payload,initial,{lesson,create:true,request});await save(payload,initial,{lesson,create:true,request});
  const shell=(await db.query('select * from curriculum_lessons where id=$1',[lesson])).rows[0];assert.equal(shell.is_published,false);assert.equal(shell.title,'새 수업');
  assert.equal((await db.query('select count(*)::int n from lesson_contents where lesson_id=$1',[lesson])).rows[0].n,0);
  await db.query('select edu_publish_lesson_author($1,$2,$3,$4)',[f.admin,lesson,request,id()]);assert.equal((await db.query('select body_text from lesson_contents where lesson_id=$1',[lesson])).rows[0].body_text,'초안 본문');
  assert.equal((await db.query('select is_published from curriculum_lessons where id=$1',[lesson])).rows[0].is_published,true);
  await assert.rejects(read(f.lesson,f.admin,request),/AUTHOR_NOT_FOUND/);
  for(const fn of ['edu_lesson_author_snapshot(uuid,uuid)','edu_read_lesson_author(uuid,uuid,uuid)','edu_save_lesson_author(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean)','edu_publish_lesson_author(uuid,uuid,uuid,uuid)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,fn])).rows[0].ok,role==='service_role');
 }finally{await db.close();}
});
