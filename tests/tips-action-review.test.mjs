import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { tipsReviewFixture, compile } from './helpers/tips-action-review.mjs';

test('actual source adapter rechecks purchase/refund/access and only returns a review',async t=>{
  const f=await tipsReviewFixture(t),run=(c=f.command)=>f.review.reviewTipsAction(f.admin,c,f.client);
  const baseline=(await f.db.query('select id,status,approved_amount,cancelled_amount from payments')).rows;
  const other=(await f.db.query('select to_jsonb(p) p from profiles p where id=$1',[f.other])).rows;
  async function check(reason,change=async()=>{},command=f.command){
    await f.db.exec('begin');try{await change();const r=await run(command);assert.equal(r.reason,reason);assert.equal(r.deliveryAllowed,false);}
    finally{await f.db.exec('rollback');}
  }
  await check('current_source_facts_confirmed');
  await check('fully_refunded_or_cancelled',()=>f.db.query("update payments set status='cancelled',cancelled_amount=approved_amount where id=$1",[f.payment]));
  await check('fully_refunded_or_cancelled',()=>f.db.query("insert into refunds(payment_id,amount,status) values($1,1100000,'done')",[f.payment]));
  await check('current_source_facts_confirmed',async()=>{
    await f.db.query("update orders set status='partially_refunded' where id=$1",[f.order]);
    await f.db.query("update payments set status='partial_cancelled',cancelled_amount=300000 where id=$1",[f.payment]);
    assert.equal((await run()).partialRefund,true);
  });
  await check('cohort_ended_not_learning_dropout',()=>f.db.query("update cohorts set status='completed' where id=$1",[f.cohort]));
  await check('learning_access_unavailable',()=>f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]));
  await check('learning_access_unavailable',()=>f.db.query("update enrollments set access_ends_at=now()-interval '1 day' where id=$1",[f.enrollment]));
  await check('current_source_facts_confirmed',()=>f.db.query("update enrollments set source='admin_grant',order_item_id=null where id=$1",[f.enrollment]));
  await check('no_current_learning_attention',()=>f.db.query("insert into edu_member_visits values($1,(now() at time zone 'Asia/Seoul')::date,now(),now())",[f.student]));
  await check('marketing_channel_not_current',()=>f.db.query('update profiles set ad_email_consent_at=null where id=$1',[f.student]));
  await check('analysis_not_current',async()=>{
    const r=(await f.db.query('select edu_personalization_consent($1) r',[f.student])).rows[0].r;
    await f.db.query('select edu_personalization_consent($1,$2,$3,null,$4)',[f.student,id(),{analysis:false,overseas:false},r.revision]);
  });
  const offer={intent:'course_offer',memberId:f.student,courseId:f.course,cohortId:f.cohort,channel:'email'};
  await check('already_has_target_cohort',undefined,offer);
  await check('target_cohort_purchase_history_review',async()=>{
    await f.db.query("update enrollments set status='refunded' where id=$1",[f.enrollment]);
    await f.db.query("update orders set status='refunded' where id=$1",[f.order]);
  },offer);
  await check('no_target_cohort_purchase_or_entitlement',undefined,{...offer,memberId:f.other});
  const next=id();await f.db.query("insert into cohorts(id,course_id,status) values($1,$2,'upcoming')",[next,f.course]);
  await check('no_target_cohort_purchase_or_entitlement',undefined,{...offer,cohortId:next});
  await assert.rejects(f.review.reviewTipsAction(f.other,f.command,f.client),/TIPS_REVIEW_UNAVAILABLE/);
  assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
  assert.deepEqual((await f.db.query('select id,status,approved_amount,cancelled_amount from payments')).rows,baseline);
  assert.deepEqual((await f.db.query('select to_jsonb(p) p from profiles p where id=$1',[f.other])).rows,other);
  assert.ok(f.calls.every(x=>x.method==='GET'||['edu_admin_learning_care','edu_personalization_consent'].includes(x.table)));
  assert.ok(f.calls.filter(x=>x.table==='orders').every(x=>!('paid_at' in x.params)&&x.params['order_items.cohort_id']));
});

