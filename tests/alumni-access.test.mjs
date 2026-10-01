import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';

const load = (name, imports = {}) => {
  const source = fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', output)(exports, id => imports[id]);
  return exports;
};
const rules = load('platform-rules');
const { isGraduate } = load('alumni-access', { './platform-rules': rules });
const root = new URL('../supabase/migrations/', import.meta.url);

test('only active paid enrollments graduate after the cohort ends', () => {
  const e = { status: 'active', access_starts_at: '2026-01-01', access_ends_at: null };
  const paid = { category: 'paid_class' };
  const now = Date.parse('2026-10-01T00:00:00Z');
  assert.equal(isGraduate(e, paid, { status: 'in_progress', operation_end_at: '2026-09-30T23:59:59Z' }, now), true);
  assert.equal(isGraduate(e, paid, { status: 'completed' }, now), true);
  assert.equal(isGraduate(e, paid, { status: 'in_progress', operation_end_at: '2026-10-02T00:00:00Z' }, now), false);
  assert.equal(isGraduate(e, { category: 'free' }, { status: 'completed' }, now), false);
  assert.equal(isGraduate({ ...e, status: 'revoked' }, paid, { status: 'completed' }, now), false);
  assert.equal(isGraduate(e, paid, { status: 'cancelled' }, now), false);
});

test('learner mutation guard checks the owned enrollment and fails closed on lookup errors', async () => {
  const enrollment = { id: 'e', user_id: 'member', course_id: 'c', cohort_id: 'h', status: 'active', access_starts_at: '2020-01-01', access_ends_at: null };
  let end = '2020-02-01', lookupError = false;
  const db = { from(table) {
    const filters = [];
    const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() {
      if (lookupError) return { data: null, error: { message: 'private database detail' } };
      const data = table === 'enrollments' ? enrollment : table === 'courses' ? { id: 'c', category: 'paid_class' } : { id: 'h', status: 'in_progress', operation_end_at: end };
      return { data: filters.every(([key, value]) => data[key] === value) ? data : null, error: null };
    } };
    return query;
  } };
  const guard = load('alumni-access-server', { 'server-only': {}, './alumni-access': { isGraduate }, './platform-rules': rules, './supabase/admin': { createAdminClient: () => db } });
  assert.equal(await guard.isGraduateEnrollment('member', 'e'), true);
  await assert.rejects(guard.assertParticipationOpen('member', 'e'), error => error.status === 403);
  assert.equal(await guard.isGraduateEnrollment('stranger', 'e'), false);
  end = '2999-01-01';
  await guard.assertParticipationOpen('member', 'e');
  lookupError = true;
  await assert.rejects(guard.assertParticipationOpen('member', 'e'), /졸업 상태를 확인하지 못했습니다/);
});

