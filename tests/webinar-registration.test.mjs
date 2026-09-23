import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('cohortless registration preserves first channel; purchase observations exclude unrelated, premature, mixed and inconsistent orders',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text);create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,category text,list_price int,status text);create table cohorts(id uuid primary key,course_id uuid);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key,user_id uuid,status text,currency text,total_amount int,paid_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int);`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609210005_webinar_registration.sql',import.meta.url),'utf8'));
 const admin=randomUUID(),student=randomUUID(),other=randomUUID(),staff=randomUUID(),free=randomUUID(),paid=randomUUID(),cohort=randomUUID(),unrelated=randomUUID();
 await db.query("insert into profiles values($1,'admin','active'),($2,'student','active'),($3,'student','active'),($4,'staff','active')",[admin,student,other,staff]);
 await db.query("insert into courses values($1,'free',0,'published'),($2,'paid_class',1000,'published')",[free,paid]);
 await db.query('insert into cohorts values($1,$2),($3,$2)',[cohort,paid,unrelated]);await db.exec("insert into edu_recruitment_links values('sample'),('another')");
 const manage=async(settings=null,actor=admin,period='sample')=>(await db.query('select edu_manage_webinar($1,$2,$3) as v',[actor,period,settings])).rows[0].v;
 const settings=(expected,paidCohort=null,enabled=true)=>({expected,freeCourse:free,paidCohort,enabled});
 assert.equal((await manage()).campaign,null);
 const first=await manage(settings(0)),code=first.campaign.id;
 assert.equal(first.purchase_state,'unmapped');assert.equal(first.purchases,null);
 const app=async(user=student,write=true,channel='paid',expected=1)=>(await db.query('select edu_webinar_application($1,$2,$3,$4,$5,$6) as v',[code,user,channel,write,expected,'2026-08-11'])).rows[0].v;
 assert.equal((await app(null,false)).registered,false);await assert.rejects(app(null),/FORBIDDEN/);
 await assert.rejects(app(student,true,'paid',99),/STALE/);
 await app();await app(student,true,'organic');assert.equal((await manage()).registrations,1);
 assert.equal((await db.query('select channel from edu_webinar_registrations')).rows[0].channel,'paid');
 await assert.rejects(manage({...settings(1),freeCourse:paid}),/INVALID/);
 await manage(settings(1,cohort));
 await assert.rejects(manage(settings(2,unrelated)),/STALE/);
 await assert.rejects(manage(settings(0,cohort),admin,'another'),/duplicate/);
 await db.exec("update edu_webinar_registrations set registered_at='2001-01-01'");
 const order=async({user=student,target=cohort,date='2010-01-01',status='paid',amount=1000,approved=1000,refund=0,mixed=false}={})=>{
  const id=randomUUID();await db.query("insert into orders values($1,$2,$3,'KRW',$4,$5)",[id,user,status,amount,date]);
  await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),id,target]);if(mixed)await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),id,unrelated]);
  await db.query('insert into payments values($1,$2,$3,$4,$5)',[randomUUID(),id,refund===approved?'cancelled':refund?'partial_cancelled':'done',approved,refund]);
 };
 await order({refund:300});await order({refund:1000,status:'refunded'});await order({date:'2000-01-01'});await order({date:'2099-01-01'});await order({user:other});await order({target:unrelated});await order({mixed:true});await order({approved:900});await order({amount:0,approved:0});
 let report=await manage();assert.equal(report.registrations,1);assert.equal(report.participation,null);assert.deepEqual({...report.purchases,as_of:undefined},{orders:2,buyers:1,gross:2000,refunds:1300,net:700,needs_review:2,as_of:undefined});
 await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:true}]);
 report=await manage(null,staff);assert.equal(report.purchase_state,'forbidden');assert.equal(report.purchases,null);
 await db.query('update site_settings set value=$1',[{marketing:true,products:true,orders:true}]);assert.equal((await manage(null,staff)).purchases.net,700);
 await db.query('update site_settings set value=$1',[{marketing:false,products:true,orders:true}]);await assert.rejects(manage(null,staff),/FORBIDDEN/);
 await db.query("update courses set status='archived' where id=$1",[free]);await manage(settings(2,cohort,false));await assert.rejects(app(student,false),/NOT_FOUND/);
 for(const table of ['edu_webinar_campaigns','edu_webinar_registrations','edu_webinar_campaign_history']){
  assert.equal((await db.query('select relrowsecurity as v from pg_class where relname=$1',[table])).rows[0].v,true);
  for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as v',[role,table,priv])).rows[0].v,false);
 }
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['edu_manage_webinar(uuid,text,jsonb)','edu_webinar_application(uuid,uuid,text,boolean,integer,text)'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) as v',[role,fn,'EXECUTE'])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
