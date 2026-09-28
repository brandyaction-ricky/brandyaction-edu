import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture, document } from './helpers/lesson-block-review.mjs';
async function setup(t,{enabled=true,push=false,daily=false}={}){
 const h=await fixture({...document,...(daily?{progression:{track:'daily',dayNumber:1}}:{}),completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true}});t.after(()=>h.db.close());
 const owner=async(sql,args=[])=>{await h.db.exec('reset role');try{return args.length?await h.db.query(sql,args):await h.db.exec(sql);}finally{await h.db.exec('set role service_role');}};
 await owner(`alter table profiles add column email text;
 alter table curriculum_missions add column title text;
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 create table edu_questions(id uuid primary key default gen_random_uuid(),user_id uuid,title text,content text,answer text);
 create table mission_submissions(id uuid primary key,enrollment_id uuid,mission_id uuid,status text,reviewer_feedback text,reviewed_at timestamptz,reviewed_by uuid);
 create table audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb);
 grant select,insert,update on edu_questions,mission_submissions,audit_logs,edu_ongoing_completions to service_role;`);
 for(const file of ['20260925221921_submission_review_audit.sql','20260928194336_edu_member_messages.sql','20260928200320_edu_web_push_delivery.sql','20260928203235_edu_learning_notifications.sql'])await owner(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 if(enabled)await owner('update edu_learning_notice_control set enabled=true');
 if(push){await owner('update edu_push_control set enabled=true');for(const who of [h.admin,h.student])await h.db.query('select edu_register_push($1,$2,$3,$4)',[who,'https://fcm.googleapis.com/fcm/send/'+who,'A'.repeat(87),'B'.repeat(22)]);}
 const rpc=async(name,args=[]) => (await h.db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 const inbox=(actor=h.student)=>rpc('edu_list_member_messages',[actor,'inbox',null]);
 const unread=(actor=h.student)=>rpc('edu_unread_member_messages',[actor]);
 const question=async(content='질문 원문')=>{const q=id();await h.db.query('insert into edu_questions values($1,$2,$3,$4,null)',[q,h.student,'질문 제목',content]);return q;};
 const answer=(q,body='답변 원문')=>h.db.query('update edu_questions set answer=$1 where id=$2',[body,q]);
 const decide=(s,decision='approved',feedback='좋습니다',request=id())=>rpc('edu_decide_lesson_blocks',[h.admin,s.id,s.stateId,request,decision,feedback]);
 const count=async(table)=>(await h.db.query(`select count(*)::integer n from ${table}`)).rows[0].n;
 return{...h,owner,rpc,inbox,unread,question,answer,decide,count};
}
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
