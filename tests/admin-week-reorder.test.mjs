import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260927050000_admin_week_reorder.sql', import.meta.url), 'utf8');

test('week reorder is atomic, product-scoped, permission-checked, archived-safe and audited', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.profiles(id uuid primary key, role text not null, status text not null);
      create table public.site_settings(key text primary key, value jsonb not null);
      create table public.courses(id uuid primary key);
      create table public.curriculum_weeks(
        id uuid primary key,
        course_id uuid not null references public.courses(id),
        week_number integer not null check (week_number > 0),
        updated_at timestamptz not null default now(),
        constraint curriculum_weeks_course_id_week_number_key unique(course_id, week_number) deferrable initially immediate
      );
      create table public.audit_logs(
        id uuid primary key default gen_random_uuid(), actor_user_id uuid not null,
        action text not null, entity_type text not null, entity_id text,
        before_data jsonb, after_data jsonb
      );
      create function public.mission_operator_allowed(p_actor uuid, p_scope text)
      returns boolean language sql stable as $$
        select exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and (
          p.role='admin' or (p.role='staff' and coalesce((select (s.value->>p_scope)::boolean from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text),false))
        ));
      $$;
      grant all on all tables in schema public to service_role;
    `);
    await db.exec(migration);

    const admin = randomUUID(), scopedStaff = randomUUID(), unscopedStaff = randomUUID();
    const course = randomUUID(), otherCourse = randomUUID();
    const [first, second, third, archived, foreign] = Array.from({ length: 5 }, () => randomUUID());
    await db.query("insert into public.profiles values ($1,'admin','active'),($2,'staff','active'),($3,'staff','active')", [admin, scopedStaff, unscopedStaff]);
    await db.query("insert into public.site_settings values ($1,$2)", [`edu_staff_permissions_${scopedStaff}`, { products: true }]);
    await db.query('insert into public.courses values ($1),($2)', [course, otherCourse]);
    await db.query('insert into public.curriculum_weeks(id,course_id,week_number) values ($1,$2,1),($3,$2,2),($4,$2,3),($5,$2,4),($6,$7,1)', [first, course, second, third, archived, foreign, otherCourse]);

    const reorder = (actor, ids, courseId = course) => db.query('select public.edu_admin_reorder_weeks($1,$2,$3) as changed', [actor, courseId, ids]);
    await db.exec('set role service_role');
    const result = await reorder(scopedStaff, [second, first, third, archived]);
    assert.equal(result.rows[0].changed, 4);
    const order = await db.query('select id,week_number from public.curriculum_weeks where course_id=$1 order by week_number', [course]);
    assert.deepEqual(order.rows.map((row) => [row.id, row.week_number]), [[second, 1], [first, 2], [third, 3], [archived, 4]]);
    assert.equal((await db.query("select count(*)::int as n from public.audit_logs where action='curriculum.weeks_reordered'")).rows[0].n, 1);

    await assert.rejects(reorder(admin, [first, first, third, archived]), /상품과 주차 목록/);
    await assert.rejects(reorder(admin, [first, third, archived]), /주차 목록이 변경/);
    await assert.rejects(reorder(admin, [first, third, archived, foreign]), /주차 목록이 변경/);
    await assert.rejects(reorder(unscopedStaff, [first, second, third, archived]), /상품 관리 권한/);
    await assert.rejects(reorder(admin, [first, second], randomUUID()), /상품을 찾을 수 없습니다/);
    const unchanged = await db.query('select id,week_number from public.curriculum_weeks where course_id=$1 order by week_number', [course]);
    assert.deepEqual(unchanged.rows.map((row) => [row.id, row.week_number]), [[second, 1], [first, 2], [third, 3], [archived, 4]]);
    assert.equal((await db.query("select count(*)::int as n from public.audit_logs where action='curriculum.weeks_reordered'")).rows[0].n, 1);
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query("select has_function_privilege($1,'public.edu_admin_reorder_weeks(uuid,uuid,uuid[])','EXECUTE') as allowed", [role])).rows[0].allowed, role === 'service_role');
    }
  } finally {
    await db.close();
  }
});
