import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMigrations} from './migrations.mjs';
const file={path:'supabase/migrations/20261110101544_n6_partial_refund_access.sql',sha256:'a'.repeat(64)};
const applied={version:'20261110101544',sha256:'a'.repeat(64)};
test('already applied identical SQL is never planned again',()=>{assert.deepEqual(auditMigrations([file],[applied]),{ok:true,errors:[],pending:[]});});
test('applied SQL absent from release source blocks reconciliation',()=>{assert.equal(auditMigrations([],[applied]).ok,false);});
test('unknown SQL content is not accepted merely by version',()=>{assert.equal(auditMigrations([file],[{version:applied.version}]).ok,false);});
test('modified historical SQL is blocked',()=>{assert.equal(auditMigrations([{...file,sha256:'b'.repeat(64)}],[applied]).ok,false);});
test('duplicate versions and changed filenames do not cause replay',()=>{
  assert.equal(auditMigrations([file,{...file,path:file.path.replace('_n6_','_other_')}],[applied]).ok,false);
  assert.equal(auditMigrations([file],[applied,applied]).ok,false);
});
test('only unapplied versions are queued in timestamp order',()=>{
  const next={path:'supabase/migrations/20261117000000_new.sql',sha256:'b'.repeat(64)};
  assert.deepEqual(auditMigrations([next,file],[applied]).pending,[next]);
});
test('invalid source hashes and paths never produce executable pending SQL',()=>{
  for(const invalid of [{...file,sha256:''},{...file,path:'other/20261110101544_a.sql'}]){
    const result=auditMigrations([invalid],[]);assert.equal(result.ok,false);assert.deepEqual(result.pending,[]);
  }
});
