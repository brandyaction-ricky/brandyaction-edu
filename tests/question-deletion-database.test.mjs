import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { communityFixture, read } from './helpers/question-community.mjs';
const migration = '20261011080238_edu_own_question_deletion.sql';
async function fixture(t) {
  const h = await communityFixture(t);
  await h.owner(read('20260929013847_member_conversation_history.sql'));
  await h.owner(read('20261003054513_admin_sent_message_delete.sql'));
  await h.owner(read('20261008004234_question_answer_images.sql'));
  await h.owner(read(migration));
  const remove = (q, head = null, actor = h.student) => h.rpc('edu_delete_own_question', [actor, q, head]);
  return { ...h, remove };
}
test('owner deletion is idempotent, hides public/private threads and notices, retains RESTRICT identity, and cannot be restored', async t => {
  const h = await fixture(t), q = await h.create(), another = await h.create({ title: '다른 질문' });
  const answer = await h.rpc('edu_add_question_answer', [h.admin, q.id, null, id(), '질문 답변']);
  await h.owner('create table retained_case(id uuid primary key,question_id uuid references edu_questions(id) on delete restrict);');
  const caseId = id(); await h.owner('insert into retained_case values($1,$2)', [caseId,q.id]);
  await assert.rejects(h.remove(q.id, answer.id, h.other), /QUESTION_NOT_FOUND/);
  await assert.rejects(h.remove(q.id, null), /QUESTION_CHANGED/);
  assert.equal((await h.rpc('edu_can_delete_own_question',[h.student,q.id])).canDelete,true);
  const deleted = await h.remove(q.id, answer.id); assert.equal(deleted.id,q.id); assert.ok(deleted.deletedAt);
  assert.deepEqual(await h.remove(q.id, null),deleted);
  assert.equal((await h.rpc('edu_can_delete_own_question',[h.student,q.id])).canDelete,false);
  for (const actor of [h.student,h.other,h.admin]) for (const reader of ['edu_read_question_thread','edu_read_question_thread_with_images']) await assert.rejects(h.rpc(reader,[actor,q.id,null]),/QUESTION_NOT_FOUND/);
  assert.equal((await h.feed()).questions.some(row=>row.id===q.id),false);
  assert.equal((await h.feed(h.student,null,null,true)).questions.some(row=>row.id===q.id),false);
  for (const who of [h.student,h.admin]) assert.equal(JSON.stringify(await h.inbox(who)).includes('질문 답변'),false);
  assert.equal((await h.owner('select question_id from retained_case where id=$1',[caseId])).rows[0].question_id,q.id);
  await assert.rejects(h.owner('update edu_questions set is_archived=false where id=$1',[q.id]),/QUESTION_NOT_FOUND/);
  await assert.rejects(h.rpc('edu_add_question_followup',[h.student,q.id,answer.id,id(),'재개']),/QUESTION_NOT_FOUND/);
  await assert.rejects(h.rpc('edu_add_question_answer',[h.admin,q.id,answer.id,id(),'추가 답변']),/QUESTION_NOT_FOUND/);
  assert.equal((await h.rpc('edu_read_question_thread',[h.student,another.id,null])).question.id,another.id);
  const audit=(await h.owner("select * from audit_logs where action='delete-own-question' and entity_id=$1",[q.id])).rows;
  assert.equal(audit.length,1); assert.doesNotMatch(JSON.stringify(audit),/질문 답변|어떻게 하나요/);
});
test('deleted question denies original and answer images, shared FAQ and pending AI/push work even to operators', async t => {
  const h=await fixture(t), original=id(), answerImage=id(), request=id(), job=id();
  const spec={kind:'image',name:'question.png',size:8,extension:'png',contentType:'image/png'};
  await h.rpc('edu_prepare_question_image',[h.student,h.enrollment,h.lesson,original,spec]);
  await h.rpc('edu_complete_question_image',[h.student,original,'a'.repeat(64)]);
  const q=await h.create({image:original});
  await h.rpc('edu_prepare_answer_image',[h.admin,q.id,answerImage,spec]);
  await h.rpc('edu_complete_answer_image',[h.admin,answerImage,'b'.repeat(64)]);
  await h.rpc('edu_question_assist',[h.admin,q.id,job,null]);
  await h.rpc('edu_add_question_answer_with_image',[h.admin,q.id,null,request,'이미지 답변',answerImage,null]);
  await h.owner('update edu_questions set sharing_requested=true where id=$1',[q.id]);
  await h.rpc('edu_publish_shared_answer',[h.admin,q.id,'공유 제목','공유 답변',true]);
  assert.ok((await h.owner('select count(*)::int n from edu_push_deliveries where status=$1',['pending'])).rows[0].n);
  await h.remove(q.id,request);
  for (const actor of [h.student,h.other,h.admin]) {
    await assert.rejects(h.rpc('edu_read_question_image',[actor,q.id]),/QUESTION_NOT_FOUND/);
    await assert.rejects(h.rpc('edu_read_answer_image',[actor,q.id,request]),/QUESTION_NOT_FOUND/);
  }
  assert.equal((await h.rpc('edu_search_shared_answers',[h.student,'',null,null,0])).answers.length,0);
  await assert.rejects(h.rpc('edu_question_assist',[h.admin,q.id,job,'새 초안']),/QUESTION_NOT_FOUND/);
  await assert.rejects(h.rpc('edu_answer_from_assist',[h.admin,q.id,job,id(),'늦은 답변']),/QUESTION_NOT_FOUND/);
  assert.equal((await h.owner("select count(*)::int n from edu_push_deliveries d join edu_push_events e on e.id=d.event_id where (e.source=$1 or e.source=$2) and d.status in ('pending','processing')",[q.id,request])).rows[0].n,0);
});
test('member conversation omits deleted content before pagination; ordinary archive history remains and public callers cannot invoke deletion or private readers', async t=>{
  const h=await fixture(t), q=await h.create({title:'숨길 원문',content:'숨길 본문'}), archived=await h.create({title:'보관된 질문'});
  await h.rpc('edu_add_question_answer',[h.admin,q.id,null,id(),'숨길 답변']);
  const head=(await h.rpc('edu_read_question_thread',[h.student,q.id,null])).question.headId;
  await h.owner('update edu_questions set is_archived=true where id=$1',[archived.id]);
  await h.remove(q.id,head);
  const conversation=await h.rpc('edu_member_conversation',[h.admin,h.student,null]);
  assert.doesNotMatch(JSON.stringify(conversation),/숨길 원문|숨길 본문|숨길 답변/);
  assert.ok(conversation.rows.some(row=>row.question===archived.id));
  for(const role of ['anon','authenticated']) for(const functionName of ['edu_delete_own_question(uuid,uuid,uuid)','edu_can_delete_own_question(uuid,uuid)','edu_read_question_thread(uuid,uuid,bigint)','edu_private.edu_read_question_thread(uuid,uuid,bigint)','edu_member_conversation(uuid,uuid,jsonb)']) {
    const allowed=(await h.owner('select has_function_privilege($1,$2,$3) as allowed',[role,functionName,'EXECUTE'])).rows[0].allowed; assert.equal(allowed,false);
  }
  assert.equal((await h.owner('select to_regprocedure($1) as old',['public.edu_read_question_thread_before_own_delete(uuid,uuid,bigint)'])).rows[0].old,null);
});
test('restrictive policies hide deleted questions and answers even with an existing broad reader policy',async t=>{
  const h=await fixture(t),q=await h.create(),remaining=await h.create();
  const answer=await h.rpc('edu_add_question_answer',[h.admin,q.id,null,id(),'비공개 답변']);
  await h.remove(q.id,answer.id);
  await h.owner(`alter table edu_questions enable row level security;
    create policy fixture_existing_questions on edu_questions for select to anon,authenticated using(true);
    create policy fixture_existing_answers on edu_question_answers for select to anon,authenticated using(true);
    grant select on edu_questions,edu_question_answers to anon,authenticated;`);
  for(const role of ['anon','authenticated']) {
    await h.db.exec('set role '+role);
    try {
      assert.equal((await h.db.query('select id from edu_questions where id=$1',[q.id])).rows.length,0);
      assert.equal((await h.db.query('select id from edu_questions where id=$1',[remaining.id])).rows.length,1);
      assert.equal((await h.db.query('select id from edu_question_answers where question_id=$1',[q.id])).rows.length,0);
    } finally { await h.db.exec('set role service_role'); }
  }
});
