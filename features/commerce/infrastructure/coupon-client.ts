import { isCouponQuote, type CouponQuote } from "../domain/coupon";

export async function requestCouponQuote(cohortId: string, code: string): Promise<CouponQuote> {
  const response = await fetch("/api/coupons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cohortId, code }),
  });
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
      ? String((body as Record<string, unknown>).error)
      : "쿠폰을 확인하지 못했습니다. 다시 시도해 주세요.";
    throw new Error(message);
  }
  if (!isCouponQuote(body)) throw new Error("쿠폰 할인 정보를 확인하지 못했습니다.");
  return body;
}
