import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const actor='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333',period='2026-09-28T15:00:00.000Z';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const blocks=compile('lib/lesson-blocks.ts',{'./lesson-guided-tools':compile('lib/lesson-guided-tools.ts'),'./lesson-calculators':compile('lib/lesson-calculators.ts')});
const document={schemaVersion:1,blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'확인',options:['가','나'],correctIndex:1}]}},{id:'q',type:'question',question:{label:'실행',kind:'text',required:true}}],checklist:[]};
function harness({user={id:actor},error=null,readRevision=revision}={}){
 const calls=[];const route=compile('app/api/platform/ongoing-lessons/route.ts',{'@/lib/lesson-blocks':blocks,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:name==='edu_read_ongoing'?{document,revision:readRevision,periodStart:period,currentPeriodStart:period}:{id:actor}};}})}});
 return{calls,get:(query=`lesson=${lesson}&enrollment=${actor}`)=>route.GET(new Request('https://edu.test/api/platform/ongoing-lessons?'+query)),post:(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/platform/ongoing-lessons',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)})),body:{action:'draft',lessonId:lesson,enrollmentId:actor,periodStart:period,revision,requestId:actor,expectedWriteId:null,values:{blocks:{q:'저장할 답변',quiz:{a:1}},checklist:[]}}};
}
test('only authenticated same-origin writes reach the private ongoing RPCs',async()=>{
 const h=harness({user:null});assert.equal((await h.get()).status,401);assert.equal((await h.post(h.body)).status,401);assert.equal(h.calls.length,0);
 const signed=harness();for(const origin of [null,'https://evil.test'])assert.equal((await signed.post(signed.body,origin)).status,403);assert.equal(signed.calls.length,0);
});
test('current and historical reads hide quiz keys, disable caching, and use the session actor',async()=>{
 const h=harness(),result=await h.get(`lesson=${lesson}&enrollment=${actor}&period=${period}&p_actor=${lesson}`);
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.equal(result.headers.get('vary'),'Cookie');assert.doesNotMatch(await result.text(),/correctIndex/);assert.equal(h.calls[0].args.p_actor,actor);assert.equal(h.calls[0].args.p_period,period);
});
test('author settings and paginated history are checked by private RPCs, never by caller role claims',async()=>{
 const h=harness();assert.equal((await h.get(`action=settings&lesson=${lesson}&role=admin`)).status,200);assert.deepEqual(h.calls[0],{name:'edu_ongoing_settings',args:{p_actor:actor,p_lesson:lesson}});
 await h.get(`action=history&lesson=${lesson}&enrollment=${actor}&before=${period}`);assert.equal(h.calls[1].name,'edu_ongoing_history');assert.equal(h.calls[1].args.p_before,period);
 const denied=harness({error:{message:'BLOCK_FORBIDDEN'}});assert.equal((await denied.post({action:'configure',lessonId:lesson,cadence:'weekly',requestId:actor,role:'admin'})).status,403);
});
test('draft values match the pinned document, while completion ignores forged values, actor and scores',async()=>{
 const h=harness();assert.equal((await h.post({...h.body,p_actor:lesson})).status,200);assert.equal(h.calls[1].name,'edu_save_ongoing');assert.equal(h.calls[1].args.p_actor,actor);assert.deepEqual(h.calls[1].args.p_values,h.body.values);
 const bad=harness();assert.equal((await bad.post({...bad.body,values:{blocks:{unknown:'forged'},checklist:[]}})).status,400);assert.equal(bad.calls.length,1);
 const completed=harness();assert.equal((await completed.post({...completed.body,action:'complete',writeId:actor,values:{},score:100,passed:true,p_actor:lesson})).status,200);assert.equal(completed.calls.length,1);assert.deepEqual(completed.calls[0],{name:'edu_complete_ongoing',args:{p_actor:actor,p_lesson:lesson,p_enrollment:actor,p_period:period,p_revision:revision,p_write:actor,p_request:actor}});
 const grade=harness(),result=await grade.post({...grade.body,action:'grade',blockId:'quiz',passed:false});assert.equal(result.status,200);assert.equal((await result.json()).result.passed,true);
});
test('malformed periods, identifiers, cadence and oversized bodies are rejected before storage access',async()=>{
 const h=harness();for(const body of [null,[],{...h.body,periodStart:'yesterday'},{...h.body,periodStart:null},{...h.body,revision:'wrong'},{...h.body,action:'configure',cadence:'yearly'},{...h.body,action:'complete',writeId:null}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({...h.body,padding:'한'.repeat(210000)})).status,413);assert.equal((await h.get('lesson=wrong')).status,400);assert.equal(h.calls.length,0);
});
test('period/version conflicts, validation failures and missing rights surface safely without leaking database text',async()=>{
 for(const [message,status] of [['BLOCK_FORBIDDEN',403],['BLOCK_NOT_FOUND',404],['BLOCK_LESSON_LOCKED',403],['ONGOING_PERIOD_CHANGED',409],['ONGOING_ALREADY_COMPLETED',409],['BLOCK_DRAFT_CHANGED',409],['BLOCK_REQUIREMENTS_MISSING',422],['BLOCK_QUIZ_NOT_PASSED',422],['BLOCK_FILE_INVALID',400]]){const h=harness({error:{message}});assert.equal((await h.post({...h.body,action:'complete',writeId:actor})).status,status);}
 const stale=harness({readRevision:lesson});assert.equal((await stale.post(stale.body)).status,409);assert.equal(stale.calls.length,1);
 const failure=harness({error:{message:'postgres://private:secret/other-student-answer'}}),response=await failure.get();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/postgres|secret|other-student/);
});
