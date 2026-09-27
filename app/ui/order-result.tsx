"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { matchingOrder } from "@/lib/platform-rules";
import { money, labels, type Row } from "@/lib/platform";

type VirtualAccount = {
  accountNumber: string | null;
  bankCode: string | null;
  customerName: string | null;
  dueDate: string | null;
};

export function OrderResult({
  data,
  refresh,
}: {
  data: Record<string, Row[]>;
  refresh: () => Promise<void>;
}) {
  const params = useSearchParams();
  const path = usePathname();
  const orderId = params.get("orderId") || params.get("order");
  const paymentKey = params.get("paymentKey");
  const amount = params.get("amount");
  const [state, setState] = useState<"checking" | "paid" | "waiting" | "error">("checking");
  const [error, setError] = useState("");
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccount | null>(null);
  const order = matchingOrder(data.orders || [], orderId);
  const failed = path === "/payment/fail";
  const complete = !failed && (state === "paid" || order?.status === "paid");

  const confirm = useCallback(async () => {
    if (!paymentKey || !orderId || failed) return;
    setState("checking");
    try {
      const response = await fetch("/api/platform/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.status === "waiting_for_deposit") {
        setVirtualAccount(result.virtualAccount);
        setState("waiting");
        await refresh();
        return;
      }
      setState("paid");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "결제 결과를 확인하지 못했습니다.",
      );
      setState("error");
    }
  }, [paymentKey, orderId, failed, amount, refresh, setState, setError, setVirtualAccount]);

  useEffect(() => {
    const timer = setTimeout(() => void confirm(), 0);
    return () => clearTimeout(timer);
  }, [confirm]);
  const title = complete
    ? order?.total_amount === 0
      ? "무료 클래스 신청이 완료되었습니다."
      : "결제가 완료되었습니다."
    : state === "waiting"
      ? "가상계좌가 발급되었습니다."
      : failed
      ? "결제가 완료되지 않았습니다."
      : state === "error"
        ? "결제 결과를 다시 확인해 주세요."
        : paymentKey
          ? "결제 결과를 확인하고 있습니다."
          : "신청 내역을 확인해 주세요.";

  return (
    <div className="form-page">
      <div className="wrap">
        <section className="completion">
          <div className={"success-icon " + (complete ? "" : "fail")}>
            {complete ? <Check /> : <CircleAlert />}
          </div>
          <h1>{title}</h1>
          <p className="lead" role={state === "error" ? "alert" : "status"}>
            {state === "error"
              ? error
              : state === "waiting"
                ? "입금이 확인되면 수강권이 자동으로 제공됩니다."
                : failed
                ? params.get("message") ||
                  "신청 내역을 확인하고 다시 진행해 주세요."
                : complete
                  ? "마이페이지에서 신청한 클래스와 자료를 확인하세요."
                  : "확인된 주문에 한해 수강권이 제공됩니다."}
          </p>
          {order && (
            <dl className="info-lines">
              <div>
                <dt>주문 번호</dt>
                <dd>{String(order.order_number || order.id)}</dd>
              </div>
              <div>
                <dt>주문 상태</dt>
                <dd>{labels[String(order.status)] || String(order.status)}</dd>
              </div>
              <div>
                <dt>주문 금액</dt>
                <dd>{money(Number(order.total_amount || 0))}</dd>
              </div>
            </dl>
          )}
          {state === "waiting" && virtualAccount && (
            <dl className="info-lines">
              {virtualAccount.bankCode && (
                <div>
                  <dt>은행 코드</dt>
                  <dd>{virtualAccount.bankCode}</dd>
                </div>
              )}
              {virtualAccount.accountNumber && (
                <div>
                  <dt>입금 계좌</dt>
                  <dd>{virtualAccount.accountNumber}</dd>
                </div>
              )}
              {virtualAccount.customerName && (
                <div>
                  <dt>예금주</dt>
                  <dd>{virtualAccount.customerName}</dd>
                </div>
              )}
              {virtualAccount.dueDate && (
                <div>
                  <dt>입금 기한</dt>
                  <dd>{new Date(virtualAccount.dueDate).toLocaleString("ko-KR")}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="grid2 mt24">
            {state === "error" && paymentKey && (
              <button className="btn" onClick={() => void confirm()}>
                결제 결과 다시 확인
              </button>
            )}
            <Link
              className="btn primary"
              href={complete ? "/my/classes" : "/my/orders"}
            >
              {complete ? "내 클래스 보기" : "신청 내역 확인"}
              <ArrowRight />
            </Link>
            <Link className="btn" href="/classes">
              클래스 둘러보기
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
