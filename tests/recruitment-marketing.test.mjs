import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('recruitment campaign mapping enforces product, owner, revision and RPC-only access without changing performance',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   create table profiles(id uuid primary key,role text,status text);create table site_settings(key text primary key,value jsonb);
   create table edu_webinar_campaigns(period_id text primary key,free_course_id uuid,revision int);
   create table landing_campaigns(id uuid primary key,landing_id uuid,name text,start_day date,end_day date,uses_ads boolean);`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609210009_recruitment_marketing_links.sql',import.meta.url),'utf8'));
  const admin=randomUUID(),staff=randomUUID(),free=randomUUID(),other=randomUUID(),ad=randomUUID(),organic=randomUUID(),wrong=randomUUID();
  await db.query("insert into profiles values($1,'admin','active'),($2,'staff','active')",[admin,staff]);
  await db.query("insert into edu_webinar_campaigns values('m4',$1,1),('m5',$1,1)",[free]);
  await db.query("insert into landing_campaigns values($1,$4,'advertising','2026-09-01','2026-09-30',true),($2,$4,'organic','2026-09-01','2026-09-30',false),($3,$5,'other','2026-09-01','2026-09-30',false)",[ad,organic,wrong,free,other]);
  const read=async(settings=null,period='m4',actor=admin)=>(await db.query('select edu_manage_recruitment_marketing($1,$2,$3) as v',[actor,period,settings])).rows[0].v;
  const settings=(expected,ids)=>({expected,webinarRevision:1,freeCourse:free,campaignIds:ids});
  let r=await read();assert.equal(r.revision,0);assert.equal(r.candidates.length,2);assert.deepEqual(r.selected,[]);
  await assert.rejects(read(null,'missing'),/NOT_FOUND/);
  await assert.rejects(read(settings(0,[wrong])),/INVALID/);
  await assert.rejects(read(settings(0,[ad,ad])),/INVALID/);
  await assert.rejects(read(settings(0,Array(21).fill(ad))),/INVALID/);
  await assert.rejects(read({...settings(0,[ad]),webinarRevision:2}),/STALE/);
  await assert.rejects(read({...settings(0,[ad]),freeCourse:other}),/STALE/);
  r=await read(settings(0,[ad,organic]));assert.equal(r.revision,1);assert.equal(r.selected.length,2);assert.ok(r.selected.every(c=>c.valid));
  assert.equal((await read(null,'m5')).candidates.every(c=>!c.available),true);
  await assert.rejects(read(settings(0,[ad]),'m5'),/ALREADY_LINKED/);
  await assert.rejects(read(settings(0,[])),/STALE/);
  assert.equal((await read()).selected.length,2);
  await assert.rejects(read(null,'m4',staff),/FORBIDDEN/);
  await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{marketing:true,products:true}]);
  assert.equal((await read(null,'m4',staff)).selected.length,2);
  await db.query("update profiles set status='suspended' where id=$1",[staff]);await assert.rejects(read(null,'m4',staff),/FORBIDDEN/);
  // A later product change is visible as invalid, never silently attributed.
  await db.query('update landing_campaigns set landing_id=$1 where id=$2',[other,ad]);
  assert.equal((await read()).selected.find(c=>c.id===ad).valid,false);
  r=await read(settings(1,[organic]));assert.equal(r.revision,2);assert.equal(r.selected.length,1);
  r=await read(settings(2,[]));assert.deepEqual(r.selected,[]);
  assert.equal((await db.query('select count(*)::int as n from landing_campaigns')).rows[0].n,3);
  assert.equal((await db.query('select count(*)::int as n from edu_recruitment_marketing_revisions')).rows[0].n,3);
  assert.equal((await read(settings(0,[organic]),'m5')).revision,1);
  for(const table of ['edu_recruitment_marketing_links','edu_recruitment_marketing_revisions']){
   assert.equal((await db.query('select relrowsecurity as v from pg_class where relname=$1',[table])).rows[0].v,true);
   for(const role of ['anon','authenticated','service_role'])for(const priv of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) as v',[role,table,priv])).rows[0].v,false);
  }
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,$3) as v',[role,'edu_manage_recruitment_marketing(uuid,text,jsonb)','EXECUTE'])).rows[0].v,role==='service_role');
 }finally{await db.close();}
});
