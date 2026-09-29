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
