// Explicitly marked Telegram work, in one bound Aside session, to a private DEV inbox.
// This observer never sends an AI instruction and never consumes Telegram updates.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAside, protectedPreviewFetch } from './campus-aside-watch.mjs';
import { prepareReport, deliverReport } from './campus-office-report.mjs';
export const taskPrefix = '캠퍼스 업무:';
const contentText = m => typeof m.content === 'string' ? m.content : (m.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
export function stableId(value) {
  const h = createHash('sha256').update(value).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function configIdentity(c) {
  return createHash('sha256').update(JSON.stringify([c.environment,c.endpoint,c.connectorId,c.keyVersion,c.enrollmentId,c.account,c.connectionId,c.sessionId,c.notBefore])).digest('hex');
}
export function discoverTasks(snapshot, config) {
  const { session, messages, rows } = snapshot;
  if (session?.id !== config.sessionId || session.trigger?.type !== 'channel' || session.trigger.channel !== 'telegram' || session.trigger.connectionId !== config.connectionId) throw Error('Aside session binding mismatch');
  if (!Array.isArray(messages) || !Array.isArray(rows) || !Number.isFinite(config.notBefore)) throw Error('Missing task evidence');
  const users = messages.filter(m => m.role === 'user').sort((a,b) => a.timestamp-b.timestamp);
  return users.filter(m => m.timestamp >= config.notBefore && contentText(m).trimStart().startsWith(taskPrefix)).map(user => {
    const text = contentText(user).trim();
    const matching = rows.filter(r => r.role === 'user' && r.timestamp === user.timestamp);
    if (matching.length !== 1 || users.filter(m => m.timestamp === user.timestamp).length !== 1 || !/^\d+$/.test(String(matching[0].id))) throw Error('Ambiguous Telegram request');
    // A local Aside follow-up has no matching direct Telegram sender context.
    if (!messages.some(m => m.role === 'system-message' && m.kind === 'channel_sender_context' && m.timestamp === user.timestamp && m.metadata?.platform === 'telegram' && m.metadata?.conversationKind === 'direct')) throw Error('Request is not a verified Telegram direct message');
    const objective = text.slice(taskPrefix.length).trim();
    if (objective.length < 10 || objective.length > 2000) throw Error('Marked task must contain 10–2000 characters');
    const requestKey = String(matching[0].id);
    const jobId = stableId(`${config.connectorId}:${config.connectionId}:${config.sessionId}:${requestKey}`);
    const next = users.find(m => m.timestamp > user.timestamp);
    const starts = messages.filter(m => m.role === 'turn-lifecycle' && m.event === 'started' && m.timestamp >= user.timestamp && (!next || m.timestamp < next.timestamp));
    const base = { requestKey, jobId, objective, requestedAt: user.timestamp, promptHash: createHash('sha256').update(text).digest('hex') };
    if (starts.length > 1) throw Error('Ambiguous task turn');
    if (!starts.length) return { ...base, phase: next ? 'uncertain' : 'accepted' };
    const turn = starts[0];
    const finished = messages.find(m => m.role === 'turn-lifecycle' && m.event === 'finished' && m.turnId === turn.turnId);
    if (next && (!finished || next.timestamp <= finished.timestamp)) return { ...base, phase: 'uncertain', turnId: turn.turnId };
    if (!finished) return { ...base, phase: ['errored','interrupted'].includes(session.status) ? 'uncertain' : 'running', turnId: turn.turnId };
    const answers = messages.filter(m => m.role === 'assistant' && m.stopReason === 'stop' && m.timestamp >= turn.timestamp && m.timestamp <= finished.timestamp && contentText(m).trim()).sort((a,b) => b.timestamp-a.timestamp);
    if (!answers.length) return { ...base, phase: 'uncertain', turnId: turn.turnId };
    const answer = contentText(answers[0]).trim();
    if (answer.length < 10 || answer.length > 10000) return { ...base, phase: 'uncertain', turnId: turn.turnId };
    return { ...base, phase: 'review', turnId: turn.turnId, answer };
  });
}
export function reportsForTask(task, config) {
  const common = { jobId: task.jobId };
  const reports = [{ ...common, event:'registered', enrollmentId:config.enrollmentId, objective:task.objective, outputType:'analysis' },
    { ...common, event:'accepted', expectedRevision:1, note:'지정 Telegram 대화에서 캠퍼스 업무를 수신했습니다.' }];
  if (task.turnId) reports.push({ ...common, event:'started', expectedRevision:2, note:'Aside의 실제 작업 시작 기록을 확인했습니다.' });
  if (task.phase === 'review') reports.push({ ...common, event:'draft', expectedRevision:3, draftText:task.answer, note:'실제 직원의 최종 답변입니다. 내용을 검토한 뒤 승인해 주세요.' });
  if (task.phase === 'uncertain') reports.push({ ...common, event:'failed', expectedRevision:task.turnId ? 3 : 2, note:'추가 지시·중단 또는 불충분한 실행 기록으로 결과 자동 연결을 멈췄습니다. Telegram 대화를 확인해 주세요. 작업 성공/실패 자체를 단정하지 않습니다.' });
  return reports.map(r => prepareReport(r, stableId(`${task.jobId}:${r.event}`)));
}
async function privateJson(file, data) {
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(data), { mode:0o600 });
  await rename(tmp,file);
}
export async function syncTasks(config, state, snapshot, send, persist) {
  if (state.binding !== configIdentity(config)) throw Error('Saved state belongs to another connection');
  for (const row of snapshot.rows ?? []) {
    if (row.role === 'user' && row.timestamp >= config.notBefore && !state.tasks[String(row.id)]?.done
      && !snapshot.messages.some(m => m.role === 'user' && m.timestamp === row.timestamp)) throw Error('Unread request fell outside the transcript window; reconcile before continuing');
  }
  const tasks = discoverTasks(snapshot,config);
  const seen = new Set(tasks.map(t=>t.requestKey));
  // Never silently lose a pending task when Aside's bounded transcript window moves.
  for (const [id,t] of Object.entries(state.tasks)) if (!t.done && !seen.has(id)) throw Error('Pending task evidence unavailable; reconcile before continuing');
  for (const task of tasks) {
    let saved = state.tasks[task.requestKey];
    if (!saved) {
      saved = state.tasks[task.requestKey] = { jobId:task.jobId,promptHash:task.promptHash,events:{},done:false };
      await persist(state);
    }
    if (saved.jobId !== task.jobId || saved.promptHash !== task.promptHash) throw Error('Task changed after registration');
    if (saved.done) continue;
    for (const report of reportsForTask(task,config)) {
      const event = JSON.parse(report.raw).event;
      const old = saved.events[event];
      if (old && old.envelope.raw !== report.raw) throw Error('Saved report differs from task evidence');
      if (old?.delivered) continue;
      saved.events[event] ??= { envelope:report,delivered:false };
      await persist(state); // Save before sending, including when the acknowledgement is lost.
      await send({ ...config, jobId:task.jobId },saved.events[event].envelope);
      saved.events[event].delivered=true;
      await persist(state);
    }
    saved.done = ['review','uncertain'].includes(task.phase);
    await persist(state);
  }
  return tasks.map(t=>({jobId:t.jobId,phase:t.phase}));
}
async function main(file, once) {
  const config = JSON.parse(await readFile(file,'utf8'));
  if (config.environment !== 'development' || !Number.isFinite(config.notBefore) || !config.stateDir || !config.secretFile) throw Error('Invalid development configuration');
  const info = await stat(config.secretFile);
  if (!info.isFile() || (process.platform!=='win32' && (info.mode&0o077))) throw Error('Secret file must be private');
  const secret = (await readFile(config.secretFile,'utf8')).trim();
  const dir=resolve(config.stateDir); await mkdir(dir,{recursive:true,mode:0o700});
  const lock=join(dir,'observer.lock'); const handle=await open(lock,'wx',0o600).catch(()=>{throw Error('Observer lock exists. Confirm the previous process stopped before removing it.');});
  await handle.writeFile(String(process.pid));
  let stopping=false;const stop=()=>{stopping=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try {
    const stateFile=join(dir,'state.json');let state;
    try {state=JSON.parse(await readFile(stateFile,'utf8'));} catch(e) {if(e.code!=='ENOENT')throw e;state={binding:configIdentity(config),tasks:{}};}
    const deadline=Date.now()+30*60*1000;let last='';
    do {
      try {
        const statuses=await syncTasks(config,state,await readAside(config),
          (c,envelope)=>deliverReport(c,envelope,secret,c.transport==='vercel-cli'?protectedPreviewFetch:fetch),
          value=>privateJson(stateFile,value));
        const summary=JSON.stringify(statuses);
        if(summary!==last){console.log(summary);last=summary;}
      } catch(e) {
        // A transient outage must not silently drop work or claim completion.
        if (once || !/Local Aside evidence unavailable|Delivery unconfirmed|HTTP (429|5\d\d)/.test(e.message)) throw e;
        if(last!=='retrying'){console.log('Connection unavailable; saved reports will retry without rerunning AI.');last='retrying';}
        await new Promise(r=>setTimeout(r,10000));
      }
      if(once||stopping)break;
      await new Promise(r=>setTimeout(r,3000));
    }while(!stopping&&Date.now()<deadline);
  } finally { await handle.close();await unlink(lock);process.off('SIGINT',stop);process.off('SIGTERM',stop); }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main(process.argv[2],process.argv.includes('--once')).catch(e=>{console.error(e instanceof SyntaxError?'Invalid configuration or saved state':e.message);process.exitCode=1;});
