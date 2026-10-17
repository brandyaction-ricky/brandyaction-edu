import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const migrations=['202608040001_initial_education_platform','202608060001_launch_transactions','202608060002_security_hardening','202608120006_crm','202608160006_coupons','202608160007_crm_automation_engine','202608160008_customer_coupon_wallet','202608160009_automatic_customer_tags','202608190001_free_class_checkout','202609080001_learning_missions_and_achievements','20260914020500_configurable_customer_tag_rules','20260914063811_configurable_tag_thresholds','20260916074606_repair_payment_coupon_consistency','20260916075611_align_zero_total_checkout','20260927115057_admin_coupon_lifecycle'];
test('Meta Purchase queue integrates with verified card/VA finalization, deduplicates, revokes, expires and denies browser roles',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,phone text);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,chr(47))$$;`);
 for(const name of migrations)await db.exec(readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
 // Match Supabase's existing server-role access to platform tables; browser roles get no new access.
 await db.exec('grant select,insert,update,delete on all tables in schema public to service_role;');
 await db.exec(readFileSync(new URL('../supabase/migrations/20261017030825_edu_meta_purchase_delivery.sql',import.meta.url),'utf8'));
 const member=randomUUID(),course=randomUUID(),cohort=randomUUID();
 await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'Buyer@synthetic-education.org',now(),'{}')",[member]);
 await db.query("insert into courses(id,course_code,slug,title,category,list_price,status) values($1,'synthetic','synthetic','Synthetic class','paid_class',100000,'published')",[course]);
 await db.query("insert into cohorts(id,course_id,cohort_code,name,price,status) values($1,$2,'synthetic','Synthetic cohort',100000,'recruiting')",[cohort,course]);
 const val=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
 const count=()=>val('select count(*)::int v from edu_meta_purchase_outbox');
 const consent=async(on=true)=>{const revision=await val('select revision v from edu_meta_purchase_preferences where member_id=$1',[member]);return val("select edu_meta_purchase_consent($1,$2,$3,$4,$5,'profile') v",[member,randomUUID(),revision||null,on,on?'synthetic-v1':null]);};
 const order=async(amount=90000)=>{const id=randomUUID();await db.query("insert into orders(id,order_number,user_id,subtotal,discount_amount,total_amount,customer_name,customer_email,terms_version,privacy_version,refund_policy_version,expires_at) values($1,$2,$3,100000,$4,$5,'Synthetic','synthetic@fixture.invalid','test','test','test',now()+interval '30 minutes')",[id,'synthetic-'+id,member,100000-amount,amount]);await db.query("insert into order_items(order_id,course_id,cohort_id,item_name,unit_price) values($1,$2,$3,'Synthetic class',$4)",[id,course,cohort,amount]);return id;};
 const capture=id=>val('select edu_capture_meta_purchase($1,$2,$3) v',[member,id,{userAgent:'Synthetic UA',sourceUrl:'https://brandyaction-edu.com/checkout',fbp:'fb.1.1792195200000.12345',fbc:null}]);
 const times=new Map();
 const pay=async(id,method='카드')=>{if(!times.has(id))times.set(id,await val('select now() v'));const o=(await db.query('select order_number,total_amount from orders where id=$1',[id])).rows[0];return val("select finalize_toss_payment($1,$2,$3,$4,null,$5,$6) v",[o.order_number,'synthetic-key-'+id,method,o.total_amount,{paymentKey:'synthetic-key-'+id,orderId:o.order_number,status:'DONE',currency:'KRW',totalAmount:o.total_amount},times.get(id)]);};
 const claim=()=>val('select edu_claim_meta_purchase() v');
 const authorize=j=>val('select edu_authorize_meta_purchase($1,$2) v',[j.orderId,j.lease]);
 const finish=(j,outcome='sent')=>val('select edu_finish_meta_purchase($1,$2,$3,$4) v',[j.orderId,j.lease,outcome,'synthetic_trace']);
 assert.equal(await count(),0);
 const before=await order();assert.equal(await capture(before),false);await pay(before);assert.equal(await count(),0);
 await db.exec("insert into edu_meta_purchase_terms values('synthetic-v1','Synthetic recipient','Synthetic country','Synthetic items','Synthetic purpose','Synthetic transfer','Synthetic retention','Synthetic refusal','Synthetic contact',now(),now(),true)");
 await db.query("insert into edu_meta_purchase_config(singleton,enabled,dataset,starts_at,course_ids) values(true,true,'5567287373411934',now()-interval '1 day',$1)",[[course]]);
 await db.exec('set role service_role');await consent();
 const card=await order();assert.equal(await capture(card),true);assert.equal(await capture(card),false);
 assert.equal(await val('select email_hash v from edu_meta_purchase_contexts where order_id=$1',[card]),createHash('sha256').update('buyer@synthetic-education.org').digest('hex'));
 await pay(card);await pay(card);assert.equal(await count(),1);
 let j=await claim();assert.equal(j.amount,90000);assert.equal(j.orderId,card);assert.equal(j.email,undefined);assert.equal(await claim(),null);assert.equal(await authorize(j),true);
 assert.equal(await finish({...j,lease:randomUUID()}),false);assert.equal(await finish(j,'retry'),true);
 assert.equal(await claim(),null);await db.query('update edu_meta_purchase_outbox set next_at=now() where order_id=$1',[card]);
 const retry=await claim();assert.equal(retry.eventId,j.eventId);assert.equal(retry.eventTime,j.eventTime);assert.notEqual(retry.lease,j.lease);assert.equal(await authorize(retry),true);await finish(retry);
 assert.equal(await val('select count(*)::int v from edu_meta_purchase_contexts where order_id=$1',[card]),0);
 await pay(card);assert.equal(await count(),1);assert.equal(await claim(),null);
 const va=await order();await capture(va);
 await db.query("update orders set expires_at=now()+interval '2 days' where id=$1",[va]);
 assert.ok(new Date(await val('select expires_at v from edu_meta_purchase_contexts where order_id=$1',[va]))>new Date(Date.now()+86400000));
 assert.equal(await claim(),null);await pay(va,'가상계좌');j=await claim();assert.equal(j.orderId,va);await finish(j);
 // Explicit withdrawal cancels a claimed event and cannot be resurrected by re-opt-in.
 const revoked=await order();await capture(revoked);await pay(revoked);j=await claim();await consent(false);assert.equal(await authorize(j),false);assert.equal(await finish(j),false);await consent(true);assert.equal(await claim(),null);
 // Historical orders and post-purchase opt-in cannot be backfilled.
 assert.equal(await capture(before),false);await pay(before);assert.equal(await claim(),null);
 const refund=await order();await capture(refund);await pay(refund);await db.query("update orders set status='partially_refunded' where id=$1",[refund]);assert.equal(await claim(),null);
 const pendingRefund=await order();await capture(pendingRefund);await pay(pendingRefund);await db.query("insert into refunds(payment_id,amount,reason) select id,1,'Synthetic' from payments where order_id=$1",[pendingRefund]);assert.equal(await claim(),null);
 await db.exec('select edu_meta_purchase_cleanup()');
 const changed=await order();await capture(changed);await pay(changed);j=await claim();await db.query('update edu_meta_purchase_outbox set amount=1 where order_id=$1',[changed]);assert.equal(await authorize(j),false);
 const expired=await order();await capture(expired);await pay(expired);await db.query("update edu_meta_purchase_outbox set event_time=now()-interval '25 hours' where order_id=$1",[expired]);await db.exec('select edu_meta_purchase_cleanup()');assert.equal(await claim(),null);
 // No verified email means no conversion context.
 await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[member]);await db.exec('set role service_role');assert.equal(await capture(await order()),false);
 await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[member]);await db.exec('set role service_role');
 const paused=await order();await capture(paused);await pay(paused);j=await claim();await finish(j,'blocked');assert.equal(await val('select enabled v from edu_meta_purchase_config'),false);assert.equal(await claim(),null);
 assert.equal(await capture(await order()),false);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);for(const table of ['edu_meta_purchase_contexts','edu_meta_purchase_outbox','edu_meta_purchase_config'])await assert.rejects(db.exec('select * from '+table),/permission denied/);await assert.rejects(claim(),/permission denied/);}
});
