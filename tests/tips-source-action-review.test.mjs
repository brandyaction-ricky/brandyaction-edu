import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID as id } from 'node:crypto';
import { tipsReviewFixture, compile } from './helpers/tips-action-review.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
async function setup(t){
  const f=await tipsReviewFixture(t),consumer=id(),key='SYNTHETIC_SOURCE_REVIEW_'+('x'.repeat(30)),subject={customer_id:'k1:'+'A'.repeat(43),consent_epoch:'ce_'+'B'.repeat(32)};
  await f.db.exec(`reset role;alter table profiles add column is_internal boolean not null default false;alter table profiles add column deleted_at timestamptz;
    alter table courses add column course_code text unique;alter table cohorts add column cohort_code text;
    create unique index qa_cohort_code on cohorts(course_id,cohort_code);`);
  for(const file of ['20261009115301_edu_tips_erasure_outbox_v2.sql','20261010011422_edu_tips_erasure_receipts_v2.sql','20261027062000_edu_tips_source_action_review.sql'])await f.db.exec(read(file));
  await f.db.query("update courses set course_code='EDU-MOONSHOT' where id=$1",[f.course]);
  await f.db.query("update cohorts set cohort_code='C4' where id=$1",[f.cohort]);
  await f.db.query("insert into edu_tips_private.erasure_consumers(id,environment,tenant_id,brand_id) values($1,'dev','brandyaction','brandyaction_edu')",[consumer]);
  await f.db.query("insert into edu_tips_private.action_review_keys values($1,$2,'edu.action.review',now()+interval '1 hour',null)",[hash(key),consumer]);
  await f.db.exec('set role service_role');
  const pref=(await f.db.query('select revision from edu_personalization_preferences where member_id=$1',[f.student])).rows[0];
  await f.db.query("select edu_tips_register_subject($1,$2,$3,'QA',$4)",[f.student,subject.customer_id,subject.consent_epoch,pref.revision]);
  const parser=compile('lib/edu-tips-json.ts',{});
  const http=compile('lib/edu-tips-action-review-http.ts',{'node:crypto':{createHash},'./edu-tips-json':parser,'./edu-tips-action-review':f.evaluator});
  const route=compile('app/api/internal/tips/action-review/v1/check/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>f.client},'@/lib/edu-tips-action-review-http':http});
  const body={...subject,product_id:'EDU-MOONSHOT',cohort_code:'EDU-MOONSHOT:C4',intent:'learning_support',channel:'email'};
  const env={EDU_TIPS_SOURCE_REVIEW_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development'};
  const rpc=(args,signal)=>f.client.rpc('edu_tips_action_review_context',args).abortSignal(signal);
  const request=(body,token=key,extra={})=>new Request('https://fixture.invalid/api/internal/tips/action-review/v1/check',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,...extra},body:typeof body==='string'?body:JSON.stringify(body)});
  const call=(x=body,token=key,customEnv=env)=>http.handleActionReview(request(x,token),{env:customEnv,rpc});
  return {...f,key,subject,consumer,body,env,request,call,route,http,rpc};
}

