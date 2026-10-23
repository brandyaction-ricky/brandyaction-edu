import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {setup} from './helpers/lesson-author-parallel.mjs';

const migration=readFileSync(new URL('../supabase/migrations/20261023022156_lesson_author_parallel_drafts.sql',import.meta.url),'utf8');
test('parallel draft migration preserves privileges, per-lesson revisions, public content and archive checks',async()=>{
 const f=await setup();
 try{
  await f.db.exec('reset role');
  const signature='public.edu_save_lesson_author(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean)';
  const metadata=async()=>(await f.db.query('select proacl::text,proowner,prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  const before=await metadata();await f.db.exec(migration);assert.deepEqual(await metadata(),before);
  await f.db.exec('set role service_role');
  const other=id();await f.db.query('insert into curriculum_lessons(id,week_id,day_number,is_published) values($1,$2,16,true)',[other,f.week]);
  const one=await f.read(),sixteen=await f.read(other),a=structuredClone(one.payload),b=structuredClone(sixteen.payload);
  a.form.basic.title='1일차 초안';b.form.basic.title='16일차 초안';
  const r1=await f.save(a,one),r16=await f.save(b,sixteen,{lesson:other});
  assert.equal((await f.read()).payload.form.basic.title,'1일차 초안');assert.equal((await f.read(other)).payload.form.basic.title,'16일차 초안');
  assert.notEqual(r1.revision,r16.revision);assert.equal((await f.read()).public.stamp,one.public.stamp);assert.equal((await f.read(other)).public.stamp,sixteen.public.stamp);
  await assert.rejects(f.save({...a,form:{...a.form,basic:{...a.form.basic,title:'오래된 편집본'}}},one),/AUTHOR_CHANGED/);
  await assert.rejects(f.save(b,await f.read(other),{lesson:other,actor:f.student}),/AUTHOR_FORBIDDEN/);
  const latest=await f.read(other);await f.db.query('update curriculum_weeks set archived_at=now() where id=$1',[f.week]);
  await assert.rejects(f.save(b,latest,{lesson:other}),/BLOCK_NOT_FOUND|AUTHOR_COURSE_FIXED|AUTHOR_NOT_FOUND/);
 }finally{await f.db.close();}
});
