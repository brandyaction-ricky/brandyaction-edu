import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
async function fixture(t, beforeNotifications) {
 const h=await communityFixture(t);
 await h.owner('alter table curriculum_lessons add column description text;');
 await h.owner(read('20261003054513_admin_sent_message_delete.sql'));
 await h.owner(read('20261030064453_edu_curriculum_ai_and_usage.sql'));
 await h.owner(read('20261103112031_edu_ai_remove_student_daily_limits.sql'));
 await beforeNotifications?.(h);
 await h.owner(read('20261104084253_edu_mentor_reply_notifications_ai_burst.sql'));
 return h;
}
const begin=(h,overrides={})=>h.rpc('edu_ai_begin',Object.values({actor:h.student,request:id(),mode:'student',enrollment:h.enrollment,lesson:h.lesson,question:null,fingerprint:'a'.repeat(64),...overrides}));
const enable=h=>h.owner('insert into edu_ai_cohort_settings(cohort_id,enabled) values($1,true)',[h.cohort]);
test('AI is off until explicit cohort activation; ownership, public/private visibility and duplicate checks precede paid requests',async t=>{
 const h=await fixture(t);
 await assert.rejects(()=>begin(h),/AI_DISABLED/);await enable(h);
 await assert.rejects(()=>begin(h,{actor:h.other}),/FORBIDDEN/);
 const request=id();const r=await begin(h,{request});assert.equal(r.cohortId,h.cohort);
 await assert.rejects(()=>begin(h,{request}),/AI_DUPLICATE/);
 const docs=await h.rpc('edu_ai_curriculum',[h.student,request]);assert.ok(docs.some(l=>l.id===h.lesson));
 await h.owner('update edu_ai_cohort_settings set enabled=false');await assert.rejects(()=>h.rpc('edu_ai_assert',[h.student,request]),/AI_DISABLED/);
});
test('mentor drafts derive the cohort from the saved question, deny forged scope and preserve batch answer conflicts',async t=>{
 const h=await fixture(t);await enable(h);const q=await h.create();
 await assert.rejects(()=>begin(h,{actor:h.other,mode:'mentor',enrollment:null,lesson:null,question:q.id}),/AI_FORBIDDEN/);
 const request=id();await begin(h,{actor:h.admin,request,mode:'batch',enrollment:null,lesson:null,question:q.id});
 const docs=await h.rpc('edu_ai_curriculum',[h.admin,request]);assert.ok(docs.length);
 await h.owner("update edu_questions set is_resolved=true where id=$1",[q.id]);
 await assert.rejects(()=>h.rpc('edu_ai_assert',[h.admin,request]),/AI_ANSWERED/);
 await assert.rejects(()=>begin(h,{actor:h.admin,mode:'mentor',question:q.id}),/AI_INVALID/);
});
test('students can exceed both daily quotas; usage separates requests and API calls and marks missing measurements; browser roles have no access',async t=>{
 const h=await fixture(t);await enable(h);await h.owner('update edu_ai_cohort_settings set student_daily_limit=1,daily_limit=1');
 const request=id();
 for(let index=0;index<12;index++){
  const attempt=await begin(h,index===0?{request}:{});
  if(index===0)await assert.rejects(()=>begin(h),/AI_LIMIT/);
  await h.owner("update edu_ai_requests set status='succeeded', created_at=clock_timestamp()-interval '2 minutes' where id=$1",[attempt.requestId]);
 }
 await h.db.query("insert into edu_ai_calls(request_id,attempt,model,status) values($1,1,'gpt-5-mini','unknown')",[request]);
 const report=await h.rpc('edu_ai_usage',[h.admin,30]);assert.equal(report.rows[0].requests,12);assert.equal(report.rows[0].calls.api_calls,1);assert.equal(report.rows[0].calls.unmeasured_calls,1);assert.equal(report.rows[0].calls.unpriced_calls,1);
 await assert.rejects(()=>h.rpc('edu_ai_usage',[h.student,30]),/AI_FORBIDDEN/);
 await h.db.exec('set role authenticated');await assert.rejects(()=>h.db.query('select * from edu_ai_requests'),/permission denied/);await assert.rejects(()=>h.rpc('edu_ai_usage',[h.admin,30]),/permission denied/);
});

