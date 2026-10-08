import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url), modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {}; modules.set(name,exports);
  const code = ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(exports,n=>n.startsWith('./')?load(n.slice(2)):require(n)); return exports;
}
const {createDiagnosisAutosave}=load('diagnosis-autosave');
const {sendDiagnosisCommand,diagnosisBridgeHeaders,validateDiagnosisSession}=load('diagnosis-bridge');
const {runDiagnosisSession}=load('diagnosis-session-service');
const {diagnosisQuestionAnswered,diagnosisMissingQuestions}=load('diagnosis-session');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={attemptId:id(1),subject:id(2),releaseId:id(3),responseId:null,packageVersion:'v1',state:'preparing'};
const survey={code:'needs6_n30',version:'fixture',title:'합성 검사',coreQuestionCount:1,questions:[{id:id(10),code:'fixture',text:'합성 문항',type:'single_choice',section:'합성',required:true,core:true,pickExactly:null,exclusiveOptionIds:[],confirmationOptionId:null,reconfirmInstructions:false,placeholder:'',pair:null,options:[{id:id(11),label:'합성 선택'}]}]};
const remote={version:1,...context,responseId:id(4),state:'in_progress',revision:0,answers:[],submittedAt:null,needsReview:false,survey};
const env={NEXT_PUBLIC_APP_ENV:'dev',EDU_MYIN_BRIDGE_ENVIRONMENT:'dev',EDU_MYIN_BRIDGE_ORIGIN:'https://dev-server.myinlab.co.kr',EDU_MYIN_BRIDGE_SECRET:'11'.repeat(32)};

test('autosave serializes edits made during a request and never discards the latest snapshot',async()=>{
  let resolve;const calls=[];
  const a=createDiagnosisAutosave({revision:0,onState(){},save:async(r,answers)=>{calls.push([r,answers]);if(calls.length===1)await new Promise(done=>resolve=done);return{revision:r+1};}});
  a.update([{questionId:id(10),value:'first'}]);const saving=a.flush();
  a.update([{questionId:id(10),value:'latest'}]);resolve();await saving;
  assert.deepEqual(calls.map(([r,a])=>[r,a[0].value]),[[0,'first'],[1,'latest']]);assert.equal(a.dirty,false);assert.equal(a.revision,2);
});
test('unknown save outcome replays the exact pending write before sending newer edits',async()=>{
  const calls=[];let fail=true;
  const a=createDiagnosisAutosave({revision:0,onState(){},save:async(r,answers)=>{calls.push([r,answers]);if(fail){fail=false;throw Error('reply lost');}return{revision:r+1};}});
  a.update([{questionId:id(10),value:'first'}]);await assert.rejects(a.flush());a.update([{questionId:id(10),value:'latest'}]);await a.flush();
  assert.deepEqual(calls.map(([r,a])=>[r,a[0].value]),[[0,'first'],[0,'first'],[1,'latest']]);assert.equal(a.dirty,false);
});
test('conflicting device changes pause autosave until the user chooses to reload',async()=>{
  let writes=0;const a=createDiagnosisAutosave({revision:0,onState(){},save:async()=>{writes++;throw Object.assign(Error('conflict'),{code:'CONFLICT'});}});
  a.update([{questionId:id(10),value:'local'}]);await assert.rejects(a.flush());await assert.rejects(a.flush());assert.equal(writes,1);assert.equal(a.dirty,true);
});
test('bridge signs a bounded private request, rejects redirects, foreign identity, and cross-environment routing',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://dev-server.myinlab.co.kr/api/integrations/edu/diagnosis');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/);return Response.json(remote);};
  assert.equal((await sendDiagnosisCommand(context,{action:'ensure'},{env,fetcher})).responseId,id(4));
  await assert.rejects(sendDiagnosisCommand(context,{action:'read'},{env:{...env,NEXT_PUBLIC_APP_ENV:'production'},fetcher}));assert.equal(calls,1);
  await assert.rejects(sendDiagnosisCommand(context,{action:'read'},{env,fetcher:async()=>Response.json({...remote,subject:id(99)})}));
  await assert.rejects(sendDiagnosisCommand(context,{action:'read'},{env,fetcher:async()=>Response.json({code:'CONFLICT'},{status:409})}),e=>e.code==='CONFLICT');
  assert.equal(diagnosisBridgeHeaders('{"version":1}','11'.repeat(32),'dev','1790838000').Authorization,'Bearer b0b8f5434ac0e8b8856726a9f8f2773b692e7b4b7a077a39f04e3cea24e72fe5');
});
test('the public bridge DTO strips scoring extras and rejects mixed answers and impossible states',()=>{
  const extra=structuredClone(remote);extra.survey.rawScores={private:true};extra.survey.questions[0].facetId='private';extra.survey.questions[0].options[0].score=5;
  assert.doesNotMatch(JSON.stringify(validateDiagnosisSession(extra,context)),/rawScores|facetId|score/);
  for(const change of [{answers:[{questionId:id(10),optionId:id(99)}]},{answers:[{questionId:id(10),optionId:id(11),rawScore:5}]},{state:'submitted',submittedAt:null},{needsReview:true}])assert.throws(()=>validateDiagnosisSession({...remote,...change},context));
});