test('opaque customer → current purchase/refund/cohort facts → review; actual source SQL and HTTP adapter',async t=>{
  const f=await setup(t),results=[];
  const original=(await f.db.query('select id,status,approved_amount,cancelled_amount from payments')).rows;
  const other=(await f.db.query('select to_jsonb(p) p from profiles p where id=$1',[f.other])).rows;
  async function check(label,reason,change=async()=>{},body=f.body){
    await f.db.exec('begin');try{
      await change();const response=await f.call(body),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
      assert.equal(data.review.reason,reason,label);assert.equal(data.deliveryAllowed,false);assert.equal(data.review.deliveryAllowed,false);
      assert.equal(data.mode,'review_only');assert.match(data.review.reviewedAt,/\.\d{6}Z$/);
      assert.doesNotMatch(JSON.stringify(data),/private@example|qa@example|합성 회원|memberId|enrollmentId|order_item|lessonId|approved_amount/);
      for(const value of [f.student,f.enrollment,f.order,f.payment])assert.ok(!JSON.stringify(data).includes(value));
      assert.match(response.headers.get('cache-control'),/no-store/);results.push({label,reason,decision:data.review.decision,partialRefund:data.review.partialRefund??null});
      return data;
    }finally{await f.db.exec('rollback');}
  }
  await check('paid before analysis consent, currently inactive','current_source_facts_confirmed');
  await check('full refund ledger before entitlement job','fully_refunded_or_cancelled',()=>f.db.query("insert into refunds(payment_id,amount,status) values($1,1100000,'done')",[f.payment]));
  await check('payment cancelled before enrollment revoke','fully_refunded_or_cancelled',()=>f.db.query("update payments set status='cancelled',cancelled_amount=approved_amount where id=$1",[f.payment]));
  const partial=await check('partial refund keeps valid access','current_source_facts_confirmed',()=>f.db.query("insert into refunds(payment_id,amount,status) values($1,200000,'done')",[f.payment]));assert.equal(partial.review.partialRefund,true);
  await check('ended cohort is not a learning dropout','cohort_ended_not_learning_dropout',()=>f.db.query("update cohorts set status='completed' where id=$1",[f.cohort]));
  await check('ended by time without status update','cohort_ended_not_learning_dropout',()=>f.db.query("update cohorts set operation_end_at=now()-interval '1 hour' where id=$1",[f.cohort]));
  await check('access revoked','learning_access_unavailable',()=>f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]));
  await check('access expired','learning_access_unavailable',()=>f.db.query("update enrollments set access_ends_at=now()-interval '1 hour' where id=$1",[f.enrollment]));
  await check('recent visit excludes old model candidate','no_current_learning_attention',()=>f.db.query("insert into edu_member_visits values($1,(now() at time zone 'Asia/Seoul')::date,now(),now())",[f.student]));
  await check('all published learning completed','care_recipient_changed',()=>f.submitCell(f.lesson,f.learningRevision));
  await check('kakao choice missing','marketing_channel_not_current',()=>f.db.query('update profiles set ad_kakao_consent_at=null where id=$1',[f.student]),{...f.body,channel:'kakao'});
  await check('account withdrawn','analysis_not_current',()=>f.db.query("update profiles set status='withdrawn' where id=$1",[f.student]));
  await check('analysis consent withdrawn','analysis_not_current',async()=>{
    const p=(await f.db.query('select edu_personalization_consent($1) p',[f.student])).rows[0].p;
    await f.db.query('select edu_personalization_consent($1,$2,$3,null,$4)',[f.student,id(),{analysis:false,overseas:false},p.revision]);
  });
  await check('wrong epoch cannot resolve to source member','analysis_not_current',undefined,{...f.body,consent_epoch:'ce_'+'Z'.repeat(32)});
  await check('catalog case preserved, lowercasing does not alias','unavailable_course',undefined,{...f.body,product_id:'edu-moonshot'});
  const next=id();await f.db.query("insert into cohorts(id,course_id,cohort_code,status) values($1,$2,'C5','upcoming')",[next,f.course]);
  await check('previous cohort purchase does not block next cohort offer','no_target_cohort_purchase_or_entitlement',undefined,{...f.body,intent:'course_offer',cohort_code:'EDU-MOONSHOT:C5'});
  await check('offer excludes current entitlement','already_has_target_cohort',undefined,{...f.body,intent:'course_offer'});
  await check('offer excludes pre-consent refunded purchase history','target_cohort_purchase_history_review',()=>f.db.query("update enrollments set status='refunded' where id=$1",[f.enrollment]),{...f.body,intent:'course_offer'});
  assert.deepEqual((await f.db.query('select id,status,approved_amount,cancelled_amount from payments')).rows,original);
  assert.deepEqual((await f.db.query('select to_jsonb(p) p from profiles p where id=$1',[f.other])).rows,other);
  assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
  assert.ok(!f.calls.some(x=>x.table.startsWith('edu_send_')));
  if(process.env.TIPS_SOURCE_QA_OUTPUT)fs.writeFileSync(process.env.TIPS_SOURCE_QA_OUTPUT,JSON.stringify({environment:'isolated PGlite + real TypeScript handler + supabase-js in-process HTTP transport',remoteDev:false,externalSends:0,results},null,2)+'\n');
});

