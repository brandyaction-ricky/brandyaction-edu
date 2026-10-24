import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('onboarding answers are one per order and not directly exposed to signed-in clients', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      create table profiles(id uuid primary key);
      create table orders(id uuid primary key);
    `);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260927111748_edu_purchase_onboarding.sql', import.meta.url), 'utf8'));
    const user = randomUUID(), order = randomUUID();
    await db.query('insert into profiles(id) values($1)', [user]);
    await db.query('insert into orders(id) values($1)', [order]);
    await db.query("insert into edu_purchase_onboarding(order_id,user_id,survey_room) values($1,$2,'paid')", [order, user]);
    await assert.rejects(db.query("insert into edu_purchase_onboarding(order_id,user_id,survey_room) values($1,$2,'organic')", [order, user]), /duplicate key/);
    await assert.rejects(db.query("update edu_purchase_onboarding set survey_room='other' where order_id=$1", [order]), /check constraint/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select survey_room from edu_purchase_onboarding'), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('checklist saves do not erase other steps; access and comment constraints are enforced', async () => {
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create table profiles(id uuid primary key);create table orders(id uuid primary key);`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261010031325_purchase_onboarding_checklist.sql',import.meta.url),'utf8'));
  const user=randomUUID(),order=randomUUID();await db.query('insert into profiles values($1)',[user]);await db.query('insert into orders values($1)',[order]);
  await db.exec('set role service_role');
  for (const step of ['telegram','app','telegram']) await db.query(`insert into edu_onboarding_steps(order_id,user_id,step) values($1,$2,$3) on conflict(order_id,step) do update set confirmed_at=now()`,[order,user,step]);
  assert.equal((await db.query('select * from edu_onboarding_steps')).rows.length,2);
  await assert.rejects(db.query(`insert into edu_onboarding_steps(order_id,user_id,step) values($1,$2,'learning')`,[order,user]),/check constraint/);
  for(const role of ['anon','authenticated']) {await db.exec('reset role;set role '+role);await assert.rejects(db.query('select * from edu_onboarding_steps'),/permission denied/);await assert.rejects(db.query(`insert into edu_onboarding_steps(order_id,user_id,step) values($1,$2,'orientation')`,[order,user]),/permission denied/);}
 } finally {await db.close();}
});
