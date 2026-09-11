"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { POLICY_VERSION } from "@/lib/legal-policies";

import { safeNext } from "@/lib/platform";

export default function SocialConsentPage() {
  const router = useRouter();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const complete = async () => {
    if (!terms || !privacy) {
      setMessage("필수 약관에 모두 동의해 주세요.");
      return;
    }
    setPending(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { terms_version: POLICY_VERSION, privacy_version: POLICY_VERSION, consented_at: new Date().toISOString(), marketing_consent: marketing },
    });
    if (error) {
      setMessage("약관 동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
      return;
    }
    const consentResponse=await fetch("/api/account/marketing-consent",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({consent:marketing})});
    if(!consentResponse.ok){setMessage("마케팅 수신 동의 정보를 저장하지 못했습니다. 다시 시도해 주세요.");setPending(false);return}
    router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
    router.refresh();
  };

  const cancel = async () => {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return <main className="auth-screen">
    <section className="auth-brand-panel"><Link href="/" className="auth-logo">BRANDYACTION <span>EDU</span></Link><div><span>JOIN BRANDYACTION EDU</span><h1>마지막 한 단계만<br/>확인해 주세요.</h1><p>필수 약관에 동의하면 소셜 계정 가입이 완료됩니다.</p></div><small>© 2026 BrandyAction</small></section>
    <section className="auth-form-panel"><div className="auth-card">
      <div className="auth-heading"><span>REQUIRED CONSENT</span><h2>서비스 이용 동의</h2><p>각 문서를 확인한 뒤 직접 동의해 주세요.</p></div>
      <div className="signup-agreements"><label><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)}/><span>[필수] <Link href="/policies/terms" target="_blank">이용약관</Link> 동의</span></label><label><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)}/><span>[필수] <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link> 동의</span></label><label><input type="checkbox" checked={marketing} onChange={(event)=>setMarketing(event.target.checked)}/><span>[선택] 클래스·무료강의 등 마케팅 정보 수신 동의</span></label></div>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <button className="button button-primary button-lg full auth-submit" type="button" onClick={complete} disabled={pending || !terms || !privacy}>{pending ? "저장 중..." : "동의하고 가입 완료"}<ArrowRight/></button>
      <button className="auth-cancel-button" type="button" onClick={cancel} disabled={pending}>동의하지 않고 나가기</button>
      <p className="signup-note"><CheckCircle2/>동의 일시와 약관 버전이 가입 기록에 저장됩니다.</p>
    </div></section>
  </main>;
}
