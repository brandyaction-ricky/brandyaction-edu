import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
const spec={kind:'image',name:'curriculum.png',size:8,extension:'png',contentType:'image/png'};
async function fixture(t){const h=await communityFixture(t);await h.owner(read('20261003054513_admin_sent_message_delete.sql'));await h.owner(read('20261008004234_question_answer_images.sql'));return h;}
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
