import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('followup drafts are isolated and audiences suppress orders, missing identity, consent and contact',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text,phone text,marketing_consent boolean,marketing_consent_at timestamptz,marketing_opt_out_at timestamptz);create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,category text,list_price int,status text);create table cohorts(id uuid primary key,course_id uuid);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key,user_id uuid,status text,currency text,total_amount int,paid_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int);`);
 for(const file of ['202609210005_webinar_registration.sql','202609210006_webinar_attendance.sql','202609210007_broadcast_entry.sql','202609210008_webinar_followup.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const admin=randomUUID(),staff=randomUUID(),free=randomUUID(),paid=randomUUID(),cohort=randomUUID();
 await db.query("insert into profiles(id,role,status) values($1,'admin','active'),($2,'staff','active')",[admin,staff]);
 await db.query("insert into courses values($1,'free',0,'published'),($2,'paid_class',1000,'published')",[free,paid]);await db.query('insert into cohorts values($1,$2)',[cohort,paid]);await db.exec("insert into edu_recruitment_links values('sample')");
 const campaign=(await db.query('select edu_manage_webinar($1,$2,$3) as v',[admin,'sample',{freeCourse:free,paidCohort:null,enabled:true,expected:0}])).rows[0].v.campaign;
 const manage=async(settings=null,actor=admin)=>(await db.query('select edu_manage_webinar_followup($1,$2,$3) as v',[actor,campaign.id,settings])).rows[0].v;
 const settings=(channel,expected,body='합성 안내 초안')=>({channel,purpose:'encore',body,expected});
 assert.equal((await manage()).audienceState,'unmapped');assert.equal((await manage()).counts,null);
 await manage(settings('room',0));await manage(settings('direct',0));await assert.rejects(manage(settings('room',0)),/STALE/);
 await manage(settings('room',1,'수정한 합성 초안'));assert.equal((await manage()).drafts.find(d=>d.channel==='room').revision,2);
 assert.equal((await db.query("select body from edu_webinar_followup_history where channel='room' and revision=1")).rows[0].body,'합성 안내 초안');
 await assert.rejects(manage({...settings('room',2),body:''}),/INVALID/);
 await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:true}]);
 assert.equal((await manage(null,staff)).audienceState,'forbidden');assert.equal((await manage(null,staff)).counts,null);assert.equal((await manage(null,staff)).drafts.length,1);
 await assert.rejects(manage(settings('direct',1),staff),/FORBIDDEN/);
 await db.query('select edu_manage_webinar($1,$2,$3)',[admin,'sample',{freeCourse:free,paidCohort:cohort,enabled:true,expected:1}]);
 const ids=Array.from({length:8},()=>randomUUID());
 for(const id of ids){await db.query("insert into profiles values($1,'member','active','01000000000',true,now()-interval '1 day',null)",[id]);await db.query("insert into edu_webinar_registrations(period_id,user_id,channel,policy_version) values('sample',$1,'organic','2026-08-11')",[id]);}
 await db.query("update profiles set status='suspended' where id=$1",[ids[0]]);
 await db.query('update profiles set marketing_consent=false where id=$1',[ids[1]]);
 await db.query("update profiles set phone='' where id=$1",[ids[2]]);
 for(const [index,status] of [[3,'paid'],[4,'pending'],[5,'refunded']]){
  const order=randomUUID();await db.query("insert into orders values($1,$2,$3,'KRW',1000,now()-interval '2 days')",[order,ids[index],status]);await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),order,cohort]);
 }
 await db.query('update profiles set marketing_opt_out_at=now() where id=$1',[ids[6]]);
 assert.deepEqual((await manage()).counts,{total:8,candidate:1,inactive:1,order_hold:3,no_consent:2,no_phone:1});
 // Later purchase removes the sole candidate on fresh read; GET has no snapshot or queue side effects.
 const order=randomUUID();await db.query("insert into orders values($1,$2,'paid','KRW',1000,now())",[order,ids[7]]);await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),order,cohort]);assert.equal((await manage()).counts.candidate,0);
 await db.query("update orders set status='cancelled' where id=$1",[order]);assert.equal((await manage()).counts.candidate,1);
 await db.query("insert into payments values($1,$2,'done',1000,0)",[randomUUID(),order]);assert.equal((await manage()).counts.candidate,0);
 await db.query("update courses set status='archived' where id=$1",[paid]);assert.equal((await manage()).audienceState,'unavailable');assert.equal((await manage()).counts,null);
 await db.query('update edu_webinar_campaigns set enabled=false where id=$1',[campaign.id]);assert.equal((await manage()).audienceState,'paused');
 assert.equal((await db.query('select count(*)::int n from edu_webinar_followup_history')).rows[0].n,3);
 for(const table of ['edu_webinar_followups','edu_webinar_followup_history']){
  assert.equal((await db.query('select relrowsecurity v from pg_class where relname=$1',[table])).rows[0].v,true);
  for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) v',[role,table,priv])).rows[0].v,false);
 }
 for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'edu_manage_webinar_followup(uuid,uuid,jsonb)','EXECUTE') v",[role])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
