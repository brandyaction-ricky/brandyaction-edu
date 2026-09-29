import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareReplitLessonPlan} from '../scripts/lib/replit-lesson-plan.mjs';
import {bindReplitMedia,mediaBindingReport} from '../scripts/lib/replit-media-binding.mjs';
import {sourceFixture,imageBytes} from './fixtures/replit-import-source.mjs';
function source(){const s=sourceFixture();const image=s.days[0].blocks.find(b=>b.type==='image');image.content='data:image/png;base64,'+imageBytes.toString('base64');s.days[0].blocks.push({...image,id:'image-again',order:30});return s;}
function ledger(plan){const courseId=randomUUID();return{formatVersion:1,sourceDigest:plan.sourceDigest,courseId,receipts:plan.assets.filter(a=>a.path).map(a=>({formatVersion:1,assetId:randomUUID(),courseId,kind:a.kind,sha256:a.sha256,bytes:a.bytes,mimeType:a.mimeType,readyAt:'2026-09-29T01:00:00.000Z'}))};}
test('matches original bytes to same-course receipts and replaces every use without changing text, IDs, quiz answers or provenance',async()=>{
 const {plan}=await prepareReplitLessonPlan(source()),original=structuredClone(plan),input=ledger(plan),bound=await bindReplitMedia(plan,input);
 assert.deepEqual(plan,original);assert.equal(bound.bindings.length,1);assert.equal(bound.lessons[0].appliedMedia.length,2);assert.equal(bound.lessons[0].document.blocks.filter(b=>b.type==='image').length,2);
 assert.ok(bound.lessons[0].document.blocks.filter(b=>b.type==='image').every(b=>b.assetId===input.receipts[0].assetId&&!('url'in b)&&!('pendingAssetId'in b)));
 for(let i=0;i<plan.lessons.length;i++){const a=plan.lessons[i],b=bound.lessons[i];assert.deepEqual(a.mapping,b.mapping);assert.deepEqual(a.metadata,b.metadata);assert.deepEqual(a.checklistMapping,b.checklistMapping);assert.deepEqual(a.plannedDocument.checklist,b.document.checklist);assert.deepEqual(a.plannedDocument.blocks.filter(b=>b.type!=='image'),b.document.blocks.filter(b=>b.type!=='image'));}
 assert.deepEqual(bound.configuration,plan.configuration);assert.ok(!bound.issues.some(i=>i.code==='MEDIA_UPLOAD_PENDING'));assert.ok(bound.issues.some(i=>i.code==='EXTERNAL_MEDIA_UNVERIFIED'));assert.ok(!bound.issues.some(i=>i.code==='ONGOING_ENGINE_PENDING'));
 const ongoing=bound.lessons.find(l=>l.track==='ongoing');assert.equal(ongoing.structureReady,true);assert.equal(ongoing.ongoing,'weekly');assert.deepEqual(ongoing.document,plan.lessons.find(l=>l.track==='ongoing').document);
 assert.equal(bound.currentLiveContentVerified,false);assert.equal(bound.serverReceiptsRechecked,false);assert.equal(bound.readyForImport,false);assert.ok(bound.lessons.every(l=>l.ready===false));
 assert.doesNotMatch(JSON.stringify(mediaBindingReport(bound)),/correctIndex|media\.example|base64|assetId|나의 목표/);
});
test('partial binding retains unbound media blockers; no external URLs are certified by an unrelated receipt',async()=>{
 const {plan}=await prepareReplitLessonPlan(source()),input=ledger(plan);input.receipts=[];const result=await bindReplitMedia(plan,input);assert.equal(result.lessons[0].document,null);assert.equal(result.bindings.length,0);assert.equal(result.lessons[1].structureReady,true);assert.equal(result.lessons[2].structureReady,true);assert.equal(result.lessons[2].ongoing,'weekly');assert.equal(result.lessons[2].ready,false);assert.equal(result.readyForImport,false);
 const ext=ledger(plan);ext.receipts[0].sha256='e'.repeat(64);await assert.rejects(bindReplitMedia(plan,ext),/original asset bytes/);
});
for(const [label,alter] of [
 ['different source',l=>l.sourceDigest='b'.repeat(64)],['different course',l=>l.receipts[0].courseId=randomUUID()],['different bytes',l=>l.receipts[0].bytes++],['different type',l=>l.receipts[0].mimeType='image/jpeg'],['different kind',l=>l.receipts[0].kind='audio'],['not ready',l=>l.receipts[0].readyAt=null],['ambiguous same hash',l=>l.receipts.push({...l.receipts[0],assetId:randomUUID()})],['reused asset ID',l=>l.receipts.push({...l.receipts[0]})],['unmapped fields',l=>l.receipts[0].secret='never printed'],['invalid ID',l=>l.receipts[0].assetId='../file']
])test('rejects '+label,async()=>{const {plan}=await prepareReplitLessonPlan(source()),input=ledger(plan);alter(input);await assert.rejects(bindReplitMedia(plan,input),/^Error: Invalid media binding:/);});
test('CLI verifies source and assets first, keeps receipts private, detects tampering and never overwrites or follows links',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'edu-binding-'));try{
  const file=join(dir,'source.json'),pkg=join(dir,'package'),receipts=join(dir,'receipts.json'),out=join(dir,'bound');writeFileSync(file,JSON.stringify(source()));
  const run=(script,...args)=>spawnSync(process.execPath,['scripts/'+script+'.mjs',...args],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  assert.equal(run('prepare-replit-lessons',file,pkg).status,0);const plan=JSON.parse(readFileSync(join(pkg,'plan.json')));writeFileSync(receipts,JSON.stringify(ledger(plan)));
  const result=run('bind-replit-lesson-media',pkg,receipts,out);assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout+result.stderr,/base64|correctIndex|media\.example|courseId|assetId/);
  assert.equal(statSync(out).mode&0o777,0o700);assert.equal(statSync(join(out,'receipts.json')).mode&0o777,0o600);assert.equal(run('bind-replit-lesson-media','--verify',pkg,out).status,0);assert.equal(run('bind-replit-lesson-media',pkg,receipts,out).status,2);
  const saved=readFileSync(join(out,'bound-plan.json'));const edited=JSON.parse(saved);edited.lessons[0].document.blocks.reverse();writeFileSync(join(out,'bound-plan.json'),JSON.stringify(edited));assert.equal(run('bind-replit-lesson-media','--verify',pkg,out).status,2);writeFileSync(join(out,'bound-plan.json'),saved);
  const image=join(pkg,plan.assets.find(a=>a.path).path);writeFileSync(image,'different');assert.equal(run('bind-replit-lesson-media','--verify',pkg,out).status,2);unlinkSync(image);symlinkSync(file,image);assert.equal(run('bind-replit-lesson-media','--verify',pkg,out).status,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
