import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isCampusId } from '../snapshot';
import { validateOfficeEvent, type OfficeEvent } from './domain';
import { readLimitedUtf8Body } from '../community/request-body';
export type OfficeConnector = { id: string; keyVersion: string; secret: string; ownerIds: string[] };
export function readOfficeConnectors(env: Record<string, string | undefined>): OfficeConnector[] {
  // Configuration contains a secret variable name, never a secret sent to the browser.
  if (!env.EDU_CAMPUS_OFFICE_CONNECTORS_JSON) return [];
  try {
    const list: unknown = JSON.parse(env.EDU_CAMPUS_OFFICE_CONNECTORS_JSON);
    if (!Array.isArray(list) || list.length > 20) return [];
    const ids = new Set<string>(); const secrets = new Set<string>(); const out: OfficeConnector[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') return [];
      const e = entry as { id: string; keyVersion: string; secretEnv: string; ownerIds: string[] };
      if (typeof e.id !== 'string' || typeof e.keyVersion !== 'string' || typeof e.secretEnv !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(e.id) || ids.has(e.id) || !/^[a-zA-Z0-9_-]{1,40}$/.test(e.keyVersion) || !/^EDU_CAMPUS_OFFICE_[A-Z0-9_]+_SECRET$/.test(e.secretEnv)
        || !Array.isArray(e.ownerIds) || !e.ownerIds.length || e.ownerIds.length > 1000 || !e.ownerIds.every(isCampusId)) return [];
      const secret = env[e.secretEnv]; if (!secret || secret.length < 32 || secrets.has(secret)) return [];
      out.push({ id: e.id, keyVersion: e.keyVersion, secret, ownerIds: [...new Set(e.ownerIds)] }); ids.add(e.id); secrets.add(secret);
    }
    return out;
  } catch { return []; }
}
export type VerifiedOfficeEvent = { connectorId: string; keyVersion: string; allowedOwners: string[]; eventId: string; payloadHash: string; event: OfficeEvent };
export function verifyOfficeWebhook(raw: string, headers: Headers, connectors: OfficeConnector[], now = Date.now()): VerifiedOfficeEvent {
  const id = headers.get('x-campus-connector'), version = headers.get('x-campus-key-version'), timestamp = headers.get('x-campus-timestamp') ?? '', eventId = headers.get('x-campus-event-id') ?? '', signature = headers.get('x-campus-signature') ?? '';
  const connector = connectors.find(c => c.id === id && c.keyVersion === version);
  if (!connector || !/^\d{10}$/.test(timestamp) || Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300 || !isCampusId(eventId) || !/^v1=[a-f0-9]{64}$/.test(signature) || Buffer.byteLength(raw) > 48000) throw Object.assign(new Error('Invalid webhook'), { status: 401 });
  const expected = createHmac('sha256', connector.secret).update(`${connector.id}.${connector.keyVersion}.${timestamp}.${eventId}.${raw}`).digest();
  const supplied = Buffer.from(signature.slice(3), 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw Object.assign(new Error('Invalid webhook'), { status: 401 });
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  return { connectorId: connector.id, keyVersion: connector.keyVersion, allowedOwners: connector.ownerIds, eventId, payloadHash: createHash('sha256').update(raw).digest('hex'), event: validateOfficeEvent(data) };
}
export async function handleOfficeWebhook(request: Request, deps: { enabled: boolean; connectors: OfficeConnector[]; ingest: (event: VerifiedOfficeEvent) => Promise<unknown>; now?: number }) {
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!deps.enabled || !deps.connectors.length) return reply({ error: 'Not connected' }, 404);
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 48000) return reply({ error: 'Invalid request' }, 400);
  try {
    const raw = await readLimitedUtf8Body(request, 48000);
    const verified = verifyOfficeWebhook(raw, request.headers, deps.connectors, deps.now);
    return reply(await deps.ingest(verified), 200);
  } catch (e) {
    const status = e instanceof Error && 'status' in e && [400, 401, 403, 409].includes(Number(e.status)) ? Number(e.status) : 503;
    return reply({ error: status === 503 ? 'Unavailable' : status === 409 ? 'Event conflict' : 'Invalid event' }, status);
  }
}
