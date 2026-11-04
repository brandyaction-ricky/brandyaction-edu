import test from 'node:test';
import assert from 'node:assert/strict';
import {id,fixture,receipt} from './helpers/edu-tips-erasure.mjs';
const migration='20261010055310_edu_tips_erasure_deadline_report_v2.sql';
async function setup(t){
 const f=await fixture(t,[migration]);
 const check=(consumer=90,limit=100)=>f.value('select edu_tips_check_erasure_deadlines($1,$2) as v',[id(consumer),limit]);
 const request=(n)=>f.value('select q.request_id as v from edu_tips_private.erasure_outbox q join edu_tips_private.subjects s on s.id=q.subject_id where s.member_id=$1',[id(n)]);
 return {...f,check,request};
}
test('unpublished requests without any receipt are detected and repeated scans preserve first evidence',async t=>{
 const f=await setup(t),q=await f.request(1);
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06' where request_id=$1",[q]);
 const a=await f.check();
 assert.equal(a.summary.total_requests,4);assert.equal(a.summary.unpublished_requests,4);assert.equal(a.summary.no_receipt_requests,4);
 assert.equal(a.summary.pending_overdue_requests,1);assert.deepEqual(a.items[0].pending_overdue_stages,['active']);
 assert.equal(a.items[0].delivery_id,null);assert.equal(a.items[0].breach_history[0].cause,'evidence_overdue');
 const b=await f.check();assert.deepEqual(b.items,a.items);
 const output=JSON.stringify(a);for(const key of ['customer_id','consent_epoch','member_id','evidence_sha256','payload'])assert(!output.includes(key));
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_deliveries'),0);
});
test('timely active evidence closes active wait but model and residual remain overdue',async t=>{
 const f=await setup(t);await f.publish();const [d]=await f.deliveries();
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06',model_due_at='2026-01-31',residual_due_at='2026-01-31' where request_id=$1",[d.request_id]);
 await f.accept(receipt(d,100,'active_erased'));
 const a=await f.check();assert.equal(a.summary.pending_overdue_requests,1);
 assert.deepEqual(a.items[0].pending_overdue_stages,['model','residual']);
 assert.equal(a.items[0].phase,'active_erased');
 await assert.rejects(f.ack(d.delivery_id),/TIPS_ACK_GAP/);
});
test('later receipt claiming timely completion cannot erase the missing-evidence history or grant global clearance',async t=>{
 const f=await setup(t);await f.publish();const [d]=await f.deliveries();
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06',model_due_at='2026-01-31',residual_due_at='2026-01-31' where request_id=$1",[d.request_id]);
 const first=await f.check();assert.equal(first.items[0].breach_history.length,3);
 await f.accept(receipt(d));
 const later=await f.check();assert.equal(later.summary.pending_overdue_requests,0);assert.equal(later.summary.breach_history_requests,1);
 assert.deepEqual(later.items[0].breach_history,first.items[0].breach_history);
 assert.equal(later.summary.awaiting_ack_requests,1);assert.equal(later.summary.awaiting_global_verification_requests,1);
 await f.ack(d.delivery_id);
 const acked=await f.check();assert.equal(acked.summary.awaiting_ack_requests,0);assert.equal(acked.summary.awaiting_global_verification_requests,1);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});
test('late completed evidence keeps a breach after ACK, distinct from pending evidence',async t=>{
 const f=await setup(t);await f.publish();const [d]=await f.deliveries();
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-01T00:00:01.5Z' where request_id=$1",[d.request_id]);
 await f.accept(receipt(d));await f.ack(d.delivery_id);
 const a=await f.check();assert.equal(a.summary.reported_late_requests,1);assert.equal(a.summary.pending_overdue_requests,0);
 assert.deepEqual(a.items[0].reported_late_stages,['active']);assert.equal(a.items[0].breach_history[0].cause,'reported_late');
});
test('summary counts all overdue requests despite display limit; future deadlines are not overdue',async t=>{
 const f=await setup(t);assert.equal((await f.check()).summary.pending_overdue_requests,0);
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06'");
 const a=await f.check(90,1);assert.equal(a.items.length,1);assert(a.truncated);assert.equal(a.summary.pending_overdue_requests,4);assert.equal(a.summary.breach_history_requests,4);
 assert.equal((await f.check(90,200)).items.length,4);
});
test('consumer reports do not reuse another consumers receipts or audit observations',async t=>{
 const f=await setup(t);await f.publish(90);const [d]=await f.deliveries(90);
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06' where request_id=$1",[d.request_id]);
 await f.accept(receipt(d),90);
 const dev=await f.check(90);assert.equal(dev.environment,'dev');assert.equal(dev.summary.pending_overdue_requests,0);
 const prod=await f.check(91);assert.equal(prod.environment,'production');assert.equal(prod.summary.pending_overdue_requests,1);
 assert.equal((await f.check(90)).summary.breach_history_requests,0);
});
test('unknown consumer and invalid limits fail without registering consumers or evidence',async t=>{
 const f=await setup(t);
 await assert.rejects(f.check(999),/TIPS_CONSUMER/);
 for(const n of [null,0,201,-1])await assert.rejects(f.check(90,n),/TIPS_INVALID/);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_deadline_breaches'),0);
});
test('audit writes roll back atomically and cannot be edited or deleted by the worker',async t=>{
 const f=await setup(t);await f.owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-06'");
 await f.db.exec('begin');await f.check();await f.db.exec('rollback');
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_deadline_breaches'),0);
 await f.check();
 await assert.rejects(f.db.exec("delete from edu_tips_private.erasure_deadline_breaches"),/permission denied/);
 await assert.rejects(f.db.exec("update edu_tips_private.erasure_deadline_breaches set cause='reported_late'"),/permission denied/);
 for(const role of ['anon','authenticated']){
  await f.db.exec('reset role;set role '+role);
  await assert.rejects(f.check(),/permission denied/);
  await assert.rejects(f.db.query('select * from edu_tips_private.erasure_deadline_breaches'),/permission denied/);
 }
});
