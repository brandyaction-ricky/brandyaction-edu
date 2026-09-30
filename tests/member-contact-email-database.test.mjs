import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('delivery email migration preserves identities and enforces own-row/column boundaries', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.profiles(id uuid primary key, email text, full_name text, phone text, role text);
      insert into public.profiles values ('11111111-1111-4111-8111-111111111111','login@example.test','Member',null,'student'), ('22222222-2222-4222-8222-222222222222','other@example.test','Other',null,'student');
      alter table public.profiles enable row level security;
      grant select on public.profiles to authenticated;
      create policy own_select on public.profiles for select to authenticated using (id::text = current_setting('request.jwt.claim.sub', true));
      create policy own_update on public.profiles for update to authenticated using (id::text = current_setting('request.jwt.claim.sub', true)) with check (id::text = current_setting('request.jwt.claim.sub', true));
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/202608110001_profile_column_security.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/20260930130529_member_contact_email.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await db.query('select email,contact_email from public.profiles order by id')).rows, [{ email:'login@example.test',contact_email:null },{ email:'other@example.test',contact_email:null }]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';`);
    assert.equal((await db.query("update public.profiles set contact_email='notice@example.test' where id='11111111-1111-4111-8111-111111111111' returning id")).rows.length, 1);
    assert.equal((await db.query("update public.profiles set contact_email='notice@example.test' where id='22222222-2222-4222-8222-222222222222' returning id")).rows.length, 0);
    for (const [column,value] of [['email','bad@example.test'],['role','admin']]) {
      await assert.rejects(db.query(`update public.profiles set ${column}=$1`, [value]), { code:'42501' });
    }
    for (const value of ['invalid', 'notice@example.test,second@example.test', 'UPPER@example.test', 'x'.repeat(250)+'@example.test', '']) {
      await assert.rejects(db.query('update public.profiles set contact_email=$1', [value]), { code:'23514' });
    }
    await db.query('update public.profiles set contact_email=null');
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query("update public.profiles set contact_email='anon@example.test'"), { code:'42501' });
    await db.exec('reset role;');
    assert.equal((await db.query("select email,role from public.profiles where id='11111111-1111-4111-8111-111111111111'")).rows[0].email, 'login@example.test');
  } finally { await db.close(); }
});
