import 'server-only';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import requestSchema from './edu-tips-control-candidate/request.schema.json';
import ackSchema from './edu-tips-control-candidate/ack.schema.json';

// Draft transport only. No production route/cron imports this candidate.
export const CONTROL_VERSION = '1.0.0-draft.1';
export const CONTROL_PATH = '/api/internal/customer-controls/v1/blocks';
export const CONTROL_RECEIVER = 'tips-customer-controls';
type Environment = 'dev' | 'production';
export type ControlBlock = {
  control_version: typeof CONTROL_VERSION; environment: Environment;
  tenant_id: 'brandyaction'; brand_id: 'brandyaction_edu'; receiver_id: typeof CONTROL_RECEIVER;
  origin_contract_version: '2.0.0-rc.2'; deadline_profile: 'rc2_5_30_30';
  block: { requestId: string; customer_id: string; consent_epoch: string;
    reason: 'consent_withdrawn' | 'account_deleted' | 'identity_retired';
    at: string; active_due_at: string; model_due_at: string; residual_due_at: string };
};
export type ControlKey = {
  kid: string; secret: Buffer; environment: Environment; tenant: 'brandyaction';
  brand: 'brandyaction_edu'; receiver: typeof CONTROL_RECEIVER;
  direction: 'source_to_tips'; scope: 'control:block'; expiresAt: string; revoked: boolean;
};
export type ControlAck = {
  control_version: typeof CONTROL_VERSION; environment: Environment;
  tenant_id: 'brandyaction'; brand_id: 'brandyaction_edu'; receiver_id: typeof CONTROL_RECEIVER;
  requestId: string; customer_id: string; consent_epoch: string; request_digest: string;
  status: 'blocked'; blocked_at: string; cancellation: 'requested';
};
export type ControlFailure = 'disabled' | 'invalid_request' | 'invalid_configuration'
  | 'timeout' | 'network_error' | 'remote_rejected' | 'remote_unavailable' | 'invalid_ack';
