import 'server-only';
import { createEduIdentityCandidate, IDENTITY_PROFILE, newConsentEpoch, type IdentityEnvironment } from './edu-tips-identity-candidate';
import { CONTROL_VERSION, isEduControlBlock, type ControlBlock, type ControlResult } from './edu-tips-control-candidate';
import { deliverEduControlLeaseCandidate, type ControlLease } from './edu-tips-control-worker-candidate';

// Server-only adapters; intentionally not wired to consent routes or cron.
export type CandidateRpc = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
async function callRpc(rpc: CandidateRpc, name: string, args: Record<string, unknown>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('TIPS_CONTROL_RPC_UNAVAILABLE')); }, 5000);
  });
  try { return await Promise.race([rpc(name, args, controller.signal), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
const epoch = (s: unknown): s is string => typeof s === 'string' && /^ce_[A-Za-z0-9_-]{32}$/.test(s);
const customer = (s: unknown): s is string => typeof s === 'string' && /^k[1-9][0-9]{0,2}:[A-Za-z0-9_-]{43}$/.test(s);
function object(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object' && !Array.isArray(x); }
function exact(x: Record<string, unknown>, keys: string[]) { return Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k)); }
export async function registerEduIdentityCandidate(input: { member: string; version: string; revision: string }, deps: {
  enabled?: boolean; agreedProfile?: string; rpc: CandidateRpc;
  identities: Parameters<typeof createEduIdentityCandidate>[0];
}): Promise<{ status: 'disabled' | 'blocked' | 'unavailable' } | { status: 'registered' | 'existing'; customer_id: string; consent_epoch: string; needs_migration: boolean }> {
  if (deps.enabled !== true || deps.agreedProfile !== IDENTITY_PROFILE) return { status: 'disabled' };
  if (!uuid(input.member) || !uuid(input.revision) || !input.version || input.version.length > 100) return { status: 'blocked' };
  try {
    const ids = createEduIdentityCandidate(deps.identities);
    const prepared = await callRpc(deps.rpc, 'edu_tips_prepare_identity_candidate', {
      p_member: input.member, p_version: input.version, p_revision: input.revision, p_epoch: newConsentEpoch(),
    });
    if (prepared.error || !object(prepared.data)) return { status: 'unavailable' };
    const p = prepared.data;
    if (exact(p, ['error']) && ['disabled', 'not_eligible', 'erasure_pending', 'identity_migration_required'].includes(String(p.error))) return { status: 'blocked' };
    if (p.state === 'registered' && exact(p, ['state', 'customer_id', 'consent_epoch']) && customer(p.customer_id) && epoch(p.consent_epoch)) {
      return { status: 'existing', customer_id: p.customer_id, consent_epoch: p.consent_epoch,
        needs_migration: ids.customerId(input.member, p.consent_epoch) !== p.customer_id };
    }
    if (p.state !== 'pending' || !exact(p, ['state', 'pending_id', 'consent_epoch', 'revision'])
      || !uuid(p.pending_id) || !epoch(p.consent_epoch) || p.revision !== input.revision) return { status: 'unavailable' };
    const derived = ids.customerId(input.member, p.consent_epoch);
    const finished = await callRpc(deps.rpc, 'edu_tips_finish_identity_candidate', { p_member: input.member,
      p_pending: p.pending_id, p_epoch: p.consent_epoch, p_customer: derived, p_version: input.version, p_revision: input.revision });
    if (finished.error || !object(finished.data)) return { status: 'unavailable' };
    if (exact(finished.data, ['error'])) return { status: 'blocked' };
    if (!exact(finished.data, ['customer_id', 'consent_epoch']) || finished.data.customer_id !== derived || finished.data.consent_epoch !== p.consent_epoch) return { status: 'unavailable' };
    return { status: 'registered', customer_id: derived, consent_epoch: p.consent_epoch, needs_migration: false };
  } catch { return { status: 'unavailable' }; }
}

export async function runEduControlBatchCandidate(input: { consumer: string; environment: IdentityEnvironment; limit?: number }, deps: {
  enabled?: boolean; agreedVersion?: string; rpc: CandidateRpc;
  send: (body: ControlBlock) => Promise<ControlResult>; now?: () => number; jitter?: () => number;
}) {
  const stats = { claimed: 0, confirmed: 0, pending: 0, lease_lost: 0, failures: 0 };
  if (deps.enabled !== true || deps.agreedVersion !== CONTROL_VERSION) return { status: 'disabled' as const, ...stats };
  const limit = input.limit ?? 20;
  if (!uuid(input.consumer) || !['dev', 'production'].includes(input.environment) || !Number.isInteger(limit) || limit < 1 || limit > 20) return { status: 'unavailable' as const, ...stats };
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const r = await callRpc(deps.rpc, name, args);
    if (r.error) throw new Error('TIPS_CONTROL_RPC_UNAVAILABLE');
    return r.data;
  };
  try {
    const rows = await invoke('edu_tips_claim_control_candidate', { p_consumer: input.consumer, p_environment: input.environment, p_limit: limit });
    if (!Array.isArray(rows) || rows.length > limit) return { status: 'unavailable' as const, ...stats };
    stats.claimed = rows.length;
    const params = (lease: ControlLease) => ({ p_request: lease.requestId, p_lease: lease.leaseToken, p_consumer: input.consumer, p_environment: input.environment });
    const boolean = (x: unknown) => { if (typeof x !== 'boolean') throw new Error('TIPS_CONTROL_RPC_UNAVAILABLE'); return x; };
    let nextRow = 0;
    const work = async () => { while (nextRow < rows.length) {
      const row = rows[nextRow++];
      try {
        // Protocol-invalid rows are retained, marked for attention and never sent.
        if (!object(row) || !exact(row, ['requestId', 'leaseToken', 'attempt', 'body']) || !uuid(row.requestId) || !uuid(row.leaseToken)) throw new Error('TIPS_CONTROL_LEASE_INVALID');
        const lease = row as unknown as ControlLease;
        if (!isEduControlBlock(lease.body) || lease.body.environment !== input.environment || lease.body.block.requestId !== lease.requestId) {
          const next = new Date((deps.now ?? Date.now)() + 30000).toISOString();
          const saved = boolean(await invoke('edu_tips_defer_control_candidate', { ...params(lease), p_code: 'invalid_request', p_next: next, p_attention: true }));
          stats[saved ? 'pending' : 'lease_lost']++; continue;
        }
        const state = await deliverEduControlLeaseCandidate(lease, {
          send: deps.send, now: deps.now, jitter: deps.jitter,
          store: {
            confirm: async (l, a) => boolean(await invoke('edu_tips_confirm_control_candidate', { ...params(l), p_ack: a })),
            defer: async (l, s) => boolean(await invoke('edu_tips_defer_control_candidate', { ...params(l), p_code: s.code, p_next: s.nextAttemptAt, p_attention: s.attention })),
          },
        });
        stats[state]++;
      } catch { stats.failures++; }
    } };
    // At most 20 leases with four workers and bounded RPC/transport requests.
    await Promise.all(Array.from({ length: Math.min(4, rows.length) }, () => work()));
    return { status: stats.failures ? 'unavailable' as const : 'processed' as const, ...stats };
  } catch { return { status: 'unavailable' as const, ...stats }; }
}
