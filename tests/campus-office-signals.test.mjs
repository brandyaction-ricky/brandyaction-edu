import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('only the currently entitled owner can read a content-free inbox version; an unchanged revision or rolled back write cannot advance it',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
   create table profiles(id uuid primary key);create table enrollments(id uuid primary key,owner_id uuid,active boolean);
   create table edu_campus_office_jobs(id uuid primary key,enrollment_id uuid,owner_id uuid,revision int,draft_text text);
   create function auth.uid() returns uuid language sql stable as $$select current_setting('qa.viewer')::uuid$$;
   create function private.campus_office_scope(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.enrollments where id=$1 and owner_id=$2 and active)$$;
   grant usage on schema private,auth to authenticated;create publication supabase_realtime;
   insert into profiles values('${uid(1)}'),('${uid(2)}');insert into enrollments values('${uid(10)}','${uid(1)}',true),('${uid(20)}','${uid(2)}',true);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261109080655_campus_office_inbox_signals.sql',import.meta.url),'utf8'));
  await db.exec(`insert into edu_campus_office_jobs values('${uid(31)}','${uid(10)}','${uid(1)}',1,'private A'),('${uid(32)}','${uid(20)}','${uid(2)}',1,'private B');
   update edu_campus_office_jobs set revision=2 where id='${uid(31)}';update edu_campus_office_jobs set revision=revision;`);
  await db.exec(`begin;update edu_campus_office_jobs set revision=3;rollback;`);
  for(const n of [1,2]){
   await db.exec(`reset role;set role authenticated;set qa.viewer='${uid(n)}';`);
   const {rows}=await db.query('select * from edu_campus_office_inbox_signals');
   assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['enrollment_id','owner_id','version']);assert.equal(rows[0].owner_id,uid(n));assert.equal(Number(rows[0].version),n===1?2:1);
   await assert.rejects(db.query('update edu_campus_office_inbox_signals set version=100'));
  }
  await db.exec(`reset role;update enrollments set active=false where id='${uid(20)}';set role authenticated;`);
  assert.equal((await db.query('select * from edu_campus_office_inbox_signals')).rows.length,0);
 }finally{await db.close();}
});
