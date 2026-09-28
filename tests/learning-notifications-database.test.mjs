import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-notifications.mjs';
test('automatic inbox notices are paused by default without changing question saves or manual messages',async t=>{
 const h=await setup(t,{enabled:false});const q=await h.question();await h.answer(q);assert.equal(await h.count('edu_member_messages'),0);
 await h.rpc('edu_send_member_message',[h.admin,id(),'직접 메시지',[h.student],null,null]);assert.equal((await h.inbox()).rows[0].isNotice,false);
 await assert.rejects(()=>h.db.exec('update edu_learning_notice_control set enabled=true'),/permission denied/);
});
test('full question and answer snapshots survive later edits without requiring push permission',async t=>{
 const h=await setup(t),question='질문'.repeat(4000),answer='답변'.repeat(4000),q=await h.question(question);assert.equal((await h.inbox(h.admin)).rows[0].targetPath,'/admin/questions');
 await h.answer(q,answer);await h.answer(q,answer);assert.equal((await h.unread()).count,1);
 const first=(await h.inbox()).rows[0];assert.equal(first.content,'[질문함 답변]\n\nQ. '+question+'\n\nA. '+answer);assert.equal(first.senderId,null);assert.equal(first.isNotice,true);assert.equal(first.targetPath,'/my/questions');
 await h.answer(q,'보완한 답변');assert.equal((await h.inbox()).rows[1].content,first.content);assert.equal((await h.unread()).count,2);assert.equal(await h.count('edu_push_deliveries'),0);
 await h.rpc('edu_mark_member_message_read',[h.student,first.id]);assert.equal((await h.unread()).count,1);await assert.rejects(()=>h.rpc('edu_mark_member_message_read',[h.other,first.id]),/MESSAGE_NOT_FOUND/);
});
test('real lesson submit/decision transactions create one notice and one push each, and preserve submitted answers',async t=>{
 const h=await setup(t,{push:true});await h.draft();const request=id(),s=await h.submit(request);await h.submit(request);
 assert.equal((await h.inbox(h.admin)).rows.length,1);assert.equal((await h.inbox(h.admin)).rows[0].targetPath,'/admin/reviews?tab=blocks');
 const before=(await h.db.query('select values from edu_lesson_block_submissions where id=$1',[s.id])).rows[0].values;
 const review=id();await h.decide(s,'changes_requested','고객 사례를 더해 주세요.',review);await h.decide(s,'changes_requested','고객 사례를 더해 주세요.',review);
 assert.equal((await h.inbox()).rows.length,1);assert.match((await h.inbox()).rows[0].content,/고객 사례/);assert.equal((await h.inbox()).rows[0].targetPath,`/learn/${h.enrollment}/${h.lesson}`);
 assert.equal(await h.count('edu_push_deliveries'),2);assert.deepEqual((await h.db.query('select values from edu_lesson_block_submissions where id=$1',[s.id])).rows[0].values,before);
 assert.equal((await h.db.query('select progress_percent from lesson_progress')).rows.length,0);
});
test('same-transaction automatic approval creates no false mentor request or learner review notice',async t=>{
 const h=await setup(t,{push:true,daily:true});
 // Use the real automatic-approval path for an imported daily lesson.
 await h.rpc('edu_progression_settings',[h.admin,h.cohort,id(),null,2]);await h.draft();const s=await h.submit();assert.equal(s.approvalKind,'automatic');
 assert.equal((await h.inbox(h.admin)).rows.length,0);assert.equal((await h.inbox()).rows.length,0);assert.equal(await h.count('edu_push_deliveries'),0);
});
test('legacy review and feedback changes notify the owner once while pending checks reject obsolete deliveries',async t=>{
 const h=await setup(t,{push:true}),mission=id(),submission=id();await h.db.query('insert into curriculum_missions(id,lesson_id,title) values($1,$2,$3)',[mission,h.lesson,'기존 미션']);
 await h.db.query("insert into mission_submissions(id,enrollment_id,mission_id,status) values($1,$2,$3,'submitted')",[submission,h.enrollment,mission]);
 const[job]=await h.rpc('edu_claim_push',[15]);assert.equal((await h.rpc('edu_read_push_delivery',[job.id,job.lease])).path,'/admin/reviews?tab=missions');
 await h.rpc('review_mission_submissions_with_checks',[h.admin,[submission],'approved','승인 피드백',null,'legacy']);
 assert.equal((await h.inbox()).rows.length,1);assert.equal(await h.rpc('edu_read_push_delivery',[job.id,job.lease]),null);
 await h.db.query("update mission_submissions set reviewer_feedback='추가 조언' where id=$1",[submission]);await h.db.query("update mission_submissions set reviewer_feedback='추가 조언' where id=$1",[submission]);
 assert.equal((await h.inbox()).rows.length,2);assert.match((await h.inbox()).rows[0].content,/멘토 피드백/);assert.equal((await h.inbox(h.other)).rows.length,0);assert.equal(await h.count('edu_push_deliveries'),3);
});
test('revoking reviewer access hides old admin-only notices in inbox, count and read mutations',async t=>{
 const h=await setup(t);await h.question();const notice=(await h.inbox(h.admin)).rows[0];
 await h.owner("update profiles set role='member' where id=$1",[h.admin]);assert.equal((await h.inbox(h.admin)).rows.length,0);assert.equal((await h.unread(h.admin)).count,0);await assert.rejects(()=>h.rpc('edu_mark_member_message_read',[h.admin,notice.id]),/MESSAGE_NOT_FOUND/);
 await h.owner("update profiles set status='inactive' where id=$1",[h.student]);await assert.rejects(()=>h.unread(),/MESSAGE_FORBIDDEN/);
 for(const role of ['anon','authenticated']){await h.db.exec('reset role;set role '+role);for(const sql of ['select * from edu_member_messages','select * from edu_learning_notice_control',`select edu_unread_member_messages('${h.admin}')`,`select edu_private.learning_notice('${h.admin}','answer','fake','fake','/my/questions')`])await assert.rejects(()=>h.db.exec(sql),/permission denied/);}
});
test('a notice failure rolls back the answer change and queued delivery as one transaction',async t=>{
 const h=await setup(t,{push:true}),q=await h.question();await h.owner(`create function reject_notice() returns trigger language plpgsql as $$begin if new.content like '[질문함 답변]%' then raise exception 'notice fixture failure';end if;return new;end;$$;create trigger reject_notice before insert on edu_member_messages for each row execute function reject_notice();`);
 await assert.rejects(()=>h.answer(q),/notice fixture failure/);assert.equal((await h.db.query('select answer from edu_questions where id=$1',[q])).rows[0].answer,null);assert.equal((await h.inbox()).rows.length,0);assert.equal(await h.count('edu_push_deliveries'),1);
});
