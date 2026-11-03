"use client";

import { useEffect, useRef, useState } from "react";
import type { loadTossPayments } from "@tosspayments/tosspayments-sdk";

type Widgets = ReturnType<Awaited<ReturnType<typeof loadTossPayments>>["widgets"]>;
type PaymentUI = Awaited<ReturnType<Widgets["renderPaymentMethods"]>>;
type AgreementUI = Awaited<ReturnType<Widgets["renderAgreement"]>>;

export function useTossCheckoutWidget(enabled: boolean, customerKey: string, amount: number) {
  const widget = useRef<Widgets | null>(null);
  const initialAmount = useRef(amount);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [updatedAmount, setUpdatedAmount] = useState<number | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!enabled || !customerKey) return;
    let cancelled = false;
    let paymentUI: PaymentUI | undefined;
    let agreementUI: AgreementUI | undefined;
    const dispose = async () => {
      const payment = paymentUI;
      const agreement = agreementUI;
      paymentUI = undefined;
      agreementUI = undefined;
      await Promise.allSettled([payment?.destroy(), agreement?.destroy()]);
    };
    const start = async () => {
      try {
        setReady(false);
        setUpdatedAmount(null);
        setError("");
        const key = process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY;
        if (!key) throw new Error("결제 서비스를 준비하고 있습니다.");
        const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
        const toss = await loadTossPayments(key);
        if (cancelled) return;
        const instance = toss.widgets({ customerKey });
        await instance.setAmount({ currency: "KRW", value: initialAmount.current });
        if (cancelled) return;
        paymentUI = await instance.renderPaymentMethods({ selector: "#toss-payment-methods", variantKey: "EDU" });
        if (cancelled) { await dispose(); return; }
        agreementUI = await instance.renderAgreement({ selector: "#toss-payment-agreement" });
        if (cancelled) { await dispose(); return; }
        widget.current = instance;
        setUpdatedAmount(initialAmount.current);
        setReady(true);
      } catch {
        void dispose();
        if (!cancelled) setError("결제 수단을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      }
    };
    void start();
    return () => {
      cancelled = true;
      widget.current = null;
      void dispose();
    };
  }, [enabled, customerKey]);

  useEffect(() => {
    if (!ready || !widget.current) return;
    let active = true;
    const current = widget.current;
    setUpdatedAmount(null);
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (!active) return;
      await current.setAmount({ currency: "KRW", value: amount });
      if (active) setUpdatedAmount(amount);
    }).catch(() => {
      if (active) setError("결제 금액을 갱신하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
    });
    return () => { active = false; };
  }, [amount, ready]);

  return { widget, ready: enabled && ready && updatedAmount === amount && !error, error };
}
