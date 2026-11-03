import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
function harness({enabled=true,images=false,hub=false,user={id},operator=true,error=null}={}){
 const calls=[],out={};const source=ts.transpileModule(fs.readFileSync(new URL('../app/api/platform/question-thread/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require','process',source)(out,name=>({
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{ok:true},error};},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{enrollment_id:null},error:null})})})},
  '@/lib/alumni-access-server':{assertParticipationOpen:async()=>{}},
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'members');return operator?user:null;}},
  '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)},
 })[name],{env:{NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED:enabled?'true':'false',NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED:images?'true':'false',NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED:hub?'true':'false'}});
 const get=(q='question='+id)=>out.GET(new Request('https://edu.test/api/platform/question-thread?'+q));
 const post=(body,origin='https://edu.test')=>out.POST(new Request('https://edu.test/api/platform/question-thread',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}));
 return{calls,get,post,body:{action:'answer',questionId:id,requestId:id,expectedHeadId:null,content:'새 답변'}};
}
test('thread endpoints respect disabled feature, authenticated reads, operator-only same-origin writes and server actor identity',async()=>{
 const off=harness({enabled:false});assert.equal((await off.get()).status,404);assert.equal(off.calls.length,0);
 assert.equal((await harness({user:null}).get()).status,401);const student=harness({operator:false});assert.equal((await student.get()).status,200);assert.equal((await student.post(student.body)).status,403);
 const h=harness();for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,origin)).status,403);assert.equal((await h.post({...h.body,actor:'forged'})).status,200);assert.equal(h.calls[0].args.p_actor,id);
 assert.equal(h.calls[0].name,'edu_add_question_answer');assert.equal(h.calls[0].args.p_expected_head,null);
});
test('malformed cursor, IDs, content, action and byte-overflow requests never access the DB',async()=>{
 const h=harness();for(const q of ['question=bad','question='+id+'&before=0','question='+id+'&before=NaN','question='+id+'&before=9999999999999999999'])assert.equal((await h.get(q)).status,400);
 for(const b of [{...h.body,content:' '},{...h.body,content:'가'.repeat(10001)},{...h.body,expectedHeadId:undefined},{...h.body,requestId:'bad'},{...h.body,action:'delete'}])assert.equal((await h.post(b)).status,400);
 assert.equal((await h.post({...h.body,padding:'가'.repeat(20000)})).status,413);assert.equal(h.calls.length,0);
});
test('reads are private and resolving a question never calls the answer write RPC',async()=>{
 const h=harness(),res=await h.get('question='+id+'&before=123');assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('vary'),'Cookie');assert.equal(h.calls[0].args.p_before,'123');
 assert.equal((await h.post({action:'resolve',questionId:id})).status,200);assert.equal(h.calls[1].name,'edu_resolve_question');
});
test('conflicts and missing questions are explicit while unknown database failures hide private details',async()=>{
 for(const [message,status] of [['QUESTION_CHANGED',409],['QUESTION_NOT_FOUND',404],['BLOCK_FORBIDDEN',403],['MESSAGE_FORBIDDEN',403]]){const h=harness({error:{message}});assert.equal((await h.get()).status,status);}
 const h=harness({error:{message:'secret SQL private answer'}}),r=await h.post(h.body);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret SQL private answer/);
});
test('authenticated learner followups use ownership-checked RPC while operator answers and resolve remain restricted',async()=>{
 const h=harness({operator:false}),body={...h.body,action:'followup',actor:'forged'};
 assert.equal((await h.post(body)).status,200);assert.equal(h.calls[0].name,'edu_add_question_followup');assert.equal(h.calls[0].args.p_actor,id);
 assert.equal((await h.post({...body,action:'resolve'})).status,403);assert.equal((await h.post(h.body)).status,403);assert.equal((await h.post(body,'https://evil.test')).status,403);
 assert.equal((await h.post({...body,expectedHeadId:undefined})).status,400);assert.equal((await h.post({...body,content:' '})).status,400);assert.equal(h.calls.length,1);
 assert.equal((await harness({user:null}).post(body)).status,401);assert.equal((await harness({enabled:false}).post(body)).status,404);
});

test('answer deletion requires operator, same origin, IDs and head; never trusts supplied actor',async()=>{
 const h=harness(),body={action:'delete',questionId:id,answerId:id,expectedHeadId:id,actor:'forged'};
 assert.equal((await h.post(body)).status,200);assert.deepEqual(h.calls,[{name:'edu_delete_question_answer',args:{p_actor:id,p_question:id,p_answer:id,p_expected_head:id}}]);
 assert.equal((await harness({operator:false}).post(body)).status,403);
 for(const b of [{...body,answerId:'bad'},{...body,expectedHeadId:undefined}])assert.equal((await h.post(b)).status,400);
 assert.equal((await h.post(body,'https://evil.test')).status,403);assert.equal(h.calls.length,1);
});

test('answer attachments require image capability, remain operator-only, and use atomic image RPC for manual and assist replies',async()=>{
 const off=harness();assert.equal((await off.post({...off.body,imageId:id})).status,400);assert.equal(off.calls.length,0);
 const h=harness({images:true,hub:true});await h.get();assert.equal(h.calls[0].name,'edu_read_question_thread_with_images');
 for(const extra of [{},{assistJobId:id}]){assert.equal((await h.post({...h.body,imageId:id,...extra})).status,200);assert.equal(h.calls.at(-1).name,'edu_add_question_answer_with_image');assert.equal(h.calls.at(-1).args.p_image,id);assert.equal(h.calls.at(-1).args.p_assist_job,extra.assistJobId||null);}
 const student=harness({images:true,operator:false});assert.equal((await student.post({...student.body,imageId:id})).status,403);assert.equal((await student.post({...student.body,action:'followup',imageId:id})).status,400);assert.equal(student.calls.length,0);
 const invalid=harness({images:true});for(const extra of [{imageId:'bad'},{imageId:id,action:'resolve'},{imageId:id,assistJobId:id}])assert.equal((await invalid.post({...invalid.body,...extra})).status,400);assert.equal(invalid.calls.length,0);
});
