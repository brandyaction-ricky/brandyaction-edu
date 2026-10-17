"use client";
import { disableDevicePush } from "@/lib/web-push-client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { POLICY_VERSION } from "@/lib/legal-policies";
import { OptionalConsent } from '@/app/ui/optional-consent';
import { emptyConsent, OPTIONAL_CONSENT_VERSION, validateConsentChoices, type ConsentChoices, type ConsentSnapshot } from '@/lib/optional-consent';
import { RequiredConsent } from "@/app/ui/consent-policy";
import { useConsentCoupon } from '@/app/ui/use-consent-coupon';
import { ConsentCouponNotice } from '@/app/ui/consent-coupon-notice';
import { useMetaPurchaseConsent } from '@/app/ui/use-meta-purchase-consent';
import { MetaPurchaseOption } from '@/app/ui/meta-purchase-option';

import { safeNext } from "@/lib/platform";

export default function SocialConsentPage() {
  const router = useRouter();
  const [required, setRequired] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const optionalEnabled = process.env.NEXT_PUBLIC_EDU_OPTIONAL_CONSENT_ENABLED === 'true';
  const coupon = useConsentCoupon(optionalEnabled && process.env.NEXT_PUBLIC_EDU_CONSENT_REWARD_ENABLED === 'true');
  const meta = useMetaPurchaseConsent(optionalEnabled, 'signup');
  const [signupSaved, setSignupSaved] = useState(false);
  const [choices, setChoices] = useState<ConsentChoices>({ ...emptyConsent });
  const [optionalUnresolved, setOptionalUnresolved] = useState(false);
  const consentAttempt = useRef<{ requestId: string; choices: ConsentChoices } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  const complete = async () => {
    if (busy.current) return;
    if (!required) {
      setMessage("필수 약관에 모두 동의해 주세요.");
      return;
    }
    if (optionalEnabled && !validateConsentChoices(choices)) {
      setMessage('광고 소식을 받으려면 내 정보 사용에도 동의해 주세요. 받지 않으려면 선택 항목을 해제해 주세요.');
      return;
    }
    setPending(true);
    busy.current = true;
    setMessage("");
    try {
    if (signupSaved) {
      if (await meta.save()) goNext();
      return;
    }
    // A coupon response can be lost after signup consent was saved. Retry only
    // that transaction, with the original ID and revisions, before navigating.
    if (coupon.unresolved) {
      if (await coupon.claim(null)) await finishSignup();
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: {
        terms_version: POLICY_VERSION,
        privacy_version: POLICY_VERSION,
        consented_at: new Date().toISOString(),
      },
    });
    if (error) {
      setMessage(
        "약관 동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setPending(false);
      return;
    }
    let expectedRevision: string | null = null;
    let savedRevision: string | null = null;
    let reconcileWithdrawal = false;
    // A lost opt-in response may already have committed. Never silently skip a
    // subsequent opt-out: read and revoke the server state before claiming success.
    if (optionalEnabled && consentAttempt.current && !choices.marketingUse && !choices.kakao && !choices.email) {
      const current = await fetch('/api/account/marketing-consent', { cache: 'no-store' });
      if (!current.ok) throw new Error('소식 설정을 확인하지 못했어요. 다시 시도하거나 가입을 계속한 뒤 회원 정보에서 확인해 주세요.');
      const snapshot = await current.json() as ConsentSnapshot;
      expectedRevision = snapshot.revision;
      reconcileWithdrawal = Object.values(snapshot.choices).some(Boolean);
      if (!reconcileWithdrawal) { consentAttempt.current = null; setOptionalUnresolved(false); }
    }
    if (!optionalEnabled || choices.marketingUse || choices.kakao || choices.email || reconcileWithdrawal) {
      if (optionalEnabled && (!consentAttempt.current || JSON.stringify(consentAttempt.current.choices) !== JSON.stringify(choices))) {
        consentAttempt.current = { requestId: crypto.randomUUID(), choices };
      }
      if (optionalEnabled) setOptionalUnresolved(true);
      const consentResponse = await fetch("/api/account/marketing-consent", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optionalEnabled ? { ...consentAttempt.current, expectedRevision, surface: 'signup', wordingVersion: OPTIONAL_CONSENT_VERSION } : { consent: marketing }),
      });
      if (!consentResponse.ok) {
        setMessage("마케팅 수신 동의 정보를 저장하지 못했습니다. 다시 시도하거나 선택 항목을 해제하고 가입할 수 있어요.");
        return;
      }
      if (optionalEnabled) setOptionalUnresolved(false);
      if (optionalEnabled && choices.kakao && coupon.snapshot?.available && !coupon.snapshot.awarded) {
        const saved = await consentResponse.json() as ConsentSnapshot;
        savedRevision = saved.revision;
      }
    }
    if (choices.marketingUse && choices.kakao && coupon.snapshot?.available && !coupon.snapshot.awarded) {
      if (!await coupon.claim(savedRevision)) return;
    }
    await finishSignup();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "가입 정보를 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const finishSignup = async () => {
    setSignupSaved(true);
    if (await meta.save()) goNext();
  };

  const goNext = () => { router.replace(safeNext(new URLSearchParams(window.location.search).get("next"))); router.refresh(); };
  const cancel = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
    await disableDevicePush().catch(() => {});
    await createClient().auth.signOut({ scope: "local" });
    router.replace("/login");
    router.refresh();
    } catch { setMessage("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
    finally { busy.current = false; setPending(false); }
  };

  return (
    <div className="edu-front">
      <main className="form-page">
        <section className="form-card">
          <div>
            <div className="text-center">
              <Link href="/" className="eyebrow">
                BRANDYACTION EDU
              </Link>
              <h1>서비스 이용 동의</h1>
              <p className="muted mt16">
                필수 약관에 동의하면 회원가입이 완료됩니다.
              </p>
            </div>
            <fieldset className="stack mt32 email-auth-fields" disabled={pending || coupon.unresolved}>
              <RequiredConsent checked={required} onChange={setRequired} disabled={signupSaved}/>
              {optionalEnabled ? <OptionalConsent value={choices} onChange={setChoices} disabled={pending || coupon.unresolved || signupSaved}>
                <MetaPurchaseOption state={meta} disabled={pending || coupon.unresolved}/>
                <ConsentCouponNotice snapshot={coupon.snapshot}/>
              </OptionalConsent> : <label className="checkline">
                <input type="checkbox" checked={marketing} onChange={event => setMarketing(event.target.checked)}/>
                <span>[선택] 클래스·무료강의 등 마케팅 정보 수신 동의</span>
              </label>}
            </fieldset>
            {message && (
              <p className="notice mt16" role="alert">
                {message}
              </p>
            )}
            {coupon.error && <p className="notice mt16" role="alert">소식 수신 선택은 저장됐어요. {coupon.error}</p>}
            {coupon.unresolved && !pending && <button className="btn ghost full mt16" type="button" onClick={goNext}>가입 계속하기 · 쿠폰과 수신 설정은 회원 정보에서 확인</button>}
            {signupSaved && meta.error && !pending && <button className="btn ghost full mt16" type="button" onClick={goNext}>가입 계속하기 · Meta 설정은 회원 정보에서 확인</button>}
            {optionalEnabled && optionalUnresolved && message && <button className="btn ghost full mt16" type="button" disabled={pending || !required} onClick={goNext}>가입 계속하기 · 수신 설정은 회원 정보에서 확인</button>}
            <button
              className="btn primary full mt24"
              type="button"
              onClick={complete}
              disabled={pending || !required || coupon.conflict || (signupSaved && meta.conflict)}
            >
              {pending ? "저장 중..." : signupSaved ? 'Meta 동의 저장 다시 확인하기' : coupon.unresolved ? '쿠폰 발급 다시 확인하기' : "동의하고 가입 완료"}
              <ArrowRight />
            </button>
            <button
              className="btn ghost full mt8"
              type="button"
              onClick={cancel}
              disabled={pending}
            >
              동의하지 않고 나가기
            </button>
            <p className="meta flex mt24">
              <CheckCircle2 />
              동의 일시와 약관 버전이 가입 기록에 저장됩니다.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
