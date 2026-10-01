import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {parseArgs} from 'node:util';
import {diagnosisMigrationFiles, prepareDiagnosisDevRollout} from './lib/diagnosis-dev-rollout.mjs';

const {values} = parseArgs({options: {
  target: {type: 'string'}, 'source-root': {type: 'string'},
  ledger: {type: 'string'}, out: {type: 'string'}, help: {type: 'boolean'},
}, strict: true, allowPositionals: false});
if (values.help) {
  console.log('Usage: node scripts/prepare-diagnosis-dev-rollout.mjs --target edu|myin --source-root REPO --ledger SNAPSHOT.json --out NEW_DIRECTORY');
  console.log('Snapshot: {projectRef, official:[{version,name}], checksums:[{version,name,checksum}]}');
  console.log('Writes a plan and ROLLBACK-only SQL. Reads local files only; never connects or applies changes.');
} else {
  if (!values.target || !values['source-root'] || !values.ledger || !values.out)
    throw Error('Explicit target, source-root, ledger and new output directory are required; use --help');
  const snapshot = JSON.parse(await readFile(resolve(values.ledger), 'utf8'));
  const sources = {};
  for (const file of diagnosisMigrationFiles(values.target))
    sources[file] = await readFile(join(resolve(values['source-root']), 'supabase', 'migrations', file), 'utf8');
  const {verificationSql, ...plan} = prepareDiagnosisDevRollout({...snapshot, target: values.target, sources});
  const out = resolve(values.out);
  await mkdir(out); // Must be new. Never overwrite a reviewed plan.
  await writeFile(join(out, 'plan.json'), JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  await writeFile(join(out, 'verify-rollback.sql'), verificationSql, {flag: 'wx'});
  console.log(JSON.stringify({target: plan.target, projectRef: plan.projectRef, pendingCount: plan.pendingCount, out}));
}
