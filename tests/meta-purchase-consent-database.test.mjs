import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('Meta consent is separate, versioned, revocable, idempotent and inaccessible to browser roles', async t => {
 const db = new PGlite(); t.after(() => db.close());
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,status text default 'active',marketing_consent boolean default false);grant select,update on profiles to service_role;");
 await db.exec(readFileSync(new URL('../supabase/migrations/20261017030825_edu_meta_purchase_delivery.sql',import.meta.url),'utf8').split('-- Purchase delivery')[0]+'commit;');
 await db.query('insert into profiles(id) values($1),($2)',[id(1),id(2)]);
 const read = async (member=id(1)) => (await db.query('select edu_meta_purchase_consent($1) as v',[member])).rows[0].v;
 const save = async (n, consented, version=null, expected=null, surface='signup', member=id(1)) => (await db.query('select edu_meta_purchase_consent($1,$2,$3,$4,$5,$6) as v',[member,id(n),expected,consented,version,surface])).rows[0].v;
 const owner = async sql => { await db.exec('reset role');try { await db.exec(sql); } finally { await db.exec('set role service_role'); } };
 const publish = version => owner(`insert into edu_meta_purchase_terms values('${version}','Synthetic recipient','Synthetic country','Synthetic items','Synthetic purpose','Synthetic transfer','Synthetic retention','Synthetic refusal','Synthetic contact',now(),now(),true)`);
 await db.exec('set role service_role');
 assert.deepEqual(await read(),{consented:false,active:false,needsRenewal:false,revision:null,updatedAt:null,terms:null});
 await assert.rejects(save(3,true,'v1'),/META_CONSENT_TERMS/);
 let result=await save(3,false); assert.equal(result.consented,false);
 await assert.rejects(save(4,false,null,id(3),'fake'),/META_CONSENT_INVALID/);
 await publish('v1'); result=await save(4,true,'v1',id(3));assert.equal(result.active,true);
 assert.deepEqual(await save(4,true,'v1',id(3)),result);
 await assert.rejects(save(4,false,'v1',id(3)),/META_CONSENT_CONFLICT/);
 await assert.rejects(save(5,false,null,null,'profile'),/META_CONSENT_CONFLICT/);
 // Account identity scopes both preference and idempotency receipts.
 assert.equal((await read(id(2))).consented,false);
 await save(4,true,'v1',null,'profile',id(2));
 assert.equal((await db.query('select count(*)::int n from edu_meta_purchase_receipts')).rows[0].n,3);
 result=await save(5,false,null,id(4),'profile');assert.equal(result.active,false);
 await assert.rejects(save(4,true,'v1',id(3)),/META_CONSENT_CONFLICT/);
 assert.equal((await db.query('select marketing_consent from profiles where id=$1',[id(1)])).rows[0].marketing_consent,false);
 await save(6,true,'v1',id(5),'profile');
 await owner("update edu_meta_purchase_terms set is_current=false;"); await publish('v2');
 result=await read();assert.equal(result.needsRenewal,true);assert.equal(result.active,false);
 assert.equal((await save(6,true,'v1',id(5),'profile')).active,false);
 await assert.rejects(save(7,true,'v1',id(6),'profile'),/META_CONSENT_TERMS/);
 await owner('update edu_meta_purchase_terms set is_current=false;');
 result=await save(7,false,null,id(6),'profile');assert.equal(result.consented,false);assert.equal(result.needsRenewal,false);
 await assert.rejects(db.exec("update edu_meta_purchase_terms set recipient='tampered'"),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.exec("update edu_meta_purchase_terms set recipient='tampered'"),/IMMUTABLE/);
 for (const role of ['anon','authenticated']) {
  await db.exec('reset role;set role '+role);await assert.rejects(read(),/permission denied/);
  for(const table of ['edu_meta_purchase_terms','edu_meta_purchase_preferences','edu_meta_purchase_receipts'])await assert.rejects(db.exec('select * from '+table),/permission denied/);
 }
 await db.exec('reset role');await db.query("update profiles set status='withdrawn' where id=$1",[id(1)]);await db.exec('set role service_role');await assert.rejects(read(),/FORBIDDEN/);
});
