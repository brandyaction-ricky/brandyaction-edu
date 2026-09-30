import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/interactive-curriculum-copy.mjs';

const sql = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
async function fixture(t) {
  const f = await setup(t);
  await f.owner(`alter table curriculum_weeks alter column id set default gen_random_uuid();
    alter table curriculum_weeks add column updated_at timestamptz default now();
    alter table curriculum_weeks add constraint curriculum_weeks_course_id_week_number_key unique(course_id,week_number) deferrable initially immediate;
    alter table audit_logs add column before_data jsonb;
    create function mission_operator_allowed(actor uuid,scope text) returns boolean language sql stable as $$ select exists(select 1 from public.profiles where id=actor and role='admin' and status='active') $$;`);
  // Test the repository timestamp order too: the restore wrapper can be defined
  // before #250's archive function and invoked once both migrations are applied.
  await f.owner(sql('20260929044416_curriculum_active_week_numbers.sql'));
  await f.owner(sql('20260929120000_product_curriculum_archive.sql'));
  const create = (title='새 주차', request=id(), actor=f.admin, course=f.course) => f.rpc('edu_create_curriculum_week',[actor,course,request,title]);
  const restore = (number=1, move=null, actor=f.admin) => f.rpc('edu_restore_curriculum_week',[actor,f.course,f.week,number,move]);
  const archive = () => f.rpc('edu_set_curriculum_archive',[f.admin,f.course,'week',f.week,true]);
  return {...f,create,restore,archive};
}

test('deleted week 1 frees number 1; hidden active weeks reserve numbers; retries do not create duplicates', async t => {
  const f=await fixture(t);
  await f.archive();
  const request=id();
  const first=await f.create('새 내용',request);
  assert.equal(first.week_number,1);
  assert.notEqual(first.id,f.week);
  assert.equal(first.is_published,false);
  assert.deepEqual(await f.create('새 내용',request),first);
  await assert.rejects(f.create('다른 내용',request),/CURRICULUM_REQUEST_REUSED/);
  const third=await f.create();
  assert.equal(third.week_number,2);
  await f.db.query('update curriculum_weeks set week_number=3 where id=$1',[third.id]);
  assert.equal((await f.create()).week_number,2);
  assert.equal((await f.db.query('select week_number,archived_at is not null as archived from curriculum_weeks where id=$1',[f.week])).rows[0].archived,true);
});

test('restore requires an explicit free number, preserves linked records, and re-proposes after a race', async t => {
  const f=await fixture(t);
  await f.draft();const submitted=await f.submit();
  await f.archive();await f.create();
  assert.deepEqual(await f.restore(),{needsConfirmation:true,weekNumber:1,suggestedWeekNumber:2});
  assert.equal((await f.db.query('select archived_at is not null as archived from curriculum_weeks where id=$1',[f.week])).rows[0].archived,true);
  await f.create('번호 2를 먼저 사용');
  assert.deepEqual(await f.restore(1,2),{needsConfirmation:true,weekNumber:1,suggestedWeekNumber:3});
  const restored=await f.restore(1,3);
  assert.equal(restored.weekNumber,3);assert.equal(restored.id,f.week);
  assert.equal((await f.restore(1,3)).weekNumber,3);
  assert.equal((await f.db.query('select week_id from curriculum_lessons where id=$1',[f.lessonId])).rows[0].week_id,f.week);
  assert.equal((await f.db.query('select lesson_id from edu_lesson_block_submissions where id=$1',[submitted.id])).rows[0].lesson_id,f.lessonId);
  assert.deepEqual((await f.db.query('select is_published,archived_at is not null as archived from curriculum_weeks where id=$1',[f.week])).rows[0],{is_published:false,archived:false});
  assert.equal((await f.db.query('select count(*)::int n from audit_logs where action=\'curriculum.week_restore_number_changed\'')).rows[0].n,1);
});

test('free original number restores unchanged and permission/number validation cannot bypass the boundary', async t => {
  const f=await fixture(t);await f.archive();
  await assert.rejects(f.restore(1,null,f.student),/CURRICULUM_FORBIDDEN/);
  await assert.rejects(f.create('금지',id(),f.student),/CURRICULUM_FORBIDDEN/);
  await assert.rejects(f.restore(1,0),/CURRICULUM_INVALID/);
  await assert.rejects(f.restore(2),/CURRICULUM_CHANGED/);
  assert.equal((await f.restore()).weekNumber,1);
  const another=await f.create();
  await assert.rejects(f.db.query('update curriculum_weeks set week_number=1 where id=$1',[another.id]),/course_id_week_number_key/);
  for(const role of ['anon','authenticated']) {
    const result=await f.db.query("select has_function_privilege($1,'edu_create_curriculum_week(uuid,uuid,uuid,text)','EXECUTE') as create_allowed,has_function_privilege($1,'edu_restore_curriculum_week(uuid,uuid,uuid,integer,integer)','EXECUTE') as restore_allowed",[role]);
    assert.deepEqual(result.rows[0],{create_allowed:false,restore_allowed:false});
  }
});

test('reorder skips archived weeks and keeps active onboarding at zero', async t => {
  const f=await fixture(t);await f.archive();
  const first=await f.create(),second=await f.create(),zero=id();
  await f.db.query("insert into curriculum_weeks(id,course_id,week_number,title,is_published) values($1,$2,0,'온보딩',false)",[zero,f.course]);
  assert.equal(await f.rpc('edu_admin_reorder_weeks',[f.admin,f.course,[zero,second.id,first.id]]),3);
  assert.equal((await f.db.query('select week_number from curriculum_weeks where id=$1',[f.week])).rows[0].week_number,1);
  assert.deepEqual((await f.db.query('select id,week_number from curriculum_weeks where course_id=$1 and archived_at is null order by week_number',[f.course])).rows.map(r=>[r.id,r.week_number]),[[zero,0],[second.id,1],[first.id,2]]);
  await assert.rejects(f.rpc('edu_admin_reorder_weeks',[f.admin,f.course,[second.id,zero,first.id]]),/0주차/);
});
