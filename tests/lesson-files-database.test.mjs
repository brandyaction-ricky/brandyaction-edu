import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {fixture} from './helpers/lesson-block-review.mjs';
const doc={schemaVersion:1,blocks:[{id:'proof',type:'question',question:{label:'실행 이미지',kind:'image',required:true}},{id:'other',type:'question',question:{label:'다른 이미지',kind:'image',required:false}}],checklist:[]};
const spec={name:'실행.png',kind:'image',extension:'png',contentType:'image/png',size:20};
async function setup(){const f=await fixture(doc);f.prepare=async(request=id(),actor=f.student,block='proof',data=spec)=>(await f.db.query('select edu_prepare_answer_file($1,$2,$3,$4,$5,$6,$7) as f',[actor,f.lesson,f.enrollment,f.revision,block,request,data])).rows[0].f;f.ready=async(file,actor=f.student)=>(await f.db.query('select edu_complete_answer_file($1,$2,$3) as f',[actor,file,'a'.repeat(64)])).rows[0].f;f.read=async(file,actor=f.student,submission=null)=>(await f.db.query('select edu_read_answer_file($1,$2,$3) as f',[actor,file,submission])).rows[0].f;return f;}
test('upload quota counts reserved files but permits identical retries without creating extra files',async()=>{
 const f=await setup();try{
  const first=await f.prepare();
  for(let i=1;i<30;i++)await f.prepare();
  await assert.rejects(f.prepare(),/BLOCK_UPLOAD_LIMIT/);
  assert.equal((await f.prepare(first.id)).id,first.id);
  assert.equal((await f.db.query('select count(*)::int as count from edu_lesson_answer_files')).rows[0].count,30);
  await f.db.exec("update edu_lesson_answer_files set created_at=now()-interval '2 hours'");
  assert.ok((await f.prepare()).id);
 }finally{await f.db.close();}
});
test('private files bind to owner, enrollment, revision and question; incomplete or forged files cannot enter drafts',async()=>{
 const f=await setup();try{
  const file=await f.prepare();assert.equal(file.ready_at,null);assert.equal(file.path,`${f.student}/${file.id}.png`);assert.equal((await f.prepare(file.id)).id,file.id);
  await assert.rejects(f.prepare(file.id,f.student,'other'),/BLOCK_REQUEST_REUSED/);await assert.rejects(f.prepare(id(),f.other),/BLOCK_FORBIDDEN/);
  const values={blocks:{proof:{imageId:file.id}},checklist:[]};await assert.rejects(f.draft(values),/BLOCK_FILE_INVALID/);await assert.rejects(f.ready(file.id,f.other),/BLOCK_FORBIDDEN/);
  await f.ready(file.id);await f.draft(values);assert.equal((await f.read(file.id)).id,file.id);
  for(const blocks of [{proof:{imageId:id()}},{other:{imageId:file.id}},{proof:{fileId:file.id}},{proof:{imageUrl:'https://evil.test/file'}}])await assert.rejects(f.draft({blocks,checklist:[]}),/BLOCK_FILE_INVALID/);
  await assert.rejects(f.read(file.id,f.other),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated'])for(const operation of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) as ok',[role,'edu_lesson_answer_files',operation])).rows[0].ok,false);
  await f.db.exec('reset role');assert.equal((await f.db.query("select public from storage.buckets where id='lesson-answer-files'")).rows[0].public,false);
 }finally{await f.db.close();}
});
test('required attachment gates completion; mentor can read only an attachment actually present in the named immutable submission',async()=>{
 const f=await setup();try{
  const empty={blocks:{proof:{}},checklist:[]};await f.draft(empty);await assert.rejects(f.submit(id(),empty),/BLOCK_REQUIREMENTS_MISSING/);
  const image=await f.prepare(),archive=await f.prepare(id(),f.student,'proof',{name:'증빙.zip',kind:'file',extension:'zip',contentType:'application/zip',size:30});await f.ready(image.id);await f.ready(archive.id);
  const values={blocks:{proof:{imageId:image.id,fileId:archive.id}},checklist:[]};await f.draft(values);const result=await f.submit(id(),values);assert.equal(result.outcome,'completed');
  assert.equal((await f.read(image.id,f.admin,result.id)).id,image.id);assert.equal((await f.read(archive.id,f.admin,result.id)).id,archive.id);
  await assert.rejects(f.read(image.id,f.admin),/BLOCK_FORBIDDEN/);await assert.rejects(f.prepare(),/BLOCK_ALREADY_SUBMITTED/);
  const otherFile=await f.db.query('insert into edu_lesson_answer_files(id,owner_id,enrollment_id,lesson_id,revision,block_id,kind,name,size,content_type,extension,path,sha256,ready_at) select $1,owner_id,enrollment_id,lesson_id,revision,block_id,kind,name,size,content_type,extension,$2,sha256,ready_at from edu_lesson_answer_files where id=$3 returning id',[id(),'unreferenced.png',image.id]);
  await assert.rejects(f.read(otherFile.rows[0].id,f.admin,result.id),/BLOCK_FORBIDDEN/);
  await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await assert.rejects(f.read(image.id),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
test('replacing and removing attachments preserves earlier submission files; reopening uses the original questions and new draft token',async()=>{
 const f=await fixture({...doc,completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}});try{
  const prepare=async()=>(await f.db.query('select edu_prepare_answer_file($1,$2,$3,$4,$5,$6,$7) as f',[f.student,f.lesson,f.enrollment,f.revision,'proof',id(),spec])).rows[0].f;
  const file=await prepare();await f.db.query('select edu_complete_answer_file($1,$2,$3)',[f.student,file.id,'a'.repeat(64)]);const values={blocks:{proof:{imageId:file.id}},checklist:[]};await f.draft(values);const first=await f.submit(id(),values);
  await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.student,first.id,first.stateId,id(),'reopened','']);
  const read=(await f.db.query('select edu_read_lesson_blocks($1,$2,$3,null) as r',[f.student,f.lesson,f.enrollment])).rows[0].r;f.setWrite(read.draft.writeId);await f.draft({blocks:{proof:{}},checklist:[]});
  assert.equal((await f.db.query('select values from edu_lesson_block_submissions where id=$1',[first.id])).rows[0].values.blocks.proof.imageId,file.id);
  assert.equal((await f.db.query('select edu_read_answer_file($1,$2,$3) as r',[f.admin,file.id,first.id])).rows[0].r.id,file.id);
 }finally{await f.db.close();}
});
