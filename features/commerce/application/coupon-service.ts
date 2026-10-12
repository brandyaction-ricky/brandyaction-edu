import { couponError, couponHistoryViews, type CouponHistoryView } from "@/lib/coupon-rules";
import {
  COUPON_CODE_MAX_LENGTH,
  isUuid,
  normalizeCouponCode,
  type CouponActor,
} from "../domain/coupon";

type RepositoryError = { message: string };
type RepositoryResult<T> = {
  data: T | null;
  error: RepositoryError | null;
  count?: number | null;
};

export type CouponRepository = {
  getHistory: (couponId: string, page: number, view: CouponHistoryView) => Promise<RepositoryResult<unknown[]>>;
  getHistoryCounts: (couponId: string) => Promise<Record<CouponHistoryView, number>>;
  quote: (userId: string, cohortId: string, code: string) => Promise<RepositoryResult<unknown>>;
  cancelZeroOrder: (actorId: string, orderId: string) => Promise<RepositoryResult<unknown>>;
};

export class CouponApplicationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function createCouponService(repository: CouponRepository) {
  return {
    async getHistory(actor: CouponActor, couponId: unknown, requestedPage: unknown, requestedView: unknown = null) {
      if (actor.role !== "admin") throw new CouponApplicationError("관리자 권한이 필요합니다.", 403);
      if (!isUuid(couponId)) throw new CouponApplicationError("쿠폰을 확인해 주세요.", 400);
      const view = requestedView == null ? 'usage' : requestedView;
      if (!couponHistoryViews.includes(view as CouponHistoryView)) throw new CouponApplicationError("내역 보기를 확인해 주세요.", 400);
      const page = Math.max(1, Math.min(100000, Math.floor(Number(requestedPage) || 1)));
      const [result, counts] = await Promise.all([repository.getHistory(couponId, page, view as CouponHistoryView), repository.getHistoryCounts(couponId)]);
      if (result.error) throw result.error;
      return { rows: result.data ?? [], count: result.count ?? 0, page, view, counts };
    },

    async register(actor: CouponActor, input: unknown) {
      const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const code = normalizeCouponCode(body.code);
      if (body.couponId || !isUuid(body.cohortId) || !code || code.length > COUPON_CODE_MAX_LENGTH) {
        throw new CouponApplicationError("쿠폰 코드와 기수를 확인해 주세요.", 400);
      }
      const result = await repository.quote(actor.id, body.cohortId, code);
      if (result.error) throw new CouponApplicationError(couponError(result.error.message), 409);
      return result.data;
    },

    async cancelZeroOrder(actor: CouponActor, orderId: unknown) {
      if (actor.role !== "admin") throw new CouponApplicationError("관리자 권한이 필요합니다.", 403);
      if (!isUuid(orderId)) throw new CouponApplicationError("주문을 확인해 주세요.", 400);
      const result = await repository.cancelZeroOrder(actor.id, orderId);
      if (result.error) throw new CouponApplicationError("0원 완료 주문만 취소할 수 있습니다.", 409);
      return { ok: true };
    },
  };
}
