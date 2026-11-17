// launchd StartInterval entry points. No shell or candidate code is executed.
import {readdir, writeFile, chown, link, unlink, lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateFile, verifyEnvelope, atomicRecord} from './registry.mjs';
import {acquireLock} from './gate.mjs';
import {readInbox, observeReceipt, validateReceipt, signApprovedRequest, protectedDirectory} from './approval-bridge.mjs';

const [mode, configPath, ...extra] = process.argv.slice(2);
if (!['authority','worker'].includes(mode) || !configPath?.startsWith('/') || extra.length) throw Error('Usage: service-once.mjs authority|worker OWNER_CONFIG');
const config = JSON.parse(await privateFile(configPath));
if (config.executionEnabled !== true) process.exit(0);
if (mode === 'authority') {
  if (process.getuid() !== 0) throw Error('Approval authority must be root');
  for (const path of [dirname(configPath), dirname(config.privateKeyFile), config.processedRoot, config.outboxRoot, config.serviceLockRoot]) await protectedDirectory(path);
}
const guard = await acquireLock(config.serviceLockRoot);
const here = dirname(fileURLToPath(import.meta.url));
try {
  if (mode === 'authority') {
    if (process.getuid() !== 0) throw Error('Approval authority must be root');
    const key = await privateFile(config.privateKeyFile);
    for (const file of (await readdir(config.inboxRoot)).filter(name=>/^[A-Za-z0-9_-]{1,80}\.json$/.test(name)).sort()) {
      const id = file.slice(0,-5), record = join(config.processedRoot,file);
      try { await lstat(record); continue; } catch(e) { if(e.code!=='ENOENT')throw e; }
      let phase='validating';
      try {
        const request = await readInbox(join(config.inboxRoot,file),config.submitterUid);
        if(request.requestId!==id)throw Error('Inbox filename mismatch');
        const receipt = validateReceipt(request,config,await observeReceipt(request,config));
        const envelope = signApprovedRequest(request,receipt,key);
        await atomicRecord(config.processedRoot,id,{state:'publishing',receipt});
        phase='publishing';
        const tmp=join(config.outboxRoot,`${id}.${process.pid}.tmp`), target=join(config.outboxRoot,file);
        await writeFile(tmp,JSON.stringify(envelope),{mode:0o600,flag:'wx'});
        await chown(tmp,config.workerUid,config.workerGid);
        // link is no-clobber; existing signed requests cannot be replaced.
        await link(tmp,target); await unlink(tmp);
        await atomicRecord(config.processedRoot,id,{state:'published',receipt});
      } catch {
        // Do not retry a rejected/partially published ID automatically.
        await atomicRecord(config.processedRoot,id,{state:'blocked',phase});
      }
    }
  } else {
    const runnerConfig = JSON.parse(await privateFile(config.runnerConfigFile));
    if(runnerConfig.executionEnabled!==true)throw Error('Runner disabled');
    for(const file of (await readdir(config.processedRoot)).filter(name=>name.endsWith('.json'))) {
      const previous=JSON.parse(await privateFile(join(config.processedRoot,file)));
      if(previous.state!=='complete')throw Error('Earlier worker attempt needs reconciliation');
    }
    const key = await privateFile(runnerConfig.approvalPublicKeyFile);
    for(const file of (await readdir(runnerConfig.requestRoot)).filter(name=>/^[A-Za-z0-9_-]{1,80}\.json$/.test(name)).sort()) {
      const id=file.slice(0,-5);
      try { await lstat(join(config.processedRoot,file)); continue; } catch(e) { if(e.code!=='ENOENT')throw e; }
      const {plan} = verifyEnvelope(JSON.parse(await privateFile(join(runnerConfig.requestRoot,file))),key);
      if(plan.migrations.length)throw Error('SQL disabled in initial activation');
      // Persist the attempt BEFORE invocation. An interrupted request needs reconciliation.
      await atomicRecord(config.processedRoot,id,{state:'started'});
      const fetchResult=spawnSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','credential.helper=','fetch','--no-tags','https://github.com/brandyaction-ricky/brandyaction-edu.git','+refs/heads/main:refs/remotes/origin/main'],{cwd:runnerConfig.checkout,encoding:'utf8',timeout:120000,maxBuffer:1000000,env:{PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}});
      if(fetchResult.status!==0){await atomicRecord(config.processedRoot,id,{state:'blocked',phase:'fetch'});break;}
      const child=spawnSync(process.execPath,[join(here,'run-request.mjs'),config.runnerConfigFile,id,'--execute'],{encoding:'utf8',timeout:600000,maxBuffer:1000000,env:{PATH:'/usr/bin:/bin',HOME:dirname(config.runnerConfigFile)}});
      await atomicRecord(config.processedRoot,id,{state:child.status===0?'complete':'blocked',exitCode:child.status,signal:child.signal||null});
      // Never include provider output or secrets in launchd's public logs.
      console.log(JSON.stringify({requestId:id,state:child.status===0?'complete':'blocked'}));
      if(child.status!==0)break;
    }
  }
} finally { await guard.release(); }
