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


for (const mode of ['retired', 'pre-retirement']) test(`reward saves explicit consent and one wallet coupon atomically (${mode})`, async t => {
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
    // Recreate only the Supabase platform objects referenced by these migrations.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, phone text);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create schema storage;
      create table storage.buckets(
        id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects(bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql
        as $$select string_to_array($1, chr(47))$$;
    `);

    for (const migration of migrations) {
      const path = mode === 'pre-retirement' && migration === '20261007011925_edu_optional_consent_e6'
        ? '../supabase/operations/edu_optional_consent_pre_retirement_bootstrap.sql'
        : `../supabase/migrations/${migration}.sql`;
      await db.exec(readFileSync(new URL(path, import.meta.url), 'utf8'));
    }

 if (mode === 'pre-retirement') {
  await db.exec(readFileSync(new URL('../supabase/operations/edu_consent_reward_campaign.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('select enabled from edu_consent_reward_config')).rows[0].enabled,false);
  assert.equal((await db.query('select count(*)::int n from customer_coupons')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from edu_personalization_terms')).rows[0].n,0);
  await db.exec(readFileSync(new URL('../supabase/operations/edu_consent_reward_activate.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query('select enabled from edu_consent_reward_config')).rows[0].enabled,true);
  await db.exec("delete from edu_consent_reward_config; delete from coupons where code='EDU_KAKAO_WELCOME_10000'");
 }

 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 for(let n=1;n<=5;n++)await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}')",[id(n),`reward${n}@example.invalid`]);
 await db.exec("grant select,update on profiles to service_role;");
 await db.exec("set role service_role");
 const read=async(member=id(1))=>(await db.query('select edu_consent_reward($1) v',[member])).rows[0].v;
 const owner=async(sql,params=[])=>{await db.exec('reset role');try{return params.length ? await db.query(sql,params) : await db.exec(sql);}finally{await db.exec('set role service_role');}};
 const make=async(choices,member=id(1))=>{const s=await read(member);return {choices,personalRevision:s.personalRevision,marketingRevision:s.marketingRevision,wordingVersion:s.terms?.version??null,marketingVersion:'2026-10-20'};};
 const save=async(req,payload,member=id(1))=>(await db.query('select edu_consent_reward($1,$2,$3) v',[member,id(req),payload])).rows[0].v;
 assert.equal((await read()).available,false);
 await owner("insert into coupons(id,name,code,discount_type,discount_value,product_scope,per_user_limit,minimum_order_amount,issue_target,exclude_free) values($1,'합성 쿠폰','REWARD_TEST','fixed',10000,'paid',1,0,'all',true)",[id(20)]);
 await owner('insert into edu_consent_reward_config(coupon_id,valid_days,enabled) values($1,30,true)',[id(20)]);
 const kakao={analysis:false,overseas:false,kakao:true},all={analysis:true,overseas:true,kakao:true};
 // Missing overseas terms does not force acceptance of overseas processing for the coupon.
 assert.equal((await read()).available,true);
 let p=await make(kakao);let r=await save(30,p);assert.equal(r.awarded,true);assert.deepEqual(await save(30,p),r);
 const wallet=(await db.query('select * from customer_coupons where user_id=$1',[id(1)])).rows[0];
 assert.equal(Math.round((new Date(wallet.expires_at)-new Date(wallet.issued_at))/86400000),30);
 assert.equal((await read()).handled,true);
 let personal=(await db.query('select edu_personalization_consent($1) v',[id(1)])).rows[0].v;
 assert.equal(personal.revision,null);assert.equal(personal.eligible,false);
 let ads=(await db.query('select edu_account_consent($1) v',[id(1)])).rows[0].v;
 assert.deepEqual(ads.choices,{marketingUse:true,kakao:true,sms:false,email:false});
 await assert.rejects(save(30,{...p,choices:all}),/CONFLICT/);
 await assert.rejects(save(31,p),/CONFLICT/);
 await owner("insert into edu_personalization_terms values('qa-v1','합성 분석 고지','합성 국외 이전 고지',now(),now(),true)");
 await db.query("select edu_account_consent($1,$2,$3,'profile','2026-10-20',null)",[id(2),id(40),{marketingUse:true,email:true,sms:false,kakao:false}]);
 p=await make(all,id(2));r=await save(41,p,id(2));assert.equal(r.awarded,true);
 ads=(await db.query('select edu_account_consent($1) v',[id(2)])).rows[0].v;assert.equal(ads.choices.email,true);assert.equal(ads.choices.sms,false);
 // Partial personalization alone gives no coupon and no advertising consent.
 r=await save(42,await make({analysis:true,overseas:false,kakao:false},id(3)),id(3));assert.equal(r.awarded,false);
 assert.equal((await db.query('select edu_account_consent($1) v',[id(3)])).rows[0].v.choices.kakao,false);
 // An issuance failure rolls back both consent systems and all receipts.
 await owner("create function reward_qa_fail() returns trigger language plpgsql as $$begin raise exception 'QA_ISSUE_FAILURE';end$$");
 await owner('create trigger reward_qa_fail before insert on customer_coupons for each row execute function reward_qa_fail()');
 const failed=await make(all,id(4));await assert.rejects(save(43,failed,id(4)),/QA_ISSUE_FAILURE/);
 assert.equal((await read(id(4))).personalRevision,null);assert.equal((await read(id(4))).marketingRevision,null);assert.equal((await read(id(4))).handled,false);
 await owner('drop trigger reward_qa_fail on customer_coupons');assert.equal((await save(43,failed,id(4))).awarded,true);
 // Withdrawal keeps the promised coupon; replay cannot re-enable any permission.
 await db.query("select edu_account_consent($1,$2,$3,'profile','2026-10-20',$4)",[id(2),id(44),{marketingUse:false,email:false,sms:false,kakao:false},id(41)]);
 await db.query('select edu_personalization_consent($1,$2,$3,null,$4)',[id(2),id(45),{analysis:false,overseas:false},id(41)]);
 await save(41,p,id(2));assert.equal((await db.query('select edu_account_consent($1) v',[id(2)])).rows[0].v.choices.kakao,false);
 await save(46,await make(kakao,id(2)),id(2));assert.equal((await db.query('select count(*)::int n from customer_coupons where user_id=$1',[id(2)])).rows[0].n,1);
 // Code entry alone must not confer the consent reward.
 await owner("insert into courses(id,course_code,slug,title,category,list_price,status) values($1,'REWARD_QA','reward-qa','합성 강의','paid_class',100000,'published')",[id(50)]);
 await owner("insert into cohorts(id,course_id,cohort_code,name,price,status) values($1,$2,'REWARD_QA_1','합성 기수',100000,'recruiting')",[id(51),id(50)]);
 await assert.rejects(db.query("select edu_coupon_quote($1,$2,'REWARD_TEST')",[id(5),id(51)]),/COUPON_MEMBER_NOT_ELIGIBLE/);
 let quote=(await db.query("select edu_coupon_quote($1,$2,'REWARD_TEST') v",[id(1),id(51)])).rows[0].v;assert.equal(quote.couponDiscount,10000);
 // Ordinary coupon regressions still pass under the updated quote function.
 await owner(readFileSync(new URL('./admin-coupon-lifecycle.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(db.query('select * from edu_consent_reward_awards'),/permission denied/);}
 await db.exec('reset role;set role service_role');await assert.rejects(db.exec('update edu_consent_reward_config set enabled=false'),/permission denied/);
 await owner("update profiles set status='withdrawn' where id=$1",[id(5)]);await assert.rejects(read(id(5)),/FORBIDDEN/);
});
