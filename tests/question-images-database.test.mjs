import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-notifications.mjs';
const root=new URL('../supabase/migrations/',import.meta.url);
async function start(t){
 const h=await setup(t);await h.owner(`alter table cohorts add column name text default '시험 기수';
 alter table curriculum_weeks add column week_number integer default 1,add column title text default '첫 주차';
 create table edu_mutation_receipts(actor_id uuid,request_id uuid,target_table text,fingerprint text,result jsonb,primary key(actor_id,request_id));
 grant all on edu_mutation_receipts to service_role;
 alter table edu_questions add constraint fixture_question_owner foreign key (user_id) references profiles(id) on delete cascade;
 alter table edu_questions add column course_id uuid,add column status text default 'open',add column is_archived boolean not null default false,add column created_at timestamptz default now(),add column updated_at timestamptz default now();`);
 for(const file of ['20260927035640_lesson_private_questions.sql','20260928205907_question_answer_threads.sql','20260928211554_question_private_images.sql']) await h.owner(fs.readFileSync(new URL(file,root),'utf8'));
 const spec={name:'질문.png',size:8,kind:'image',extension:'png',contentType:'image/png'},image=id();
 const prepare=(actor=h.student,request=image,value=spec)=>h.rpc('edu_prepare_question_image',[actor,h.enrollment,h.lesson,request,value]);
 const complete=(actor=h.student,file=image,sha='a'.repeat(64))=>h.rpc('edu_complete_question_image',[actor,file,sha]);
 const create=(request=id(),file=image,content='',actor=h.student)=>h.rpc('edu_create_lesson_question_with_image',[actor,request,h.enrollment,h.lesson,'이미지 질문',content,file]);
 const read=(question,actor=h.student)=>h.rpc('edu_read_question_image',[actor,question]);
 return {...h,spec,image,prepare,complete,create,read};
}
test('image-only question binds the verified file, retries exactly once and preserves image in thread and legacy answers',async t=>{
 const h=await start(t),file=await h.prepare();assert.equal(file.path,`${h.student}/${h.image}.png`);assert.deepEqual(await h.prepare(),file);
 await assert.rejects(()=>h.create(),/QUESTION_IMAGE_INVALID/);await h.complete();const request=id(),q=await h.create(request);assert.equal(q.image_id,h.image);assert.equal(q.content,'첨부 이미지에 대한 질문입니다.');assert.deepEqual(await h.create(request),q);
 assert.equal((await h.read(q.id)).id,h.image);assert.equal((await h.rpc('edu_read_question_thread',[h.admin,q.id,null])).question.imageId,h.image);
 await h.db.query('update edu_questions set answer=$1 where id=$2',['이미지 확인했습니다.',q.id]);assert.equal((await h.read(q.id)).id,h.image);
 await assert.rejects(()=>h.create(request,null,'사진 없는 다른 질문'),/QUESTION_REQUEST_REUSED/);await assert.rejects(()=>h.create(),/QUESTION_IMAGE_USED/);
 await assert.rejects(()=>h.complete(h.student,h.image,'b'.repeat(64)),/QUESTION_REQUEST_REUSED/);
});
test('upload requires current access and cannot borrow another learner file or change image scope after submission',async t=>{
 const h=await start(t);await assert.rejects(()=>h.prepare(h.other),/QUESTION_FORBIDDEN/);await h.prepare();await h.complete();
 await assert.rejects(()=>h.complete(h.other),/QUESTION_FORBIDDEN/);
 for(const [table,entity,change,restore] of [['profiles',h.student,"status='inactive'","status='active'"],['enrollments',h.enrollment,"revoked_at=now()",'revoked_at=null'],['curriculum_lessons',h.lesson,'is_published=false','is_published=true'],['curriculum_weeks',h.week,'is_published=false','is_published=true']]){
  await h.owner(`update ${table} set ${change} where id=$1`,[entity]);await assert.rejects(()=>h.prepare(h.student,id()),/QUESTION_FORBIDDEN/);await assert.rejects(()=>h.create(),/QUESTION_FORBIDDEN/);await h.owner(`update ${table} set ${restore} where id=$1`,[entity]);
 }
 const q=await h.create();await assert.rejects(()=>h.db.query('update edu_questions set user_id=$1 where id=$2',[h.other,q.id]),/QUESTION_IMAGE_INVALID/);await assert.rejects(()=>h.db.query('update edu_questions set image_id=null where id=$1',[q.id]),/QUESTION_IMAGE_IMMUTABLE/);
});
test('only owner and current operator may view, archived is operator-only, revoked enrollment retains own question history',async t=>{
 const h=await start(t);await h.prepare();await h.complete();const q=await h.create();await assert.rejects(()=>h.read(q.id,h.other),/QUESTION_NOT_FOUND/);assert.equal((await h.read(q.id,h.admin)).id,h.image);
 await h.owner("update profiles set role='staff' where id=$1",[h.admin]);await assert.rejects(()=>h.read(q.id,h.admin),/QUESTION_NOT_FOUND/);await h.owner("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+h.admin]);await h.read(q.id,h.admin);
 await h.owner('update enrollments set revoked_at=now() where id=$1',[h.enrollment]);await h.read(q.id);await h.owner('update edu_questions set is_archived=true where id=$1',[q.id]);await assert.rejects(()=>h.read(q.id),/QUESTION_NOT_FOUND/);await h.read(q.id,h.admin);
 await h.owner("update profiles set status='inactive' where id=$1",[h.admin]);await assert.rejects(()=>h.read(q.id,h.admin),/MESSAGE_FORBIDDEN/);
});
test('pending files are not viewable, quota is bounded, MIME must match and browser roles cannot call storage functions',async t=>{
 const h=await start(t);await assert.rejects(()=>h.prepare(h.student,id(),{...h.spec,contentType:'text/html'}),/QUESTION_INVALID/);await h.prepare();await assert.rejects(()=>h.read(h.image),/QUESTION_NOT_FOUND/);
 await assert.rejects(()=>h.prepare(h.student,h.image,{...h.spec,name:'changed.png'}),/QUESTION_REQUEST_REUSED/);
 for(let i=1;i<30;i++)await h.prepare(h.student,id());await assert.rejects(()=>h.prepare(h.student,id()),/QUESTION_UPLOAD_LIMIT/);await h.prepare();
 const bucket=(await h.owner("select public,allowed_mime_types from storage.buckets where id=$1",['question-images'])).rows[0];assert.equal(bucket.public,false);assert.ok(!bucket.allowed_mime_types.includes('image/svg+xml'));
 await h.db.exec('reset role');for(const role of ['anon','authenticated']){for(const p of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await h.db.query('select has_table_privilege($1,$2,$3) ok',[role,'edu_question_images',p])).rows[0].ok,false);assert.equal((await h.db.query("select has_function_privilege($1,'edu_read_question_image(uuid,uuid)','EXECUTE') ok",[role])).rows[0].ok,false);}
});
test('new and legacy text-only callers remain supported and failed question notice rolls back receipt and attachment',async t=>{
 const h=await start(t);await h.create(id(),null,'일반 텍스트 질문');await h.rpc('edu_create_lesson_question',[h.student,id(),h.enrollment,h.lesson,'이전 화면','기존 호출 내용']);
 await h.prepare();await h.complete();const request=id();await h.owner("create function fail_image_notice() returns trigger language plpgsql as $$ begin raise exception 'notice unavailable'; end $$; create trigger fail_image_notice before insert on edu_member_messages for each row execute function fail_image_notice();");
 await assert.rejects(()=>h.create(request),/notice unavailable/);assert.equal((await h.db.query('select count(*)::int n from edu_questions where image_id=$1',[h.image])).rows[0].n,0);
 await h.owner('drop trigger fail_image_notice on edu_member_messages');assert.equal((await h.create(request)).image_id,h.image);
});

test('lesson deletion detaches references without losing a saved private image or breaking legacy question deletion',async t=>{
 const h=await start(t);await h.prepare();await h.complete();const q=await h.create();
 // Published block heads are independent of this feature; remove their fixture dependency first.
 await h.owner('delete from edu_lesson_block_heads where lesson_id=$1',[h.lesson]);
 await h.owner('delete from edu_lesson_block_versions where lesson_id=$1',[h.lesson]);
 await h.owner('delete from curriculum_lessons where id=$1',[h.lesson]);
 const f=await h.read(q.id);assert.equal(f.lesson_id,null);assert.equal(f.id,h.image);
});

test('account deletion removes image metadata and question without blocking the existing account lifecycle',async t=>{
 const h=await start(t);await h.prepare();await h.complete();await h.create();
 await h.owner('delete from enrollments where id=$1',[h.enrollment]);await h.owner('delete from profiles where id=$1',[h.student]);
 assert.equal(await h.count('edu_question_images'),0);assert.equal(await h.count('edu_questions'),0);
});
