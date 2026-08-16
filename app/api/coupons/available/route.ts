import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";

type CouponProduct = { course_id: string };
type CouponRecord = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  usage_limit: number | null;
  product_scope: "all" | "specific";
  discount_type: "fixed" | "percentage";
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  coupon_products: CouponProduct[];
};
type OwnedCoupon = {
  id: string;
  expires_at: string | null;
  coupons: CouponRecord | CouponRecord[];
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const courseId = request.nextUrl.searchParams.get("courseId");
  const cohortId = request.nextUrl.searchParams.get("cohortId");
  if (!courseId || !cohortId) return NextResponse.json({ error: "상품과 기수를 확인해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: cohort }, { data: wallets, error }] = await Promise.all([
    admin.from("cohorts").select("id,course_id,price,status").eq("id", cohortId).eq("course_id", courseId).maybeSingle(),
    admin.from("customer_coupons").select("id,expires_at,coupons(id,name,description,code,usage_limit,product_scope,discount_type,discount_value,starts_at,ends_at,is_active,coupon_products(course_id))").eq("user_id", user.id).eq("status", "available").order("issued_at", { ascending: false }),
  ]);

  if (error) return NextResponse.json({ error: "보유 쿠폰을 불러오지 못했습니다." }, { status: 500 });
  if (!cohort || cohort.status !== "recruiting") return NextResponse.json({ coupons: [] });

  const now = Date.now();
  const candidates = (wallets || []).filter((wallet) => {
    const row = wallet as unknown as OwnedCoupon;
    const coupon = one(row.coupons);
    if (!coupon?.is_active) return false;
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return false;
    if (coupon.ends_at && new Date(coupon.ends_at).getTime() <= now) return false;
    return coupon.product_scope === "all" || (coupon.coupon_products || []).some((item) => item.course_id === courseId);
  });

  const couponIds = candidates.map((wallet) => one((wallet as unknown as OwnedCoupon).coupons)?.id).filter(Boolean) as string[];
  const usage = new Map<string, number>();
  if (couponIds.length) {
    const { data: redemptions } = await admin.from("coupon_redemptions").select("coupon_id,status,orders(status,expires_at)").in("coupon_id", couponIds);
    for (const redemption of redemptions || []) {
      const order = one(redemption.orders as { status: string; expires_at: string | null } | Array<{ status: string; expires_at: string | null }> | null);
      const counted = redemption.status === "used" || (redemption.status === "reserved" && order?.status === "pending" && (!order.expires_at || new Date(order.expires_at).getTime() > now));
      if (counted) usage.set(redemption.coupon_id, (usage.get(redemption.coupon_id) || 0) + 1);
    }
  }

  const coupons = candidates.flatMap((wallet) => {
    const row = wallet as unknown as OwnedCoupon;
    const coupon = one(row.coupons);
    if (!coupon || (coupon.usage_limit && (usage.get(coupon.id) || 0) >= coupon.usage_limit)) return [];
    const discountAmount = coupon.discount_type === "fixed"
      ? Math.min(coupon.discount_value, cohort.price)
      : Math.min(Math.floor(cohort.price * coupon.discount_value / 100), cohort.price);
    const expiresAt = [row.expires_at, coupon.ends_at].filter(Boolean).sort()[0] || null;
    return [{
      walletId: row.id,
      id: coupon.id,
      name: coupon.name,
      description: coupon.description,
      code: coupon.code,
      discountAmount,
      totalAmount: cohort.price - discountAmount,
      expiresAt,
    }];
  });

  return NextResponse.json({ coupons });
}
