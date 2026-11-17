import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const {handleBusiness}=await load('features/campus/business/handler.ts'),{handleReviews}=await load('features/campus/business/review-handler.ts'),{handleCases}=await load('features/campus/business/case-handler.ts'),{handleArchive}=await load('features/campus/business/archive-handler.ts');
function streaming(chunks,extra={}){let next=0,cancelled=false;const stream=new ReadableStream({pull(c){if(next<chunks.length)c.enqueue(chunks[next++]);else c.close();},cancel(){cancelled=true;}},{highWaterMark:0});const request=new Request('https://edu.test/api/campus/business',{method:'POST',headers:{'content-type':'application/json','origin':'https://edu.test',...extra},body:stream,duplex:'half'});return {request,get reads(){return next;},get cancelled(){return cancelled;}};}
const cases=[['business',40000,handleBusiness],['reviews',8000,handleReviews],['public reviews',8000,(r,d)=>handleReviews(r,d,true)],['cases',16000,handleCases],['admin cases',16000,(r,d)=>handleCases(r,d,true)],['archive',70000,handleArchive]];
for(const [name,limit,handler]of cases)test(name+' cancels headerless or understated oversized JSON before repository mutation',async()=>{
 let writes=0;const write=async()=>{writes++;return {};},deps={enabled:true,authenticate:async()=>({id:'owner'}),save:write,create:write,revoke:write,publicRequest:write,write};
 for(const headers of [{},{'content-length':'1'}]){const data=streaming([new Uint8Array(limit),new Uint8Array(1),new Uint8Array(1024)],headers);const response=await handler(data.request,deps);assert.equal(response.status,400);assert.equal(data.reads,2);assert.equal(data.cancelled,true);assert.equal(writes,0);assert.ok(!(await response.text()).includes('Invalid bounded'));}
});
test('fatal UTF-8 rejects malformed split input; valid Korean split across chunks stays intact',async()=>{
 const {readBusinessJson}=await load('features/campus/business/request-json.ts');
 const bad=streaming([new TextEncoder().encode('{"s":"'),new Uint8Array([0xc0,0xaf]),new TextEncoder().encode('"}')]);await assert.rejects(readBusinessJson(bad.request,128),e=>e.status===400);assert.equal(bad.cancelled,true);assert.equal(bad.reads,2);
 const bytes=new TextEncoder().encode('{"s":"한글"}'),good=streaming([...bytes].map(b=>new Uint8Array([b])));assert.deepEqual(await readBusinessJson(good.request,bytes.length),{s:'한글'});
 const tooSmall=streaming([bytes]);await assert.rejects(readBusinessJson(tooSmall.request,bytes.length-1),e=>e.status===400);assert.equal(tooSmall.cancelled,true);
});
test('oversized Content-Length is refused without consuming the body or calling mutations',async()=>{
 let writes=0;const data=streaming([new TextEncoder().encode('{}')],{'content-length':'80001'});const response=await handleBusiness(data.request,{enabled:true,authenticate:async()=>({id:'owner'}),save:async()=>{writes++;}});assert.equal(response.status,400);assert.equal(data.reads,0);assert.equal(writes,0);
});
