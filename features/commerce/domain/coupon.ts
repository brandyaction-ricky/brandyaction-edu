export const COUPON_CODE_MAX_LENGTH = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CouponActor = {
  id: string;
  role?: string | null;
};

export type CouponQuote = {
  couponCode: string | null;
  couponName?: string;
  originalAmount?: number;
  couponDiscount: number;
  totalAmount: number;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeCouponCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isCouponQuote(value: unknown): value is CouponQuote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Record<string, unknown>;
  return (
    (typeof quote.couponCode === "string" || quote.couponCode === null) &&
    typeof quote.couponDiscount === "number" &&
    Number.isFinite(quote.couponDiscount) &&
    typeof quote.totalAmount === "number" &&
    Number.isFinite(quote.totalAmount)
  );
}
