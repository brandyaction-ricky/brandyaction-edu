import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/lesson-block-autosave.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const { LessonBlockAutosave }=exports;
const values=text=>({blocks:{question:text},checklist:[]});
const receipt=write=>({writeId:write.requestId,updatedAt:'2026-09-28T14:30:00Z'});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('typing during a slow save queues the latest input without a second concurrent request',async()=>{
 const gate=deferred(),calls=[];const controller=new LessonBlockAutosave(values(''),null,async write=>{calls.push(write);if(calls.length===1)await gate.promise;return receipt(write);},100000);
 try{
  controller.change(values('first'));const first=controller.flush();controller.change(values('second'));await controller.flush();assert.equal(calls.length,1);
  gate.resolve();await first;assert.equal(controller.getSnapshot().phase,'dirty');assert.equal(controller.getValues().blocks.question,'second');
  await controller.flush();assert.equal(calls.length,2);assert.equal(calls[1].expectedWriteId,calls[0].requestId);assert.equal(calls[1].values.blocks.question,'second');assert.equal(controller.hasUnsaved(),false);
 }finally{controller.dispose();}
});
test('lost response retries the identical request before saving later edits',async()=>{
 const calls=[];const controller=new LessonBlockAutosave(values(''),null,async write=>{calls.push(write);if(calls.length===1)throw Error('offline');return receipt(write);},100000);
 try{
  controller.change(values('first'));await controller.flush();assert.equal(controller.getSnapshot().phase,'error');controller.change(values('latest'));
  await controller.flush();assert.deepEqual(calls[1],calls[0]);assert.equal(controller.getSnapshot().phase,'dirty');await controller.flush();assert.equal(calls[2].values.blocks.question,'latest');assert.notEqual(calls[2].requestId,calls[1].requestId);
 }finally{controller.dispose();}
});
test('conflict preserves typed answers and never force-overwrites the other device',async()=>{
 let count=0;const controller=new LessonBlockAutosave(values('saved'),'old-token',async()=>{count++;throw Object.assign(Error('다른 기기에서 저장'),{status:409});},100000);
 try{
  controller.change(values('local draft'));await controller.flush();controller.change(values('keep this too'));await controller.flush();assert.equal(count,1);assert.equal(controller.getSnapshot().phase,'conflict');assert.equal(controller.hasUnsaved(),true);assert.equal(controller.getValues().blocks.question,'keep this too');
 }finally{controller.dispose();}
});
test('no-op edits do not write, invalid receipts remain retryable, and disposed sessions cannot notify a new lesson',async()=>{
 const gate=deferred();let calls=0,notices=0;const controller=new LessonBlockAutosave(values('same'),null,async()=>{calls++;return gate.promise;},100000);
 controller.subscribe(()=>notices++);controller.change(values('same'));await controller.flush();assert.equal(calls,0);
 controller.change(values('new'));const pending=controller.flush();const before=notices;controller.dispose();gate.resolve({writeId:'wrong',updatedAt:''});await pending;assert.equal(notices,before);
 const bad=new LessonBlockAutosave(values(''),null,async()=>({writeId:'wrong',updatedAt:''}),100000);
 try{bad.change(values('unsaved'));await bad.flush();assert.equal(bad.getSnapshot().phase,'error');assert.equal(bad.hasUnsaved(),true);}finally{bad.dispose();}
});
test('finish waits for the in-flight and newest queued answers before returning an acknowledged write id',async()=>{
 const gate=deferred(),calls=[];const controller=new LessonBlockAutosave(values(''),null,async write=>{calls.push(write);if(calls.length===1)await gate.promise;return receipt(write);},100000);
 try{
  controller.change(values('first'));const writing=controller.flush();controller.change(values('latest'));
  let finished=false;const finishing=controller.finish().then(id=>{finished=true;return id;});await Promise.resolve();assert.equal(finished,false);
  gate.resolve();await writing;assert.equal(await finishing,calls[1].requestId);assert.equal(calls[1].values.blocks.question,'latest');assert.equal(controller.hasUnsaved(),false);
 }finally{controller.dispose();}
});
test('finish persists content-only empty answers and fails without submitting after save errors or conflicts',async()=>{
 const calls=[];const controller=new LessonBlockAutosave(values(''),null,async write=>{calls.push(write);return receipt(write);},100000);
 try{const saved=await controller.finish();assert.equal(calls.length,1);assert.equal(await controller.finish(),saved);assert.equal(calls.length,1);}finally{controller.dispose();}
 for(const status of [503,409]){
  const bad=new LessonBlockAutosave(values(''),null,async()=>{throw Object.assign(Error('save failed'),{status});},100000);
  try{await assert.rejects(bad.finish(),/save failed/);}finally{bad.dispose();}
 }
});
