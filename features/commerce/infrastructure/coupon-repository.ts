import { createAdminClient } from "@/lib/supabase/admin";
import type { CouponRepository } from "../application/coupon-service";

export function createCouponRepository(): CouponRepository {
  const db = createAdminClient();
  return {
    async getHistory(couponId, page) {
      const result = await db
        .from("coupon_redemptions")
        .select(
          "id,order_id,status,original_amount,discount_amount,final_amount,used_at,cancelled_at,created_at,profiles(full_name),orders(order_number,status,total_amount,order_items(item_name,unit_price,quantity))",
          { count: "exact" },
        )
        .eq("coupon_id", couponId)
        .order("created_at", { ascending: false })
        .order("id")
        .range((page - 1) * 30, page * 30 - 1);
      return result as unknown as Awaited<ReturnType<CouponRepository["getHistory"]>>;
    },
    async quote(userId, cohortId, code) {
      const result = await db.rpc("edu_coupon_quote", {
        p_user: userId,
        p_cohort: cohortId,
        p_code: code,
      });
      return result as unknown as Awaited<ReturnType<CouponRepository["quote"]>>;
    },
    async cancelZeroOrder(actorId, orderId) {
      const result = await db.rpc("edu_cancel_zero_order", {
        p_actor: actorId,
        p_order: orderId,
      });
      return result as unknown as Awaited<ReturnType<CouponRepository["cancelZeroOrder"]>>;
    },
  };
}