test('source read failures and incomplete pages never approve a candidate',async t=>{
  const f=await tipsReviewFixture(t);
  for(const fault of [{table:'payments'},{table:'refunds'},
    {table:'orders',status:200,data:Array(101).fill({})},
    {table:'orders',status:200,count:2,data:[{id:f.order,status:'paid',paid_at:null,order_items:[{id:f.item,course_id:f.course,cohort_id:f.cohort}]}]},
    {table:'refunds',status:200,data:Array(1000).fill({})}]){
    f.setFault(fault);await assert.rejects(f.review.reviewTipsAction(f.admin,f.command,f.client),/TIPS_REVIEW_/);
  }
  assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
});

test('existing admin care route handles review envelope without entering manual send',async t=>{
  const f=await tipsReviewFixture(t);let allowed=true,loggedIn=true;
  const route=compile('app/api/admin/learning-care/route.ts',{
    '@/lib/learning-care':compile('lib/learning-care.ts',{}),
    '@/lib/supabase/admin':{createAdminClient:()=>f.client},
    '@/lib/server-auth':{getAuthenticatedUser:async()=>loggedIn?{id:f.admin}:null},
    '@/lib/operator-permissions':{getOperatorUser:async()=>allowed?{id:f.admin}:null},
    '@/lib/edu-workflows':{uuid:x=>typeof x==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)},
    '@/lib/edu-tips-action-review-server':f.review,
  });
  const post=(body,origin='https://fixture.invalid')=>route.POST(new Request('https://fixture.invalid/api/admin/learning-care',{
    method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  const before=process.env.EDU_TIPS_ACTION_REVIEW_ENABLED, old=process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;
  try{
    delete process.env.EDU_TIPS_ACTION_REVIEW_ENABLED;delete process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;
    assert.equal((await post({tipsReview:f.command})).status,404);assert.equal(f.calls.length,0);
    process.env.EDU_TIPS_ACTION_REVIEW_ENABLED='true';
    const response=await post({tipsReview:f.command}),value=await response.json();
    assert.equal(response.status,200);assert.equal(value.review.reason,'current_source_facts_confirmed');
    assert.equal(value.deliveryAllowed,false);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.equal(f.calls[0].table,'edu_admin_learning_care');
    process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED='true';
    assert.equal((await post({tipsReview:f.command})).status,200);
    const bad=[{tipsReview:{...f.command,actorId:f.other}},{tipsReview:f.command,content:'try sending'},
      {tipsReview:{...f.command,deliveryAllowed:true}},{tipsReview:{...f.command,memberId:'invalid'}},
      {tipsReview:{...f.command,intent:['learning_support']}},{tipsReview:{...f.command,channel:['email']}}];
    for(const payload of bad)assert.equal((await post(payload)).status,400);
    const count=f.calls.length;assert.equal((await post({tipsReview:f.command},'https://other.invalid')).status,403);
    allowed=false;assert.equal((await post({tipsReview:f.command})).status,403);allowed=true;loggedIn=false;
    assert.equal((await post({tipsReview:f.command})).status,403);assert.equal(f.calls.length,count);loggedIn=true;
    f.setFault({table:'payments'});const failed=await post({tipsReview:f.command});
    assert.equal(failed.status,503);const failure=await failed.json();
    assert.match(failure.error,/판정을 보류/);assert.equal(failure.deliveryAllowed,false);
    assert.doesNotMatch(JSON.stringify(failure),/PRIVATE|private@example/);
    assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
    assert.ok(!f.calls.some(x=>x.table.startsWith('edu_send_')));
  }finally{
    if(before===undefined)delete process.env.EDU_TIPS_ACTION_REVIEW_ENABLED;else process.env.EDU_TIPS_ACTION_REVIEW_ENABLED=before;
    if(old===undefined)delete process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED;else process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED=old;
  }
});
