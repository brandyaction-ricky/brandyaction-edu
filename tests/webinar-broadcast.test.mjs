import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('broadcast entry preserves revisions, distinguishes destinations, gates configuration and caps raw requests',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text);create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,category text,list_price int,status text);create table cohorts(id uuid primary key,course_id uuid);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key,user_id uuid,status text,currency text,total_amount int,paid_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int);`);
 for(const file of ['202609210005_webinar_registration.sql','202609210006_webinar_attendance.sql','202609210007_broadcast_entry.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const admin=randomUUID(),staff=randomUUID(),free=randomUUID(),paid=randomUUID(),cohort=randomUUID();
 await db.query("insert into profiles values($1,'admin','active'),($2,'staff','active')",[admin,staff]);await db.query("insert into courses values($1,'free',0,'published'),($2,'paid_class',1000,'published')",[free,paid]);await db.query('insert into cohorts values($1,$2)',[cohort,paid]);await db.exec("insert into edu_recruitment_links values('sample')");
 const campaign=(await db.query('select edu_manage_webinar($1,$2,$3) as v',[admin,'sample',{freeCourse:free,paidCohort:null,enabled:true,expected:0}])).rows[0].v.campaign;
 const manage=async(settings=null,actor=admin)=>(await db.query('select edu_manage_broadcast($1,$2,$3) as v',[actor,campaign.id,settings])).rows[0].v;
 const settings=(expected,enabled=true,offerEnabled=false,url='https://www.youtube.com/watch?v=abcdefghijk',phase='first')=>({phase,url,enabled,offerEnabled,expected});
 const visit=async(record=false,target='live',channel='paid',phase='first')=>(await db.query('select edu_broadcast_destination($1,$2,$3,$4,$5) as v',[campaign.id,phase,channel,target,record])).rows[0].v;
 assert.equal((await manage()).offerReady,false);await assert.rejects(manage(settings(0,true,true)),/INVALID/);await assert.rejects(manage(settings(0,true,false,null)),/INVALID/);
 await manage(settings(0));assert.equal((await visit()).url,'https://www.youtube.com/watch?v=abcdefghijk');assert.deepEqual((await manage()).counts,[]);
 await visit(true);await visit(true,'live','organic');let counts=(await manage()).counts;assert.equal(counts.length,2);assert.equal(counts[0].requests,1);
 await assert.rejects(visit(true,'offer'),/NOT_FOUND/);await assert.rejects(visit(true,'live','invalid'),/INVALID/);await assert.rejects(manage(settings(0)),/STALE/);
 await manage(settings(1,true,false,'https://www.youtube.com/watch?v=12345678901'));assert.equal((await visit()).url,'https://www.youtube.com/watch?v=12345678901');
 assert.equal((await db.query('select destination from edu_broadcast_visits limit 1')).rows[0].destination,'https://www.youtube.com/watch?v=abcdefghijk');
 await db.query('select edu_manage_webinar($1,$2,$3)',[admin,'sample',{freeCourse:free,paidCohort:cohort,enabled:true,expected:1}]);
 await manage(settings(2,true,true));assert.equal((await visit(true,'offer','unknown')).url,'/classes/'+paid);
 await manage(settings(3,false,true));await assert.rejects(visit(true),/NOT_FOUND/);assert.equal((await visit(false,'offer')).url,'/classes/'+paid);
 await db.query("update courses set status='archived' where id=$1",[paid]);await assert.rejects(visit(true,'offer'),/NOT_FOUND/);await db.query("update courses set status='published' where id=$1",[paid]);
 await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:false}]);await assert.rejects(manage(null,staff),/FORBIDDEN/);
 await manage(settings(4,true,false));
 await db.query("insert into edu_broadcast_visits(campaign_id,phase,channel,target,revision,destination) select $1,'first','paid','live',5,'https://www.youtube.com/watch?v=abcdefghijk' from generate_series(1,1000)",[campaign.id]);
 assert.equal((await visit(true)).recorded,false);assert.equal((await visit(true)).url,'https://www.youtube.com/watch?v=abcdefghijk');
 await db.query('update edu_webinar_campaigns set enabled=false where id=$1',[campaign.id]);await assert.rejects(visit(),/NOT_FOUND/);await manage(settings(5,false,false));
 assert.equal((await db.query('select count(*)::int as n from edu_broadcast_history')).rows[0].n,6);
 assert.equal((await db.query("select is_open from edu_webinar_sessions where phase='first'")).rows[0].is_open,false);
 for(const table of ['edu_broadcast_history','edu_broadcast_visits']){
 assert.equal((await db.query('select relrowsecurity as v from pg_class where relname=$1',[table])).rows[0].v,true);
 for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as v',[role,table,priv])).rows[0].v,false);
 }
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['edu_manage_broadcast(uuid,uuid,jsonb)','edu_broadcast_destination(uuid,text,text,text,boolean)'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) as v',[role,fn,'EXECUTE'])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
