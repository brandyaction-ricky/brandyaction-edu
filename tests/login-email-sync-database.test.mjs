import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('confirmed Auth email change updates only the same member profile', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_change text);
      create table public.profiles(id uuid primary key, email text not null, contact_email text);
      create table public.orders(id uuid primary key, user_id uuid not null);
      create table public.enrollments(id uuid primary key, user_id uuid not null);
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260930212000_sync_auth_email_to_profile.sql', import.meta.url), 'utf8'));
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [first, 'old@example.test', second, 'other@example.test']);
    await db.query('insert into public.profiles(id,email,contact_email) values($1,$2,$3),($4,$5,$6)', [first, 'old@example.test', 'notice@example.test', second, 'other@example.test', null]);
    await db.query('insert into public.orders values($1,$2)', ['33333333-3333-4333-8333-333333333333', first]);
    await db.query('insert into public.enrollments values($1,$2)', ['44444444-4444-4444-8444-444444444444', first]);

    // Pending verification changes only auth.users.email_change.
    await db.query('update auth.users set email_change=$1 where id=$2', ['new@example.test', first]);
    assert.equal((await db.query('select email from public.profiles where id=$1', [first])).rows[0].email, 'old@example.test');

    await db.query('update auth.users set email=$1,email_change=null where id=$2', ['new@example.test', first]);
    const profiles = (await db.query('select id,email,contact_email from public.profiles order by id')).rows;
    assert.deepEqual(profiles, [
      { id: first, email: 'new@example.test', contact_email: 'notice@example.test' },
      { id: second, email: 'other@example.test', contact_email: null },
    ]);
    assert.equal((await db.query('select user_id from public.orders')).rows[0].user_id, first);
    assert.equal((await db.query('select user_id from public.enrollments')).rows[0].user_id, first);
    const permissions = (await db.query(`select prosecdef,proconfig,
      has_function_privilege('anon',oid,'execute') as anon_execute,
      has_function_privilege('authenticated',oid,'execute') as member_execute
      from pg_proc where oid='public.edu_sync_auth_email_to_profile()'::regprocedure`)).rows[0];
    assert.equal(permissions.prosecdef, true);
    assert.deepEqual(permissions.proconfig, ['search_path=""']);
    assert.equal(permissions.anon_execute, false);
    assert.equal(permissions.member_execute, false);
  } finally { await db.close(); }
});
