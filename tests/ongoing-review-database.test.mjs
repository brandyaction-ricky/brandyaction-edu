import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {batchFor,importFixture} from './helpers/lesson-import-fixture.mjs';
const doc={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'실행 기록',kind:'text',required:true}}],checklist:[{id:'check',label:'실행했습니다',required:true}],completion:{mode:'self',requireAnswers:false,requireQuizPass:false}};
function addOngoing(batch,cadence='weekly',document=doc){const lesson={...structuredClone(batch.lessons[0]),id:id(),revision:id(),sourceKey:'ongoing:'+cadence,order:100+batch.lessons.length,ongoing:cadence,title:cadence+' 반복',document};batch.lessons.push(lesson);return lesson;}
async function setup(document=doc){
 const f=await importFixture();try{
  const batch=batchFor(f.course,1),lesson=addOngoing(batch,'weekly',document);await f.run(batch,id(),true);
  await f.db.query('update curriculum_weeks set is_published=true where id=$1',[lesson.weekId]);await f.db.query('update curriculum_lessons set is_published=true where id=$1',[lesson.id]);
  await f.db.query('insert into edu_enrollment_progression_grants values($1,29)',[f.enrollment]);
  const query=async(sql,args)=>(await f.db.query(sql,args)).rows[0]?.result;
  const read=()=>query('select edu_read_ongoing($1,$2,$3,null) as result',[f.student,lesson.id,f.enrollment]);
  const {periodStart:period}=await read();
  const save=(values,expected=null)=>query('select edu_save_ongoing($1,$2,$3,$4,$5,$6,$7,$8) as result',[f.student,lesson.id,f.enrollment,period,lesson.revision,expected,id(),values]);
  const complete=write=>query('select edu_complete_ongoing($1,$2,$3,$4,$5,$6,$7) as result',[f.student,lesson.id,f.enrollment,period,lesson.revision,write,id()]);
  const detail=(completed=false,actor=f.admin,selectedPeriod=period)=>query('select edu_read_ongoing_review($1,$2,$3,$4,$5) as result',[actor,lesson.id,f.enrollment,selectedPeriod,completed]);
  const list=(scope='current',state='',page=1,actor=f.admin)=>query('select edu_list_ongoing_reviews($1,$2,$3,$4,$5) as result',[actor,lesson.id,scope,state,page]);
  const file=(fileId,kind='answer',completed=false,actor=f.admin)=>query('select edu_read_ongoing_review_file($1,$2,$3,$4,$5,$6,$7) as result',[actor,lesson.id,f.enrollment,period,completed,fileId,kind]);
  return{...f,query,lesson,period,save,complete,detail,list,file};
 }catch(error){await f.db.close();throw error;}
}
test('mixed 60 daily/learning plus 3 ongoing lessons import atomically, private and idempotently',async()=>{
 const f=await importFixture();try{
  const batch=batchFor(f.course,30);for(const cadence of ['daily','weekly','monthly'])addOngoing(batch,cadence);
  const request=id(),preview=await f.run(batch,request);assert.equal(preview.ongoing,3);assert.equal(preview.daily,30);assert.equal(preview.learning,30);
  assert.equal((await f.db.query('select count(*)::int as n from edu_ongoing_rules')).rows[0].n,0);
  const saved=await f.run(batch,request,true);assert.equal(saved.lessonsCreated,63);assert.deepEqual(await f.run(batch,request,true),saved);
  const rules=(await f.db.query('select r.cadence,l.is_published,v.document from edu_ongoing_rules r join curriculum_lessons l on l.id=r.lesson_id join edu_lesson_block_heads h on h.lesson_id=l.id join edu_lesson_block_versions v on v.id=h.revision')).rows;
  assert.deepEqual(rules.map(r=>r.cadence).sort(),['daily','monthly','weekly']);assert.ok(rules.every(r=>!r.is_published&&!r.document.progression));
  assert.equal((await f.db.query('select count(*)::int as n from enrollments')).rows[0].n,1);assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,0);
 }finally{await f.db.close();}
 const g=await importFixture();try{
  const batch=batchFor(g.course,1),bad=batch.lessons.pop();addOngoing(batch,'daily');bad.document.completion.mode='mentor';batch.lessons.push(bad);
  await assert.rejects(g.run(batch,id(),true),/BLOCK_INVALID/);
  assert.equal((await g.db.query('select count(*)::int as n from curriculum_lessons')).rows[0].n,1);assert.equal((await g.db.query('select count(*)::int as n from edu_ongoing_rules')).rows[0].n,0);
 }finally{await g.db.close();}
});
test('optional source questions do not block completion; latest and completed snapshots remain separate and archived records readable',async()=>{
 const f=await setup();try{
  const pending=await f.save({blocks:{},checklist:[]});await assert.rejects(f.complete(pending.writeId),/BLOCK_REQUIREMENTS_MISSING/);
  const saved=await f.save({blocks:{},checklist:['check']},pending.writeId);await f.complete(saved.writeId);
  await f.save({blocks:{q:'완료 뒤 추가한 답변'},checklist:['check']},saved.writeId);
  assert.equal((await f.detail()).values.blocks.q,'완료 뒤 추가한 답변');assert.equal((await f.detail(true)).values.blocks.q,undefined);
  assert.equal((await f.detail(true)).snapshot,'completed');assert.deepEqual((await f.detail()).document,doc);
  await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[f.lesson.id]);
  assert.equal((await f.list()).rows[0].enrollmentStatus,'revoked');assert.equal((await f.detail()).values.blocks.q,'완료 뒤 추가한 답변');
  assert.equal((await f.query('select edu_ongoing_review_options($1) as result',[f.admin]))[0].archived,true);
 }finally{await f.db.close();}
});
test('review filters paginate historical records with stable identities and never include answer content in the list',async()=>{
 const f=await setup();try{
  const saved=await f.save({blocks:{q:'secret answer marker'},checklist:['check']});await f.complete(saved.writeId);
  await f.db.query(`insert into edu_ongoing_rounds(enrollment_id,lesson_id,period_start,period_end,revision,values,write_id)
   select $1,$2,$3::timestamptz-n*interval '7 days',$3::timestamptz-(n-1)*interval '7 days',$4,'{"blocks":{},"checklist":[]}',gen_random_uuid() from generate_series(1,45) n`,[f.enrollment,f.lesson.id,f.period,f.lesson.revision]);
  assert.equal((await f.list()).total,1);assert.equal((await f.list('current','completed')).total,1);assert.equal((await f.list('all','draft')).total,45);
  const pages=await Promise.all([1,2,3].map(p=>f.list('all','',p)));assert.deepEqual(pages.map(p=>p.rows.length),[20,20,6]);assert.ok(pages.every(p=>p.total===46));
  assert.equal(new Set(pages.flatMap(p=>p.rows.map(r=>r.periodStart))).size,46);assert.doesNotMatch(JSON.stringify(pages),/secret answer marker|"values"|"document"/);
  assert.equal((await f.detail(false,f.admin,pages[2].rows[5].periodStart)).values.blocks.q,undefined);
  await assert.rejects(f.detail(true,f.admin,pages[2].rows[5].periodStart),/BLOCK_NOT_FOUND/);
  await assert.rejects(f.detail(false,f.admin,'2000-01-01T00:00:00Z'),/BLOCK_NOT_FOUND/);
 }finally{await f.db.close();}
});
test('active member-review permission is enforced by every RPC and removed staff access stops immediately',async()=>{
 const f=await setup();try{
  await f.save({blocks:{},checklist:['check']});await assert.rejects(f.detail(false,f.student),/BLOCK_FORBIDDEN/);
  await f.db.query("update profiles set role='staff' where id=$1",[f.other]);await f.db.query("insert into site_settings values($1,'{\"products\":true}')",['edu_staff_permissions_'+f.other]);
  await assert.rejects(f.list('all','',1,f.other),/BLOCK_FORBIDDEN/);await assert.rejects(f.query('select edu_ongoing_review_options($1) as result',[f.other]),/BLOCK_FORBIDDEN/);
  await f.db.query("update site_settings set value='{\"members\":true}' where key=$1",['edu_staff_permissions_'+f.other]);assert.equal((await f.list('all','',1,f.other)).total,1);
  await f.db.query("update profiles set status='inactive' where id=$1",[f.other]);await assert.rejects(f.detail(false,f.other),/BLOCK_FORBIDDEN/);await assert.rejects(f.file(id(),'answer',false,f.other),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.list(),/permission denied/);await assert.rejects(f.detail(),/permission denied/);await assert.rejects(f.file(id()),/permission denied/);await assert.rejects(f.query('select edu_ongoing_review_options($1) as result',[f.admin]),/permission denied/);}
 }finally{await f.db.close();}
});
test('reviewed attachment is bound to the exact lesson/enrollment/period snapshot and completed file survives replacement',async()=>{
 const f=await setup({...doc,blocks:[{id:'proof',type:'question',question:{label:'증빙',kind:'image',required:false}}]});try{
  const prepare=async(ready=true)=>{const file=id();await f.db.query('select edu_prepare_answer_file($1,$2,$3,$4,$5,$6,$7)',[f.student,f.lesson.id,f.enrollment,f.lesson.revision,'proof',file,{name:'기록.png',kind:'image',extension:'png',contentType:'image/png',size:20}]);if(ready)await f.db.query('select edu_complete_answer_file($1,$2,$3)',[f.student,file,'a'.repeat(64)]);return file;};
  const first=await prepare(),next=await prepare(),unready=await prepare(false);
  const saved=await f.save({blocks:{proof:{imageId:first}},checklist:['check']});await f.complete(saved.writeId);
  await f.save({blocks:{proof:{imageId:next}},checklist:['check']},saved.writeId);
  assert.equal((await f.file(first,'answer',true)).bucket,'lesson-answer-files');assert.equal((await f.file(next)).kind,'image');
  await assert.rejects(f.file(first),/BLOCK_FORBIDDEN/);await assert.rejects(f.file(next,'answer',true),/BLOCK_FORBIDDEN/);await assert.rejects(f.file(unready),/BLOCK_NOT_FOUND/);
  await assert.rejects(f.file(first,'answer',true,f.student),/BLOCK_FORBIDDEN/);
  await assert.rejects(f.query('select edu_read_ongoing_review_file($1,$2,$3,$4,true,$5,$6) as result',[f.admin,f.lesson.id,id(),f.period,first,'answer']),/BLOCK_NOT_FOUND/);
  await assert.rejects(f.query('select edu_read_ongoing_review_file($1,$2,$3,$4,true,$5,$6) as result',[f.admin,f.lesson.id,f.enrollment,'2000-01-01T00:00:00Z',first,'answer']),/BLOCK_NOT_FOUND/);
 }finally{await f.db.close();}
});
test('review media uses the original round revision after the author replaces the lesson',async()=>{
 const f=await setup();try{
  const asset=id();await f.db.query('select edu_prepare_lesson_media($1,$2,$3,$4)',[f.admin,f.course,asset,{name:'수업.png',kind:'image',size:8,extension:'png',contentType:'image/png'}]);await f.db.query('select edu_complete_lesson_media($1,$2,$3)',[f.admin,asset,'a'.repeat(64)]);
  const revision=id(),mediaDoc={...doc,blocks:[{id:'image',type:'image',assetId:asset}]};await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson.id,f.lesson.revision,revision,mediaDoc]);
  await f.db.query('select edu_save_ongoing($1,$2,$3,$4,$5,null,$6,$7)',[f.student,f.lesson.id,f.enrollment,f.period,revision,id(),{blocks:{},checklist:['check']}]);
  await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson.id,revision,id(),doc]);
  assert.equal((await f.detail()).revision,revision);assert.equal((await f.file(asset,'content')).bucket,'lesson-content-media');
  const other=id();await f.db.query('select edu_prepare_lesson_media($1,$2,$3,$4)',[f.admin,f.course,other,{name:'다른.png',kind:'image',size:8,extension:'png',contentType:'image/png'}]);await f.db.query('select edu_complete_lesson_media($1,$2,$3)',[f.admin,other,'a'.repeat(64)]);await assert.rejects(f.file(other,'content'),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
