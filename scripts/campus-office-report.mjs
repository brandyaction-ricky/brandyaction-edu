// Student-PC outbound reporter. No Telegram consumer, AI runner, or public port.
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function prepareReport(input, eventId = randomUUID()) {
  if (input?.event === 'registered') {
    if (!uuid.test(input.jobId) || !uuid.test(input.enrollmentId) || !uuid.test(eventId)
      || typeof input.objective !== 'string' || input.objective.trim().length < 10 || input.objective.length > 2000
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.objective)
      || !['plan','copy','checklist','analysis'].includes(input.outputType)) throw new Error('Invalid registration');
    return { schema: 'campus-office-report.v1', eventId, raw: JSON.stringify({ event: 'registered', jobId: input.jobId, enrollmentId: input.enrollmentId, objective: input.objective.trim(), outputType: input.outputType }) };
  }
  if (!input || !uuid.test(input.jobId) || !uuid.test(eventId)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1
    || !['accepted', 'started', 'draft', 'failed'].includes(input.event)) throw new Error('Invalid report');
  const text = (value, min, max) => {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error('Invalid report text');
    return value.trim();
  };
  const body = { jobId: input.jobId, expectedRevision: input.expectedRevision, event: input.event,
    note: text(input.note ?? '', input.event === 'failed' ? 5 : 0, 1000) };
  if (input.event === 'draft') {
    body.draftText = text(input.draftText, 10, 10000);
    if (input.draftUrl) {
      const url = new URL(input.draftUrl);
      if (url.protocol !== 'https:' || url.username || url.password || input.draftUrl.length > 2000) throw new Error('Invalid result URL');
      body.draftUrl = input.draftUrl;
    }
  }
  // Incoming reports never silently omit a dispatch binding.
  if (input.dispatchId !== undefined) throw new Error('Dispatched jobs are not supported by this pilot');
  return { schema: 'campus-office-report.v1', eventId, raw: JSON.stringify(body) };
}

export async function deliverReport(config, envelope, secret, fetcher = fetch, now = Date.now()) {
  const url = new URL(config.endpoint);
  const studentEndpoint = url.href === 'https://vjmjhaidlqkmascdjocw.supabase.co/functions/v1/campus-student-report';
  if (config.transport === 'student-device' && !studentEndpoint || studentEndpoint && (config.transport !== 'student-device' || !/^[0-9]{10}\.[a-f0-9]{64}$/.test(secret))) throw new Error('Invalid student endpoint');
  const directEndpoint = url.href === 'https://vjmjhaidlqkmascdjocw.supabase.co/functions/v1/campus-office-report';
  if (config.environment !== 'development' || url.protocol !== 'https:' || url.username || url.password
    || url.search || url.hash || (!studentEndpoint && !directEndpoint && url.pathname !== '/api/campus/office/webhook')
    || !/^[a-z0-9_-]{1,40}$/.test(config.connectorId) || !/^[a-zA-Z0-9_-]{1,40}$/.test(config.keyVersion)
    || typeof secret !== 'string' || secret.length < 32) throw new Error('Invalid development connector configuration');
  if (envelope?.schema !== 'campus-office-report.v1' || typeof envelope.raw !== 'string') throw new Error('Invalid saved report');
  const report = JSON.parse(envelope.raw);
  const canonical = prepareReport(report, envelope.eventId);
  if (canonical.raw !== envelope.raw || report.jobId !== config.jobId) throw new Error('Report does not match the configured job');
  if (report.event === 'registered' && report.enrollmentId !== config.enrollmentId) throw new Error('Registration does not match configured enrollment');
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac('sha256', secret)
    .update(`${config.connectorId}.${config.keyVersion}.${timestamp}.${envelope.eventId}.${envelope.raw}`).digest('hex');
  let response;
  try {
    response = await fetcher(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: studentEndpoint ? { 'content-type':'application/json', 'x-campus-device':secret, 'x-campus-event-id':envelope.eventId } : { 'content-type': 'application/json', 'x-campus-connector': config.connectorId,
        'x-campus-key-version': config.keyVersion, 'x-campus-timestamp': timestamp,
        'x-campus-event-id': envelope.eventId, 'x-campus-signature': `v1=${signature}` }, body: envelope.raw });
  } catch { throw new Error('Delivery unconfirmed. Keep this saved report and retry it; do not create another event.'); }
  if (!response.ok) throw new Error(`Report rejected (HTTP ${response.status}). Keep the saved report; check mapping/revision before retrying.`);
  if (directEndpoint || studentEndpoint) {
    const receipt = await response.json().catch(() => null);
    const revision = report.event === 'registered' ? 1 : report.expectedRevision + 1;
    if (receipt?.jobId !== report.jobId || receipt?.revision !== revision) throw new Error('Delivery unconfirmed: missing matching office receipt');
  }
  // Do not echo result text, provider response, credentials or signatures to logs.
  return { delivered: true, eventId: envelope.eventId, jobId: report.jobId, event: report.event };
}

async function main(args) {
  if (args[0] === 'prepare' && args.length === 3) {
    const envelope = prepareReport(JSON.parse(await readFile(args[1], 'utf8')));
    // Exclusive creation prevents accidental replacement of a retry's identity.
    await writeFile(args[2], JSON.stringify(envelope), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ saved: true, eventId: envelope.eventId }));
  } else if (args[0] === 'send' && args.length === 3) {
    const config = JSON.parse(await readFile(args[1], 'utf8'));
    const info = await stat(config.secretFile);
    if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('Secret file must be private (mode 600)');
    const secret = (await readFile(config.secretFile, 'utf8')).trim();
    console.log(JSON.stringify(await deliverReport(config, JSON.parse(await readFile(args[2], 'utf8')), secret)));
  } else throw new Error('Usage: node scripts/campus-office-report.mjs prepare INPUT_JSON SAVED_REPORT | send CONFIG_JSON SAVED_REPORT');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof SyntaxError ? 'Invalid JSON file' : error.message); process.exitCode = 1; });
}
