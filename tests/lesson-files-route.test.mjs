import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111';
const png=Uint8Array.from([137,80,78,71,13,10,26,10]);
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const files=compile('lib/lesson-files.ts');
function harness({user={id},dbError=null,size=8,mime='image/png',bytes=png,ready=false,kind='image'}={}){
 const calls=[],storageCalls=[];
 const file={id,owner_id:id,name:'test.png',size:8,kind,content_type:'image/png',extension:'png',path:`${id}/${id}.png`,ready_at:ready?'2026-09-28':null};
 const storage={createSignedUploadUrl:async(path,options)=>{storageCalls.push({action:'upload',path,options});return{data:{signedUrl:'https://storage.test/signed-upload',token:'private-token'}};},info:async()=>({data:{size,contentType:mime}}),download:async()=>({data:new Blob([bytes])}),createSignedUrl:async(path,seconds,options)=>{storageCalls.push({action:'read',path,seconds,options});return{data:{signedUrl:'https://storage.test/short-lived'}};}};
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='edu_complete_answer_file'?{id,name:file.name,kind,size}:file,error:dbError};},storage:{from:bucket=>{assert.equal(bucket,'lesson-answer-files');return storage;}}};
 const route=compile('app/api/platform/lesson-files/route.ts',{'node:crypto':crypto,'@/lib/lesson-files':files,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>db}});
 const post=(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/platform/lesson-files',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}));
 const get=(query=`file=${id}`)=>route.GET(new Request('https://edu.test/api/platform/lesson-files?'+query));
 return{post,get,calls,storageCalls,body:{action:'prepare',lessonId:id,enrollmentId:id,revision:id,blockId:'proof',name:'test.png',size:8,kind:'image',requestId:id}};
}
test('upload permissions come from session and DB; prepare uses a new immutable path and never accepts caller bucket/path/owner',async()=>{
 const anonymous=harness({user:null});assert.equal((await anonymous.post(anonymous.body)).status,401);assert.equal(anonymous.calls.length,0);
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,origin)).status,403);assert.equal(h.calls.length,0);
 const result=await h.post({...h.body,bucket:'public',path:'victim.png',p_actor:'forged'});assert.equal(result.status,200);assert.equal(h.calls[0].args.p_actor,id);assert.deepEqual(h.storageCalls[0].options,{upsert:false});assert.equal((await result.json()).signedUrl,'https://storage.test/signed-upload');
 const denied=harness({dbError:{message:'BLOCK_FORBIDDEN'}});assert.equal((await denied.post(denied.body)).status,403);assert.equal(denied.storageCalls.length,0);
});
test('complete validates stored metadata and actual bytes before server-generated hash registration',async()=>{
 const h=harness(),result=await h.post({action:'complete',fileId:id,sha256:'forged'});assert.equal(result.status,200);assert.equal(h.calls[1].name,'edu_complete_answer_file');assert.equal(h.calls[1].args.p_sha256,crypto.createHash('sha256').update(png).digest('hex'));
 for(const config of [{size:9},{mime:'text/html'},{bytes:Uint8Array.from([1,2,3,4,5,6,7,8])}]){const bad=harness(config);assert.equal((await bad.post({action:'complete',fileId:id})).status,400);assert.equal(bad.calls.length,1);}
 const ready=harness({ready:true});assert.equal((await ready.post({action:'complete',fileId:id})).status,200);assert.equal(ready.calls.length,1);
});
test('reading verifies file and submission association before short-lived private redirect; archives always download',async()=>{
 const h=harness({kind:'file'}),res=await h.get(`file=${id}&submission=${id}`);assert.equal(res.status,303);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0].args.p_submission,id);assert.equal(h.storageCalls[0].seconds,60);assert.equal(h.storageCalls[0].options.download,'test.png');
 const forbidden=harness({dbError:{message:'BLOCK_FORBIDDEN'}});assert.equal((await forbidden.get()).status,403);assert.equal(forbidden.storageCalls.length,0);
 const broken=harness({dbError:{message:'secret DB data'}});assert.doesNotMatch(await(await broken.get()).text(),/secret DB data/);
});
test('malformed and oversized requests never mint upload grants',async()=>{
 const h=harness();for(const body of [null,{}, {...h.body,size:10485761},{...h.body,name:'bad.svg'},{...h.body,blockId:'../q'},{...h.body,revision:'bad'}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({...h.body,padding:'한'.repeat(1800)})).status,413);assert.equal(h.calls.length,0);assert.equal(h.storageCalls.length,0);
});
