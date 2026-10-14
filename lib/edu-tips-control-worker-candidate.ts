import 'server-only';
import { isEduControlAck, isEduControlBlock, type ControlAck, type ControlBlock, type ControlResult } from './edu-tips-control-candidate';

// Adapter contract only: a future DB-backed store must implement independent
// control leases and compare-and-set persistence. Erasure delivered_at/completed_at
// and collection flags deliberately do not appear in this contract.
export type ControlLease = {
  requestId: string; leaseToken: string; attempt: number; body: ControlBlock;
};
export type ControlDeliveryStore = {
  confirm: (lease: ControlLease, ack: ControlAck) => Promise<boolean>;
  defer: (lease: ControlLease, state: {
    code: string; nextAttemptAt: string; attention: boolean;
  }) => Promise<boolean>;
};
export async function deliverEduControlLeaseCandidate(lease: ControlLease, deps: {
  store: ControlDeliveryStore; send: (body: ControlBlock) => Promise<ControlResult>;
  now?: () => number; jitter?: () => number;
}): Promise<'confirmed' | 'pending' | 'lease_lost'> {
  if (!lease || !isEduControlBlock(lease.body) || lease.requestId !== lease.body.block.requestId
    || typeof lease.leaseToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(lease.leaseToken)
    || !Number.isSafeInteger(lease.attempt) || lease.attempt < 1) throw new Error('TIPS_CONTROL_LEASE_INVALID');
  // Preserve the original request; registration/current keys never regenerate it.
  const copy = structuredClone(lease);
  let result: ControlResult;
  try { result = await deps.send(structuredClone(copy.body)); }
  catch { result = { confirmed: false, code: 'network_error', attention: false }; }
  if (result.confirmed) {
    // A transport acknowledgment is not success until this exact lease commits.
    if (!isEduControlAck(result.ack, copy.body, (deps.now ?? Date.now)())) throw new Error('TIPS_CONTROL_ACK_INVALID');
    try { return await deps.store.confirm(copy, result.ack) ? 'confirmed' : 'lease_lost'; }
    catch { throw new Error('TIPS_CONTROL_STORE_UNAVAILABLE'); }
  }
  const now = (deps.now ?? Date.now)(), fraction = (deps.jitter ?? Math.random)();
  if (!Number.isSafeInteger(now) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('TIPS_CONTROL_CLOCK_INVALID');
  if (result.retryAfterSeconds !== undefined && (!Number.isInteger(result.retryAfterSeconds)
    || result.retryAfterSeconds < 0 || result.retryAfterSeconds > 3600)) throw new Error('TIPS_CONTROL_RETRY_INVALID');
  const seconds = Math.max(Math.min(30, 2 ** Math.min(lease.attempt - 1, 5)), result.retryAfterSeconds ?? 0);
  const delay = seconds * 1000 + Math.floor(fraction * 1000);
  const state = { code: result.code, nextAttemptAt: new Date(now + delay).toISOString(),
    attention: result.attention || now - Date.parse(copy.body.block.at) >= 60000 };
  try { return await deps.store.defer(copy, state) ? 'pending' : 'lease_lost'; }
  catch { throw new Error('TIPS_CONTROL_STORE_UNAVAILABLE'); }
}
