import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{PGlite}from'@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('personalization is explicit, versioned, independently revocable, idempotent and private',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,status text default 'active',marketing_consent boolean default true);grant select,update on profiles to service_role;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261008074257_edu_personalization_consent.sql',import.meta.url),'utf8'));
 await db.query('insert into profiles(id) values($1),($2)',[id(1),id(2)]);
 const read=async()=> (await db.query('select edu_personalization_consent($1) as v',[id(1)])).rows[0].v;
 const save=async(n,choices,version=null,expected=null)=>(await db.query('select edu_personalization_consent($1,$2,$3::jsonb,$4,$5) as v',[id(1),id(n),JSON.stringify(choices),version,expected])).rows[0].v;
 const owner=async sql=>{await db.exec('reset role');try{await db.exec(sql);}finally{await db.exec('set role service_role');}};
 await db.exec('set role service_role');assert.equal((await read()).eligible,false);assert.equal((await read()).terms,null);
 await assert.rejects(save(3,{analysis:true,overseas:true},'v1'),/PERSONALIZATION_TERMS/);
 for(const choices of [{},{analysis:true},{analysis:'yes',overseas:true},{analysis:true,overseas:true,ads:true}])await assert.rejects(save(3,choices,'v1'),/PERSONALIZATION_INVALID/);
 await owner("insert into edu_personalization_terms values('v1','Synthetic analysis disclosure','Synthetic overseas disclosure',now(),now(),true)");
 let r=await save(3,{analysis:true,overseas:false},'v1');assert.equal(r.eligible,false);
 r=await save(4,{analysis:true,overseas:true},'v1',id(3));assert.equal(r.eligible,true);
 assert.deepEqual(await save(4,{analysis:true,overseas:true},'v1',id(3)),r);
 await assert.rejects(save(4,{analysis:false,overseas:false},'v1',id(3)),/PERSONALIZATION_CONFLICT/);
 await assert.rejects(save(5,{analysis:false,overseas:false},null,null),/PERSONALIZATION_CONFLICT/);
 await owner("update edu_personalization_terms set is_current=false;insert into edu_personalization_terms values('v2','New analysis','New overseas',now(),now(),true)");
 r=await read();assert.equal(r.needsRenewal,true);assert.equal(r.eligible,false);
 assert.equal((await save(4,{analysis:true,overseas:true},'v1',id(3))).eligible,false);
 await assert.rejects(save(5,{analysis:true,overseas:true},'v1',id(4)),/PERSONALIZATION_TERMS/);
 r=await save(5,{analysis:false,overseas:false},null,id(4));assert.equal(r.eligible,false);assert.equal(r.needsRenewal,false);
 assert.equal((await db.query('select count(*)::int as n from edu_personalization_receipts')).rows[0].n,3);
 assert.equal((await db.query('select marketing_consent from profiles where id=$1',[id(1)])).rows[0].marketing_consent,true);
 await assert.rejects(db.exec("update edu_personalization_terms set analysis='tampered'"),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.exec("update edu_personalization_terms set analysis='tampered'"),/IMMUTABLE/);
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);await assert.rejects(read(),/permission denied/);await assert.rejects(db.exec('select * from edu_personalization_preferences'),/permission denied/);
 }
 await db.exec('reset role');await db.query("update profiles set status='withdrawn' where id=$1",[id(1)]);await db.exec('set role service_role');await assert.rejects(read(),/FORBIDDEN/);
});
