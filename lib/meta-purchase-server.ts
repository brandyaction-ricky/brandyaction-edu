import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { EDU_META_PROJECT, metaCheckoutContext, metaPurchaseEnvironment, sendMetaPurchase, type MetaPurchaseJob } from '@/lib/meta-purchase-delivery';

export async function captureMetaPurchaseContext(request: Request, member: string, order: unknown) {
  if (!metaPurchaseEnvironment() || typeof order !== 'string') return;
  const context = metaCheckoutContext(request);
  if (!context) return;
  try {
    const { error } = await createAdminClient().rpc('edu_capture_meta_purchase', {
      p_member: member, p_order: order, p_context: context,
    });
    if (error) console.warn('meta purchase context unavailable');
  } catch { console.warn('meta purchase context unavailable'); }
  // Tracking failure must not prevent checkout. A missing context is never fabricated later.
}

export async function dispatchMetaPurchases() {
  if (process.env.VERCEL_ENV !== 'production' || process.env.VERCEL_PROJECT_ID !== EDU_META_PROJECT)
    return { disabled: true, sent: 0, deferred: 0, blocked: 0 };
  const db = createAdminClient();
  const stats = { disabled: false, sent: 0, deferred: 0, blocked: 0 };
  const maintenance = await db.rpc('edu_meta_purchase_cleanup');
  if (maintenance.error) throw new Error('META_PURCHASE_QUEUE_UNAVAILABLE');
  if (!metaPurchaseEnvironment() || !process.env.META_PURCHASE_CAPI_ACCESS_TOKEN) {
    const pause = await db.rpc('edu_pause_meta_purchase');
    if (pause.error) throw new Error('META_PURCHASE_QUEUE_UNAVAILABLE');
    return { ...stats, disabled: true };
  }
  // Claim just one at a time; the last authorization happens immediately before HTTP.
  for (let index = 0; index < 5; index++) {
    const claim = await db.rpc('edu_claim_meta_purchase');
    if (claim.error) throw new Error('META_PURCHASE_QUEUE_UNAVAILABLE');
    const job = claim.data as MetaPurchaseJob | null;
    if (!job) break;
    const authorized = await db.rpc('edu_authorize_meta_purchase', { p_order: job.orderId, p_lease: job.lease });
    if (authorized.error) throw new Error('META_PURCHASE_QUEUE_UNAVAILABLE');
    if (!authorized.data) continue;
    const result = await sendMetaPurchase(job);
    const completed = await db.rpc('edu_finish_meta_purchase', {
      p_order: job.orderId, p_lease: job.lease, p_outcome: result.outcome, p_trace: result.trace,
    });
    if (completed.error) throw new Error('META_PURCHASE_QUEUE_UNAVAILABLE');
    if (result.outcome === 'sent') stats.sent++;
    else if (result.outcome === 'retry') stats.deferred++;
    else { stats.blocked++; break; }
  }
  return stats;
}
