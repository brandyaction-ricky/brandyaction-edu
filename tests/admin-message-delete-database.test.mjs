import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
const migration=read('20261003054513_admin_sent_message_delete.sql');
async function fixture(t){const h=await communityFixture(t);await h.owner(migration);return h;}
test('operator deletes only own manual message; inbox, unread, read and reply exclude it and replay never restores it',async t=>{
 const h=await fixture(t),request=id(),args=[h.admin,request,'잘못 보낸 안내',[h.student,h.other],null,null];
 const sent=await h.rpc('edu_send_member_message',args),message=sent.messageIds[0];
 const row=(await h.db.query('select recipient_id from edu_member_messages where id=$1',[message])).rows[0];
 await assert.rejects(()=>h.rpc('edu_delete_member_message',[h.student,message]),/MESSAGE_FORBIDDEN/);
 const deleted=await h.rpc('edu_delete_member_message',[h.admin,message]);assert.equal(typeof deleted.deletedAt,'string');assert.deepEqual(await h.rpc('edu_delete_member_message',[h.admin,message]),deleted);
 assert.equal((await h.inbox(row.recipient_id)).rows.length,0);assert.equal((await h.unread(row.recipient_id)).count,0);
 await assert.rejects(()=>h.rpc('edu_mark_member_message_read',[row.recipient_id,message]),/MESSAGE_NOT_FOUND/);
 await assert.rejects(()=>h.rpc('edu_send_member_message',[row.recipient_id,id(),'삭제된 메시지에 답장',[],message,null]),/MESSAGE_NOT_FOUND/);
 assert.deepEqual(await h.rpc('edu_send_member_message',args),sent);assert.equal((await h.inbox(row.recipient_id)).rows.length,0);
 assert.equal((await h.rpc('edu_list_member_messages',[h.admin,'sent',null])).rows.length,1);
 for(const role of ['anon','authenticated']){await h.db.exec('reset role;set role '+role);await assert.rejects(()=>h.db.exec(`select edu_delete_member_message('${h.admin}','${message}')`),/permission denied/);}
});
test('answer deletion repairs summary without duplicate answers/notices, cancels queued push and hides shared content',async t=>{
 const h=await fixture(t),q=await h.create(),a=id(),b=id();
 await h.rpc('edu_add_question_answer',[h.admin,q.id,null,a,'첫 답변']);await h.rpc('edu_add_question_answer',[h.admin,q.id,a,b,'삭제할 답변']);
 await h.owner('update edu_questions set sharing_requested=true where id=$1',[q.id]);
 await h.rpc('edu_publish_shared_answer',[h.admin,q.id,'공유 제목','공유 내용',true]);
 const assist=id();await h.rpc('edu_question_assist',[h.admin,q.id,assist,null]);await h.rpc('edu_question_assist',[h.admin,q.id,assist,'기존 초안']);
 const before=await h.count('edu_question_answers');const jobs=await h.rpc('edu_claim_push',[15]);
 const event=(await h.db.query("select id from edu_push_events where kind='answer' and source=$1",[b])).rows[0];
 const delivery=(await h.db.query('select id from edu_push_deliveries where event_id=$1',[event.id])).rows[0];const job=jobs.find(j=>j.id===delivery.id);
 const deleted=await h.rpc('edu_delete_question_answer',[h.admin,q.id,b,b]);
 assert.deepEqual(await h.rpc('edu_delete_question_answer',[h.admin,q.id,b,b]),deleted);
 await assert.rejects(()=>h.rpc('edu_answer_from_assist',[h.admin,q.id,assist,id(),'이전 초안 사용']),/QUESTION_CHANGED/);
 const page=await h.rpc('edu_read_question_thread',[h.student,q.id,null]);assert.deepEqual(page.answers.map(a=>a.content),['첫 답변']);assert.equal(page.answers[0].canDelete,false);
 assert.equal((await h.db.query('select answer,status from edu_questions where id=$1',[q.id])).rows[0].answer,'첫 답변');assert.equal(await h.count('edu_question_answers'),before);
 assert.equal((await h.feed()).questions.find(x=>x.id===q.id).answer,'첫 답변');
 assert.equal((await h.db.query('select published from edu_shared_answers where source_question_id=$1',[q.id])).rows[0].published,false);
 assert.equal((await h.inbox()).rows.some(r=>r.content.includes('삭제할 답변')),false);
 assert.equal(await h.rpc('edu_read_push_delivery',[job.id,job.lease]),null);
 assert.equal((await h.db.query('select last_code from edu_push_deliveries where id=$1',[job.id])).rows[0].last_code,'ANSWER_DELETED');
 await h.rpc('edu_delete_question_answer',[h.admin,q.id,a,b]);
 const summary=(await h.db.query('select answer,status,is_resolved from edu_questions where id=$1',[q.id])).rows[0];assert.deepEqual(summary,{answer:null,status:'open',is_resolved:false});
 assert.deepEqual((await h.rpc('edu_read_question_thread',[h.student,q.id,null])).answers,[]);
 await h.rpc('edu_add_question_answer',[h.admin,q.id,a,b,'삭제할 답변']);assert.deepEqual((await h.rpc('edu_read_question_thread',[h.student,q.id,null])).answers,[]);
 await h.rpc('edu_add_question_answer',[h.admin,q.id,b,id(),'보완한 답변']);assert.equal((await h.rpc('edu_read_question_thread',[h.student,q.id,null])).answers.length,1);
});
test('learner posts and other operators are protected; stale deletes fail and transaction errors roll back all removal',async t=>{
 const h=await fixture(t),q=await h.create(),a=id(),followup=id();await h.rpc('edu_add_question_answer',[h.admin,q.id,null,a,'첫 답변']);
 await assert.rejects(()=>h.rpc('edu_delete_question_answer',[h.student,q.id,a,a]),/BLOCK_FORBIDDEN/);
 await h.owner("update profiles set role='staff' where id=$1;",[h.other]);await h.owner("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+h.other]);
 await assert.rejects(()=>h.rpc('edu_delete_question_answer',[h.other,q.id,a,a]),/BLOCK_FORBIDDEN/);
 await h.rpc('edu_add_question_followup',[h.student,q.id,a,followup,'후속 질문']);
 await assert.rejects(()=>h.rpc('edu_delete_question_answer',[h.admin,q.id,followup,followup]),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>h.rpc('edu_delete_question_answer',[h.admin,q.id,a,a]),/QUESTION_CHANGED/);
 await h.owner(`create function fail_removal() returns trigger language plpgsql as $$begin if new.deleted_at is not null then raise exception 'rollback fixture';end if;return new;end;$$;create trigger fail_removal before update on edu_member_messages for each row execute function fail_removal();`);
 await assert.rejects(()=>h.rpc('edu_delete_question_answer',[h.admin,q.id,a,followup]),/rollback fixture/);
 assert.equal((await h.db.query('select deleted_at from edu_question_answers where id=$1',[a])).rows[0].deleted_at,null);
 assert.equal((await h.db.query('select answer from edu_questions where id=$1',[q.id])).rows[0].answer,'첫 답변');
});
