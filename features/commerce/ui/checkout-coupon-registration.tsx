"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/platform";
import { COUPON_CODE_MAX_LENGTH, normalizeCouponCode, isCouponQuote, type CouponQuote } from "../domain/coupon";
import { requestCouponQuote } from "../infrastructure/coupon-client";

type ScopedCouponQuote = CouponQuote & { scope: string };

export function useCheckoutCouponRegistration(cohortId: string, scope: string, autoEventBenefits = false) {
  const [autoSettledScope,setAutoSettledScope]=useState<string|null>(null);
  const [openScope, setOpenScope] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [registration, setRegistration] = useState<{ code: string; quote: ScopedCouponQuote } | null>(null);
  const [loadingScope, setLoadingScope] = useState<string | null>(null);
  const [noticeResult, setNoticeResult] = useState<{ scope: string; text: string } | null>(null);
  const [dialogErrorResult, setDialogErrorResult] = useState<{ scope: string; text: string } | null>(null);
  const requestSequence = useRef(0);
  const currentScope = useRef(scope);
  const autoRequest = useRef<{scope:string;promise:Promise<{quote?:CouponQuote}>}|null>(null);
  const scopedRegistration = registration?.quote.scope === scope ? registration : null;
  const appliedCode = scopedRegistration?.code ?? "";
  const quote = scopedRegistration?.quote ?? null;
  const open = openScope === scope;
  const loading = loadingScope === scope || (autoEventBenefits && autoSettledScope!==scope);
  const notice = noticeResult?.scope === scope ? noticeResult.text : "";
  const dialogError = dialogErrorResult?.scope === scope ? dialogErrorResult.text : "";

  useEffect(() => {
    currentScope.current = scope;
    requestSequence.current += 1;
  }, [scope]);

  useEffect(() => {
    if (!autoEventBenefits || !cohortId) return;
    const requestId = ++requestSequence.current;
    let active = true;
    if(autoRequest.current?.scope!==scope) autoRequest.current={scope,promise:fetch('/api/coupons', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'event-benefits',cohortId})})
      .then(async response => {if (!response.ok) throw Error('이벤트 쿠폰을 자동 확인하지 못했습니다. 쿠폰을 등록하거나 새로고침해 주세요.');return response.json();})};
    void autoRequest.current.promise
      .then(body => {if (!active || requestId!==requestSequence.current || currentScope.current!==scope) return;
        if (isCouponQuote(body.quote) && body.quote.couponCode) {
          setRegistration({code:body.quote.couponCode,quote:{...body.quote,scope}});
          setNoticeResult({scope,text:'내 계정의 이벤트 혜택을 자동으로 적용했습니다.'});
        }
      }).catch(error => {if(active && requestId===requestSequence.current)setNoticeResult({scope,text:error.message});})
      .finally(()=>{if(active && requestId===requestSequence.current)setAutoSettledScope(scope);});
    return ()=>{active=false;};
  }, [scope,cohortId,autoEventBenefits]);

  function openDialog() {
    setAutoSettledScope(scope);
    requestSequence.current += 1;
    setLoadingScope(null);
    setDraft(appliedCode);
    setDialogErrorResult(null);
    setOpenScope(scope);
  }

  function closeDialog() {
    requestSequence.current += 1;
    setLoadingScope(null);
    setDialogErrorResult(null);
    setOpenScope(null);
  }

  function clear() {
    requestSequence.current += 1;
    setDraft("");
    setRegistration(null);
    setLoadingScope(null);
    setDialogErrorResult(null);
    setNoticeResult({ scope, text: "쿠폰 등록을 취소했습니다." });
  }

  async function register() {
    const code = normalizeCouponCode(draft);
    if (!code) {
      setDialogErrorResult({ scope, text: "쿠폰 코드를 입력해 주세요." });
      return;
    }
    const requestId = ++requestSequence.current;
    const requestScope = scope;
    setLoadingScope(requestScope);
    setDialogErrorResult(null);
    try {
      const nextQuote = await requestCouponQuote(cohortId, code);
      if (requestId !== requestSequence.current || currentScope.current !== requestScope) return;
      setDraft(code);
      setRegistration({ code: nextQuote.couponCode || code, quote: { ...nextQuote, scope: requestScope } });
      setNoticeResult({ scope: requestScope, text: `${nextQuote.couponName || nextQuote.couponCode || "쿠폰"} 할인이 자동으로 적용됐습니다.` });
      setOpenScope(null);
    } catch (cause) {
      if (requestId === requestSequence.current && currentScope.current === requestScope) {
        setDialogErrorResult({ scope: requestScope, text: (cause as Error).message });
      }
    } finally {
      if (requestId === requestSequence.current) setLoadingScope(null);
    }
  }

  return {
    appliedCode,
    closeDialog,
    clear,
    dialogError,
    draft,
    loading,
    notice,
    open,
    openDialog,
    quote,
    register,
    setDraft,
  };
}

