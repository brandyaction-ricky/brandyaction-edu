import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {setup} from './helpers/learning-notifications.mjs';
const migration=fs.readFileSync(new URL('../supabase/migrations/20260928205907_question_answer_threads.sql',import.meta.url),'utf8');
async function start(t,{migrate=true}={}){
 const h=await setup(t,{push:true});await h.owner("alter table edu_questions add column status text not null default 'open',add column learning_context text default '과정 · 1일차',add column is_archived boolean not null default false,add column created_at timestamptz not null default now(),add column updated_at timestamptz not null default now();");
 const question=id();await h.db.query('insert into edu_questions(id,user_id,title,content) values($1,$2,$3,$4)',[question,h.student,'학습 질문','실행 질문 원문']);if(migrate)await h.owner(migration);
 const read=(actor=h.student,before=null)=>h.rpc('edu_read_question_thread',[actor,question,before]);
 const answer=(content='운영자 답변',head=null,request=id(),actor=h.admin)=>h.rpc('edu_add_question_answer',[actor,question,head,request,content]);
 return{...h,question,read,answer};
}
test('answers accumulate in order, mirror the latest answer and notify the owner once per idempotent request',async t=>{
 const h=await start(t),request=id();const a=await h.answer('첫 답변',null,request);assert.deepEqual(await h.answer('첫 답변',null,request),a);const b=await h.answer('두 번째 답변',a.id);const page=await h.read();
 assert.deepEqual(page.answers.map(a=>a.content),['첫 답변','두 번째 답변']);assert.equal(page.question.headId,b.id);assert.equal(page.question.status,'answered');assert.equal(page.question.resolved,false);assert.equal(page.canAnswer,false);assert.equal(page.question.learningContext,'과정 · 1일차');
 assert.equal((await h.db.query('select answer from edu_questions where id=$1',[h.question])).rows[0].answer,'두 번째 답변');assert.equal((await h.inbox()).rows.length,2);assert.equal(await h.count('edu_push_deliveries'),3);
 assert.deepEqual(await h.answer('첫 답변',null,request),a);await assert.rejects(()=>h.answer('덮어쓰기',null),/QUESTION_CHANGED/);await assert.rejects(()=>h.answer('재사용',null,request),/QUESTION_REQUEST_REUSED/);
});
test('legacy edits append history without duplicate notices and repeating identical text through the new API is a distinct deliberate answer',async t=>{
 const h=await start(t);const first=await h.answer('원래 답변');await h.db.query('update edu_questions set answer=$1 where id=$2',['옛 편집기에서 수정',h.question]);await h.db.query('update edu_questions set answer=$1 where id=$2',['옛 편집기에서 수정',h.question]);
 let page=await h.read();assert.deepEqual(page.answers.map(a=>a.content),['원래 답변','옛 편집기에서 수정']);assert.equal((await h.inbox()).rows.length,2);assert.equal(page.answers[1].authorName,'운영자');
 await h.answer('옛 편집기에서 수정',page.question.headId);page=await h.read();assert.equal(page.answers.length,3);assert.equal((await h.inbox()).rows.length,3);assert.equal(page.answers[0].id,first.id);
});
test('backfill preserves all existing answer text and timestamps without sending past answers again',async t=>{
 const h=await start(t,{migrate:false});const content='긴 기존 답변'.repeat(3000);await h.db.query("update edu_questions set answer=$1,status='answered',updated_at='2026-01-02' where id=$2",[content,h.question]);const before=await h.count('edu_member_messages');await h.owner(migration);
 const page=await h.read();assert.equal(page.answers.length,1);assert.equal(page.answers[0].content,content);assert.match(page.answers[0].createdAt,/2026-01-02/);assert.equal(await h.count('edu_member_messages'),before);
});
test('only the active question owner and current member operators may read; only operators write; archived questions are read-only for operators',async t=>{
 const h=await start(t);await assert.rejects(()=>h.read(h.other),/QUESTION_NOT_FOUND/);await assert.rejects(()=>h.answer('위조',null,id(),h.student),/BLOCK_FORBIDDEN/);
 await h.owner("update profiles set role='staff' where id=$1",[h.admin]);await assert.rejects(()=>h.read(h.admin),/QUESTION_NOT_FOUND/);await assert.rejects(()=>h.answer(),/BLOCK_FORBIDDEN/);
 await h.owner("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+h.admin]);await h.answer();assert.equal((await h.read(h.admin)).canAnswer,true);
 await h.owner('update edu_questions set is_archived=true where id=$1',[h.question]);await assert.rejects(()=>h.read(),/QUESTION_NOT_FOUND/);assert.equal((await h.read(h.admin)).canAnswer,false);await assert.rejects(()=>h.answer(),/QUESTION_NOT_FOUND/);
 await h.owner("update profiles set status='inactive' where id=$1",[h.admin]);await assert.rejects(()=>h.read(h.admin),/MESSAGE_FORBIDDEN/);
});
test('resolve without an answer does not manufacture a reply or notification and can be retried',async t=>{
 const h=await start(t),before=await h.count('edu_push_deliveries');for(let i=0;i<2;i++)assert.equal((await h.rpc('edu_resolve_question',[h.admin,h.question])).resolved,true);
 const page=await h.read();assert.equal(page.question.resolved,true);assert.equal(page.question.status,'answered');assert.equal(page.answers.length,0);assert.equal(await h.count('edu_push_deliveries'),before);
 await h.answer();assert.equal((await h.read()).answers.length,1);await assert.rejects(()=>h.rpc('edu_resolve_question',[h.student,h.question]),/BLOCK_FORBIDDEN/);
});
test('stable cursor pages retain every answer without exposing actor IDs or another question',async t=>{
 const h=await start(t);let head=null;for(let i=0;i<23;i++)head=(await h.answer('답변 '+i,head)).id;
 const first=await h.read();assert.equal(first.answers.length,20);assert.equal(first.answers[0].content,'답변 3');assert.equal(typeof first.nextCursor,'string');await h.answer('새 답변',head);
 const second=await h.read(h.student,first.nextCursor);assert.equal(second.answers.length,3);assert.equal(second.nextCursor,null);assert.deepEqual([...second.answers,...first.answers].map(a=>a.content),Array.from({length:23},(_,i)=>'답변 '+i));assert.equal(first.answers[0].actorId,undefined);
 await assert.rejects(()=>h.read(h.student,0),/QUESTION_INVALID/);
});
test('failed notification rolls back both the new answer and legacy mirror; browser roles cannot bypass the API',async t=>{
 const h=await start(t);await h.owner("create function fail_thread_notice() returns trigger language plpgsql as $$ begin raise exception 'notice unavailable'; end $$; create trigger fail_thread_notice before insert on edu_member_messages for each row execute function fail_thread_notice();");const request=id();
 await assert.rejects(()=>h.answer('원자적 답변',null,request),/notice unavailable/);assert.equal((await h.read()).answers.length,0);assert.equal((await h.read()).question.headId,null);
 await h.owner('drop trigger fail_thread_notice on edu_member_messages');await h.answer('원자적 답변',null,request);assert.equal((await h.read()).answers.length,1);
 await h.db.exec('reset role');for(const role of ['anon','authenticated']){for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await h.db.query('select has_table_privilege($1,$2,$3) ok',[role,'edu_question_answers',privilege])).rows[0].ok,false);assert.equal((await h.db.query("select has_function_privilege($1,'edu_add_question_answer(uuid,uuid,uuid,uuid,text)','EXECUTE') ok",[role])).rows[0].ok,false);}
});
