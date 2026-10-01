import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111',lesson='22222222-2222-4222-8222-222222222222',revision='33333333-3333-4333-8333-333333333333';
function compile(file, mocks={}) { const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out; }
const blocks=compile('lib/lesson-blocks.ts',{'./lesson-guided-tools':compile('lib/lesson-guided-tools.ts'),'./lesson-calculators':compile('lib/lesson-calculators.ts')});
const document={schemaVersion:1,blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'q',prompt:'시험',options:['가','나'],correctIndex:1}]}},{id:'answer',type:'question',question:{label:'질문',kind:'text',required:true}}],checklist:[]};
function harness({user={id,role:'member'},editable=false,readError=null,saveError=null,current=revision,savedDraft=null,savedSubmission=null}={}) {
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return ['edu_read_lesson_blocks','edu_read_block_submission'].includes(name)?{data:{editable,revision,currentRevision:current,document,draft:savedDraft,submission:savedSubmission,previousDrafts:[]},error:readError}:{data:{writeId:id,revision},error:saveError};}};
 const route=compile('app/api/platform/lesson-blocks/route.ts',{'@/lib/lesson-blocks':blocks,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/alumni-access-server':{assertParticipationOpen:async()=>{}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user}});
 const get=(query=`lesson=${lesson}&enrollment=${id}`)=>route.GET(new Request('https://edu.test/api/platform/lesson-blocks?'+query));
 const post=(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/platform/lesson-blocks',{method:'POST',headers:origin?{origin,'content-type':'application/json'}:{},body:JSON.stringify(body)}));
 const draft={action:'draft',lessonId:lesson,enrollmentId:id,revision,expectedWriteId:null,requestId:id,values:{blocks:{answer:'답변'},checklist:[]}};
 return{get,post,draft,calls};
}
test('unauthenticated and cross-site requests cannot read or change private learning data',async()=>{
 const noUser=harness({user:null});assert.equal((await noUser.get()).status,401);assert.equal((await noUser.post(noUser.draft)).status,401);assert.equal(noUser.calls.length,0);
 const h=harness();for(const origin of [null,'https://other.test'])assert.equal((await h.post(h.draft,origin)).status,403);assert.equal(h.calls.length,0);
});
test('progression reads use the owned enrollment and never trust a caller supplied actor',async()=>{
 const h=harness();assert.equal((await h.get(`action=progression&enrollment=${id}&p_actor=${lesson}`)).status,200);
 assert.equal(h.calls[0].name,'edu_read_lesson_progression');assert.deepEqual(h.calls[0].args,{p_actor:id,p_enrollment:id});
 const bad=harness();assert.equal((await bad.get('action=progression')).status,400);assert.equal(bad.calls.length,0);
 const locked=harness({readError:{message:'BLOCK_LESSON_LOCKED'}});assert.equal((await locked.get()).status,403);
});
test('student JSON omits answer keys; author JSON retains them; responses are never shared-cacheable',async()=>{
 const student=await harness().get();assert.equal(student.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await student.text(),/correctIndex/);
 const admin=await harness({editable:true,user:{id,role:'admin'}}).get(`lesson=${lesson}`);assert.equal((await admin.json()).document.blocks[0].quiz.questions[0].correctIndex,1);
});
test('draft uses session actor, validates against original document and saves only checked fields',async()=>{
 const h=harness();const r=await h.post({...h.draft,p_actor:lesson,userId:lesson});assert.equal(r.status,200);
 assert.equal(h.calls[1].name,'edu_save_block_draft');assert.equal(h.calls[1].args.p_actor,id);assert.deepEqual(h.calls[1].args.p_values,h.draft.values);
 const bad=harness();assert.equal((await bad.post({...bad.draft,values:{blocks:{missing:'injection'},checklist:[]}})).status,400);assert.equal(bad.calls.length,1);
});
test('stale content and other-device saves produce conflicts instead of overwrites',async()=>{
 const stale=harness({current:lesson});assert.equal((await stale.post(stale.draft)).status,409);assert.equal(stale.calls.length,1);
 const other=harness({saveError:{message:'BLOCK_DRAFT_CHANGED'}});const r=await other.post(other.draft);assert.equal(r.status,409);assert.equal((await r.json()).code,'BLOCK_DRAFT_CHANGED');
});
test('quiz is graded on the server using validated choices, not a client-supplied score',async()=>{
 const h=harness();const r=await h.post({...h.draft,action:'grade',blockId:'quiz',values:{blocks:{quiz:{q:1}},checklist:[]},score:0});
 assert.equal(r.status,200);const result=await r.json();assert.equal(result.result.passed,true);assert.doesNotMatch(JSON.stringify(result),/correctIndex|options/);assert.equal(h.calls.length,1);
});
test('malformed requests and unknown database errors never reveal source content or credentials',async()=>{
 const h=harness();assert.equal((await h.post(null)).status,400);assert.equal((await h.get('lesson=wrong')).status,400);
 const denied=harness({readError:{message:'BLOCK_FORBIDDEN'}});assert.equal((await denied.get()).status,403);
 const broken=harness({readError:{message:'db URL secret-and-student-answer'}});const r=await broken.get();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret-and-student-answer/);
});
test('oversized multibyte bodies are rejected before any database operation',async()=>{
 const h=harness();const r=await h.post({...h.draft,padding:'한'.repeat(710000)});assert.equal(r.status,413);assert.equal(h.calls.length,0);
});
test('submission grades saved answers rather than forged client values and uses the session actor',async()=>{
 const good={blocks:{answer:'저장된 답변',quiz:{q:1}},checklist:[]};
 const h=harness({savedDraft:{writeId:id,values:good}});const result=await h.post({...h.draft,action:'submit',writeId:id,userId:lesson,values:{blocks:{},checklist:[]},passed:false});
 assert.equal(result.status,200);assert.equal(h.calls[1].name,'edu_submit_lesson_blocks');assert.equal(h.calls[1].args.p_actor,id);assert.deepEqual(h.calls[1].args.p_values,good);assert.equal(h.calls[1].args.p_request,id);
});
test('missing requirements and changed or absent saved drafts cannot be marked complete',async()=>{
 const blank=harness({savedDraft:{writeId:id,values:{blocks:{},checklist:[]}}});const r=await blank.post({...blank.draft,action:'submit',writeId:id,values:{blocks:{answer:'fake',quiz:{q:1}},checklist:[]},passed:true});
 assert.equal(r.status,422);assert.equal((await r.json()).assessment.ready,false);assert.equal(blank.calls.length,1);
 for(const savedDraft of [null,{writeId:lesson,values:{blocks:{},checklist:[]}}]){
  const h=harness({savedDraft});assert.equal((await h.post({...h.draft,action:'submit',writeId:id})).status,409);assert.equal(h.calls.length,1);
 }
});

test('learner submission history requires its enrollment and never exposes quiz keys',async()=>{
 const h=harness();const result=await h.get(`submission=${id}&enrollment=${id}`);assert.equal(result.status,200);assert.equal(h.calls[0].name,'edu_read_block_submission');assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.calls[0].args.p_enrollment,id);assert.doesNotMatch(await result.text(),/correctIndex/);
 const missing=harness();assert.equal((await missing.get(`submission=${id}`)).status,400);assert.equal(missing.calls.length,0);
});
test('learner reopen is bound to the latest owned submission and cannot impersonate a mentor',async()=>{
 const h=harness({savedSubmission:{id}});const result=await h.post({...h.draft,action:'reopen',submissionId:id,expectedStateId:id,decision:'approved',p_actor:lesson});
 assert.equal(result.status,200);assert.equal(h.calls[1].name,'edu_decide_lesson_blocks');assert.equal(h.calls[1].args.p_actor,id);assert.equal(h.calls[1].args.p_decision,'reopened');assert.equal(h.calls[1].args.p_feedback,'');
 const stale=harness();assert.equal((await stale.post({...stale.draft,action:'reopen',submissionId:id,expectedStateId:id})).status,409);assert.equal(stale.calls.length,1);
});
