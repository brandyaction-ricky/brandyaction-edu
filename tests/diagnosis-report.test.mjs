import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const e={};modules.set(name,e);const source=ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',source)(e,n=>n.startsWith('./')?load(n.slice(2)):require(n));return e;}
const {diagnosisReportHeaders,sendDiagnosisReportCommand,validateDiagnosisReport}=load('diagnosis-report');
const {runDiagnosisReport}=load('diagnosis-report-service');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={attemptId:id(1),subject:id(2),releaseId:id(3),responseId:id(4),packageVersion:'v1',state:'submitted',revision:8};
const env={NEXT_PUBLIC_APP_ENV:'dev',EDU_MYIN_BRIDGE_ENVIRONMENT:'dev',EDU_MYIN_BRIDGE_ORIGIN:'https://dev-server.myinlab.co.kr',EDU_MYIN_BRIDGE_SECRET:'11'.repeat(32)};
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const remote={version:1,...context,state:'ready',updatedAt:'2026-10-01T00:00:00.000Z',reportId:id(5),canRetry:false,downloadAvailable:true,markdown:'# 합성 결과\n\n나의 검사 결과',sha256:sha('# 합성 결과\n\n나의 검사 결과')};

test('report HMAC has a distinct fixed domain and requests stay pinned to the configured environment',async()=>{
  let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://dev-server.myinlab.co.kr/api/integrations/edu/diagnosis/report');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['version','action','subject','attemptId','responseId','releaseId','packageVersion']);assert.equal(body.action,'status');return Response.json(remote);};
  const result=await sendDiagnosisReportCommand(context,'status',{env,fetcher});assert.equal(result.state,'ready');assert.equal(result.markdown,undefined);
  for(const changes of [{NEXT_PUBLIC_APP_ENV:'production'},{EDU_MYIN_BRIDGE_ORIGIN:'https://attacker.test'},{EDU_MYIN_BRIDGE_SECRET:'bad'}])await assert.rejects(sendDiagnosisReportCommand(context,'status',{env:{...env,...changes},fetcher}));
  assert.equal(calls,1);
  const signature=diagnosisReportHeaders('{"version":1}','11'.repeat(32),'dev','1790838000').Authorization;
  assert.equal(signature,'Bearer 4ae0cf76a26b94b95da7a1a4c6ec8649c65b2545ca0aeeb34feb3d5039925ee4');
  assert.notEqual(signature,load('diagnosis-bridge').diagnosisBridgeHeaders('{"version":1}','11'.repeat(32),'dev','1790838000').Authorization);
  assert.match(signature,/^Bearer [a-f0-9]{64}$/);
});
test('report identity, package, revision and immutable file hash fail closed',()=>{
  for(const patch of [{subject:id(9)},{attemptId:id(9)},{responseId:id(9)},{releaseId:id(9)},{packageVersion:'foreign'},{revision:7},{revision:-1},{version:2},{updatedAt:'yesterday'},{reportId:null},{canRetry:true},{downloadAvailable:false},{sha256:'0'.repeat(64)},{markdown:remote.markdown+'changed'}])assert.throws(()=>validateDiagnosisReport({...remote,...patch},context,'download'),e=>e.code==='UNAVAILABLE');
  for(const state of ['queued','processing','needs_review','access_denied']){
    const pending={...remote,state,reportId:null,downloadAvailable:false};assert.equal(validateDiagnosisReport(pending,context,'status').state,state);assert.throws(()=>validateDiagnosisReport(pending,context,'download'));
  }
  assert.equal(validateDiagnosisReport({...remote,revision:9},context,'download').revision,9);
});
test('MD files larger than 512 KiB work, with independent 2 MiB UTF-8 and 3 MiB wire limits',async()=>{
  const markdown='한'.repeat(250000);assert.ok(Buffer.byteLength(markdown)>524288);
  const result=await sendDiagnosisReportCommand(context,'download',{env,fetcher:async()=>Response.json({...remote,markdown,sha256:sha(markdown)})});assert.equal(result.markdown,markdown);
  const oversized='한'.repeat(700000);await assert.rejects(sendDiagnosisReportCommand(context,'download',{env,fetcher:async()=>Response.json({...remote,markdown:oversized,sha256:sha(oversized)})}));
  let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(3*1024*1024+1));},cancel(){cancelled=true;}});
  await assert.rejects(sendDiagnosisReportCommand(context,'download',{env,fetcher:async()=>new Response(body)}));assert.equal(cancelled,true);
});
test('status does not leak raw internals and remote errors cannot disclose their response bodies',async()=>{
  const result=validateDiagnosisReport({...remote,rawScores:{private:true},internalPolicy:'secret'},context,'status');assert.doesNotMatch(JSON.stringify(result),/rawScores|internalPolicy|markdown|sha256/);
  for(const [status,data,code] of [[403,{code:'FORBIDDEN'},'FORBIDDEN'],[409,{code:'NOT_READY'},'NOT_READY'],[500,{error:'customer answer secret'},'UNAVAILABLE']])await assert.rejects(sendDiagnosisReportCommand(context,'download',{env,fetcher:async()=>Response.json(data,{status})}),e=>e.code===code&&!e.message.includes('secret'));
});
test('service checks current rights twice and never accepts caller-owned report identifiers',async()=>{
  let contexts=0,sends=0;const rpc=async(name,args)=>{assert.equal(name,'edu_diagnosis_context');assert.deepEqual(args,{p_actor:id(2)});contexts++;return{data:context,error:null};};
  const deps={actor:{id:id(2)},rpc,send:async()=>{sends++;return remote;}};
  const result=await runDiagnosisReport(deps,'download');assert.equal(contexts,2);assert.equal(sends,1);assert.deepEqual(Object.keys(result),['state','updatedAt','canRetry','downloadAvailable','markdown']);
  await assert.rejects(runDiagnosisReport({...deps,actor:{id:id(9)},rpc:async()=>({data:context,error:null})},'status'),e=>e.code==='NOT_READY');
  await assert.rejects(runDiagnosisReport(deps,'retry'),e=>e.code==='INVALID');
  let count=0;await assert.rejects(runDiagnosisReport({...deps,rpc:async()=>({data:++count===1?context:{...context,packageVersion:'changed'},error:null})},'download'),e=>e.code==='FORBIDDEN');
});
test('a lost submission acknowledgment can still read the frozen remote report; stale remote revisions cannot',async()=>{
  const rpc=async()=>({data:{...context,state:'in_progress',revision:7},error:null});
  assert.equal((await runDiagnosisReport({actor:{id:id(2)},rpc,send:async()=>remote},'status')).state,'ready');
  let count=0;await assert.rejects(runDiagnosisReport({actor:{id:id(2)},rpc:async()=>({data:{...context,revision:++count===1?7:9},error:null}),send:async()=>remote},'download'),e=>e.code==='UNAVAILABLE');
});
test('a real refund during the remote download prevents release of the report',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table profiles(id uuid primary key,status text default 'active');create table courses(id uuid primary key,title text);
    create table orders(id uuid primary key,user_id uuid references profiles(id),status text);create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
    create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
    grant select,insert,update on all tables in schema public to service_role;`);
  for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.query('insert into profiles(id) values($1)',[id(2)]);await db.query("insert into courses values($1,'합성 상품')",[id(10)]);
  await db.query("insert into edu_diagnosis_offers(course_id,package_version,release_id,enabled) values($1,'v1',$2,true)",[id(10),id(3)]);
  await db.exec('update edu_diagnosis_control set enabled=true');await db.query("insert into orders values($1,$2,'paid')",[id(11),id(2)]);await db.query('insert into order_items values($1,$2,$3)',[id(12),id(11),id(10)]);
  await db.exec('set role service_role');
  const rpc=async(name,args)=>{try{return{data:(await db.query(`select ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) data`,Object.values(args))).rows[0].data,error:null};}catch(error){return{error};}};
  const begin=await rpc('edu_diagnosis_begin',{p_actor:id(2),p_course:id(10)});assert.equal(begin.error,null);
  const attempt=(await rpc('edu_diagnosis_context',{p_actor:id(2)})).data.attemptId;
  await rpc('edu_diagnosis_sync_session',{p_actor:id(2),p_attempt:attempt,p_response:id(4),p_revision:8,p_state:'submitted'});
  await assert.rejects(runDiagnosisReport({actor:{id:id(2)},rpc,send:async()=>{await db.query("update orders set status='refunded' where id=$1",[id(11)]);return{...remote,attemptId:attempt};}},'download'),e=>e.code==='FORBIDDEN');
});
