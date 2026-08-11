import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTossPayment } from "@/lib/toss";

export async function POST(request: Request) {
  const configuredToken = process.env.TOSS_WEBHOOK_TOKEN || process.env.PG_WEBHOOK_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  if (!configuredToken || token !== configuredToken) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const raw = await request.text();
  let payload: { eventType?: string; createdAt?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw || "{}") as typeof payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const eventId = createHash("sha256").update(raw).digest("hex");
  const admin = createAdminClient();
  const { error: eventError } = await admin.from("payment_events").insert({
    provider: "toss",
    provider_event_id: eventId,
    event_type: payload.eventType || "UNKNOWN",
    payload,
  });
  if (eventError?.code === "23505") {
    const { data: stored } = await admin.from("payment_events").select("processing_status").eq("provider_event_id", eventId).maybeSingle();
    if (stored?.processing_status === "processed" || stored?.processing_status === "ignored") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    await admin.from("payment_events").update({ processing_status: "received", error_message: null }).eq("provider_event_id", eventId);
  } else if (eventError) {
    return NextResponse.json({ error: "event_store_failed" }, { status: 500 });
  }

  try {
    const data = payload.data || {};
    const orderNumber = String(data.orderId || "");
    let paymentKey = String(data.paymentKey || "");
    if (!paymentKey && orderNumber) {
      const { data: order } = await admin.from("orders").select("payments(provider_payment_key)").eq("order_number", orderNumber).maybeSingle();
      const payments = order?.payments as Array<{ provider_payment_key: string | null }> | null;
      paymentKey = payments?.[0]?.provider_payment_key || "";
    }
    if (!orderNumber || !paymentKey) throw new Error("웹훅 결제 식별자가 없습니다.");

    // 웹훅 본문만 신뢰하지 않고 토스 API로 결제 상태를 다시 확인한다.
    const payment = await getTossPayment(paymentKey);
    if (payment.orderId !== orderNumber) throw new Error("웹훅 주문 정보가 결제사 조회 결과와 다릅니다.");

    if (payment.status === "DONE") {
      const { error } = await admin.rpc("finalize_toss_payment", {
        p_order_number: payment.orderId,
        p_payment_key: payment.paymentKey,
        p_method: payment.method || "UNKNOWN",
        p_approved_amount: payment.totalAmount,
        p_receipt_url: payment.receipt?.url || null,
        p_payload: payment,
        p_approved_at: payment.approvedAt || new Date().toISOString(),
      });
      if (error) throw error;
    } else if (payment.status === "WAITING_FOR_DEPOSIT") {
      const { error } = await admin.rpc("record_toss_waiting_payment", {
        p_order_number: payment.orderId,
        p_payment_key: payment.paymentKey,
        p_method: payment.method || "가상계좌",
        p_amount: payment.totalAmount,
        p_receipt_url: payment.receipt?.url || null,
        p_payload: payment,
        p_expires_at: payment.virtualAccount?.dueDate || null,
      });
      if (error) throw error;
    } else {
      const cancels = payment.cancels || [];
      const cancelledTotal = cancels.reduce((sum, cancel) => sum + Number(cancel.cancelAmount || 0), 0);
      const { data: localOrder } = await admin
        .from("orders")
        .select("payments(cancelled_amount)")
        .eq("order_number", payment.orderId)
        .maybeSingle();
      const localPayments = localOrder?.payments as Array<{ cancelled_amount: number }> | null;
      const localCancelled = localPayments?.[0]?.cancelled_amount || 0;
      const delta = cancelledTotal - localCancelled;

      if (delta > 0) {
        const latest = cancels[cancels.length - 1];
        const { error } = await admin.rpc("finalize_toss_refund", {
          p_order_number: payment.orderId,
          p_amount: delta,
          p_reason: latest?.cancelReason || "결제사 취소 반영",
          p_refund_key: latest?.transactionKey || `toss-${payment.paymentKey}-${cancelledTotal}`,
          p_payload: payment,
        });
        if (error) throw error;
      } else if (["ABORTED", "EXPIRED", "CANCELED"].includes(payment.status) && cancelledTotal === 0) {
        const { error } = await admin.rpc("record_toss_terminal_payment", {
          p_order_number: payment.orderId,
          p_payment_key: payment.paymentKey,
          p_status: payment.status,
          p_payload: payment,
        });
        if (error) throw error;
      }
    }

    await admin.from("payment_events").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("provider_event_id", eventId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await admin.from("payment_events").update({ processing_status: "failed", error_message: error instanceof Error ? error.message : "unknown" }).eq("provider_event_id", eventId);
    console.error("toss-webhook-error", error);
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