test('bridge preserves only a valid instructed option and resumed wrong checks remain unanswered',()=>{
  const data=structuredClone(remote),question=data.survey.questions[0];
  question.requiredOptionId=id(11);
  const session=validateDiagnosisSession(data,context);
  assert.equal(session.survey.questions[0].requiredOptionId,id(11));
  assert.equal(validateDiagnosisSession(remote,context).survey.questions[0].requiredOptionId,null);
  assert.equal(diagnosisQuestionAnswered(question,{questionId:question.id,optionId:id(12)}),false);
  assert.equal(diagnosisQuestionAnswered(question,{questionId:question.id,optionId:id(11)}),true);
  assert.equal(diagnosisMissingQuestions(session,[{questionId:question.id,optionId:id(12)}])[0].id,question.id);
  for(const invalid of [id(99),false,0,'',{}]){
    question.requiredOptionId=invalid;
    assert.throws(()=>validateDiagnosisSession(data,context));
  }
  question.requiredOptionId=id(11);question.type='multi_choice';
  assert.throws(()=>validateDiagnosisSession(data,context));
});

async function database(t) {
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table profiles(id uuid primary key,status text default 'active');create table courses(id uuid primary key,title text);
    create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
    create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
    create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
    grant select,insert,update on all tables in schema public to service_role;`);
  for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into profiles(id) values($1)',[id(2)]);await db.query("insert into courses values($1,'합성 상품')",[id(5)]);
  await db.query("insert into edu_diagnosis_offers(course_id,package_version,release_id,enabled) values($1,'v1',$2,true)",[id(5),id(3)]);
  await db.exec('update edu_diagnosis_control set enabled=true');await db.query("insert into orders values($1,$2,'pending')",[id(6),id(2)]);await db.query('insert into order_items values($1,$2,$3)',[id(7),id(6),id(5)]);
  await db.exec('set role service_role');
  const rpc=async(name,args)=>{try{return {data:(await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) data`,Object.values(args))).rows[0].data};}catch(error){return{error};}};
  const actor={id:id(2),full_name:'합성 수강생'};
  let result={...remote};const sends=[];
  const send=async(ctx,body)=>{sends.push([ctx,body]);return{...result};};
  const run=input=>runDiagnosisSession({actor,rpc,send},input);
  const paid=()=>db.query("update orders set status='paid' where id=$1",[id(6)]);
  return{db,rpc,run,paid,sends,actor,send,setRemote:r=>result={...result,...r}};
}
test('only eligible products appear; start/resume uses the authenticated account and first attempt',async t=>{
  const h=await database(t);assert.deepEqual((await h.run({action:'read'})).offers,[]);await h.paid();
  assert.equal((await h.run({action:'read'})).offers[0].courseId,id(5));
  await h.run({action:'ensure',courseId:id(5)});assert.equal(h.sends[0][0].subject,id(2));assert.equal(h.sends[0][1].displayName,'합성 수강생');
  const current=await h.run({action:'read'});assert.equal(current.state,'in_progress');assert.equal(current.subject,undefined);assert.equal(current.responseId,undefined);
  await h.run({action:'ensure',courseId:id(5)});assert.equal(h.sends[0][0].attemptId,h.sends[2][0].attemptId);
  assert.equal((await h.db.query('select count(*) n from edu_diagnosis_attempts')).rows[0].n,1);
  await assert.rejects(h.run({action:'save',revision:0,answers:[],subject:id(99)}),e=>e.code==='INVALID');
});
test('revocation during a remote request denies its reply; submitted state never regresses on late responses',async t=>{
  const h=await database(t);await h.paid();await h.run({action:'ensure',courseId:id(5)});
  h.setRemote({state:'submitted',revision:1,submittedAt:'2026-10-01T00:00:00Z'});await h.run({action:'submit',revision:1});
  h.setRemote({state:'in_progress',revision:0,submittedAt:null});await assert.rejects(h.run({action:'read'}),e=>e.code==='CONFLICT');
  await assert.rejects(runDiagnosisSession({actor:h.actor,rpc:h.rpc,send:async()=>{await h.db.query("update orders set status='refunded'");return {...remote,state:'submitted',revision:1};}},{action:'read'}),e=>e.code==='FORBIDDEN');
});
test('manual access cannot start early or outlive its enrollment window',async t=>{
  const h=await database(t);await h.db.query("insert into enrollments(id,user_id,course_id,status,access_starts_at) values($1,$2,$3,'active','2099-01-01')",[id(8),id(2),id(5)]);
  assert.deepEqual((await h.run({action:'read'})).offers,[]);await assert.rejects(h.run({action:'ensure',courseId:id(5)}),e=>e.code==='FORBIDDEN');
  await h.db.exec("update enrollments set access_starts_at='2000-01-01'");await h.run({action:'ensure',courseId:id(5)});
  await h.db.exec("update enrollments set access_ends_at='2000-01-02'");await assert.rejects(h.run({action:'read'}),e=>e.code==='FORBIDDEN');
});

