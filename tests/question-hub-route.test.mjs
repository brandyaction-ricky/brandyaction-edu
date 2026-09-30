import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
function compile(file,mocks={},env={}){const out={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n],{env});return out;}
function harness({enabled=true,user={id},operator=true,error=null}={}){
 const env={NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED:String(enabled),NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED:'true'};
 const calls=[],reads=[],concept=compile('lib/question-hub.ts'),server=compile('lib/question-hub-server.ts',{'./edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)}},env);
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='edu_question_contexts'?[]:name==='edu_question_assist'?{id,status:'waiting',lessonRevision:null}:{id},error};},from:table=>{const chain={};for(const method of ['select','eq','order','range','limit'])chain[method]=(...args)=>{reads.push([table,method,...args]);return chain;};const value={data:{id,title:'질문 제목',content:'질문 본문',lesson_id:id,course_id:id},error};chain.single=chain.maybeSingle=async()=>value;chain.then=(a,b)=>Promise.resolve({data:[],error}).then(a,b);return chain;}};
 const mocks={'@/lib/question-hub':concept,'@/lib/question-hub-server':server,'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async()=>operator?user:null},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/question-ai-context':{loadQuestionAiContext:async()=>({reference:{lessonTitle:'현재 수업',revision:null},context:'공개된 수업 내용'})}};
 const member=compile('app/api/platform/question-hub/route.ts',mocks,env),admin=compile('app/api/admin/questions/hub/route.ts',mocks,env);
 const post=(body,{isAdmin=false,origin='https://edu.test'}={})=>(isAdmin?admin:member).POST(new Request('https://edu.test/api/question-hub',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}));
 const get=query=>member.GET(new Request('https://edu.test/api/question-hub?'+query));
 return {calls,reads,post,get,body:{requestId:id,enrollmentId:null,lessonId:null,title:'',content:'제목 없는 질문입니다',imageId:null,category:'general',share:false}};
}
test('hub authenticates, denies off-origin writes, bounds body and validates query IDs before data access',async()=>{
 assert.equal((await harness({enabled:false}).get('mode=mine')).status,404);assert.equal((await harness({user:null}).get('mode=contexts')).status,401);
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,{origin})).status,403);
 for(const body of [null,[],{}, {...h.body,share:'true'},{...h.body,requestId:'bad'},{...h.body,category:'wrong'},{...h.body,content:'가'.repeat(10001)}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({...h.body,extra:'a'.repeat(66000)})).status,413);
 assert.equal((await h.get('mode=shared&lesson=bad')).status,400);assert.equal((await h.get('page=-1')).status,400);assert.equal(h.calls.length,0);
});
test('hub assigns actor and generated title on server; private reads never accept another owner',async()=>{
 const h=harness(),r=await h.post({...h.body,userId:'victim',title:''});assert.equal(r.status,200);assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.calls[0].args.p_title,'제목 없는 질문입니다');assert.equal(h.calls[0].args.p_share,false);
 await h.get('mode=mine&userId=victim');assert.ok(h.reads.some(x=>x[1]==='eq'&&x[2]==='user_id'&&x[3]===id));assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('sharing needs operator permission and explicit content review; internal errors stay private',async()=>{
 const denied=harness({operator:false});assert.equal((await denied.post({action:'publish',questionId:id},{isAdmin:true})).status,403);
 const h=harness(),body={action:'publish',questionId:id,title:'정리한 질문',answer:'정리한 답변',published:true};assert.equal((await h.post(body,{isAdmin:true})).status,400);assert.equal((await h.post({...body,reviewed:true},{isAdmin:true})).status,200);assert.equal(h.calls[0].name,'edu_publish_shared_answer');
 const broken=harness({error:{message:'secret connection details'}}),r=await broken.post(broken.body);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret connection/);
});
test('Aside export is an operator-only versioned package with no identity, images or external API request',async()=>{
 const h=harness(),r=await h.post({action:'export',questionId:id,requestId:id},{isAdmin:true});assert.equal(r.status,200);const result=await r.json();assert.equal(result.handoff.schemaVersion,1);assert.equal(result.handoff.jobId,id);assert.deepEqual(Object.keys(result.handoff.question).sort(),['content','title']);assert.equal(result.handoff.lesson.text,'공개된 수업 내용');assert.equal(h.calls.filter(c=>c.name==='edu_question_assist').length,2);
 const invalid=await h.post({action:'import',questionId:id,requestId:id,draft:' '},{isAdmin:true});assert.equal(invalid.status,400);
});
