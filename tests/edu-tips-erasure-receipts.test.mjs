import test from 'node:test';
import assert from 'node:assert/strict';
import {id,customer,epoch,fixture,receipt} from './helpers/edu-tips-erasure.mjs';

test('publication commits stable per-consumer ordinals and retries do not duplicate requests',async t=>{
 const {db,publish,deliveries,owner} = await fixture(t);
 await db.exec('begin'); assert.equal(await publish(90,2),2); await db.exec('rollback');
 assert.equal((await deliveries()).length,0);
 assert.equal(await publish(90,2),2);
 const original=await deliveries(); assert.deepEqual(original.map(d=>d.ordinal),[1,2]);
 assert.equal(await publish(),2); assert.equal(await publish(),0);
 assert.deepEqual((await deliveries()).slice(0,2).map(d=>d.delivery_id),original.map(d=>d.delivery_id));
 assert.equal(await publish(91),4);
 assert.notEqual((await deliveries(91))[0].delivery_id,original[0].delivery_id);
 // Simulated late source arrival has an older timestamp, but is allocated after 4.
 await owner("insert into profiles(id) values($1)",[id(5)]);
 await owner("insert into edu_tips_private.subjects(member_id,customer_id,consent_epoch,wording_version,consent_revision) values($1,$2,$3,'v1',$4)",[id(5),customer(5),epoch(5),id(15)]);
 await owner("update profiles set status='withdrawn' where id=$1",[id(5)]);
 await owner("update edu_tips_private.erasure_outbox set requested_at='2025-01-01' where subject_id=(select id from edu_tips_private.subjects where member_id=$1)",[id(5)]);
 assert.equal(await publish(),1);assert.equal((await deliveries()).at(-1).customer_id,customer(5));
 assert.equal((await deliveries()).at(-1).ordinal,5);
});

