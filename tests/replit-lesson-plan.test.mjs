import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, unlinkSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { prepareReplitLessonPlan, lessonPlanReport } from '../scripts/lib/replit-lesson-plan.mjs';
import { convertLearningHtml } from '../scripts/lib/replit-lesson-html.mjs';
import { lessonImportContract } from '../scripts/lib/lesson-import-contract.mjs';
import { sourceFixture, imageBytes } from './fixtures/replit-import-source.mjs';
const contract = await lessonImportContract();

test('converts all 17 block types in displayed numeric order, preserves payload provenance and old answer/check identities', async () => {
  const source = sourceFixture(), copy = structuredClone(source), { plan } = await prepareReplitLessonPlan(source), lesson = plan.lessons[0];
  assert.deepEqual(source, copy); assert.deepEqual(new Set(lesson.document.blocks.map(b=>b.type)),new Set(contract.lessonBlockTypes));
  assert.equal(lesson.document.blocks[0].content, '첫 번째 제목'); assert.equal(lesson.document.blocks[1].content, source.days[0].blocks[0].content);
  assert.equal(lesson.mapping[0].sourceArrayIndex, 1); assert.equal(lesson.mapping[1].sourceArrayIndex, 0);
  assert.ok(lesson.mapping.some(m=>m.answerSourceId==='answer.old:1')); assert.equal(lesson.checklistMapping[0].sourceCheck,'check.old:1');
  assert.deepEqual(lesson.document.completion,{mode:'mentor',requireAnswers:false,requireQuizPass:false}); assert.deepEqual(lesson.document.progression,{track:'daily',dayNumber:1});
  assert.equal(lesson.document.blocks.find(b=>b.type==='link').url,'https://example.test/resource');
  for(const block of lesson.document.blocks) assert.match(block.id,/^[a-z0-9-]+$/);
  assert.equal(plan.currentLiveContentVerified,false);assert.equal(plan.readyForImport,false);
  assert.ok(plan.issues.some(i=>i.code==='EXTERNAL_MEDIA_UNVERIFIED'));
  assert.deepEqual((await prepareReplitLessonPlan(copy)).plan,plan); // Stable identities and package contents on retry.
});
test('ongoing conversion preserves cadence, optional questions, required checks and their original IDs',async()=>{
 const source=sourceFixture();source.ongoing_challenges[0].blocks.push({id:'q-old',type:'question',questionId:'old-answer',questionType:'text',questionLabel:'실행 기록',order:2});
 source.ongoing_challenges[0].mission_checks=[{id:'old-check',label:'실행 완료',required:true}];
 for(const cadence of ['daily','weekly','monthly']){
  source.ongoing_challenges[0].type=cadence;const {plan}=await prepareReplitLessonPlan(source),lesson=plan.lessons.find(l=>l.track==='ongoing');
  assert.equal(lesson.ready,true);assert.equal(lesson.ongoing,cadence);assert.equal(lesson.week,0);assert.equal(lesson.document.progression,undefined);
  assert.equal(lesson.metadata.description,'매주 반복');assert.deepEqual(lesson.document.completion,{mode:'self',requireAnswers:false,requireQuizPass:false});
  assert.equal(lesson.mapping[1].answerSourceId,'old-answer');assert.equal(lesson.checklistMapping[0].sourceCheck,'old-check');
  assert.equal(contract.missingBlockRequirements(lesson.document,{blocks:{},checklist:[]}).length,1);
  assert.deepEqual(contract.missingBlockRequirements(lesson.document,{blocks:{},checklist:[lesson.document.checklist[0].id]}),[]);
 }
});
test('equal order preserves source tie order; renumbering order does not change a block or answer identity', async()=>{
  const source=sourceFixture();source.days[0].blocks[1].order=2;
  const a=(await prepareReplitLessonPlan(source)).plan.lessons[0];assert.equal(a.mapping[0].sourceBlock,'item-2');assert.equal(a.mapping[1].sourceBlock,'item-1');
  source.days[0].blocks[1].order=0;const b=(await prepareReplitLessonPlan(source)).plan.lessons[0];assert.equal(a.mapping[1].targetBlock,b.mapping[0].targetBlock);
});
test('HTML learning keeps intro, entities, paragraph boundaries, bold, links, tip and server-private quiz answers in display order',async()=>{
 const {plan}=await prepareReplitLessonPlan(sourceFixture()),lesson=plan.lessons[1],doc=lesson.document;
 assert.equal(lesson.metadata.is_active,false);assert.deepEqual(doc.blocks.map(b=>b.type),['text','text','text','quiz']);
 assert.deepEqual(doc.presentation,{tag:'ai',tagLabel:'AI'});
 assert.equal(doc.blocks[0].content,'도입 안내  ');assert.equal(doc.blocks[2].content,'실행 팁\n그대로');
 const rich=contract.parseLessonDocument(doc.blocks[1].content);assert.equal(rich.content[0].content[0].text,'본문 & ');assert.deepEqual(rich.content[0].content[1].marks,[{type:'bold'}]);assert.equal(rich.content[1].type,'heading');
 assert.equal(doc.blocks[3].quiz.questions[0].correctIndex,1);assert.doesNotMatch(JSON.stringify(contract.publicLessonBlocks(doc)),/correctIndex/);
 assert.deepEqual(doc.completion,{mode:'self',requireAnswers:false,requireQuizPass:true});
});
test('empty learning quiz preserves content and explicit no-quiz mapping, without inventing a question or completion gate',async()=>{
 const source=sourceFixture();source.learning_lessons[0].quiz=[];
 const lesson=(await prepareReplitLessonPlan(source)).plan.lessons[1];assert.equal(lesson.document.blocks.length,3);assert.equal(lesson.mapping.at(-1).reason,'SOURCE_EMPTY_QUIZ');
 assert.deepEqual(contract.missingBlockRequirements(lesson.document,{blocks:{},checklist:[]}),[]);
});
test('converted generator preserves questions, examples, template whitespace and expected filled output; tools use pinned original definitions',async()=>{
 const doc=(await prepareReplitLessonPlan(sourceFixture())).plan.lessons[0].document;
 const generator=doc.blocks.find(b=>b.type==='prompt-generator');assert.deepEqual(generator.fields.map(f=>f.label),['나의 목표','고객']);assert.deepEqual(generator.fields.map(f=>f.placeholder),['예시) 가상 목표','고객 입력']);
 assert.equal(contract.fillBlockPrompt(generator.content,generator.fields,{[generator.fields[0].id]:'실행',[generator.fields[1].id]:'새 고객'}),'실행를 위한 새 고객 안내문');
 assert.equal(doc.blocks.find(b=>b.type==='persona-generator').fields.length,15);assert.equal(doc.blocks.find(b=>b.type==='landing-planner').fields.length,11);
 for(const type of ['recipe-calculator','margin-calculator','marketing-funnel'])assert.equal(doc.blocks.find(b=>b.type===type).toolVersion,'replit-2026-09-07');
});
test('extracts identical inline images once with exact bytes and retains every use; unresolved media never becomes a live-valid document',async()=>{
 const source=sourceFixture(),image=source.days[0].blocks.find(b=>b.type==='image');image.content='data:image/png;base64,'+imageBytes.toString('base64');source.days[0].blocks.push({...image,id:'copy-image',order:19});
 const {plan,files}=await prepareReplitLessonPlan(source),asset=plan.assets.find(a=>a.path);
 assert.equal(asset.sha256,createHash('sha256').update(imageBytes).digest('hex'));assert.equal(asset.uses.length,2);assert.equal(files.size,1);assert.ok(files.get(asset.path).equals(imageBytes));
 assert.equal(plan.lessons[0].document,null);assert.throws(()=>contract.validateLessonBlocks(plan.lessons[0].plannedDocument));
 assert.doesNotMatch(JSON.stringify(lessonPlanReport(plan)),/base64|media\.example|correctIndex|가상 목표/);
});
for(const [name,change,code] of [
 ['unknown HTML',s=>s.learning_lessons[0].content='<table><tr><td>보존할 표</td></tr></table>','HTML_ELEMENT_REVIEW'],
 ['script',s=>s.learning_lessons[0].content='<script>throw new Error("never-run")</script>','HTML_ELEMENT_REVIEW'],
 ['event handler',s=>s.learning_lessons[0].content='<p onclick="alert(1)">본문</p>','HTML_ATTRIBUTES_REVIEW'],
 ['unsafe link',s=>s.learning_lessons[0].content='<a href="javascript:alert(1)">링크</a>','HTML_LINK_REVIEW'],
 ['unknown quiz field',s=>s.days[0].blocks.find(b=>b.type==='quiz').content='{"questions":[],"future":true}','QUIZ_FORMAT_REVIEW'],
 ['shared answer identity',s=>s.days[0].blocks.find(b=>b.questionType==='image').questionId='answer.old:1','SHARED_ANSWER_REVIEW'],
 ['dangling example',s=>s.days[0].blocks.find(b=>b.type==='prompt_generator').promptExamples.push('추가 예시'),'PROMPT_EXAMPLES_REVIEW'],
])test(`flags ${name} instead of executing, inventing or silently dropping source`,async()=>{const s=sourceFixture();change(s);const {plan}=await prepareReplitLessonPlan(s);assert.ok(plan.issues.some(i=>i.code===code));assert.equal(plan.lessons.find(l=>l.issues.some(i=>i.code===code)).ready,false);});
test('HTML supports editor lists, font size and safe formatting; unsupported styles remain an explicit blocker',()=>{
 const r=convertLearningHtml('<ol start="3"><li><p><span style="font-size: 24px;"><em>항목</em></span></p></li></ol><blockquote><p>인용</p></blockquote>',contract);
 assert.deepEqual(r.issues,[]);const d=contract.parseLessonDocument(r.content);assert.equal(d.content[0].attrs.start,3);assert.equal(d.content[0].content[0].content[0].content[0].marks[0].attrs.fontSize,'24px');
 assert.deepEqual(convertLearningHtml('<p><span style="background:url(https://private.test)">본문</span></p>',contract).issues,['HTML_STYLE_REVIEW']);
});
test('CLI private package verifies source, plan and every extracted byte; never overwrites, follows an asset link, or prints private source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'edu-lesson-plan-test-'));try{
  const input=join(dir,'source.json'),output=join(dir,'package'),source=sourceFixture();source.days[0].blocks.find(b=>b.type==='image').content='data:image/png;base64,'+imageBytes.toString('base64');source.days[0].blocks.find(b=>b.type==='video').content='https://media.example.test/private?token=secret-marker';writeFileSync(input,JSON.stringify(source));
  const run=(...args)=>spawnSync(process.execPath,['scripts/prepare-replit-lessons.mjs',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  const built=run(input,output);assert.equal(built.status,0,built.stderr);assert.doesNotMatch(built.stdout+built.stderr,/secret-marker|data:image|correctIndex/);assert.equal(statSync(output).mode&0o777,0o700);assert.equal(statSync(join(output,'source.json')).mode&0o777,0o600);
  assert.equal(run(input,output).status,2);assert.equal(run('--verify',output).status,0);
  const planPath=join(output,'plan.json'),original=readFileSync(planPath),plan=JSON.parse(original);plan.lessons[0].plannedDocument.blocks.reverse();writeFileSync(planPath,JSON.stringify(plan));assert.equal(run('--verify',output).status,2);writeFileSync(planPath,original);
  const file=join(output,plan.assets.find(a=>a.path).path);writeFileSync(file,'different');assert.equal(run('--verify',output).status,2);unlinkSync(file);symlinkSync(input,file);assert.equal(run('--verify',output).status,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
