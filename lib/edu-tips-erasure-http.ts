import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './edu-tips-erasure.schema.json';
import { parseStrictTipsJson } from './edu-tips-json';

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);
const validators = Object.fromEntries(['TombstonePage', 'ReceiptRequest', 'ReceiptResponse', 'AckRequest', 'AckResponse']
  .map(name => [name, ajv.compile({ ...schema, $ref: `#/$defs/${name}` })]));
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const version = '2.0.0-rc.2';
type Action = 'page' | 'receipts' | 'ack';
type Rpc = (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<{ data: unknown; error: { message: string } | null }>;
export type ErasureDependencies = { env: Record<string, string | undefined>; rpc: Rpc };
class Failure extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
const fail = (status: number, code: string): never => { throw new Failure(status, code); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(503, 'contract_violation');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !(key in value))) fail(503, 'contract_violation');
}
function validate(name: string, value: unknown, input = false) {
  if (!validators[name](value)) fail(input ? 400 : 503, input ? 'invalid_request' : 'contract_violation');
}
function sourceTime(value: unknown): { text: string; micros: bigint } {
  if (typeof value !== 'string') return fail(503, 'contract_violation');
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return fail(503, 'contract_violation');
  const [, whole, fraction = '', zone] = match;
  // Validate the local calendar before offset conversion; Date normalizes some
  // invalid dates. Never pass fractional seconds through a millisecond Date.
  const local = Date.parse(whole + 'Z');
  if (!Number.isFinite(local) || new Date(local).toISOString() !== whole + '.000Z' || zone === '-00:00') return fail(503, 'contract_violation');
  if (zone !== 'Z') {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 14 || minutes > 59 || hours * 60 + minutes > 14 * 60) return fail(503, 'contract_violation');
  }
  const milliseconds = Date.parse(whole + zone);
  if (!Number.isFinite(milliseconds)) return fail(503, 'contract_violation');
  const utcWhole = new Date(milliseconds).toISOString().slice(0, -5);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(utcWhole)) return fail(503, 'contract_violation');
  // PostgreSQL JSON may omit trailing zeros. Choose 3/6 digits losslessly;
  // already issued 3/6-digit UTC values retain their exact representation.
  const digits = fraction.padEnd(fraction.length > 3 ? 6 : 3, '0');
  return { text: utcWhole + '.' + digits + 'Z', micros: BigInt(milliseconds) * BigInt(1000) + BigInt(fraction.padEnd(6, '0')) };
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Contract-Version': version,
    ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}
async function readBody(request: Request, signal: AbortSignal) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'unsupported_media_type');
  if (Number(request.headers.get('content-length') || 0) > 16384) fail(413, 'request_too_large');
  const reader = request.body?.getReader();
  if (!reader) return fail(400, 'invalid_request');
  const chunks: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); return fail(413, 'request_too_large'); }
      chunks.push(value);
    }
    try { return parseStrictTipsJson(Buffer.concat(chunks)); }
    catch { return fail(400, 'invalid_request'); }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
const databaseErrors: Record<string, [number, string]> = {
  TIPS_UNKNOWN_CURSOR: [409, 'unknown_cursor'], TIPS_CURSOR_EXPIRED: [410, 'cursor_expired'],
  TIPS_ACK_GAP: [409, 'ack_gap'], TIPS_UNKNOWN_REQUEST: [409, 'unknown_request'],
  TIPS_IDENTITY_CONFLICT: [409, 'identity_conflict'], TIPS_IDEMPOTENCY_CONFLICT: [409, 'idempotency_conflict'],
  TIPS_REVISION_CONFLICT: [409, 'revision_conflict'], TIPS_INVALID_RECEIPT: [400, 'invalid_request'],
};

