import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID as id} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
const read=file=>fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
test('E2 coupon designation, atomic source recording and cohort recruitment coverage preserve completed records',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text,phone text,marketing_consent boolean,marketing_consent_at timestamptz,marketing_opt_out_at timestamptz,full_name text,email text,is_internal boolean default false,deleted_at timestamptz);
 create table site_settings(key text primary key,value jsonb);create table courses(id uuid primary key,category text,list_price int,status text);
 create table cohorts(id uuid primary key,course_id uuid,recruitment_start_at timestamptz,recruitment_end_at timestamptz);
 create table edu_recruitment_links(period_id text primary key);
 create table orders(id uuid primary key default gen_random_uuid(),user_id uuid,status text,currency text default 'KRW',total_amount int,paid_at timestamptz,coupon_id uuid,entry_src text,is_test_order boolean default false);
 create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,cohort_id uuid);create table payments(id uuid primary key default gen_random_uuid(),order_id uuid,status text,approved_amount int,cancelled_amount int);
 create table coupons(id uuid primary key,name text,description text,code text unique,discount_type text,discount_value int,max_discount_amount int,minimum_order_amount int,usage_limit int,per_user_limit int,product_scope text,issue_target text,target_tag_id uuid,exclude_free boolean,starts_at timestamptz,ends_at timestamptz,issue_start_at timestamptz,issue_end_at timestamptz,is_active boolean,is_draft boolean,created_by uuid,updated_at timestamptz);
 create table coupon_products(coupon_id uuid,course_id uuid);create table audit_logs(id bigserial,actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create table crm_templates(id uuid primary key,name text,channel text,purpose text,content text,is_active boolean);
 create table crm_campaigns(id uuid primary key default gen_random_uuid(),name text,template_id uuid,status text,scheduled_at timestamptz,created_by uuid,recipient_count int,target_tag_id uuid,error_message text,created_at timestamptz default now());
 create table qa_entitlements(order_id uuid);
 create function public.edu_checkout_with_coupon(p_user_id uuid,p_cohort_id uuid,p_customer_name text,p_customer_email text,p_customer_phone text,p_terms_version text,p_privacy_version text,p_refund_policy_version text,p_code text)
 returns jsonb language plpgsql as $$ declare oid uuid:=gen_random_uuid();cid uuid;amount int:=case when p_code='FREE' then 0 else 1000 end;begin
 select id into cid from public.coupons where code=p_code;
 insert into public.orders(id,user_id,status,total_amount,paid_at,coupon_id) values(oid,case when p_code='WRONG_OWNER' then null else p_user_id end,'paid',amount,now(),cid);
 insert into public.order_items(order_id,cohort_id) values(oid,p_cohort_id);
 if amount=0 or p_code='WRONG_OWNER' then insert into public.qa_entitlements values(oid);end if;
 return jsonb_build_object('orderId',oid,'totalAmount',amount,'free',amount=0);end;$$;`);
 for(const file of ['202609210005_webinar_registration.sql','202609210006_webinar_attendance.sql','202609210007_broadcast_entry.sql','202609210008_webinar_followup.sql','202609210010_recruitment_delivery.sql'])await db.exec(read(file));
 const e1=read('20261005020515_edu_internal_order_analytics_e1.sql');await db.exec(e1.slice(e1.indexOf('create view public.edu_analytics_members'),e1.indexOf('create function public.edu_set_analytics_exclusion')));
 await db.exec(read('20261005024620_edu_entry_source_e2.sql'));
 const admin=id(),student=id(),internal=id(),course=id(),cohort=id(),alumni=id(),normal=id();
 await db.query("insert into profiles(id,role,status,is_internal) values($1,'admin','active',true),($2,'student','active',false),($3,'student','active',true)",[admin,student,internal]);
 await db.query("insert into courses values($1,'paid_class',1000,'published')",[course]);await db.query("insert into cohorts values($1,$2,'2020-01-01','2100-01-01')",[cohort,course]);await db.exec("insert into edu_recruitment_links values('cohort')");await db.query("insert into edu_webinar_campaigns(period_id,free_course_id,paid_cohort_id,revision) values('cohort',$1,$2,1)",[course,cohort]);
 const save=(key,values)=>db.query('select edu_save_coupon($1,$2,$3,$4) v',[admin,key,{name:'QA',code:key===alumni?'ALUMNI':'NORMAL',discount_type:'fixed',discount_value:500,...values},[]]);
 await save(alumni,{is_alumni:true});await save(normal,{});
 const checkout=async(code,src=null,user=student)=>(await db.query('select edu_checkout_with_source($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v',[user,cohort,'QA','qa@example.invalid','01000000000','qa','qa','qa',code,src])).rows[0].v;
 const a=await checkout('ALUMNI','paid');assert.equal(a.entrySource,'alumni');assert.equal(a.entrySourceRecorded,true);
 const paid=await checkout('NORMAL','paid');assert.equal(paid.entrySource,'paid');const unknown=await checkout('NORMAL');assert.equal(unknown.entrySource,null);
 const free=await checkout('FREE','youtube');assert.equal(free.free,true);assert.equal(free.entrySource,'youtube');assert.equal((await db.query('select count(*)::int n from qa_entitlements')).rows[0].n,1);
 const before=(await db.query('select count(*)::int n from orders')).rows[0].n;
 await assert.rejects(checkout('WRONG_OWNER','paid'),/ORDER_MISSING/);assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,before);assert.equal((await db.query('select count(*)::int n from qa_entitlements')).rows[0].n,1);
 await assert.rejects(checkout('ALUMNI','unknown'),/INVALID/);
 await save(alumni,{});assert.equal((await db.query('select is_alumni from coupons where id=$1',[alumni])).rows[0].is_alumni,true);
 await save(alumni,{is_alumni:false});assert.equal((await db.query('select entry_src from orders where id=$1',[a.orderId])).rows[0].entry_src,'alumni');
 const future=await checkout('ALUMNI','organic');assert.equal(future.entrySource,'organic');
 const excluded=await checkout('NORMAL','paid',internal);const testOrder=await checkout('NORMAL','paid');await db.query('update orders set is_test_order=true where id=$1',[testOrder.orderId]);
 const early=await checkout('NORMAL');await db.query("update orders set paid_at='2019-01-01' where id=$1",[early.orderId]);const late=await checkout('NORMAL');await db.query("update orders set paid_at='2100-01-01' where id=$1",[late.orderId]);
 for(const o of [a,paid,unknown,future,excluded,testOrder,early,late])await db.query("insert into payments(order_id,status,approved_amount,cancelled_amount) values($1,'done',1000,0)",[o.orderId]);
 await db.query('insert into order_items(order_id,cohort_id) values($1,$2)',[paid.orderId,cohort]);
 const coverage=async(actor=admin)=>(await db.query('select edu_entry_source_coverage($1,$2) v',[actor,'cohort'])).rows[0].v;
 let c=await coverage();assert.equal(c.total,4);assert.equal(c.unknown,1);assert.equal(c.rate,25);assert.equal(c.overTarget,true);assert.deepEqual(c.sources,{paid:1,organic:1,alumni:1,youtube:0});
 await db.query("update orders set status='refunded' where id=$1",[paid.orderId]);await db.query("update payments set status='cancelled',cancelled_amount=approved_amount where order_id=$1",[paid.orderId]);assert.equal((await coverage()).total,4);
 await assert.rejects(coverage(student),/FORBIDDEN/);
 await db.query('update cohorts set recruitment_start_at=null where id=$1',[cohort]);assert.equal((await coverage()).state,'unconfigured');
 assert.equal((await db.query("select has_function_privilege('authenticated','public.edu_checkout_with_source(uuid,uuid,text,text,text,text,text,text,text,text)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.edu_save_coupon(uuid,uuid,jsonb,uuid[])','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
