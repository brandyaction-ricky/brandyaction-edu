import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261103074433_purchase_buyer_delivery.sql', import.meta.url), 'utf8');
const selectionMigration = fs.readFileSync(new URL('../supabase/migrations/20261104054058_purchase_delivery_recipient_selection.sql', import.meta.url), 'utf8');
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
    await db.exec('reset role');
    await db.exec(selectionMigration);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from edu_purchase_delivery_reservations'), /permission denied/);
    await db.exec('set role service_role');
    const chunk = (batch, reservation, channel, recipients) => db.query(`insert into edu_purchase_delivery_batches
      (id,cohort_id,created_by,channel,content,recipient_ids,scheduled_at,reservation_id)
      values ($1,$2,$3,$4,'공지방 링크',$5,now(),$6)`, [batch, id(1), id(2), channel, recipients, reservation]);
    const buyers = Array.from({ length: 101 }, (_, i) => id(100 + i));
    await assert.rejects(chunk(id(5), id(5), 'sms', buyers), /check constraint/);
    await assert.rejects(chunk(id(5), id(5), 'alimtalk', buyers.slice(0, 1)), /check constraint/);
    await chunk(id(5), id(5), 'sms', buyers.slice(0, 100));
    await chunk(id(6), id(5), 'sms', buyers.slice(100));
    const reservation = async () => (await db.query('select count,pending_count,status from edu_purchase_delivery_reservations where id=$1', [id(5)])).rows;
    assert.deepEqual(await reservation(), [{ count: 101, pending_count: 101, status: 'scheduled' }]);
    await db.query("update edu_purchase_delivery_batches set status='completed',accepted_count=100 where id=$1", [id(5)]);
    assert.deepEqual(await reservation(), [{ count: 101, pending_count: 1, status: 'sending' }]);
    await db.query("update edu_purchase_delivery_batches set status='cancelled' where (id=$1 or reservation_id=$1) and cohort_id=$2 and status='scheduled'", [id(5), id(1)]);
    assert.deepEqual(await reservation(), [{ count: 101, pending_count: 0, status: 'partially_cancelled' }]);
    const scope = await db.query('select status, recipient_ids from edu_purchase_delivery_batches where id=$1', [id(4)]);
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
