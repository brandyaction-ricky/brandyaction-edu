import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/migrations/20260927035640_lesson_private_questions.sql',import.meta.url),'utf8');
for (const hasMissionQuestions of [false, true]) test(`private lesson questions enforce ownership, active access, lesson/course scope, retry integrity and RLS (existing mission context: ${hasMissionQuestions})`,async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text);
 create table courses(id uuid primary key,title text);
 create table cohorts(id uuid primary key,name text);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create table curriculum_weeks(id uuid primary key,course_id uuid,week_number integer,title text,is_published boolean,archived_at timestamptz);
 create table curriculum_lessons(id uuid primary key,week_id uuid,title text,is_published boolean,archived_at timestamptz);
 create table edu_mutation_receipts(actor_id uuid,request_id uuid,target_table text,fingerprint text,result jsonb,primary key(actor_id,request_id));
 create table edu_questions(id uuid primary key default gen_random_uuid(),user_id uuid,course_id uuid,title text,content text,answer text,status text default 'open',is_archived boolean default false,created_at timestamptz default now());
 alter table edu_questions enable row level security;
 create policy owner_read on edu_questions for select to authenticated using(user_id=current_setting('test.user')::uuid);
 grant select on edu_questions to authenticated;grant all on all tables in schema public to service_role;`);
 if(hasMissionQuestions) await db.exec(`alter table edu_questions add column enrollment_id uuid references enrollments(id) on delete set null;
 create index edu_questions_enrollment_idx on edu_questions(enrollment_id) where enrollment_id is not null;`);
 await db.exec(sql);
 const actor=randomUUID(),other=randomUUID(),course=randomUUID(),cohort=randomUUID(),enrollment=randomUUID(),week=randomUUID(),lesson=randomUUID(),request=randomUUID();
 await db.query("insert into profiles values($1,'active'),($2,'active')",[actor,other]);
 await db.query("insert into courses values($1,'문샷')",[course]);await db.query("insert into cohorts values($1,'4기')",[cohort]);
 await db.query("insert into enrollments(id,user_id,course_id,cohort_id,status) values($1,$2,$3,$4,'active')",[enrollment,actor,course,cohort]);
 await db.query("insert into curriculum_weeks values($1,$2,1,'첫 주차',true,null)",[week,course]);
 await db.query("insert into curriculum_lessons values($1,$2,'첫 학습',true,null)",[lesson,week]);
 const call=async(user=actor,req=request,body='개인 질문')=>(await db.query('select edu_create_lesson_question($1,$2,$3,$4,$5,$6) as q',[user,req,enrollment,lesson,'질문 제목',body])).rows[0].q;
 await db.exec('set role service_role');const first=await call();assert.equal(first.lesson_id,lesson);assert.equal(first.enrollment_id,enrollment);assert.match(first.learning_context,/문샷.*4기.*첫 학습/);assert.deepEqual(await call(),first);
 await assert.rejects(call(other,randomUUID()),/QUESTION_FORBIDDEN/);await assert.rejects(call(actor,request,'다른 내용'),/QUESTION_REQUEST_REUSED/);
 await db.exec('reset role');
 for(const [table,id,change,restore] of [['enrollments',enrollment,"access_ends_at=now()-interval '1 second'",'access_ends_at=null'],['enrollments',enrollment,"access_starts_at=now()+interval '1 day'",'access_starts_at=null'],['enrollments',enrollment,'revoked_at=now()','revoked_at=null'],['curriculum_lessons',lesson,'is_published=false','is_published=true'],['curriculum_weeks',week,'is_published=false','is_published=true'],['curriculum_weeks',week,`course_id='${randomUUID()}'`,`course_id='${course}'`],['profiles',actor,"status='suspended'","status='active'"]]){
  await db.query(`update ${table} set ${change} where id=$1`,[id]);await assert.rejects(call(actor,randomUUID()),/QUESTION_FORBIDDEN/);await db.query(`update ${table} set ${restore} where id=$1`,[id]);
 }
 assert.equal((await db.query('select count(*)::int as n from edu_questions')).rows[0].n,1);
 await db.query("select set_config('test.user',$1,false)",[other]);await db.exec('set role authenticated');assert.equal((await db.query('select * from edu_questions')).rows.length,0);
 await db.exec('reset role');await db.query("select set_config('test.user',$1,false)",[actor]);await db.exec('set role authenticated');assert.equal((await db.query('select * from edu_questions')).rows.length,1);await assert.rejects(call(),/permission denied/);
 await db.exec('reset role');for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'edu_create_lesson_question(uuid,uuid,uuid,uuid,text,text)','EXECUTE') as ok",[role])).rows[0].ok,role==='service_role');
 }finally{await db.close();}
});
