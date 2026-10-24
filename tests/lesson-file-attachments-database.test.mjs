import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261024012826_lesson_file_attachments.sql',import.meta.url),'utf8');
async function setup(){const f=await fixture();await f.db.exec('reset role; alter table edu_lesson_media add column source_asset_id uuid;');await f.db.exec(sql);await f.db.exec('set role service_role');return f;}
const spec=(ext='pdf')=>({name:'수업 자료.'+ext,size:9,kind:'file',extension:ext,contentType:'application/octet-stream'});
async function prepare(f,s=spec(),course=f.course,actor=f.admin,key=id()){return(await f.db.query('select edu_prepare_lesson_media($1,$2,$3,$4) as f',[actor,course,key,s])).rows[0].f;}
async function complete(f,asset){await f.db.query('select edu_complete_lesson_media($1,$2,$3)',[f.admin,asset,'a'.repeat(64)]);}
async function save(f,file,revision=f.revision){const next=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,revision,next,{schemaVersion:1,blocks:[{id:'download',type:'file',...file}],checklist:[]}]);return next;}
const read=(f,asset,actor=f.student,revision=null)=>f.db.query('select edu_read_lesson_media($1,$2,$3,$4,$5) as f',[actor,asset,f.lesson,f.enrollment,revision]);
test('private file upload formats, limits, retries, author permissions and bucket visibility remain bounded',async()=>{
 const f=await setup();try{
  for(const ext of ['pdf','zip','docx','xlsx','pptx','hwp','hwpx','txt','md','csv'])assert.equal((await prepare(f,spec(ext))).kind,'file');
  const file=await prepare(f);assert.equal((await prepare(f,spec(),f.course,f.admin,file.id)).id,file.id);
  await assert.rejects(prepare(f,{...spec(),size:52428801}),/BLOCK_INVALID/);await assert.rejects(prepare(f,{...spec(),extension:'exe'}),/BLOCK_INVALID/);
  await assert.rejects(prepare(f,{...spec(),contentType:'text/html'}),/BLOCK_INVALID/);await assert.rejects(prepare(f,spec(),f.course,f.student),/BLOCK_FORBIDDEN/);
  await f.db.exec('reset role');assert.equal((await f.db.query("select public from storage.buckets where id='lesson-content-media'")).rows[0].public,false);await f.db.exec('set role service_role');
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(prepare(f),/permission denied/);await assert.rejects(f.db.query('select * from edu_lesson_media'),/permission denied/);}
 }finally{await f.db.close();}
});
test('only ready files from this course enter published revisions and revoked students cannot download',async()=>{
 const f=await setup();try{
  const file=await prepare(f);await assert.rejects(save(f,{assetId:file.id}),/BLOCK_MEDIA_INVALID/);await complete(f,file.id);
  await assert.rejects(save(f,{}),/BLOCK_MEDIA_INVALID/);await assert.rejects(save(f,{assetId:file.id,url:'https://bad.test/file'}),/BLOCK_MEDIA_INVALID/);
  const otherCourse=id();await f.db.query('insert into courses(id) values($1)',[otherCourse]);const foreign=await prepare(f,spec(),otherCourse);await complete(f,foreign.id);await assert.rejects(save(f,{assetId:foreign.id}),/BLOCK_MEDIA_INVALID/);
  const revision=await save(f,{assetId:file.id});assert.equal((await read(f,file.id)).rows[0].f.id,file.id);
  await assert.rejects(read(f,file.id,f.other),/BLOCK_FORBIDDEN/);
  const unbound=await prepare(f);await complete(f,unbound.id);await assert.rejects(read(f,unbound.id),/BLOCK_FORBIDDEN/);
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,f.lesson,f.enrollment,revision,id(),{blocks:{},checklist:[]}]);
  await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await assert.rejects(read(f,file.id,f.student,revision),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
