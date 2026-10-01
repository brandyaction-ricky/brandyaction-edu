import { createHash, createHmac } from 'node:crypto';
import { DiagnosisBridgeError, type DiagnosisContext } from './diagnosis-bridge';

export type DiagnosisReportContext = DiagnosisContext & { responseId: string; revision: number };
export type DiagnosisReportState = 'queued' | 'processing' | 'ready' | 'needs_review' | 'access_denied';
export type DiagnosisReportStatus = { state: DiagnosisReportState; updatedAt: string; canRetry: false; downloadAvailable: boolean };
export type DiagnosisReport = DiagnosisReportStatus & { version: 1; subject: string; attemptId: string; responseId: string;
  releaseId: string; packageVersion: string; revision: number; reportId: string | null; markdown?: string; sha256?: string };

const path = '/api/integrations/edu/diagnosis/report';
const maxJsonBytes = 3 * 1024 * 1024, maxMarkdownBytes = 2 * 1024 * 1024;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const unavailable = () => { throw new DiagnosisBridgeError('UNAVAILABLE', 503); };

export function validDiagnosisReportContext(context: DiagnosisContext | null, actorId: string): context is DiagnosisReportContext {
  const c = context as DiagnosisReportContext | null;
  return Boolean(c && c.subject === actorId && [c.subject,c.attemptId,c.responseId,c.releaseId].every(uuid)
    && typeof c.packageVersion === 'string' && c.packageVersion.length > 0 && c.packageVersion.length <= 100
    && Number.isSafeInteger(c.revision) && c.revision >= 0);
}

export function diagnosisReportHeaders(body: string, secret: string, environment: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  if (!/^[a-f0-9]{64}$/i.test(secret) || !['dev','production'].includes(environment)) return unavailable();
  const digest = createHash('sha256').update(body, 'utf8').digest('hex');
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`edu-n6-report-v1\n${environment}\nPOST\n${path}\n${timestamp}\n${digest}`).digest('hex');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${signature}`,
    'X-Edu-Environment': environment, 'X-Edu-Timestamp': timestamp };
}

export function validateDiagnosisReport(value: unknown, context: DiagnosisReportContext, action: 'status' | 'download'): DiagnosisReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.subject !== context.subject || v.attemptId !== context.attemptId || v.responseId !== context.responseId
    || v.releaseId !== context.releaseId || v.packageVersion !== context.packageVersion || !Number.isSafeInteger(v.revision)
    || Number(v.revision) < context.revision || !['queued','processing','ready','needs_review','access_denied'].includes(String(v.state))
    || typeof v.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v.updatedAt) || !Number.isFinite(Date.parse(v.updatedAt))
    || v.canRetry !== false || typeof v.downloadAvailable !== 'boolean'
    || (v.reportId !== null && !uuid(v.reportId))
    || (v.state === 'ready' ? !uuid(v.reportId) || !v.downloadAvailable : v.downloadAvailable || v.reportId !== null)) return unavailable();
  let download: { markdown: string; sha256: string } | undefined;
  if (action === 'download') {
    if (v.state !== 'ready' || !v.downloadAvailable || typeof v.markdown !== 'string' || !v.markdown.trim()
      || Buffer.byteLength(v.markdown, 'utf8') > maxMarkdownBytes || typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256)
      || createHash('sha256').update(v.markdown, 'utf8').digest('hex') !== v.sha256) return unavailable();
    download = { markdown: v.markdown, sha256: v.sha256 };
  }
  return { version: 1, subject: context.subject, attemptId: context.attemptId, responseId: context.responseId,
    releaseId: context.releaseId, packageVersion: context.packageVersion, revision: Number(v.revision),
    state: v.state as DiagnosisReportState, updatedAt: v.updatedAt, reportId: v.reportId as string | null,
    canRetry: false, downloadAvailable: v.downloadAvailable, ...download };
}

async function boundedJson(response: Response) {
  if (!response.body) return unavailable();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxJsonBytes) { await reader.cancel(); return unavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return unavailable(); }
}

export async function sendDiagnosisReportCommand(context: DiagnosisReportContext, action: 'status' | 'download',
  { env = process.env, fetcher = fetch }: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}): Promise<DiagnosisReport> {
  const environment = env.EDU_MYIN_BRIDGE_ENVIRONMENT;
  const expected = env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : 'dev';
  if (environment !== expected || !validDiagnosisReportContext(context, context.subject)) return unavailable();
  const origin = environment === 'production' ? 'https://server.myinlab.co.kr' : 'https://dev-server.myinlab.co.kr';
  if (env.EDU_MYIN_BRIDGE_ORIGIN !== origin) return unavailable();
  const body = JSON.stringify({ version: 1, action, subject: context.subject, attemptId: context.attemptId,
    responseId: context.responseId, releaseId: context.releaseId, packageVersion: context.packageVersion });
  try {
    const response = await fetcher(origin + path, { method: 'POST', body,
      headers: diagnosisReportHeaders(body, env.EDU_MYIN_BRIDGE_SECRET ?? '', environment),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const data = await boundedJson(response);
    if (!response.ok) {
      if (response.status === 403 && data?.code === 'FORBIDDEN') throw new DiagnosisBridgeError('FORBIDDEN', 403);
      if (response.status === 409 && data?.code === 'NOT_READY') throw new DiagnosisBridgeError('NOT_READY', 409);
      return unavailable();
    }
    return validateDiagnosisReport(data, context, action);
  } catch (error) { if (error instanceof DiagnosisBridgeError) throw error; return unavailable(); }
}