export type ControlResult = { confirmed: true; ack: ControlAck }
  | { confirmed: false; code: ControlFailure; attention: boolean; retryAfterSeconds?: number };
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv);
const requestValid = ajv.compile(requestSchema), ackValid = ajv.compile(ackSchema);
const top = ['control_version', 'environment', 'tenant_id', 'brand_id', 'receiver_id', 'origin_contract_version', 'deadline_profile'] as const;
const fields = ['requestId', 'customer_id', 'consent_epoch', 'reason', 'at', 'active_due_at', 'model_due_at', 'residual_due_at'] as const;
const sha = (raw: string | Buffer) => createHash('sha256').update(raw).digest('hex');
function micros(value: string): bigint | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/.test(value)) return null;
  const milliseconds = value.slice(0, 23) + 'Z';
  if (!Number.isFinite(Date.parse(milliseconds)) || new Date(milliseconds).toISOString() !== milliseconds) return null;
  return BigInt(Date.parse(milliseconds)) * BigInt(1000) + BigInt(value.length === 27 ? value.slice(23, 26) : 0);
}
function utc(value: string): boolean { return micros(value) !== null; }
export function isEduControlBlock(input: unknown): input is ControlBlock {
  if (!requestValid(input)) return false;
  const b = input as ControlBlock, t = b.block;
  if (b.brand_id !== 'brandyaction_edu' || b.origin_contract_version !== '2.0.0-rc.2'
    || b.deadline_profile !== 'rc2_5_30_30'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(t.requestId)
    || !fields.slice(4).every(k => utc(t[k]))) return false;
  return micros(t.active_due_at)! - micros(t.at)! === BigInt(120) * BigInt(3600000000)
    && micros(t.model_due_at)! - micros(t.at)! === BigInt(720) * BigInt(3600000000)
    && micros(t.residual_due_at)! - micros(t.at)! === BigInt(720) * BigInt(3600000000);
}
export function controlDigest(b: ControlBlock) {
  if (!isEduControlBlock(b)) throw new Error('TIPS_CONTROL_INVALID');
  return sha(JSON.stringify(['tips.block.v1', ...top.map(k => b[k]), ...fields.map(k => b.block[k])]));
}
export function canonicalControlBody(b: ControlBlock): string {
  if (!isEduControlBlock(b)) throw new Error('TIPS_CONTROL_INVALID');
  // Fixed ordering and ASCII field domains keep persisted semantic snapshots
  // byte-identical across jsonb/REST property ordering and retries.
  return JSON.stringify({ ...Object.fromEntries(top.map(k => [k, b[k]])),
    block: Object.fromEntries(fields.map(k => [k, b.block[k]])) });
}
export function signedControlHeaders(raw: string, b: ControlBlock, key: ControlKey, now: number, nonce = randomBytes(24).toString('base64url')) {
  if (!isEduControlBlock(b) || !validKey(key, b, now) || !/^[A-Za-z0-9_-]{32}$/.test(nonce)
    || !Number.isSafeInteger(now) || now < 1000) throw new Error('TIPS_CONTROL_INVALID');
  // Only canonical, validated DTO bytes may be signed; callers cannot sign arbitrary JSON.
  if (raw !== canonicalControlBody(b)) throw new Error('TIPS_CONTROL_INVALID');
  const timestamp = String(Math.floor(now / 1000));
  const frame = ['TIPS-BLOCK-V1', 'POST', CONTROL_PATH, CONTROL_RECEIVER, b.environment,
    b.tenant_id, b.brand_id, key.kid, timestamp, nonce, sha(raw)].join('\n');
  return {
    'content-type': 'application/json', 'x-tips-control-key-id': key.kid,
    'x-tips-control-timestamp': timestamp, 'x-tips-control-nonce': nonce,
    'x-tips-control-signature': `v1=${createHmac('sha256', key.secret).update(frame).digest('hex')}`,
  };
}
function validKey(key: ControlKey, b: ControlBlock, now: number): boolean {
  return !!key && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key.kid) && Buffer.isBuffer(key.secret)
    && key.secret.length >= 32 && key.secret.length <= 64 && key.revoked === false
    && utc(key.expiresAt) && Date.parse(key.expiresAt) > now
    && key.environment === b.environment && key.tenant === b.tenant_id && key.brand === b.brand_id
    && key.receiver === b.receiver_id && key.direction === 'source_to_tips' && key.scope === 'control:block';
}
export function isEduControlAck(ack: unknown, b: ControlBlock, now: number): ack is ControlAck {
  if (!isEduControlBlock(b) || !Number.isSafeInteger(now)) return false;
  if (!ackValid(ack)) return false;
  const a = ack as ControlAck;
  return (['control_version', 'environment', 'tenant_id', 'brand_id', 'receiver_id'] as const).every(k => a[k] === b[k])
    && ['requestId', 'customer_id', 'consent_epoch'].every(k => a[k as keyof ControlAck] === b.block[k as keyof ControlBlock['block']])
    && a.request_digest === controlDigest(b) && utc(a.blocked_at)
    && micros(a.blocked_at)! >= micros(b.block.at)! && micros(a.blocked_at)! <= BigInt(now + 60000) * BigInt(1000);
}
async function boundedAck(response: Response): Promise<unknown> {
  // Match the explicit UTF-8 draft profile. Do not ignore unsupported charset,
  // duplicate type, or unknown parameters; valid ASCII is not profile evidence.
  const contentType = response.headers.get('content-type');
  if (!response.body || !contentType || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(contentType.trim())) throw new Error('invalid_ack');
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) throw new Error('invalid_ack');
      parts.push(chunk.value);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
    const value = JSON.parse(raw) as unknown;
    // ACK is a flat object with a fixed field set and constrained string values.
    // Reject repeated/escaped property names before schema/echo checks.
    const names = [...raw.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(m => JSON.parse(`"${m[1]}"`) as string);
    if (new Set(names).size !== names.length) throw new Error('invalid_ack');
    return value;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function target(origin: string | undefined, allowedOrigin: string | undefined): string | null {
  if (!origin || origin !== allowedOrigin) return null;
  try {
    const u = new URL(origin);
    if (u.origin !== origin || u.protocol !== 'https:' || u.username || u.password || u.port
      || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(u.hostname)) return null;
    return `${u.origin}${CONTROL_PATH}`;
  } catch { return null; }
}
export async function sendEduControlCandidate(input: unknown, deps: {
  enabled?: boolean; agreedVersion?: string; environment?: Environment;
  origin?: string; allowedOrigin?: string; key?: ControlKey;
  fetch: typeof fetch; now?: () => number; timeoutMs?: number;
}): Promise<ControlResult> {
  const failed = (code: ControlFailure, attention = false): ControlResult => ({ confirmed: false, code, attention });
  if (deps.enabled !== true || deps.agreedVersion !== CONTROL_VERSION) return failed('disabled');
  if (!isEduControlBlock(input)) return failed('invalid_request', true);
  // Copy before the first await so mutation by a caller cannot alter signed identity/ACK binding.
  const raw = canonicalControlBody(input), b = JSON.parse(raw) as ControlBlock;
  const now = deps.now ?? Date.now, at = now(), url = target(deps.origin, deps.allowedOrigin);
  const timeout = deps.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(at) || micros(b.block.at)! > BigInt(at + 60000) * BigInt(1000)) return failed('invalid_request', true);
  if (!url || deps.environment !== b.environment || !deps.key || !validKey(deps.key, b, at)
    || !Number.isInteger(timeout) || timeout < 1 || timeout > 5000) return failed('invalid_configuration', true);
  const headers = signedControlHeaders(raw, b, deps.key, at);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<ControlResult>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(failed('timeout')); }, timeout);
  });
  const operation = (async (): Promise<ControlResult> => {
    let response: Response;
    try {
      response = await deps.fetch(url, { method: 'POST', headers, body: raw,
        redirect: 'error', cache: 'no-store', signal: controller.signal });
    } catch { return failed('network_error'); }
    if (response.status !== 200 || response.redirected) {
      void response.body?.cancel().catch(() => {});
      const rejected = [401, 403, 409].includes(response.status);
      const result = failed(rejected ? 'remote_rejected' : 'remote_unavailable', rejected);
      const retry = response.headers.get('retry-after');
      if (!result.confirmed && response.status === 429 && retry && /^\d{1,4}$/.test(retry)) {
        result.retryAfterSeconds = Math.min(3600, Number(retry));
      }
      return result;
    }
    try {
      const ack = await boundedAck(response);
      return isEduControlAck(ack, b, now()) ? { confirmed: true, ack } : failed('invalid_ack', true);
    } catch { return failed('invalid_ack', true); }
  })();
  try { return await Promise.race([operation, timedOut]); }
  finally { if (timer) clearTimeout(timer); }
}
