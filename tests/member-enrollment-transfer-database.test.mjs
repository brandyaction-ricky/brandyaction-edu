import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const read = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const migration = read('20261111003951_edu_member_erasure_completion_and_enrollment_transfer.sql');
async function setup(t) {
 const db = new PGlite(); t.after(() => db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema private;
 grant usage on schema private to service_role;
 create table profiles(id uuid primary key,role text,status text,deleted_at timestamptz);
 create table cohorts(id uuid primary key,status text,archived_at timestamptz,operation_end_at timestamptz);
 create table orders(id uuid primary key,user_id uuid references profiles,order_number text unique,total_amount integer,status text,paid_at timestamptz,expires_at timestamptz,cancelled_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid references orders,course_id uuid,cohort_id uuid references cohorts,created_at timestamptz default now());
 create table payments(id uuid primary key default gen_random_uuid(),order_id uuid unique references orders,provider text,provider_payment_key text unique,method text,status text,approved_amount integer,cancelled_amount integer not null default 0,receipt_url text,provider_payload jsonb,approved_at timestamptz);
 create table refunds(id uuid primary key default gen_random_uuid(),payment_id uuid references payments,provider_refund_key text unique,amount integer,reason text,status text,provider_payload jsonb,completed_at timestamptz);
 create table enrollments(id uuid primary key default gen_random_uuid(),user_id uuid references profiles not null,course_id uuid not null,cohort_id uuid not null references cohorts,order_item_id uuid references order_items,status text check(status in('active','revoked','refunded','expired')),revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz,source text default 'purchase' check(source in('purchase','admin_grant')),granted_by uuid references profiles,updated_at timestamptz,unique(user_id,cohort_id));
 create table audit_logs(actor_user_id uuid references profiles,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create table learning_private(enrollment_id uuid references enrollments,content text);
 create table consent_receipts(member_id uuid references profiles,version text);
 create function crm_sync_automatic_tags(uuid) returns void language sql as $$select$$;`);
 // Exercise the unchanged production payment/refund finalizers, not a mocked transfer of money.
 await db.exec(read('20260916074606_repair_payment_coupon_consistency.sql').match(/create or replace function public.finalize_toss_payment\([\s\S]*?\n\$\$;/)[0]);
 await db.exec(read('202608060001_launch_transactions.sql').match(/create or replace function public.finalize_toss_refund\([\s\S]*?\n\$\$;/)[0]);
 await db.exec('begin;\n' + migration.slice(migration.indexOf('-- Transfer access,')));
 const admin=id(), a=id(), b=id(), c=id(), d=id(), cohort=id(), course=id(), source=id(), order=id(), item=id(), number='QA-'+id();
 await db.query("insert into profiles values($1,'admin','active',null),($2,'student','active',null),($3,'student','active',null),($4,'student','active',null),($5,'student','active',null)",[admin,a,b,c,d]);
 await db.query("insert into cohorts values($1,'open',null,now()+interval '2 months')",[cohort]);
 await db.query("insert into orders values($1,$2,$3,1000,'pending',null,null,null)",[order,a,number]);
 await db.query('insert into order_items(id,order_id,course_id,cohort_id) values($1,$2,$3,$4)',[item,order,course,cohort]);
 const call = async (name,args) => Object.values((await db.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args)).rows[0])[0];
 const approve=async(n=number,key='qa-payment')=>call('finalize_toss_payment',[n,key,'카드',1000,null,{paymentKey:key,orderId:n,status:'DONE',currency:'KRW',totalAmount:1000},new Date().toISOString()]);
 const enrollment=await approve();
 await db.query('insert into learning_private values($1,\'private-original-work\')',[enrollment]);
 await db.query("insert into consent_receipts values($1,'retained-version')",[a]);
 const transfer=(src=enrollment,from=a,to=b,request=id(),actor=admin,reason='본인 확인 후 이용 계정 이전')=>call('edu_transfer_enrollment',[actor,request,src,from,to,reason]);
 const rows=async()=> (await db.query('select * from enrollments order by user_id')).rows;
 return {db,admin,a,b,c,d,cohort,course,enrollment,order,item,number,call,approve,transfer,rows};
}
test('transfer atomically removes old access and grants clean access, preserving purchase and personal records; retries are idempotent',async t=>{
 const x=await setup(t),request=id();
 const result=await x.transfer(undefined,undefined,undefined,request);
 const source=(await x.rows()).find(r=>r.id===x.enrollment),target=(await x.rows()).find(r=>r.id===result.enrollmentId);
 assert.equal(source.user_id,x.a);assert.equal(source.status,'revoked');assert.equal(source.order_item_id,x.item);
 assert.equal(target.user_id,x.b);assert.equal(target.status,'active');assert.equal(target.order_item_id,null);assert.equal(target.source,'admin_grant');
 assert.equal(target.access_ends_at.getTime(),source.access_ends_at.getTime());
 assert.deepEqual((await x.db.query('select * from learning_private')).rows,[{enrollment_id:x.enrollment,content:'private-original-work'}]);
 assert.equal((await x.db.query('select user_id from orders')).rows[0].user_id,x.a);
 assert.equal((await x.db.query('select count(*)::int n from payments')).rows[0].n,1);
 assert.equal((await x.db.query('select count(*)::int n from consent_receipts')).rows[0].n,1);
 assert.deepEqual(await x.transfer(undefined,undefined,undefined,request),result);
 await assert.rejects(x.transfer(undefined,undefined,x.c,request),/TRANSFER_REQUEST_REUSED/);
 await assert.rejects(x.transfer(),/TRANSFER_NOT_ACTIVE/);
 assert.equal((await x.db.query("select count(*)::int n from audit_logs where action='enrollment.transferred'")).rows[0].n,1);
 await x.approve(); // real duplicate payment callback
 assert.equal((await x.rows()).find(r=>r.id===x.enrollment).status,'revoked');
});
test('full refund reaches chained recipients; partial refunds and new independent purchases are preserved',async t=>{
 const x=await setup(t);
 const first=await x.transfer();const second=await x.transfer(first.enrollmentId,x.b,x.c);
 await x.call('finalize_toss_refund',[x.number,400,'QA partial','partial-1',{}]);
 assert.equal((await x.rows()).find(r=>r.id===second.enrollmentId).status,'active');
 // The original buyer purchases again using the same cohort enrollment key.
 const nextOrder=id(),nextItem=id(),nextNumber='QA-new-'+id();
 await x.db.query("insert into orders values($1,$2,$3,1000,'pending',null,null,null)",[nextOrder,x.a,nextNumber]);
 await x.db.query('insert into order_items(id,order_id,course_id,cohort_id) values($1,$2,$3,$4)',[nextItem,nextOrder,x.course,x.cohort]);
 await x.approve(nextNumber,'qa-new-payment');
 assert.equal((await x.rows()).find(r=>r.id===x.enrollment).status,'active');
 // Refunding the earlier purchase follows its saved lineage, not the reused row's new purchase.
 await x.call('finalize_toss_refund',[x.number,600,'QA full','remaining-1',{}]);
 const rows=await x.rows();assert.equal(rows.find(r=>r.id===first.enrollmentId).status,'refunded');assert.equal(rows.find(r=>r.id===second.enrollmentId).status,'refunded');
 assert.equal(rows.find(r=>r.id===x.enrollment).status,'active');assert.equal(rows.find(r=>r.id===x.enrollment).order_item_id,nextItem);
 await x.call('finalize_toss_refund',[x.number,600,'QA duplicate','remaining-1',{}]);
 assert.equal((await x.db.query('select count(*)::int n from refunds')).rows[0].n,2);
 // A new acquisition can itself be transferred without mixing earlier refunds.
 const newest=await x.transfer(x.enrollment,x.a,x.d);
 await x.call('finalize_toss_refund',[nextNumber,1000,'QA new refund','new-refund',{}]);
 assert.equal((await x.rows()).find(r=>r.id===newest.enrollmentId).status,'refunded');
});
test('destination history, inactive identities and unauthorized callers fail closed; an audit failure rolls the whole transfer back',async t=>{
 const x=await setup(t);
 await x.db.query("insert into enrollments(user_id,course_id,cohort_id,status) values($1,$2,$3,'revoked')",[x.b,x.course,x.cohort]);
 await assert.rejects(x.transfer(),/TRANSFER_TARGET_EXISTS/);
 await x.db.query("update profiles set status='withdrawn' where id=$1",[x.c]);
 await assert.rejects(x.transfer(undefined,undefined,x.c),/TRANSFER_MEMBER_INACTIVE/);
 await assert.rejects(x.transfer(undefined,undefined,x.d,id(),x.a),/TRANSFER_FORBIDDEN/);
 await x.db.exec('set role authenticated');await assert.rejects(x.transfer(undefined,undefined,x.d),/permission denied/);await x.db.exec('reset role');
 await x.db.exec(`create function fail_transfer_audit() returns trigger language plpgsql as $$begin if new.action='enrollment.transferred' then raise exception 'QA_AUDIT_FAILURE';end if;return new;end;$$;
 create trigger qa_audit_failure before insert on audit_logs for each row execute function fail_transfer_audit();`);
 await assert.rejects(x.transfer(undefined,undefined,x.d),/QA_AUDIT_FAILURE/);
 assert.equal((await x.rows()).find(r=>r.id===x.enrollment).status,'active');
 assert.equal((await x.rows()).filter(r=>r.user_id===x.d).length,0);
 assert.equal((await x.db.query('select count(*)::int n from private.edu_enrollment_transfers')).rows[0].n,0);
});