export type CheckoutCouponRegistrationController = ReturnType<typeof useCheckoutCouponRegistration>;

export function CheckoutCouponRegistration({
  controller,
}: {
  controller: CheckoutCouponRegistrationController;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    appliedCode,
    clear,
    closeDialog,
    dialogError,
    draft,
    loading,
    notice,
    open,
    openDialog,
    quote,
    register,
    setDraft,
  } = controller;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <>
      <input type="hidden" name="coupon" value={appliedCode} />
      <div className="checkout-coupon-entry">
        <div>
          <strong>{quote ? "쿠폰 할인이 적용됐습니다." : "보유한 쿠폰이 있나요?"}</strong>
          <p className="meta">일반 쿠폰 한 장에 중복 가능 쿠폰을 추가할 수 있습니다. 기존 라이브·당첨 쿠폰 조합도 사용할 수 있습니다.</p>
        </div>
        <button type="button" className="btn" onClick={openDialog}>
          {quote ? "쿠폰 변경" : "쿠폰 등록하기"}
        </button>
      </div>
      {notice ? <p role="status" className="meta checkout-coupon-notice">{notice}</p> : null}
      {quote?.coupons?.length ? quote.coupons.map(line => <div className="checkout-applied-coupon" key={line.couponCode}><span>{line.couponName}</span><strong>−{money(line.couponDiscount)}</strong></div>) : null}
      {quote ? (
        <div className="checkout-applied-coupon">
          <span>{quote.couponName || quote.couponCode || appliedCode}</span>
          <div className="checkout-applied-coupon-actions">
            <strong>−{money(quote.couponDiscount)}</strong>
            <button type="button" className="link" onClick={clear}>등록 취소</button>
          </div>
        </div>
      ) : null}
      <dialog
        ref={dialogRef}
        className="modal checkout-coupon-dialog"
        aria-labelledby="checkout-coupon-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        <div>
          <header className="modal-head">
            <h2 id="checkout-coupon-dialog-title">쿠폰 등록하기</h2>
            <button type="button" className="icon-btn" aria-label="쿠폰 등록 창 닫기" onClick={closeDialog} disabled={loading}>
              <X />
            </button>
          </header>
          <div className="modal-body">
            <p>쿠폰이 여러 장이면 +로 연결해 입력해 주세요. 예: LIVE+BONUS. 최대 10장까지 가능하며 각 쿠폰의 사용 조건을 확인합니다.</p>
            <label className="field">
              쿠폰 코드
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void register();
                }}
                maxLength={COUPON_CODE_MAX_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="쿠폰 코드를 입력하세요."
              />
            </label>
            {dialogError ? <p className="form-error" role="alert">{dialogError}</p> : null}
          </div>
          <footer className="modal-footer">
            <button type="button" className="btn" onClick={closeDialog} disabled={loading}>취소</button>
            <button type="button" className="btn primary" onClick={() => void register()} disabled={loading || !draft.trim()}>
              {loading ? "확인 중…" : "등록"}
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
