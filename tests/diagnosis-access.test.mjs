import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, createHmac } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url), lib = {};
const source = ts.transpileModule(readFileSync(new URL('../lib/diagnosis-access.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('exports','require',source)(lib,require);
const {diagnosisAccessSignature,verifyDiagnosisAccessRequest,parseDiagnosisAccessRequest,authorizeDiagnosisAccess,diagnosisAccessEnvironment}=lib;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={version:1,subject:id(1),attemptId:id(2),sessionId:id(3),releaseId:id(4),packageVersion:'v1',revision:3,purpose:'generate',nonce:id(5)};
const secret='11'.repeat(32), environment='dev', timestamp='1790841600', time=Number(timestamp)*1000;
const body=JSON.stringify(input), env={NEXT_PUBLIC_APP_ENV:'dev',EDU_MYIN_BRIDGE_ENVIRONMENT:'dev',EDU_MYIN_BRIDGE_ORIGIN:'https://dev-server.myinlab.co.kr',EDU_MYIN_BRIDGE_SECRET:secret};

test('reverse HMAC binds direction, body, environment, timestamp, and bounded bytes',()=>{
 assert.equal(diagnosisAccessSignature({body:'{"version":1}',secret,environment,timestamp}),'81f84fb5604eb15929cc96babbae97344d8385015795934d5ea60e99e2d06cbb');
 const signature=diagnosisAccessSignature({body,secret,environment,timestamp});
 const verify=extra=>verifyDiagnosisAccessRequest({body,secret,environment,timestamp,authorization:`Bearer ${signature}`,now:time,...extra});
 assert.equal(verify(),true);assert.equal(verify({body:body+' '}),false);assert.equal(verify({environment:'production'}),false);
 assert.equal(verify({now:time+61000}),false);assert.equal(verify({body:'한'.repeat(22000)}),false);assert.equal(verify({authorization:'Bearer '+signature.toUpperCase()}),false);
 const forward=createHmac('sha256',Buffer.from(secret,'hex')).update(`edu-n6-v1\n${environment}\nPOST\n/api/integrations/edu/diagnosis\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`).digest('hex');
 assert.equal(verify({authorization:`Bearer ${forward}`}),false);
 assert.throws(()=>diagnosisAccessEnvironment({...env,NEXT_PUBLIC_APP_ENV:'production'}));
 assert.throws(()=>diagnosisAccessEnvironment({...env,EDU_MYIN_BRIDGE_ORIGIN:'https://evil.example'}));
 assert.equal(diagnosisAccessEnvironment(env),'dev');
});
test('access commands allow only exact server-owned bindings, never extra caller data',()=>{
 assert.deepEqual(parseDiagnosisAccessRequest(input),input);
 for(const change of [{subject:id(99),extra:1},{version:2},{revision:-1},{revision:2147483648},{purpose:'retry'},{purpose:['read']},{nonce:'bad'},{packageVersion:''},{sessionId:null}])assert.throws(()=>parseDiagnosisAccessRequest({...input,...change}),e=>e.code==='INVALID');
});
test('access observations echo bindings and nonce, expire in 30 seconds, and fail closed on errors',async()=>{
 const data={grantId:id(6),checkedAt:new Date(time).toISOString(),expiresAt:new Date(time+30000).toISOString()};
 let calls=0;const authorize=extra=>authorizeDiagnosisAccess({input,environment,now:()=>time,rpc:async(name,args)=>{calls++;assert.equal(name,'edu_diagnosis_report_access');assert.equal(args.p_subject,input.subject);return{data,error:null};},...extra});
 const response=await authorize();assert.deepEqual(response,{...input,environment,allowed:true,...data});assert.equal(calls,1);
 for(const result of [{data:null,error:null},{data,error:Error('secret')},{data:{...data,grantId:'bad'},error:null},{data:{...data,expiresAt:new Date(time+31000).toISOString()},error:null}])await assert.rejects(authorize({rpc:async()=>result}));
 await assert.rejects(authorize({now:()=>time+30001}),e=>e.code==='UNAVAILABLE');
});

async function fixture(t) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active');create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.query('insert into profiles(id) values($1),($2)',[id(1),id(99)]);
 await db.query("insert into courses values($1,'첫 상품'),($2,'다른 상품')",[id(10),id(11)]);
 await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'v1',$3,true),($4,$5,'v2',$6,true)",[id(12),id(10),id(4),id(13),id(11),id(14)]);
 await db.exec('update edu_diagnosis_control set enabled=true');
 await db.query("insert into orders values($1,$2,'pending'),($3,$2,'pending')",[id(20),id(1),id(21)]);
 await db.query('insert into order_items values($1,$2,$3),($4,$5,$6)',[id(22),id(20),id(10),id(23),id(21),id(11)]);
 await db.query("update orders set status='paid' where id=$1",[id(20)]);
 await db.query("insert into edu_diagnosis_attempts(id,user_id,diagnosis_code,offer_id,state,remote_response_id,remote_revision) values($1,$2,'myin-n6',$3,'in_progress',$4,2)",[id(2),id(1),id(12),id(3)]);
 await db.exec('set role service_role');
 const access=async(overrides={})=>{const v={...input,...overrides};return(await db.query('select edu_diagnosis_report_access($1,$2,$3,$4,$5,$6) data',[v.subject,v.attemptId,v.sessionId,v.releaseId,v.packageVersion,v.revision])).rows[0].data;};
 return{db,access};
}
test('current paid rights yield the pinned grant and recover from lost submit ACK without mutating the attempt',async t=>{
 const {db,access}=await fixture(t), before=(await db.query('select * from edu_diagnosis_attempts')).rows;
 const result=await access();assert.match(result.grantId,/^[a-f0-9-]{36}$/);assert.equal(Date.parse(result.expiresAt)-Date.parse(result.checkedAt),30000);
 assert.deepEqual((await db.query('select * from edu_diagnosis_attempts')).rows,before);
 assert.equal((await db.query('select edu_diagnosis_context($1) data',[id(1)])).rows[0].data.revision,2);
 for(const overrides of [{subject:id(99)},{attemptId:id(99)},{sessionId:id(99)},{releaseId:id(99)},{packageVersion:'v2'},{revision:1}])assert.equal(await access(overrides),null);
 await db.query('update edu_diagnosis_attempts set remote_response_id=null,state=$1',['preparing']);assert.equal(await access(),null);
});
test('refunds and another active N6 purchase cannot authorize the original pinned attempt',async t=>{
 const {db,access}=await fixture(t);
 await db.query("update orders set status='paid' where id=$1",[id(21)]);
 for(const status of ['partially_refunded','refunded','cancelled','pending']){
   await db.query('update orders set status=$1 where id=$2',[status,id(20)]);assert.equal(await access(),null);
   assert.equal((await db.query("select edu_diagnosis_has_access($1,'myin-n6') ok",[id(1)])).rows[0].ok,false);
   await assert.rejects(db.query('select edu_diagnosis_context($1)',[id(1)]),/DIAGNOSIS_FORBIDDEN/);
 }
 await db.query("update orders set status='paid' where id=$1",[id(20)]);assert.ok(await access());
 await db.query("update profiles set status='inactive' where id=$1",[id(1)]);assert.equal(await access(),null);
 await db.query("update profiles set status='active' where id=$1",[id(1)]);
 await db.exec('reset role;update edu_diagnosis_control set enabled=false;set role service_role');assert.equal(await access(),null);
});
test('manual grants must be for the pinned offer and within an active unrevoked access window',async t=>{
 const {db,access}=await fixture(t);
 await db.query("update orders set status='refunded' where id=$1",[id(20)]);
 await db.query("insert into enrollments(id,user_id,course_id,status) values($1,$2,$3,'active')",[id(30),id(1),id(10)]);
 await db.query('insert into edu_diagnosis_grants(user_id,offer_id,enrollment_id) values($1,$2,$3)',[id(1),id(12),id(30)]);
 assert.ok(await access());
 for(const sql of ["access_starts_at='2099-01-01'","access_starts_at='2000-01-01',access_ends_at='2000-01-02'","access_ends_at=null,revoked_at=now()","revoked_at=null,status='revoked'","status='active',order_item_id='00000000-0000-4000-8000-000000000022'"]){await db.exec('update enrollments set '+sql);assert.equal(await access(),null);}
});
test('access RPC is private to service_role and unknown sessions are never rebound',async t=>{
 const {db,access}=await fixture(t);assert.ok(await access());
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(access(),/permission denied/);}
 await db.exec('reset role;set role service_role');assert.equal(await access({sessionId:id(88)}),null);
 assert.equal((await db.query('select remote_response_id from edu_diagnosis_attempts')).rows[0].remote_response_id,id(3));
});
