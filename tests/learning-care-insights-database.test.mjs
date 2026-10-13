import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-care.mjs';
async function completed(f,lesson,at='2026-10-01T00:00:00Z') {
 await f.db.exec('reset role; alter table lesson_progress disable trigger user');
 await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at) values($1,$2,100,$3) on conflict(enrollment_id,lesson_id) do update set completed_at=excluded.completed_at',[f.enrollment,lesson,at]);
 await f.db.exec('alter table lesson_progress enable trigger user; set role service_role');
}
test('timing follows configured required learning ordinal across weeks, not display neighbors or daily missions',async t=>{
 const f=await setup(t),first=await f.add('learning',1),second=await f.add('learning',2);
 await completed(f,first.lesson);
 await f.db.query('update curriculum_lessons set day_number=99 where id=$1',[first.lesson]);
 const cells=(await f.snapshot()).rows[0].cells;
 assert.deepEqual(cells.find(c=>c.lessonId===first.lesson).timing,{state:'first',previousLessonId:null,previousCompletedAt:null});
 const timing=cells.find(c=>c.lessonId===second.lesson).timing;
 assert.equal(timing.state,'known');assert.equal(timing.previousLessonId,first.lesson);assert.equal(Date.parse(timing.previousCompletedAt),Date.parse('2026-10-01T00:00:00Z'));
 assert.equal(cells.find(c=>c.lessonId===f.lesson).timing.state,'unavailable');
 // Hidden/archived completion still participates in the authoritative gate.
 await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[first.lesson]);
 const archived=(await f.snapshot()).rows[0].cells.find(c=>c.lessonId===second.lesson);
 assert.equal(archived.state,'not_submitted');assert.equal(archived.timing.previousLessonId,first.lesson);
});
test('missing and duplicate predecessors suppress timing without changing current gate states',async t=>{
 const f=await setup(t),second=await f.add('learning',2);
 assert.equal((await f.snapshot()).rows[0].cells.find(c=>c.lessonId===second.lesson).timing.state,'unavailable');
 const first=await f.add('learning',1);await completed(f,first.lesson);
 await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[first.lesson]);
 await f.add('learning',1);
 const cell=(await f.snapshot()).rows[0].cells.find(c=>c.lessonId===second.lesson);
 assert.equal(cell.state,'not_submitted');assert.equal(cell.timing.state,'unavailable');assert.equal(cell.timing.previousLessonId,null);
});
test('untracked required sequence excludes tracked/ongoing/hidden items and preserves original permission boundaries',async t=>{
 const f=await setup(t),lessons=[];
 for(const day of [0,2,4]){const lesson=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published,day_number) values($1,$2,true,$3)',[lesson,f.week,day]);await f.db.query('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,$3)',[f.cohort,lesson,day!==2]);lessons.push(lesson);}
 await completed(f,lessons[0]);
 const cells=(await f.snapshot()).rows[0].cells;
 assert.equal(cells.find(c=>c.lessonId===lessons[0]).timing.state,'first');
 const timing=cells.find(c=>c.lessonId===lessons[2]).timing;
 assert.equal(timing.state,'known');assert.equal(timing.previousLessonId,lessons[0]);
 for(const role of ['anon','authenticated'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as allowed',[role,'edu_private.edu_learning_care_cells(uuid)','execute'])).rows[0].allowed,false);
 await assert.rejects(f.snapshot(f.student),/BLOCK_FORBIDDEN/);
});
