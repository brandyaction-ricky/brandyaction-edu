import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const migrations = [
  '202608040001_initial_education_platform',
  '202608060001_launch_transactions',
  '202608060002_security_hardening',
  '202608120006_crm',
  '202608160006_coupons',
  '202608160007_crm_automation_engine',
  '202608160008_customer_coupon_wallet',
  '202608160009_automatic_customer_tags',
  '202608190001_free_class_checkout',
  '202609080001_learning_missions_and_achievements',
  '20260914020500_configurable_customer_tag_rules',
  '20260914063811_configurable_tag_thresholds',
  '20260916074606_repair_payment_coupon_consistency',
  '20260916075611_align_zero_total_checkout',
  '20260927115057_admin_coupon_lifecycle',
  '20261007011925_edu_optional_consent_e6',
  '20261008074257_edu_personalization_consent',
  '20261008081424_edu_consent_reward',
];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('four purpose receipts, marketing-only coupon, one ask, CAS, replay and independent OFF withdrawals', async t=>{
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,phone text);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,chr(47))$$;`);
 for(const name of [...migrations,'20261017030825_edu_meta_purchase_delivery']) await db.exec(readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8'));
 for(let n=1;n<=10;n++) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",[id(n),`member${n}@example.invalid`]);
 // Existing choices retain their accepted wording during the additive backfill.
 await db.exec("insert into edu_personalization_terms values('p0','Old analysis','Old overseas',now(),now(),true)");
 await db.query('select edu_personalization_consent($1,$2,$3,$4,null)',[id(6),id(90),{analysis:true,overseas:true},'p0']);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261017053220_edu_welcome_four_consents.sql',import.meta.url),'utf8'));
 assert.deepEqual((await db.query('select analysis_wording_version,overseas_wording_version from edu_personalization_preferences where member_id=$1',[id(6)])).rows[0],{analysis_wording_version:'p0',overseas_wording_version:'p0'});
 await db.exec('update edu_personalization_terms set is_current=false');
 await db.exec("grant select,update on profiles to service_role;insert into edu_personalization_terms values('p1','Synthetic analysis','Synthetic overseas',now(),now(),true);insert into edu_meta_purchase_terms values('m1','Synthetic recipient','US','Synthetic items','Synthetic purpose','Synthetic transfer','Synthetic retention','Synthetic refusal','Synthetic contact',now(),now(),true)");
 await db.query("insert into coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit,minimum_order_amount,issue_target,exclude_free) values($1,'합성','FOUR_TEST','fixed',10000,'paid',1,0,'all',true)",[id(20)]);
 await db.query('insert into edu_consent_reward_config(coupon_id,valid_days,enabled) values($1,30,true)',[id(20)]);
 await db.exec('set role service_role');
 const read=async(member=id(1))=>(await db.query('select edu_welcome_consent($1) v',[member])).rows[0].v;
 const make=async(n,scope,changes={},member=id(1))=>{const s=await read(member);return {requestId:id(n),copyVersion:'edu-welcome-e-20261017',scope,choices:{email:s.marketing.choices.email,kakao:s.marketing.choices.kakao,analysis:s.personal.choices.analysis,overseas:s.personal.choices.overseas,meta:s.meta.consented,...changes},expected:{marketing:s.marketing.revision,personal:s.personal.revision,meta:s.meta.revision},versions:{personal:s.personal.terms?.version??null,meta:s.meta.terms?.version??null}};};
 const save=async(b,member=id(1),personal=true)=>(await db.query('select edu_welcome_consent($1,$2,$3,true,$4,true) v',[member,b.requestId,b,personal])).rows[0].v;
 let s=await read();assert.equal(s.handled,false);assert.equal((await read(id(6))).handled,true);assert.equal((await read(id(6))).personal.needsRenewal,true);
 // Email alone is sufficient: overseas/analysis/Meta stay false.
 const email=await make(30,'welcome',{email:true});s=await save(email);assert.equal(s.reward.awarded,true);assert.equal(s.personal.eligible,false);assert.equal(s.meta.consented,false);assert.equal(s.handled,true);
 assert.equal((await db.query('select count(*)::int n from edu_welcome_consent_events where member_id=$1',[id(1)])).rows[0].n,4);
 await save(email);assert.equal((await db.query('select count(*)::int n from customer_coupons where user_id=$1',[id(1)])).rows[0].n,1);
 await assert.rejects(save({...email,choices:{...email.choices,kakao:true}}),/CONFLICT/);
 const stale=await make(31,'marketing',{email:true,kakao:true});
 await save(await make(32,'marketing',{email:false,kakao:false}));await assert.rejects(save(stale),/CONFLICT/);
 s=await save(email);assert.equal(s.marketing.choices.email,false);assert.equal(s.reward.awarded,true);
 await save(await make(33,'marketing',{email:true}));assert.equal((await db.query('select count(*)::int n from customer_coupons where user_id=$1',[id(1)])).rows[0].n,1);
 // Dismiss persists on the account, makes no optional grant, and survives another read.
 await save(await make(40,'dismiss',{},id(2)),id(2));s=await read(id(2));assert.equal(s.handled,true);assert.equal(s.reward.awarded,false);assert.equal(s.personal.revision,null);
 await assert.rejects(save(await make(41,'welcome',{email:true},id(2)),id(2)),/ANSWERED/);
 // Non-marketing purposes never issue a coupon; changes preserve unrelated grants.
 s=await save(await make(50,'welcome',{analysis:true,overseas:true,meta:true},id(3)),id(3));assert.equal(s.reward.awarded,false);assert.equal(s.personal.eligible,true);assert.equal(s.meta.active,true);
 s=await save(await make(51,'analysis',{analysis:false},id(3)),id(3),false);assert.equal(s.personal.choices.overseas,true);assert.equal(s.personal.choices.analysis,false);assert.equal(s.meta.active,true);
 await assert.rejects(save(await make(52,'analysis',{analysis:true},id(3)),id(3),false),/DISABLED/);
 // A failed welcome transaction issues neither a coupon nor partial grants.
 await db.exec('reset role;update edu_consent_reward_config set enabled=false;set role service_role');
 await assert.rejects(save(await make(60,'welcome',{kakao:true,meta:true},id(4)),id(4)),/REWARD_UNAVAILABLE/);
 s=await read(id(4));assert.equal(s.marketing.revision,null);assert.equal(s.meta.revision,null);assert.equal(s.handled,false);
 assert.equal((await db.query('select count(*)::int n from edu_welcome_consent_events where member_id=$1',[id(4)])).rows[0].n,0);
 await db.exec('reset role;update edu_consent_reward_config set enabled=true;set role service_role');
 s=await save(await make(61,'welcome',{kakao:true},id(4)),id(4));assert.equal(s.reward.awarded,true);assert.equal(s.marketing.choices.email,false);
 assert.equal((await db.query('select wording_version from edu_consent_requests where member_id=$1',[id(4)])).rows[0].wording_version,'2026-10-17');
 await save(await make(62,'welcome',{analysis:true,overseas:true},id(5)),id(5));
 // A changed terms version does not turn a one-box withdrawal into renewal.
 await db.exec("reset role;update edu_personalization_terms set is_current=false;insert into edu_personalization_terms values('p2','New analysis','New overseas',now(),now(),true);set role service_role;");
 s=await save(await make(63,'analysis',{analysis:false},id(5)),id(5),false);assert.equal(s.personal.choices.overseas,true);assert.equal(s.personal.recordedVersion,'p1');assert.equal(s.personal.needsRenewal,true);assert.equal(s.personal.eligible,false);
 s=await save(await make(53,'overseas',{overseas:false},id(3)),id(3),false);assert.equal(s.personal.choices.overseas,false);assert.equal(s.meta.consented,true);
 // Re-consenting one checkbox updates only that wording; both current grants are required.
 s=await save(await make(64,'analysis',{analysis:true},id(5)),id(5));assert.deepEqual(s.personal.activeChoices,{analysis:true,overseas:false});assert.equal(s.personal.eligible,false);assert.equal(s.personal.needsRenewal,true);
 s=await save(await make(65,'overseas',{overseas:true},id(5)),id(5));assert.deepEqual(s.personal.activeChoices,{analysis:true,overseas:true});assert.equal(s.personal.eligible,true);assert.equal(s.personal.recordedVersion,'p2');
 assert.equal((await db.query("select wording_version from edu_welcome_consent_events where member_id=$1 and request_id=$2 and kind='analysis'",[id(5),id(64)])).rows[0].wording_version,'p2');
 // Withdrawal of the account clears every purpose and records four withdrawals.
 await db.exec('reset role');await db.query("update profiles set status='withdrawn' where id=$1",[id(3)]);
 assert.equal((await db.query('select analysis or overseas as any from edu_personalization_preferences where member_id=$1',[id(3)])).rows[0].any,false);
 assert.equal((await db.query('select consented from edu_meta_purchase_preferences where member_id=$1',[id(3)])).rows[0].consented,false);
 assert.equal((await db.query("select count(*)::int n from edu_welcome_consent_events where member_id=$1 and surface='withdrawal'",[id(3)])).rows[0].n,4);
 for(const role of ['anon','authenticated']) {await db.exec('reset role;set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(db.query('select * from edu_consent_prompts'),/permission denied/);}
});
