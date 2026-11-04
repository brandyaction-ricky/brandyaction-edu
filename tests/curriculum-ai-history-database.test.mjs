import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as id} from 'node:crypto';
import {communityFixture,read} from './helpers/question-community.mjs';
const migration='20261031022224_edu_ai_student_conversation_history.sql';
async function fixture(t){const h=await communityFixture(t);await h.owner('alter table curriculum_lessons add column description text;');for(const name of ['20261030064453_edu_curriculum_ai_and_usage.sql',migration]){await h.db.exec('reset role');try{await h.db.exec(read(name));}catch(e){await h.db.exec('rollback');throw e;}finally{await h.db.exec('set role service_role');}}await h.owner('insert into edu_ai_cohort_settings(cohort_id,enabled) values($1,true)',[h.cohort]);return h;}
const answer={answer:'질문의 최근 경험부터 확인하세요.',needsMentor:false,sources:[],searchedLessons:1};
const begin=(h,overrides={})=>h.rpc('edu_ai_student_begin',Object.values({actor:h.student,request:id(),enrollment:h.enrollment,lesson:h.lesson,text:'고객 인터뷰 방법은?',image:null,fingerprint:'a'.repeat(64),...overrides}));
const finish=(h,request,result=answer)=>h.rpc('edu_ai_student_finish',[h.student,request,result,result?null:'시험 실패']);
const history=(h,actor=h.student,enrollment=h.enrollment,lesson=h.lesson,before=null,beforeId=null)=>h.rpc('edu_ai_student_history',[actor,enrollment,lesson,before,beforeId]);
test('history is private, persists questions and answers and supplies only saved recent turns',async t=>{
 const h=await fixture(t),request=id();const first=await begin(h,{request});assert.deepEqual(first.history,[]);await finish(h,request);
 const saved=await history(h);assert.equal(saved.items.length,1);assert.equal(saved.items[0].question,'고객 인터뷰 방법은?');assert.deepEqual(saved.items[0].answer,answer);
 const cached=await begin(h,{request});assert.deepEqual(cached.cached,answer);assert.equal((await h.db.query('select count(*)::integer n from edu_ai_requests')).rows[0].n,1);
 const second=await begin(h);assert.deepEqual(second.history,[{role:'user',text:'고객 인터뷰 방법은?'},{role:'assistant',text:answer.answer}]);await finish(h,second.requestId);
 const own=await history(h,h.student,null,null);assert.equal(own.conversations.length,1);assert.equal(own.conversations[0].lessonId,h.lesson);
 await assert.rejects(()=>history(h,h.other),/AI_FORBIDDEN/);assert.deepEqual((await history(h,h.other,null,null)).conversations,[]);
 await h.db.exec('set role authenticated');await assert.rejects(()=>h.db.query('select * from edu_ai_conversation_turns'),/permission denied/);await assert.rejects(()=>history(h),/permission denied/);
});
test('pending, failure and duplicate retries never replace saved answers or cross lesson scopes',async t=>{
 const h=await fixture(t),request=id();await begin(h,{request});await assert.rejects(()=>begin(h,{request}),/AI_PENDING/);await assert.rejects(()=>begin(h,{request,text:'변경된 질문'}),/AI_DUPLICATE/);
 await finish(h,request,null);await assert.rejects(()=>begin(h,{request}),/AI_PREVIOUS_FAILED/);assert.equal((await history(h)).items[0].status,'failed');
 const r=await begin(h);await finish(h,r.requestId);await finish(h,r.requestId,null);assert.deepEqual((await history(h)).items.find(x=>x.requestId===r.requestId).answer,answer);
 await h.owner('update enrollments set revoked_at=now() where id=$1',[h.enrollment]);await assert.rejects(()=>history(h),/AI_FORBIDDEN/);assert.deepEqual((await history(h,h.student,null,null)).conversations,[]);await assert.rejects(()=>begin(h,{request:r.requestId}),/AI_FORBIDDEN/);
});
test('history is keyset paginated and does not resend historical attachments; image reads require the owner',async t=>{
 const h=await fixture(t);const image=id();await h.owner("insert into edu_question_images(id,owner_id,enrollment_id,lesson_id,name,size,extension,content_type,path,ready_at,sha256) values($1,$2,$3,$4,'캡처.png',12,'png','image/png','synthetic-history',now(),$5)",[image,h.student,h.enrollment,h.lesson,'b'.repeat(64)]);
 const r=await begin(h,{image});await finish(h,r.requestId);assert.equal((await h.rpc('edu_ai_student_image',[h.student,r.requestId])).id,image);await assert.rejects(()=>h.rpc('edu_ai_student_image',[h.other,r.requestId]),/AI_FORBIDDEN/);
 for(let i=0;i<22;i++){const r=await begin(h,{text:'질문 '+i});assert.ok(r.history.length<=4);await finish(h,r.requestId);}
 const page=await history(h);assert.equal(page.items.length,21);const cursor=page.items[19];const next=await history(h,h.student,h.enrollment,h.lesson,cursor.createdAt,cursor.requestId);assert.equal(next.items.length,3);assert.ok(!next.items.some(x=>page.items.slice(0,20).some(y=>y.requestId===x.requestId)));
 await h.owner('delete from edu_ai_conversations where actor_id=$1',[h.student]);assert.equal((await h.db.query('select count(*)::int n from edu_ai_conversation_turns')).rows[0].n,0);
});
test('the same student has isolated lesson histories and cannot attach an image from another lesson',async t=>{
 const h=await fixture(t);const first=await begin(h);await finish(h,first.requestId);const lesson=id();await h.owner("insert into curriculum_lessons(id,week_id,is_published,title,day_number) values($1,$2,true,'다른 수업',1)",[lesson,h.week]);await h.owner('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,true)',[h.cohort,lesson]);
 const image=id();await h.owner("insert into edu_question_images(id,owner_id,enrollment_id,lesson_id,name,size,extension,content_type,path,ready_at,sha256) values($1,$2,$3,$4,'원래 수업.png',12,'png','image/png','original-lesson-image',now(),$5)",[image,h.student,h.enrollment,h.lesson,'c'.repeat(64)]);
 await assert.rejects(()=>begin(h,{lesson,image}),/AI_FORBIDDEN/);const second=await begin(h,{lesson,text:'다른 수업의 질문'});assert.deepEqual(second.history,[]);await finish(h,second.requestId);assert.equal((await history(h,h.student,null,null)).conversations.length,2);assert.equal((await history(h)).items.length,1);const invalid=await begin(h,{lesson,text:'검증용 질문'});await assert.rejects(()=>finish(h,invalid.requestId,{}),/check constraint/);await finish(h,invalid.requestId,null);
});
