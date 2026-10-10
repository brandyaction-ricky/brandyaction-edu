import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customer = n => `k1:${String(n).padStart(43, 'x')}`;
const epoch = n => `ce_${String(n).padStart(32, 'e')}`;
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table profiles(id uuid primary key, status text not null default 'active',
      role text not null default 'student', is_internal boolean not null default false, deleted_at timestamptz);
    grant select,update on profiles to service_role;`);
  for (const name of ['20261008074257_edu_personalization_consent.sql', '20261009115301_edu_tips_erasure_outbox_v2.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  await db.exec("insert into edu_personalization_terms values('v1','Synthetic only','Synthetic only',now(),now(),true)");
  await db.query('insert into profiles(id) values($1),($2),($3)', [id(1), id(2), id(3)]);
  await db.exec('set role service_role');
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0].v;
  const owner = async (sql, args = []) => {
    await db.exec('reset role');
    try { return await db.query(sql, args); } finally { await db.exec('set role service_role'); }
  };
  const consent = (member, revision, analysis = true, overseas = true, previous = null, version = 'v1') => value(
    'select edu_personalization_consent($1,$2,$3::jsonb,$4,$5) as v',
    [id(member), id(revision), JSON.stringify({ analysis, overseas }), version, previous === null ? null : id(previous)]);
  const register = (member = 1, revision = 11, identity = member, version = 'v1') => value(
    'select edu_tips_register_subject($1,$2,$3,$4,$5) as v',
    [id(member), customer(identity), epoch(identity), version, id(revision)]);
  const queue = async () => (await db.query('select * from edu_tips_private.erasure_outbox order by requested_at,request_id')).rows;
  const claim = (limit = 20) => value('select edu_tips_claim_erasures($1) as v', [limit]);
  const finish = (row, success, error = null) => value('select edu_tips_finish_erasure_delivery($1,$2,$3,$4) as v', [row.requestId, row.lease_token, success, error]);
  return { db, value, owner, consent, register, queue, claim, finish };
}

test('registration requires current explicit consent, external active member and fresh revision', async t => {
  const { db, consent, register, owner } = await fixture(t);
  await assert.rejects(register(), /TIPS_NOT_ELIGIBLE/);
  await consent(1, 10, true, false);
  await assert.rejects(register(1, 10), /TIPS_NOT_ELIGIBLE/);
  await consent(1, 11, true, true, 10);
  await assert.rejects(register(1, 10), /TIPS_NOT_ELIGIBLE/);
  const expected = { customer_id: customer(1), consent_epoch: epoch(1) };
  assert.deepEqual(await register(), expected);
  assert.deepEqual(await register(), expected);
  await assert.rejects(register(1, 11, 9), /TIPS_IDENTITY_CONFLICT/);
  await consent(2, 12);
  await assert.rejects(register(2, 12, 1), /TIPS_IDENTITY_CONFLICT/);
  for (const assignment of ["role='admin'", "role='staff'", 'is_internal=true', "status='withdrawn'", 'deleted_at=now()']) {
    await owner(`update profiles set ${assignment} where id=$1`, [id(2)]);
    await assert.rejects(register(2, 12), /TIPS_NOT_ELIGIBLE/);
    await owner("update profiles set role='student',is_internal=false,status='active',deleted_at=null where id=$1", [id(2)]);
  }
  await assert.rejects(db.query('select edu_tips_register_subject($1,$2,$3,$4,$5)', [id(2), 'raw-email@example.test', epoch(2), 'v1', id(12)]), /TIPS_INVALID/);
  await assert.rejects(register(2, 12, 2, 'missing'), /TIPS_NOT_ELIGIBLE/);
});

test('withdrawal and outbox are atomic, idempotent, scoped to the member and block re-registration', async t => {
  const { db, consent, register, queue, value } = await fixture(t);
  await consent(1, 11); await register();
  await consent(2, 12); await register(2, 12);
  await db.exec('begin');
  await consent(1, 13, false, true, 11);
  assert.equal((await queue()).length, 1);
  await db.exec('rollback');
  assert.equal((await queue()).length, 0);
  assert.equal(await value('select count(*)::int as v from edu_tips_private.subjects where retired_at is null'), 2);
  await consent(1, 13, false, true, 11);
  await consent(1, 13, false, true, 11); // Lost-response retry of the same consent request.
  await consent(1, 14, false, false, 13);
  const rows = await queue();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, 'consent_withdrawn');
  assert.equal(rows[0].completed_at, null);
  assert.equal(new Date(rows[0].active_due_at) - new Date(rows[0].requested_at), 5 * 86400000);
  assert.equal(new Date(rows[0].model_due_at) - new Date(rows[0].requested_at), 30 * 86400000);
  assert.equal(new Date(rows[0].residual_due_at) - new Date(rows[0].requested_at), 30 * 86400000);
  assert.equal(await value('select retired_at is null as v from edu_tips_private.subjects where member_id=$1', [id(2)]), true);
  await consent(1, 15, true, true, 14);
  await assert.rejects(register(1, 15, 8), /TIPS_ERASURE_PENDING/);
});

test('account deletion survives profile cascade; internalization and preference deletion also enqueue', async t => {
  const { consent, register, queue, owner, claim, value } = await fixture(t);
  for (let n = 1; n <= 3; n++) { await consent(n, 10 + n); await register(n, 10 + n); }
  await owner('delete from profiles where id=$1', [id(1)]);
  await owner("update profiles set role='staff' where id=$1", [id(2)]);
  await owner('delete from edu_personalization_preferences where member_id=$1', [id(3)]);
  const rows = await queue();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.reason).sort(), ['account_deleted', 'consent_withdrawn', 'identity_retired']);
  assert.equal(await value('select member_id as v from edu_tips_private.subjects where customer_id=$1', [customer(1)]), null);
  const output = await claim();
  assert.equal(output.length, 3);
  assert.deepEqual(Object.fromEntries(output.map(r => [r.customer_id, r.reason])), {
    [customer(1)]: 'account_deleted', [customer(2)]: 'identity_retired', [customer(3)]: 'consent_withdrawn',
  });
  for (let n = 1; n <= 3; n++) assert.ok(!JSON.stringify(output).includes(id(n)));
  assert.ok(output.every(r => !('member_id' in r) && r.customer_id && r.consent_epoch));
});

test('replacing effective terms retires all and only identities under that disclosure', async t => {
  const { consent, register, owner, queue } = await fixture(t);
  await consent(1, 11); await register();
  await consent(2, 12); await register(2, 12);
  await owner("update edu_personalization_terms set is_current=false where version='v1'");
  assert.equal((await queue()).length, 2);
  await assert.rejects(register(), /TIPS_NOT_ELIGIBLE/);
  await owner("insert into edu_personalization_terms values('v2','New synthetic','New synthetic',now(),now(),true)");
  await consent(3, 13, true, true, null, 'v2');
  await register(3, 13, 3, 'v2');
  await owner("update edu_personalization_terms set is_current=false where version='v1'");
  assert.equal((await queue()).length, 2);
});

test('worker lease fencing, backoff and stable request IDs; delivery never means deletion completion', async t => {
  const { consent, register, claim, finish, owner, queue } = await fixture(t);
  await consent(1, 11); await register();
  await consent(1, 12, false, false, 11);
  await assert.rejects(claim(0), /TIPS_INVALID/);
  const first = (await claim())[0];
  assert.equal(first.attempt, 1);
  assert.deepEqual(await claim(), []);
  assert.equal(await finish({ ...first, lease_token: id(99) }, true), false);
  await assert.rejects(finish(first, false, 'RAW_SECRET_PROVIDER_RESPONSE'), /TIPS_INVALID/);
  assert.equal(await finish(first, false, 'transport_unavailable'), true);
  assert.deepEqual(await claim(), []);
  await owner('update edu_tips_private.erasure_outbox set next_attempt_at=now()-interval \'1 second\'');
  const second = (await claim())[0];
  assert.equal(second.requestId, first.requestId);
  assert.equal(second.attempt, 2);
  assert.notEqual(second.lease_token, first.lease_token);
  assert.equal(await finish(first, true), false);
  await owner('update edu_tips_private.erasure_outbox set lease_until=now()-interval \'1 second\'');
  assert.equal(await finish(second, true), false);
  const third = (await claim())[0];
  assert.equal(third.requestId, first.requestId);
  assert.equal(await finish(second, true), false);
  assert.equal(await finish(third, true), true);
  assert.equal(await finish(third, true), false);
  assert.deepEqual(await claim(), []);
  const row = (await queue())[0];
  assert.ok(row.delivered_at);
  assert.equal(row.completed_at, null);
  for (const field of ['active_due_at','model_due_at','residual_due_at']) {
    assert.equal(second[field], first[field]);
    assert.equal(third[field], first[field]);
    assert.equal(new Date(row[field]).getTime(), new Date(first[field]).getTime());
  }
  await consent(1, 13, true, true, 12);
  await assert.rejects(register(1, 13, 8), /TIPS_ERASURE_PENDING/);
});

test('browser roles cannot access queue or RPCs; service cannot edit notices or declare erasure complete', async t => {
  const { db, consent, register, claim } = await fixture(t);
  await consent(1, 11); await register();
  await consent(1, 12, false, false, 11);
  for (const sql of [
    'update edu_personalization_terms set is_current=false',
    'update edu_tips_private.erasure_outbox set completed_at=now()',
    'delete from edu_tips_private.erasure_outbox',
    "insert into edu_tips_private.erasure_outbox(subject_id,reason,delivered_at,completed_at) select id,'account_deleted',now(),now() from edu_tips_private.subjects limit 1",
    'select edu_tips_private.retire(null,\'account_deleted\')',
  ]) await assert.rejects(db.exec(sql), /permission denied/);
  assert.equal((await claim()).length, 1);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role;set role ${role}`);
    for (const sql of [
      'select * from edu_tips_private.subjects',
      'select * from edu_tips_private.erasure_outbox',
      "select edu_tips_private.lock_current_terms('v1')",
      'select edu_tips_claim_erasures()',
      'select edu_tips_register_subject(null,null,null,null,null)',
      'select edu_tips_finish_erasure_delivery(null,null,true)',
    ]) await assert.rejects(db.exec(sql), /permission denied/);
  }
});
