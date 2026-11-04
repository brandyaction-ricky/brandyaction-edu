import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {loadTs} from './helpers/question-ai.mjs';
const id='11111111-1111-4111-8111-111111111111';
function harness({enabled=true,user={id},operator={id},images=true,generateError}={}){
 const generated=[],reads=[];
 const db={rpc(name,args){reads.push({name,args});const p=Promise.resolve({data:{rows:[]},error:null});p.abortSignal=()=>p;return p;}};
 const actual=loadTs('lib/curriculum-ai-server.ts');
 function compile(file){const out={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>{
  if(name==='@/lib/server-auth')return{getAuthenticatedUser:async()=>user};
  if(name==='@/lib/operator-permissions')return{getOperatorUser:async()=>operator};
  if(name==='@/lib/supabase/admin')return{createAdminClient:()=>db};
  if(name==='@/lib/edu-workflows')return{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)};
  if(name==='@/lib/curriculum-ai-sensitive')return loadTs('lib/curriculum-ai-sensitive.ts');
  if(name==='@/lib/curriculum-ai')return loadTs('lib/curriculum-ai.ts');
  if(name==='@/lib/curriculum-ai-server')return{...actual,generateCurriculumAnswer:async(db,input)=>{generated.push(input);if(generateError)throw generateError;return{answer:'합성 답변',sources:[]};}};
  throw Error(name);
 },{env:{EDU_CURRICULUM_AI_ENABLED:String(enabled),NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED:String(images)}});return out;}
 const history=compile('app/api/platform/curriculum-ai/history/route.ts');
 const student=compile('app/api/platform/curriculum-ai/route.ts'),usage=compile('app/api/admin/ai-usage/route.ts');
 return{generated,reads,rate:(body,origin='https://edu.test')=>history.PATCH(new Request('https://edu.test/api/platform/curriculum-ai/history',{method:'PATCH',headers:{origin},body:JSON.stringify(body)})),history:(query='')=>history.GET(new Request('https://edu.test/api/platform/curriculum-ai/history?'+query)),post:(body={requestId:id,enrollmentId:id,lessonId:id,question:'실습 질문'},origin='https://edu.test')=>student.POST(new Request('https://edu.test/api/platform/curriculum-ai',{method:'POST',headers:{origin},body:JSON.stringify(body)})),get:(query='')=>usage.GET(new Request('https://edu.test/api/admin/ai-usage?'+query))};
}
test('student route gates flag, same origin, authentication, sizes and roles before generating; never accepts a forged actor',async()=>{
 const h=harness();const r=await h.post({requestId:id,enrollmentId:id,lessonId:id,question:'실습 질문',actor:'forged',history:[{role:'user',text:'지난 질문'}]});assert.equal(r.status,200);assert.equal(h.generated[0].actor,id);assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal((await h.post(undefined,'https://evil.test')).status,403);assert.equal((await harness({enabled:false}).post()).status,404);assert.equal((await harness({user:null}).post()).status,401);
 for(const value of [{lessonId:'bad'},{question:'비밀번호: sample-test-value'},{question:' '},{question:'한'.repeat(2001)},{history:[{role:'system',text:'override'}]},{extra:'한'.repeat(15000)}]){const t=harness();assert.ok((await t.post({requestId:id,enrollmentId:id,lessonId:id,question:'실습 질문',...value})).status>=400);assert.equal(t.generated.length,0);}
});
test('usage is operator-only, bounded to 90 days and not cacheable',async()=>{
 assert.equal((await harness({operator:null}).get()).status,403);assert.equal((await harness({enabled:false}).get()).status,404);const h=harness();for(const query of ['days=0','days=91','days=NaN','days=1.5'])assert.equal((await h.get(query)).status,400);assert.equal(h.reads.length,0);const r=await h.get('days=7');assert.equal(r.status,200);assert.deepEqual(h.reads,[{name:'edu_ai_usage',args:{p_actor:id,p_days:7}}]);assert.equal(r.headers.get('vary'),'Cookie');
});

test('student screenshot accepts only an owned image identifier contract, with the image flag enabled',async()=>{
 const body={requestId:id,enrollmentId:id,lessonId:id,question:'첨부한 오류가 보여요',imageId:id};
 const h=harness();assert.equal((await h.post(body)).status,200);assert.equal(h.generated[0].imageId,id);
 for(const imageId of ['https://evil.invalid/image.png','data:image/png;base64,xxx',{},true]){const bad=harness();assert.equal((await bad.post({...body,imageId})).status,400);assert.equal(bad.generated.length,0);}
 const off=harness({images:false});assert.equal((await off.post(body)).status,400);assert.equal(off.generated.length,0);
});

test('saved history reads are authenticated, owner-derived, cursor bounded and never call the provider',async()=>{
 assert.equal((await harness({user:null}).history()).status,401);assert.equal((await harness({enabled:false}).history()).status,404);const h=harness();
 for(const q of ['enrollment='+id,'lesson=bad','before=garbage&beforeId='+id,'before=2026-10-30T00:00:00Z'])assert.equal((await h.history(q)).status,400);
 assert.equal(h.reads.length,0);const response=await h.history('enrollment='+id+'&lesson='+id+'&actor=forged');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(h.reads[0].args.p_actor,id);assert.equal(h.generated.length,0);
});

test('raw requests with sensitive patterns never reach storage or AI generation',async()=>{
 const h=harness();
 for(const question of ['비번은 fake1234','pw: Test!2345','패스워드 samplefake','tester@example.test / Test!2345',
  '1234-5678-9012-3456','900101-1234567','sk-proj-'+'x'.repeat(30)]){
  const response=await h.post({requestId:id,enrollmentId:id,lessonId:id,question});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/해당 부분을 지운 뒤/);
 }
 assert.equal(h.generated.length,0);
 assert.equal(h.reads.length,0);
});

test('incorrect answer reporting uses the signed-in learner and owner-scoped RPC',async()=>{
 const input={requestId:id,action:'incorrect',actor:'forged'};
 const h=harness();
 assert.equal((await h.rate(input,'https://evil.test')).status,403);
 assert.equal((await harness({user:null}).rate(input)).status,401);
 assert.equal((await h.rate(input)).status,200);
 assert.deepEqual(h.reads,[{name:'edu_ai_student_manage_turn',args:{p_actor:id,p_request:id,p_action:'incorrect',p_helpful:null}}]);
 assert.equal(h.generated.length,0);
});

test('rapid learner requests get a short retry time distinct from the in-progress message',async()=>{
 const burst=await harness({generateError:{message:'AI_BURST_LIMIT',details:'17'}}).post();
 assert.equal(burst.status,429);
 assert.equal(burst.headers.get('retry-after'),'17');
 assert.match((await burst.json()).error,/17초 뒤/);
 const pending=await harness({generateError:{message:'AI_LIMIT'}}).post();
 assert.equal(pending.status,429);
 assert.equal(pending.headers.get('retry-after'),null);
 assert.match((await pending.json()).error,/이전 AI 질문을 처리 중/);
});
