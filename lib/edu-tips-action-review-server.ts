import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { careAttention, canCareContact, type CareSnapshot } from '@/lib/learning-care';
import { uuid } from '@/lib/edu-workflows';

// Internal operator review, not a public TIPS contract, identity resolver or send permission.
export type TipsActionReview = { intent: 'learning_support' | 'course_offer'; memberId: string;
  courseId: string; cohortId: string; enrollmentId?: string; lessonId?: string; channel: 'email' | 'kakao' };
type Result = { decision: 'excluded' | 'review_only'; reason: string; deliveryAllowed: false; reviewedAt: string; partialRefund?: boolean };
type Profile = { id: string; status: string; role: string; marketing_use_consent_at: string | null; ad_email_consent_at: string | null; ad_kakao_consent_at: string | null };
type Cohort = { id: string; course_id: string; status: string; operation_start_at: string | null; operation_end_at: string | null };
type Order = { id: string; status: string; paid_at: string | null; order_items: { id: string; course_id: string; cohort_id: string }[] };
type Payment = { id: string; order_id: string; status: string; approved_at: string | null; approved_amount: number; cancelled_amount: number };
type Enrollment = { id: string; status: string; revoked_at: string | null; access_starts_at: string | null; access_ends_at: string | null; order_item_id: string | null; source: string };

export function parseTipsActionReview(value: unknown): TipsActionReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const x = value as Record<string, unknown>;
  const keys = ['intent', 'memberId', 'courseId', 'cohortId', 'channel', 'enrollmentId', 'lessonId'];
  if (Object.keys(x).some(k => !keys.includes(k)) || typeof x.intent !== 'string' || !['learning_support', 'course_offer'].includes(x.intent)
    || typeof x.channel !== 'string' || !['email', 'kakao'].includes(x.channel) || !['memberId', 'courseId', 'cohortId'].every(k => uuid(x[k]))) return null;
  if (x.intent === 'learning_support' && (!uuid(x.enrollmentId) || !uuid(x.lessonId))) return null;
  if (x.intent === 'course_offer' && ('enrollmentId' in x || 'lessonId' in x)) return null;
  return x as TipsActionReview;
}

