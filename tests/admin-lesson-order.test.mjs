import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261001061235_admin_lesson_reorder.sql', import.meta.url), 'utf8');
test('lesson reorder preserves IDs, reserved numbers, publication and learning records; rejects stale or unauthorized writes atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(id uuid primary key, allowed boolean);
      create table public.courses(id uuid primary key, archived_at timestamptz);
      create table public.curriculum_weeks(id uuid primary key, course_id uuid references public.courses, archived_at timestamptz);
      create table public.curriculum_lessons(id uuid primary key, week_id uuid references public.curriculum_weeks,
        day_number int not null check(day_number>0), display_order int not null default 0, title text, is_published boolean, is_preview boolean,
        archived_at timestamptz, updated_at timestamptz not null default '2026-10-01T00:00:00.123456Z',
        constraint curriculum_lessons_week_id_day_number_key unique(week_id,day_number) deferrable initially immediate);
      create table public.lesson_progress(lesson_id uuid references public.curriculum_lessons, answer text);
      create table public.audit_logs(actor_user_id uuid, action text, entity_type text, entity_id text, before_data jsonb, after_data jsonb);
      create function public.mission_operator_allowed(p_actor uuid,p_scope text) returns boolean language sql stable as $$
        select coalesce((select allowed from public.profiles where id=p_actor),false) and p_scope='products';
      $$;
      grant all on all tables in schema public to service_role;
    `);
    await db.exec(migration);
    const actor=randomUUID(), unscoped=randomUUID(), course=randomUUID(), otherCourse=randomUUID(), week=randomUUID(), otherWeek=randomUUID();
    const [a,b,c,archived,foreign]=Array.from({length:5},()=>randomUUID());
    await db.query('insert into public.profiles values ($1,true),($2,false)',[actor,unscoped]);
    await db.query('insert into public.courses(id) values ($1),($2)',[course,otherCourse]);
    await db.query('insert into public.curriculum_weeks(id,course_id) values ($1,$2),($3,$4)',[week,course,otherWeek,otherCourse]);
    await db.query(`insert into public.curriculum_lessons(id,week_id,day_number,title,is_published,is_preview,archived_at) values
      ($1,$2,6,'first',true,true,null),($3,$2,8,'second',false,false,null),($4,$2,10,'third',true,false,null),
      ($5,$2,7,'deleted',false,false,now()),($6,$7,1,'foreign',true,false,null)`,[a,week,b,c,archived,foreign,otherWeek]);
    await db.query("insert into public.lesson_progress values ($1,'saved answer')",[a]);
    const snapshot=async()=> (await db.query('select id,day_number,updated_at::text stamp from public.curriculum_lessons where week_id=$1 and archived_at is null order by day_number',[week])).rows;
    const unchanged=async()=> (await db.query('select id,week_id,title,is_published,is_preview,archived_at::text from public.curriculum_lessons order by id')).rows;
    const reorder=(ids,expected,who=actor,w=week,co=course)=>db.query('select public.edu_admin_reorder_lessons($1,$2,$3,$4,$5,$6,$7) changed',[who,co,w,ids,expected.map(x=>x.id),expected.map(x=>x.day_number),expected.map(x=>x.stamp)]);
    const original=await snapshot(), preserved=await unchanged();
    await db.exec('set role service_role');
    for(const [ids,who,w,co,pattern] of [
      [[a,a,c],actor,week,course,/INVALID/], [[a,c],actor,week,course,/INVALID/],
      [[a,foreign,c],actor,week,course,/CHANGED/], [[b,a,c],unscoped,week,course,/FORBIDDEN/],
      [[b,a,c],actor,otherWeek,course,/NOT_FOUND/], [[b,a,c],actor,week,otherCourse,/NOT_FOUND/],
    ]) await assert.rejects(reorder(ids,original,who,w,co),pattern);
    assert.deepEqual(await snapshot(),original);
    assert.equal((await reorder([a,b,c],original)).rows[0].changed,0);
    assert.equal((await db.query('select count(*)::int n from public.audit_logs')).rows[0].n,0);
    assert.equal((await reorder([b,c,a],original)).rows[0].changed,3);
    const moved=await snapshot();
    assert.deepEqual(moved.map(x=>[x.id,x.day_number]),[[b,6],[c,8],[a,10]]);
    assert.deepEqual(await unchanged(),preserved);
    assert.deepEqual((await db.query('select id,display_order from public.curriculum_lessons where week_id=$1 and archived_at is null order by display_order',[week])).rows.map(x=>[x.id,x.display_order]),[[b,6],[c,8],[a,10]]);
    assert.equal((await db.query('select day_number from public.curriculum_lessons where id=$1',[archived])).rows[0].day_number,7);
    assert.deepEqual((await db.query('select * from public.lesson_progress')).rows,[{lesson_id:a,answer:'saved answer'}]);
    const audit=(await db.query('select * from public.audit_logs')).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].entity_id,week);
    assert.deepEqual(audit[0].after_data.map(x=>x.id),[b,c,a]);
    await assert.rejects(reorder([c,b,a],original),/CHANGED/);
    await db.query("update public.curriculum_lessons set title='edited concurrently',updated_at=clock_timestamp() where id=$1",[a]);
    await assert.rejects(reorder([c,b,a],moved),/CHANGED/);
    const edited=await snapshot();
    await db.query('insert into public.curriculum_lessons(id,week_id,day_number) values($1,$2,11)',[randomUUID(),week]);
    await assert.rejects(reorder([c,b,a],edited),/CHANGED/);
    const current=await snapshot();
    await db.exec("reset role; create function public.reject_order_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$; create trigger reject_audit before insert on public.audit_logs for each row execute function public.reject_order_audit(); set role service_role;");
    await assert.rejects(reorder([...current.map(x=>x.id)].reverse(),current),/audit unavailable/);
    assert.deepEqual(await snapshot(),current,'all number and timestamp updates roll back when audit fails');
    await db.exec('reset role');
    for(const role of ['anon','authenticated','service_role']) assert.equal((await db.query("select has_function_privilege($1,'public.edu_admin_reorder_lessons(uuid,uuid,uuid,uuid[],uuid[],integer[],timestamptz[])','EXECUTE') allowed",[role])).rows[0].allowed,role==='service_role');
    assert.equal((await db.query("select prosecdef from pg_proc where proname='edu_admin_reorder_lessons'")).rows[0].prosecdef,false);
  } finally { await db.close(); }
});
