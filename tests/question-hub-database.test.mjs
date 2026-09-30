import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-notifications.mjs';
async function start(t) {
 const h=await setup(t);
 await h.owner(`alter table cohorts add column name text default '4기';
 alter table curriculum_weeks add column week_number integer default 1;
 alter table curriculum_lessons add column day_number integer default 1;
 alter table edu_questions add column course_id uuid references courses(id),add column status text default 'open',add column is_archived boolean default false,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
 create table edu_mutation_receipts(actor_id uuid,request_id uuid,target_table text,fingerprint text,result jsonb,primary key(actor_id,request_id));
 grant select,insert,update on edu_mutation_receipts to service_role;`);
 for(const file of ['20260927035640_lesson_private_questions.sql','20260928205907_question_answer_threads.sql','20260928211554_question_private_images.sql','20260929071444_question_learner_followups.sql','20260930055906_question_hub.sql'])await h.owner(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const create=(overrides={})=>h.rpc('edu_create_hub_question',Object.values({actor:h.student,request:id(),enrollment:h.enrollment,lesson:h.lesson,title:'이미지 붙여넣기',content:'이미지는 어떻게 넣나요?',image:null,category:'learning',share:false,...overrides}));
 const search=(query='',actor=h.student,enrollment=null,lesson=null,page=0)=>h.rpc('edu_search_shared_answers',[actor,query,enrollment,lesson,page]);
 const publish=(q,title='이미지 붙여넣기',answer='복사한 이미지를 질문 입력란에 붙여넣으세요.',published=true)=>h.rpc('edu_publish_shared_answer',[h.admin,q,title,answer,published]);
 return {...h,create,search,publish};
}
test('hub keeps old questions private; general and lesson writes are idempotent and image context cannot be forged',async t=>{
 const h=await start(t),request=id(),first=await h.create({request});assert.deepEqual(await h.create({request}),first);
 await assert.rejects(h.create({request,share:true}),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(h.create({actor:h.other}),/BLOCK_FORBIDDEN/);
 await assert.rejects(h.create({category:'payment',share:true}),/QUESTION_INVALID/);
 const general=await h.create({enrollment:null,lesson:null,category:'general'});assert.ok(general.id);
 const img=id();await h.rpc('edu_prepare_question_image',[h.student,null,null,img,{kind:'image',name:'image.png',size:10,extension:'png',contentType:'image/png'}]);await h.rpc('edu_complete_question_image',[h.student,img,'a'.repeat(64)]);
 await assert.rejects(h.create({image:img}),/QUESTION_IMAGE_INVALID/);
 const q=await h.create({enrollment:null,lesson:null,category:'account',image:img});assert.ok(q.id);
 await assert.rejects(h.rpc('edu_prepare_question_image',[h.student,h.enrollment,h.lesson,img,{kind:'image',name:'image.png',size:10,extension:'png',contentType:'image/png'}]),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(h.publish(first.id),/QUESTION_SHARE_FORBIDDEN/);assert.deepEqual((await h.search()).answers,[]);
});
test('only edited and approved answers appear; private text, identity, images and other cohorts never appear',async t=>{
 const h=await start(t),q=await h.create({share:true,content:'비공개 원문 private-person@example.test'});
 assert.deepEqual((await h.search()).answers,[]);await h.publish(q.id);
 const result=await h.search('이미지'),text=JSON.stringify(result);assert.equal(result.answers.length,1);assert.doesNotMatch(text,/private-person|비공개 원문|source_question_id|user_id/);assert.equal(result.answers[0].lessonId,h.lesson);
 assert.equal((await h.search('없는단어')).answers.length,0);assert.equal((await h.search('',h.other)).answers.length,0);
 const anotherCohort=id(),anotherEnrollment=id();await h.owner('insert into cohorts(id,course_id) values($1,$2)',[anotherCohort,h.course]);await h.owner("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[anotherEnrollment,h.other,h.course,anotherCohort]);
 assert.equal((await h.search('',h.other)).answers.length,0);
 await h.owner('update enrollments set cohort_id=$1 where id=$2',[h.cohort,anotherEnrollment]);assert.equal((await h.search('',h.other)).answers.length,1);
 await h.publish(q.id,'수정한 제목','수정한 답변',false);assert.equal((await h.search()).answers.length,0);
});
test('unpublished/archived/locked lessons and revoked access disappear from context and shared search',async t=>{
 const h=await start(t),q=await h.create({share:true});await h.publish(q.id);assert.equal((await h.db.query('select * from edu_question_contexts($1)',[h.student])).rows.length,1);
 for(const [table,column,restore] of [['curriculum_lessons','is_published=false','is_published=true'],['curriculum_weeks','archived_at=now()','archived_at=null'],['enrollments','revoked_at=now()','revoked_at=null']]){
  const key=table==='enrollments'?h.enrollment:table==='curriculum_weeks'?h.week:h.lesson;
  await h.owner(`update ${table} set ${column} where id=$1`,[key]);assert.equal((await h.db.query('select * from edu_question_contexts($1)',[h.student])).rows.length,0);assert.equal((await h.search()).answers.length,0);await assert.rejects(h.create(),/BLOCK_/);await h.owner(`update ${table} set ${restore} where id=$1`,[key]);
 }
 await h.owner("update edu_lesson_block_versions set document=jsonb_set(document,'{progression}','{\"track\":\"learning\",\"dayNumber\":2}') where id=$1",[h.revision]);
 assert.equal((await h.db.query('select * from edu_question_contexts($1)',[h.student])).rows.length,0);assert.equal((await h.search()).answers.length,0);await assert.rejects(h.create(),/BLOCK_LESSON_LOCKED/);
});
test('learner resolve preserves history, checks latest head, and followup reopens same question',async t=>{
 const h=await start(t),q=await h.create();await assert.rejects(h.rpc('edu_finish_own_question',[h.student,q.id,null]),/QUESTION_INVALID/);
 const a=await h.rpc('edu_add_question_answer',[h.admin,q.id,null,id(),'운영자 답변']);
 await assert.rejects(h.rpc('edu_finish_own_question',[h.other,q.id,a.id]),/QUESTION_NOT_FOUND/);
 await assert.rejects(h.rpc('edu_finish_own_question',[h.student,q.id,null]),/QUESTION_CHANGED/);
 assert.equal((await h.rpc('edu_finish_own_question',[h.student,q.id,a.id])).resolved,true);
 await h.rpc('edu_add_question_followup',[h.student,q.id,a.id,id(),'추가 질문']);const thread=await h.rpc('edu_read_question_thread',[h.student,q.id,null]);assert.equal(thread.question.resolved,false);assert.equal(thread.answers.length,2);
});
test('Aside drafts are durable but never sent; stale heads and human-only categories are rejected',async t=>{
 const h=await start(t),q=await h.create(),request=id(),job=await h.rpc('edu_question_assist',[h.admin,q.id,request,null]);assert.equal(job.status,'waiting');
 await assert.rejects(h.rpc('edu_question_assist',[h.student,q.id,id(),null]),/BLOCK_FORBIDDEN/);
 const draft=await h.rpc('edu_question_assist',[h.admin,q.id,request,'검토할 초안']);assert.equal(draft.status,'draft');assert.deepEqual(await h.rpc('edu_question_assist',[h.admin,q.id,request,'검토할 초안']),draft);
 assert.equal((await h.rpc('edu_read_question_thread',[h.student,q.id,null])).answers.length,0);
 await h.rpc('edu_add_question_answer',[h.admin,q.id,null,id(),'먼저 등록한 답변']);await assert.rejects(h.rpc('edu_question_assist',[h.admin,q.id,request,null]),/QUESTION_CHANGED/);
 const general=await h.create({category:'payment',enrollment:null,lesson:null});await assert.rejects(h.rpc('edu_question_assist',[h.admin,general.id,id(),null]),/QUESTION_ASSIST_HUMAN/);
});
test('new tables use RLS and service-only grants; authenticated and anon cannot call privileged RPCs',async t=>{
 const h=await start(t);
 for(const table of ['edu_shared_answers','edu_question_assist_jobs']){
  assert.equal((await h.db.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])for(const op of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await h.db.query('select has_table_privilege($1,$2,$3) ok',[role,table,op])).rows[0].ok,false);
 }
 const funcs=(await h.db.query("select oid::regprocedure::text signature from pg_proc where proname in ('edu_question_contexts','edu_create_hub_question','edu_publish_shared_answer','edu_search_shared_answers','edu_finish_own_question','edu_question_assist')")).rows;
 for(const {signature} of funcs)for(const role of ['anon','authenticated'])assert.equal((await h.db.query("select has_function_privilege($1,$2,'EXECUTE') ok",[role,signature])).rows[0].ok,false);
});
test('only an exact unambiguous approved question auto-answers, once, with a visible approved-answer source',async t=>{
 const h=await start(t),original=await h.create({share:true});await h.publish(original.id,'이미지는 어떻게 넣나요?','복사한 이미지를 붙여넣으세요.');
 const req=id(),q=await h.create({request:req});await h.create({request:req});const thread=await h.rpc('edu_read_question_thread',[h.student,q.id,null]);assert.equal(thread.answers.length,1);assert.equal(thread.answers[0].source,'faq');assert.match(thread.answers[0].authorName,/자동 안내/);assert.equal(thread.question.resolved,false);
 const different=await h.create({content:'이미지 문의인데 다른 오류예요'});assert.equal((await h.rpc('edu_read_question_thread',[h.student,different.id,null])).answers.length,0);
 const dup=await h.create({share:true,content:'다른 수강생 질문'});await h.publish(dup.id,'이미지는 어떻게 넣나요?','다른 설명');const ambiguous=await h.create();assert.equal((await h.rpc('edu_read_question_thread',[h.student,ambiguous.id,null])).answers.length,0);
});
test('Aside review publishes only the reviewed draft with source label and idempotent notification',async t=>{
 const h=await start(t),q=await h.create(),job=id(),request=id();await h.rpc('edu_question_assist',[h.admin,q.id,job,null]);await h.rpc('edu_question_assist',[h.admin,q.id,job,'AI 초안']);
 const a=await h.rpc('edu_answer_from_assist',[h.admin,q.id,job,request,'운영자가 수정한 답변']);assert.deepEqual(await h.rpc('edu_answer_from_assist',[h.admin,q.id,job,request,'운영자가 수정한 답변']),a);
 const thread=await h.rpc('edu_read_question_thread',[h.student,q.id,null]);assert.equal(thread.answers.length,1);assert.equal(thread.answers[0].source,'aside');assert.equal(thread.answers[0].content,'운영자가 수정한 답변');
 await assert.rejects(h.rpc('edu_answer_from_assist',[h.admin,q.id,job,request,'다른 답변']),/QUESTION_REQUEST_REUSED/);
});
test('answer notification links to its question; curriculum revisions invalidate approved answers and outstanding Aside jobs',async t=>{
 const h=await start(t),q=await h.create({share:true}),job=id();await h.publish(q.id);await h.rpc('edu_question_assist',[h.admin,q.id,job,null]);await h.rpc('edu_question_assist',[h.admin,q.id,job,'이전 수업의 초안']);
 await h.rpc('edu_add_question_answer',[h.admin,q.id,null,id(),'알림 답변']);const notice=(await h.inbox()).rows.find(r=>r.content.includes('알림 답변'));assert.equal(notice.targetPath,'/my/questions?question='+q.id);
 const q2=await h.create({content:'새 질문'}),job2=id();await h.rpc('edu_question_assist',[h.admin,q2.id,job2,null]);
 const next=id();await h.rpc('edu_save_lesson_blocks',[h.admin,h.lesson,h.revision,next,{schemaVersion:1,blocks:[{id:'text',type:'text',content:'바뀐 수업'}],checklist:[]}]);
 assert.equal((await h.search()).answers.length,0);await assert.rejects(h.rpc('edu_question_assist',[h.admin,q2.id,job2,'오래된 초안']),/QUESTION_CHANGED/);
});
