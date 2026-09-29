import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceFixture} from './fixtures/replit-import-source.mjs';
import {prepareReplitLessonPlan} from '../scripts/lib/replit-lesson-plan.mjs';
import {bindReplitMedia} from '../scripts/lib/replit-media-binding.mjs';
import {prepareReplitImport} from '../scripts/lib/replit-import-placement.mjs';
import {lessonImportContract} from '../scripts/lib/lesson-import-contract.mjs';
import {batchFor} from './helpers/lesson-import-fixture.mjs';
function source(){const s=sourceFixture();s.days[0].blocks=[{id:'first',type:'text',content:'원문 유지\n둘째 줄',order:1}];return s;}
async function prepared(){const {plan}=await prepareReplitLessonPlan(source()),courseId=id();const ledger={formatVersion:1,sourceDigest:plan.sourceDigest,courseId,receipts:[]},bound=await bindReplitMedia(plan,ledger);const placement={courseId,requestId:id(),lessonKeys:bound.lessons.filter(l=>l.track!=='ongoing').map(l=>l.key),weeks:[{sourceWeek:1,id:id(),number:2,title:'이전할 1주차',goal:'',existing:false,startOrder:7}]};return{bound,placement,ledger};}
test('placement preserves two day-one tracks, content and original mappings while choosing distinct physical positions',async()=>{
 const {bound,placement}=await prepared(),out=await prepareReplitImport(bound,placement);assert.equal(out.requestId,placement.requestId);
 assert.deepEqual(out.batch.lessons.map(l=>l.order),[7,8]);assert.deepEqual(out.batch.lessons.map(l=>l.document.progression),[{track:'daily',dayNumber:1},{track:'learning',dayNumber:1}]);
 for(let i=0;i<2;i++){assert.deepEqual(out.batch.lessons[i].document,bound.lessons[i].document);assert.deepEqual(out.batch.lessons[i].provenance.mapping,bound.lessons[i].mapping);assert.deepEqual(out.batch.lessons[i].provenance.metadata,bound.lessons[i].metadata);}
 assert.deepEqual(await prepareReplitImport(bound,placement),out);assert.equal(out.batch.lessons[1].durationLabel,'5분');
});
for(const [name,alter] of [
 ['unresolved lessons',b=>{b.lessons[0].issues.push({code:'MEDIA_UPLOAD_PENDING'});}],['different destination',(b,p)=>p.courseId=id()],['unknown lesson',(b,p)=>p.lessonKeys.push('missing')],['ongoing without destination week',(b,p)=>p.lessonKeys.push(b.lessons[2].key)],['duplicate selection',(b,p)=>p.lessonKeys.push(p.lessonKeys[0])],['missing week',(b,p)=>p.weeks=[]],['missing source title',b=>b.lessons[0].title='-'],['duplicate week mapping',(b,p)=>p.weeks.push({...p.weeks[0]})]
])test('placement rejects '+name,async()=>{const {bound,placement}=await prepared();alter(bound,placement);await assert.rejects(prepareReplitImport(bound,placement),/Invalid import placement/);});
test('ongoing source week zero maps to an explicit destination without inventing daily progression',async()=>{
 const {bound,placement}=await prepared(),ongoing=bound.lessons[2];placement.lessonKeys.push(ongoing.key);placement.weeks.push({sourceWeek:0,id:id(),number:9,title:'지속 챌린지',goal:'',existing:false,startOrder:1});
 const out=await prepareReplitImport(bound,placement),lesson=out.batch.lessons[2];assert.equal(lesson.ongoing,'weekly');assert.equal(lesson.document.progression,undefined);
 assert.equal(lesson.description,ongoing.metadata.description);assert.deepEqual(lesson.document,ongoing.document);assert.deepEqual(lesson.provenance.metadata,ongoing.metadata);
 const {validateLessonImportBatch}=await lessonImportContract();assert.deepEqual(validateLessonImportBatch(out.batch),out.batch);
 for(const change of [l=>l.ongoing='bad',l=>l.document.progression={track:'daily',dayNumber:2},l=>l.document.completion.mode='mentor',l=>delete l.ongoing]){const batch=structuredClone(out.batch);change(batch.lessons[2]);assert.throws(()=>validateLessonImportBatch(batch));}
});
test('server contract rejects mixed IDs, duplicated days, unsupported provenance and unverified media references',async()=>{
 const {validateLessonImportBatch}=await lessonImportContract();const original=batchFor(id());assert.deepEqual(validateLessonImportBatch(original),original);
 for(const alter of [b=>b.lessons[1].order=b.lessons[0].order,b=>b.lessons[1].document.progression=b.lessons[0].document.progression,b=>b.lessons[0].weekId=id(),b=>b.lessons[0].document.blocks.push({id:'img',type:'image',assetId:id()}),b=>b.lessons[0].provenance.apiKey='forbidden',b=>b.media.push({assetId:id(),kind:'image',bytes:8,mimeType:'image/png',sha256:'a'.repeat(64)}),b=>b.lessons[0].title='',b=>b.sourceCapturedAt='yesterday']){const batch=structuredClone(original);alter(batch);assert.throws(()=>validateLessonImportBatch(batch));}
});
test('CLI regenerates source/bindings and writes a private immutable import file without outputting paid content',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'edu-placement-'));try{
  const raw=join(dir,'source.json'),pkg=join(dir,'package'),binding=join(dir,'binding'),ledger=join(dir,'ledger.json'),config=join(dir,'placement.json'),out=join(dir,'import');writeFileSync(raw,JSON.stringify(source()));
  const run=(script,...args)=>spawnSync(process.execPath,['scripts/'+script+'.mjs',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  assert.equal(run('prepare-replit-lessons',raw,pkg).status,0);
  const {placement,ledger:receipts}=await prepared();writeFileSync(ledger,JSON.stringify(receipts));writeFileSync(config,JSON.stringify(placement));assert.equal(run('bind-replit-lesson-media',pkg,ledger,binding).status,0);
  const res=run('prepare-replit-import',pkg,binding,config,out);assert.equal(res.status,0,res.stderr);assert.doesNotMatch(res.stdout,/원문|correctIndex|courseId|sourceKey/);assert.equal(JSON.parse(res.stdout).unselectedLessons,1);
  assert.equal(statSync(out).mode&0o777,0o700);assert.equal(statSync(join(out,'import.json')).mode&0o777,0o600);assert.equal(JSON.parse(readFileSync(join(out,'import.json'))).batch.lessons.length,2);assert.equal(run('prepare-replit-import',pkg,binding,config,out).status,2);
  const altered=JSON.parse(readFileSync(join(binding,'bound-plan.json')));altered.lessons[0].document.blocks[0].content='바뀜';writeFileSync(join(binding,'bound-plan.json'),JSON.stringify(altered));assert.equal(run('prepare-replit-import',pkg,binding,config,join(dir,'other')).status,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('reviewed titles and retained external links preserve source data and all unresolved upload gates',async()=>{
 const {bound,placement}=await prepared(),source=bound.lessons[0],originalTitle=source.title;
 source.title='-';source.issues=[{code:'TITLE_REVIEW_PENDING',document:source.key},{code:'EXTERNAL_MEDIA_UNVERIFIED',document:source.key,block:'source-video'}];source.structureReady=false;
 source.mapping.push({sourceBlock:'source-video',targetBlock:'video'});source.document.blocks.push({id:'video',type:'video',url:'https://youtu.be/abcdefghijk'});
 placement.lessonReviews=[{sourceKey:source.key,title:'AI 활용 결과를 정리합니다.',externalMedia:[{sourceBlock:'source-video',url:'https://youtu.be/abcdefghijk',decision:'retain-unverified'}]}];
 const original=structuredClone(bound),out=await prepareReplitImport(bound,placement);
 assert.equal(out.batch.lessons[0].title,'AI 활용 결과를 정리합니다.');assert.equal(out.batch.lessons[0].provenance.review.sourceTitle,'-');assert.equal(out.batch.lessons[0].provenance.review.externalMedia[0].decision,'retain-unverified');assert.deepEqual(bound,original);assert.deepEqual(out.batch.lessons[0].document,source.document);assert.deepEqual(out.batch.lessons[0].provenance.metadata,source.metadata);
 for(const alter of [p=>p.lessonReviews.push({...p.lessonReviews[0]}),p=>p.lessonReviews[0].sourceKey='missing',p=>p.lessonReviews[0].title='-',p=>p.lessonReviews[0].title='a'.repeat(301),p=>p.lessonReviews[0].externalMedia[0].url='https://evil.test',p=>p.lessonReviews[0].externalMedia[0].decision='verified',p=>p.lessonReviews[0].externalMedia[0].sourceBlock='unknown']){const p=structuredClone(placement);alter(p);await assert.rejects(prepareReplitImport(bound,p),/Invalid import placement/);}
 source.issues.push({code:'MEDIA_UPLOAD_PENDING',document:source.key,block:'missing-upload'});await assert.rejects(prepareReplitImport(bound,placement),/Invalid import placement/);assert.ok(originalTitle);
});
