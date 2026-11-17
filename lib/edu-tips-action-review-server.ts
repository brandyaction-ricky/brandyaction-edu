import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CareSnapshot } from '@/lib/learning-care';

export { parseTipsActionReview } from './edu-tips-action-review';
export type { TipsActionReview } from './edu-tips-action-review';
import { evaluateTipsAction, type TipsActionReview, type TipsReviewResult } from './edu-tips-action-review';

export async function reviewTipsAction(actorId: string, command: TipsActionReview,
  db = createAdminClient(), signal = AbortSignal.timeout(15000)): Promise<TipsReviewResult> {
  // Independently verifies operator permission before private source reads.
  const scope = await db.rpc('edu_admin_learning_care', { p_actor: actorId, p_cohort: command.cohortId }).abortSignal(signal);
  if (scope.error || !scope.data || !Array.isArray(scope.data.rows) || !Array.isArray(scope.data.cohorts)
    || typeof scope.data.asOf !== 'string' || !Number.isFinite(Date.parse(scope.data.asOf))) throw new Error('TIPS_REVIEW_UNAVAILABLE');
  const care = scope.data as CareSnapshot;
  const [pr, co, cr, consent] = await Promise.all([
    db.from('profiles').select('id,status,role,marketing_use_consent_at,ad_email_consent_at,ad_kakao_consent_at').eq('id', command.memberId).abortSignal(signal).maybeSingle(),
    db.from('cohorts').select('id,course_id,status,operation_start_at,operation_end_at').eq('id', command.cohortId).eq('course_id', command.courseId).abortSignal(signal).maybeSingle(),
    db.from('courses').select('id,archived_at').eq('id', command.courseId).abortSignal(signal).maybeSingle(),
    db.rpc('edu_personalization_consent', { p_member: command.memberId }).abortSignal(signal),
  ]);
  if ([pr, co, cr, consent].some(x => x.error)) throw new Error('TIPS_REVIEW_UNAVAILABLE');
  const [or, er] = await Promise.all([
    // No consent-date restriction: source pre-consent purchases must also be checked.
    db.from('orders').select('id,status,paid_at,order_items!inner(id,course_id,cohort_id)', { count: 'exact' }).eq('user_id', command.memberId)
      .eq('order_items.course_id', command.courseId).eq('order_items.cohort_id', command.cohortId).limit(101).abortSignal(signal),
    db.from('enrollments').select('id,status,revoked_at,access_starts_at,access_ends_at,order_item_id,source', { count: 'exact' })
      .eq('user_id', command.memberId).eq('course_id', command.courseId).eq('cohort_id', command.cohortId).limit(3).abortSignal(signal),
  ]);
  if (or.error || er.error || !Array.isArray(or.data) || or.data.length > 100) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const orders = or.data;
  const pay = orders.length ? await db.from('payments').select('id,order_id,status,approved_at,approved_amount,cancelled_amount', { count: 'exact' })
    .in('order_id', orders.map(o => o.id)).limit(101).abortSignal(signal) : { data: [], error: null, count: 0 };
  if (pay.error || !Array.isArray(pay.data) || pay.data.length > 100) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const payments = pay.data;
  const ref = payments.length ? await db.from('refunds').select('payment_id,amount,status', { count: 'exact' }).in('payment_id', payments.map(p => p.id))
    .eq('status', 'done').limit(1000).abortSignal(signal) : { data: [], error: null, count: 0 };
  if (ref.error) throw new Error('TIPS_REVIEW_INCOMPLETE');
  return evaluateTipsAction(command, { care, profile: pr.data, cohort: co.data, course: cr.data,
    analysisEligible: consent.data?.eligible === true, orders, orderCount: or.count!,
    enrollments: er.data!, enrollmentCount: er.count!, payments, paymentCount: pay.count!,
    refunds: ref.data!, refundCount: ref.count! });
}
