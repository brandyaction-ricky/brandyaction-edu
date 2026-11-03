import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
async function peer(h,cohort=h.cohort){const enrollment=id();await h.owner("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[enrollment,h.other,h.course,cohort]);return enrollment;}
test('public Q&A is immediate and scoped; legacy/private questions, image and thread remain protected',async t=>{
 const h=await communityFixture(t),enrollment=await peer(h);
 const legacy=await h.rpc('edu_create_hub_question',[h.student,id(),h.enrollment,h.lesson,'과거 질문','과거 비밀',null,'learning',true]);
 const secret=await h.create({visibility:'private',content:'개인정보'});
 const image=id();await h.rpc('edu_prepare_question_image',[h.student,h.enrollment,h.lesson,image,{kind:'image',name:'image.png',size:10,extension:'png',contentType:'image/png'}]);await h.rpc('edu_complete_question_image',[h.student,image,'a'.repeat(64)]);
 const q=await h.create({image}),request=id();const retry=await h.create({request});assert.deepEqual(await h.create({request}),retry);await assert.rejects(h.create({request,visibility:'private'}),/QUESTION_REQUEST_REUSED/);
 const feed=await h.feed(h.other);assert.equal(feed.questions.length,2);assert.ok(feed.questions.every(row=>row.mine===false));assert.doesNotMatch(JSON.stringify(feed),/개인정보|과거 비밀|user_id|enrollment_id/);
 assert.equal((await h.rpc('edu_read_question_image',[h.other,q.id])).id,image);
 await h.rpc('edu_add_question_followup',[h.student,q.id,null,id(),'추가 질문도 함께 보기']);
 const thread=await h.rpc('edu_read_question_thread',[h.other,q.id,null]);assert.equal(thread.canAnswer,false);assert.equal(thread.canFollowUp,false);assert.equal(thread.answers[0].authorName,'수강생');
 for(const question of [legacy,secret]){await assert.rejects(h.rpc('edu_read_question_thread',[h.other,question.id,null]),/QUESTION_NOT_FOUND/);await assert.rejects(h.rpc('edu_read_question_image',[h.other,question.id]),/QUESTION_NOT_FOUND/);}
 await assert.rejects(h.rpc('edu_add_question_followup',[h.other,q.id,thread.question.headId,id(),'위조']),/QUESTION_NOT_FOUND/);
 assert.equal((await h.feed(h.student,h.lesson,h.enrollment,true)).questions.length,4);
 const otherCohort=id();await h.owner('insert into cohorts(id,course_id) values($1,$2)',[otherCohort,h.course]);await h.owner('update enrollments set cohort_id=$1 where id=$2',[otherCohort,enrollment]);
 assert.equal((await h.feed(h.other)).questions.length,0);await assert.rejects(h.rpc('edu_read_question_image',[h.other,q.id]),/QUESTION_NOT_FOUND/);
 await h.owner('update enrollments set cohort_id=$1 where id=$2',[h.cohort,enrollment]);await h.owner('update edu_cohort_lesson_visibility set is_published=false where cohort_id=$1 and lesson_id=$2',[h.cohort,h.lesson]);
 assert.equal((await h.feed(h.other)).questions.length,0);await assert.rejects(h.rpc('edu_read_question_thread',[h.other,q.id,null]),/QUESTION_NOT_FOUND/);
 // The author can still read their own existing history after unpublication.
 assert.equal((await h.rpc('edu_read_question_thread',[h.student,secret.id,null])).question.content,'개인정보');
});
test('public writes require a real learning context; RPCs cannot be forged from the authenticated Data API',async t=>{
 const h=await communityFixture(t);
 for(const change of [{actor:h.other},{category:'payment'},{enrollment:null,lesson:null},{visibility:'invalid'}])await assert.rejects(h.create(change));
 assert.ok((await h.create({category:'account',enrollment:null,lesson:null,visibility:'private'})).id);
 for(const role of ['anon','authenticated'])for(const signature of ['edu_create_visible_question(uuid,uuid,uuid,uuid,text,text,uuid,text,text)','edu_can_read_cohort_question(uuid,uuid)','edu_read_cohort_questions(uuid,text,uuid,uuid,integer,boolean)'])assert.equal((await h.db.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,signature])).rows[0].allowed,false);
 await peer(h);const q=await h.create();await h.owner("update enrollments set revoked_at=now() where user_id=$1",[h.other]);assert.equal((await h.feed(h.other)).questions.length,0);await assert.rejects(h.rpc('edu_read_question_thread',[h.other,q.id,null]),/QUESTION_NOT_FOUND/);
});
test('push policy skips already queued non-Q&A deliveries and rejects future message/review events',async t=>{
 const h=await communityFixture(t);
 await h.owner("select edu_private.enqueue_push($1,'review','old-review','/my/missions')",[h.student]);
 const old=(await h.db.query("select d.id from edu_push_deliveries d join edu_push_events e on e.id=d.event_id where e.kind='review'")).rows[0];assert.ok(old);
 await h.owner(read('20261002102249_learner_feedback_question_push.sql'));
 assert.equal((await h.db.query('select status from edu_push_deliveries where id=$1',[old.id])).rows[0].status,'skipped');
 const before=await h.count('edu_push_events');for(const kind of ['message','review','submission'])await h.owner("select edu_private.enqueue_push($1,$2,$3,'/my/messages')",[h.student,kind,id()]);assert.equal(await h.count('edu_push_events'),before);
 await h.create();assert.ok(await h.count('edu_push_events')>before);
});
test('onboarding requires completion across direct reads, honors cohort visibility and keeps already completed lessons revisitable',async t=>{
 const h=await communityFixture(t);
 const second=id(),third=id();await h.owner("insert into curriculum_lessons(id,week_id,is_published,day_number,title) values($1,$3,true,2,'둘째'),($2,$3,true,3,'셋째')",[second,third,h.week]);
 await h.owner('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,true),($1,$3,true)',[h.cohort,second,third]);
 await h.owner('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[h.enrollment,third]);
 await h.owner(read('20261002102250_learner_feedback_completion_gate.sql'));
 const gate=lesson=>h.rpc('edu_lesson_progression_gate',[h.enrollment,lesson]);
 assert.equal((await gate(h.lesson)).isUnlocked,true);assert.equal((await gate(second)).isUnlocked,false);
 await assert.rejects(h.rpc('edu_read_lesson_blocks',[h.student,second,h.enrollment,null]),/BLOCK_LESSON_LOCKED/);
 await assert.rejects(h.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[h.enrollment,second]),/BLOCK_LESSON_LOCKED/);
 await h.owner("insert into lesson_contents values($1,'첫 학습'),($2,'잠긴 본문')",[h.lesson,second]);
 await h.db.query("select set_config('request.jwt.claim.sub',$1,false)",[h.student]);await h.db.exec('set role authenticated');assert.equal((await h.db.query('select * from lesson_contents')).rows.length,1);await h.db.exec('set role service_role');
 await h.draft(); const submission=await h.submit(); await h.decide(submission);assert.equal((await gate(second)).isUnlocked,true);assert.equal((await gate(third)).isUnlocked,true);
 assert.equal((await gate(third)).isUnlocked,true);
 await h.owner('update edu_cohort_lesson_visibility set is_published=false where lesson_id=$1',[second]);assert.equal((await gate(third)).isUnlocked,true);
});
