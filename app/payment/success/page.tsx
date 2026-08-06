"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

function PaymentSuccessContent() {
  const params = useSearchParams();
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = Number(params.get("amount"));
  const invalid = !paymentKey || !orderId || !Number.isInteger(amount);
  const started = useRef(false);
  const [error, setError] = useState(invalid ? "결제 승인 정보가 올바르지 않습니다." : "");
  useEffect(() => {
    if (started.current || invalid) return;
    started.current = true;
    fetch("/api/payments/toss/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    }).then(async (response) => {
      const result = await response.json() as { error?: string; orderNumber?: string };
      if (!response.ok) throw new Error(result.error || "결제 승인을 완료하지 못했습니다.");
      window.location.replace(`/order-complete?orderId=${encodeURIComponent(result.orderNumber || orderId)}`);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "결제 승인 중 오류가 발생했습니다."));
  }, [amount, invalid, orderId, paymentKey]);
  return <main className="payment-result-page"><section><ShieldCheck/><h1>{error ? "결제 확인이 필요합니다" : "결제를 안전하게 확인하고 있습니다"}</h1>{error ? <><p>{error}</p><p>이미 결제가 진행됐다면 다시 결제하지 말고 고객센터에 문의해 주세요.</p><Link className="button button-dark" href="/my/orders">내 주문 확인</Link></> : <><LoaderCircle className="spin"/><p>창을 닫지 말고 잠시만 기다려 주세요.</p></>}</section></main>;
}

export default function PaymentSuccessPage() {
  return <Suspense fallback={<main className="payment-result-page"><section><LoaderCircle className="spin"/><p>결제 정보를 확인하고 있습니다.</p></section></main>}><PaymentSuccessContent/></Suspense>;
}
