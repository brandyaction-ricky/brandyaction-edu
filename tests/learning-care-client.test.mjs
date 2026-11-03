import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports={};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/learning-care-client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const url='/api/admin/learning-care';
const response=(actorId,extra={})=>Response.json({actorId,rows:[],...extra});
test('prefetch and mount share one read; a recent return reuses data, refresh and expiry fetch anew',async()=>{
 let time=1000,calls=0;
 const cache=exports.createCareReads(async()=>{calls++;return response('A');},()=>time);
 const first=cache.read('A',url);assert.equal(first,cache.read('A',url));await first;
 time+=29999;await cache.read('A',url);assert.equal(calls,1);
 await cache.read('A',url,true);assert.equal(calls,2);
 time+=30001;await cache.read('A',url);assert.equal(calls,3);
});
test('different cohorts remain separate and failures are not retained',async()=>{
 let calls=0,fail=true;
 const cache=exports.createCareReads(async()=>{calls++;return fail?Response.json({error:'retry'},{status:503}):response('A');});
 await assert.rejects(cache.read('A',url),/retry/);fail=false;
 await cache.read('A',url);await cache.read('A',url+'?cohort=other');await cache.read('A',url);assert.equal(calls,3);
});
test('logout or switching accounts aborts pending reads and prevents old data returning',async()=>{
 const pending=[];
 const cache=exports.createCareReads((url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal})));
 const a=cache.read('A',url);const rejected=assert.rejects(a,/취소/);
 cache.clear();assert.equal(pending[0].signal.aborted,true);
 const b=cache.read('B',url);pending[0].resolve(response('A'));pending[1].resolve(response('B'));
 await rejected;assert.equal((await b).actorId,'B');
 await cache.read('B',url);assert.equal(pending.length,2);
});
test('cookie account mismatch never caches a response under the wrong operator',async()=>{
 let calls=0;
 const cache=exports.createCareReads(async()=>{calls++;return response(calls===1?'B':'A');});
 await assert.rejects(cache.read('A',url),/계정이 변경/);
 assert.equal((await cache.read('A',url)).actorId,'A');assert.equal(calls,2);
});
test('forced refresh supersedes a pending read without allowing the old response to replace it',async()=>{
 const pending=[];
 const cache=exports.createCareReads((url,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal})));
 const old=cache.read('A',url);const rejected=assert.rejects(old,/취소/);
 const fresh=cache.read('A',url,true);
 pending[1].resolve(response('A',{asOf:'new'}));await fresh;
 pending[0].resolve(response('A',{asOf:'old'}));await rejected;
 assert.equal((await cache.read('A',url)).asOf,'new');
});
test('permission denial clears other cohort snapshots; bounded reads evict old cohorts',async()=>{
 let calls=0,denied=false;
 const cache=exports.createCareReads(async()=>{calls++;return denied?Response.json({error:'권한 없음'},{status:403}):response('A');});
 await cache.read('A',url);denied=true;await assert.rejects(cache.read('A',url+'?cohort=other'),/권한/);
 denied=false;await cache.read('A',url);assert.equal(calls,3);
 for(let i=0;i<4;i++)await cache.read('A',url+'?cohort='+i);
 await cache.read('A',url);assert.equal(calls,8);
});
