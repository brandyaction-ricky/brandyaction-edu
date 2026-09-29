import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {batchFor,importFixture} from './helpers/lesson-import-fixture.mjs';
async function snapshot(f){const out={};for(const table of ['curriculum_weeks','curriculum_lessons','edu_lesson_block_versions','edu_lesson_block_heads','lesson_progress','enrollments','edu_curriculum_import_batches','edu_curriculum_import_items'])out[table]=(await f.db.query(`select count(*)::int as n from ${table}`)).rows[0].n;return out;}
test('preview writes nothing; 30 daily and 30 learning lessons preserve independent days and stay private',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course,30),before=await snapshot(f),request=id();
  const preview=await f.run(batch,request);assert.equal(preview.applied,false);assert.equal(preview.daily,30);assert.equal(preview.learning,30);assert.deepEqual(await snapshot(f),before);
  const saved=await f.run(batch,request,true);assert.equal(saved.applied,true);assert.equal(saved.lessons.length,60);assert.equal(saved.weeksCreated,6);
  const rows=(await f.db.query('select l.*,v.document from curriculum_lessons l join edu_lesson_block_versions v on v.lesson_id=l.id where l.id<>$1 order by l.id',[f.lesson])).rows;
  assert.equal(rows.length,60);assert.ok(rows.every(l=>!l.is_published&&!l.is_preview&&l.access_mode==='enrolled'));
  for(const l of batch.lessons){const row=rows.find(r=>r.id===l.id);assert.deepEqual(row.document,l.document);assert.equal(row.day_number,l.order);assert.equal(row.title,l.title);}
  const after=await snapshot(f);assert.equal(after.enrollments,before.enrollments);assert.equal(after.lesson_progress,before.lesson_progress);assert.equal(after.edu_curriculum_import_items,60);
  assert.equal((await f.db.query('select is_published from curriculum_lessons where id=$1',[f.lesson])).rows[0].is_published,true);
  assert.deepEqual((await f.db.query('select edu_read_lesson_progression($1,$2) as result',[f.student,f.enrollment])).rows[0].result.map(g=>g.lessonId),[f.lesson]);
 }finally{await f.db.close();}
});
test('same request recovers result without overwriting later edits; changed request content and duplicate source keys fail',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course),request=id(),first=await f.run(batch,request,true),before=await snapshot(f);
  await f.db.query("update curriculum_lessons set title='직원이 수정한 제목' where id=$1",[batch.lessons[0].id]);
  assert.deepEqual(await f.run(batch,request),first);assert.deepEqual(await f.run(batch,request,true),first);assert.deepEqual(await snapshot(f),before);
  assert.equal((await f.db.query('select title from curriculum_lessons where id=$1',[batch.lessons[0].id])).rows[0].title,'직원이 수정한 제목');
  const changed=structuredClone(batch);changed.lessons[0].title='다른 내용';await assert.rejects(f.run(changed,request,true),/IMPORT_REQUEST_REUSED/);
  const duplicate=batchFor(f.course);duplicate.weeks[0].number=10;await assert.rejects(f.run(duplicate,id(),true),/IMPORT_TARGET_CHANGED/);
 }finally{await f.db.close();}
});
test('a late block failure rolls back every added week, lesson, revision and import record',async()=>{
 const f=await importFixture();try{const batch=batchFor(f.course),before=await snapshot(f);batch.lessons[2].document.completion.mode='mentor';await assert.rejects(f.run(batch,id(),true),/BLOCK_INVALID/);assert.deepEqual(await snapshot(f),before);}finally{await f.db.close();}
});
test('week placement and source day collisions reject instead of touching existing curriculum',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course);batch.weeks[0].number=1;await assert.rejects(f.run(batch),/IMPORT_TARGET_CHANGED/);
  const reused=batchFor(f.course);const old=reused.weeks[0].id;reused.weeks[0]={...reused.weeks[0],id:f.week,number:1,existing:true};reused.lessons.forEach(l=>{if(l.weekId===old)l.weekId=f.week;});await assert.rejects(f.run(reused),/IMPORT_TARGET_CHANGED/);
  reused.lessons.forEach(l=>l.order+=10);const saved=await f.run(reused,id(),true);assert.equal(saved.weeksCreated,0);
  const other=batchFor(f.course);other.lessons.forEach(l=>l.sourceKey='different-'+l.sourceKey);await assert.rejects(f.run(other),/BLOCK_PROGRESSION_DUPLICATE/);
 }finally{await f.db.close();}
});
test('destination verifies ready uploaded bytes, course and uploader rather than trusting receipt JSON',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course),asset=id();const spec={name:'test.png',kind:'image',size:8,extension:'png',contentType:'image/png'};
  await f.db.query('select edu_prepare_lesson_media($1,$2,$3,$4)',[f.admin,f.course,asset,spec]);
  batch.lessons[0].document.blocks.push({id:'image',type:'image',assetId:asset});batch.media=[{assetId:asset,kind:'image',bytes:8,mimeType:'image/png',sha256:'b'.repeat(64)}];
  await assert.rejects(f.run(batch),/IMPORT_MEDIA_CHANGED/);await f.db.query('select edu_complete_lesson_media($1,$2,$3)',[f.admin,asset,'a'.repeat(64)]);await assert.rejects(f.run(batch),/IMPORT_MEDIA_CHANGED/);
  batch.media[0].sha256='a'.repeat(64);await f.run(batch);
  await f.db.query("update profiles set role='admin' where id=$1",[f.other]);await assert.rejects(f.run(batch,id(),false,f.other),/IMPORT_MEDIA_CHANGED/);
  const foreign=id();await f.db.query('insert into courses(id) values($1)',[foreign]);batch.courseId=foreign;await assert.rejects(f.run(batch),/IMPORT_MEDIA_CHANGED/);
 }finally{await f.db.close();}
});
test('only active product authors import; clients cannot invoke the RPC or read private payloads and keys',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course);await assert.rejects(f.run(batch,id(),true,f.student),/BLOCK_FORBIDDEN/);
  await f.db.query("update profiles set role='staff' where id=$1",[f.other]);await assert.rejects(f.run(batch,id(),true,f.other),/BLOCK_FORBIDDEN/);
  await f.db.query("insert into site_settings values($1,'{\"products\":true}')",['edu_staff_permissions_'+f.other]);await f.run(batch,id(),true,f.other);
  await f.db.query("update profiles set status='inactive' where id=$1",[f.other]);await assert.rejects(f.run(batch,id(),false,f.other),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.run(batch),/permission denied/);for(const table of ['edu_curriculum_import_batches','edu_curriculum_import_items'])await assert.rejects(f.db.query('select * from '+table),/permission denied/);}
 }finally{await f.db.close();}
});
