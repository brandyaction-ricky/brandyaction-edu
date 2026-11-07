// One explicitly bound Telegram task -> existing campus webhook. Pilot only.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { prepareReport, deliverReport } from './campus-office-report.mjs';
const run = promisify(execFile);
export { protectedPreviewFetch } from './campus-office-preview-transport.mjs';
import { protectedPreviewFetch } from './campus-office-preview-transport.mjs';
const contentText = message => typeof message.content === 'string' ? message.content : (message.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
export const promptDigest = text => createHash('sha256').update(text).digest('hex');
export function observeTask(snapshot, config) {
  const { session, messages } = snapshot;
  if (session?.id !== config.sessionId || session.trigger?.type !== 'channel'
    || session.trigger.channel !== 'telegram' || session.trigger.connectionId !== config.connectionId) throw new Error('Aside session binding mismatch');
  if (!Array.isArray(messages)) throw new Error('Missing Aside evidence');
  const requests = messages.filter(m => m.role === 'user' && promptDigest(contentText(m)) === config.promptHash);
  if (requests.length > 1) throw new Error('Duplicate task prompt; reconcile before reporting');
  if (!requests.length) return { phase: 'waiting' };
  const requestedAt = requests[0].timestamp;
  if (!Number.isFinite(requestedAt) || requestedAt < config.notBefore) throw new Error('Task evidence predates this pilot');
  if (messages.some(m => m.role === 'user' && m.timestamp > requestedAt)) throw new Error('A follow-up changed this task; reconcile before reporting');
  const started = messages.filter(m => m.role === 'turn-lifecycle' && m.event === 'started' && m.timestamp >= requestedAt);
  if (!started.length) return { phase: 'accepted' };
  if (started.length !== 1) throw new Error('Ambiguous Aside turn');
  const turn = started[0];
  const finished = messages.find(m => m.role === 'turn-lifecycle' && m.event === 'finished' && m.turnId === turn.turnId);
  if (['errored', 'interrupted'].includes(session.status)) return { phase: 'failed', turnId: turn.turnId };
  if (!finished) return { phase: 'running', turnId: turn.turnId };
  const answers = messages.filter(m => m.role === 'assistant' && m.stopReason === 'stop'
    && m.timestamp >= turn.timestamp && m.timestamp <= finished.timestamp && contentText(m).trim()).sort((a,b) => b.timestamp - a.timestamp);
  if (!answers.length) throw new Error('Finished turn has no final answer; do not invent a result');
  const answer = contentText(answers[0]).trim();
  if (answer.length < 10 || answer.length > 10000) throw new Error('Result does not fit the office draft; review it manually');
  return { phase: 'review', turnId: turn.turnId, answer };
}
export async function readAside(config) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.sessionId) || !/^u\d+$/.test(config.account)) throw new Error('Invalid Aside selector');
  const script = `console.log("CAMPUS_EVIDENCE:"+JSON.stringify({session:await aside.sessions.get(${JSON.stringify(config.sessionId)}),rows:(await aside.sessions.messageRows(${JSON.stringify(config.sessionId)})).map(r=>({id:r.id,role:r.role,timestamp:r.timestamp})),messages:await aside.sessions.messages(${JSON.stringify(config.sessionId)},{limit:200,order:"desc"})}))`;
  let stdout;
  try { ({ stdout } = await run('aside', ['--account', config.account, '--host', 'local', 'repl', script], { timeout: 20000, maxBuffer: 2000000 })); }
  catch { throw new Error('Local Aside evidence unavailable'); }
  const row = stdout.split('\n').find(line => line.startsWith('CAMPUS_EVIDENCE:'));
  if (!row) throw new Error('Local Aside returned no evidence');
  return JSON.parse(row.slice('CAMPUS_EVIDENCE:'.length));
}
async function main(configFile) {
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  if (!Number.isFinite(config.notBefore) || !/^[a-f0-9]{64}$/.test(config.promptHash)) throw new Error('Missing exact task binding');
  const info = await stat(config.secretFile);
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('Connector secret must be private');
  const secret = (await readFile(config.secretFile, 'utf8')).trim();
  await mkdir(config.reportDir, { recursive: true, mode: 0o700 });
  const deadline = Date.now() + 30 * 60 * 1000;
  async function send(event, expectedRevision, extra = {}) {
    const file = join(config.reportDir, event + '.json');
    let envelope;
    try { envelope = JSON.parse(await readFile(file, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      envelope = prepareReport({ jobId: config.jobId, event, expectedRevision, ...extra });
      await writeFile(file, JSON.stringify(envelope), { mode: 0o600, flag: 'wx' });
    }
    const expected = prepareReport({ jobId: config.jobId, event, expectedRevision, ...extra }, envelope.eventId);
    if (envelope.raw !== expected.raw) throw new Error('Saved report differs from current evidence');
    // A restart resends the saved event; the server's receipt makes this idempotent.
    await deliverReport(config, envelope, secret, config.transport === 'vercel-cli' ? protectedPreviewFetch : fetch);
    console.log(JSON.stringify({ event, jobId: config.jobId, delivered: true }));
  }
  let accepted = false, started = false;
  while (Date.now() < deadline) {
    const observation = observeTask(await readAside(config), config);
    if (observation.phase !== 'waiting' && !accepted) { await send('accepted', 1, { note: 'Telegram의 지정 요청을 Aside가 실제 수신했습니다.' }); accepted = true; }
    if (['running','review','failed'].includes(observation.phase) && !started) { await send('started', 2, { note: 'Aside의 실제 작업 시작 기록을 확인했습니다.' }); started = true; }
    if (observation.phase === 'review') { await send('draft', 3, { draftText: observation.answer, note: 'Aside가 보고한 결과입니다. 외부 실행 성공과 사용자 승인을 대신하지 않습니다.' }); return; }
    if (observation.phase === 'failed') { await send('failed', 3, { note: 'Aside 작업이 오류 또는 중단 상태입니다. 직원 대화를 확인해 주세요.' }); return; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Observation timed out. Task state is unconfirmed; no completion reported.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2]).catch(error => { console.error(error instanceof SyntaxError ? 'Invalid local configuration or evidence' : error.message); process.exitCode = 1; });
