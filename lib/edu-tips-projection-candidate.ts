import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { IDENTITY_PROFILE, createEduRecordCandidate } from './edu-tips-identity-candidate';
import type { CandidateRpc } from './edu-tips-source-candidate';
export function recordKeyFingerprint(key: Buffer) {
  return createHash('sha256').update('edu.record.key.v1\0').update(key).digest('hex');
}
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
async function call(rpc: CandidateRpc, name: string, args: Record<string, unknown>) {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stop = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TIPS_PROJECTION_UNAVAILABLE')); }, 5000); });
    const r = await Promise.race([rpc(name, args, controller.signal), stop]);
    if (r.error) throw new Error('TIPS_PROJECTION_UNAVAILABLE'); return r.data;
  } finally { if (timer) clearTimeout(timer); }
}
export async function runHmacProjectionCandidate(deps: {
  enabled: boolean; rpc: CandidateRpc; keys: Parameters<typeof createEduRecordCandidate>[0] | null; recordKeyVersion: string;
}) {
  const stats = { claimed: 0, applied: 0, stale: 0, pending: 0, failures: 0 };
  if (!deps.enabled || !deps.keys) return { status: 'disabled' as const, ...stats };
  try {
    const ids = createEduRecordCandidate(deps.keys), fingerprint = recordKeyFingerprint(deps.keys.recordKey);
    const rows = await call(deps.rpc, 'edu_tips_claim_hmac_projection_candidate', { p_limit: 4 });
    if (!Array.isArray(rows) || rows.length > 4) throw new Error('TIPS_PROJECTION_UNAVAILABLE');
    stats.claimed = rows.length;
    await Promise.all(rows.map(async row => {
      if (!obj(row) || !uuid(row.subject) || !uuid(row.lease) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1) { stats.failures++; return; }
      const args = { p_subject: row.subject, p_revision: row.revision, p_lease: row.lease };
      try {
        if (Object.keys(row).length !== 8 || !uuid(row.member) || row.profile !== IDENTITY_PROFILE || row.record_key_version !== deps.recordKeyVersion
          || typeof row.record_key_fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(row.record_key_fingerprint)
          || !timingSafeEqual(Buffer.from(row.record_key_fingerprint), Buffer.from(fingerprint)) || !Array.isArray(row.refs) || row.refs.length > 2000) throw new Error('TIPS_PROJECTION_UNAVAILABLE');
        const seen = new Set<string>();
        const refs = row.refs.map((ref: unknown) => {
          if (!obj(ref) || Object.keys(ref).length !== 2 || typeof ref.kind !== 'string' || typeof ref.source_key !== 'string') throw new Error('TIPS_PROJECTION_UNAVAILABLE');
          const unique = JSON.stringify([ref.kind, ref.source_key]);
          if (seen.has(unique)) throw new Error('TIPS_PROJECTION_UNAVAILABLE'); seen.add(unique);
          let opaque: string;
          if (['order', 'payment', 'refund'].includes(ref.kind) && uuid(ref.source_key)) opaque = ids.recordId(ref.kind as 'order' | 'payment' | 'refund', ref.source_key);
          else if (ref.kind === 'event' && /^(payment|refund):/.test(ref.source_key)) {
            const [kind, source, ...extra] = ref.source_key.split(':');
            if (extra.length || !uuid(source)) throw new Error('TIPS_PROJECTION_UNAVAILABLE');
            opaque = ids.eventId(kind === 'payment' ? 'payment_completed' : 'order_refunded', source);
          } else if (ref.kind === 'row') {
            const [kind, cohort, day, ...extra] = ref.source_key.split(':');
            if (kind !== 'learning' || extra.length || !uuid(cohort)) throw new Error('TIPS_PROJECTION_UNAVAILABLE');
            opaque = ids.learningId(row.member as string, cohort, day);
          } else throw new Error('TIPS_PROJECTION_UNAVAILABLE');
          return { ...ref, opaque };
        });
        const applied = await call(deps.rpc, 'edu_tips_apply_hmac_projection_candidate', { ...args, p_profile: row.profile, p_record_key_version: row.record_key_version, p_refs: refs });
        if (typeof applied !== 'boolean') throw new Error('TIPS_PROJECTION_UNAVAILABLE');
        stats[applied ? 'applied' : 'stale']++;
      } catch {
        try { const saved = await call(deps.rpc, 'edu_tips_defer_hmac_projection_candidate', args); if (typeof saved !== 'boolean') throw new Error('TIPS_PROJECTION_UNAVAILABLE'); stats[saved ? 'pending' : 'stale']++; }
        catch { stats.failures++; }
      }
    }));
    return { status: stats.failures ? 'unavailable' as const : 'processed' as const, ...stats };
  } catch { return { status: 'unavailable' as const, ...stats, failures: stats.failures + 1 }; }
}