test('graduation unlocks published reading while preserving write gates and owner checks', async () => {
  const f = await fixture({ schemaVersion: 1, blocks: [{ id: 'text', type: 'text', content: '최신 본문' }], checklist: [], progression: { track: 'daily', dayNumber: 1 }, completion: { mode: 'mentor', requireAnswers: false, requireQuizPass: false } });
  try {
    const { db, admin, student, other, course, week, lesson, enrollment } = f;
    const lockedLesson = randomUUID(), lockedRevision = randomUUID();
    await db.exec(`reset role;
      alter table courses add column category text default 'paid_class';
      alter table cohorts add column status text default 'in_progress';
      alter table cohorts add column name text default '1기';
      alter table cohorts add column operation_end_at timestamptz;
      alter table curriculum_weeks add column week_number integer default 1;
      alter table curriculum_lessons add column day_number integer default 1;
      alter table lesson_progress add column if not exists updated_at timestamptz default now();
      create table edu_ongoing_rules(lesson_id uuid primary key, cadence text);
      create table edu_ongoing_rounds(enrollment_id uuid, lesson_id uuid, period_start timestamptz, period_end timestamptz, revision uuid, values jsonb, write_id uuid, updated_at timestamptz default now());
      create table edu_ongoing_completions(id uuid,enrollment_id uuid,lesson_id uuid,period_start timestamptz,revision uuid,write_id uuid,values jsonb,assessment jsonb,created_at timestamptz default now());
      create function edu_ongoing_period(text,timestamptz) returns table(starts_at timestamptz,ends_at timestamptz) language sql as $$ select date_trunc('day',$2),date_trunc('day',$2)+interval '1 day' $$;
      create table edu_lesson_block_feedback(id uuid,submission_id uuid,feedback text,created_at timestamptz,expected_state uuid,source text,sequence integer);
      create table edu_questions(id uuid,enrollment_id uuid,user_id uuid,is_archived boolean,title text,content text,learning_context text,status text,is_resolved boolean,answer_head_id uuid,image_id uuid);
      create table edu_question_answers(id uuid,question_id uuid,sequence bigint,author_name text,source text,content text,created_at timestamptz);
      create function edu_assert_message_actor(uuid) returns void language plpgsql as $$ begin null; end; $$;
      create function edu_message_operator(uuid) returns boolean language sql as $$ select false $$;
      grant select,insert,update on all tables in schema public to service_role;`);
    await db.query('insert into curriculum_lessons(id,week_id,is_published,archived_at,day_number) values($1,$2,true,null,2)', [lockedLesson, week]);
    await db.exec('set role service_role');
    await db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)', [admin, lockedLesson, lockedRevision, { schemaVersion: 1, blocks: [{ id: 'text', type: 'text', content: '새 학습' }], checklist: [], progression: { track: 'daily', dayNumber: 2 }, completion: { mode: 'mentor', requireAnswers: false, requireQuizPass: false } }]);
    const initial = (await db.query('select edu_lesson_progression_gate($1,$2) as gate', [enrollment, lockedLesson])).rows[0].gate;
    assert.equal(initial.isUnlocked, false);
    await db.query('insert into lesson_contents(lesson_id,body_text) values($1,$2)', [lockedLesson, '이전 기수도 보는 공개 본문']);
    const previousPeriod = '2026-09-01T00:00:00Z';
    await db.query("insert into edu_ongoing_rules(lesson_id,cadence) values($1,'daily')", [lockedLesson]);
    await db.query("insert into edu_ongoing_rounds(enrollment_id,lesson_id,period_start,period_end,revision,values,write_id) values($1,$2,$3,$3::timestamptz+interval '1 day',$4,$5,$6)", [enrollment, lockedLesson, previousPeriod, lockedRevision, { blocks: { text: '지난 기간의 답변' }, checklist: [] }, randomUUID()]);
    await db.exec('reset role');
    await db.exec(fs.readFileSync(new URL('20261001024207_alumni_read_mode.sql', root), 'utf8'));
    await db.exec('set role service_role');
    const before = (await db.query('select edu_is_graduate_enrollment($1) as graduate', [enrollment])).rows[0];
    assert.equal(before.graduate, false);
    const question = randomUUID();
    await db.query("insert into edu_questions(id,enrollment_id,user_id,is_archived,title,content,status,is_resolved) values($1,$2,$3,false,'이전 질문','내용','answered',false)", [question, enrollment, student]);
    assert.equal((await db.query('select edu_read_question_thread($1,$2) as thread', [student, question])).rows[0].thread.canFollowUp, true);
    await assert.rejects(db.query('select edu_read_lesson_blocks($1,$2,$3)', [student, lockedLesson, enrollment]), /BLOCK_LESSON_LOCKED/);
    await assert.rejects(db.query('select edu_read_ongoing($1,$2,$3)', [student, lockedLesson, enrollment]), /BLOCK_LESSON_LOCKED/);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [student]);
    assert.equal((await db.query('select count(*)::int as total from lesson_contents where lesson_id=$1', [lockedLesson])).rows[0].total, 0);
    await db.exec('set role service_role');
    const oldSubmission = randomUUID();
    await db.query("insert into edu_lesson_block_submissions(id,enrollment_id,lesson_id,revision,draft_write_id,values,assessment,outcome) values($1,$2,$3,$4,$5,$6,$7,'submitted')", [oldSubmission, enrollment, lockedLesson, lockedRevision, randomUUID(), { blocks: { text: '이전 답변' }, checklist: [] }, {}]);
    await db.query("update cohorts set operation_end_at=now()-interval '1 second' where id=$1", [f.cohort]);
    const after = (await db.query('select edu_is_graduate_enrollment($1) as graduate', [enrollment])).rows[0];
    assert.equal(after.graduate, true);
    assert.equal((await db.query('select edu_read_question_thread($1,$2) as thread', [student, question])).rows[0].thread.canFollowUp, false);
    const gates = (await db.query('select edu_read_lesson_progression($1,$2) as lessons', [student, enrollment])).rows[0].lessons;
    assert.equal(gates.find(item => item.lessonId === lockedLesson).isUnlocked, true);
    const read = (await db.query('select edu_read_lesson_blocks($1,$2,$3) as result', [student, lockedLesson, enrollment])).rows[0].result;
    assert.equal(read.document.blocks[0].content, '새 학습');
    const history = (await db.query('select edu_read_block_submission($1,$2,$3) as result', [student, oldSubmission, enrollment])).rows[0].result;
    assert.equal(history.values.blocks.text, '이전 답변');
    const ongoing = (await db.query('select edu_read_ongoing($1,$2,$3,$4) as result', [student, lockedLesson, enrollment, previousPeriod])).rows[0].result;
    assert.equal(ongoing.draft.values.blocks.text, '지난 기간의 답변');
    assert.equal(ongoing.history.length, 1);
    const ongoingHistory = (await db.query('select edu_ongoing_history($1,$2,$3) as result', [student, lockedLesson, enrollment])).rows[0].result;
    assert.equal(ongoingHistory.items.length, 1);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as total from lesson_contents where lesson_id=$1', [lockedLesson])).rows[0].total, 1);
    await db.exec('set role service_role');
    await assert.rejects(db.query('select edu_assert_block_access($1,$2,$3)', [student, lockedLesson, enrollment]), /BLOCK_LESSON_LOCKED/);
    await assert.rejects(db.query('select edu_read_lesson_blocks($1,$2,$3)', [other, lockedLesson, enrollment]), /BLOCK_FORBIDDEN/);
    await assert.rejects(db.query('select edu_read_ongoing($1,$2,$3,$4)', [other, lockedLesson, enrollment, previousPeriod]), /BLOCK_FORBIDDEN/);
    await db.query("update enrollments set status='revoked' where id=$1", [enrollment]);
    assert.equal((await db.query('select edu_is_graduate_enrollment($1) as graduate', [enrollment])).rows[0].graduate, false);
    await assert.rejects(db.query('select edu_read_lesson_blocks($1,$2,$3)', [student, lockedLesson, enrollment]), /BLOCK_FORBIDDEN/);
    await assert.rejects(db.query('select edu_ongoing_history($1,$2,$3)', [student, lockedLesson, enrollment]), /BLOCK_FORBIDDEN/);
    assert.ok(course && lesson);
  } finally { await f.db.close(); }
});
