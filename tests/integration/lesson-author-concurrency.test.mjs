// Run against an empty, disposable local PostgreSQL database only.
// EDU_TEST_POSTGRES_DRIVER points to the locally installed pg package entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {randomUUID as id} from 'node:crypto';
import {setup} from '../helpers/lesson-author-parallel.mjs';

const connection=process.env.EDU_TEST_POSTGRES_URL,driver=process.env.EDU_TEST_POSTGRES_DRIVER;
test('real concurrent connections: different lessons save independently; same lesson and structural changes stay protected',{skip:!connection||!driver,timeout:30000},async()=>{
 const url=new URL(connection);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Only disposable loopback DBs are allowed');
 assert.match(url.pathname,/^\/edu_concurrency_[a-z0-9_]+$/);
 const {Client}=(await import(pathToFileURL(driver).href)).default;
 const a=new Client({connectionString:connection}),b=new Client({connectionString:connection});
 await a.connect();await b.connect();
 const adapter={exec:sql=>a.query(sql),query:(sql,params)=>a.query(sql,params)};
 try{
  const f=await setup(adapter);await b.query('set role service_role');
  const other=id(),week=id(),cross=id();
  await a.query('insert into curriculum_lessons(id,week_id,day_number,is_published) values($1,$2,16,true)',[other,f.week]);
  await a.query('insert into curriculum_weeks(id,course_id,is_published) values($1,$2,true)',[week,f.course]);
  await a.query('insert into curriculum_lessons(id,week_id,day_number,is_published) values($1,$2,1,true)',[cross,week]);
  const snap=await f.read(),mine=structuredClone(snap.payload);mine.form.basic.title='1일차 동시 수정';
  const second=await f.read(other),theirs=structuredClone(second.payload);theirs.form.basic.title='16일차 동시 수정';
  const saveB=(lesson,payload,snapshot,request=id())=>b.query('select edu_save_lesson_author($1,$2,$3,$4,$5,$6,false,false) as v',[f.admin,lesson,snapshot.revision,request,snapshot.public.stamp,payload]);
  // Reproduce the production function: one draft transaction blocks another
  // lesson for the function's full 5-second lock timeout.
  await a.query('begin');await f.save(mine,snap);
  await assert.rejects(saveB(other,theirs,second),error=>error.code==='55P03');
  await a.query('rollback');
  await a.query('reset role');await a.query(readFileSync(new URL('../../supabase/migrations/20261023022156_lesson_author_parallel_drafts.sql',import.meta.url),'utf8'));await a.query('set role service_role');
  await a.query('begin');const first=await f.save(mine,snap);
  // This completes before the first transaction commits, including across weeks.
  const saved=await saveB(other,theirs,second);assert.equal(saved.rows[0].v.revision,(await f.read(other)).revision);
  const third=await f.read(cross),thirdPayload=structuredClone(third.payload);thirdPayload.form.basic.title='다른 주차 동시 수정';
  await saveB(cross,thirdPayload,third);
  await assert.rejects(saveB(f.lesson,mine,snap),error=>error.code==='55P03');
  // An archive must still wait for in-flight drafts, rather than deleting
  // their parent while they commit.
  await b.query('reset role');await b.query("set lock_timeout='200ms'");
  await assert.rejects(b.query('update courses set archived_at=now() where id=$1',[f.course]),error=>error.code==='55P03');
  await assert.rejects(b.query('update curriculum_weeks set archived_at=now() where id=$1',[f.week]),error=>error.code==='55P03');
  await a.query('commit');await b.query('set role service_role');
  await assert.rejects(saveB(f.lesson,mine,snap),/AUTHOR_CHANGED/);
  assert.equal((await f.read()).revision,first.revision);
  assert.equal((await f.read(other)).payload.form.basic.title,'16일차 동시 수정');
  assert.equal((await f.read()).public.stamp,snap.public.stamp);
  assert.equal((await f.read(other)).public.stamp,second.public.stamp);
 }finally{await a.query('rollback').catch(()=>{});await Promise.all([a.end(),b.end()]);}
});
