import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const compile = (file, require = () => { throw Error('Unexpected import'); }) => {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../lib/' + file + '.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, require); return exports;
};
const rules = compile('platform-rules');
const cohort = compile('cohort-curriculum-visibility');
const { learningOverview, parseLessonGates, readLearningOverviews } = compile('learning-overview', name => name === './platform-rules' ? rules : name === './cohort-curriculum-visibility' ? cohort : assert.fail(name));
const enrollment = { id: 'enrollment', course_id: 'course', cohort_id: 'cohort', status: 'active', access_starts_at: '2020-01-01' };
const gate = (id, track, day, unlocked = true) => ({ lessonId: id, track, dayNumber: day, isUnlocked: unlocked, automaticApproval: false, reason: unlocked ? '' : '이전 학습을 마치면 열립니다.' });
function dataFor(gates, complete = []) {
  return { learning_overviews: [{ id: enrollment.id, status: 'ready', lessons: gates }], curriculum_weeks: [{ id: 'week', course_id: 'course', week_number: 0, is_published: true }], curriculum_lessons: gates.map((g, i) => ({ id: g.lessonId, week_id: 'week', title: '수업 ' + g.lessonId, day_number: i + 101, is_published: true })), edu_cohort_week_visibility: [{ cohort_id: 'cohort', week_id: 'week', is_published: true }], edu_cohort_lesson_visibility: gates.map(g => ({ cohort_id: 'cohort', lesson_id: g.lessonId, is_published: true })), lesson_progress: complete.map(id => ({ id: 'p-' + id, enrollment_id: enrollment.id, lesson_id: id, completed_at: '2026-01-01' })) };
}
test('daily and learning each count 30 lessons, use source ordinals and ignore another enrollment or duplicate progress', () => {
  const gates = ['daily', 'learning'].flatMap(track => Array.from({ length: 30 }, (_, i) => gate(`${track}-${i + 1}`, track, i + 1, i < 2)));
  const data = dataFor(gates, ['daily-1', 'daily-1', 'learning-1']);
  data.lesson_progress.push({ id: 'other', enrollment_id: 'other', lesson_id: 'daily-2', completed_at: '2026-01-01' });
  const model = learningOverview(data, enrollment);
  assert.equal(model.status, 'ready'); assert.equal(model.groups.length, 2);
  for (const group of model.groups) {
    assert.equal(group.completed, 1); assert.equal(group.items.length, 30); assert.equal(group.next.day, 2);
    assert.equal(group.items[0].week, 1); assert.equal(group.items[29].week, 6);
  }
});
test('week boundary offers only an unlocked completed lesson for review without unlocking day six', () => {
  const gates = Array.from({ length: 6 }, (_, i) => gate(`d${i + 1}`, 'daily', i + 1, i < 5));
  const daily = learningOverview(dataFor(gates, gates.slice(0, 5).map(g => g.lessonId)), enrollment).groups[0];
  assert.equal(daily.next, undefined); assert.equal(daily.review.id, 'd5'); assert.equal(daily.completed, 5);
  assert.equal(daily.items[5].unlocked, false);
  const allDone = learningOverview(dataFor(gates.slice(0, 5), gates.map(g => g.lessonId)), enrollment).groups[0];
  assert.equal(allDone.completed, allDone.items.length); assert.equal(allDone.review.id, 'd5');
});
test('ongoing periods are not permanent completion and ordinary onboarding keeps week zero', () => {
  const ongoing = { ...gate('repeat', null, null), ongoing: true };
  const data = dataFor([gate('intro', null, null), ongoing], ['repeat']);
  data.curriculum_lessons[0].day_number = 0;
  const [normal, repeated] = learningOverview(data, enrollment).groups;
  assert.equal(normal.key, 'other'); assert.equal(normal.items[0].week, 0); assert.equal(normal.items[0].day, 0);
  assert.equal(repeated.key, 'ongoing'); assert.equal(repeated.completed, 0); assert.equal(repeated.next.id, 'repeat');
});
test('scopes lessons to this course and gate visibility, excluding archived, hidden and unknown lessons', () => {
  const gates = ['ok','hidden','archived','wrong-course','missing'].map(id => gate(id, 'daily', 1));
  const data = dataFor(gates);
  data.curriculum_weeks.push({ id: 'other-week', course_id: 'other', week_number: 1 });
  data.curriculum_lessons[1].is_published = false; data.curriculum_lessons[2].archived_at = '2026-01-01';
  data.curriculum_lessons[3].week_id = 'other-week'; data.curriculum_lessons.pop();
  data.curriculum_lessons.push({ id: 'no-gate', week_id: 'week', title: 'must not open', day_number: 2 });
  const model = learningOverview(data, enrollment);
  assert.deepEqual(model.groups[0].items.map(item => item.id), ['ok']);
});
test('missing, failed and invalid reads never fall back to unlocked lessons; expired enrollments never open', () => {
  const data = dataFor([gate('d1', 'daily', 1)]);
  for (const overviews of [[], [{id: 'enrollment', status:'error'}], [{id:'enrollment',status:'ready',lessons:null}]]) assert.equal(learningOverview({...data,learning_overviews:overviews}, enrollment).status,'error');
  for (const patch of [{status:'revoked'},{revoked_at:'2026-01-01'},{access_starts_at:'2099-01-01'},{access_ends_at:'2020-01-01'}]) assert.equal(learningOverview(data,{...enrollment,...patch}).status,'inactive');
});
test('RPC parser validates gate shape and strips unrequested/private fields', () => {
  const valid = gate('d1','daily',1);
  assert.deepEqual(parseLessonGates([{...valid,document:{answer:'private'},content:'secret'}]),[valid]);
  for (const bad of [null,[null],[valid,valid],[{...valid,isUnlocked:'true'}],[{...valid,track:'unknown'}],[{...valid,dayNumber:0}],[{...valid,ongoing:true}],[{...valid,reason:null}],Array(201).fill(valid)]) assert.throws(()=>parseLessonGates(bad));
});
test('read pool limits concurrency, deduplicates enrollments, preserves order and isolates failures', async () => {
  let active=0,maximum=0; const calls=[];
  const ids=Array.from({length:11},(_,i)=>String(i));
  const result=await readLearningOverviews([...ids,'0'],async id=>{
    calls.push(id);active++;maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,3));active--;
    if(id==='5')throw Error('secret SQL details');return[gate('d'+id,null,null)];
  });
  assert.equal(maximum,4);assert.equal(calls.length,11);assert.deepEqual(result.map(row=>row.id),ids);
  assert.deepEqual(result[5],{id:'5',status:'error'});assert.equal(result[6].status,'ready');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('actual progression RPC output produces independent tracks and changes continuation after approval', async () => {
  const doc = { schemaVersion:1, blocks:[{id:'text',type:'text',content:'가상 학습'}], checklist:[], progression:{track:'daily',dayNumber:1}, completion:{mode:'mentor',requireAnswers:false,requireQuizPass:false} };
  const f=await fixture(doc);
  try {
    const daily2=randomUUID(),learning1=randomUUID();
    for(const [id,track,day] of [[daily2,'daily',2],[learning1,'learning',1]]){
      await f.db.query('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[id,f.week]);
      await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,id,randomUUID(),{...doc,progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}}]);
    }
    const e={...enrollment,id:f.enrollment,course_id:f.course,cohort_id:f.cohort};
    const data={curriculum_weeks:[{id:f.week,course_id:f.course,week_number:1,is_published:true}],curriculum_lessons:[f.lesson,daily2,learning1].map((id,index)=>({id,week_id:f.week,title:'합성 '+index,day_number:index+1,is_published:true})),edu_cohort_week_visibility:[{cohort_id:f.cohort,week_id:f.week,is_published:true}],edu_cohort_lesson_visibility:[f.lesson,daily2,learning1].map(id=>({cohort_id:f.cohort,lesson_id:id,is_published:true})),lesson_progress:[]};
    const read=async()=>{
      data.learning_overviews=await readLearningOverviews([f.enrollment],async id=>(await f.db.query('select edu_read_lesson_progression($1,$2) as gates',[f.student,id])).rows[0].gates);
      return learningOverview(data,e);
    };
    assert.equal((await read()).groups[0].next.id,f.lesson);assert.equal((await read()).groups[1].next.id,learning1);
    await f.draft({blocks:{},checklist:[]});
    const submitted=await f.submit(randomUUID(),{blocks:{},checklist:[]});
    await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.admin,submitted.id,submitted.stateId,randomUUID(),'approved','']);
    data.lesson_progress=[{id:randomUUID(),enrollment_id:f.enrollment,lesson_id:f.lesson,completed_at:'2026-01-01'}];
    const model=await read();assert.equal(model.groups[0].next.id,daily2);assert.equal(model.groups[0].completed,1);assert.equal(model.groups[1].completed,0);
  }finally{await f.db.close();}
});
