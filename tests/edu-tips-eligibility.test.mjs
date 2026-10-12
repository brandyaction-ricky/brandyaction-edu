import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {fixture,id,customer,epoch} from './helpers/edu-tips-erasure.mjs';
const require=createRequire(import.meta.url), api={};
const schema=JSON.parse(readFileSync(new URL('../lib/edu-tips-eligibility.schema.json',import.meta.url)));
const code=ts.transpileModule(readFileSync(new URL('../lib/edu-tips-eligibility-http.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function('exports','require',code)(api,n=>n.endsWith('.schema.json')?schema:require(n));
const hash=x=>createHash('sha256').update(x).digest('hex');
const key='synthetic-eligibility-development-key-00000', second='synthetic-eligibility-second-key-00000000', prod='synthetic-eligibility-production-key-00000';
const subjects=[5,6].map(n=>({customer_id:customer(n),consent_epoch:epoch(n)}));
async function setup(t){
 const f=await fixture(t,['20261010080829_edu_tips_erasure_http_v2.sql','20261012014228_edu_tips_eligibility_v2.sql']);
 for(const n of [5,6]){
  await f.owner('insert into profiles(id) values($1)',[id(n)]);
  await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(n),id(10+n)]);
  await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(n),customer(n),epoch(n),id(10+n)]);
 }
 for(const [token,n]of [[key,90],[second,90],[prod,91]])await f.owner("insert into edu_tips_private.eligibility_keys values($1,$2,'edu.eligibility.check','2099-01-01',null)",[hash(token),id(n)]);
 const env={EDU_TIPS_ELIGIBILITY_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development',EDU_EXPORT_V1_ENABLED:'false',EDU_TIPS_ERASURE_API_ENABLED:'false'};
 const rpc=async(args)=>{try{return {data:await f.value('select edu_tips_check_eligibility($1,$2,$3::jsonb) as v',[args.p_key_hash,args.p_environment,JSON.stringify(args.p_subjects)]),error:null};}catch(e){return {data:null,error:{message:e.message}};}};
 const call=async(options={})=>{
  const {token=key,body={subjects},query='',method='POST',environment=env,rpcOverride=rpc,headers={}}=options;
  const r=new Request('https://synthetic.invalid/api/internal/export/v2/eligibility/check'+query,{method,
   headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const res=await api.handleEligibility(r,{env:environment,rpc:rpcOverride});return {status:res.status,headers:res.headers,body:await res.json()};
 };
 return {...f,env,rpc,call};
}
test('current explicit analysis AND overseas consent is required; unknown identities and epochs are uniformly denied',async t=>{
 const f=await setup(t);const rows=[subjects[1],{...subjects[0],consent_epoch:epoch(99)},subjects[0],{customer_id:customer(99),consent_epoch:epoch(99)}];
 const res=await f.call({body:{subjects:rows}});assert.equal(res.status,200);
 assert.deepEqual(res.body.results.map(x=>x.eligible),[true,false,true,false]);
 assert.deepEqual(res.body.results.map(x=>x.customer_id),rows.map(x=>x.customer_id));
 assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('x-contract-version'),'2.0.0-rc.2');
 await f.owner('update edu_personalization_preferences set analysis=false where member_id=$1',[id(5)]);
 assert.deepEqual((await f.call()).body.results.map(x=>x.eligible),[false,true]);
 assert.equal((await f.call()).body.results[0].generation,2);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)',[customer(5)]),1);
});
test('advertising-only revision changes do not revoke analysis; withdrawn identities can never reactivate',async t=>{
 const f=await setup(t);
 await f.owner('update edu_personalization_preferences set revision=$2 where member_id=$1',[id(5),id(500)]);
 assert.equal((await f.call()).body.results[0].eligible,true);
 await f.owner('update edu_personalization_preferences set overseas=false where member_id=$1',[id(5)]);
 await f.owner('update edu_personalization_preferences set overseas=true where member_id=$1',[id(5)]);
 const res=await f.call();assert.equal(res.body.results[0].eligible,false);assert.equal(res.body.results[0].generation,2);
 await assert.rejects(()=>f.owner('update edu_tips_private.subjects set retired_at=null where customer_id=$1',[customer(5)]),/TIPS_IDENTITY_CONFLICT/);
 await assert.rejects(()=>f.owner('update edu_tips_private.subjects set control_generation=1 where customer_id=$1',[customer(5)]),/TIPS_IDENTITY_CONFLICT/);
});
test('current profile, current effective terms and all prior unresolved erasures are checked each time',async t=>{
 const f=await setup(t);
 await f.owner("update profiles set role='admin' where id=$1",[id(5)]);
 assert.equal((await f.call()).body.results[0].eligible,false);
 await f.owner("update edu_personalization_terms set is_current=false where version='v1'");
 assert.equal((await f.call()).body.results[1].eligible,false);
 assert.equal((await f.call()).body.results[1].generation,2);
 await f.owner('update profiles set is_internal=true where id=$1',[id(6)]);
 assert.equal((await f.call()).body.results[1].eligible,false);
});
test('member deletion preserves denial and increasing retirement generation without exposing member identifiers',async t=>{
 const f=await setup(t);await f.owner('delete from profiles where id=$1',[id(5)]);
 const res=await f.call();assert.equal(res.body.results[0].eligible,false);assert.equal(res.body.results[0].generation,2);assert.equal(res.body.results[1].eligible,true);
 assert.ok(!JSON.stringify(res.body).includes(id(5)));
});
test('an unresolved previous epoch blocks a current identity; RPC input validation rejects scalars and extra fields',async t=>{
 const f=await setup(t);
 await f.owner("insert into edu_tips_private.subjects(member_id,customer_id,consent_epoch,wording_version,consent_revision,created_at,retired_at) values($1,$2,$3,'v1',$4,now()-interval '1 hour',now())",[id(5),customer(70),epoch(70),id(700)]);
 await f.owner("insert into edu_tips_private.erasure_outbox(subject_id,reason) select id,'consent_withdrawn' from edu_tips_private.subjects where customer_id=$1",[customer(70)]);
 assert.deepEqual((await f.call()).body.results.map(x=>x.eligible),[false,true]);
 for(const items of [[null],[3],[{...subjects[0],extra:'forbidden'}],[],null]){
  const res=await f.rpc({p_key_hash:hash(key),p_environment:'dev',p_subjects:items});assert.equal(res.error,null);assert.equal(res.data.error,'invalid_request');
 }
});
test('foreign environment, expired/revoked keys and deletion-only credentials cannot authorize eligibility',async t=>{
 const f=await setup(t);assert.equal((await f.call({token:prod})).status,401);
 assert.equal((await f.call({token:'unknown-eligibility-key-000000000000'})).status,401);
 await f.owner('update edu_tips_private.eligibility_keys set expires_at=now()-interval \'1 day\' where key_hash=$1',[hash(key)]);
 assert.equal((await f.call()).status,401);
 await f.owner('update edu_tips_private.eligibility_keys set revoked_at=now() where key_hash=$1',[hash(second)]);
 assert.equal((await f.call({token:second})).status,401);
 const erasure='synthetic-erasure-only-key-0000000000000';
 await f.owner("insert into edu_tips_private.erasure_keys(key_hash,consumer_id,scopes,expires_at) values($1,$2,array['edu.erasure.read'],'2099-01-01')",[hash(erasure),id(90)]);
 assert.equal((await f.call({token:erasure})).status,401);
});
test('all eligibility keys share a consumer rate limit, independently of erasure; public roles have no table or RPC access',async t=>{
 const f=await setup(t);await f.owner("insert into edu_tips_private.eligibility_rate_limits values($1,date_trunc('minute',now()),119)",[id(90)]);
 assert.equal((await f.call()).status,200);const res=await f.call({token:second});assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'60');
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_rate_limits'),0);
 await f.db.exec('reset role;set role anon');
 await assert.rejects(()=>f.db.query("select edu_tips_check_eligibility('x','dev','[]'::jsonb)"),/permission denied/);
 await assert.rejects(()=>f.db.query('select * from edu_tips_private.eligibility_keys'),/permission denied/);
});
test('disabled, invalid input and malformed upstream responses never permit analysis or reveal diagnostics',async t=>{
 const f=await setup(t);assert.equal((await f.call({environment:{...f.env,EDU_TIPS_ELIGIBILITY_API_ENABLED:undefined},rpcOverride:()=>{throw Error('must not call');}})).status,503);
 assert.equal((await f.call({environment:{...f.env,NEXT_PUBLIC_APP_ENV:'unknown'}})).status,503);
 for(const body of [{subjects:[]},{subjects:Array(101).fill(subjects[0])},{subjects:[{...subjects[0],email:'synthetic@example.invalid'}]},'{'])assert.equal((await f.call({body})).status,400);
 assert.equal((await f.call({body:' '.repeat(17000)})).status,413);
 assert.equal((await f.call({query:'?consumer=other'})).status,400);
 assert.equal((await f.call({method:'GET'})).status,405);
 assert.equal((await f.call({headers:{'content-type':'text/plain'}})).status,415);
 for(const mutate of [d=>d.results.reverse(),d=>d.results[0].reason='not_eligible',d=>d.checked_at='2000-01-01T00:00:00Z',d=>d.results[0].email='synthetic@example.invalid']){
  const res=await f.call({rpcOverride:async(args)=>{const r=await f.rpc(args);mutate(r.data);return r;}});assert.equal(res.status,503);assert.equal(res.body.error,'contract_violation');
 }
 assert.deepEqual((await f.call({rpcOverride:async()=>({data:null,error:{message:'private upstream detail'}})})).body,{error:'unavailable'});
});
