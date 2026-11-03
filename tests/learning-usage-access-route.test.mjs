import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync(new URL('../app/api/platform/session-access/route.ts',import.meta.url),'utf8');
function harness({user={id,role:'student'},active=true,published=true,url='https://live.test/room',signError=false,recordError=false}={}){
 const calls=[],tables={cohort_sessions:published?{id,cohort_id:id,is_public:true}:null,enrollments:active?[{id,status:'active'}]:[],cohort_session_contents:{live_url:url,replay_url:url,resource_storage_path:'private/file.pdf'}};
 const db={from:table=>{const q={};for(const name of ['select','eq','order'])q[name]=(...args)=>{calls.push([table,name,...args]);return q;};const done=async()=>({data:tables[table],error:null});q.maybeSingle=done;q.limit=done;return q;},storage:{from:()=>({createSignedUrl:async()=>{calls.push(['sign']);return{data:signError?null:{signedUrl:'https://storage.test/signed'},error:signError?'secret':null};}})}};
 const mocks={'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/platform-rules':{hasLearningAccess:e=>e.status==='active'},'@/lib/platform':{safeUrl:u=>/^https?:\/\//.test(u||'')?u:''},'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)},'@/lib/learning-usage-server':{recordLearningUsage:async(...args)=>{calls.push(['record',...args]);if(recordError)throw Error('secret');}}};
 const exports={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>mocks[n]);
 return{calls,get:(q=`session=${id}&type=live_join`)=>exports.GET(new Request('https://edu.test/api/platform/session-access?'+q)),head:exports.HEAD};
}
test('session redirect authenticates, scopes to own cohort and records the authenticated entitlement before opening',async()=>{
 const h=harness(),r=await h.get(`session=${id}&type=live_join&p_actor=forged`);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://live.test/room');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(h.calls.at(-1),['record',{id,role:'student'},id,'live_join',id]);assert.ok(h.calls.some(c=>c[0]==='enrollments'&&c[1]==='eq'&&c[2]==='user_id'&&c[3]===id));
 const material=harness();assert.equal((await material.get(`session=${id}&type=material_download`)).status,303);assert.equal(material.calls.at(-2)[0],'sign');assert.equal(material.calls.at(-1)[0],'record');
});
test('denied, unconfigured and failed signing requests never write usage; failed recording never redirects',async()=>{
 for(const [config,q,status]of [[{user:null},undefined,401],[{active:false},undefined,403],[{published:false},undefined,404],[{url:'javascript:bad'},undefined,404],[{signError:true},`session=${id}&type=material_download`,503]]){const h=harness(config);assert.equal((await h.get(q)).status,status);assert.ok(!h.calls.some(c=>c[0]==='record'));}
 const h=harness({recordError:true}),r=await h.get();assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);assert.doesNotMatch(await r.text(),/secret/);
 const malformed=harness();assert.equal((await malformed.get(`session=${id}&type=vod_complete`)).status,400);assert.equal(malformed.calls.length,0);assert.equal(malformed.head().status,405);assert.equal(malformed.calls.length,0);
});
test('usage writer skips staff/admin and never exposes database failure details',async()=>{
 const source=fs.readFileSync(new URL('../lib/learning-usage-server.ts',import.meta.url),'utf8');const exports={},calls=[];
 new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>({createAdminClient:()=>({rpc:async(...args)=>{calls.push(args);return{error:{message:'private db'}};}})}));
 for(const role of ['admin','staff'])await exports.recordLearningUsage({id,role},id,'live_join',id);assert.equal(calls.length,0);
 await assert.rejects(exports.recordLearningUsage({id,role:'student'},id,'live_join',id),e=>!e.message.includes('private db'));assert.equal(calls[0][1].p_actor,id);
});