test('withdrawn and other-course lessons never enter the provider context; revocation and cohort cap are checked again',async t=>{
 const h=await fixture(t);await enable(h);const hidden=id(),otherLesson=id(),otherCourse=id(),otherWeek=id();
 await h.owner('insert into curriculum_lessons(id,week_id,is_published,title) values($1,$2,true,$3)',[hidden,h.week,'비공개 수업']);
 await h.owner('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,false)',[h.cohort,hidden]);
 await h.owner('insert into courses(id) values($1)',[otherCourse]);await h.owner('insert into curriculum_weeks(id,course_id,is_published) values($1,$2,true)',[otherWeek,otherCourse]);await h.owner('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[otherLesson,otherWeek]);
 const request=id();await begin(h,{request});const docs=await h.rpc('edu_ai_curriculum',[h.student,request]);assert.deepEqual(docs.map(l=>l.id),[h.lesson]);
 await h.owner('update enrollments set revoked_at=now() where id=$1',[h.enrollment]);await assert.rejects(()=>h.rpc('edu_ai_curriculum',[h.student,request]),/FORBIDDEN/);
 await h.owner('update enrollments set revoked_at=null where id=$1',[h.enrollment]);await h.db.query("update edu_ai_requests set status='succeeded' where id=$1",[request]);await h.owner('update edu_ai_cohort_settings set daily_limit=1');const q=await h.create();await assert.rejects(()=>begin(h,{actor:h.admin,mode:'mentor',question:q.id,enrollment:null,lesson:null}),/AI_LIMIT/);
});
test('one pending student call blocks concurrent duplicates, and published source removal blocks mentor access',async t=>{
 const h=await fixture(t);await enable(h);const first=id();await begin(h,{request:first});await assert.rejects(()=>begin(h),/AI_LIMIT/);
 const q=await h.create(),request=id();await begin(h,{actor:h.admin,request,mode:'mentor',question:q.id,enrollment:null,lesson:null});await h.owner('update edu_cohort_lesson_visibility set is_published=false where lesson_id=$1',[h.lesson]);await assert.rejects(()=>h.rpc('edu_ai_assert',[h.admin,request]),/AI_FORBIDDEN/);
});

test('student bursts cool down after the oldest accepted request expires and do not affect other learners',async t=>{
 const h=await fixture(t);await enable(h);
 const otherEnrollment=id();
 await h.owner("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[otherEnrollment,h.other,h.course,h.cohort]);
 const accepted=[];
 for(let index=0;index<6;index++){
  const {requestId}=await begin(h);accepted.push(requestId);
  await h.db.query("update edu_ai_requests set status='succeeded' where id=$1",[requestId]);
 }
 await assert.rejects(()=>begin(h),error=>error.message==='AI_BURST_LIMIT' && Number(error.detail)>0 && Number(error.detail)<=60);
 assert.equal(await h.count('edu_ai_requests'),6);
 assert.ok((await begin(h,{actor:h.other,enrollment:otherEnrollment})).requestId);
 await h.owner("update edu_ai_requests set created_at=clock_timestamp()-interval '61 seconds' where id=$1",[accepted[0]]);
 assert.ok((await begin(h)).requestId);
});

test('mentor notifications start at rollout and only mark displayed replies for their owner',async t=>{
 let q,previous;
 const addReply=(h,question,head)=>h.rpc('edu_add_question_answer',[h.admin,question,head,id(),'멘토 답변']);
 const h=await fixture(t,async fixture=>{
  q=await fixture.create({visibility:'private'});
  previous=await addReply(fixture,q.id,null);
 });
 const inbox=actor=>h.rpc('edu_unread_mentor_replies',[actor]);
 const mark=(actor,answers)=>h.rpc('edu_mark_mentor_replies_read',[actor,q.id,answers]);
 assert.deepEqual(await inbox(h.student),{count:0,questions:[]});
 const followup=await h.rpc('edu_add_question_followup',[h.student,q.id,previous.id,id(),'후속 질문']);
 const first=await addReply(h,q.id,followup.id);
 const second=await addReply(h,q.id,first.id);
 assert.deepEqual(await inbox(h.student),{count:2,questions:[{id:q.id,title:'공개 질문',count:2}]});
 assert.deepEqual(await inbox(h.other),{count:0,questions:[]});
 await mark(h.other,[first.id]);
 assert.equal((await inbox(h.student)).count,2);
 await mark(h.student,[first.id]);
 assert.equal((await inbox(h.student)).count,1);
 await h.owner('update edu_question_answers set deleted_at=now(),deleted_by=$2 where id=$1',[second.id,h.admin]);
 assert.equal((await inbox(h.student)).count,0);
 await h.db.exec('set role authenticated');
 await assert.rejects(()=>inbox(h.student),/permission denied/);
 await assert.rejects(()=>mark(h.student,[second.id]),/permission denied/);
});
