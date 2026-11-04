import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const bootstrap = read('../supabase/operations/edu_optional_consent_pre_retirement_bootstrap.sql');
const retirement = read('../supabase/migrations/20261007011925_edu_optional_consent_e6.sql');

test('coupon bootstrap preserves untouched legacy members; cutoff remains explicit and new consent survives', async t => {
 const db = new PGlite(); t.after(() => db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',full_name text,
 marketing_consent boolean default false,marketing_consent_at timestamptz,marketing_opt_out_at timestamptz);`);
 const legacy = randomUUID(), fresh = randomUUID(), request = randomUUID();
 await db.query("insert into profiles(id,marketing_consent,marketing_consent_at) values($1,true,'2026-09-01T00:00:00Z'),($2,false,null)",[legacy,fresh]);
 const before = (await db.query('select marketing_consent,marketing_consent_at,marketing_opt_out_at from profiles where id=$1',[legacy])).rows;
 await db.exec(bootstrap);
 assert.deepEqual((await db.query('select marketing_consent,marketing_consent_at,marketing_opt_out_at from profiles where id=$1',[legacy])).rows,before);
 assert.equal((await db.query('select count(*)::int n from edu_consent_events')).rows[0].n,0);
 assert.equal((await db.query('select edu_account_consent($1) v',[legacy])).rows[0].v.legacyActive,true);
 // Unrelated edits and legacy clients stay usable until the approved cutoff.
 await db.query('update profiles set full_name=$2,marketing_consent=true where id=$1',[legacy,'Synthetic']);
 await db.query("select edu_account_consent($1,$2,$3,'profile','2026-10-20',null)",[fresh,request,{marketingUse:true,kakao:true,sms:false,email:false}]);
 await assert.rejects(db.query('update profiles set marketing_consent=true where id=$1',[fresh]),/CONSENT_MIGRATION_REQUIRED/);
 await assert.rejects(db.exec(bootstrap),/CONSENT_BOOTSTRAP_ALREADY_INSTALLED/);
 await db.exec('rollback');
 const withdrawing = randomUUID();
 await db.query('insert into profiles(id,marketing_consent) values($1,true)',[withdrawing]);
 await db.query("select edu_account_consent($1,$2,$3,'profile','2026-10-20',null)",[withdrawing,randomUUID(),{marketingUse:false,sms:false,kakao:false,email:false}]);
 assert.equal((await db.query('select marketing_consent from profiles where id=$1',[withdrawing])).rows[0].marketing_consent,false);
 assert.equal((await db.query('select edu_account_consent($1) v',[withdrawing])).rows[0].v.legacyActive,false);
 // Applying the original migration later performs the agreed retirement once.
 await db.exec(retirement);
 assert.equal((await db.query('select marketing_consent from profiles where id=$1',[legacy])).rows[0].marketing_consent,false);
 const snapshot = (await db.query('select edu_account_consent($1) v',[fresh])).rows[0].v;
 assert.equal(snapshot.choices.kakao,true); assert.equal(snapshot.revision,request);
 assert.equal((await db.query("select count(*)::int n from edu_consent_events where kind='legacy'")).rows[0].n,1);
 await db.exec(retirement);
 assert.equal((await db.query("select count(*)::int n from edu_consent_events where kind='legacy'")).rows[0].n,1);
 // After cutoff, bootstrapping cannot weaken the strict guard again.
 await assert.rejects(db.exec(bootstrap),/CONSENT_BOOTSTRAP_ALREADY_INSTALLED/);
 await db.exec('rollback');
 await assert.rejects(db.query('update profiles set marketing_consent=true where id=$1',[legacy]),/CONSENT_MIGRATION_REQUIRED/);
});
