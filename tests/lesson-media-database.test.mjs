import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {fixture} from './helpers/lesson-block-review.mjs';
const spec={name:'수업.png',size:8,kind:'image',extension:'png',contentType:'image/png'};
async function prepare(f,params={}) {const key=params.key||id();const result=await f.db.query('select edu_prepare_lesson_media($1,$2,$3,$4) as f',[params.actor||f.admin,params.course||f.course,key,params.spec||spec]);return result.rows[0].f;}
async function complete(f,key,actor=f.admin){return f.db.query('select edu_complete_lesson_media($1,$2,$3)',[actor,key,'a'.repeat(64)]);}
async function save(f,asset,expected=f.revision,extra={}){const revision=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,expected,revision,{schemaVersion:1,blocks:[{id:'image',type:'image',assetId:asset,...extra}],checklist:[]}]);return revision;}
async function read(f,asset,args={}) {return f.db.query('select edu_read_lesson_media($1,$2,$3,$4,$5,$6) as f',[args.actor||f.student,asset,args.lesson??f.lesson,args.enrollment??f.enrollment,args.revision||null,args.submission||null]);}

test('only active products authors prepare course-scoped media; client roles cannot call RPCs or read table',async()=>{
 const f=await fixture();try{
  await assert.rejects(prepare(f,{actor:f.student}),/BLOCK_FORBIDDEN/);
  await f.db.query("update profiles set role='staff' where id=$1",[f.other]);await assert.rejects(prepare(f,{actor:f.other}),/BLOCK_FORBIDDEN/);
  await f.db.query("insert into site_settings values($1,'{\"products\":true}')",['edu_staff_permissions_'+f.other]);await prepare(f,{actor:f.other});
  await f.db.query("update profiles set status='inactive' where id=$1",[f.other]);await assert.rejects(prepare(f,{actor:f.other}),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from edu_lesson_media'),/permission denied/);await assert.rejects(prepare(f),/permission denied/);}
 }finally{await f.db.close();}
});
test('upload retry is idempotent and immutable; foreign owner/course and mismatched file types fail',async()=>{
 const f=await fixture();try{
  const asset=await prepare(f);assert.equal((await prepare(f,{key:asset.id})).path,asset.path);
  await assert.rejects(prepare(f,{key:asset.id,spec:{...spec,size:9}}),/BLOCK_REQUEST_REUSED/);
  await assert.rejects(complete(f,asset.id,f.student),/BLOCK_FORBIDDEN/);
  await assert.rejects(prepare(f,{spec:{...spec,contentType:'text/html'}}),/BLOCK_INVALID/);
  await assert.rejects(prepare(f,{spec:{...spec,size:10485761}}),/BLOCK_INVALID/);
  await complete(f,asset.id);await complete(f,asset.id);
  await assert.rejects(f.db.query('select edu_complete_lesson_media($1,$2,$3)',[f.admin,asset.id,'b'.repeat(64)]),/BLOCK_REQUEST_REUSED/);
  await assert.rejects(f.db.query("update edu_lesson_media set path='other' where id=$1",[asset.id]),/permission denied/);
  await assert.rejects(f.db.query('delete from edu_lesson_media where id=$1',[asset.id]),/permission denied/);
 }finally{await f.db.close();}
});
test('unverified/foreign-course/wrong-kind assets cannot enter revisions; same-course author preview works before saving a lesson',async()=>{
 const f=await fixture();try{
  const a=await prepare(f);await assert.rejects(save(f,a.id),/BLOCK_MEDIA_INVALID/);await complete(f,a.id);
  assert.equal((await f.db.query('select edu_read_lesson_media($1,$2) as f',[f.admin,a.id])).rows[0].f.id,a.id);
  await assert.rejects(f.db.query('select edu_read_lesson_media($1,$2)',[f.student,a.id]),/BLOCK_FORBIDDEN/);
  await assert.rejects(save(f,a.id,f.revision,{type:'audio'}),/BLOCK_MEDIA_INVALID/);
  await assert.rejects(save(f,a.id,f.revision,{url:'https://public.test/'}),/BLOCK_MEDIA_INVALID/);
  const other=id();await f.db.query('insert into courses(id) values($1)',[other]);const foreign=await prepare(f,{course:other});await complete(f,foreign.id);await assert.rejects(save(f,foreign.id),/BLOCK_MEDIA_INVALID/);
  await save(f,a.id);assert.equal((await read(f,a.id)).rows[0].f.id,a.id);
 }finally{await f.db.close();}
});
test('learners only open media referenced by accessible current or their own historical draft revision',async()=>{
 const f=await fixture();try{
  const a=await prepare(f);await complete(f,a.id);const rev=await save(f,a.id);
  const unbound=await prepare(f);await complete(f,unbound.id);await assert.rejects(read(f,unbound.id),/BLOCK_FORBIDDEN/);
  await assert.rejects(read(f,a.id,{actor:f.other}),/BLOCK_FORBIDDEN/);
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,f.lesson,f.enrollment,rev,id(),{blocks:{},checklist:[]}]);
  const next=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,rev,next,{schemaVersion:1,blocks:[],checklist:[]}]);
  await assert.rejects(read(f,a.id),/BLOCK_FORBIDDEN/);await read(f,a.id,{revision:rev});
  await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await assert.rejects(read(f,a.id,{revision:rev}),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
test('mentor file access is bound to immutable submission and existing review permission',async()=>{
 const f=await fixture();try{
  const a=await prepare(f);await complete(f,a.id);const rev=await save(f,a.id),write=id(),submission=id(),values={blocks:{},checklist:[]};
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,f.lesson,f.enrollment,rev,write,values]);
  await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7)',[f.student,f.lesson,f.enrollment,rev,write,submission,values]);
  await f.db.query("update profiles set role='staff' where id=$1",[f.other]);
  await f.db.query("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+f.other]);
  await read(f,a.id,{actor:f.other,submission});
  await read(f,a.id,{actor:f.student,submission});
  const unbound=await prepare(f);await complete(f,unbound.id);await assert.rejects(read(f,unbound.id,{actor:f.other,submission}),/BLOCK_FORBIDDEN/);
  await f.db.query("update site_settings set value='{}' where key=$1",['edu_staff_permissions_'+f.other]);
  await assert.rejects(read(f,a.id,{actor:f.other,submission}),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
test('moving a lesson or its week to another course cannot transfer paid media; same-course moves remain possible',async()=>{
 const f=await fixture();try{
  const a=await prepare(f);await complete(f,a.id);await save(f,a.id);
  const other=id(),w=id(),same=id();await f.db.query('insert into courses(id) values($1)',[other]);await f.db.query('insert into curriculum_weeks values($1,$2,true,null),($3,$4,true,null)',[w,other,same,f.course]);
  await assert.rejects(f.db.query('update curriculum_lessons set week_id=$1 where id=$2',[w,f.lesson]),/BLOCK_MEDIA_COURSE_MOVE/);
  await assert.rejects(f.db.query('update curriculum_weeks set course_id=$1 where id=$2',[other,f.week]),/BLOCK_MEDIA_COURSE_MOVE/);
  await f.db.query('update curriculum_lessons set week_id=$1 where id=$2',[same,f.lesson]);await read(f,a.id);
 }finally{await f.db.close();}
});
