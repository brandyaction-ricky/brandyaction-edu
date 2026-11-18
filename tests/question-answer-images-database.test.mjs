import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
const spec={kind:'image',name:'curriculum.png',size:8,extension:'png',contentType:'image/png'};
async function fixture(t){const h=await communityFixture(t);await h.owner(read('20261003054513_admin_sent_message_delete.sql'));await h.owner(read('20261008004234_question_answer_images.sql'));await h.owner(read('20261118025908_question_followup_images.sql'));return h;}
async function image(h,q,actor=h.admin){const file=id();await h.rpc('edu_prepare_answer_image',[actor,q,file,spec]);await h.rpc('edu_complete_answer_image',[actor,file,'a'.repeat(64)]);return file;}
const add=(h,q,file,request=id(),head=null,content='좌측 상단을 눌러 주세요.',job=null)=>h.rpc('edu_add_question_answer_with_image',[h.admin,q,head,request,content,file,job]);
test('answer and image commit atomically; identical retry creates one answer and notice, preserving older text replies',async t=>{
 const h=await fixture(t),q=await h.create(),file=await image(h,q.id),request=id();
 const before=await h.count('edu_member_messages');const result=await add(h,q.id,file,request);
 assert.deepEqual(await add(h,q.id,file,request),result);assert.equal(await h.count('edu_question_answers'),1);assert.equal(await h.count('edu_member_messages'),before+1);
 const page=await h.rpc('edu_read_question_thread_with_images',[h.student,q.id,null]);assert.equal(page.answers[0].imageId,file);
 const readFile=await h.rpc('edu_read_answer_image',[h.student,q.id,request]);assert.equal(readFile.id,file);assert.match(readFile.path,/^answers\//);
 await h.rpc('edu_add_question_answer',[h.admin,q.id,request,id(),'텍스트 답변']);const next=await h.rpc('edu_read_question_thread_with_images',[h.student,q.id,null]);assert.equal(next.answers[1].imageId,null);assert.equal(next.answers[0].imageId,file);
 const f2=await image(h,q.id);await assert.rejects(()=>add(h,q.id,f2,request),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>add(h,q.id,file,id(),request),/QUESTION_REQUEST_REUSED/);
});
test('private answer image denies unrelated learners, wrong questions, deleted answers and archived questions',async t=>{
 const h=await fixture(t),q=await h.create({visibility:'private'}),otherQ=await h.create(),file=await image(h,q.id),request=id();await add(h,q.id,file,request);
 await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.other,q.id,request]),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.student,otherQ.id,request]),/QUESTION_NOT_FOUND/);
 await h.owner('update edu_questions set is_archived=true where id=$1',[q.id]);await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.student,q.id,request]),/QUESTION_NOT_FOUND/);
 await h.owner('update edu_questions set is_archived=false where id=$1',[q.id]);await h.rpc('edu_delete_question_answer',[h.admin,q.id,request,request]);
 for(const actor of [h.student,h.admin])await assert.rejects(()=>h.rpc('edu_read_answer_image',[actor,q.id,request]),/QUESTION_NOT_FOUND/);
 assert.deepEqual((await h.rpc('edu_read_question_thread_with_images',[h.student,q.id,null])).answers,[]);
 await assert.rejects(()=>add(h,q.id,file,request),/QUESTION_NOT_FOUND/);
});
test('attachment requires operator ownership, matching question, readiness and current thread; failures do not insert answers',async t=>{
 const h=await fixture(t),q=await h.create(),q2=await h.create(),file=id();
 await assert.rejects(()=>h.rpc('edu_prepare_answer_image',[h.student,q.id,file,spec]),/BLOCK_FORBIDDEN/);
 await h.rpc('edu_prepare_answer_image',[h.admin,q.id,file,spec]);await assert.rejects(()=>add(h,q.id,file),/QUESTION_INVALID/);
 await assert.rejects(()=>h.rpc('edu_complete_answer_image',[h.student,file,'a'.repeat(64)]),/BLOCK_FORBIDDEN/);
 await h.rpc('edu_complete_answer_image',[h.admin,file,'a'.repeat(64)]);await assert.rejects(()=>add(h,q2.id,file),/QUESTION_INVALID/);
 await assert.rejects(()=>h.rpc('edu_prepare_answer_image',[h.admin,q2.id,file,spec]),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>h.rpc('edu_complete_answer_image',[h.admin,file,'b'.repeat(64)]),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>add(h,q.id,file,id(),id()),/QUESTION_CHANGED/);assert.equal(await h.count('edu_question_answers'),0);
 await h.owner("update profiles set role='staff' where id=$1;",[h.other]);await h.owner("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+h.other]);
 await assert.rejects(()=>h.rpc('edu_add_question_answer_with_image',[h.other,q.id,null,id(),'다른 운영자',file,null]),/QUESTION_INVALID/);
 await h.owner(`create function fail_answer_image() returns trigger language plpgsql as $$begin if new.answer_id is not null then raise exception 'synthetic rollback';end if;return new;end;$$;create trigger fail_answer_image before update on edu_question_answer_images for each row execute function fail_answer_image();`);
 const notices=await h.count('edu_member_messages');await assert.rejects(()=>add(h,q.id,file),/synthetic rollback/);assert.equal(await h.count('edu_question_answers'),0);assert.equal(await h.count('edu_member_messages'),notices);
});
test('reviewed assist answer retains image and same request id across retry',async t=>{
 const h=await fixture(t),q=await h.create(),file=await image(h,q.id),job=id(),request=id();
 await h.rpc('edu_question_assist',[h.admin,q.id,job,null]);await h.rpc('edu_question_assist',[h.admin,q.id,job,'설명 초안']);
 const result=await add(h,q.id,file,request,null,'검토한 설명',job);assert.deepEqual(await add(h,q.id,file,request,null,'검토한 설명',job),result);
 const page=await h.rpc('edu_read_question_thread_with_images',[h.student,q.id,null]);assert.equal(page.answers[0].source,'aside');assert.equal(page.answers[0].imageId,file);
});
test('browser roles cannot read the attachment table or call privileged attachment functions',async t=>{
 const h=await fixture(t),q=await h.create();
 for(const role of ['anon','authenticated']){
  await h.db.exec('reset role;set role '+role);
  await assert.rejects(()=>h.db.exec('select * from edu_question_answer_images'),/permission denied/);
  await assert.rejects(()=>h.db.query('select edu_read_question_thread_with_images($1,$2,null)',[h.student,q.id]),/permission denied/);
  await assert.rejects(()=>h.db.query('select edu_prepare_answer_image($1,$2,$3,$4)',[h.admin,q.id,id(),spec]),/permission denied/);
 }
});

test('public answer image follows cohort access; withdrawn access and private visibility immediately hide it',async t=>{
 const h=await fixture(t),peer=id();await h.owner("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[peer,h.other,h.course,h.cohort]);
 const q=await h.create(),file=await image(h,q.id),request=id();await add(h,q.id,file,request);
 assert.equal((await h.rpc('edu_read_answer_image',[h.other,q.id,request])).id,file);assert.equal((await h.rpc('edu_read_question_thread_with_images',[h.other,q.id,null])).answers[0].imageId,file);
 await h.owner('update enrollments set revoked_at=now() where id=$1',[peer]);await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.other,q.id,request]),/QUESTION_NOT_FOUND/);
 await h.owner('update enrollments set revoked_at=null where id=$1',[peer]);await h.owner("update edu_questions set visibility='private' where id=$1",[q.id]);await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.other,q.id,request]),/QUESTION_NOT_FOUND/);
 assert.equal((await h.rpc('edu_read_answer_image',[h.student,q.id,request])).id,file);
});

