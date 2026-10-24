import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {replayAcl, privileges} from './helpers/data-api-acl.mjs';

const contract = JSON.parse(readFileSync(new URL('./fixtures/data-api-access.json', import.meta.url)));
test('EDU explicit ACLs preserve the reviewed access without Supabase automatic grants', async t => {
  const db = new PGlite(); t.after(() => db.close());
  const created = await replayAcl(db, new URL('../supabase/migrations/', import.meta.url), contract);
  assert.deepEqual([...created].sort(), contract.reviewedRelations, 'review new relations and their explicit grant/revoke decision');
  for (const [name, table] of Object.entries(contract.tables)) {
    assert.ok(created.has(name), name);
    for (const [role, expected] of Object.entries(table.grants))
      assert.deepEqual(await privileges(db, name, role), expected, `${name}: ${role}`);
    for (const [role, grants] of Object.entries(table.columnGrants || {}))
      for (const [privilege, columns] of Object.entries(grants))
        for (const column of columns)
          // Production retains the old avatar_url grant; DEV and the existing
          // profile hardening migration intentionally restrict it. No widening.
          if (!(name === 'profiles' && role === 'authenticated' && privilege === 'UPDATE' && column === 'avatar_url'))
            assert.equal((await db.query('select has_column_privilege($1,$2,$3,$4) as ok', [role,'public.' + name,column,privilege])).rows[0].ok, true, `${name}.${column}: ${role} ${privilege}`);
  }
  for (const column of ['role','status','avatar_url'])
    assert.equal((await db.query("select has_column_privilege('authenticated','public.profiles',$1,'UPDATE') as ok", [column])).rows[0].ok, false, 'preserve profile column hardening');
  await db.exec('create table public.future_private_table(id integer);');
  for (const role of ['anon','authenticated','service_role'])
    assert.deepEqual(await privileges(db,'future_private_table',role), [], 'do not restore broad default grants');
});
