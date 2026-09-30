import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('only a completed paid order fills an empty member phone', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.profiles(id uuid primary key, phone text, status text not null);
      create table public.orders(id uuid primary key, user_id uuid, status text not null, total_amount integer not null, customer_phone text);
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260927114506_paid_order_profile_phone.sql', import.meta.url), 'utf8'));
    const member = '11111111-1111-4111-8111-111111111111';
    const order = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into public.profiles(id,status) values($1,$2)', [member, 'active']);
    await db.query('insert into public.orders(id,user_id,status,total_amount,customer_phone) values($1,$2,$3,$4,$5)', [order, member, 'pending', 1650000, '010-1234-5678']);
    const profile = async () => (await db.query('select phone from public.profiles where id=$1', [member])).rows[0].phone;
    assert.equal(await profile(), null);
    await db.query("update public.orders set status='payment_failed' where id=$1", [order]);
    assert.equal(await profile(), null);
    await db.query("update public.orders set status='paid' where id=$1", [order]);
    assert.equal(await profile(), '01012345678');
    await db.query("update public.orders set customer_phone='010-9876-5432',status='paid' where id=$1", [order]);
    assert.equal(await profile(), '01012345678');

    await db.query('update public.profiles set phone=$1 where id=$2', ['01099998888', member]);
    const nextOrder = '33333333-3333-4333-8333-333333333333';
    await db.query('insert into public.orders(id,user_id,status,total_amount,customer_phone) values($1,$2,$3,$4,$5)', [nextOrder, member, 'pending', 1650000, '010-7777-6666']);
    await db.query("update public.orders set status='paid' where id=$1", [nextOrder]);
    assert.equal(await profile(), '01099998888');

    const freeMember = '44444444-4444-4444-8444-444444444444';
    const freeOrder = '55555555-5555-4555-8555-555555555555';
    await db.query('insert into public.profiles(id,status) values($1,$2)', [freeMember, 'active']);
    await db.query('insert into public.orders(id,user_id,status,total_amount,customer_phone) values($1,$2,$3,$4,$5)', [freeOrder, freeMember, 'pending', 0, '010-2222-3333']);
    await db.query("update public.orders set status='paid' where id=$1", [freeOrder]);
    assert.equal((await db.query('select phone from public.profiles where id=$1', [freeMember])).rows[0].phone, null);
  } finally { await db.close(); }
});


test('phone backfill preserves inactive/existing profiles and rejects invalid or replayed orders', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.profiles(id uuid primary key, phone text, status text not null);
      create table public.orders(id uuid primary key, user_id uuid, status text not null, total_amount integer not null, customer_phone text);`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260927114506_paid_order_profile_phone.sql', import.meta.url), 'utf8'));
    const permissions = (await db.query(`select prosecdef, proconfig,
      has_function_privilege('anon', oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', oid, 'execute') as member_execute
      from pg_proc where oid='public.edu_fill_profile_phone_from_paid_order()'::regprocedure`)).rows[0];
    assert.equal(permissions.prosecdef, false);
    assert.equal(permissions.anon_execute, false);
    assert.equal(permissions.member_execute, false);
    assert.deepEqual(permissions.proconfig, ['search_path=""']);
    const cases = [
      { phone: '', number: '010-1234-5678', expected: '01012345678' },
      { phone: '   ', number: '010-1234-5678', expected: '01012345678' },
      { phone: null, number: 'bad', expected: null },
      { phone: null, number: '02-1234-5678', expected: null },
      { phone: null, number: null, expected: null },
      { phone: '01099998888', number: '010-1234-5678', expected: '01099998888' },
      { phone: null, number: '010-1234-5678', status: 'suspended', expected: null },
      { phone: null, number: '010-1234-5678', old: 'paid', expected: null },
    ];
    for (let i=0;i<cases.length;i++) {
      const c=cases[i], id=`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
      await db.query('insert into public.profiles values($1,$2,$3)',[id,c.phone,c.status||'active']);
      await db.query('insert into public.orders values($1,$1,$2,1000,$3)',[id,c.old||'pending',c.number]);
      await db.query("update public.orders set status='paid' where id=$1",[id]);
      assert.equal((await db.query('select phone from public.profiles where id=$1',[id])).rows[0].phone,c.expected);
    }
  } finally { await db.close(); }
});