test('followup image shares the original question visibility and stays on the same thread for learner and operator',async t=>{
 const h=await fixture(t),peer=id();
 await h.owner("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[peer,h.other,h.course,h.cohort]);
 const question=await h.create({visibility:'private'}),file=id(),request=id(),content='추가 화면을 확인해 주세요.';
 const prepare=(actor=h.student,q=question.id,upload=file)=>h.rpc('edu_prepare_followup_image',[actor,q,upload,spec]);
 const write=(upload=file,head=null,reply=request)=>h.rpc('edu_add_question_followup_with_image',[h.student,question.id,head,reply,content,upload]);
 const fetchImage=(actor,q=question.id)=>h.rpc('edu_read_answer_image',[actor,q,request]);
 await assert.rejects(()=>prepare(h.other),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>prepare(h.admin),/QUESTION_NOT_FOUND/);
 assert.equal((await prepare()).id,file);
 await assert.rejects(()=>write(),/QUESTION_INVALID/);
 await assert.rejects(()=>h.rpc('edu_complete_followup_image',[h.other,file,'a'.repeat(64)]),/QUESTION_FORBIDDEN/);
 await h.rpc('edu_complete_followup_image',[h.student,file,'a'.repeat(64)]);
 await assert.rejects(()=>write(file,id()),/QUESTION_CHANGED/);
 const before=await h.count('edu_member_messages');
 const posted=await write();
 assert.deepEqual(await write(),posted);
 assert.equal(await h.count('edu_member_messages'),before+1);
 assert.equal(await h.count('edu_question_answers'),1);
 await assert.rejects(()=>write(file,request,id()),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>write(id()),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>h.rpc('edu_add_question_followup',[h.student,question.id,null,request,content]),/QUESTION_REQUEST_REUSED/);
 for(const actor of [h.student,h.admin]){
  const thread=await h.rpc('edu_read_question_thread_with_images',[actor,question.id,null]);
  assert.equal(thread.question.visibility,'private');
  assert.deepEqual([thread.answers[0].id,thread.answers[0].source,thread.answers[0].imageId],[request,'learner',file]);
  assert.equal((await fetchImage(actor)).id,file);
 }
 await assert.rejects(()=>fetchImage(h.other),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>h.rpc('edu_read_question_thread_with_images',[h.other,question.id,null]),/QUESTION_NOT_FOUND/);
 const another=await h.create({visibility:'private'});
 await assert.rejects(()=>fetchImage(h.student,another.id),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>h.rpc('edu_add_question_followup_with_image',[h.student,another.id,null,id(),content,file]),/QUESTION_INVALID/);
 const publicQuestion=await h.create(),publicFile=id(),publicReply=id();
 await prepare(h.student,publicQuestion.id,publicFile);
 await h.rpc('edu_complete_followup_image',[h.student,publicFile,'b'.repeat(64)]);
 await h.rpc('edu_add_question_followup_with_image',[h.student,publicQuestion.id,null,publicReply,content,publicFile]);
 assert.equal((await h.rpc('edu_read_answer_image',[h.other,publicQuestion.id,publicReply])).id,publicFile);
 assert.equal((await h.rpc('edu_read_question_thread_with_images',[h.other,publicQuestion.id,null])).answers[0].imageId,publicFile);
 await h.owner('update enrollments set revoked_at=now() where id=$1',[peer]);
 await assert.rejects(()=>h.rpc('edu_read_answer_image',[h.other,publicQuestion.id,publicReply]),/QUESTION_NOT_FOUND/);
});

test('operator and learner upload purposes remain separate even for a question owner with operator rights',async t=>{
 const h=await fixture(t),q=await h.create(),followup=id(),answer=id(),hash='a'.repeat(64);
 await h.owner("update profiles set role='admin' where id=$1",[h.student]);
 await h.rpc('edu_prepare_followup_image',[h.student,q.id,followup,spec]);
 await h.rpc('edu_complete_followup_image',[h.student,followup,hash]);
 await h.rpc('edu_prepare_answer_image',[h.student,q.id,answer,spec]);
 await h.rpc('edu_complete_answer_image',[h.student,answer,hash]);
 await assert.rejects(()=>h.rpc('edu_prepare_answer_image',[h.student,q.id,followup,spec]),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>h.rpc('edu_owned_answer_image',[h.student,followup]),/QUESTION_FORBIDDEN/);
 await assert.rejects(()=>h.rpc('edu_owned_followup_image',[h.student,answer]),/QUESTION_FORBIDDEN/);
 await assert.rejects(()=>h.rpc('edu_add_question_answer_with_image',[h.student,q.id,null,id(),'답변',followup,null]),/QUESTION_INVALID/);
 await assert.rejects(()=>h.rpc('edu_add_question_followup_with_image',[h.student,q.id,null,id(),'후속 질문',answer]),/QUESTION_INVALID/);
 assert.equal(await h.count('edu_question_answers'),0);
 for(const role of ['anon','authenticated']){
  await h.db.exec('reset role;set role '+role);
  await assert.rejects(()=>h.db.query('select edu_prepare_followup_image($1,$2,$3,$4)',[h.student,q.id,id(),spec]),/permission denied/);
  await assert.rejects(()=>h.db.query('select edu_add_question_followup_with_image($1,$2,null,$3,$4,$5)',[h.student,q.id,id(),'후속 질문',followup]),/permission denied/);
 }
});
