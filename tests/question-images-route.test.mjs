import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import * as crypto from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111',png=Uint8Array.from([137,80,78,71,13,10,26,10]);
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const files=compile('lib/lesson-files.ts');
function harness({user={id},dbError=null,size=8,mime='image/png',bytes=png,ready=false}={}){
 process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED='true';const calls=[],storageCalls=[];
 const file={id,name:'질문.png',size:8,content_type:'image/png',path:`${id}/${id}.png`,ready_at:ready?'2026-09-28':null};
 const storage={createSignedUploadUrl:async(path,options)=>{storageCalls.push({action:'upload',path,options});return{data:{signedUrl:'https://storage.test/signed-upload',token:'private-token'}};},info:async()=>({data:{size,contentType:mime}}),download:async()=>{storageCalls.push({action:'download'});return{data:new Blob([bytes])};}};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='edu_complete_question_image'?{id,name:file.name,size}:file,error:dbError};},storage:{from:bucket=>{assert.equal(bucket,'question-images');return storage;}}};
 const route=compile('app/api/platform/question-images/route.ts',{'node:crypto':crypto,'@/lib/lesson-files':files,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>db}});
 return{calls,storageCalls,body:{action:'prepare',lessonId:id,enrollmentId:id,name:'질문.png',size:8,requestId:id},post:(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/platform/question-images',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)})),get:(query=`question=${id}`)=>route.GET(new Request('https://edu.test/api/platform/question-images?'+query))};
}
test('signed upload uses server owner and fixed private bucket, disallows unauthenticated and cross-origin writes',async()=>{
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,origin)).status,403);
 const anon=harness({user:null});assert.equal((await anon.post(anon.body)).status,401);assert.equal((await anon.get()).status,401);
 const r=await h.post({...h.body,ownerId:'victim',path:'public.png',bucket:'public'});assert.equal(r.status,200);assert.equal(h.calls[0].args.p_actor,id);assert.deepEqual(h.storageCalls[0].options,{upsert:false});assert.deepEqual(Object.keys(await r.json()).sort(),['contentType','id','ready','signedUrl']);
 const denied=harness({dbError:{message:'QUESTION_FORBIDDEN'}});assert.equal((await denied.post(denied.body)).status,403);assert.equal(denied.storageCalls.length,0);
});
test('complete verifies actual size, type and signature and produces server hash; ready retry needs no second upload',async()=>{
 const h=harness();assert.equal((await h.post({action:'complete',fileId:id,sha256:'fake'})).status,200);assert.equal(h.calls[1].args.p_sha256,crypto.createHash('sha256').update(png).digest('hex'));
 for(const config of [{size:9},{mime:'text/html'},{bytes:Uint8Array.from([1,2,3,4,5,6,7,8])}]){const bad=harness(config);assert.equal((await bad.post({action:'complete',fileId:id})).status,400);assert.equal(bad.calls.length,1);}
 const ready=harness({ready:true});assert.equal((await ready.post({action:'complete',fileId:id})).status,200);assert.equal((await ready.post(ready.body)).status,200);assert.equal(ready.storageCalls.length,0);
});
test('image read authenticates question association on every request and streams private bytes without exposing a bearer URL',async()=>{
 const h=harness(),r=await h.get();assert.equal(r.status,200);assert.equal(h.calls[0].name,'edu_read_question_image');assert.equal(h.calls[0].args.p_question,id);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),png);
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('location'),null);assert.match(r.headers.get('content-disposition'),/^inline;/);
 assert.match((await h.get(`question=${id}&download=1`)).headers.get('content-disposition'),/^attachment;/);
 const denied=harness({dbError:{message:'QUESTION_NOT_FOUND'}});assert.equal((await denied.get()).status,404);assert.equal(denied.storageCalls.length,0);
 const broken=harness({dbError:{message:'secret DB details'}});assert.doesNotMatch(await(await broken.get()).text(),/secret DB/);
});
test('rejects SVG, archives, huge inputs, bad IDs and stays disabled by default',async()=>{
 const h=harness();for(const body of [null,{}, {...h.body,name:'evil.svg'}, {...h.body,name:'file.zip'}, {...h.body,size:10485761},{...h.body,lessonId:'bad'}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({...h.body,padding:'한'.repeat(1800)})).status,413);assert.equal(h.calls.length,0);
 delete process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED;assert.equal((await h.post(h.body)).status,404);assert.equal((await h.get()).status,404);assert.equal(h.calls.length,0);
});
