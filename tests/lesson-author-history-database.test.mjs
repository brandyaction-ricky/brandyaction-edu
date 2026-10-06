import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {fixture,document} from './helpers/lesson-block-review.mjs';
const sql=readFileSync(new URL('../supabase/migrations/20261001065746_lesson_author_drafts.sql',import.meta.url),'utf8');
async function setup(){
 const f=await fixture();await f.db.exec('reset role');
 await f.db.exec(`alter table curriculum_lessons add column day_number integer not null default 1,add column description text,add column duration_label text,add column content_type text not null default 'text',add column is_preview boolean not null default false,add column display_order integer not null default 0,add column updated_at timestamptz not null default now();
 alter table curriculum_lessons add constraint lesson_day unique(week_id,day_number);
 alter table lesson_contents add column vod_url text,add column external_url text,add column resource_storage_path text,add column resource_name text,add column updated_at timestamptz not null default now();
 alter table lesson_contents add constraint content_kind check(num_nonnulls(body_text,vod_url,external_url,resource_storage_path)=1);
 create table audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 grant select,insert on audit_logs to service_role;
 create function mission_operator_allowed(actor uuid, scope text) returns boolean language sql as $$ select exists(select 1 from public.profiles where id=actor and role='admin' and status='active') $$;`);
 await f.db.exec('alter table profiles add column if not exists full_name text');await f.db.exec(sql);await f.db.exec(readFileSync(new URL('../supabase/migrations/20261005090119_lesson_author_conflict_backups.sql',import.meta.url),'utf8'));await f.db.exec(readFileSync(new URL('../supabase/migrations/20261006081611_lesson_author_history.sql',import.meta.url),'utf8'));await f.db.exec('set role service_role');
 const read=async(lesson=f.lesson,actor=f.admin,version=null)=>(await f.db.query('select edu_read_lesson_author($1,$2,$3) as v',[actor,lesson,version])).rows[0].v;
 const save=async(payload,snapshot,opts={})=>(await f.db.query('select edu_save_lesson_author($1,$2,$3,$4,$5,$6,$7,$8) as v',[opts.actor||f.admin,opts.lesson||f.lesson,snapshot.revision,opts.request||id(),snapshot.public.stamp,payload,opts.create||false,opts.rebase||false])).rows[0].v;
 const publish=async(revision,request=id(),actor=f.admin)=>(await f.db.query('select edu_publish_lesson_author($1,$2,$3,$4) as v',[actor,f.lesson,revision,request])).rows[0].v;
 return{...f,read,save,publish};
}

test('history pages beyond 20, isolates lessons and editors, keeps versions and student content',async()=>{
 const f=await setup();try{
  await f.db.exec('reset role');await f.db.exec('alter table profiles add column if not exists full_name text');await f.db.query('update profiles set full_name=$1 where id=$2',['편집자 A',f.admin]);await f.db.exec('set role service_role');
  const initial=await f.read(), beforePublic=initial.public;
  const saved=[];for(let i=0;i<65;i++){
   const snap=await f.read(),p=structuredClone(snap.payload);p.form.basic.title='편집 '+i;const request=id();
   await f.db.query('select edu_save_lesson_author_recorded($1,$2,$3,$4,$5,$6,false,false,$7,$8)',[f.admin,f.lesson,snap.revision,request,snap.public.stamp,p,i===4?'manual':'autosave',i===4?'검수 기준':'']);saved.push(request);
  }
  const history=async(at=null,cursor=null,mode='all',editor='')=>(await f.db.query('select edu_lesson_author_history($1,$2,$3,$4,$5,null,null,$6) v',[f.admin,f.lesson,at,cursor,mode,editor])).rows[0].v;
  let page=await history(),all=[...page.rows];assert.equal(page.rows.length,30);
  while(page.next){page=await history(page.next.at,page.next.id);all.push(...page.rows);}
  assert.equal(all.length,66);assert.equal(new Set(all.map(r=>r.revision)).size,66);assert.equal(all.filter(r=>r.source==='autosave').length,64);
  const important=await history(null,null,'important');assert.equal(important.rows.length,2);assert.equal(important.rows.find(r=>r.source==='manual').note,'검수 기준');
  assert.equal((await history(null,null,'all','없는 편집자')).rows.length,0);assert.equal((await history(null,null,'all','편집자 A')).rows.length,30);
  assert.deepEqual((await f.read()).public,beforePublic);assert.equal((await f.read(f.lesson,f.admin,saved[0])).payload.form.basic.title,'편집 0');
  await assert.rejects(f.db.query('select edu_lesson_author_history($1,$2)',[f.student,f.lesson]),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated'])assert.equal((await f.db.query("select has_table_privilege($1,'edu_lesson_author_save_notes','SELECT') ok",[role])).rows[0].ok,false);
 }finally{await f.db.close();}
});
test('recorded save retries preserve metadata atomically and conflicts do not replace head',async()=>{
 const f=await setup();try{
  const snap=await f.read(),request=id();const args=[f.admin,f.lesson,snap.revision,request,snap.public.stamp,snap.payload,false,false,'manual','기준'];
  const query='select edu_save_lesson_author_recorded($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v';
  await f.db.query(query,args);await f.db.query(query,args);
  await assert.rejects(f.db.query(query,[...args.slice(0,9),'변조']),/AUTHOR_CHANGED/);
  const backup=id();await f.db.query(query,[f.admin,f.lesson,null,backup,snap.public.stamp,snap.payload,false,false,'backup','']);assert.equal((await f.read()).revision,request);
  assert.equal((await f.db.query('select count(*)::int n from edu_lesson_author_save_notes')).rows[0].n,2);
  await assert.rejects(f.db.query(query,[f.admin,f.lesson,null,id(),snap.public.stamp,snap.payload,false,false,'autosave','bad']),/AUTHOR_INVALID/);
 }finally{await f.db.close();}
});

test('history uses KST date bounds and publication remains an important record',async()=>{
 const f=await setup();try{
  const snap=await f.read();const p=structuredClone(snap.payload);p.form.basic.title='공개 검수';const saved=await f.save(p,snap);await f.publish(saved.revision);
  await f.db.exec('reset role');await f.db.query("update edu_lesson_author_versions set created_at='2026-10-05T15:00:00Z' where id=$1",[saved.revision]);await f.db.exec('set role service_role');
  const history=async(day)=>(await f.db.query("select edu_lesson_author_history($1,$2,null,null,'important',$3::date,$3::date,'') v",[f.admin,f.lesson,day])).rows[0].v;
  assert.ok((await history('2026-10-06')).rows.some(r=>r.revision===saved.revision&&r.published));assert.ok(!(await history('2026-10-05')).rows.some(r=>r.revision===saved.revision));
  await assert.rejects(f.db.query("select edu_lesson_author_history($1,$2,null,null,'all','2026-10-07','2026-10-06','')",[f.admin,f.lesson]),/AUTHOR_INVALID/);
  for(const role of ['anon','authenticated'])for(const fn of ['edu_lesson_author_history(uuid,uuid,timestamptz,uuid,text,date,date,text)','edu_save_lesson_author_recorded(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean,text,text)'])assert.equal((await f.db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,fn])).rows[0].ok,false);
 }finally{await f.db.close();}
});
