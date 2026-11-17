import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setup } from './helpers/learning-care.mjs';

const read = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');

test('publishing and reordering lessons keeps earned access by enrollment without awarding completion', async t => {
  const f = await setup(t);
  await f.db.exec('reset role');
  await f.db.exec(read('20261112123400_preserve_open_lessons.sql'));
  await f.db.exec('set role service_role');
  const add = async (day, visible = true) => {
    const lesson = randomUUID();
    await f.db.query('insert into curriculum_lessons(id,week_id,day_number,is_published) values($1,$2,$3,true)', [lesson,f.week,day]);
    await f.db.query('insert into edu_cohort_lesson_visibility values($1,$2,$3,now())', [f.cohort,lesson,visible]);
    return lesson;
  };
  const gate = async (lesson,enrollment=f.enrollment) =>
    (await f.db.query('select edu_lesson_progression_gate($1,$2) as gate',[enrollment,lesson])).rows[0].gate.isUnlocked;
  const complete = async lesson => f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,lesson]);
  const progress = async () => (await f.db.query('select lesson_id,completed_at from lesson_progress where enrollment_id=$1 order by lesson_id',[f.enrollment])).rows;
  const first = await add(2), next = await add(4), later = await add(5);
  await complete(first);
  const before = await progress();
  assert.equal(await gate(next),true);
  assert.equal(await gate(later),false);
  const middle = await add(3,false);
  await f.db.query('update edu_cohort_lesson_visibility set is_published=true where cohort_id=$1 and lesson_id=$2',[f.cohort,middle]);
  assert.deepEqual(await Promise.all([first,middle,next,later].map(l=>gate(l))),[true,true,true,false]);
  assert.deepEqual(await progress(),before);
  await f.parity();
  const cells=(await f.snapshot()).rows.find(row=>row.enrollmentId===f.enrollment)?.cells || (await f.snapshot()).rows[0].cells;
  assert.equal(cells.find(cell=>cell.lessonId===next).state,'not_submitted');
  assert.equal(cells.find(cell=>cell.lessonId===middle).state,'not_submitted');
  assert.equal(cells.find(cell=>cell.lessonId===later).state,'locked');
  const fresh=randomUUID();
  await f.db.query("insert into enrollments(id,user_id,course_id,cohort_id,status) values($1,$2,$3,$4,'active')",[fresh,f.other,f.course,f.cohort]);
  assert.equal(await gate(next,fresh),false);
  const beforeFirst = await add(0);
  assert.equal(await gate(first,fresh),true,'already-open first lesson remains available at zero completions');
  assert.equal(await gate(beforeFirst,fresh),true);
  assert.equal(await gate(next,fresh),false);
  await f.db.query('update edu_cohort_lesson_visibility set is_published=false where cohort_id=$1 and lesson_id=$2',[f.cohort,next]);
  await f.parity();
  assert.equal((await f.snapshot()).rows[0].cells.find(cell=>cell.lessonId===next).published,false);
  await f.db.query('update edu_cohort_lesson_visibility set is_published=true where cohort_id=$1 and lesson_id=$2',[f.cohort,next]);
  await complete(next);
  assert.equal(await gate(later),true);
  assert.equal((await progress()).some(row=>row.lesson_id===middle),false);
});

test('first reorder after upgrade preserves pre-existing access without granting a temporarily first lesson', async t => {
  const f=await setup(t);
  const [a,b,c,x]=Array.from({length:4},()=>randomUUID());
  const ids=[a,b,c,x];
  await f.db.query('insert into curriculum_lessons(id,week_id,day_number,is_published) select id,$1,n+1,true from unnest($2::uuid[]) with ordinality l(id,n)',[f.week,ids]);
  await f.db.query('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) select $1,id,true from unnest($2::uuid[]) l(id)',[f.cohort,ids]);
  await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,a]);
  await f.db.exec('reset role');
  await f.db.exec(read('20261112123400_preserve_open_lessons.sql'));
  await f.db.exec('set role service_role');
  await f.db.query('update curriculum_lessons l set day_number=ordering.n+1 from unnest($1::uuid[]) with ordinality ordering(id,n) where l.id=ordering.id',[[a,x,b,c]]);
  const result=await f.db.query("select l.id,(edu_lesson_progression_gate($1,l.id)->>'isUnlocked')::boolean as open from curriculum_lessons l where id=any($2::uuid[]) order by day_number",[f.enrollment,ids]);
  assert.deepEqual(result.rows,[{id:a,open:true},{id:x,open:true},{id:b,open:true},{id:c,open:false}]);
  await f.parity();
});
