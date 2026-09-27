import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
test('live self-checkins require registration/open session, deduplicate by phase, preserve evidence and enforce grants',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text);create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,category text,list_price int,status text);create table cohorts(id uuid primary key,course_id uuid);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key,user_id uuid,status text,currency text,total_amount int,paid_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int);`);
 for(const file of ['202609210005_webinar_registration.sql','202609210006_webinar_attendance.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const admin=randomUUID(),user=randomUUID(),other=randomUUID(),staff=randomUUID(),free=randomUUID();
 await db.query("insert into profiles values($1,'admin','active'),($2,'student','active'),($3,'student','active'),($4,'staff','active')",[admin,user,other,staff]);
 await db.query("insert into courses values($1,'free',0,'published')",[free]);await db.exec("insert into edu_recruitment_links values('sample')");
 const campaign=(await db.query('select edu_manage_webinar($1,$2,$3) as v',[admin,'sample',{freeCourse:free,paidCohort:null,enabled:true,expected:0}])).rows[0].v.campaign;
 const manage=async(settings=null,actor=admin)=>(await db.query('select edu_manage_webinar_attendance($1,$2,$3) as v',[actor,campaign.id,settings])).rows[0].v;
 const settings=(expected,open=false,phase='first',url='https://www.youtube.com/watch?v=abcdefghijk')=>({expected,open,phase,url});
 const attend=async(phase=null,expected=null,actor=user)=>(await db.query('select edu_webinar_attendance($1,$2,$3,$4) as v',[campaign.id,actor,phase,expected])).rows[0].v;
 assert.deepEqual(await manage(),{sessions:[],unique:0,both:0});await assert.rejects(attend(),/REGISTER_FIRST/);
 await db.query('select edu_webinar_application($1,$2,$3,true,1,$4)',[campaign.id,user,'organic','2026-08-11']);
 assert.deepEqual(await attend(),{sessions:[]});await assert.rejects(manage(settings(0,true,'first',null)),/INVALID/);
 await assert.rejects(manage(settings(0,true,'first','https://evil.test')),/INVALID/);await manage(settings(0));await assert.rejects(attend('first',1),/CLOSED/);
 await manage(settings(1,true));await assert.rejects(manage(settings(1,true)),/STALE/);await assert.rejects(attend('first',1),/STALE/);
 await assert.rejects(attend('first',2,other),/REGISTER_FIRST/);
 const once=await attend('first',2);assert.equal(once.sessions[0].checked,true);assert.equal('count' in once.sessions[0],false);
 const timestamp=once.sessions[0].checkedAt;assert.equal((await attend('first',2)).sessions[0].checkedAt,timestamp);
 await assert.rejects(manage(settings(2,true,'first','https://www.youtube.com/watch?v=12345678901')),/URL_LOCKED/);
 await manage(settings(2,false));assert.equal((await attend('first',2)).sessions[0].checkedAt,timestamp);
 await manage(settings(0,true,'encore'));await attend('encore',1);
 let report=await manage();assert.equal(report.unique,1);assert.equal(report.both,1);assert.deepEqual(report.sessions.map(s=>s.count),[1,1]);
 await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:true}]);assert.equal((await manage(null,staff)).unique,1);
 await db.query('update site_settings set value=$1',[{marketing:true,products:false}]);await assert.rejects(manage(null,staff),/FORBIDDEN/);
 await db.query("update profiles set status='inactive' where id=$1",[user]);await assert.rejects(attend(),/FORBIDDEN/);await db.query("update profiles set status='active' where id=$1",[user]);
 await db.query("update courses set status='archived' where id=$1",[free]);await assert.rejects(attend(),/NOT_FOUND/);await db.query("update courses set status='published' where id=$1",[free]);
 await db.query("update edu_webinar_campaigns set enabled=false where id=$1",[campaign.id]);await assert.rejects(attend(),/NOT_FOUND/);await assert.rejects(manage(settings(1,true,'encore')),/INVALID/);await manage(settings(1,false,'encore'));assert.equal((await manage()).unique,1);
 assert.equal((await db.query('select count(*)::int as n from edu_webinar_session_history')).rows[0].n,5);
 for(const table of ['edu_webinar_sessions','edu_webinar_checkins','edu_webinar_session_history']){
 assert.equal((await db.query('select relrowsecurity as v from pg_class where relname=$1',[table])).rows[0].v,true);
 for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as v',[role,table,priv])).rows[0].v,false);
 }
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['edu_manage_webinar_attendance(uuid,uuid,jsonb)','edu_webinar_attendance(uuid,uuid,text,integer)'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) as v',[role,fn,'EXECUTE'])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
