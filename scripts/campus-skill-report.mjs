// Called by the Aside agent only at explicit workflow steps. No watcher or AI runner.
import { studentEnvironment } from './student-target.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat, open, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareReport, deliverReport } from './campus-office-report.mjs';
import { protectedPreviewFetch } from './campus-office-preview-transport.mjs';

const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const uuid = x => { const h=hash(x);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const id = x => typeof x==='string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(x);
export function skillBinding(config, input) {
  const c=input?.context;
  if(studentEnvironment==='production' && config.transport!=='student-device') throw Error('Production requires a student device connection');
  if(config.environment!==(config.transport==='student-device'?studentEnvironment:'development') || !Number.isFinite(config.notBefore) || !id(config.connectorId)
    || !c || c.platform!=='telegram' || c.sessionId!==config.sessionId || c.connectionId!==config.connectionId
    || c.channelId!==config.channelId || !id(c.messageId) || !Number.isFinite(c.requestedAt) || c.requestedAt<config.notBefore
    || !['start','result','failed','retry'].includes(input.action)) throw Error('Invalid skill request binding');
  const request=JSON.stringify([config.connectorId,c.connectionId,c.sessionId,c.channelId,c.messageId]);
  return { jobId:uuid(['aside-skill-v1',request]), contextHash:hash(c), binding:hash([config.environment,config.endpoint,config.connectorId,config.keyVersion,config.enrollmentId,config.sessionId,config.connectionId,config.channelId,config.notBefore]) };
}
export async function reportSkill(config, input, state, send, persist) {
  const binding=skillBinding(config,input);
  if(state && (state.binding!==binding.binding || state.contextHash!==binding.contextHash || state.jobId!==binding.jobId)) throw Error('Saved report belongs to another connection or request');
  const envelope = body => prepareReport({jobId:binding.jobId,...body},uuid([binding.jobId,body.event]));
  if(input.action==='start') {
    const text = input.requestText;
    if (typeof text !== 'string' || !text.trim()) throw Error('Missing original work request');
    const prefix = '캠퍼스 업무:';
    const marked = text.startsWith(prefix);
    // Only newly paired student devices accept tasks identified by the employee.
    // In this mode the office receives a task description, not the chat transcript.
    if (!marked && (config.transport !== 'student-device' || config.reportMode !== 'assigned-tasks'
      || typeof input.taskObjective !== 'string' || /^(?:캠퍼스 연결|MS1-|\/)/.test(text.trim()))) {
      throw Error('Only assigned work from a paired employee can be reported');
    }
    const objective = marked ? text.slice(prefix.length).trim() : input.taskObjective.trim();
    // The employee names the kind of result; anything else falls back to the general kind.
    const outputType=['plan','copy','checklist','analysis'].includes(input.outputType)?input.outputType:'analysis';
    const registered=envelope({event:'registered',enrollmentId:config.enrollmentId,objective,outputType});
    if(state && state.requestHash!==hash(input.requestText)) throw Error('Request changed after registration');
    if(!state) {
      state={...binding,requestHash:hash(input.requestText),events:[registered,
        envelope({event:'accepted',expectedRevision:1,note:'Aside 직원이 캠퍼스 보고 스킬로 지정 업무의 접수를 보고했습니다.'}),
        envelope({event:'started',expectedRevision:2,note:'Aside 직원이 작업을 시작한다고 보고했습니다.'})].map(report=>({report,delivered:false})),terminal:null};
      await persist(state);
    }
  } else if(!state) throw Error('No saved start report for this request');
  if(input.action==='result' || input.action==='failed') {
    if(!state.events.slice(0,3).every(e=>e.delivered)) throw Error('Start delivery unconfirmed; retry it before reporting a result');
    const report=input.action==='result'
      ? envelope({event:'draft',expectedRevision:3,draftText:input.resultText,note:'Aside 직원이 직접 제출한 결과입니다. 실행 사실·내용은 사용자가 검토하며 자동 승인하지 않습니다.'})
      : envelope({event:'failed',expectedRevision:3,note:input.failureNote});
    if(state.terminal && (state.terminal!==input.action || state.events[3].report.raw!==report.raw)) throw Error('Terminal report changed; reconcile instead of overwriting');
    if(!state.terminal){state.terminal=input.action;state.events.push({report,delivered:false});await persist(state);}
  }
  for(const event of state.events) {
    if(event.delivered) continue;
    await send({...config,jobId:state.jobId},event.report);
    event.delivered=true;await persist(state);
  }
  return { jobId:state.jobId, reported:state.terminal??'started', delivered:true };
}
async function privateFile(file) {
  const info=await stat(file);
  if(!info.isFile() || (process.platform!=='win32' && (info.mode&0o077))) throw Error('Connection and secret files must be private');
}
// Reuse the verified request context when the same Telegram turn submits its draft.
export async function resultFromStart(start, chunks) {
  if (start?.action !== 'start' || !start.context) throw Error('Expected the start file for this task');
  const parts = [];
  let bytes = 0;
  for await (const chunk of chunks) {
    const part = Buffer.from(chunk);
    bytes += part.length;
    if (bytes > 40002) throw Error('Result too large');
    parts.push(part);
  }
  return {action:'result', context:start.context, resultText:Buffer.concat(parts).toString('utf8').trim()};
}
async function main(configPath,inputPath,mode) {
  if(!configPath||!inputPath)throw Error('Usage: report.mjs PRIVATE_CONFIG INPUT_JSON');
  if((await stat(inputPath)).size>64000)throw Error('Input too large');
  if (mode !== undefined && mode !== '--result-stdin') throw Error('Unknown reporting mode');
  const saved=JSON.parse(await readFile(inputPath,'utf8'));
  const input=mode ? await resultFromStart(saved,process.stdin) : saved;
  // New device connections take precedence over the legacy one-employee pilot.
  let selectedPath=configPath;
  if (input.context?.platform==='telegram' && /^telegram:[1-9]\d*$/.test(input.context.channelId)) {
    const {deviceDir}=await import('./campus-student-device.mjs');
    const candidate=join(deviceDir(dirname(dirname(configPath)),input.context),'connection.json');
    try {await privateFile(candidate);selectedPath=candidate;} catch(e){if(e.code!=='ENOENT')throw e;}
  }
  await privateFile(selectedPath);
  const config=JSON.parse(await readFile(selectedPath,'utf8'));
  const binding=skillBinding(config,input);
  if(!config.stateDir||!config.secretFile)throw Error('Missing private report storage');
  await privateFile(config.secretFile);
  const secret=(await readFile(config.secretFile,'utf8')).trim();
  const dir=resolve(config.stateDir);await mkdir(dir,{recursive:true,mode:0o700});
  const info=await stat(dir);
  if(process.platform!=='win32'&&(info.mode&0o077))throw Error('Report directory must be private');
  const file=join(dir,binding.jobId+'.json'),lock=file+'.lock';
  const handle=await open(lock,'wx',0o600).catch(()=>{throw Error('Report already in progress; verify it finished before retrying');});
  try {
    let state=null;try {await privateFile(file);state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    const persist=async s=>{await writeFile(file+'.tmp',JSON.stringify(s),{mode:0o600});await rename(file+'.tmp',file);};
    const result=await reportSkill(config,input,state,(c,r)=>deliverReport(c,r,secret,c.transport==='vercel-cli'?(url,init)=>protectedPreviewFetch(url,init,c.previewCliPath):fetch),persist);
    console.log(JSON.stringify(result));
  } finally {await handle.close();await unlink(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(...process.argv.slice(2)).catch(e=>{
  console.error(e instanceof SyntaxError?'Invalid JSON':e.code?'Local report file unavailable':e.message);process.exitCode=1;
});
