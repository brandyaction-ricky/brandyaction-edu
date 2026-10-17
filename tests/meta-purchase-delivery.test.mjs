import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function compile(file,mocks={}) { const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out; }
const logic=compile('lib/meta-purchase-delivery.ts');
const env={META_PURCHASE_MODE:'live',VERCEL_ENV:'production',VERCEL_PROJECT_ID:logic.EDU_META_PROJECT,META_PURCHASE_DATASET_ID:logic.EDU_META_DATASET,META_PURCHASE_GRAPH_VERSION:'v99.0',META_PURCHASE_CAPI_ACCESS_TOKEN:'synthetic-secret'};
const job={orderId:'order',lease:'lease',eventId:'stable-random-event',dataset:logic.EDU_META_DATASET,eventTime:1792195200,amount:90000,courseIds:['allowed-course'],emailHash:'a'.repeat(64),userAgent:'Synthetic buyer browser',sourceUrl:'https://brandyaction-edu.com/checkout',fbp:'fb.1.1792195200000.12345',fbc:null};
test('Meta transport defaults closed and cannot send from Preview, DEV, a different project or pixel',async()=>{
 for(const replacement of [{META_PURCHASE_MODE:'off'},{VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{VERCEL_PROJECT_ID:'other'},{META_PURCHASE_DATASET_ID:'other'},{META_PURCHASE_GRAPH_VERSION:''},{META_PURCHASE_CAPI_ACCESS_TOKEN:''}]) {
  let calls=0;await assert.rejects(logic.sendMetaPurchase(job,{...env,...replacement},async()=>{calls++;}),/DISABLED/);assert.equal(calls,0);
 }
});
test('Meta payload is a strict minimal allowlist; amounts use the server job and email is already hashed',async()=>{
 const payload=logic.metaPurchasePayload({...job,phone:'private',email:'raw@example.invalid',report:'sensitive'});
 const event=payload.data[0];assert.equal(event.event_name,'Purchase');assert.equal(event.custom_data.value,90000);
 assert.deepEqual(Object.keys(event.user_data),['em','client_user_agent','fbp']);assert.deepEqual(event.user_data.em,['a'.repeat(64)]);
 assert.doesNotMatch(JSON.stringify(payload),/raw@|private|sensitive|orderId|lease|client_ip|access_token/);
 for(const change of [{amount:0},{amount:1.5},{dataset:'other'},{sourceUrl:job.sourceUrl+'?email=private'},{emailHash:'raw'},{courseIds:[]}])assert.throws(()=>logic.metaPurchasePayload({...job,...change}),/INVALID/);
});
test('Meta checkout capture rejects another origin, opt-out and malformed context without inventing cookies',()=>{
 const request=(headers={},url='https://brandyaction-edu.com/api/platform')=>new Request(url,{method:'POST',headers:{origin:'https://brandyaction-edu.com','user-agent':'Synthetic browser',...headers}});
 assert.equal(logic.metaCheckoutContext(request({cookie:'edu_noads=1'})),null);
  assert.equal(logic.metaCheckoutContext(request({cookie:'edu_noads=1; edu_noads=0'})),null);
 assert.equal(logic.metaCheckoutContext(request({origin:'https://evil.invalid'})),null);
 assert.equal(logic.metaCheckoutContext(request({},'https://preview.vercel.app/api/platform')),null);
 assert.equal(logic.metaCheckoutContext(request({'user-agent':'x'.repeat(513)})),null);
 assert.deepEqual(logic.metaCheckoutContext(request({cookie:'_fbp=bad; _fbc=private@example.invalid'})),{userAgent:'Synthetic browser',sourceUrl:job.sourceUrl,fbp:null,fbc:null});
});
test('Meta worker authorizes immediately before sending, pauses on OFF, and keeps capture failures out of checkout',async()=>{
 function server({values=env,authorized=true,failCapture=false,failFinish=false,outcome='sent'}={}) {
  const calls=[],sends=[];let claimed=false;
  const db={rpc:async(name,args)=>{calls.push({name,args});
   if(name==='edu_capture_meta_purchase')return {error:failCapture?{message:'private backend'}:null};
   if(name==='edu_claim_meta_purchase'){const data=claimed?null:job;claimed=true;return {data,error:null};}
   if(name==='edu_authorize_meta_purchase')return {data:authorized,error:null};
   if(name==='edu_finish_meta_purchase')return {data:true,error:failFinish?{message:'private backend'}:null};
   return {error:null};}};
  const output={};const code=ts.transpileModule(readFileSync(new URL('../lib/meta-purchase-server.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require','process','console',code)(output,name=>({'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/meta-purchase-delivery':{...logic,metaPurchaseEnvironment:()=>logic.metaPurchaseEnvironment(values),sendMetaPurchase:async(j)=>{sends.push(j);return {outcome,trace:null};}}}[name]),{env:values},{warn:()=>{}});
  return {...output,calls,sends};
 }
 const active=server();assert.deepEqual(await active.dispatchMetaPurchases(),{disabled:false,sent:1,deferred:0,blocked:0});
 assert.deepEqual(active.calls.map(x=>x.name),['edu_meta_purchase_cleanup','edu_claim_meta_purchase','edu_authorize_meta_purchase','edu_finish_meta_purchase','edu_claim_meta_purchase']);
 const rejected=server({authorized:false});await rejected.dispatchMetaPurchases();assert.equal(rejected.sends.length,0);
 const preview=server({values:{...env,VERCEL_ENV:'preview'}});assert.equal((await preview.dispatchMetaPurchases()).disabled,true);assert.equal(preview.calls.length,0);
 const paused=server({values:{...env,META_PURCHASE_MODE:'off'}});await paused.dispatchMetaPurchases();assert.deepEqual(paused.calls.map(x=>x.name),['edu_meta_purchase_cleanup','edu_pause_meta_purchase']);assert.equal(paused.sends.length,0);
 const lost=server({failFinish:true});await assert.rejects(lost.dispatchMetaPurchases(),/QUEUE_UNAVAILABLE/);assert.equal(lost.sends.length,1);
 const capture=server({failCapture:true});await capture.captureMetaPurchaseContext(new Request('https://brandyaction-edu.com/api/platform',{headers:{origin:'https://brandyaction-edu.com','user-agent':'Synthetic UA'}}),'member','order');
 assert.equal(capture.calls.length,1);
});
test('Meta retries reuse identical event IDs; provider responses never leak their body or credentials',async()=>{
 const calls=[]; const transport=async(url,options)=>{calls.push({url,options});return Response.json({events_received:1,fbtrace_id:'safe_trace'});};
 assert.deepEqual(await logic.sendMetaPurchase(job,env,transport),{outcome:'sent',trace:'safe_trace'});
 await logic.sendMetaPurchase(job,env,transport);assert.equal(calls[0].options.body,calls[1].options.body);
 assert.doesNotMatch(calls[0].url,/synthetic-secret/);assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-secret');
 for(const [status,outcome] of [[400,'blocked'],[401,'blocked'],[403,'blocked'],[429,'retry'],[500,'retry']]) {
  const result=await logic.sendMetaPurchase(job,env,async()=>Response.json({error:{message:'secret echoed body'},fbtrace_id:'unsafe value'}, {status}));
  assert.deepEqual(result,{outcome,trace:null});assert.doesNotMatch(JSON.stringify(result),/echoed|secret/);
 }
 assert.equal((await logic.sendMetaPurchase(job,env,async()=>{throw new Error('token secret');})).outcome,'retry');
 assert.equal((await logic.sendMetaPurchase(job,env,async()=>Response.json({events_received:0}))).outcome,'blocked');
});
test('Personalized ad rejection is same-origin, account-scoped, revokes even with no active terms and hides backend failures',async()=>{
 function route(user={id:'signed-in'},error=null){const calls=[];return {...compile('app/api/account/meta-purchase-rejection/route.ts',{'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error};}})}}),calls};}
 const req=origin=>new Request('https://edu.test/api/account/meta-purchase-rejection',{method:'POST',headers:origin?{origin}:{}});
 const r=route();assert.equal((await r.POST(req('https://evil.invalid'))).status,403);assert.equal(r.calls.length,0);
 assert.equal((await r.POST(req('https://edu.test'))).status,200);assert.equal(r.calls[0].name,'edu_reject_meta_purchase');assert.equal(r.calls[0].args.p_member,'signed-in');
 const anon=route(null);assert.deepEqual(await (await anon.POST(req('https://edu.test'))).json(),{account:'anonymous'});assert.equal(anon.calls.length,0);
 const failed=await route(undefined,{message:'private secret'}).POST(req('https://edu.test'));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private secret/);
});
