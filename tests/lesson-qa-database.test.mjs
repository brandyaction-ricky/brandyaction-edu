import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { qaFixture } from './helpers/lesson-qa-fixture.mjs';

test('immutable review inserts a collapsed Q&A exactly after its paragraph and publishes answer plus curriculum once',async()=>{
 const f=await qaFixture();try{
  await f.draft();await f.submit();
  const source=await f.read(),request=randomUUID(),plan=await f.prepare({source,request});
  assert.deepEqual(await f.prepare({source,request}),plan);
  assert.equal((await f.db.query('select count(*)::int n from edu_question_answers')).rows[0].n,0);
  assert.equal((await f.db.query('select revision from edu_lesson_block_heads')).rows[0].revision,f.revision);
  const saved=(await f.db.query('select payload from edu_lesson_qa_plans where id=$1',[plan.id])).rows[0].payload;
  const body=JSON.parse(saved.blocks.document.blocks[0].content.slice(14));
  assert.deepEqual(body.content.slice(0,2),JSON.parse(f.body.slice(14)).content.slice(0,2));
  assert.equal(body.content[2].content[0].text,'먼저 본 수강생의 질문');
  assert.equal(body.content[3].type,'details');assert.equal(body.content[3].attrs,undefined);
  assert.equal(body.content[3].content[0].content[0].text,'정리한 질문');
  assert.deepEqual(body.content[4],JSON.parse(f.body.slice(14)).content[2]);
  assert.deepEqual(saved.blocks.document.blocks.slice(1),source.payload.blocks.document.blocks.slice(1));
  assert.deepEqual(saved.blocks.document.checklist,source.payload.blocks.document.checklist);
  const result=await f.apply(plan);assert.deepEqual(await f.apply(plan),result);
  assert.equal((await f.db.query('select count(*)::int n from edu_question_answers')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from qa_test_notices')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int n from edu_lesson_block_submissions')).rows[0].n,1);
  assert.equal((await f.db.query('select content from edu_question_answers')).rows[0].content,'검토한 답변');
  await assert.rejects(f.prepare(),/QA_DUPLICATE/);
 }finally{await f.db.close();}
});
test('changed public source, question, answer or author draft cannot apply an old review',async()=>{
 for(const change of ['public','question','answer','draft','cohort']){
  const f=await qaFixture();try{
   const source=await f.read(),plan=await f.prepare();
   if(change==='public')await f.db.query('update curriculum_lessons set title=$1 where id=$2',['다른 제목',f.lesson]);
   if(change==='question')await f.db.query('update edu_questions set content=$1 where id=$2',['바뀐 원문',f.question]);
   if(change==='answer')await f.db.query('select edu_add_question_answer($1,$2,null,$3,$4)',[f.admin,f.question,randomUUID(),'동료 답변']);
   if(change==='cohort')await f.db.query('insert into cohorts(id,course_id,name) values($1,$2,$3)',[randomUUID(),f.course,'새 기수']);
   if(change==='draft')await f.db.query('select edu_save_lesson_author($1,$2,null,$3,$4,$5,false,false)',[f.admin,f.lesson,randomUUID(),source.publicStamp,source.payload]);
   await assert.rejects(f.apply(plan),/QA_CHANGED/);
   assert.equal((await f.db.query('select count(*)::int n from edu_lesson_qa_plans where applied_at is not null')).rows[0].n,0);
  }finally{await f.db.close();}
 }
});
test('failed curriculum publication rolls back answer and notice; same review succeeds after repair without duplicate answer',async()=>{
 const f=await qaFixture();try{
  const plan=await f.prepare();
  await f.db.exec('reset role');await f.db.exec(`create function qa_fail_audit() returns trigger language plpgsql as $$begin raise exception 'TEST_AUDIT_FAILURE';end;$$;create trigger qa_fail before insert on audit_logs for each row execute function qa_fail_audit();`);await f.db.exec('set role service_role');
  await assert.rejects(f.apply(plan),/TEST_AUDIT_FAILURE/);
  for(const table of ['edu_question_answers','qa_test_notices','edu_lesson_author_publications'])assert.equal((await f.db.query('select count(*)::int n from '+table)).rows[0].n,0);
  assert.equal((await f.db.query('select answer_head_id from edu_questions')).rows[0].answer_head_id,null);
  assert.equal((await f.db.query('select revision from edu_lesson_block_heads')).rows[0].revision,f.revision);
  await f.db.exec('reset role');await f.db.exec('drop trigger qa_fail on audit_logs');await f.db.exec('set role service_role');
  await f.apply(plan);await f.apply(plan);assert.equal((await f.db.query('select count(*)::int n from edu_question_answers')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('invalid anchors, pending drafts, forbidden actors and changed request reuse fail closed',async()=>{
 const f=await qaFixture();try{
  await assert.rejects(f.read(f.student),/QA_FORBIDDEN/);
  for(const node of [-2,3,20000])await assert.rejects(f.prepare({node}),/QA_ANCHOR_CHANGED/);
  await assert.rejects(f.prepare({block:'deleted'}),/QA_ANCHOR_CHANGED/);
  const source=await f.read(),request=randomUUID(),plan=await f.prepare({source,request});
  await assert.rejects(f.prepare({source,request,title:'내용 바꾸기'}),/QA_CHANGED/);
  await assert.rejects(f.apply({...plan,digest:'bad'}),/QA_CHANGED/);
  await assert.rejects(f.apply(plan,f.student),/QA_FORBIDDEN/);
  await f.db.query('select edu_save_lesson_author($1,$2,null,$3,$4,$5,false,false)',[f.admin,f.lesson,randomUUID(),source.publicStamp,source.payload]);
  await assert.rejects(f.prepare(),/QA_DRAFT_PENDING/);
  await f.db.exec('reset role');
  for(const role of ['anon','authenticated']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await f.db.query("select has_table_privilege($1,'edu_lesson_qa_plans',$2) ok",[role,privilege])).rows[0].ok,false);
   assert.equal((await f.db.query("select has_function_privilege($1,'edu_apply_lesson_qa(uuid,uuid,text)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
 }finally{await f.db.close();}
});
test('plain block insertion retains its anchor and exposes no original question identity; question purge cascades private plans',async()=>{
 const f=await qaFixture();try{
  const source=await f.read(),doc=structuredClone(source.payload.blocks.document);doc.blocks[0].content='일반 설명 단락';
  await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,randomUUID(),doc]);
  const plan=await f.prepare({node:-1});
  const payload=(await f.db.query('select payload from edu_lesson_qa_plans where id=$1',[plan.id])).rows[0].payload;
  assert.deepEqual(payload.blocks.document.blocks[0],doc.blocks[0]);assert.equal(payload.blocks.document.blocks[1].id,'qa-'+plan.id);
  const serialized=JSON.stringify(payload);assert.equal(serialized.includes(f.question),false);assert.equal(serialized.includes('원문 작성자 정보'),false);assert.equal(serialized.includes('비공개 원문 제목'),false);
  await f.db.exec('reset role');await f.db.query('delete from edu_questions where id=$1',[f.question]);
  assert.equal((await f.db.query('select count(*)::int n from edu_lesson_qa_plans')).rows[0].n,0);
 }finally{await f.db.close();}
});
