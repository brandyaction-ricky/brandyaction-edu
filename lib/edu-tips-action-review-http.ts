import { createHash } from 'node:crypto';
import { parseStrictTipsJson } from './edu-tips-json';
import { evaluateTipsAction, type TipsActionReview, type TipsReviewSnapshot } from './edu-tips-action-review';

// Candidate service-to-service contract. Independent of rc.2 feeds and manual sending.
export const actionReviewVersion = 'edu-action-review/1.0-draft.1';
type Command = { customer_id: string; consent_epoch: string; product_id: string; cohort_code: string;
  intent: 'learning_support' | 'course_offer'; channel: 'email' | 'kakao' };
type Dependencies = { env: Record<string, string | undefined>;
  rpc: (args: Record<string, unknown>, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }> };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'no-store', 'X-Contract-Version': actionReviewVersion, ...(status === 429 ? { 'Retry-After': '60' } : {}),
} });
class InvalidRequest extends Error { constructor(readonly status: number) { super('invalid_request'); } }
function valid(value: unknown): value is Command {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>, fields = ['customer_id', 'consent_epoch', 'product_id', 'cohort_code', 'intent', 'channel'];
  return Object.keys(x).length === fields.length && Object.keys(x).every(k => fields.includes(k))
    && typeof x.customer_id === 'string' && /^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$/.test(x.customer_id)
    && typeof x.consent_epoch === 'string' && /^ce_[A-Za-z0-9_-]{32}$/.test(x.consent_epoch)
    && ['product_id', 'cohort_code'].every(k => typeof x[k] === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/.test(x[k] as string))
    && (x.intent === 'learning_support' || x.intent === 'course_offer') && (x.channel === 'email' || x.channel === 'kakao');
}
async function readBody(request: Request, signal: AbortSignal) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new InvalidRequest(415);
  if (Number(request.headers.get('content-length') || 0) > 4096) throw new InvalidRequest(413);
  const reader = request.body?.getReader(); if (!reader) throw new InvalidRequest(400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  const abort = () => { void reader.cancel(); }; signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const part = await reader.read(); signal.throwIfAborted(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 4096) { await reader.cancel(); throw new InvalidRequest(413); }
      chunks.push(part.value);
    }
    try { return parseStrictTipsJson(Buffer.concat(chunks)); } catch { throw new InvalidRequest(400); }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
export async function handleActionReview(request: Request, deps: Dependencies): Promise<Response> {
  try {
    if (deps.env.EDU_TIPS_SOURCE_REVIEW_API_ENABLED !== 'true') return reply({ error: 'unavailable', deliveryAllowed: false }, 503);
    const environment = deps.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev'
      : deps.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
    if (!environment) return reply({ error: 'unavailable', deliveryAllowed: false }, 503);
    if (request.method !== 'POST') return reply({ error: 'invalid_request', deliveryAllowed: false }, 405);
    if (new URL(request.url).searchParams.size) return reply({ error: 'invalid_request', deliveryAllowed: false }, 400);
    const key = /^Bearer ([A-Za-z0-9_-]{32,512})$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!key) return reply({ error: 'unauthorized', deliveryAllowed: false }, 401);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]), body = await readBody(request, signal);
    if (!valid(body)) return reply({ error: 'invalid_request', deliveryAllowed: false }, 400);
    const started = Date.now();
    const { data, error } = await deps.rpc({ p_key_hash: createHash('sha256').update(key).digest('hex'), p_environment: environment, p_command: body }, signal);
    signal.throwIfAborted();
    if (error || !data || typeof data !== 'object') return reply({ error: 'unavailable', deliveryAllowed: false }, 503);
    if ('error' in data) {
      const code = (data as { error: unknown }).error;
      const status = code === 'unauthorized' ? 401 : code === 'rate_limited' ? 429 : code === 'invalid_request' ? 400 : 503;
      return reply({ error: status === 503 ? 'unavailable' : code, deliveryAllowed: false }, status);
    }
    const context = data as { excluded?: string; checked_at: string; command: TipsActionReview; snapshot: TipsReviewSnapshot };
    const at = Date.parse(context.checked_at);
    if (!Number.isFinite(at) || at < started - 15000 || at > Date.now() + 1000) throw new Error('STALE_SOURCE_REVIEW');
    let review;
    if (context.excluded) {
      if (!['analysis_not_current', 'unavailable_course'].includes(context.excluded)) throw new Error('INVALID_SOURCE_REVIEW');
      review = { decision: 'excluded', reason: context.excluded, reviewedAt: context.checked_at, deliveryAllowed: false };
    } else {
      if (context.command.intent !== body.intent || context.command.channel !== body.channel || context.snapshot.care.asOf !== context.checked_at) throw new Error('INVALID_SOURCE_REVIEW');
      review = evaluateTipsAction(context.command, context.snapshot);
    }
    // Explicit projection: never expose internal member/order/enrollment/lesson IDs, records, names or contacts.
    return reply({ contract_version: actionReviewVersion, source: 'brandyaction_edu', customer_id: body.customer_id,
      consent_epoch: body.consent_epoch, product_id: body.product_id, cohort_code: body.cohort_code,
      intent: body.intent, channel: body.channel, mode: 'review_only', deliveryAllowed: false,
      review: { decision: review.decision, reason: review.reason, reviewedAt: review.reviewedAt, deliveryAllowed: false,
        ...(review.partialRefund === undefined ? {} : { partialRefund: review.partialRefund }) } });
  } catch (error) {
    return reply({ error: error instanceof InvalidRequest ? 'invalid_request' : 'unavailable', deliveryAllowed: false }, error instanceof InvalidRequest ? error.status : 503);
  }
}
