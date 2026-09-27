import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const file = name => fs.readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const initial = file('202608040001_initial_education_platform.sql');
const missions = file('202609080001_learning_missions_and_achievements.sql');
const workflows = file('20260908070719_admin_content_and_quiz_workflows.sql');
const qa = file('20260911100000_edu_qa_integrity.sql');
function table(sql, name) { return sql.match(new RegExp(`create table (?:if not exists )?public\\.${name} \\([\\s\\S]+?\\n\\);`, 'i'))[0]; }

test('curriculum copy is atomic, private, independently editable, retry-safe and permission-restricted', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table profiles(id uuid primary key,role text,status text);
   create table site_settings(key text primary key,value jsonb);
   create table audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,after_data jsonb);
   ${['courses','curriculum_weeks','curriculum_lessons','lesson_contents'].map(name=>table(initial,name)).join('\n')}
   ${table(missions,'curriculum_missions')}
   ${workflows.slice(workflows.indexOf('alter table'), workflows.indexOf('alter table public.mission_quizzes enable'))}
   ${table(qa,'edu_mutation_receipts')}
   ${['courses','curriculum_weeks','curriculum_lessons','curriculum_missions'].map(name=>`alter table ${name} add column archived_at timestamptz;`).join('\n')}
   grant all on all tables in schema public to service_role;
  `);
  await db.exec(file('20260927031849_copy_product_curriculum.sql'));
  const actor=randomUUID(),staff=randomUUID(),student=randomUUID(),source=randomUUID(),week=randomUUID(),lesson=randomUUID(),mission=randomUUID(),quizRevision=randomUUID();
  await db.query("insert into profiles values ($1,'admin','active'),($2,'staff','active'),($3,'student','active')",[actor,staff,student]);
  const makeTarget=async(status='draft',category='paid_class')=>{const id=randomUUID();await db.query("insert into courses(id,course_code,slug,title,status,category,metadata) values($1::uuid,$1::text,$1::text,'Target',$2,$3,'{\"own_setting\":true}')",[id,status,category]);return id;};
  await db.query("insert into courses(id,course_code,slug,title,status,category,metadata) values($1::uuid,$1::text,$1::text,'Source','published','paid_class',$2)",[source,{product_resources:[{id:randomUUID(),name:'PDF',path:'edu/example.pdf',scope:'purchaser'}],other:'not copied'}]);
  await db.query("insert into curriculum_weeks(id,course_id,week_number,title,is_published,goal) values($1,$2,1,'Week',true,'Goal')",[week,source]);
  await db.query("insert into curriculum_lessons(id,week_id,day_number,title,content_type,is_preview,is_published,access_mode) values($1,$2,1,'Lesson','text',true,true,'enrolled')",[lesson,week]);
  await db.query("insert into lesson_contents(lesson_id,body_text) values($1,'Protected lesson body')",[lesson]);
  await db.query("insert into curriculum_missions(id,lesson_id,title,is_published,submission_type) values($1,$2,'Mission',true,'quiz')",[mission,lesson]);
  const questions=[{id:'q1',question:'Question',options:['A','B'],answer:0}];
  await db.query("insert into mission_quizzes(mission_id,revision,questions,pass_percent) values($1,$2,$3,80)",[mission,quizRevision,JSON.stringify(questions)]);
  await db.query("insert into curriculum_weeks(course_id,week_number,title,archived_at) values($1,2,'Archived',now())",[source]);
  const preview=async(user=actor)=>(await db.query('select edu_preview_curriculum_copy($1,$2) as value',[user,source])).rows[0].value;
  await db.exec('alter table curriculum_missions add column form_schema jsonb');
  const form={fields:[{id:'goal',type:'text',label:'Goal'}]};
  await db.query('update curriculum_missions set form_schema=$1 where id=$2',[form,mission]);
  const p=await preview(); assert.equal(p.weeks,1);assert.equal(p.lessons,1);assert.equal(p.quizzes,1);assert.equal(p.resources,1);assert.ok(!JSON.stringify(p).includes('Protected'));assert.ok(!JSON.stringify(p).includes('Question'));
  const target=await makeTarget(), request=randomUUID();
  const copy=async(targetId=target,requestId=request,user=actor,revision=p.revision)=>(await db.query('select edu_copy_product_curriculum($1,$2,$3,$4,$5) as value',[user,requestId,source,targetId,revision])).rows[0].value;
  const before=(await db.query('select edu_curriculum_copy_snapshot($1) as value',[source])).rows[0].value;
  await db.exec('set role service_role');
  const result=await copy(); assert.equal(result.lessons,1);assert.equal(result.resources,1);
  assert.deepEqual(await copy(),result);
  await assert.rejects(copy(target,randomUUID()),/COPY_TARGET_NOT_EMPTY/);
  await db.exec('reset role');
  const copied=(await db.query(`select w.id as week_id,w.is_published as week_public,l.id as lesson_id,l.is_published,l.is_preview,l.access_mode,t.body_text,m.id as mission_id,m.form_schema,m.is_published as mission_public,q.revision,q.questions from curriculum_weeks w join curriculum_lessons l on l.week_id=w.id join lesson_contents t on t.lesson_id=l.id join curriculum_missions m on m.lesson_id=l.id join mission_quizzes q on q.mission_id=m.id where w.course_id=$1`,[target])).rows[0];
  for(const name of ['week_public','is_published','is_preview','mission_public'])assert.equal(copied[name],false);
  assert.notEqual(copied.week_id,week);assert.notEqual(copied.lesson_id,lesson);assert.notEqual(copied.mission_id,mission);assert.notEqual(copied.revision,quizRevision);assert.deepEqual(copied.questions,questions);assert.deepEqual(copied.form_schema,form);assert.equal(copied.body_text,'Protected lesson body');
  const targetCourse=(await db.query('select status,metadata from courses where id=$1',[target])).rows[0];
  assert.equal(targetCourse.status,'draft');assert.equal(targetCourse.metadata.own_setting,true);assert.equal(targetCourse.metadata.other,undefined);
  assert.equal(targetCourse.metadata.product_resources[0].scope,'purchaser');assert.notEqual(targetCourse.metadata.product_resources[0].id,before.resources[0].id);
  await db.query("update lesson_contents set body_text='Edited copy' where lesson_id=$1",[copied.lesson_id]);
  assert.deepEqual((await db.query('select edu_curriculum_copy_snapshot($1) as value',[source])).rows[0].value,before);
  assert.equal((await db.query("select count(*)::int as n from audit_logs where action='curriculum.copied'")).rows[0].n,1);
  await assert.rejects(copy(await makeTarget(),request),/COPY_REQUEST_REUSED/);
  await assert.rejects(copy(await makeTarget('published'),randomUUID()),/COPY_TARGET_DRAFT/);
  await assert.rejects(copy(await makeTarget('draft','digital'),randomUUID()),/COPY_TARGET_DRAFT/);
  await assert.rejects(copy(source,randomUUID()),/COPY_INVALID/);
  await assert.rejects(copy(await makeTarget(),randomUUID(),student),/COPY_FORBIDDEN/);
  await assert.rejects(preview(student),/COPY_FORBIDDEN/);
  await assert.rejects(copy(await makeTarget(),randomUUID(),staff),/COPY_FORBIDDEN/);
  await db.query('insert into site_settings values($1,$2)',[`edu_staff_permissions_${staff}`,{products:true}]);
  await copy(await makeTarget(),randomUUID(),staff);
  await db.query("update profiles set status='suspended' where id=$1",[actor]);
  await assert.rejects(copy(),/COPY_FORBIDDEN/); // Even idempotent retries recheck authority.
  await db.query("update profiles set status='active' where id=$1",[actor]);
  await db.query("update lesson_contents set body_text='Source changed' where lesson_id=$1",[lesson]);
  const empty=await makeTarget();await assert.rejects(copy(empty,randomUUID()),/COPY_SOURCE_CHANGED/);
  assert.equal((await db.query('select count(*)::int as n from curriculum_weeks where course_id=$1',[empty])).rows[0].n,0);
  // Force a late error after weeks, lessons, missions and quizzes have been inserted.
  await db.query("update courses set metadata='{\"product_resources\":[{\"name\":\"Bad\",\"path\":\"../bad\",\"scope\":\"public\"}]}' where id=$1",[source]);
  const badRevision=(await preview()).revision,badRequest=randomUUID();
  await assert.rejects(copy(empty,badRequest,actor,badRevision),/COPY_RESOURCE_INVALID/);
  assert.equal((await db.query('select count(*)::int as n from curriculum_weeks where course_id=$1',[empty])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from edu_mutation_receipts where request_id=$1',[badRequest])).rows[0].n,0);
  // A fresh database without the separately deployed form extension also works.
  await db.exec('alter table curriculum_missions drop column form_schema');
  await db.query("update courses set metadata='{}' where id=$1",[source]);
  await copy(await makeTarget(),randomUUID(),actor,(await preview()).revision);
  for(const role of ['anon','authenticated','service_role']) for(const fn of ['edu_curriculum_copy_snapshot(uuid)','edu_preview_curriculum_copy(uuid,uuid)','edu_copy_product_curriculum(uuid,uuid,uuid,uuid,text)']) {
   assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') as ok',[role,`public.${fn}`])).rows[0].ok,role==='service_role');
  }
 } finally {await db.close();}
});
