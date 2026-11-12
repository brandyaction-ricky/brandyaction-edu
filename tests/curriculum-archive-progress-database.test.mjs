import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-care.mjs';
const sql = name => fs.readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const candidate = '20261112082647_curriculum_archive_progress_identity.sql';

test('archived ordinals are independent, restore preserves records, and inserting lessons preserves earned progress', async t => {
 const f = await setup(t);
 const owner = async text => { await f.db.exec('reset role'); try { await f.db.exec(text); } finally { await f.db.exec('set role service_role'); } };
 await owner(`alter table curriculum_lessons add column display_order integer default 0, add column updated_at timestamptz default now(), add column is_preview boolean default false;
 alter table curriculum_lessons add constraint curriculum_lessons_week_id_day_number_key unique(week_id,day_number) deferrable initially immediate;
 alter table curriculum_missions add column archived_at timestamptz, add column is_published boolean default false, add column archived_by_curriculum boolean default false;
 create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create function mission_operator_allowed(actor uuid,scope text) returns boolean language sql stable as $$select scope='products' and exists(select 1 from public.profiles where id=actor and role='admin' and status='active')$$;
 grant select,insert,update on audit_logs to service_role;`);
 await owner(sql('20261001061235_admin_lesson_reorder.sql'));
 const add = async (week, day, archived = false) => {
  const key = id();
  await f.db.query('insert into curriculum_lessons(id,week_id,day_number,is_published,archived_at) values($1,$2,$3,true,case when $4 then now() end)',[key,week,day,archived]);
  await f.db.query('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,true)',[f.cohort,key]);
  return key;
 };
 const gate = async (key,enrollment=f.enrollment) => (await f.db.query('select edu_lesson_progression_gate($1,$2) as r',[enrollment,key])).rows[0].r.isUnlocked;
 const archive = async (key, archived, reassign=false, actor=f.admin, kind='lesson') => (await f.db.query('select edu_set_curriculum_archive($1,$2,$3,$4,$5,$6) as r',[actor,f.course,kind,key,archived,reassign])).rows[0].r;
 const archived = await add(f.week,2,true);
 await assert.rejects(add(f.week,2),/curriculum_lessons_week_id_day_number_key/,'baseline: deleted lesson reserves live number');
 // Use untracked lessons to reproduce onboarding insertion, with the completion
 // after week zero retained by immutable lesson ID.
 const first = await add(f.week,3), next = await add(f.week,4), later = await add(f.week,5);
 await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at) values($1,$2,100,now())',[f.enrollment,first]);
 assert.equal(await gate(next),true);
 const zero=id();
 await f.db.query('insert into curriculum_weeks(id,course_id,is_published,week_number) values($1,$2,true,0)',[zero,f.course]);
 await f.db.query('insert into edu_cohort_week_visibility(cohort_id,week_id,is_published) values($1,$2,true)',[f.cohort,zero]);
 const inserted = await add(zero,2), catchup = await add(zero,3);
 assert.equal(await gate(next),false,'baseline: new earlier lesson revokes next step');
 const originalProgress=(await f.db.query('select * from lesson_progress order by id')).rows;
 await owner(sql(candidate));
 await t.test('new earlier content stays incomplete; earned lesson and next step stay open, later steps stay locked',async()=>{
  assert.equal(await gate(inserted),true);assert.equal(await gate(first),true);assert.equal(await gate(next),true);assert.equal(await gate(later),false);
  await f.parity();
  const cells=(await f.snapshot()).rows[0].cells;
  assert.equal(cells.find(c=>c.lessonId===inserted).state,'not_submitted');
  assert.equal(cells.find(c=>c.lessonId===catchup).state,'not_submitted');
  assert.equal(cells.find(c=>c.lessonId===catchup).timing.state,'unavailable','new catch-up content must not invent a predecessor completion clock');
  assert.equal(cells.find(c=>c.lessonId===first).state,'completed');
  assert.equal(cells.find(c=>c.lessonId===next).state,'not_submitted');
  assert.equal(cells.find(c=>c.lessonId===later).state,'locked');
  assert.deepEqual((await f.db.query('select * from lesson_progress order by id')).rows,originalProgress);
  const fresh=id();await f.db.query("insert into enrollments(id,user_id,course_id,cohort_id,status) values($1,$2,$3,$4,'active')",[fresh,f.other,f.course,f.cohort]);
  assert.equal(await gate(inserted,fresh),true);assert.equal(await gate(first,fresh),false);assert.equal(await gate(next,fresh),false);
 });
 let active;
 await t.test('archived numbers can be reused and live duplicates still fail',async()=>{
  active=await add(f.week,2);
  await add(f.week,2,true);
  await assert.rejects(add(f.week,2),/curriculum_lessons_week_id_day_number_key/);
  await assert.rejects(f.db.query('update curriculum_lessons set active_order_key=null where id=$1',[active]),/can only be updated to DEFAULT/);
  assert.equal((await f.db.query('select day_number from curriculum_lessons where id=$1',[archived])).rows[0].day_number,2);
 });
 await t.test('restore conflict requires consent, appends privately and preserves IDs and connected records',async()=>{
  const mission=id();await f.db.query('insert into curriculum_missions(id,lesson_id,archived_at,archived_by_curriculum) values($1,$2,now(),true)',[mission,archived]);
  await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,archived]);
  const before=(await f.db.query('select * from lesson_progress order by id')).rows;
  await assert.rejects(archive(archived,false),/CURRICULUM_LESSON_NUMBER_IN_USE/);
  assert.equal((await f.db.query('select archived_at is not null as archived from curriculum_lessons where id=$1',[archived])).rows[0].archived,true);
  const restored=await archive(archived,false,true);assert.equal(restored.previous_day_number,2);assert.equal(restored.day_number,6);
  assert.deepEqual((await f.db.query('select id,week_id,day_number,is_published,archived_at from curriculum_lessons where id=$1',[archived])).rows[0],{id:archived,week_id:f.week,day_number:6,is_published:false,archived_at:null});
  assert.equal((await f.db.query('select day_number from curriculum_lessons where id=$1',[active])).rows[0].day_number,2);
  assert.deepEqual((await f.db.query('select lesson_id,is_published,archived_at from curriculum_missions where id=$1',[mission])).rows[0],{lesson_id:archived,is_published:false,archived_at:null});
  assert.deepEqual((await f.db.query('select * from lesson_progress order by id')).rows,before);
  await archive(archived,true);
 });
 await t.test('deferred active reorder still works and leaves archive numbers and history untouched',async()=>{
  const before=(await f.db.query('select * from lesson_progress order by id')).rows;
  const rows=(await f.db.query('select id,day_number,updated_at::text stamp from curriculum_lessons where week_id=$1 and archived_at is null order by day_number',[f.week])).rows;
  const ordered=[...rows].reverse();
  const changed=await f.db.query('select edu_admin_reorder_lessons($1,$2,$3,$4,$5,$6,$7) as r',[f.admin,f.course,f.week,ordered.map(r=>r.id),rows.map(r=>r.id),rows.map(r=>r.day_number),rows.map(r=>r.stamp)]);
  assert.equal(changed.rows[0].r,rows.length);
  assert.deepEqual((await f.db.query('select id from curriculum_lessons where week_id=$1 and archived_at is null order by day_number',[f.week])).rows.map(r=>r.id),ordered.map(r=>r.id));
  assert.equal((await f.db.query('select day_number from curriculum_lessons where id=$1',[archived])).rows[0].day_number,6);
  assert.deepEqual((await f.db.query('select * from lesson_progress order by id')).rows,before);
 });
 await t.test('tracked daily/learning prerequisites and cohort caps retain their existing rules',async()=>{
  const daily=await f.add('daily',20), learning=await f.add('learning',21), learningNext=await f.add('learning',22);
  // Configure the mappings independently of week-local display order.
  for(const [item,track,day] of [[daily,'daily',2],[learning,'learning',1],[learningNext,'learning',2]]) {
   const doc={schemaVersion:1,blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'확인',options:['가','나'],correctIndex:1}]}}],checklist:[],progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}};
   const revision=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,item.lesson,item.revision,revision,doc]);item.revision=revision;
  }
  assert.equal(await gate(daily.lesson),false);assert.equal(await gate(learning.lesson),true);assert.equal(await gate(learningNext.lesson),false);
  await f.approve(await f.submitCell());
  const write=id(),values={blocks:{quiz:{a:1}},checklist:[]};
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,learning.lesson,f.enrollment,learning.revision,write,values]);
  await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7)',[f.student,learning.lesson,f.enrollment,learning.revision,write,id(),values]);
  assert.equal(await gate(daily.lesson),true);assert.equal(await gate(learningNext.lesson),true);
  await f.parity();
  // Archived mappings retain history but cannot cause active duplicate errors.
  await archive(learning.lesson,true);assert.equal(await gate(learningNext.lesson),true);await f.parity();
 });
 await t.test('restore permissions, archived parent and function execution grants remain enforced',async()=>{
  await assert.rejects(archive(archived,false,true,f.student),/CURRICULUM_FORBIDDEN/);
  await archive(f.week,true,false,f.admin,'week');
  await assert.rejects(archive(archived,false,true),/CURRICULUM_PARENT_ARCHIVED/);
  await archive(f.week,false,false,f.admin,'week');
  assert.equal((await f.db.query('select is_published from curriculum_weeks where id=$1',[f.week])).rows[0].is_published,false);
  assert.equal((await f.db.query('select count(*)::int n from curriculum_lessons where week_id=$1 and archived_at is null',[f.week])).rows[0].n,0);
  for (const role of ['anon','authenticated','service_role']) assert.equal((await f.db.query("select has_function_privilege($1,'edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean,boolean)','EXECUTE') as allowed",[role])).rows[0].allowed,role==='service_role');
 });
});
