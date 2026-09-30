import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {setup} from './helpers/learning-notifications.mjs';
async function start(t,options={}){
 const h=await setup(t,{push:true,...options});
 await h.owner("alter table edu_questions add column status text not null default 'open',add column learning_context text,add column is_archived boolean not null default false,add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now(),add column image_id uuid;");
 for(const file of ['20260928205907_question_answer_threads.sql','20260929071444_question_learner_followups.sql'])await h.owner(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const question=id(),image=id();await h.db.query('insert into edu_questions(id,user_id,title,content,image_id) values($1,$2,$3,$4,$5)',[question,h.student,'원래 질문','질문 본문',image]);
 const read=(actor=h.student,before=null)=>h.rpc('edu_read_question_thread',[actor,question,before]);
 const answer=(content,head=null,request=id(),actor=h.admin)=>h.rpc('edu_add_question_answer',[actor,question,head,request,content]);
 const follow=(content,head=null,request=id(),actor=h.student)=>h.rpc('edu_add_question_followup',[actor,question,head,request,content]);
 return{...h,question,image,read,answer,follow};
}
test('followups reopen the same question, preserve the operator answer/image, and create one admin notice per request',async t=>{
 const h=await start(t),a=await h.answer('원래 답변');await h.rpc('edu_resolve_question',[h.admin,h.question]);
 const beforeStudent=(await h.inbox()).rows.length,beforeAdmin=(await h.inbox(h.admin)).rows.length,beforePush=await h.count('edu_push_deliveries'),request=id();
 const f=await h.follow('추가로 궁금해요',a.id,request);assert.deepEqual(await h.follow('추가로 궁금해요',a.id,request),f);
 const page=await h.read();assert.equal(page.question.status,'open');assert.equal(page.question.resolved,false);assert.equal(page.question.imageId,h.image);assert.equal(page.question.headId,f.id);assert.equal(page.canFollowUp,true);assert.equal(page.canAnswer,false);
 assert.deepEqual(page.answers.map(x=>[x.source,x.content]),[['operator','원래 답변'],['learner','추가로 궁금해요']]);assert.equal((await h.db.query('select answer from edu_questions where id=$1',[h.question])).rows[0].answer,'원래 답변');
 assert.equal((await h.inbox()).rows.length,beforeStudent);assert.equal((await h.inbox(h.admin)).rows.length,beforeAdmin+1);assert.equal(await h.count('edu_push_deliveries'),beforePush+1);
 const last=await h.answer('추가 답변',f.id);assert.equal((await h.read()).question.status,'answered');assert.deepEqual(await h.follow('추가로 궁금해요',a.id,request),f);assert.equal((await h.read()).question.headId,last.id);assert.equal((await h.read()).answers.length,3);
});
test('ownership, active profile, archived questions, idempotency payload and optimistic concurrency are checked by the DB',async t=>{
 const h=await start(t);assert.equal((await h.read(h.admin)).canFollowUp,false);
 for(const actor of [h.other,h.admin])await assert.rejects(()=>h.follow('위조',null,id(),actor),/QUESTION_NOT_FOUND/);
 for(const content of [null,' \n ','가'.repeat(10001)])await assert.rejects(()=>h.follow(content),/QUESTION_INVALID/);
 const request=id(),first=await h.follow('첫 후속 질문',null,request);
 await assert.rejects(()=>h.follow('다른 내용',null,request),/QUESTION_REQUEST_REUSED/);await assert.rejects(()=>h.answer('새 답변',null,request),/QUESTION_REQUEST_REUSED/);
 await assert.rejects(()=>h.follow('이전 화면',null),/QUESTION_CHANGED/);await assert.rejects(()=>h.answer('이전 멘토 화면',null),/QUESTION_CHANGED/);
 await h.owner('update edu_questions set is_archived=true where id=$1',[h.question]);await assert.rejects(()=>h.follow('보관 후',first.id),/QUESTION_NOT_FOUND/);await assert.rejects(()=>h.follow('첫 후속 질문',null,request),/QUESTION_NOT_FOUND/);assert.equal((await h.read(h.admin)).canFollowUp,false);
 await h.owner('update edu_questions set is_archived=false where id=$1',[h.question]);await h.owner("update profiles set status='inactive' where id=$1",[h.student]);await assert.rejects(()=>h.follow('비활성',first.id),/MESSAGE_FORBIDDEN/);
});
test('mixed messages paginate without duplication and old editor replies retain learner history',async t=>{
 const h=await start(t);let head=null;for(let i=0;i<24;i++){const r=i%2?await h.answer('답변'+i,head):await h.follow('질문'+i,head);head=r.id;}
 const first=await h.read(),second=await h.read(h.student,first.nextCursor);assert.equal(first.answers.length,20);assert.equal(second.answers.length,4);assert.equal(new Set([...second.answers,...first.answers].map(x=>x.id)).size,24);
 await h.db.query('update edu_questions set answer=$1 where id=$2',['기존 화면 수정',h.question]);const page=await h.read();assert.equal(page.answers.at(-1).source,'legacy');assert.equal(page.question.status,'answered');assert.equal(await h.count('edu_question_answers'),25);
});
test('service-only RPC/table privileges remain closed and disabled notices produce no sends',async t=>{
 const h=await start(t,{enabled:false,push:false});await h.follow('이후 질문');assert.equal(await h.count('edu_member_messages'),0);assert.equal(await h.count('edu_push_deliveries'),0);
 for(const role of ['anon','authenticated']){
  assert.equal((await h.db.query("select has_function_privilege($1,'edu_add_question_followup(uuid,uuid,uuid,uuid,text)','EXECUTE') ok",[role])).rows[0].ok,false);
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await h.db.query('select has_table_privilege($1,$2,$3) ok',[role,'edu_question_answers',privilege])).rows[0].ok,false);
 }
 await assert.rejects(()=>h.db.query("update edu_question_answers set content='overwrite'"),/permission denied/);
});
