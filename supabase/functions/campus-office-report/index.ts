// Bundle with the repository's esbuild before deploying, so both ingress routes
// run identical signature, size, timestamp, replay identity and event validators.
import { handleOfficeWebhook, type VerifiedOfficeEvent } from '../../../features/campus/office/webhook';
import { isCampusId, campusError } from '../../../features/campus/snapshot';

const developmentUrl = 'https://vjmjhaidlqkmascdjocw.supabase.co';
type Binding = {
  connectorId: string; keyVersion: string; ownerId: string; enrollmentId: string;
  secret: string; expiresAt: string;
};
function readBinding(raw: string | undefined): Binding | null {
  try {
    const b = JSON.parse(raw || 'null');
    if (!b || !isCampusId(b.ownerId) || !isCampusId(b.enrollmentId)
      || typeof b.secret !== 'string' || !/^[a-f0-9]{64}$/.test(b.secret)
      || typeof b.connectorId !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(b.connectorId)
      || typeof b.keyVersion !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(b.keyVersion)
      || !(Date.parse(b.expiresAt) > Date.now())) return null;
    return b;
  } catch { return null; }
}

export function receive(request: Request, serverUrl: string | undefined, serverKey: string | undefined, rawBinding: string | undefined, transport = fetch) {
  const binding = readBinding(rawBinding);
  if (serverUrl !== developmentUrl || !serverKey || !binding) return new Response(null, { status: 404 });
  const { ownerId, enrollmentId } = binding;
  const headers = { apikey: serverKey, authorization: 'Bearer ' + serverKey, 'content-type': 'application/json' };
  async function database(path: string, body?: unknown) {
    const response = await transport(developmentUrl + '/rest/v1/' + path, {
      method: body === undefined ? 'GET' : 'POST', headers, redirect: 'error',
      signal: AbortSignal.timeout(8000), body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      const status = data?.code === '42501' ? 403 : ['23505','40001'].includes(data?.code) ? 409
        : ['23514','22P02','23502'].includes(data?.code) ? 400 : 503;
      campusError(status, 'Office report rejected');
    }
    return data;
  }
  async function ingest(verified: VerifiedOfficeEvent) {
    const event = verified.event;
    if (event.event === 'registered') {
      if (event.enrollmentId !== enrollmentId) campusError(403, 'Enrollment mismatch');
    } else {
      if (event.dispatchId) campusError(403, 'Dispatch unavailable');
      // The general RPC can also accept unassigned jobs. This endpoint only
      // accepts jobs registered by this connector in this enrollment.
      const filter = new URLSearchParams({
        select: 'id', id: 'eq.' + event.jobId, owner_id: 'eq.' + ownerId,
        enrollment_id: 'eq.' + enrollmentId, connector_id: 'eq.' + verified.connectorId,
      });
      const rows = await database('edu_campus_office_jobs?' + filter);
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== event.jobId) campusError(403, 'Job mismatch');
    }
    const rpc = event.event === 'registered' ? 'edu_campus_office_register' : 'edu_campus_office_ingest';
    return database('rpc/' + rpc, {
      p_connector: verified.connectorId, p_key_version: verified.keyVersion, p_allowed_owners: verified.allowedOwners,
      p_event_id: verified.eventId, p_payload_hash: verified.payloadHash, p_event: event,
    });
  }
  return handleOfficeWebhook(request, {
    enabled: true, registrationEnabled: true, ingest,
    connectors: [{ id: binding.connectorId, keyVersion: binding.keyVersion, ownerIds: [binding.ownerId], secret: binding.secret }],
  });
}

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (r: Request) => Response | Promise<Response>): void };
if (typeof Deno !== 'undefined') Deno.serve(request => receive(request, Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('CAMPUS_OFFICE_REPORT_DEV_BINDING')));