test('receipt progress is immutable, monotonic and exact retries return their original acceptance',async t=>{
 const {publish,deliveries,accept,value} = await fixture(t);await publish();const [d]=await deliveries();
 const p=receipt(d,100,'blocked'); const first=await accept(p);assert.equal(first.phase,'blocked');
 const active=receipt(d,101,'active_erased',2);active.counts.events=2;await accept(active);
 const complete=receipt(d,102,'completed',3);complete.counts.events=2;await accept(complete);
 assert.deepEqual(await accept(p),first);
 await assert.rejects(accept({...p,evidence_sha256:'b'.repeat(64)}),/TIPS_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(accept({...complete,receipt_id:id(103)}),/TIPS_REVISION_CONFLICT/);
 await assert.rejects(accept(receipt(d,104,'blocked',4)),/TIPS_REVISION_CONFLICT/);
 await assert.rejects(accept(receipt(d,105,'completed',4)),/TIPS_REVISION_CONFLICT/); // counts must not shrink
 await assert.rejects(accept({...complete,receipt_id:id(106),receipt_revision:4,blocked_at:'2026-01-01T00:00:01.001Z'}),/TIPS_REVISION_CONFLICT/);
 assert.equal(await value('select count(*)::int as v from edu_tips_private.erasure_receipts'),3);
 assert.equal(await value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});

test('identity, unknown or cross-consumer requests and invalid evidence are rejected without writes',async t=>{
 const {publish,deliveries,accept,value} = await fixture(t);await publish();const [d,other]=await deliveries();const p=receipt(d);
 await assert.rejects(accept(p,91),/TIPS_UNKNOWN_REQUEST/);
 for(const change of [{customer_id:other.customer_id},{consent_epoch:other.consent_epoch}])await assert.rejects(accept({...p,...change}),/TIPS_IDENTITY_CONFLICT/);
 await assert.rejects(accept({...p,requestId:id(999)}),/TIPS_UNKNOWN_REQUEST/);
 const invalid=[{email:'must-not-store@example.test'},{receipt_revision:0},{receipt_revision:1.5},{receipt_revision:9007199254740992},
  {counts:{...p.counts,events:-1}},{counts:{...p.counts,extra:1}},{counts:{...p.counts,models:'1'}},
  {evidence_sha256:'not-a-hash'},{blocked_at:'2025-12-31T23:59:59.000Z'},
  {active_erased_at:'2025-01-01T00:00:00Z'},{model_resolved_at:null},{residual_erased_at:null},{models:'pending'},
  {residuals:'pending'},{error_code:'verification_failed'},{observed_at:'2099-01-01T00:00:00Z'},
  {observed_at:'2026-02-30T00:00:00Z'},{observed_at:'2026-01-01T24:00:00Z'},{observed_at:'2026-01-01T00:00:05+00:00'}, {counts:null}, {phase:'pretend_done'}, {phase:'blocked',active_erased_at:null}];
 for(const change of invalid)await assert.rejects(accept({...p,...change}),/TIPS_INVALID_RECEIPT/);
 const missing={...p};delete missing.blocked_at;await assert.rejects(accept(missing),/TIPS_INVALID_RECEIPT/);
 assert.equal(await value('select count(*)::int as v from edu_tips_private.erasure_receipts'),0);
});

test('ACK never skips incomplete requests, lower retries return current high watermark and scopes cannot mix',async t=>{
 const {publish,deliveries,accept,ack,db} = await fixture(t);await publish();await publish(91);
 const [one,two,three]=await deliveries(); const [foreign]=await deliveries(91);
 await accept(receipt(one,100)); await accept(receipt(three,103));
 assert.equal(await ack(one.delivery_id),one.delivery_id);
 await assert.rejects(ack(three.delivery_id),/TIPS_ACK_GAP/);
 await accept(receipt(two,101,'active_erased'));await assert.rejects(ack(three.delivery_id),/TIPS_ACK_GAP/);
 await accept(receipt(two,102,'completed',2));
 await db.exec('begin');assert.equal(await ack(three.delivery_id),three.delivery_id);await db.exec('rollback');
 assert.equal(await ack(one.delivery_id),one.delivery_id);
 assert.equal(await ack(three.delivery_id),three.delivery_id);
 assert.equal(await ack(one.delivery_id),three.delivery_id);
 await assert.rejects(ack(foreign.delivery_id),/TIPS_UNKNOWN_CURSOR/);
 await assert.rejects(ack(id(999)),/TIPS_UNKNOWN_CURSOR/);
 await assert.rejects(ack(foreign.delivery_id,91),/TIPS_ACK_GAP/);
});

test('late evidence remains accepted but deadline violation persists',async t=>{
 const {publish,deliveries,accept,owner} = await fixture(t);await publish();const [d]=await deliveries();
 await owner("update edu_tips_private.erasure_outbox set active_due_at='2026-01-01T00:00:01.500Z' where request_id=$1",[d.request_id]);
 const p=receipt(d,100,'active_erased');await accept(p);
 assert.equal((await deliveries())[0].deadline_breached,true);
 await owner("update edu_tips_private.erasure_outbox set active_due_at='2099-01-01' where request_id=$1",[d.request_id]);
 await accept(receipt(d,101,'completed',2));assert.equal((await deliveries())[0].deadline_breached,true);
});

test('service cannot create consumers or rewrite receipt history; browser roles have no access',async t=>{
 const {db,publish,deliveries,accept} = await fixture(t);await publish();await accept(receipt((await deliveries())[0]));
 for(const sql of ["update edu_tips_private.erasure_consumers set environment='production'",'delete from edu_tips_private.erasure_receipts',"update edu_tips_private.erasure_receipts set payload='{}'",'delete from edu_tips_private.erasure_deliveries'])await assert.rejects(db.exec(sql),/permission denied/);
 for(const role of ['anon','authenticated']){
  await db.exec(`reset role;set role ${role}`);
  for(const sql of ['select * from edu_tips_private.erasure_receipts','select * from edu_tips_private.erasure_consumers','select edu_tips_publish_erasures(null)',"select edu_tips_accept_erasure_receipt(null,'{}')",'select edu_tips_ack_erasures(null,null)'])await assert.rejects(db.exec(sql),/permission denied/);
 }
});

test('backup retention expiry is not erasure evidence and reported completion cannot reopen analysis',async t=>{
 const {publish,deliveries,accept,ack,owner,value} = await fixture(t);
 await publish();const [d]=await deliveries();
 const pending=receipt(d,200,'model_resolved');
 pending.models='done';pending.residuals='pending';pending.error_code='residual_pending';
 await accept(pending);
 await assert.rejects(ack(d.delivery_id),/TIPS_ACK_GAP/);
 // Even after the promised residual deadline, elapsed time is not deletion proof.
 await owner("update edu_tips_private.erasure_outbox set residual_due_at='2026-01-01T00:00:04Z' where request_id=$1",[d.request_id]);
 const overdue={...pending,receipt_id:id(201),receipt_revision:2,observed_at:'2026-01-01T00:00:06Z'};
 await accept(overdue);
 assert.equal((await deliveries())[0].deadline_breached,true);
 await assert.rejects(ack(d.delivery_id),/TIPS_ACK_GAP/);
 await assert.rejects(accept({...overdue,receipt_id:id(202),receipt_revision:3,phase:'completed'}),/TIPS_INVALID_RECEIPT/);
 // Only a new completion receipt with an actual residual timestamp can advance ACK.
 const completed={...overdue,receipt_id:id(203),receipt_revision:3,phase:'completed',residuals:'done',
  residual_erased_at:'2026-01-01T00:00:07Z',observed_at:'2026-01-01T00:00:08Z',error_code:null};
 await accept(completed);assert.equal(await ack(d.delivery_id),d.delivery_id);
 assert.equal((await deliveries())[0].deadline_breached,true);
 // Consumer claims are not independent verification and never clear the global gate.
 assert.equal(await value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});
