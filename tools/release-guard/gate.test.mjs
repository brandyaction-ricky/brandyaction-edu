import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {acquireLock, coordinate, digest, REQUIRED, validate} from './gate.mjs';
const base = 'a'.repeat(40), candidate = 'b'.repeat(40), db = 'c'.repeat(64);
function fixture() {
  const plan = {version:1,environment:'production',project:'edu',repository:'edu/repo',base,candidate,baseDeployment:'dpl_previous',dbBefore:db,dbAfter:db,migrations:[]};
  const observed = {project:'edu',repository:'edu/repo',environment:'production',liveSha:base,liveDeployment:'dpl_previous',releaseHead:candidate,dbFingerprint:db,pendingMigrations:[],unresolvedRun:false};
  const evidence = {planDigest:digest(plan),completedAt:Date.now(),checks:REQUIRED.map(id=>({id,candidate,base,dbBefore:db,dbAfter:db,status:'passed',passed:1,failed:0,skipped:0,cancelled:0}))};
  return {plan,observed,evidence};
}
test('exact immutable release with every evidence group passes', async()=>{
  const f=fixture();assert.equal((await validate(f.plan,f.observed,f.evidence,async()=>true)).validated,true);
});
for (const [name,change] of [
  ['production moved', f=>f.observed.liveSha='d'.repeat(40)],
  ['CLI source unknown', f=>delete f.observed.liveSha],
  ['deployment changed', f=>f.observed.liveDeployment='dpl_other'],
  ['wrong project', f=>f.observed.project='myin'],
  ['wrong environment', f=>f.observed.environment='preview'],
  ['unmerged candidate', f=>f.observed.releaseHead=base],
  ['DB drift', f=>f.observed.dbFingerprint='d'.repeat(64)],
  ['unresolved previous run', f=>f.observed.unresolvedRun=true],
  ['hidden migration', f=>f.observed.pendingMigrations=[{path:'extra.sql'}]],
  ['stale approval evidence', f=>f.evidence.planDigest='d'.repeat(64)],
  ['expired evidence', f=>f.evidence.completedAt-=86400001],
  ['future evidence', f=>f.evidence.completedAt+=86400000],
  ['missing required check', f=>f.evidence.checks.pop()],
  ['duplicate check', f=>f.evidence.checks.push(f.evidence.checks[0])],
  ['skipped check', f=>f.evidence.checks[0].skipped=1],
  ['cancelled check', f=>f.evidence.checks[0].cancelled=1],
  ['empty check', f=>f.evidence.checks[0].passed=0],
  ['failed check', f=>f.evidence.checks[0].failed=1],
  ['old candidate check', f=>f.evidence.checks[0].candidate=base],
]) test(`blocks ${name}`,async()=>{const f=fixture();change(f);await assert.rejects(validate(f.plan,f.observed,f.evidence,async()=>true));});
test('blocks loss of current production ancestry',async()=>{const f=fixture();await assert.rejects(validate(f.plan,f.observed,f.evidence,async()=>false));});
test('migration duplicate versions, edits, unordered files and path traversal are rejected',async()=>{
  for(const paths of [['20261117000000_a.sql','20261117000000_b.sql'],['20261117000002_b.sql','20261117000001_a.sql'],['../x.sql']]){
    const f=fixture();f.plan.migrations=paths.map(path=>({path:'supabase/migrations/'+path,sha256:db}));f.observed.pendingMigrations=f.plan.migrations;f.evidence.planDigest=digest(f.plan);
    await assert.rejects(validate(f.plan,f.observed,f.evidence,async()=>true));
  }
});
async function directory(t){const dir=await mkdtemp(join(tmpdir(),'release-lock-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('twenty simultaneous sessions have exactly one owner',async t=>{
  const dir=await directory(t), results=await Promise.allSettled(Array.from({length:20},()=>acquireLock(dir)));
  const winners=results.filter(r=>r.status==='fulfilled');assert.equal(winners.length,1);
  await winners[0].value.release();const next=await acquireLock(dir);await next.release();
});
test('independent Codex/Claude-like processes cannot hold the coordinator lock together',async t=>{
  const dir=await directory(t),moduleUrl=new URL('./gate.mjs',import.meta.url).href;
  const launch=()=>new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,['--input-type=module','-e',`import {acquireLock} from ${JSON.stringify(moduleUrl)};try {await acquireLock(process.argv[1]);console.log('owner');}catch {console.log('blocked');}`,dir],{stdio:['ignore','pipe','pipe']});let output='';
    p.on('error',reject);p.stdout.on('data',b=>output+=b);p.on('close',code=>code===0?resolve(output.trim()):reject(Error('child failed')));
  });
  const results=await Promise.all(Array.from({length:8},launch));
  assert.equal(results.filter(x=>x==='owner').length,1);assert.equal(results.filter(x=>x==='blocked').length,7);
  await assert.rejects(acquireLock(dir),/locked/,'crashed owner does not auto-expire');
});
function adapter(f, events=[]){return {
  observe:async()=>structuredClone(f.observed),isAncestor:async()=>true,
  verifyApprovals:async()=>events.push('approval'),applyMigrations:async()=>events.push('sql'),
  databaseFingerprint:async()=>f.plan.dbAfter,promote:async()=>events.push('promote'),
  verifyLive:async()=>({sha:candidate,ready:true,smoke:'passed'}),recordComplete:async()=>events.push('complete'),
};}
test('success verifies the exact deployed candidate before unlocking',async t=>{
  const f=fixture(),events=[],lockRoot=await directory(t);await coordinate({...f,lockRoot,adapter:adapter(f,events)});
  assert.deepEqual(events,['approval','promote','complete']);await assert.rejects(access(join(lockRoot,'production.lock')));
});
test('production changing while approval is checked prevents all mutations',async t=>{
  const f=fixture(),events=[],a=adapter(f,events),lockRoot=await directory(t);
  a.verifyApprovals=async()=>{f.observed.liveSha=candidate;};
  await assert.rejects(coordinate({...f,lockRoot,adapter:a}));assert.deepEqual(events,[]);
  const lock=await acquireLock(lockRoot);await lock.release();
});
test('missing approval stops before SQL or promotion and releases the unused lock',async t=>{
  const f=fixture(),events=[],a=adapter(f,events),lockRoot=await directory(t);
  a.verifyApprovals=async()=>{throw Error('exact SQL approval missing');};
  await assert.rejects(coordinate({...f,lockRoot,adapter:a}),/approval missing/);
  assert.deepEqual(events,[]);const lock=await acquireLock(lockRoot);await lock.release();
});
for(const invalid of [{sha:base,ready:true,smoke:'passed'},{sha:candidate,ready:false,smoke:'passed'},{sha:candidate,ready:true,smoke:'failed'}])test(`post-deploy mismatch ${JSON.stringify(invalid)} prevents completion and retains lock`,async t=>{
  const f=fixture(),events=[],a=adapter(f,events),lockRoot=await directory(t);
  a.verifyLive=async()=>invalid;
  await assert.rejects(coordinate({...f,lockRoot,adapter:a}),/verification failed/);
  assert.equal(events.includes('complete'),false);await assert.rejects(acquireLock(lockRoot),/locked/);
});
for(const fault of ['applyMigrations','databaseFingerprint','promote','verifyLive','recordComplete'])test(`unknown ${fault} outcome retains lock and blocks next release`,async t=>{
  const f=fixture();f.plan.migrations=[{path:'supabase/migrations/20261117000000_example.sql',sha256:db}];f.observed.pendingMigrations=f.plan.migrations;f.evidence.planDigest=digest(f.plan);
  const lockRoot=await directory(t),a=adapter(f);a[fault]=async()=>{throw Error('simulated interruption');};
  await assert.rejects(coordinate({...f,lockRoot,adapter:a}));await assert.rejects(acquireLock(lockRoot),/locked/);
});
