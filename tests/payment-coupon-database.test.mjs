import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migrations = [
  '202608040001_initial_education_platform',
  '202608060001_launch_transactions',
  '202608060002_security_hardening',
  '202608120006_crm',
  '202608160006_coupons',
  '202608160007_crm_automation_engine',
  '202608160008_customer_coupon_wallet',
  '202608160009_automatic_customer_tags',
  '202608190001_free_class_checkout',
  '202609080001_learning_missions_and_achievements',
  '20260914020500_configurable_customer_tag_rules',
  '20260914063811_configurable_tag_thresholds',
  '20260916074606_repair_payment_coupon_consistency',
  '20260916075611_align_zero_total_checkout',
  '20260927112825_admin_coupon_lifecycle',
];

test('payment and coupon SQL smoke passes against isolated PostgreSQL and rolls back fixtures', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    // Recreate only the Supabase platform objects referenced by these migrations.
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, phone text);
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create schema storage;
      create table storage.buckets(
        id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects(bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql
        as $$select string_to_array($1, chr(47))$$;
    `);

    for (const migration of migrations) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}.sql`, import.meta.url), 'utf8'));
    }

    await db.query(
      'insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)',
      ['00000000-0000-4000-8000-000000000001', 'qa@example.invalid', {}],
    );
    await db.exec(readFileSync(new URL('./payment-coupon-database.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('./admin-coupon-lifecycle.sql', import.meta.url), 'utf8'));

    const { rows } = await db.query(`
      select
        (select count(*)::integer from public.orders) as orders,
        (select count(*)::integer from public.coupons) as coupons,
        (select count(*)::integer from public.payments) as payments,
        (select count(*)::integer from public.enrollments) as enrollments
    `);
    assert.deepEqual(rows, [{ orders: 0, coupons: 0, payments: 0, enrollments: 0 }]);
  } finally {
    await db.close();
  }
});
