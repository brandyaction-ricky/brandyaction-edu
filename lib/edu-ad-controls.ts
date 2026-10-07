import { kstDay } from './edu-export-contract';

export type FreezeReason = 'cpr_high' | 'mer_provisional_low' | 'refund_requests_high' | 'input_missing' | 'manual';
export type AdControl = {
  freeze: boolean; freeze_source: 'auto' | 'manual'; freeze_reasons: FreezeReason[];
  override_until: string | null; cohort_code: string | null; cohort_budget_krw: number | null;
};
export type AdPolicy = {
  cohort_id: string; enabled: boolean; budget_krw: number; ads_start: string; ads_end: string; sales_end: string;
  mode: 'auto' | 'freeze' | 'release'; reason: string; override_until: string | null;
  revision: number; updated_at: string;
};
export type AdEvidence = {
  date_kst: string; cohort_id: string; cohort_code: string; policy: AdPolicy;
  spend_krw: number | null; cpr_today: number | null; cpr_previous: number | null;
  net_krw: number | null; reserve_krw: number | null; refund_requests: number | null;
};
export const freezeLabels: Record<FreezeReason, string> = {
  cpr_high: '카톡방 입장 비용이 이틀 연속 4,500원을 넘었어요.',
  mer_provisional_low: '환불 예상액을 뺀 기수 전체 매출이 광고비의 5배 미만이에요.',
  refund_requests_high: '오늘 환불 요청이 5건 이상이에요.',
  input_missing: '판단에 필요한 값이나 기수 설정이 없어요.',
  manual: '대표가 직접 증액을 막았어요.',
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const amount = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const signedAmount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
export const missingControl = (): AdControl => ({ freeze: true, freeze_source: 'auto', freeze_reasons: ['input_missing'],
  override_until: null, cohort_code: null, cohort_budget_krw: null });

/** Evaluate at the contract's day-end cutoff. A future override cannot rewrite an old day. */
export function evaluateAdControl(evidence: AdEvidence, at: Date): AdControl {
  const p = evidence.policy, day = kstDay(at);
  const base = { cohort_code: evidence.cohort_code || null, cohort_budget_krw: amount(p.budget_krw) && p.budget_krw > 0 ? p.budget_krw : null };
  const reasons: FreezeReason[] = [];
  if (!p.enabled || !base.cohort_code || !base.cohort_budget_krw || day < p.ads_start || evidence.date_kst !== day) reasons.push('input_missing');
  else if (day <= p.sales_end) {
    if (!finite(evidence.cpr_today) || !finite(evidence.cpr_previous)) reasons.push('input_missing');
    else if (evidence.cpr_today > 4500 && evidence.cpr_previous > 4500) reasons.push('cpr_high');
  } else {
    if (!signedAmount(evidence.net_krw) || !amount(evidence.reserve_krw) || !finite(evidence.spend_krw) || evidence.spend_krw <= 0) {
      reasons.push('input_missing');
      // Even before a reserve is known, a net upper bound below 5x proves provisional ROAS is low.
      if (signedAmount(evidence.net_krw) && finite(evidence.spend_krw) && evidence.spend_krw > 0 && evidence.net_krw < evidence.spend_krw * 5) reasons.push('mer_provisional_low');
    }
    else if (evidence.net_krw - evidence.reserve_krw < evidence.spend_krw * 5) reasons.push('mer_provisional_low');
    if (!amount(evidence.refund_requests)) { if (!reasons.includes('input_missing')) reasons.push('input_missing'); }
    else if (evidence.refund_requests >= 5) reasons.push('refund_requests_high');
  }
  const updated = Date.parse(p.updated_at), until = Date.parse(p.override_until || '');
  const manual = p.enabled && base.cohort_code && base.cohort_budget_krw && day >= p.ads_start &&
    p.mode !== 'auto' && p.reason.trim() && updated <= at.getTime() && until > at.getTime() &&
    until <= updated + 72 * 3600_000;
  if (manual) return { ...base, freeze: p.mode === 'freeze', freeze_source: 'manual',
    freeze_reasons: p.mode === 'freeze' ? [...reasons, 'manual'] : reasons,
    override_until: new Date(until).toISOString() };
  return { ...base, freeze: reasons.length > 0, freeze_source: 'auto', freeze_reasons: reasons, override_until: null };
}

/** ops_daily has one control slot. Ambiguous concurrent cohorts never select a winner silently. */
export function exportedAdControl(evidence: AdEvidence[], day: string, now: Date): AdControl {
  const at = new Date(Math.min(now.getTime(), Date.parse(day + 'T23:59:59.999+09:00')));
  const active = evidence.filter(e => e.date_kst === day && e.policy.enabled && e.policy.ads_start <= day);
  return active.length === 1 ? evaluateAdControl(active[0], at) : missingControl();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateAdPolicy(raw: unknown) {
  const p = raw as Record<string, unknown>;
  if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.cohort_id !== 'string' || !uuid.test(p.cohort_id) ||
    !amount(p.revision) || !amount(p.budget_krw) || p.budget_krw <= 0 || p.budget_krw > 1_000_000_000 ||
    typeof p.enabled !== 'boolean' || !['auto', 'freeze', 'release'].includes(String(p.mode)) ||
    typeof p.reason !== 'string' || p.reason.trim().length < 3 || p.reason.trim().length > 500 ||
    ![p.ads_start, p.ads_end, p.sales_end].every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d) ||
    String(p.ads_start) > String(p.ads_end) || String(p.ads_end) > String(p.sales_end) ||
    Date.parse(String(p.sales_end)) - Date.parse(String(p.ads_start)) > 180 * 86400_000 ||
    typeof p.hours !== 'number' || !Number.isInteger(p.hours) || p.hours < 1 || p.hours > 72) throw Error('입력한 기수·예산·날짜·사유·기한을 확인해 주세요.');
  return { cohort_id: p.cohort_id, revision: p.revision, budget_krw: p.budget_krw, enabled: p.enabled,
    ads_start: p.ads_start as string, ads_end: p.ads_end as string, sales_end: p.sales_end as string,
    mode: p.mode as AdPolicy['mode'], reason: p.reason.trim(), hours: p.hours };
}

/** Server-only allowlist: an ordinary admin role never implies representative approval authority. */
export function isAdControlApprover(userId: string, configured: string | undefined) {
  return !!configured?.split(',').map(s => s.trim()).filter(s => uuid.test(s)).includes(userId);
}
