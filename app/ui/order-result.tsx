"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { ArrowRight, Check, CircleAlert } from "lucide-react";
import { matchingOrder } from "@/lib/platform-rules";
import { money, labels, type Row } from "@/lib/platform";
import "./order-result.css";

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
  const [onboardingOrderId, setOnboardingOrderId] = useState<string | null>(null);
  const [onboardingErrorOrderId, setOnboardingErrorOrderId] = useState<string | null>(null);
  const [onboardingCheckedOrderId, setOnboardingCheckedOrderId] = useState<string | null>(null);
  const [onboardingRetry, setOnboardingRetry] = useState(0);
  const order = matchingOrder(data.orders || [], orderId);
  const paidOrderId = order?.status === "paid" && typeof order.id === "string" ? order.id : null;
  const failed = path === "/payment/fail";
  const complete = !failed && (state === "paid" || order?.status === "paid");
  const onboardingReady = complete && !!paidOrderId && onboardingOrderId === paidOrderId;
  const onboardingFailed = complete && !!paidOrderId && onboardingErrorOrderId === paidOrderId;
  const onboardingLoading = complete && !!paidOrderId && onboardingCheckedOrderId !== paidOrderId;
  const showClassFallback = complete && !onboardingReady && !onboardingFailed && !onboardingLoading;

  useEffect(() => {
    if (!complete || !paidOrderId) return;
    const controller = new AbortController();
    void fetch(`/api/purchase-onboarding?order=${encodeURIComponent(paidOrderId)}`, { cache: 'no-store', signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted) return;
        setOnboardingOrderId(response.ok ? paidOrderId : null);
        setOnboardingErrorOrderId(!response.ok && response.status !== 404 ? paidOrderId : null);
        setOnboardingCheckedOrderId(paidOrderId);
      })
      .catch(() => { if (!controller.signal.aborted) { setOnboardingOrderId(null); setOnboardingErrorOrderId(paidOrderId); setOnboardingCheckedOrderId(paidOrderId); } });
    return () => controller.abort();
  }, [complete, paidOrderId, onboardingRetry]);

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
  const statusLabel = complete
    ? order?.total_amount === 0
      ? "신청 완료"
      : "결제 완료"
    : state === "waiting"
      ? "입금 대기"
      : state === "checking"
        ? "확인 중"
        : "확인 필요";
  const firstStepLabel = complete
    ? "1단계 · 완료"
    : state === "waiting"
      ? "1단계 · 입금 대기"
      : "1단계 · 진행 중";

  return (
    <div className="form-page order-complete-page">
      <div className="wrap order-complete-shell">
        <header className="order-complete-intro">
          <span>BrandyAction EDU</span>
          <h1>{complete ? "클래스 시작 준비" : "신청 상태 확인"}</h1>
          <p>{complete ? "결제 확인부터 첫 학습까지 순서대로 안내해 드릴게요." : "주문 상태를 확인한 뒤 다음 단계로 안내해 드릴게요."}</p>
        </header>
        <ol className="order-complete-steps" aria-label="클래스 시작 단계">
          <li className={complete ? "complete" : "active"} aria-current={complete ? undefined : "step"}>
            <span>{firstStepLabel}</span>
            <strong>{state === "waiting" ? "입금 확인" : "결제 확인"}</strong>
          </li>
          <li className={complete ? "active" : ""} aria-current={complete ? "step" : undefined}>
            <span>2단계{complete ? " · 다음" : ""}</span>
            <strong>공지방 입장</strong>
          </li>
          <li>
            <span>3단계</span>
            <strong>첫 학습 시작</strong>
          </li>
        </ol>
        <section className={"completion order-complete-card " + (complete ? "is-complete" : "needs-attention")}>
          <div className="order-complete-summary">
            <div className={"success-icon " + (complete ? "" : "fail")} aria-hidden="true">
              {complete ? <Check /> : <CircleAlert />}
            </div>
            <div>
              <span className="order-complete-status">{statusLabel}</span>
              <h2>{title}</h2>
              <p className="lead" role={state === "error" ? "alert" : "status"}>
            {state === "error"
              ? error
              : state === "waiting"
                ? "입금이 확인되면 수강권이 자동으로 제공됩니다."
                : failed
                ? params.get("message") ||
                  "신청 내역을 확인하고 다시 진행해 주세요."
                : complete
                  ? showClassFallback
                    ? "내 클래스에서 신청한 클래스와 자료를 확인해 주세요."
                    : "아래 버튼을 눌러 교육 시작 안내를 확인해 주세요."
                  : "확인된 주문에 한해 수강권이 제공됩니다."}
              </p>
            </div>
          </div>
          {order && (
            <dl className="info-lines order-complete-details">
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
            <dl className="info-lines order-complete-details order-complete-account">
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
          {complete && <div className="order-complete-next-copy">
            <span>다음 · 2단계</span>
            <h3>{onboardingReady ? "교육 시작 안내를 확인하세요" : "내 클래스에서 바로 시작하세요"}</h3>
            <p>{onboardingReady ? "공지방 입장 방법과 이어지는 학습 순서를 한 번에 확인할 수 있어요." : "신청한 클래스와 제공 자료를 내 클래스에서 확인할 수 있어요."}</p>
          </div>}
          <div className="grid2 mt24 order-complete-actions" style={complete ? { gridTemplateColumns: "1fr" } : undefined}>
            {onboardingReady && paidOrderId && (
              <Link className="btn primary" href={`/purchase-onboarding?order=${encodeURIComponent(paidOrderId)}`}>
                결제 후 시작 안내 <ArrowRight />
              </Link>
            )}
            {onboardingLoading && (
              <button className="btn primary" type="button" disabled aria-busy="true">
                시작 안내 확인 중
              </button>
            )}
            {onboardingFailed && !onboardingLoading && (
              <button className="btn primary" type="button" onClick={() => { setOnboardingErrorOrderId(null); setOnboardingCheckedOrderId(null); setOnboardingRetry(value => value + 1); }}>
                시작 안내 다시 확인
              </button>
            )}
            {state === "error" && paymentKey && (
              <button className="btn" onClick={() => void confirm()}>
                결제 결과 다시 확인
              </button>
            )}
            {(!complete || showClassFallback) && <Link
              className="btn primary"
              href={complete ? "/my/classes" : "/my/orders"}
            >
              {complete ? "내 클래스 보기" : "신청 내역 확인"}
              <ArrowRight />
            </Link>}
            {!complete && <Link className="btn" href="/classes">
              클래스 둘러보기
            </Link>}
          </div>
          {onboardingFailed && !onboardingLoading && <p className="form-error" role="alert">시작 안내를 불러오지 못했습니다. 위 버튼을 눌러 다시 확인해 주세요.</p>}
        </section>
      </div>
    </div>
  );
}
