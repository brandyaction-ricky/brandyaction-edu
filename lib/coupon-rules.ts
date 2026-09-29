import type { Row } from './platform';

export function couponStatus(row: Row, now = Date.now()) {
  if (row.is_draft) return 'draft';
  if (!row.is_active) return 'inactive';
  if ([row.issue_end_at, row.ends_at].some(value => value && Date.parse(String(value)) <= now)) return 'expired';
  if (row.issue_start_at && Date.parse(String(row.issue_start_at)) > now) return 'upcoming';
  return 'active';
}

export function couponKstInput(value: unknown) {
  if (!value) return '';
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 16) : '';
}

export function couponKstUtc(value: FormDataEntryValue | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) throw new Error('날짜를 확인해 주세요.');
  return new Date(`${value}:00+09:00`).toISOString();
}

export function couponError(message: string) {
  const errors: Record<string, string> = {
    COUPON_NOT_FOUND: '사용할 수 없는 쿠폰입니다.', COUPON_ADMIN_ONLY: '관리자만 사용할 수 있는 쿠폰입니다.',
    COUPON_INACTIVE: '비활성 또는 임시 저장 쿠폰입니다.', COUPON_NOT_STARTED: '쿠폰 사용 시작 전입니다.',
    COUPON_EXPIRED: '쿠폰 사용 기간이 종료됐습니다.', COUPON_ISSUE_PERIOD: '쿠폰 발급 기간이 아닙니다.',
    COUPON_MINIMUM_NOT_MET: '최소 주문 금액을 충족하지 못했습니다.', COUPON_FREE_PRODUCT_EXCLUDED: '무료 상품에는 적용할 수 없습니다.',
    COUPON_PRODUCT_MISMATCH: '이 상품에는 사용할 수 없는 쿠폰입니다.', COUPON_MEMBER_NOT_ELIGIBLE: '발급 대상 회원이 아닙니다.',
    COUPON_SOLD_OUT: '쿠폰 수량이 모두 사용됐습니다.', COUPON_USER_LIMIT: '회원별 사용 횟수를 초과했습니다.',
    COUPON_REVOKED: '회수되거나 만료된 쿠폰입니다.', COUPON_INVALID: '쿠폰 금액·기간·상품·상태를 확인해 주세요.',
    ADMIN_REQUIRED: '관리자 권한이 필요합니다.', PAYMENT_ALREADY_PENDING: '입금 대기 중인 주문은 변경할 수 없습니다.',
  };
  return Object.entries(errors).find(([code]) => message.includes(code))?.[1] || '쿠폰을 처리하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.';
}
