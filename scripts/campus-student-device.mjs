// Only called for a designated employee's private Telegram conversation.
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, stat, open, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import { studentEndpoint as endpoint, studentEnvironment, gatewayHeaders } from './student-target.mjs';
export { endpoint };
const sha = value => createHash('sha256').update(value).digest('hex');
export function deviceDir(root,c) {
  if (c?.platform !== 'telegram' || !/^telegram:[1-9]\d*$/.test(c.channelId) ||
      ![c.sessionId,c.connectionId].every(x=>typeof x==='string' && /^[\w:-]{1,160}$/.test(x))) throw Error('Use the employee’s Only me Telegram direct chat');
  return join(resolve(root),'campus-office',studentEnvironment==='production'?'production-devices':'devices',sha(JSON.stringify([c.connectionId,c.channelId])));
}
export async function configureDevice(root,c,command,transport=fetch) {
  const dir=deviceDir(root,c);
  await mkdir(dir,{recursive:true,mode:0o700});
  if (process.platform!=='win32' && ((await stat(dir)).mode&0o077)) throw Error('Private device directory required');
  const lock=join(dir,'setup.lock');
  const fd=await open(lock,'wx',0o600);
  try {
    const pendingFile=join(dir,'pending');
    if (command==='캠퍼스 연결 준비') {
      let token;
      try {token=await readFile(pendingFile,'utf8');} catch(e){if(e.code!=='ENOENT')throw e;}
      const now=Math.floor(Date.now()/1000);
      if (!token || Number(token.slice(0,10))+600<=now) {
        token=now+'.'+randomBytes(32).toString('hex');
        await writeFile(pendingFile+'.new',token,{mode:0o600});await rename(pendingFile+'.new',pendingFile);
      }
      return {pairingCode:'MS1-'+token.slice(0,10)+'-'+sha(token)};
    }
    const match=/^캠퍼스 연결 확인 ([a-f0-9]{12})$/.exec(command);
    if(!match)throw Error('Invalid pairing command');
    const token=await readFile(pendingFile,'utf8');
    const localConfirmationTime=Date.now();
    const r=await transport(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{...await gatewayHeaders(),'content-type':'application/json','x-campus-device':token},body:JSON.stringify({action:'confirm',code:match[1]})});
    if(!r.ok)throw Error('Connection confirmation refused ('+r.status+')');
    const b=await r.json();
    if(!/^s-[0-9a-f-]{36}$/.test(b.connectorId)||!/^[0-9a-f-]{36}$/.test(b.enrollmentId)||!Number.isSafeInteger(b.notBefore))throw Error('Invalid connection receipt');
    const secretFile=join(dir,b.connectorId+'.key');
    await writeFile(secretFile,token,{mode:0o600});
    const config={...b,notBefore:localConfirmationTime,endpoint,environment:studentEnvironment,transport:'student-device',reportMode:'assigned-tasks',keyVersion:'s1',secretFile,
      sessionId:c.sessionId,connectionId:c.connectionId,channelId:c.channelId,stateDir:join(dir,'reports',b.connectorId)};
    await writeFile(join(dir,'connection.new'),JSON.stringify(config),{mode:0o600});
    await rename(join(dir,'connection.new'),join(dir,'connection.json'));
    await unlink(pendingFile);
    return {connected:true};
  } finally {await fd.close();await unlink(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const input=JSON.parse(await readFile(process.argv[3],'utf8'));console.log(JSON.stringify(await configureDevice(process.argv[2],input.context,input.requestText)));}
  catch(e){console.error(e.code==='ENOENT'&&String(e.path||'').endsWith('gateway-public.json')?'Skill folder is incomplete (scripts/gateway-public.json is missing). Download the report skill again from the campus.':e.code?'Local connection file unavailable'+(e.path?' ('+String(e.path).split('/').pop()+')':''):e.message);process.exitCode=1;}
}
