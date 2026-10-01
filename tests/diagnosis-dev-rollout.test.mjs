import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {diagnosisMigrationFiles, prepareDiagnosisDevRollout} from '../scripts/lib/diagnosis-dev-rollout.mjs';

const files = diagnosisMigrationFiles('edu');
const sources = Object.fromEntries(files.map(file => [file, readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')]));
const entry = file => ({version: file.slice(0,14), name: file.slice(15,-4), checksum: createHash('sha256').update(sources[file]).digest('hex')});
const base = {target:'edu', projectRef:'vjmjhaidlqkmascdjocw', sources, official:[], checksums:[]};

test('plans earlier pending diagnosis versions despite a newer applied migration', () => {
  const plan = prepareDiagnosisDevRollout({...base, official:[{version:'20261002100000', name:'unrelated_later_change'}]});
  assert.equal(plan.pendingCount,3);
  assert.deepEqual(plan.migrations.map(row=>row.file),files);
  assert.match(plan.verificationSql,/rollback;\s*$/);
  assert.doesNotMatch(plan.verificationSql,/^\s*commit\s*;/im);
  assert.doesNotMatch(plan.verificationSql,/unrelated_later_change/);
});
test('rejects both production targets and swapped DEV targets', () => {
  for(const projectRef of ['qitqxizuwmmlhlcgsrqe','okdlarcuulsevbisrser','dmjiqtpqmwnpmwqtyehj'])
    assert.throws(()=>prepareDiagnosisDevRollout({...base,projectRef}),/DEV project/);
  assert.throws(()=>diagnosisMigrationFiles('production'),/Unknown/);
});
test('rejects modified or missing migration files', () => {
  assert.throws(()=>prepareDiagnosisDevRollout({...base,sources:{...sources,[files[0]]:sources[files[0]]+'\n'}}),/changed/);
  assert.throws(()=>prepareDiagnosisDevRollout({...base,sources:{}}),/Missing/);
});
test('skips verified applied prefix and retains ordered pending migrations', () => {
  const plan = prepareDiagnosisDevRollout({...base,checksums:[entry(files[0])]});
  assert.equal(plan.pendingCount,2);
  assert.equal(plan.migrations[0].evidence,'checksum');
  assert.doesNotMatch(plan.verificationSql,/create table public.edu_diagnosis_control/);
});
test('rejects mismatched applied checksums and version-name conflicts', () => {
  assert.throws(()=>prepareDiagnosisDevRollout({...base,checksums:[{...entry(files[0]),checksum:'wrong'}]}),/mismatch/);
  assert.throws(()=>prepareDiagnosisDevRollout({...base,official:[{...entry(files[0]),name:'other'}]}),/not edu_diagnosis/);
});
test('rejects missing prerequisites and duplicate ledger entries', () => {
  assert.throws(()=>prepareDiagnosisDevRollout({...base,official:[entry(files[1])]}),/missing prerequisite/);
  assert.throws(()=>prepareDiagnosisDevRollout({...base,official:[entry(files[0]),entry(files[0])]}),/duplicate/);
});
test('does not claim official registration proves the stored migration content', () => {
  const plan = prepareDiagnosisDevRollout({...base,official:files.map(entry)});
  assert.equal(plan.pendingCount,0);
  assert.equal(plan.warnings.length,1);
  assert.doesNotMatch(plan.verificationSql,/create table/);
});
test('requires explicit ledger snapshots instead of silently assuming an empty DB', () => {
  assert.throws(()=>prepareDiagnosisDevRollout({...base,official:undefined}),/must be an array/);
  assert.throws(()=>prepareDiagnosisDevRollout({...base,checksums:undefined}),/must be an array/);
});
test('CLI creates only an offline plan, refuses overwrite and has no apply switch', t => {
  const dir = mkdtempSync(join(tmpdir(),'diagnosis-rollout-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const ledger = join(dir,'ledger.json'), out = join(dir,'plan');
  writeFileSync(ledger,JSON.stringify({projectRef:base.projectRef,official:[],checksums:[]}));
  const args = [fileURLToPath(new URL('../scripts/prepare-diagnosis-dev-rollout.mjs',import.meta.url)),
    '--target','edu','--source-root',fileURLToPath(new URL('../',import.meta.url)), '--ledger',ledger,'--out',out];
  const run = extra=>spawnSync(process.execPath,[...args,...extra],{encoding:'utf8'});
  assert.equal(run([]).status,0);
  assert.equal(JSON.parse(readFileSync(join(out,'plan.json'),'utf8')).pendingCount,3);
  const sql = readFileSync(join(out,'verify-rollback.sql'),'utf8');
  assert.match(sql,/rollback;\s*$/);
  assert.notEqual(run([]).status,0);
  assert.equal(readFileSync(join(out,'verify-rollback.sql'),'utf8'),sql);
  assert.notEqual(run(['--apply']).status,0);
  const denied = join(dir,'denied');
  writeFileSync(ledger,JSON.stringify({projectRef:'qitqxizuwmmlhlcgsrqe',official:[],checksums:[]}));
  assert.notEqual(spawnSync(process.execPath,[...args.slice(0,-1),denied],{encoding:'utf8'}).status,0);
  assert.equal(existsSync(denied),false);
});