export async function reviewTipsAction(actorId: string, command: TipsActionReview,
  db = createAdminClient(), signal = AbortSignal.timeout(15000)): Promise<Result> {
  // Independently verifies operator permission before private source reads.
  const scope = await db.rpc('edu_admin_learning_care', { p_actor: actorId, p_cohort: command.cohortId }).abortSignal(signal);
  if (scope.error || !scope.data || !Array.isArray(scope.data.rows) || !Array.isArray(scope.data.cohorts)
    || typeof scope.data.asOf !== 'string' || !Number.isFinite(Date.parse(scope.data.asOf))) throw new Error('TIPS_REVIEW_UNAVAILABLE');
  const care = scope.data as CareSnapshot, at = Date.parse(care.asOf);
  const exclude = (reason: string): Result => ({ decision: 'excluded', reason, reviewedAt: care.asOf, deliveryAllowed: false });
  const [pr, co, cr, consent] = await Promise.all([
    db.from('profiles').select('id,status,role,marketing_use_consent_at,ad_email_consent_at,ad_kakao_consent_at').eq('id', command.memberId).abortSignal(signal).maybeSingle(),
    db.from('cohorts').select('id,course_id,status,operation_start_at,operation_end_at').eq('id', command.cohortId).eq('course_id', command.courseId).abortSignal(signal).maybeSingle(),
    db.from('courses').select('id,archived_at').eq('id', command.courseId).abortSignal(signal).maybeSingle(),
    db.rpc('edu_personalization_consent', { p_member: command.memberId }).abortSignal(signal),
  ]);
  if ([pr, co, cr, consent].some(x => x.error)) throw new Error('TIPS_REVIEW_UNAVAILABLE');
  const profile = pr.data as Profile | null, cohort = co.data as Cohort | null;
  if (!profile || profile.status !== 'active' || ['admin', 'staff'].includes(profile.role)) return exclude('inactive_member');
  if (!cohort || !cr.data || cr.data.archived_at || cohort.status === 'cancelled') return exclude('unavailable_course');
  if (consent.data?.eligible !== true) return exclude('analysis_not_current');
  const stamp = (x: string | null) => !!x && Number.isFinite(Date.parse(x)) && Date.parse(x) <= at;
  // AI-selected CRM review only. Existing service-care notices retain their separate rules.
  if (!stamp(profile.marketing_use_consent_at) || !stamp(command.channel === 'email' ? profile.ad_email_consent_at : profile.ad_kakao_consent_at)) return exclude('marketing_channel_not_current');
  const [or, er] = await Promise.all([
    // No consent-date restriction: source pre-consent purchases must also be checked.
    db.from('orders').select('id,status,paid_at,order_items!inner(id,course_id,cohort_id)', { count: 'exact' }).eq('user_id', command.memberId)
      .eq('order_items.course_id', command.courseId).eq('order_items.cohort_id', command.cohortId).limit(101).abortSignal(signal),
    db.from('enrollments').select('id,status,revoked_at,access_starts_at,access_ends_at,order_item_id,source', { count: 'exact' })
      .eq('user_id', command.memberId).eq('course_id', command.courseId).eq('cohort_id', command.cohortId).limit(3).abortSignal(signal),
  ]);
  if (or.error || er.error || !Array.isArray(or.data) || !Array.isArray(er.data) || or.data.length > 100 || er.data.length > 1 || or.count !== or.data.length || er.count !== er.data.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const orders = or.data as Order[], enrollments = er.data as Enrollment[];
  if (orders.some(o => !uuid(o.id) || !Array.isArray(o.order_items) || o.order_items.length !== 1
    || o.order_items.some(i => !uuid(i.id) || i.course_id !== command.courseId || i.cohort_id !== command.cohortId))) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const pay = orders.length ? await db.from('payments').select('id,order_id,status,approved_at,approved_amount,cancelled_amount', { count: 'exact' })
    .in('order_id', orders.map(o => o.id)).limit(101).abortSignal(signal) : { data: [], error: null, count: 0 };
  if (pay.error || !Array.isArray(pay.data) || pay.data.length > 100 || pay.count !== pay.data.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const payments = pay.data as Payment[];
  if (new Set(payments.map(p => p.order_id)).size !== payments.length || payments.some(p => !orders.some(o => o.id === p.order_id)
    || !Number.isSafeInteger(p.approved_amount) || !Number.isSafeInteger(p.cancelled_amount) || p.cancelled_amount < 0
    || p.approved_amount < p.cancelled_amount)) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const ref = payments.length ? await db.from('refunds').select('payment_id,amount,status', { count: 'exact' }).in('payment_id', payments.map(p => p.id))
    .eq('status', 'done').limit(1000).abortSignal(signal) : { data: [], error: null, count: 0 };
  // An exact page cap is inconclusive, never proof that no records were omitted.
  if (ref.error || !Array.isArray(ref.data) || ref.data.length >= 1000 || ref.count !== ref.data.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const refunded = new Map<string, number>();
  for (const r of ref.data) {
    if (!payments.some(p => p.id === r.payment_id) || !Number.isSafeInteger(r.amount) || r.amount <= 0) throw new Error('TIPS_REVIEW_INCOMPLETE');
    refunded.set(r.payment_id, (refunded.get(r.payment_id) || 0) + r.amount);
  }
  const accessible = (e: Enrollment) => e.status === 'active' && !e.revoked_at
    && (!e.access_starts_at || Date.parse(e.access_starts_at) <= at) && (!e.access_ends_at || Date.parse(e.access_ends_at) > at);
  if (command.intent === 'course_offer') {
    if (enrollments.some(accessible)) return exclude('already_has_target_cohort');
    if (orders.some(o => ['paid', 'partially_refunded', 'refunded'].includes(o.status) || o.paid_at
      || payments.some(p => p.order_id === o.id && (p.approved_amount > 0 || p.approved_at)))) return exclude('target_cohort_purchase_history_review');
    return { decision: 'review_only', reason: 'no_target_cohort_purchase_or_entitlement', reviewedAt: care.asOf, deliveryAllowed: false };
  }
  const enrollment = enrollments.find(e => e.id === command.enrollmentId);
  if (!enrollment || !accessible(enrollment)) return exclude('learning_access_unavailable');
  if (cohort.status === 'completed' || (cohort.operation_end_at && Date.parse(cohort.operation_end_at) <= at)) return exclude('cohort_ended_not_learning_dropout');
  if (!cohort.operation_start_at || Date.parse(cohort.operation_start_at) > at) return exclude('cohort_not_started');
  let partialRefund = false;
  if (enrollment.source === 'purchase') {
    const order = orders.find(o => o.order_items.some(i => i.id === enrollment.order_item_id));
    const payment = order && payments.find(p => p.order_id === order.id);
    if (!order || !payment) return exclude('purchase_entitlement_not_reconciled');
    const cancelled = Math.max(payment.cancelled_amount, refunded.get(payment.id) || 0);
    if (order.status === 'refunded' || payment.status === 'cancelled' || (payment.approved_amount > 0 && cancelled >= payment.approved_amount)) return exclude('fully_refunded_or_cancelled');
    if (!['paid', 'partially_refunded'].includes(order.status) || !['done', 'partial_cancelled'].includes(payment.status)
      || payment.approved_amount <= cancelled) return exclude('purchase_entitlement_not_reconciled');
    partialRefund = cancelled > 0;
  } else if (enrollment.source !== 'admin_grant') return exclude('unknown_entitlement_source');
  const row = care.rows.find(r => r.memberId === command.memberId && r.enrollmentId === command.enrollmentId);
  if (!row || !canCareContact(row, command.lessonId!, care.asOf)) return exclude('care_recipient_changed');
  if (!careAttention(row, care.asOf).needsAttention) return exclude('no_current_learning_attention');
  return { decision: 'review_only', reason: 'current_source_facts_confirmed', reviewedAt: care.asOf, partialRefund, deliveryAllowed: false };
}
