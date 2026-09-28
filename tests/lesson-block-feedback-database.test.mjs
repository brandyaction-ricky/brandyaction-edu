import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import fs from 'node:fs';
import { setup } from './helpers/learning-notifications.mjs';
async function start(t,options={}) {
 const h=await setup(t,{push:true,...options});await h.draft();h.s=await h.submit();
 h.note=(s=h.s,body='고객 사례를 잘 정리했습니다.',request=id(),actor=h.admin,expected=s.feedbackId??null)=>h.rpc('edu_save_block_feedback',[actor,s.id,s.stateId,expected,request,body]);
 h.detail=(s=h.s,actor=h.student,enroll=h.enrollment)=>h.rpc('edu_read_block_submission',[actor,s.id,enroll]);
 return h;
}
test('feedback saves independently of review, preserves answers/draft/progress, and creates one learner notice per request',async t=>{
 const h=await start(t),before=(await h.db.query('select values,write_id from edu_lesson_block_drafts')).rows;
 const request=id(),r=await h.note(h.s,'자세한 조언',request);assert.equal(r.state,'submitted');assert.equal(r.stateId,h.s.stateId);assert.equal(r.feedbackId,request);assert.equal(r.feedback,'자세한 조언');
 assert.deepEqual(await h.note(h.s,'자세한 조언',request),r);assert.equal(await h.count('edu_lesson_block_feedback'),1);assert.equal(await h.count('edu_lesson_block_reviews'),0);
 assert.deepEqual((await h.db.query('select values,write_id from edu_lesson_block_drafts')).rows,before);assert.equal(await h.count('lesson_progress'),0);
 const detail=await h.detail();assert.deepEqual(detail.history.map(e=>e.decision),['feedback']);assert.deepEqual(detail.values,before[0].values);
 const inbox=await h.inbox();assert.equal(inbox.rows.length,1);assert.match(inbox.rows[0].content,/자세한 조언/);assert.equal(inbox.rows[0].targetPath,`/learn/${h.enrollment}/${h.lesson}`);assert.equal(await h.count('edu_push_deliveries'),2);
});
test('approved work accepts further feedback, empty approval retains it, and history follows state order even with misleading timestamps',async t=>{
 const h=await start(t);const a=await h.note();const approved=await h.decide(a,'approved','');assert.equal(approved.feedback,a.feedback);assert.equal(approved.feedbackId,a.feedbackId);
 const progress=(await h.db.query('select * from lesson_progress')).rows;const after=await h.note(approved,'승인 후 추가 조언');assert.equal(after.state,'approved');assert.equal(after.stateId,approved.stateId);assert.deepEqual((await h.db.query('select * from lesson_progress')).rows,progress);
 await h.owner("update edu_lesson_block_reviews set created_at='2000-01-01'");
 const history=(await h.detail()).history;assert.deepEqual(history.map(e=>e.decision),['feedback','approved','feedback']);assert.equal(history[2].feedback,'승인 후 추가 조언');
});
test('decision feedback shares a version token, conflicting mentors and reused requests fail without duplicate notices',async t=>{
 const h=await start(t),request=id(),first=await h.note(h.s,'첫 의견',request);
 await assert.rejects(()=>h.note(h.s,'덮어쓰기'),/BLOCK_REVIEW_CHANGED/);await assert.rejects(()=>h.note(h.s,'바뀐 요청',request),/BLOCK_REQUEST_REUSED/);
 const revised=await h.decide(first,'changes_requested','다른 사례를 추가해 주세요.');assert.equal(revised.feedbackId,revised.stateId);assert.equal(revised.feedback,'다른 사례를 추가해 주세요.');
 await assert.rejects(()=>h.note(first,'지난 화면에서 작성한 의견'),/BLOCK_REVIEW_CHANGED/);
 const last=await h.note(revised,'보충 조언');assert.equal(last.state,'changes_requested');assert.deepEqual((await h.detail()).history.map(e=>e.decision),['feedback','changes_requested','feedback']);assert.equal((await h.inbox()).rows.length,3);
});
test('older attempts are immutable after resubmission and feedback remains visible only through entitled reads',async t=>{
 const h=await start(t),n=await h.note();const reopened=await h.rpc('edu_decide_lesson_blocks',[h.student,h.s.id,h.s.stateId,id(),'reopened','']);h.setWrite(reopened.stateId);await h.draft();const second=await h.submit();
 await assert.rejects(()=>h.note(reopened,'지난 답변 수정'),/BLOCK_REVIEW_CHANGED/);const old=await h.detail();assert.equal(old.isLatest,false);assert.equal(old.submission.feedback,n.feedback);assert.equal(old.previousSubmissions[0].id,second.id);
 await assert.rejects(()=>h.detail(h.s,h.other),/BLOCK_FORBIDDEN/);await h.owner('update enrollments set revoked_at=now()');await assert.rejects(()=>h.note(second),/BLOCK_FORBIDDEN/);await assert.rejects(()=>h.detail(),/BLOCK_FORBIDDEN/);
});
test('review permission, inactive identities, invalid feedback and browser roles cannot write or expose notes',async t=>{
 const h=await start(t);
 await assert.rejects(()=>h.note(h.s,'조언',id(),h.student),/BLOCK_FORBIDDEN/);
 await h.owner("update profiles set role='staff' where id=$1",[h.admin]);await assert.rejects(()=>h.note(),/BLOCK_FORBIDDEN/);
 await h.owner("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+h.admin]);await h.note();
 await h.owner("update profiles set status='inactive' where id=$1",[h.admin]);await assert.rejects(()=>h.note(),/BLOCK_FORBIDDEN/);
 for(const body of ['', '   ', '가'.repeat(2001)])await assert.rejects(()=>h.note(h.s,body),/BLOCK_INVALID/);
 await h.db.exec('reset role');for(const role of ['anon','authenticated']){
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await h.db.query('select has_table_privilege($1,$2,$3) ok',[role,'edu_lesson_block_feedback',privilege])).rows[0].ok,false);
  assert.equal((await h.db.query("select has_function_privilege($1,'edu_save_block_feedback(uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') ok",[role])).rows[0].ok,false);
 }
 await h.db.exec('set role service_role');await assert.rejects(()=>h.db.exec("update edu_lesson_block_feedback set feedback='erase'"),/permission denied/);
});
test('a failed notice rolls back feedback and delivery together and the same request can then recover',async t=>{
 const h=await start(t),request=id();await h.owner(`create function fail_feedback_notice() returns trigger language plpgsql as $$ begin raise exception 'notice unavailable'; end $$;create trigger fail_feedback_notice before insert on edu_member_messages for each row execute function fail_feedback_notice();`);
 await assert.rejects(()=>h.note(h.s,'복구할 조언',request),/notice unavailable/);assert.equal(await h.count('edu_lesson_block_feedback'),0);assert.equal(await h.count('edu_push_deliveries'),1);
 await h.owner('drop trigger fail_feedback_notice on edu_member_messages');const result=await h.note(h.s,'복구할 조언',request);assert.equal(result.feedbackId,request);assert.equal((await h.inbox()).rows.length,1);
});
test('automatic approval remains approval when feedback is added and later retry reports the current version',async t=>{
 const h=await setup(t,{daily:true});await h.rpc('edu_progression_settings',[h.admin,h.cohort,id(),null,2]);await h.draft();const s=await h.submit();const request=id();
 const note=(r,body,req)=>h.rpc('edu_save_block_feedback',[h.admin,s.id,r.stateId,r.feedbackId??null,req,body]);
 const first=await note(s,'자동 승인 뒤 피드백',request);assert.equal(first.approvalKind,'automatic');assert.equal(first.state,'approved');const second=await note(first,'추가 피드백',id());
 assert.deepEqual(await note(s,'자동 승인 뒤 피드백',request),second);assert.equal((await h.inbox()).rows.length,2);
});
test('applying the migration preserves pre-existing decisions and feedback without generating historical notifications',async t=>{
 const h=await setup(t,{feedback:false,push:true});await h.draft();const s=await h.submit();const approved=await h.decide(s,'approved','이전부터 있던 검토 의견');
 const before=(await h.db.query('select * from edu_lesson_block_submissions')).rows,notices=await h.count('edu_member_messages'),deliveries=await h.count('edu_push_deliveries');
 await h.owner(fs.readFileSync(new URL('../supabase/migrations/20260928204904_lesson_block_feedback_notes.sql',import.meta.url),'utf8'));
 const detail=await h.rpc('edu_read_block_submission',[h.student,s.id,h.enrollment]);assert.equal(detail.submission.feedback,approved.feedback);assert.equal(detail.submission.stateId,approved.stateId);assert.equal(detail.submission.feedbackId,approved.stateId);assert.equal(detail.history.length,1);
 assert.deepEqual((await h.db.query('select * from edu_lesson_block_submissions')).rows,before);assert.equal(await h.count('edu_member_messages'),notices);assert.equal(await h.count('edu_push_deliveries'),deliveries);
});
