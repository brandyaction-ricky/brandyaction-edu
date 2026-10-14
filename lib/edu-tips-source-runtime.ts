import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { IDENTITY_PROFILE, type IdentityEnvironment } from './edu-tips-identity-candidate';
import { CONTROL_VERSION, CONTROL_RECEIVER, sendEduControlCandidate, type ControlKey } from './edu-tips-control-candidate';
import { registerEduIdentityCandidate, runEduControlBatchCandidate, type CandidateRpc } from './edu-tips-source-candidate';

type Env = Record<string, string | undefined>;
type Deps = { env: Env; rpc: CandidateRpc; fetch: typeof fetch; now?: () => number };
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function key(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const b = Buffer.from(value, 'base64');
  return b.length >= 32 && b.length <= 64 && b.toString('base64') === value ? b : null;
}
function origin(value: string | undefined, allowed: string | undefined) {
  if (!value || value !== allowed) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && u.origin === value && !u.username && !u.password && !u.port && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(u.hostname); }
  catch { return false; }
}
export function sourceRuntimeConfiguration(env: Env, now = Date.now()) {
  const identityRequested = env.EDU_TIPS_IDENTITY_RUNTIME_ENABLED === 'true';
  const controlRequested = env.EDU_TIPS_CONTROL_RUNTIME_ENABLED === 'true';
  const environment: IdentityEnvironment | null = env.NEXT_PUBLIC_APP_ENV === 'development' && env.EDU_TIPS_SOURCE_ENVIRONMENT === 'dev' ? 'dev'
    : env.NEXT_PUBLIC_APP_ENV === 'production' && env.EDU_TIPS_SOURCE_ENVIRONMENT === 'production' ? 'production' : null;
  const customer = key(env.EDU_TIPS_CUSTOMER_KEY), records = key(env.EDU_TIPS_RECORD_KEY), control = key(env.EDU_TIPS_CONTROL_KEY);
  const distinct = (a: Buffer | null, b: Buffer | null) => !a || !b || a.length !== b.length || !timingSafeEqual(a, b);
  const separate = distinct(customer, records) && distinct(customer, control) && distinct(records, control);
  // Readiness is an explicit operator gate. It does not implement/migrate the
  // SQL random-reference publisher or certify a contract/consumer deployment.
  const identityEnabled = identityRequested && !!environment && separate && !!customer && !!records
    && env.EDU_TIPS_IDENTITY_PROFILE === IDENTITY_PROFILE && env.EDU_TIPS_HMAC_PUBLISHER_READY === 'true'
    && /^k[1-9][0-9]{0,2}$/.test(env.EDU_TIPS_CUSTOMER_KEY_VERSION ?? '');
  const controlEnabled = controlRequested && !!environment && separate && !!control
    && env.EDU_TIPS_CONTROL_VERSION === CONTROL_VERSION && env.EDU_TIPS_CONTROL_KEY_PURPOSE === 'source_to_tips:control:block'
    && origin(env.EDU_TIPS_CONTROL_ORIGIN, env.EDU_TIPS_CONTROL_ALLOWED_ORIGIN)
    && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(env.EDU_TIPS_CONTROL_KEY_ID ?? '') && uuid(env.EDU_TIPS_CONTROL_CONSUMER_ID)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT ?? '')
    && Number.isFinite(Date.parse(env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT!)) && new Date(env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT!).toISOString() === env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT && Date.parse(env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT!) > now;
  return { identityRequested, controlRequested, environment, identityEnabled, controlEnabled,
    valid: (!identityRequested || identityEnabled) && (!controlRequested || controlEnabled),
    identityKeys: identityEnabled ? { environment: environment!, profile: IDENTITY_PROFILE as typeof IDENTITY_PROFILE, customerVersion: env.EDU_TIPS_CUSTOMER_KEY_VERSION!, customerKey: customer!, recordKey: records! } : null,
    controlKey: controlEnabled ? { kid: env.EDU_TIPS_CONTROL_KEY_ID!, secret: control!, environment: environment!, tenant: 'brandyaction', brand: 'brandyaction_edu', receiver: CONTROL_RECEIVER, direction: 'source_to_tips', scope: 'control:block', expiresAt: env.EDU_TIPS_CONTROL_KEY_EXPIRES_AT!, revoked: false } as ControlKey : null,
  };
}
async function rpc(deps: Deps, name: string, args: Record<string, unknown>) {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stop = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TIPS_SOURCE_UNAVAILABLE')); }, 5000); });
    const r = await Promise.race([deps.rpc(name, args, controller.signal), stop]);
    if (r.error) throw new Error('TIPS_SOURCE_UNAVAILABLE'); return r.data;
  } finally { if (timer) clearTimeout(timer); }
}
async function identityJobs(deps: Deps, member: string | null, limit: number) {
  const cfg = sourceRuntimeConfiguration(deps.env, (deps.now ?? Date.now)());
  const stats = { claimed: 0, completed: 0, pending: 0, lease_lost: 0, failures: 0 };
  if (!cfg.identityEnabled || !cfg.identityKeys) return stats;
  const rows = await rpc(deps, 'edu_tips_claim_identity_jobs_candidate', { p_member: member, p_limit: limit });
  if (!Array.isArray(rows) || rows.length > limit) throw new Error('TIPS_SOURCE_UNAVAILABLE');
  stats.claimed = rows.length;
  await Promise.all(rows.map(async row => {
    try {
      if (!record(row) || Object.keys(row).length !== 5 || !uuid(row.member) || !uuid(row.revision) || !uuid(row.lease)
        || typeof row.version !== 'string' || !row.version || !Number.isSafeInteger(row.attempt) || Number(row.attempt) < 1) throw new Error('TIPS_SOURCE_UNAVAILABLE');
      const result = await registerEduIdentityCandidate({ member: row.member, version: row.version, revision: row.revision }, {
        enabled: true, agreedProfile: IDENTITY_PROFILE, rpc: deps.rpc, identities: cfg.identityKeys!,
      });
      const code = result.status === 'registered' || (result.status === 'existing' && !result.needs_migration) ? 'done'
        : result.status === 'existing' ? 'migration_required' : result.status;
      const saved = await rpc(deps, 'edu_tips_finish_identity_job_candidate', { p_member: row.member, p_revision: row.revision, p_lease: row.lease, p_code: code });
      if (typeof saved !== 'boolean') throw new Error('TIPS_SOURCE_UNAVAILABLE');
      stats[!saved ? 'lease_lost' : code === 'done' ? 'completed' : 'pending']++;
    } catch { stats.failures++; }
  }));
  return stats;
}
async function controls(deps: Deps, limit: number) {
  const cfg = sourceRuntimeConfiguration(deps.env, (deps.now ?? Date.now)());
  return runEduControlBatchCandidate({ consumer: deps.env.EDU_TIPS_CONTROL_CONSUMER_ID ?? '', environment: cfg.environment ?? 'dev', limit }, {
    enabled: cfg.controlEnabled, agreedVersion: CONTROL_VERSION, rpc: deps.rpc, now: deps.now,
    send: body => sendEduControlCandidate(body, { enabled: cfg.controlEnabled, agreedVersion: CONTROL_VERSION, environment: cfg.environment ?? undefined,
      origin: deps.env.EDU_TIPS_CONTROL_ORIGIN, allowedOrigin: deps.env.EDU_TIPS_CONTROL_ALLOWED_ORIGIN, key: cfg.controlKey ?? undefined, fetch: deps.fetch, now: deps.now }),
  });
}
export async function afterConsentSourceCandidate(member: string, deps: Deps): Promise<void> {
  // No customer-visible errors, IDs or extra API response fields. The DB job/outbox
  // commits with consent; a lost after callback is repaired by the guarded worker.
  if (!uuid(member)) return;
  const cfg = sourceRuntimeConfiguration(deps.env, (deps.now ?? Date.now)());
  // A broken identity configuration must not suppress an independently valid
  // withdrawal transport. Each worker still checks its own purpose/configuration.
  if (!cfg.identityEnabled && !cfg.controlEnabled) return;
  await Promise.allSettled([identityJobs(deps, member, 1), controls(deps, 1)]);
}
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
export async function scheduledSourceCandidate(request: Request, deps: Deps) {
  if (request.method !== 'GET') return response({ status: 'method_not_allowed' }, 405);
  if (deps.env.EDU_TIPS_SOURCE_CRON_ENABLED !== 'true') return response({ status: 'disabled' }, 503);
  const secret = deps.env.CRON_SECRET, got = request.headers.get('authorization');
  if (!secret || secret.length < 32 || !got || Buffer.byteLength(got) !== Buffer.byteLength(`Bearer ${secret}`)
    || !timingSafeEqual(Buffer.from(got), Buffer.from(`Bearer ${secret}`))) return response({ status: 'unauthorized' }, 401);
  const cfg = sourceRuntimeConfiguration(deps.env, (deps.now ?? Date.now)());
  if (!cfg.identityEnabled && !cfg.controlEnabled) return response({ status: 'configuration_required' }, 503);
  try {
    const [registration, withdrawal] = await Promise.all([identityJobs(deps, null, 4), controls(deps, 4)]);
    const ok = cfg.valid && registration.failures === 0 && withdrawal.status !== 'unavailable';
    return response({ status: !cfg.valid ? 'configuration_required' : ok ? 'processed' : 'unavailable', registration, withdrawal }, ok ? 200 : 503);
  } catch { return response({ status: 'unavailable' }, 503); }
}
