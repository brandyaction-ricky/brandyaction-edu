import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260927060000_order_entry_source.sql', import.meta.url), 'utf8');

test('order entry source migration is repeatable for an equivalent pre-existing constraint', async () => {
  const db = new PGlite();
  try {
    await db.exec('create table public.orders(id uuid primary key, entry_src text, constraint orders_entry_src_check check (entry_src is null or entry_src in (\'paid\', \'organic\', \'alumni\', \'youtube\')))');
    await db.exec(migration);
    await assert.rejects(db.query("insert into public.orders(id, entry_src) values (gen_random_uuid(), 'unknown')"), /orders_entry_src_check/);
    assert.equal((await db.query("select count(*)::int as count from pg_constraint where conname='orders_entry_src_check'")).rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test('order entry source migration refuses a conflicting pre-existing constraint', async () => {
  const db = new PGlite();
  try {
    await db.exec('create table public.orders(id uuid primary key, entry_src text, constraint orders_entry_src_check check (entry_src is null))');
    await assert.rejects(db.exec(migration), /unexpected definition/);
    assert.equal((await db.query("select count(*)::int as count from pg_constraint where conname='orders_entry_src_check'")).rows[0].count, 1);
  } finally {
    await db.close();
  }
});
