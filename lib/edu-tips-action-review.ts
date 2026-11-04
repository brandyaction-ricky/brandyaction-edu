import { careAttention, canCareContact, type CareSnapshot } from './learning-care';
import { uuid } from './edu-workflows';

// Source facts are internal. A review is never a permission to send.
export type TipsActionReview = { intent: 'learning_support' | 'course_offer'; memberId: string;
  courseId: string; cohortId: string; enrollmentId?: string; lessonId?: string; channel: 'email' | 'kakao' };
export type TipsReviewResult = { decision: 'excluded' | 'review_only'; reason: string; deliveryAllowed: false; reviewedAt: string; partialRefund?: boolean };
export type Profile = { id: string; status: string; role: string; marketing_use_consent_at: string | null; ad_email_consent_at: string | null; ad_kakao_consent_at: string | null };
export type Cohort = { id: string; course_id: string; status: string; operation_start_at: string | null; operation_end_at: string | null };
export type Order = { id: string; status: string; paid_at: string | null; order_items: { id: string; course_id: string; cohort_id: string }[] };
export type Payment = { id: string; order_id: string; status: string; approved_at: string | null; approved_amount: number; cancelled_amount: number };
export type Enrollment = { id: string; status: string; revoked_at: string | null; access_starts_at: string | null; access_ends_at: string | null; order_item_id: string | null; source: string };

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

export type TipsReviewSnapshot = { care: CareSnapshot; profile: Profile | null; cohort: Cohort | null;
  course: { id: string; archived_at: string | null } | null; analysisEligible: boolean;
  orders: Order[]; orderCount: number; enrollments: Enrollment[]; enrollmentCount: number;
  payments: Payment[]; paymentCount: number; refunds: { payment_id: string; amount: number; status: string }[]; refundCount: number };

export function evaluateTipsAction(command: TipsActionReview, source: TipsReviewSnapshot): TipsReviewResult {
  const care = source.care;
  if (!care || !Array.isArray(care.rows) || !Array.isArray(care.cohorts) || !Number.isFinite(Date.parse(care.asOf))) throw new Error('TIPS_REVIEW_UNAVAILABLE');
  const at = Date.parse(care.asOf);
  const exclude = (reason: string): TipsReviewResult => ({ decision: 'excluded', reason, reviewedAt: care.asOf, deliveryAllowed: false });
  const { profile, cohort } = source;
  if (!profile || profile.status !== 'active' || ['admin', 'staff'].includes(profile.role)) return exclude('inactive_member');
  if (!cohort || !source.course || source.course.archived_at || cohort.status === 'cancelled') return exclude('unavailable_course');
  if (source.analysisEligible !== true) return exclude('analysis_not_current');
  const stamp = (x: string | null) => !!x && Number.isFinite(Date.parse(x)) && Date.parse(x) <= at;
  // AI-selected CRM review only. Existing service-care notices retain their separate rules.
  if (!stamp(profile.marketing_use_consent_at) || !stamp(command.channel === 'email' ? profile.ad_email_consent_at : profile.ad_kakao_consent_at)) return exclude('marketing_channel_not_current');
  if (!Array.isArray(source.orders) || !Array.isArray(source.enrollments) || source.orders.length > 100 || source.enrollments.length > 1 || source.orderCount !== source.orders.length || source.enrollmentCount !== source.enrollments.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const orders = source.orders as Order[], enrollments = source.enrollments as Enrollment[];
  if (orders.some(o => !uuid(o.id) || !Array.isArray(o.order_items) || o.order_items.length !== 1
    || o.order_items.some(i => !uuid(i.id) || i.course_id !== command.courseId || i.cohort_id !== command.cohortId))) throw new Error('TIPS_REVIEW_INCOMPLETE');
  if (!Array.isArray(source.payments) || source.payments.length > 100 || source.paymentCount !== source.payments.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const payments = source.payments as Payment[];
  if (new Set(payments.map(p => p.order_id)).size !== payments.length || payments.some(p => !orders.some(o => o.id === p.order_id)
    || !Number.isSafeInteger(p.approved_amount) || !Number.isSafeInteger(p.cancelled_amount) || p.cancelled_amount < 0
    || p.approved_amount < p.cancelled_amount)) throw new Error('TIPS_REVIEW_INCOMPLETE');
  // An exact page cap is inconclusive, never proof that no records were omitted.
  if (!Array.isArray(source.refunds) || source.refunds.length >= 1000 || source.refundCount !== source.refunds.length) throw new Error('TIPS_REVIEW_INCOMPLETE');
  const refunded = new Map<string, number>();
  for (const r of source.refunds) {
    if (!payments.some(p => p.id === r.payment_id) || !Number.isSafeInteger(r.amount) || r.amount <= 0) throw new Error('TIPS_REVIEW_INCOMPLETE');
    const total = (refunded.get(r.payment_id) || 0) + r.amount;
    if (!Number.isSafeInteger(total) || total > payments.find(p => p.id === r.payment_id)!.approved_amount) throw new Error('TIPS_REVIEW_INCOMPLETE');
    refunded.set(r.payment_id, total);
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
