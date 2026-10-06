import { createHash, createHmac } from 'node:crypto';
import { DiagnosisBridgeError } from './diagnosis-bridge';

export type AdminDiagnosisBinding = { subject: string; attemptId: string; responseId: string; releaseId: string; packageVersion: string };
export type AdminReportStatus = { queuePosition?: number|null; queuedAt?: string|null; queueObservedAt?: string|null; retryMode?: 'resume'|'rewrite'|null; startedAt?: string|null; submittedAt?: string|null; issuedAt?: string|null; state: 'not_submitted'|'queued'|'processing'|'ready'|'needs_review'; updatedAt: string; errorCode: string|null; canRetry: boolean; version: string; details: {at: string; code: string}[] };
export type AdminReportObservation = AdminDiagnosisBinding & AdminReportStatus;
export type AdminRetryReceipt = {state: 'queued'; requestId: string; attemptId: string; responseId: string; acceptedAt: string};
const path = '/api/integrations/edu/diagnosis/manage';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const date = (v: unknown): v is string => typeof v === 'string' && v.length < 60 && Number.isFinite(Date.parse(v));
const code = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9_]{1,80}$/.test(v);
const fail = (): never => { throw new DiagnosisBridgeError('UNAVAILABLE', 503); };
export function validAdminDiagnosisBinding(v: unknown): v is AdminDiagnosisBinding {
  if (!v || typeof v !== 'object') return false;
  const b = v as AdminDiagnosisBinding;
  return [b.subject,b.attemptId,b.responseId,b.releaseId].every(uuid) && typeof b.packageVersion === 'string' && b.packageVersion.length > 0 && b.packageVersion.length <= 100;
}
export function adminDiagnosisHeaders(body: string, secret: string, environment: string, timestamp = String(Math.floor(Date.now()/1000))) {
  if (!/^[a-f0-9]{64}$/i.test(secret) || !['dev','production'].includes(environment)) return fail();
  const digest = createHash('sha256').update(body).digest('hex');
  const signature = createHmac('sha256',Buffer.from(secret,'hex')).update(`edu-n6-admin-v1\n${environment}\nPOST\n${path}\n${timestamp}\n${digest}`).digest('hex');
  return {'Content-Type':'application/json',Authorization:`Bearer ${signature}`,'X-Edu-Environment':environment,'X-Edu-Timestamp':timestamp};
}
export function validateAdminReportRows(value: unknown, bindings: AdminDiagnosisBinding[]): AdminReportObservation[] {
  const v = value as {version?: number; rows?: unknown[]};
  if (!v || v.version !== 1 || !Array.isArray(v.rows) || v.rows.length !== bindings.length) return fail();
  const pending = new Map(bindings.map(b=>[b.attemptId,b]));
  return v.rows.map(row=>{
    const r = row as AdminReportObservation;
    const b = pending.get(r?.attemptId);
    if (!b || !validAdminDiagnosisBinding(r) || Object.keys(b).some(k=>r[k as keyof AdminDiagnosisBinding] !== b[k as keyof AdminDiagnosisBinding])
      || !['not_submitted','queued','processing','ready','needs_review'].includes(r.state) || !date(r.updatedAt)
      || !(r.errorCode === null || code(r.errorCode)) || typeof r.canRetry !== 'boolean' || !/^[a-f0-9]{64}$/.test(r.version)
      || !Array.isArray(r.details) || r.details.length > 10 || r.details.some(d=>!date(d?.at)||!code(d?.code))
      || [r.startedAt,r.submittedAt,r.issuedAt].some(t=>t!=null&&(!date(t)||!/(?:Z|[+-]\d{2}:\d{2})$/.test(t)))
      || (r.issuedAt!=null&&r.state!=='ready')
      || (r.state === 'ready' && r.canRetry)) return fail();
    if (r.retryMode != null && !['resume','rewrite'].includes(r.retryMode)) return fail();
    // Queue position is a point-in-time observation, never an ETA or a fallback to updatedAt.
    const queue = [r.queuePosition,r.queuedAt,r.queueObservedAt];
    if (queue.some(v=>v!=null) && (!Number.isSafeInteger(r.queuePosition) || r.queuePosition! < 1
      || ![r.queuedAt,r.queueObservedAt].every(t=>date(t)&&/(?:Z|[+-]\d{2}:\d{2})$/.test(t!)))) return fail();
    pending.delete(r.attemptId);
    // Do not forward extra provider fields, raw answers or report content to the browser.
    return {...b,queuePosition:r.queuePosition??null,queuedAt:r.queuedAt??null,queueObservedAt:r.queueObservedAt??null,retryMode:r.retryMode??null,startedAt:r.startedAt??null,submittedAt:r.submittedAt??null,issuedAt:r.issuedAt??null,state:r.state,updatedAt:r.updatedAt,errorCode:r.errorCode,canRetry:r.canRetry,version:r.version,details:r.details.map(d=>({at:d.at,code:d.code}))};
  });
}
export function validateAdminRetry(value: unknown, binding: AdminDiagnosisBinding, requestId: string): AdminRetryReceipt {
  const v = value as AdminRetryReceipt;
  if (!v || v.state !== 'queued' || v.requestId !== requestId || v.attemptId !== binding.attemptId || v.responseId !== binding.responseId || !date(v.acceptedAt)) return fail();
  return {state:'queued',requestId,attemptId:v.attemptId,responseId:v.responseId,acceptedAt:v.acceptedAt};
}
export async function sendAdminDiagnosis(input: Record<string,unknown>, {env=process.env,fetcher=fetch}: {env?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}) {
  const environment = env.EDU_MYIN_BRIDGE_ENVIRONMENT;
  if (environment !== (env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : 'dev')) return fail();
  const origin = environment === 'production' ? 'https://server.myinlab.co.kr' : 'https://dev-server.myinlab.co.kr';
  if (env.EDU_MYIN_BRIDGE_ORIGIN !== origin) return fail();
  const body = JSON.stringify({...input,version:1});
  if (Buffer.byteLength(body)>65536) return fail();
  try {
    const response = await fetcher(origin+path,{method:'POST',headers:adminDiagnosisHeaders(body,env.EDU_MYIN_BRIDGE_SECRET??'',environment),body,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});
    const reader=response.body?.getReader();if(!reader)return fail();
    let size=0;const parts:Uint8Array[]=[];
    try {for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>262144){await reader.cancel();return fail();}parts.push(p.value);}}finally{reader.releaseLock();}
    const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!response.ok) {
      if (['FORBIDDEN','CONFLICT','RETRY_BLOCKED'].includes(result?.code) && [403,409].includes(response.status)) throw new DiagnosisBridgeError(result.code,response.status);
      return fail();
    }
    return result as unknown;
  } catch(e) {if(e instanceof DiagnosisBridgeError)throw e;return fail();}
}
