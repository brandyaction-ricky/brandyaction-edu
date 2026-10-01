import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const DIAGNOSIS_ACCESS_PATH = '/api/integrations/myin/diagnosis/access';
export const DIAGNOSIS_ACCESS_MAX_BYTES = 65536;
export type DiagnosisAccessEnvironment = 'dev' | 'production';
export type DiagnosisAccessRequest = {
  version: 1; subject: string; attemptId: string; sessionId: string; releaseId: string;
  packageVersion: string; revision: number; purpose: 'generate' | 'issue' | 'read'; nonce: string;
};
export class DiagnosisAccessError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const fail = (code = 'UNAVAILABLE', status = 503): never => { throw new DiagnosisAccessError(code, status); };

export function diagnosisAccessEnvironment(env: NodeJS.ProcessEnv): DiagnosisAccessEnvironment {
  const environment = env.EDU_MYIN_BRIDGE_ENVIRONMENT;
  const expected = env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : 'dev';
  const origin = expected === 'production' ? 'https://server.myinlab.co.kr' : 'https://dev-server.myinlab.co.kr';
  if (environment !== expected || env.EDU_MYIN_BRIDGE_ORIGIN !== origin || !/^[a-f0-9]{64}$/i.test(env.EDU_MYIN_BRIDGE_SECRET ?? '')) return fail();
  return environment;
}

export function diagnosisAccessSignature({ body, secret, environment, timestamp }: {
  body: string; secret: string; environment: DiagnosisAccessEnvironment; timestamp: string;
}) {
  if (!/^[a-f0-9]{64}$/i.test(secret) || !['dev', 'production'].includes(environment)) return fail();
  const hash = createHash('sha256').update(body, 'utf8').digest('hex');
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`myin-edu-n6-access-v1\n${environment}\nPOST\n${DIAGNOSIS_ACCESS_PATH}\n${timestamp}\n${hash}`).digest('hex');
}

export function verifyDiagnosisAccessRequest({ body, secret, environment, timestamp, authorization, now = Date.now() }: {
  body: string; secret: string; environment: DiagnosisAccessEnvironment; timestamp: string | null;
  authorization: string | null; now?: number;
}) {
  if (!/^[0-9]{10}$/.test(timestamp ?? '') || !Number.isFinite(now) || Math.abs(now / 1000 - Number(timestamp)) > 60
    || Buffer.byteLength(body, 'utf8') > DIAGNOSIS_ACCESS_MAX_BYTES || !/^Bearer [a-f0-9]{64}$/.test(authorization ?? '')) return false;
  const expected = diagnosisAccessSignature({ body, secret, environment, timestamp: timestamp! });
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(authorization!.slice(7), 'hex'));
}

export function parseDiagnosisAccessRequest(value: unknown): DiagnosisAccessRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID', 400);
  const v = value as Record<string, unknown>;
  const fields = ['version', 'subject', 'attemptId', 'sessionId', 'releaseId', 'packageVersion', 'revision', 'purpose', 'nonce'];
  if (Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k)) || v.version !== 1
    || ![v.subject, v.attemptId, v.sessionId, v.releaseId, v.nonce].every(uuid)
    || typeof v.packageVersion !== 'string' || !v.packageVersion.trim() || v.packageVersion.length > 100
    || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || Number(v.revision) > 2147483647
    || typeof v.purpose !== 'string' || !['generate', 'issue', 'read'].includes(v.purpose)) return fail('INVALID', 400);
  return v as DiagnosisAccessRequest;
}

/** This is a fresh access observation, not a permanent grant or model-call reservation.
 * The worker must recheck it before each paid call, issuance and delivery. */
export async function authorizeDiagnosisAccess({ input, environment, rpc, now = Date.now }: {
  input: unknown; environment: DiagnosisAccessEnvironment; now?: () => number;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}) {
  const request = parseDiagnosisAccessRequest(input);
  const { data, error } = await rpc('edu_diagnosis_report_access', {
    p_subject: request.subject, p_attempt: request.attemptId, p_session: request.sessionId,
    p_release: request.releaseId, p_package: request.packageVersion, p_revision: request.revision,
  });
  if (error) return fail();
  if (!data) return fail('FORBIDDEN', 403);
  const grant = data as { grantId?: unknown; checkedAt?: unknown; expiresAt?: unknown };
  const checked = typeof grant.checkedAt === 'string' ? Date.parse(grant.checkedAt) : NaN;
  const expires = typeof grant.expiresAt === 'string' ? Date.parse(grant.expiresAt) : NaN;
  const current = now();
  if (!uuid(grant.grantId) || !Number.isFinite(checked) || !Number.isFinite(expires)
    || !Number.isFinite(current) || checked > current + 5000 || current - checked > 30000 || expires <= current || expires - checked !== 30000) return fail();
  return { ...request, environment, allowed: true as const, grantId: grant.grantId,
    checkedAt: new Date(checked).toISOString(), expiresAt: new Date(expires).toISOString() };
}
