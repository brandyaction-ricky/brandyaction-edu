import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/202608060001_launch_transactions.sql', import.meta.url),
  'utf8',
);

function functionSql(name) {
  const marker = `create or replace function public.${name}(`;
  const start = migration.indexOf(marker);
  assert.notEqual(start, -1, `${name} migration is missing`);
  const end = migration.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `${name} migration is incomplete`);
  return migration.slice(start, end + 4);
}

test('payment RPC retries keep one payment and one enrollment', async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.orders (
      id uuid primary key,
      order_number text unique not null,
      user_id uuid,
      total_amount integer not null,
      status text not null,
      paid_at timestamptz,
      cancelled_at timestamptz,
      expires_at timestamptz
    );
    create table public.cohorts (
      id uuid primary key,
      operation_end_at timestamptz
    );
    create table public.order_items (
      id uuid primary key,
      order_id uuid not null,
      course_id uuid not null,
      cohort_id uuid not null,
      created_at timestamptz not null default now()
    );
    create table public.payments (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null unique,
      provider text not null,
      provider_payment_key text unique,
      method text,
      status text not null,
      approved_amount integer not null default 0,
      cancelled_amount integer not null default 0,
      receipt_url text,
      provider_payload jsonb not null default '{}'::jsonb,
      approved_at timestamptz
    );
    create table public.enrollments (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      course_id uuid not null,
      cohort_id uuid not null,
      order_item_id uuid not null unique,
      status text not null,
      access_starts_at timestamptz not null,
      access_ends_at timestamptz,
      revoked_at timestamptz,
      unique (user_id, cohort_id)
    );
    create table public.audit_logs (
      action text not null,
      entity_type text not null,
      entity_id text not null,
      after_data jsonb
    );
  `);
  await db.exec(functionSql('record_toss_waiting_payment'));
  await db.exec(functionSql('finalize_toss_payment'));

  const orderId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const courseId = '33333333-3333-4333-8333-333333333333';
  const cohortId = '44444444-4444-4444-8444-444444444444';
  const itemId = '55555555-5555-4555-8555-555555555555';
  await db.query(
    `insert into public.orders (id, order_number, user_id, total_amount, status)
     values ($1, 'BAE-idempotent', $2, 1000, 'pending')`,
    [orderId, userId],
  );
  await db.query(
    `insert into public.cohorts (id, operation_end_at)
     values ($1, '2026-12-31T00:00:00Z')`,
    [cohortId],
  );
  await db.query(
    `insert into public.order_items (id, order_id, course_id, cohort_id)
     values ($1, $2, $3, $4)`,
    [itemId, orderId, courseId, cohortId],
  );

  const waiting = `select public.record_toss_waiting_payment(
    'BAE-idempotent', 'payment-key', '가상계좌', 1000, null, '{}'::jsonb, '2026-09-22T00:00:00Z'
  )`;
  await db.exec(waiting);
  await db.exec(waiting);
  assert.equal((await db.query('select count(*)::int as count from public.payments')).rows[0].count, 1);
  assert.equal((await db.query('select count(*)::int as count from public.enrollments')).rows[0].count, 0);

  const done = `select public.finalize_toss_payment(
    'BAE-idempotent', 'payment-key', '가상계좌', 1000, null, '{}'::jsonb, '2026-09-21T00:00:00Z'
  )`;
  await db.exec(done);
  await db.exec(done);
  assert.equal((await db.query('select count(*)::int as count from public.payments')).rows[0].count, 1);
  assert.equal((await db.query('select count(*)::int as count from public.enrollments')).rows[0].count, 1);

  await db.close();
});