test('admin restart is server-owned and stale tabs cannot write to a new attempt',async()=>{
 let current={...context,responseId:id(4),adminTest:true,canRestart:true},writes=0;
 const actor={id:id(2),role:'admin',full_name:'관리자 검수'};
 const rpc=async(name,args)=>{
  if(name==='edu_diagnosis_context')return{data:current};
  if(name==='edu_diagnosis_restart'){
   assert.equal(args.p_attempt,id(1));current={...current,attemptId:id(80),responseId:null};return{data:{id:id(80)}};
  }
  return{data:true};
 };
 const send=async(ctx,cmd)=>{writes++;if(cmd.action==='ensure')assert.equal(cmd.adminTest,true);return{...remote};};
 const run=(input,owner=actor)=>runDiagnosisSession({actor:owner,rpc,send},input);
 for(const role of ['student','staff'])await assert.rejects(run({action:'restart',attemptId:id(1)},{...actor,role}),e=>e.code==='FORBIDDEN');
 await assert.rejects(run({action:'ensure',adminTest:true}),e=>e.code==='INVALID');assert.equal(writes,0);
 const fresh=await run({action:'restart',attemptId:id(1)});assert.equal(fresh.attemptId,id(80));assert.equal(fresh.adminTest,true);assert.equal(fresh.canRestart,true);
 for(const action of ['save','submit'])for(const attemptId of [id(1),undefined]){
  await assert.rejects(run({action,revision:0,...(action==='save'?{answers:[]}:{}),...(attemptId?{attemptId}:{})}),e=>e.code==='CONFLICT');
 }
 assert.equal(writes,1);
 await run({action:'save',revision:0,answers:[],attemptId:id(80)});assert.equal(writes,2);
 await assert.rejects(run({action:'read'},{...actor,role:'staff'}),e=>e.code==='FORBIDDEN');
 const before=writes;
 await assert.rejects(runDiagnosisSession({actor,send,rpc:async name=>name==='edu_diagnosis_restart'?{data:{id:id(99)}}:{data:current}},{action:'restart',attemptId:id(80)}),e=>e.code==='CONFLICT');
 assert.equal(writes,before);
});

test('release pause is reported without creating a remote session',async()=>{
 let sent=0;
 for(const action of ['ensure','restart']){
  const rpc=async name=>name==='edu_diagnosis_context'?{data:action==='restart'?{...context,adminTest:true}:null}:{data:null,error:{message:'DIAGNOSIS_STARTS_PAUSED'}};
  await assert.rejects(runDiagnosisSession({actor:{id:id(2),role:'admin'},rpc,send:async()=>{sent++;}},
   action==='ensure'?{action,courseId:id(9)}:{action,attemptId:id(1)}),e=>e.code==='STARTS_PAUSED'&&e.status===503);
 }
 assert.equal(sent,0);
});