export async function handleErasure(request: Request, action: Action, deps: ErasureDependencies): Promise<Response> {
  try {
    // Independent from analysis/export flags: revocation must not stop erasure.
    if (deps.env.EDU_TIPS_ERASURE_API_ENABLED !== 'true') return response({ error: 'erasure_unavailable' }, 503);
    const environment = deps.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev' : deps.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
    const secret = deps.env.EDU_TIPS_ERASURE_CURSOR_SECRET;
    if (!environment || !secret || secret.length < 43) return response({ error: 'erasure_unavailable' }, 503);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await deps.rpc(name, args, signal);
      if (result.error) {
        const known = databaseErrors[result.error.message];
        if (known) fail(...known);
        return fail(503, 'erasure_unavailable');
      }
      return result.data;
    };
    const bearer = /^Bearer ([A-Za-z0-9_-]{32,512})$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!bearer) return response({ error: 'unauthorized' }, 401);
    const gate = object(await rpc('edu_tips_erasure_http_gate', { p_key_hash: sha(bearer), p_environment: environment,
      p_scope: action === 'page' ? 'edu.erasure.read' : 'edu.erasure.ack' }));
    if (gate.error) {
      const statuses: Record<string, number> = { unauthorized: 401, forbidden: 403, rate_limited: 429 };
      const status = typeof gate.error === 'string' ? statuses[gate.error] : undefined;
      if (!status) fail(503, 'erasure_unavailable');
      return response({ error: gate.error }, status);
    }
    if (typeof gate.consumer_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(gate.consumer_id)) fail(503, 'erasure_unavailable');
    const consumer = gate.consumer_id as string;
    const binding = `${consumer}:${environment}:brandyaction:brandyaction_edu:tombstones:1:`;
    const sign = (nonce: Buffer) => createHmac('sha256', secret).update(binding).update(nonce).digest();
    const mint = () => { const nonce = randomBytes(32); return `ts_${Buffer.concat([nonce, sign(nonce)]).toString('base64url')}`; };
    const cursorHash = (token: unknown) => {
      if (typeof token !== 'string' || !/^ts_[A-Za-z0-9_-]{86}$/.test(token)) return fail(409, 'unknown_cursor');
      const bytes = Buffer.from(token.slice(3), 'base64url');
      if (bytes.toString('base64url') !== token.slice(3) || bytes.length !== 64 || !timingSafeEqual(bytes.subarray(32), sign(bytes.subarray(0, 32)))) return fail(409, 'unknown_cursor');
      return sha(token);
    };
    const query = new URL(request.url).searchParams;
    if (action === 'page') {
      if (request.method !== 'GET') fail(405, 'method_not_allowed');
      if ([...query.keys()].some(k => !['after', 'limit'].includes(k)) || query.getAll('after').length > 1 || query.getAll('limit').length > 1) fail(400, 'invalid_request');
      const rawLimit = query.get('limit') ?? '200';
      if (!/^[1-9][0-9]{0,2}$/.test(rawLimit) || Number(rawLimit) > 500) fail(400, 'invalid_request');
      const limit = Number(rawLimit);
      const tokens = Array.from({ length: limit + 3 }, mint);
      const raw = object(await rpc('edu_tips_erasure_http_page', { p_consumer: consumer, p_after: query.has('after') ? cursorHash(query.get('after')) : null,
        p_limit: limit, p_hashes: tokens.map(sha) }));
      exact(raw, ['tombstones', 'has_more', 'has_ack', 'stream_generation']);
      if (!Array.isArray(raw.tombstones) || raw.tombstones.length > limit || typeof raw.has_ack !== 'boolean') fail(503, 'contract_violation');
      const tombstones = (raw.tombstones as unknown[]).map((value, index) => {
        const item = object(value);
        exact(item, ['requestId', 'customer_id', 'consent_epoch', 'reason', 'at', 'active_due_at', 'model_due_at', 'residual_due_at', 'cursor_slot']);
        if (item.cursor_slot !== index) fail(503, 'contract_violation');
        const at = sourceTime(item.at), active = sourceTime(item.active_due_at), model = sourceTime(item.model_due_at), residual = sourceTime(item.residual_due_at);
        if (active.micros - at.micros !== BigInt(120) * BigInt(3600000000) || model.micros - at.micros !== BigInt(720) * BigInt(3600000000) || residual.micros - at.micros !== BigInt(720) * BigInt(3600000000)) fail(503, 'contract_violation');
        return { requestId: item.requestId, customer_id: item.customer_id, consent_epoch: item.consent_epoch, reason: item.reason,
          at: at.text, active_due_at: active.text, model_due_at: model.text, residual_due_at: residual.text, cursor: tokens[index] };
      });
      const page = { source: 'brandyaction_edu', tenant_id: 'brandyaction', brand_id: 'brandyaction_edu', contract_version: version,
        generated_at: new Date().toISOString(), stream_generation: raw.stream_generation, snapshot_upper: tokens[limit + 1],
        next_cursor: tokens[limit], has_more: raw.has_more, tombstones, acked_through: raw.has_ack ? tokens[limit + 2] : null };
      validate('TombstonePage', page);
      return response(page);
    }
    if (request.method !== 'POST') fail(405, 'method_not_allowed');
    if (query.size) fail(400, 'invalid_request');
    const body = await readBody(request, signal);
    validate(action === 'receipts' ? 'ReceiptRequest' : 'AckRequest', body, true);
    if (action === 'receipts') {
      const result = await rpc('edu_tips_accept_erasure_receipt', { p_consumer: consumer, p_payload: body });
      validate('ReceiptResponse', result);
      return response(result);
    }
    const through = cursorHash(object(body).through); const resultToken = mint();
    await rpc('edu_tips_erasure_http_ack', { p_consumer: consumer, p_through: through, p_result_hash: sha(resultToken) });
    const result = { acked_through: resultToken }; validate('AckResponse', result);
    return response(result);
  } catch (error) {
    return response({ error: error instanceof Failure ? error.code : 'erasure_unavailable' }, error instanceof Failure ? error.status : 503);
  }
}