test('dedicated key/environment, no public SQL access, no credentials seeded, rate cap and missing rows fail closed',async t=>{
  const f=await setup(t);
  assert.equal((await f.call(f.body,'NOT_A_SOURCE_REVIEW_KEY_'+'x'.repeat(32))).status,401);
  assert.equal((await f.call(f.body,f.key,{...f.env,NEXT_PUBLIC_APP_ENV:'production'})).status,401);
  for(const role of ['anon','authenticated']){
    await f.db.exec('reset role;set role '+role);
    await assert.rejects(f.db.query('select edu_tips_action_review_context($1,$2,$3)',[hash(f.key),'dev',f.body]),/permission denied/);
    await assert.rejects(f.db.query('select * from edu_tips_private.action_review_keys'),/permission denied/);
  }
  await f.db.exec('reset role');
  await f.db.query('update edu_tips_private.action_review_keys set revoked_at=now() where key_hash=$1',[hash(f.key)]);
  await f.db.exec('set role service_role');assert.equal((await f.call()).status,401);
  await f.db.exec('reset role');await f.db.query('update edu_tips_private.action_review_keys set revoked_at=null where key_hash=$1',[hash(f.key)]);
  await f.db.exec('set role service_role');
  await f.db.query("insert into edu_tips_private.action_review_rates values($1,date_trunc('minute',now()),120)",[f.consumer]);
  const limited=await f.call();assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
  await f.db.query('delete from edu_tips_private.action_review_rates where consumer_id=$1',[f.consumer]).catch(async()=>{await f.db.exec('reset role');await f.db.query('delete from edu_tips_private.action_review_rates where consumer_id=$1',[f.consumer]);await f.db.exec('set role service_role');});
  await f.db.exec('begin');
  const extraCohort=id();await f.db.query("insert into cohorts(id,course_id,cohort_code) values($1,$2,'MIXED')",[extraCohort,f.course]);
  await f.db.query("insert into order_items(order_id,course_id,cohort_id,item_name,unit_price) values($1,$2,$3,'EXTRA',100000)",[f.order,f.course,extraCohort]);
  assert.equal((await f.call()).status,503);await f.db.exec('rollback');
  await f.db.query("insert into refunds(payment_id,amount,status) values($1,1200000,'done')",[f.payment]);
  const failed=await f.call();assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'unavailable',deliveryAllowed:false});
});

test('default OFF, strict body, no raw member IDs, failures and aborted requests never send',async t=>{
  const f=await setup(t),before=f.calls.length;
  assert.equal((await f.call(f.body,f.key,{})).status,503);assert.equal(f.calls.length,before);
  const invalid=[{...f.body,memberId:f.student},{...f.body,deliveryAllowed:true},{...f.body,intent:['learning_support']},
    {...f.body,channel:['email']},{...f.body,cohort_code:'wrong space'},JSON.stringify(f.body).replace('"intent":','"intent":"course_offer","intent":')];
  for(const body of invalid)assert.equal((await f.call(body)).status,400);
  assert.equal((await f.http.handleActionReview(f.request(' '.repeat(4097)),{env:f.env,rpc:f.rpc})).status,413);
  assert.equal((await f.http.handleActionReview(f.request(f.body,f.key,{'content-type':'text/plain'}),{env:f.env,rpc:f.rpc})).status,415);
  f.setFault({table:'edu_tips_action_review_context'});const failed=await f.call();assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(await failed.json()),/PRIVATE|SQL|XX000/);
  const controller=new AbortController();controller.abort();const aborted=new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer '+f.key,'content-type':'application/json'},body:JSON.stringify(f.body),signal:controller.signal});
  assert.equal((await f.http.handleActionReview(aborted,{env:f.env,rpc:f.rpc})).status,503);
  assert.equal((await f.route.GET()).status,405);assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
});


test('Next route wiring invokes the dedicated source RPC, independently of manual-send flags',async t=>{
  const f=await setup(t),keys=['EDU_TIPS_SOURCE_REVIEW_API_ENABLED','NEXT_PUBLIC_APP_ENV','NEXT_PUBLIC_EDU_MESSAGES_ENABLED'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,f.env,{NEXT_PUBLIC_EDU_MESSAGES_ENABLED:'true'});
    const response=await f.route.POST(f.request(f.body));assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.review.reason,'current_source_facts_confirmed');assert.equal(result.deliveryAllowed,false);
    assert.ok(f.calls.some(x=>x.table==='edu_tips_action_review_context'));
    assert.ok(!f.calls.some(x=>x.table==='edu_admin_learning_care'||x.table.startsWith('edu_send_')));
  }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
