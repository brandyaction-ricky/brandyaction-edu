import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const sql = fs.readFileSync(new URL('../supabase/migrations/20260928141603_lesson_block_documents_and_drafts.sql', import.meta.url), 'utf8');

test('versioned lessons and drafts preserve history, enforce ownership/access, and reject lost updates atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table profiles(id uuid primary key,role text,status text);
      create table site_settings(key text primary key,value jsonb);
      create table courses(id uuid primary key,archived_at timestamptz);
      create table curriculum_weeks(id uuid primary key,course_id uuid references courses,is_published boolean,archived_at timestamptz);
      create table curriculum_lessons(id uuid primary key,week_id uuid references curriculum_weeks,is_published boolean,archived_at timestamptz);
      create table enrollments(id uuid primary key,user_id uuid references profiles,course_id uuid references courses,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
      grant select,insert,update on all tables in schema public to service_role;`);
    await db.exec(sql);
    const admin=id(),staff=id(),student=id(),other=id(),course=id(),otherCourse=id(),week=id(),lesson=id(),enrollment=id(),otherEnrollment=id(),wrongCourseEnrollment=id();
    await db.query("insert into profiles values($1,'admin','active'),($2,'staff','active'),($3,'member','active'),($4,'member','active')",[admin,staff,student,other]);
    await db.query('insert into courses(id) values($1),($2)',[course,otherCourse]);
    await db.query('insert into curriculum_weeks values($1,$2,true,null)',[week,course]);
    await db.query('insert into curriculum_lessons values($1,$2,true,null)',[lesson,week]);
    for (const [e,u,c] of [[enrollment,student,course],[otherEnrollment,other,course],[wrongCourseEnrollment,student,otherCourse]]) await db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null)",[e,u,c]);
    await db.exec('set role service_role');
    const document = { schemaVersion: 1, blocks: [{id:'q1',type:'question',question:{label:'원래 질문',kind:'text',required:true}}], checklist: [] };
    const save = async (revision,expected=null,doc=document,actor=admin)=>(await db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5) as value',[actor,lesson,expected,revision,doc])).rows[0].value;
    const read = async(actor=student,e=enrollment,revision=null)=>(await db.query('select edu_read_lesson_blocks($1,$2,$3,$4) as value',[actor,lesson,e,revision])).rows[0].value;
    const draft = async(write,expected=null,values={blocks:{q1:'첫 답변'},checklist:[]},revision=first,actor=student,e=enrollment)=>(await db.query('select edu_save_block_draft($1,$2,$3,$4,$5,$6,$7) as value',[actor,lesson,e,revision,expected,write,values])).rows[0].value;
    assert.equal((await read()).document,null);
    const first=id(); await save(first);
    assert.deepEqual(await save(first),{revision:first});
    await assert.rejects(save(first,null,{...document,checklist:[{id:'changed'}]}),/BLOCK_REQUEST_REUSED/);
    await assert.rejects(save(id()),/BLOCK_CONTENT_CHANGED/);
    await assert.rejects(save(id(),first,document,student),/BLOCK_FORBIDDEN/);
    await assert.rejects(save(id(),first,document,staff),/BLOCK_FORBIDDEN/);
    assert.deepEqual((await read()).document,document);
    await assert.rejects(read(other,enrollment),/BLOCK_FORBIDDEN/);
    await assert.rejects(read(student,wrongCourseEnrollment),/BLOCK_FORBIDDEN/);
    await assert.rejects(read(student,null),/BLOCK_FORBIDDEN/);
    assert.equal((await read(admin,null)).editable,true);
    const write1=id(); await draft(write1);
    assert.equal((await draft(write1)).writeId,write1); // Lost response: retry returns original receipt.
    await assert.rejects(draft(write1,null,{blocks:{q1:'違う'},checklist:[]}),/BLOCK_REQUEST_REUSED/);
    await assert.rejects(draft(id()),/BLOCK_DRAFT_CHANGED/);
    const write2=id(); await draft(write2,write1,{blocks:{q1:'다른 기기에서 저장'},checklist:[]});
    await assert.rejects(draft(id(),write1),/BLOCK_DRAFT_CHANGED/);
    assert.equal((await read()).draft.values.blocks.q1,'다른 기기에서 저장');
    assert.equal((await read(other,otherEnrollment)).draft,null);
    await assert.rejects(draft(id(),null,undefined,first,admin,enrollment),/BLOCK_FORBIDDEN/);
    const second=id(), changed=structuredClone(document); changed.blocks[0].question.label='새 질문'; await save(second,first,changed);
    await assert.rejects(draft(id(),write2),/BLOCK_CONTENT_CHANGED/);
    const current=await read();assert.equal(current.revision,second);assert.equal(current.draft,null);assert.equal(current.previousDrafts[0].revision,first);
    const previous=await read(student,enrollment,first); assert.equal(previous.document.blocks[0].question.label,'원래 질문');assert.equal(previous.draft.values.blocks.q1,'다른 기기에서 저장');
    await assert.rejects(read(other,otherEnrollment,first),/BLOCK_FORBIDDEN/);
    // Permissions are checked again even for idempotent repeats.
    await db.query("update profiles set status='suspended' where id=$1",[admin]); await assert.rejects(save(second,first,changed),/BLOCK_FORBIDDEN/);
    await db.query("update profiles set status='active' where id=$1",[admin]);
    for (const patch of ["status='refunded'", "revoked_at=now()", "access_ends_at=now()-interval '1 minute'", "access_starts_at=now()+interval '1 day'"]) {
      await db.query(`update enrollments set ${patch} where id=$1`,[enrollment]); await assert.rejects(read(),/BLOCK_FORBIDDEN/);
      await db.query("update enrollments set status='active',revoked_at=null,access_ends_at=null,access_starts_at=now()-interval '1 day' where id=$1",[enrollment]);
    }
    await db.query('update curriculum_lessons set is_published=false where id=$1',[lesson]);await assert.rejects(read(),/BLOCK_FORBIDDEN/);
    await db.query('update curriculum_lessons set is_published=true,archived_at=now() where id=$1',[lesson]);await assert.rejects(read(),/BLOCK_NOT_FOUND/);
    await db.query('update curriculum_lessons set archived_at=null where id=$1',[lesson]);
    await db.query('insert into site_settings values($1,$2)',[`edu_staff_permissions_${staff}`,{products:true}]);await save(id(),second,document,staff);
    await assert.rejects(db.query('update edu_lesson_block_versions set document=$1 where id=$2',[changed,first]),/permission denied/);
    await db.exec('reset role');
    // FK prevents a physical lesson delete from destroying students' old records.
    await assert.rejects(db.query('delete from curriculum_lessons where id=$1',[lesson]),/foreign key/);
    const tables=['edu_lesson_block_versions','edu_lesson_block_heads','edu_lesson_block_drafts'];
    for (const role of ['anon','authenticated']) for (const table of tables) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) as ok',[role,table,privilege])).rows[0].ok,false);
    }
    for (const fn of ['edu_read_lesson_blocks(uuid,uuid,uuid,uuid)','edu_save_lesson_blocks(uuid,uuid,uuid,uuid,jsonb)','edu_save_block_draft(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)']) {
      for (const role of ['anon','authenticated','service_role']) assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as ok",[role,fn])).rows[0].ok,role==='service_role');
    }
    assert.equal((await db.query('select count(*)::int as n from pg_class where relname=any($1) and relrowsecurity',[tables])).rows[0].n,3);
  } finally { await db.close(); }
});
