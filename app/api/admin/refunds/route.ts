import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { cancelTossPayment, TossApiError } from "@/lib/toss";

export async function POST(request: Request) {
  const adminUser = await getAdminUser("orders");
  if (!adminUser) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const body = await request.json().catch(() => null) as { orderNumber?: string; amount?: number; reason?: string; requestId?: string; refundReceiveAccount?: { bank?: string; accountNumber?: string; holderName?: string } } | null;
  if (!body?.orderNumber || !body.reason?.trim() || !body.requestId || !/^[0-9a-f-]{36}$/i.test(body.requestId)) return NextResponse.json({ error: "주문번호와 환불 요청 정보를 확인해 주세요." }, { status: 400 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id,order_number,total_amount,status,payments(provider_payment_key,method,approved_amount,cancelled_amount)")
    .eq("order_number", body.orderNumber)
    .maybeSingle();
  const payments = order?.payments as Array<{ provider_payment_key: string | null; method: string | null; approved_amount: number; cancelled_amount: number }> | null;
  const payment = payments?.[0];
  if (!order || !payment?.provider_payment_key || !["paid", "partially_refunded"].includes(order.status)) {
    return NextResponse.json({ error: "환불 가능한 결제를 찾을 수 없습니다." }, { status: 404 });
  }
  const remaining = payment.approved_amount - payment.cancelled_amount;
  const amount = body.amount === undefined ? remaining : body.amount;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) return NextResponse.json({ error: "환불 금액을 확인해 주세요." }, { status: 400 });
  const isVirtualAccount = payment.method === "가상계좌";
  const account = body.refundReceiveAccount;
  if (isVirtualAccount && (!account?.bank?.trim() || !account.accountNumber?.trim() || !account.holderName?.trim())) {
    return NextResponse.json({ error: "가상계좌 환불은 환불받을 은행 코드·계좌번호·예금주가 필요합니다." }, { status: 400 });
  }

  try {
    const cancelled = await cancelTossPayment(
      payment.provider_payment_key,
      order.order_number,
      body.reason.trim(),
      amount === remaining ? undefined : amount,
      isVirtualAccount && account ? { bank: account.bank!.trim(), accountNumber: account.accountNumber!.replace(/[^0-9]/g, ""), holderName: account.holderName!.trim() } : undefined,
      body.requestId,
    );
    const latest = cancelled.cancels?.[cancelled.cancels.length - 1];
    const refundKey = latest?.transactionKey || `toss-${order.order_number}-${Date.now()}`;
    const { error } = await admin.rpc("finalize_toss_refund", {
      p_order_number: order.order_number,
      p_amount: amount,
      p_reason: body.reason.trim(),
      p_refund_key: refundKey,
      p_payload: cancelled,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, status: amount === remaining ? "refunded" : "partially_refunded" });
  } catch (error) {
    if (error instanceof TossApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status >= 500 ? 502 : 400 });
    console.error("admin-refund-error", error);
    return NextResponse.json({ error: "환불 처리 후 내부 반영에 실패했습니다. 결제사 관리자에서 상태를 확인해 주세요." }, { status: 500 });
  }
}
