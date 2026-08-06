import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { confirmTossPayment, TossApiError } from "@/lib/toss";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { paymentKey?: string; orderId?: string; amount?: number } | null;
  if (!body?.paymentKey || !body.orderId || !Number.isInteger(body.amount) || Number(body.amount) < 0) {
    return NextResponse.json({ error: "결제 승인 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const amount = Number(body.amount);

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id,order_number,user_id,status,total_amount")
    .eq("order_number", body.orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.total_amount !== amount) return NextResponse.json({ error: "결제 금액이 주문 금액과 다릅니다." }, { status: 400 });
  if (order.status === "paid") return NextResponse.json({ status: "paid", orderNumber: order.order_number });

  try {
    const payment = await confirmTossPayment(body.paymentKey, body.orderId, amount);
    if (payment.orderId !== order.order_number || payment.totalAmount !== order.total_amount) {
      return NextResponse.json({ error: "결제사 응답과 주문 정보가 일치하지 않습니다." }, { status: 400 });
    }

    if (payment.status === "DONE") {
      const { error } = await admin.rpc("finalize_toss_payment", {
        p_order_number: order.order_number,
        p_payment_key: payment.paymentKey,
        p_method: payment.method || "UNKNOWN",
        p_approved_amount: payment.totalAmount,
        p_receipt_url: payment.receipt?.url || null,
        p_payload: payment,
        p_approved_at: payment.approvedAt || new Date().toISOString(),
      });
      if (error) throw new Error(`수강권 발급 실패: ${error.message}`);
      return NextResponse.json({ status: "paid", orderNumber: order.order_number });
    }

    if (payment.status === "WAITING_FOR_DEPOSIT") {
      const { error } = await admin.rpc("record_toss_waiting_payment", {
        p_order_number: order.order_number,
        p_payment_key: payment.paymentKey,
        p_method: payment.method || "가상계좌",
        p_amount: payment.totalAmount,
        p_receipt_url: payment.receipt?.url || null,
        p_payload: payment,
        p_expires_at: payment.virtualAccount?.dueDate || null,
      });
      if (error) throw new Error(`가상계좌 기록 실패: ${error.message}`);
      return NextResponse.json({ status: "waiting", orderNumber: order.order_number, virtualAccount: payment.virtualAccount || null });
    }

    return NextResponse.json({ error: `처리할 수 없는 결제 상태입니다. (${payment.status})` }, { status: 409 });
  } catch (error) {
    if (error instanceof TossApiError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status >= 500 ? 502 : 400 });
    }
    console.error("payment-confirm-error", error);
    return NextResponse.json({ error: "결제 승인 후 처리에 실패했습니다. 결제를 다시 시도하지 말고 고객센터에 문의해 주세요." }, { status: 500 });
  }
}
