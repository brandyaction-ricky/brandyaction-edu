import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture, document as base } from './helpers/lesson-block-review.mjs';
import { importFixture, batchFor } from './helpers/lesson-import-fixture.mjs';
import { lessonImportContract } from '../scripts/lib/lesson-import-contract.mjs';
const migration=readFileSync(new URL('../supabase/migrations/20260928235554_lesson_presentation_tags.sql',import.meta.url),'utf8');
const contract=await lessonImportContract(),presentation={tag:'basics',tagLabel:'기초 학습'};
async function apply(f){await f.db.exec('reset role');await f.db.exec(migration);await f.db.exec('set role service_role');}

test('presentation is optional and exact text survives validation/public rendering while malformed fields fail',()=>{
 assert.deepEqual(contract.validateLessonBlocks(base),base);
 const doc={...base,presentation:{tag:'AI_Internal',tagLabel:' AI & 실행 '}};
 assert.deepEqual(contract.validateLessonBlocks(doc).presentation,doc.presentation);assert.deepEqual(contract.publicLessonBlocks(doc).presentation,doc.presentation);assert.doesNotMatch(JSON.stringify(contract.publicLessonBlocks(doc)),/correctIndex/);
 for(const p of [null,[],{},'tag',{tag:'a'}, {tag:1,tagLabel:'AI'},{tag:'a',tagLabel:true},{tag:'a',tagLabel:'x'.repeat(101)},{tag:'x'.repeat(101),tagLabel:'AI'},{...presentation,unexpected:true}])assert.throws(()=>contract.validateLessonBlocks({...base,presentation:p}));
 assert.deepEqual(contract.validateLessonBlocks({...base,presentation:{tag:'',tagLabel:''}}).presentation,{tag:'',tagLabel:''});
});
test('owned active enrollment sees only published display labels, no keys/body/answers, and locked lessons stay locked',async()=>{
 const first={...base,presentation,progression:{track:'learning',dayNumber:1},completion:{mode:'self',requireAnswers:false,requireQuizPass:true}};
 const f=await fixture(first);try{await apply(f);
  const second=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[second,f.week]);await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,second,id(),{...first,presentation:{tag:'internal-hidden',tagLabel:'다음 학습'},progression:{track:'learning',dayNumber:2}}]);
  const read=async(actor=f.student)=>(await f.db.query('select edu_read_lesson_progression($1,$2) as r',[actor,f.enrollment])).rows[0].r;
  const rows=await read();assert.equal(rows.find(r=>r.lessonId===f.lesson).tagLabel,'기초 학습');assert.equal(rows.find(r=>r.lessonId===second).tagLabel,'다음 학습');assert.equal(rows.find(r=>r.lessonId===second).isUnlocked,false);assert.doesNotMatch(JSON.stringify(rows),/basics|internal-hidden|correctIndex|필수 질문/);
  await assert.rejects(read(f.other),/BLOCK_FORBIDDEN/);await f.db.query('update curriculum_lessons set is_published=false where id=$1',[second]);assert.equal((await read()).length,1);
  await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);await assert.rejects(read(),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as ok',[role,'edu_read_lesson_progression(uuid,uuid)','EXECUTE'])).rows[0].ok,false);
  const flags=(await f.db.query("select prosecdef,proconfig from pg_proc where oid='edu_read_lesson_progression(uuid,uuid)'::regprocedure")).rows[0];assert.equal(flags.prosecdef,false);assert.ok(flags.proconfig.some(v=>v.startsWith('search_path=')));
 }finally{await f.db.close();}
});
test('database rejects invalid presentation before advancing the head and preserves historical submission tags',async()=>{
 const doc={...base,presentation};const f=await fixture(doc);try{await apply(f);await f.draft();const submission=await f.submit();
  for(const invalid of [null,{}, {tag:1,tagLabel:'AI'}, {...presentation,extra:'bad'}, {...presentation,tagLabel:'가'.repeat(101)}])await assert.rejects(f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,id(),{...doc,presentation:invalid}]),/edu_lesson_presentation_valid/);
  assert.equal((await f.db.query('select revision from edu_lesson_block_heads where lesson_id=$1',[f.lesson])).rows[0].revision,f.revision);
  const revision=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,revision,{...doc,presentation:{tag:'advanced',tagLabel:'심화'}}]);
  const historical=(await f.db.query('select edu_read_block_submission($1,$2,$3) as r',[f.student,submission.id,f.enrollment])).rows[0].r;assert.deepEqual(historical.document.presentation,presentation);
  assert.deepEqual((await f.db.query('select edu_read_lesson_progression($1,$2) as r',[f.student,f.enrollment])).rows[0].r[0].tagLabel,'심화');
  await assert.rejects(f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,id(),doc]),/BLOCK_CONTENT_CHANGED/);
 }finally{await f.db.close();}
});
test('curriculum batch imports carry display tags atomically, and old documents continue without tags',async()=>{
 const f=await importFixture();try{await apply(f);const batch=batchFor(f.course,1);batch.lessons[1].document.presentation=presentation;
  await f.run(batch,id(),true);const row=(await f.db.query('select document from edu_lesson_block_versions where id=$1',[batch.lessons[1].revision])).rows[0];assert.deepEqual(row.document.presentation,presentation);
  await f.db.query('update curriculum_weeks set is_published=true where id=$1',[batch.weeks[0].id]);await f.db.query('update curriculum_lessons set is_published=true where id=$1',[batch.lessons[1].id]);
  const rows=(await f.db.query('select edu_read_lesson_progression($1,$2) as r',[f.student,f.enrollment])).rows[0].r;assert.equal(rows.find(r=>r.lessonId===f.lesson).tagLabel,'');assert.equal(rows.find(r=>r.lessonId===batch.lessons[1].id).tagLabel,presentation.tagLabel);
 }finally{await f.db.close();}
});
