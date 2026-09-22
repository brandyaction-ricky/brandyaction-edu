import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { migrationAction, migrationBody } from '../scripts/dev-migration-plan.mjs';

const sql = "begin;\n\ncreate table example(id uuid);\n\ncommit;\n";
const input = {fileName:'123_example.sql',name:'example',sql,checksum:'sha256'};
test('unapplied migrations execute, and checksum-verified DEV migrations skip', () => {
  assert.equal(migrationAction(input), 'apply');
  assert.equal(migrationAction({...input,appliedChecksum:'sha256'}), 'skip');
  assert.throws(() => migrationAction({...input,appliedChecksum:'different'}), /changed after/);
});
test('identical native migration records are adopted without executing DDL twice', () => {
  assert.equal(migrationAction({...input,nativeMigration:{name:'example',statements:['create table example(id uuid);']}}), 'record-existing');
  const mission = readFileSync(new URL('../supabase/migrations/20260921144834_member_mission_workspace.sql', import.meta.url),'utf8');
  assert.equal(migrationAction({...input,sql:mission,nativeMigration:{name:'example',statements:[migrationBody(mission)]}}), 'record-existing');
});
test('native history cannot silently bypass changed SQL or missing evidence', () => {
  for(const nativeMigration of [
    {name:'other',statements:[migrationBody(sql)]},
    {name:'example',statements:['create table example(id text);']},
    {name:'example',statements:null}, {name:'example',statements:[]},
    {name:'example',statements:[null]},
  ]) assert.throws(() => migrationAction({...input,nativeMigration}), /conflicts with Supabase/);
  const literal = {...input,sql:"select 'a  b';"};
  assert.throws(() => migrationAction({...literal,nativeMigration:{name:'example',statements:["select 'a b';"]}}), /conflicts with Supabase/);
});
