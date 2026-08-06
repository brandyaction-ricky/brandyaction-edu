import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Clock3 } from "lucide-react";
import { BrandHeader } from "../components/brand-header";
import { createClient } from "@/lib/supabase/server";
import { formatKoreanDate } from "@/lib/checkout-data";

export const dynamic = "force-dynamic";

type ItemRelation = {
  item_name: string;
  cohorts:
    | { operation_start_at: string | null }
    | Array<{ operation_start_at: string | null }>
    | null;
};

export default async function OrderComplete({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId) redirect("/my/orders");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user)
    redirect(
      `/login?next=${encodeURIComponent(`/order-complete?orderId=${orderId}`)}`,
    );
  const { data: order } = await supabase
    .from("orders")
    .select(
      "order_number,status,total_amount,created_at,order_items(item_name,cohorts(operation_start_at)),payments(method,status,receipt_url,provider_payload)",
    )
    .eq("order_number", orderId)
    .eq("user_id", user.user.id)
    .maybeSingle();
  if (!order) redirect("/my/orders");
  const items = order.order_items as unknown as ItemRelation[];
  const item = items?.[0];
  const cohortRelation = item?.cohorts;
  const cohort = Array.isArray(cohortRelation)
    ? cohortRelation[0]
    : cohortRelation;
  const payment = Array.isArray(order.payments)
    ? order.payments[0]
    : order.payments;
  const waiting =
    order.status === "pending" && payment?.status === "in_progress";
  if (order.status !== "paid" && !waiting)
    redirect("/my/orders?notice=payment_incomplete");

  return (
    <main>
      <BrandHeader />
      <section className="complete-screen">
        <div className="complete-check">
          <Check />
        </div>
        <span>
          {waiting ? "가상계좌가 발급되었습니다" : "신청이 완료되었습니다"}
        </span>
        <h1>
          {waiting
            ? "입금이 확인되면\n수강권이 열립니다."
            : "이제 실행할 준비를\n시작해 볼까요?"}
        </h1>
        <p>
          {item?.item_name || "신청한 클래스"}
          <br />
          {waiting
            ? "입금 완료 후 내 클래스에 자동으로 등록됩니다."
            : "내 클래스에 자동으로 등록되었습니다."}
        </p>
        <div className="complete-card">
          <div>
            <CalendarDays />
            <span>개강일</span>
            <strong>
              {formatKoreanDate(cohort?.operation_start_at || null)}
            </strong>
          </div>
          <div>
            <span>주문번호</span>
            <strong>{order.order_number}</strong>
          </div>
          <div>
            <Clock3 />
            <span>결제 상태</span>
            <strong>{waiting ? "입금 대기" : "결제 완료"}</strong>
          </div>
        </div>
        <Link
          className="button button-primary button-lg"
          href={waiting ? "/my/orders" : "/my/cohort"}
        >
          {waiting ? "주문 내역 확인" : "내 클래스 이동"} <ArrowRight />
        </Link>
        <Link className="simple-link" href="/">
          메인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
