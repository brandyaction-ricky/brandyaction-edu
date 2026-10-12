import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './edu-tips-eligibility.schema.json';

const ajv = new Ajv({ strict: false, allErrors: false });
addFormats(ajv);
ajv.addSchema(schema);
const requestValid = ajv.compile({ $ref: schema.$id + '#/$defs/EligibilityRequest' });
const responseValid = ajv.compile({ $ref: schema.$id + '#/$defs/EligibilityResponse' });
type Subject = { customer_id: string; consent_epoch: string };
type Result = Subject & { eligible: boolean; reason: 'allowed' | 'not_eligible'; generation: number };
type Dependencies = {
  env: Record<string, string | undefined>;
  rpc: (args: Record<string, unknown>, signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
};
class InvalidBody extends Error { constructor(readonly status: number) { super('invalid_request'); } }
function response(data: unknown, status: number) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Contract-Version': '2.0.0-rc.2',
    ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}
async function boundedBody(request: Request, signal: AbortSignal) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new InvalidBody(415);
  if (Number(request.headers.get('content-length') || 0) > 16384) throw new InvalidBody(413);
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBody(400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  const abort = () => { void reader.cancel(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const part = await reader.read(); signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new InvalidBody(413); }
      chunks.push(part.value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new InvalidBody(400); }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function handleEligibility(request: Request, deps: Dependencies): Promise<Response> {
  try {
    // Independent of collection/export flags. OFF is the deployment default.
    if (deps.env.EDU_TIPS_ELIGIBILITY_API_ENABLED !== 'true') return response({ error: 'unavailable' }, 503);
    const environment = deps.env.NEXT_PUBLIC_APP_ENV === 'development' ? 'dev'
      : deps.env.NEXT_PUBLIC_APP_ENV === 'production' ? 'production' : null;
    if (!environment) return response({ error: 'unavailable' }, 503);
    if (request.method !== 'POST') return response({ error: 'invalid_request' }, 405);
    if (new URL(request.url).searchParams.size) return response({ error: 'invalid_request' }, 400);
    const key = /^Bearer ([A-Za-z0-9_-]{32,512})$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!key) return response({ error: 'unauthorized' }, 401);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)]);
    const body = await boundedBody(request, signal);
    if (!requestValid(body)) return response({ error: 'invalid_request' }, 400);
    const subjects = (body as { subjects: Subject[] }).subjects;
    const startedAt = Date.now();
    const { data, error } = await deps.rpc({ p_key_hash: createHash('sha256').update(key).digest('hex'),
      p_environment: environment, p_subjects: subjects }, signal);
    signal.throwIfAborted();
    if (error) return response({ error: 'unavailable' }, 503);
    if (data && typeof data === 'object' && 'error' in data) {
      const code = (data as { error: unknown }).error;
      const status = code === 'unauthorized' ? 401 : code === 'rate_limited' ? 429 : code === 'invalid_request' ? 400 : 503;
      return response({ error: status === 503 ? 'unavailable' : code }, status);
    }
    if (!responseValid(data)) return response({ error: 'contract_violation' }, 503);
    const value = data as { results: Result[]; checked_at: string };
    const checkedAt = Date.parse(value.checked_at);
    if (checkedAt < startedAt - 5000 || checkedAt > Date.now() + 1000 || value.results.length !== subjects.length
      || value.results.some((result, i) => result.customer_id !== subjects[i].customer_id || result.consent_epoch !== subjects[i].consent_epoch
        || result.reason !== (result.eligible ? 'allowed' : 'not_eligible'))) return response({ error: 'contract_violation' }, 503);
    return response(data, 200);
  } catch (error) {
    return response({ error: error instanceof InvalidBody ? 'invalid_request' : 'unavailable' }, error instanceof InvalidBody ? error.status : 503);
  }
}
