import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111',period='2026-09-28T15:00:00Z';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const blocks=compile('lib/lesson-blocks.ts',{'./lesson-guided-tools':compile('lib/lesson-guided-tools.ts'),'./lesson-calculators':compile('lib/lesson-calculators.ts')});
const document={schemaVersion:1,blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'q',prompt:'시험',options:['가','나'],correctIndex:1}]}}],checklist:[]};
function harness({user={id},allowed=true,error=null,bucket='lesson-answer-files',kind='image',signError=null}={}){
 const calls=[],signs=[],permissions=[];
 const route=compile('app/api/admin/ongoing-lessons/route.ts',{'@/lib/lesson-blocks':blocks,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:name.endsWith('_file')?{bucket,path:'private/file.png',name:'증빙.png',kind}:{document,values:{blocks:{},checklist:[]}},error};},storage:{from:bucket=>({createSignedUrl:async(path,expiry,options)=>{signs.push({bucket,path,expiry,options});return{data:{signedUrl:'https://storage.example.test/short-lived'},error:signError};}})}})},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{permissions.push({scope,actor});return allowed?user:null;}}});
 const get=(q={})=>route.GET(new Request('https://edu.test/api/admin/ongoing-lessons?'+new URLSearchParams(q)));
 const detail={action:'detail',lesson:id,enrollment:id,period};const file={...detail,action:'file',file:id,kind:'answer'};return{get,calls,signs,permissions,detail,file};
}
test('only authenticated member reviewers read; actor injection is ignored',async()=>{
 for(const [options,status] of [[{user:null},401],[{allowed:false},403]]){const h=harness(options);assert.equal((await h.get()).status,status);assert.equal(h.calls.length,0);}
 const h=harness();await h.get({actor:'forged',p_actor:'forged'});assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.permissions[0].scope,'members');assert.equal(h.permissions[0].actor.id,id);
});
test('detail removes quiz answers and uses exact normalized snapshot identity with private no-store responses',async()=>{
 const h=harness(),result=await h.get({...h.detail,snapshot:'completed'});assert.equal(result.status,200);assert.doesNotMatch(await result.text(),/correctIndex/);
 assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.headers.get('vary'),'Cookie');assert.equal(h.calls[0].args.p_period,'2026-09-28T15:00:00.000Z');assert.equal(h.calls[0].args.p_completed,true);
 await h.get({action:'options'});assert.equal(h.calls[1].name,'edu_ongoing_review_options');
});
test('invalid actions, filters, page and file/period identities cannot reach the service database',async()=>{
 const h=harness();for(const q of [{action:'write'},{scope:'bad'},{state:'approved'},{page:'0'},{page:'1.5'},{page:'100001'},{lesson:'bad'},{...h.detail,enrollment:'bad'},{...h.detail,period:'yesterday'},{...h.detail,period:'2026-99-99T00:00:00Z'},{...h.detail,snapshot:'forged'},{...h.file,kind:'secret'},{...h.file,file:'bad'}])assert.equal((await h.get(q)).status,400);
 assert.equal(h.calls.length,0);assert.equal(h.signs.length,0);
});
test('only DB-authorized files receive a 60 second link; failures and unrelated buckets never sign',async()=>{
 const h=harness(),result=await h.get({...h.file,snapshot:'completed',download:'1'});assert.equal(result.status,303);assert.equal(result.headers.get('location'),'https://storage.example.test/short-lived');assert.equal(result.headers.get('cache-control'),'private, no-store');assert.deepEqual(h.signs[0],{bucket:'lesson-answer-files',path:'private/file.png',expiry:60,options:{download:'증빙.png'}});assert.equal(h.calls[0].args.p_completed,true);
 const inline=harness({bucket:'lesson-content-media'});assert.equal((await inline.get({...inline.file,kind:'content'})).status,303);assert.equal(inline.signs[0].options.download,false);
 const download=harness({kind:'file'});await download.get(download.file);assert.equal(download.signs[0].options.download,'증빙.png');
 for(const options of [{error:{message:'BLOCK_FORBIDDEN'}},{error:{message:'BLOCK_NOT_FOUND'}},{bucket:'unrelated-private-bucket'}]){const bad=harness(options);assert.notEqual((await bad.get(bad.file)).status,303);assert.equal(bad.signs.length,0);}
});
test('unknown DB and storage errors return safe failures without raw credentials or answers',async()=>{
 for(const options of [{error:{message:'private credential marker'}},{signError:{message:'private credential marker'}}]){const h=harness(options),result=await h.get(h.file);assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private credential marker/);}
});
