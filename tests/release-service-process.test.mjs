import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync} from 'node:crypto';
import {signApprovedRequest} from '../tools/release-guard/approval-bridge.mjs';
import {digest} from '../tools/release-guard/gate.mjs';

const service=fileURLToPath(new URL('../tools/release-guard/service-once.mjs',import.meta.url));
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'release-service-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['lock','processed','requests'])await mkdir(join(root,dir),{mode:0o700});
  const keys=generateKeyPairSync('ed25519');
  const save=async(name,value)=>writeFile(join(root,name),typeof value==='string'?value:JSON.stringify(value),{mode:0o600});
  await save('public.pem',keys.publicKey.export({type:'spki',format:'pem'}));
  await save('runner.json',{executionEnabled:true,approvalPublicKeyFile:join(root,'public.pem'),requestRoot:join(root,'requests')});
  const config={executionEnabled:true,serviceLockRoot:join(root,'lock'),processedRoot:join(root,'processed'),runnerConfigFile:join(root,'runner.json')};
  await save('service.json',config);
  const run=()=>spawnSync(process.execPath,[service,'worker',join(root,'service.json')],{encoding:'utf8',timeout:10000});
  return {root,keys,save,config,run};
}
test('disabled service exits without reading credentials or contacting providers',async t=>{
  const f=await fixture(t);await f.save('service.json',{executionEnabled:false});
  assert.equal(f.run().status,0);assert.deepEqual(await readdir(join(f.root,'processed')),[]);
});
test('worker with no queued requests performs no provider calls',async t=>{
  const f=await fixture(t);assert.equal(f.run().status,0);
  assert.deepEqual(await readdir(join(f.root,'lock')),[]);
});
for(const state of ['started','blocked'])test(`persisted ${state} blocks restart before processing another request`,async t=>{
  const f=await fixture(t);await f.save('processed/earlier.json',{state});
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/needs reconciliation/);
  assert.equal(JSON.parse(await readFile(join(f.root,'processed/earlier.json'))).state,state);
  assert.deepEqual(await readdir(join(f.root,'lock')),[]);
});
test('completed request is not run a second time',async t=>{
  const f=await fixture(t);await f.save('processed/done.json',{state:'complete'});
  // Invalid bytes would fail if the old request were opened again.
  await f.save('requests/done.json','not-json');assert.equal(f.run().status,0);
});
test('concurrent service cannot steal an existing lock',async t=>{
  const f=await fixture(t);await mkdir(join(f.root,'lock/production.lock'));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Production is locked/);
  assert.deepEqual(await readdir(join(f.root,'lock')),['production.lock']);
});
test('tampered signed request never reaches the executor',async t=>{
  const f=await fixture(t);const request={payload:{plan:{candidate:'a'.repeat(40),migrations:[]}}};
  const signed=signApprovedRequest(request,{runId:1},f.keys.privateKey);
  signed.payload.plan.candidate='b'.repeat(40);await f.save('requests/tampered.json',signed);
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/Invalid release signature/);
  assert.deepEqual(await readdir(join(f.root,'processed')),[]);
});
test('initial connection rejects SQL even with a separately signed SQL approval',async t=>{
  const f=await fixture(t);const plan={candidate:'a'.repeat(40),migrations:[{path:'already-applied.sql'}]};
  // Signing via the manual authority is valid cryptographically; this worker still refuses SQL.
  const {sign}=await import('node:crypto');
  const payload={plan,expiresAt:Date.now()+60000,approvals:{code:digest(plan),sql:digest(plan)}};
  await f.save('requests/sql.json',{payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),f.keys.privateKey).toString('base64')});
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/SQL disabled/);
  assert.deepEqual(await readdir(join(f.root,'processed')),[]);
});
