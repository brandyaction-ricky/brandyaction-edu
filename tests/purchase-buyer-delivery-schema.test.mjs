import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261103074433_purchase_buyer_delivery.sql', import.meta.url), 'utf8');
const id = number => '11111111-1111-4111-8111-' + String(number).padStart(12, '0');

test('purchase reservations are private, bounded and cannot create a second receipt per person', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table public.cohorts (id uuid primary key);
      create table public.profiles (id uuid primary key);
      create table public.crm_templates (id uuid primary key);
      create table public.crm_message_logs (member_id uuid references profiles(id));
      insert into cohorts values ('${id(1)}');
      insert into profiles values ('${id(2)}'), ('${id(3)}');
    `);
    await db.exec(migration);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from edu_purchase_delivery_batches'), /permission denied/);
    await db.exec('set role service_role');
    const save = recipients => db.query(`insert into edu_purchase_delivery_batches
      (id,cohort_id,created_by,channel,subject,content,recipient_ids,scheduled_at)
      values ($1,$2,$3,'email','안내','공지방 링크',$4,now())`, [id(4), id(1), id(2), recipients]);
    await assert.rejects(save([]), /check constraint/);
    await save([id(3)]);
    const scope = await db.query('select status, recipient_ids from edu_purchase_delivery_batches');
    assert.deepEqual(scope.rows, [{ status: 'scheduled', recipient_ids: [id(3)] }]);
    await db.exec('reset role');
    const receipt = () => db.query('insert into crm_message_logs (purchase_batch_id,member_id) values ($1,$2)', [id(4), id(3)]);
    await receipt();
    await assert.rejects(receipt(), /duplicate key/);
    const claim = () => db.query("update edu_purchase_delivery_batches set status='sending' where id=$1 and status='scheduled' returning id", [id(4)]);
    assert.equal((await claim()).rows.length, 1);
    assert.equal((await claim()).rows.length, 0);
  } finally { await db.close(); }
});
