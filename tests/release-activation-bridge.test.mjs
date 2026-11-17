import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateReceipt,hashBytes,signApprovedRequest,readInbox} from '../tools/release-guard/approval-bridge.mjs';
import {digest} from '../tools/release-guard/gate.mjs';
import {verifyEnvelope} from '../tools/release-guard/registry.mjs';
const now=Date.now(), source=Buffer.from('pinned reviewed workflow');
function fixture(){
 const config={repository:'brandyaction-ricky/brandyaction-edu',project:'prj_edu',productionHost:'brandyaction-edu.com',workflowPath:'.github/workflows/release-authorization.yml',workflowSha256:hashBytes(source),approverId:214936328,environmentId:27559287034};
 const plan={repository:config.repository,project:config.project,productionHost:config.productionHost,environment:'production',candidate:'a'.repeat(40),migrations:[]};
 const payload={plan,evidence:{planDigest:digest(plan)}};
 const request={requestId:'release-1',runId:42,runAttempt:1,payload};
 const observation={run:{id:42,run_attempt:1,repository:{full_name:config.repository},event:'workflow_dispatch',head_branch:'main',path:config.workflowPath,status:'completed',conclusion:'success',head_sha:plan.candidate,display_title:`Release release-1 ${digest(payload)}`,updated_at:new Date(now).toISOString()},approvals:[{state:'approved',user:{id:config.approverId},environments:[{id:config.environmentId,name:'production-release-review'}]}],workflowSource:source,headSha:plan.candidate};
 return {request,config,observation};
}
test('exact chat-relayed approval is signed and accepted by existing runner',()=>{
 const f=fixture(),receipt=validateReceipt(f.request,f.config,f.observation,now),keys=generateKeyPairSync('ed25519');
 const envelope=signApprovedRequest(f.request,receipt,keys.privateKey,now);
 assert.equal(verifyEnvelope(envelope,keys.publicKey,now).githubReceipt.runId,42);
 envelope.payload.plan.project='other';assert.throws(()=>verifyEnvelope(envelope,keys.publicKey,now),/signature/);
});
const invalidCases=[
 ['missing approval',f=>f.observation.approvals=[]],
 ['wrong approver',f=>f.observation.approvals[0].user.id=2],
 ['wrong environment',f=>f.observation.approvals[0].environments[0].id=1],
 ['rejection',f=>f.observation.approvals.push({state:'rejected'})],
 ['new run attempt',f=>f.request.runAttempt=2],
 ['different repository',f=>f.observation.run.repository.full_name='other/repo'],
 ['unapproved event',f=>f.observation.run.event='pull_request'],
 ['not main',f=>f.observation.run.head_branch='develop'],
 ['wrong workflow',f=>f.observation.run.path='other.yml'],
 ['waiting',f=>f.observation.run.status='waiting'],
 ['failed',f=>f.observation.run.conclusion='failure'],
 ['moved main',f=>f.observation.headSha='b'.repeat(40)],
 ['changed workflow',f=>f.observation.workflowSource=Buffer.from('changed')],
 ['changed evidence',f=>f.request.payload.evidence.extra='changed'],
 ['expired run',f=>f.observation.run.updated_at=new Date(now-3600001).toISOString()],
 ['future run',f=>f.observation.run.updated_at=new Date(now+1000).toISOString()],
 ['SQL not authorized',f=>f.request.payload.plan.migrations=[{path:'existing.sql'}]],
 ['unsafe request ID',f=>f.request.requestId='../escape'],
];
for(const [name,change] of invalidCases)test(name+' blocks signing',()=>{const f=fixture();change(f);assert.throws(()=>validateReceipt(f.request,f.config,f.observation,now));});
test('inbox refuses symlinks, wrong owners and world-readable requests',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'approval-inbox-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const safe=join(dir,'safe');await writeFile(safe,'{}',{mode:0o600});assert.deepEqual(await readInbox(safe,process.getuid()),{});
 await assert.rejects(readInbox(safe,process.getuid()+1));
 await symlink(safe,join(dir,'link'));await assert.rejects(readInbox(join(dir,'link'),process.getuid()));
 await writeFile(join(dir,'public'),'{}',{mode:0o644});await assert.rejects(readInbox(join(dir,'public'),process.getuid()));
});
