import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('E1 explicit exclusions preserve the ledger and agree across revenue, journey and acquisition reports', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
    alter default privileges in schema public grant all on tables to service_role;
    create table profiles(id uuid primary key,role text,status text,deleted_at timestamptz);
    create table orders(id uuid primary key,user_id uuid references profiles(id),status text,currency text,total_amount int,paid_at timestamptz);
    create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int,approved_at timestamptz);
    create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
    create table enrollments(id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
    create table mission_submissions(status text); create table edu_questions(status text,is_archived boolean);
    create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
    create table customer_journey_events(user_id uuid,session_id text,event_name text,path text,occurred_at timestamptz);
    create table site_settings(key text primary key,value jsonb);
    create table courses(id uuid primary key,category text,list_price int,status text); create table cohorts(id uuid primary key,course_id uuid);
    create table edu_recruitment_links(period_id text primary key);`);
  const admin=id(), staff=id(), student=id(), internal=id(), withdrawn=id(), free=id(), paid=id(), cohort=id();
  await db.query("insert into profiles(id,role,status) values($1,'admin','active'),($2,'staff','active'),($3,'student','active'),($4,'student','active'),($5,'student','withdrawn')", [admin,staff,student,internal,withdrawn]);
  const read = file => readFileSync(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8');
  await db.exec(read('202609210005_webinar_registration.sql'));
  await db.exec(read('20261005020515_edu_internal_order_analytics_e1.sql'));
  await db.exec('set role service_role');
  const call = async (fn,args=[]) => (await db.query(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;
  const mark = (kind,key,excluded,expected=false,actor=admin,reason='합성 검수 주문') => call('edu_set_analytics_exclusion',[actor,kind,key,excluded,expected,reason]);
  const summary = () => call('edu_admin_summary');
  const money = value => [value.approvedRevenue,value.refundedRevenue,value.netRevenue];
  await db.query("insert into courses values($1,'free',0,'published'),($2,'paid_class',6000,'published')",[free,paid]);
  await db.query('insert into cohorts values($1,$2)',[cohort,paid]); await db.exec("insert into edu_recruitment_links values('synthetic')");
  const manage = () => call('edu_manage_webinar',[admin,'synthetic',null]);
  const campaign = (await call('edu_manage_webinar',[admin,'synthetic',{expected:0,freeCourse:free,paidCohort:cohort,enabled:true}])).campaign;
  for (const user of [student,internal,staff,admin]) await call('edu_webinar_application',[campaign.id,user,'paid',true,1,'2026-08-11']);
  await db.exec("reset role; update edu_webinar_registrations set registered_at='2000-01-01'; set role service_role");
  async function order(user,amount,refund=0,mixed=false) {
    const key=id(); await db.query("insert into orders(id,user_id,status,currency,total_amount,paid_at) values($1,$2,$3,'KRW',$4,'2010-01-01')",[key,user,refund===amount&&amount>0?'refunded':refund?'partially_refunded':'paid',amount]);
    await db.query("insert into payments values($1,$2,$3,$4,$5,'2010-01-01')",[id(),key,refund===amount&&amount>0?'cancelled':refund?'partial_cancelled':'done',amount,refund]);
    await db.query('insert into order_items values($1,$2,$3)',[id(),key,cohort]);
    if(mixed) await db.query('insert into order_items values($1,$2,$3)',[id(),key,cohort]);
    return key;
  }
  await order(student,1000); await order(student,6000,1000,true);
  assert.deepEqual(money(await summary()),[7000,1000,6000]); // Real 1,000 KRW payment is included.
  for(let n=0;n<8;n++) { const key=await order(student,1000,n===0?1000:0); await mark('order',key,true); }
  await mark('member',internal,true); await order(internal,9000); await order(admin,10000); await order(staff,11000);
  await order(withdrawn,12000); await order(null,13000); await order(student,0);
  const ledgerBefore=(await db.query('select id,order_id,status,approved_amount,cancelled_amount from payments order by id')).rows;
  assert.deepEqual(money(await summary()),[7000,1000,6000]);
  const acquisition=await manage(); assert.equal(acquisition.registrations,1);
  assert.deepEqual({...acquisition.purchases,as_of:undefined},{orders:1,buyers:1,gross:1000,refunds:0,net:1000,needs_review:1,as_of:undefined});
  for(const [user,session] of [[student,'student'],[null,'anonymous'],[internal,'internal'],[staff,'staff'],[withdrawn,'withdrawn']])
    await db.query("insert into customer_journey_events values($1,$2,'page_view','/classes','2010-01-01')",[user,session]);
  const journey=await call('edu_analytics_report',['2009-01-01','2011-01-01']);
  assert.equal(journey.visitors,2); assert.equal(journey.events,2); assert.equal(journey.paidOrders,2); assert.equal(journey.revenue,6000);
  const flagged=(await db.query('select id from orders where is_test_order limit 1')).rows[0].id;
  await assert.rejects(mark('order',flagged,false,true,staff),/FORBIDDEN/);
  await assert.rejects(mark('order',flagged,false,false),/STALE/);
  await assert.rejects(mark('member',admin,false,true),/FORCED/);
  await assert.rejects(mark('order',flagged,false,true,admin,''),/INVALID/);
  const auditBefore=(await db.query('select count(*)::int as n from audit_logs')).rows[0].n;
  assert.deepEqual(await mark('order',flagged,true,true),{excluded:true,changed:false});
  assert.equal((await db.query('select count(*)::int as n from audit_logs')).rows[0].n,auditBefore);
  await mark('order',flagged,false,true); assert.equal((await summary()).approvedRevenue,8000);
  await mark('order',flagged,true,false); assert.deepEqual(money(await summary()),[7000,1000,6000]);
  assert.deepEqual((await db.query('select id,order_id,status,approved_amount,cancelled_amount from payments order by id')).rows,ledgerBefore);
  assert.equal((await db.query("select count(*)::int as n from audit_logs where actor_user_id=$1 and after_data->>'reason'='합성 검수 주문'",[admin])).rows[0].n,11);
  await db.exec('reset role; grant select,update,insert on profiles,orders to authenticated; set role authenticated');
  await assert.rejects(db.query('update profiles set is_internal=false where id=$1',[internal]),/FORBIDDEN/);
  await assert.rejects(db.query('update orders set is_test_order=false where id=$1',[flagged]),/FORBIDDEN/);
  await assert.rejects(db.query("update profiles set role='admin' where id=$1",[student]),/FORBIDDEN/);
  // Ordinary profile updates still work; flags and private views cannot be bypassed.
  await db.query("update profiles set status='active' where id=$1",[student]);
  await assert.rejects(call('edu_set_analytics_exclusion',[admin,'order',flagged,false,true,'test']),/permission denied/);
  for(const view of ['edu_analytics_members','edu_analytics_orders']) await assert.rejects(db.query('select * from '+view),/permission denied/);
  await db.exec('reset role');
  const newcomer=id(); await db.query("insert into profiles(id,role,status) values($1,'staff','active')",[newcomer]);
  assert.equal((await db.query('select is_internal from profiles where id=$1',[newcomer])).rows[0].is_internal,true);
  await db.query("update profiles set role='staff' where id=$1",[student]);
  assert.equal((await db.query('select is_internal from profiles where id=$1',[student])).rows[0].is_internal,true);
  const anotherFree=id();
  await db.query("insert into courses values($1,'free',0,'published')",[anotherFree]);
  // All registrations are now internal. They must still protect their original
  // campaign mapping even though acquisition reports exclude them.
  await assert.rejects(call('edu_manage_webinar',[admin,'synthetic',{expected:1,freeCourse:anotherFree,paidCohort:cohort,enabled:true}]),/STALE/);
});
