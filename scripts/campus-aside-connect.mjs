// Prepare a private observer configuration from an operator-provisioned connection.
// Does not provision credentials, subscribe a student, or install a startup service.
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAside } from './campus-aside-watch.mjs';
export function connectionConfig(input, stateDir, now=Date.now()) {
  const url = new URL(input.endpoint);
  if (input.environment !== 'development' || url.protocol !== 'https:' || url.pathname !== '/api/campus/office/webhook' || url.search || url.hash || url.username || url.password
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.enrollmentId) || !/^[a-z0-9_-]{1,40}$/.test(input.connectorId) || !/^[a-zA-Z0-9_-]{1,40}$/.test(input.keyVersion)
    || !/^u\d+$/.test(input.account) || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.sessionId) || typeof input.connectionId !== 'string' || !input.connectionId
    || typeof input.secretFile !== 'string' || !input.secretFile || !Number.isFinite(now)) throw Error('Invalid provisioned development connection');
  return {environment:'development',endpoint:url.href,enrollmentId:input.enrollmentId,connectorId:input.connectorId,keyVersion:input.keyVersion,
    account:input.account,sessionId:input.sessionId,connectionId:input.connectionId,secretFile:resolve(input.secretFile),stateDir:resolve(stateDir),notBefore:now,
    ...(input.transport==='vercel-cli'?{transport:'vercel-cli'}:{})};
}
async function main(source, output, stateDir) {
  if(!source||!output||!stateDir)throw Error('Usage: node scripts/campus-aside-connect.mjs PROVISIONED_CONFIG NEW_CONFIG STATE_DIRECTORY');
  const config=connectionConfig(JSON.parse(await readFile(source,'utf8')),stateDir);
  const secretInfo=await stat(config.secretFile);
  if(!secretInfo.isFile()||(process.platform!=='win32'&&(secretInfo.mode&0o077)))throw Error('Connector secret must be private');
  const {session}=await readAside(config);
  if(session?.id!==config.sessionId||session.trigger?.channel!=='telegram'||session.trigger.connectionId!==config.connectionId)throw Error('Selected Aside session does not match this Telegram connection');
  await mkdir(config.stateDir,{recursive:true,mode:0o700});
  await writeFile(output,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
  console.log('Connection prepared. Only new messages beginning with 캠퍼스 업무: will be reported.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(...process.argv.slice(2)).catch(e=>{console.error(e instanceof SyntaxError?'Invalid configuration':e.message);process.exitCode=1;});
