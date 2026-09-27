import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('recruitment review, reservation and claim isolate recipients and suppress stale, opted-out, purchased and duplicate recipients',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text,phone text,marketing_consent boolean,marketing_consent_at timestamptz,marketing_opt_out_at timestamptz,full_name text,email text);
 create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,category text,list_price int,status text);create table cohorts(id uuid primary key,course_id uuid);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key,user_id uuid,status text,currency text,total_amount int,paid_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int);
 create table crm_templates(id uuid primary key,name text,channel text,purpose text,content text,is_active boolean);
 create table crm_campaigns(id uuid primary key default gen_random_uuid(),name text,template_id uuid,status text,scheduled_at timestamptz,created_by uuid,recipient_count int,target_tag_id uuid,error_message text,created_at timestamptz default now());`);
 for(const file of ['202609210005_webinar_registration.sql','202609210006_webinar_attendance.sql','202609210007_broadcast_entry.sql','202609210008_webinar_followup.sql','202609210010_recruitment_delivery.sql'])await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const admin=randomUUID(),staff=randomUUID(),free=randomUUID(),paid=randomUUID(),cohort=randomUUID(),template=randomUUID();
 await db.query("insert into profiles(id,role,status) values($1,'admin','active'),($2,'staff','active')",[admin,staff]);
 await db.query("insert into courses values($1,'free',0,'published'),($2,'paid_class',1650000,'draft')",[free,paid]);
 await db.query('insert into cohorts values($1,$2)',[cohort,paid]);await db.exec("insert into edu_recruitment_links values('sample'),('other')");
 const code=(await db.query('select edu_manage_webinar($1,$2,$3) v',[admin,'sample',{freeCourse:free,paidCohort:cohort,enabled:true,expected:0}])).rows[0].v.campaign.id;
 await db.query('select edu_manage_webinar($1,$2,$3)',[admin,'other',{freeCourse:free,paidCohort:null,enabled:true,expected:0}]);
 await db.query("insert into crm_templates values($1,'QA','lms','marketing','합성 문구',true)",[template]);
 const call=async({tpl=template,purpose='encore',schedule=null,actor=admin}={})=>(await db.query('select edu_prepare_recruitment_delivery($1,$2,$3,$4,$5) v',[actor,code,tpl,purpose,schedule])).rows[0].v;
 const reserve=async(review,purpose='encore')=>call({purpose,schedule:{token:review.token,name:'QA only',at:new Date(Date.now()+600000).toISOString()}});
 const claim=async(id)=>(await db.query('select edu_claim_recruitment_delivery($1) v',[id])).rows[0].v;
 const due=async(id)=>{
  // Advance only the test reservation's clock; production trigger rejects rescheduling.
  await db.exec('alter table crm_campaigns disable trigger edu_guard_recruitment_campaign');
  await db.query("update crm_campaigns set status='sending',scheduled_at=now()-interval '1 second' where id=$1",[id]);
  await db.exec('alter table crm_campaigns enable trigger edu_guard_recruitment_campaign');
 };
 assert.equal((await call({tpl:null})).state,'unavailable');await assert.rejects(call(),/UNAVAILABLE/);
 await assert.rejects(call({tpl:null,actor:staff}),/FORBIDDEN/);
 await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:true,members:true,orders:true}]);
 assert.equal((await call({tpl:null,actor:staff})).state,'unavailable');
 await db.query("update courses set status='published' where id=$1",[paid]);
 const members=[];
 for(let i=0;i<9;i++){
  const id=randomUUID();members.push(id);await db.query("insert into profiles values($1,'member','active',$2,true,now()-interval '1 day',null,'QA','qa@example.invalid')",[id,'0100000000'+i]);
  await db.query("insert into edu_webinar_registrations(period_id,user_id,channel,policy_version) values($1,$2,'organic','2026-08-11')",[i===8?'other':'sample',id]);
 }
 await db.query("update profiles set status='suspended' where id=$1",[members[0]]);
 await db.query('update profiles set marketing_consent=false where id=$1',[members[1]]);
 await db.query("update profiles set phone='' where id=$1",[members[2]]);
 await db.query("update profiles set phone='01000000003' where id=$1",[members[4]]);
 const order=randomUUID();await db.query("insert into orders values($1,$2,'pending','KRW',1650000,null)",[order,members[5]]);await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),order,cohort]);
 let review=await call();assert.deepEqual(review.counts,{total:8,candidate:2,inactive:1,no_consent:1,no_phone:1,shared_phone:2,order_hold:1,duplicate:0});
 assert.equal(JSON.stringify(review).includes('010000'),false);assert.equal(JSON.stringify(review).includes(members[6]),false);
 assert.equal((await db.query('select count(*)::int n from crm_campaigns')).rows[0].n,0);
 await db.query("update crm_templates set content='수정 문구' where id=$1",[template]);await assert.rejects(reserve(review),/STALE/);
 review=await call();const reservation=await reserve(review);await assert.rejects(reserve(review),/STALE/);
 const id=reservation.campaignId;assert.ok(id);
 await assert.rejects(db.query('update crm_campaigns set recruitment_id=null where id=$1',[id]),/INVALID/);
 await assert.rejects(db.query('update crm_campaigns set target_tag_id=$1 where id=$2',[randomUUID(),id]),/INVALID/);
 await assert.rejects(claim(id),/INVALID/);await due(id);
 await db.query('update profiles set marketing_opt_out_at=now() where id=$1',[members[6]]);
 // Newly registered eligible people cannot expand the reviewed snapshot.
 const later=randomUUID();await db.query("insert into profiles values($1,'member','active','01099999999',true,now()-interval '1 day',null,'QA','qa@example.invalid')",[later]);
 await db.query("insert into edu_webinar_registrations(period_id,user_id,channel,policy_version) values('sample',$1,'organic','2026-08-11')",[later]);
 const batch=await claim(id);assert.deepEqual(batch.members.map(m=>m.id),[members[7]]);assert.equal(batch.excluded,1);
 assert.deepEqual((await claim(id)).members,[]); // Lost provider response never auto-retries.
 await db.query("update crm_campaigns set status='failed' where id=$1",[id]);await assert.rejects(db.query("update crm_campaigns set status='scheduled' where id=$1",[id]),/INVALID/);
 assert.equal((await call()).counts.duplicate,1);
 const id2=(await reserve(await call())).campaignId;await due(id2);
 const order2=randomUUID();await db.query("insert into orders values($1,$2,'cancelled','KRW',1650000,null)",[order2,later]);await db.query('insert into order_items values($1,$2,$3)',[randomUUID(),order2,cohort]);
 await db.query("insert into payments values($1,$2,'done',1650000,0)",[randomUUID(),order2]);assert.deepEqual((await claim(id2)).members,[]);
 await db.query("update crm_campaigns set status='completed' where id=$1",[id2]);
 // Different purpose can be separately reviewed, but template edits invalidate dispatch.
 const offer=(await reserve(await call({purpose:'offer'}),'offer')).campaignId;await due(offer);
 await db.query("update crm_templates set content='다른 문구' where id=$1",[template]);await assert.rejects(claim(offer),/STALE/);
 await db.query("update crm_campaigns set status='failed' where id=$1",[offer]);
 const cancelId=(await reserve(await call({purpose:'offer'}),'offer')).campaignId;
 const cancelled=await call({tpl:null,schedule:{cancel:cancelId}});assert.equal(cancelled.reservations.find(r=>r.id===cancelId).status,'cancelled');await assert.rejects(call({tpl:null,schedule:{cancel:cancelId}}),/STALE/);
 // Permissions revoked after reservation and mapping changes both stop dispatch.
 const staffReview=await call({purpose:'offer',actor:staff});
 const staffReservation=await call({purpose:'offer',actor:staff,schedule:{token:staffReview.token,name:'Staff QA',at:new Date(Date.now()+600000).toISOString()}});
 await due(staffReservation.campaignId);
 await db.query("update site_settings set value='{}' where key=$1",['edu_staff_permissions_'+staff]);
 await assert.rejects(claim(staffReservation.campaignId),/FORBIDDEN/);
 await db.query('update site_settings set value=$1 where key=$2',[{marketing:true,products:true,members:true,orders:true},'edu_staff_permissions_'+staff]);
 await db.query('update edu_webinar_campaigns set revision=revision+1 where id=$1',[code]);
 await assert.rejects(claim(staffReservation.campaignId),/STALE/);
 // No private identities/claims can be read with API roles, including service_role.
 for(const table of ['edu_recruitment_deliveries','edu_recruitment_delivery_claims'])for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) v',[role,table,priv])).rows[0].v,false);
 for(const signature of ['edu_prepare_recruitment_delivery(uuid,uuid,uuid,text,jsonb)','edu_claim_recruitment_delivery(uuid)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') v",[role,signature])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
