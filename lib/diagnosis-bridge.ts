import { createHash, createHmac } from 'node:crypto';
import type { DiagnosisSession } from './diagnosis-session';

export type DiagnosisContext = { attemptId: string; subject: string; releaseId: string; packageVersion: string; responseId: string | null; state: string; adminTest?: boolean; canRestart?: boolean };
export class DiagnosisBridgeError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const path = '/api/integrations/edu/diagnosis';
const fail = () => { throw new DiagnosisBridgeError('UNAVAILABLE', 503); };

export function diagnosisBridgeHeaders(body: string, secret: string, environment: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  if (!/^[a-f0-9]{64}$/i.test(secret) || !['dev', 'production'].includes(environment)) return fail();
  const digest = createHash('sha256').update(body, 'utf8').digest('hex');
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`edu-n6-v1\n${environment}\nPOST\n${path}\n${timestamp}\n${digest}`).digest('hex');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${signature}`,
    'X-Edu-Environment': environment, 'X-Edu-Timestamp': timestamp };
}

async function boundedResponse(response: Response) {
  const reader = response.body?.getReader(); if (!reader) return fail();
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > 524288) { await reader.cancel(); return fail(); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail(); }
}

export function validateDiagnosisSession(value: unknown, context: DiagnosisContext): DiagnosisSession & { responseId: string } {
  if (!value || typeof value !== 'object') return fail();
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.attemptId !== context.attemptId || v.subject !== context.subject || v.releaseId !== context.releaseId
    || !uuid(v.responseId) || (context.responseId !== null && context.responseId !== v.responseId)
    || !['in_progress','submitted'].includes(String(v.state)) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0
    || typeof v.needsReview !== 'boolean' || !Array.isArray(v.answers) || v.answers.length > 200) return fail();
  const survey = v.survey as DiagnosisSession['survey'];
  if (!survey || typeof survey.title !== 'string' || typeof survey.version !== 'string' || survey.code !== 'needs6_n30'
    || !Number.isInteger(survey.coreQuestionCount) || !Array.isArray(survey.questions) || !survey.questions.length || survey.questions.length > 200) return fail();
  const seen = new Set<string>();
  for (const q of survey.questions) {
    if (!q || !uuid(q.id) || seen.has(q.id) || typeof q.text !== 'string' || typeof q.section !== 'string' || typeof q.code !== 'string'
      || !['pair_choice','single_choice','multi_choice','text'].includes(q.type) || typeof q.required !== 'boolean' || typeof q.core !== 'boolean'
      || typeof q.reconfirmInstructions !== 'boolean' || typeof q.placeholder !== 'string'
      || (q.pickExactly !== null && (!Number.isInteger(q.pickExactly) || q.pickExactly < 1))
      || !Array.isArray(q.exclusiveOptionIds) || !Array.isArray(q.options) || q.options.length > 100
      || q.options.some(o => !uuid(o.id) || typeof o.label !== 'string')
      || new Set(q.options.map(o => o.id)).size !== q.options.length
      || q.exclusiveOptionIds.some(id => !q.options.some(o => o.id === id))
      || (q.confirmationOptionId !== null && !q.options.some(o => o.id === q.confirmationOptionId))
      || (q.type === 'pair_choice' && (!q.pair || typeof q.pair.left !== 'string' || typeof q.pair.right !== 'string'))) return fail();
    seen.add(q.id);
  }
  const answerIds = new Set<string>();
  for (const a of v.answers) {
    if (!a || typeof a !== 'object' || Array.isArray(a) || !seen.has(a.questionId) || answerIds.has(a.questionId)
      || Object.keys(a).some(k => !['questionId','optionId','values','value','ms'].includes(k))) return fail();
    const q = survey.questions.find(q => q.id === a.questionId)!;
    if (q.type === 'text' ? typeof a.value !== 'string' || a.value.length > 10000 || a.optionId !== undefined || a.values !== undefined
      : q.type === 'multi_choice' ? !Array.isArray(a.values) || new Set(a.values).size !== a.values.length || a.values.some((id: unknown) => !q.options.some(o => o.id === id)) || a.optionId !== undefined || a.value !== undefined
      : !q.options.some(o => o.id === a.optionId) || a.value !== undefined || a.values !== undefined) return fail();
    if (a.ms !== undefined && (q.type !== 'pair_choice' || !Number.isInteger(a.ms) || a.ms < 0 || a.ms > 600000)) return fail();
    answerIds.add(a.questionId);
  }
  if (v.submittedAt !== null && (typeof v.submittedAt !== 'string' || !Number.isFinite(Date.parse(v.submittedAt)))) return fail();
  if ((v.state === 'submitted') !== (v.submittedAt !== null) || (v.state !== 'submitted' && v.needsReview)) return fail();
  const publicSurvey = { code: survey.code, version: survey.version, title: survey.title, coreQuestionCount: survey.coreQuestionCount,
    questions: survey.questions.map(q => ({ id:q.id,code:q.code,text:q.text,type:q.type,section:q.section,core:q.core,required:q.required,
      pickExactly:q.pickExactly,exclusiveOptionIds:q.exclusiveOptionIds,reconfirmInstructions:q.reconfirmInstructions,
      confirmationOptionId:q.confirmationOptionId,placeholder:q.placeholder,pair:q.pair ? {left:q.pair.left,right:q.pair.right} : null,
      options:q.options.map(o => ({id:o.id,label:o.label})) })) };
  return { responseId: v.responseId, state: v.state as DiagnosisSession['state'], revision: Number(v.revision),
    answers: v.answers, submittedAt: v.submittedAt as string | null, needsReview: v.needsReview, survey: publicSurvey };
}

export async function sendDiagnosisCommand(context: DiagnosisContext, command: Record<string, unknown>,
  { env = process.env, fetcher = fetch }: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}) {
  const environment = env.EDU_MYIN_BRIDGE_ENVIRONMENT;
  // Explicit environment binding prevents a Preview from silently sending answers to production.
  const expected = env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : 'dev';
  if (environment !== expected) return fail();
  const origin = environment === 'production' ? 'https://server.myinlab.co.kr' : 'https://dev-server.myinlab.co.kr';
  if (env.EDU_MYIN_BRIDGE_ORIGIN !== origin || ![context.attemptId,context.subject,context.releaseId].every(uuid)) return fail();
  const body = JSON.stringify({ ...command, version: 1, attemptId: context.attemptId, subject: context.subject, releaseId: context.releaseId });
  if (Buffer.byteLength(body, 'utf8') > 262144) throw new DiagnosisBridgeError('INVALID', 400);
  try {
    const response = await fetcher(origin + path, { method: 'POST', headers: diagnosisBridgeHeaders(body, env.EDU_MYIN_BRIDGE_SECRET ?? '', environment),
      body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000) });
    const data = await boundedResponse(response);
    if (!response.ok) {
      if (['INVALID','INVALID_ANSWERS','INCOMPLETE','CONFLICT','FORBIDDEN'].includes(data?.code)
        && [400,403,409].includes(response.status)) throw new DiagnosisBridgeError(data.code, response.status);
      return fail();
    }
    return validateDiagnosisSession(data, context);
  } catch (error) { if (error instanceof DiagnosisBridgeError) throw error; return fail(); }
}
