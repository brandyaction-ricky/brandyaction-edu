"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Smartphone, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig, hasSupabaseEnv } from "@/lib/supabase/config";
import { isValidPassword, normalizePhone, PASSWORD_REQUIREMENT } from "@/lib/auth-validation";
import { POLICY_VERSION } from "@/lib/legal-policies";

type Mode = "login" | "signup";
type Provider = "kakao" | "google";

function KakaoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.85 5.34 4.64 6.76l-.95 3.49a.55.55 0 0 0 .83.61l4.13-2.73c.44.04.89.07 1.35.07 5.52 0 10-3.58 10-8.2S17.52 3 12 3Z"/>
  </svg>;
}

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.35 12.22c0-.74-.06-1.28-.2-1.84H12v3.52h5.37a4.62 4.62 0 0 1-1.99 2.94l-.02.12 2.89 2.2.2.02c1.84-1.68 2.9-4.16 2.9-6.96Z"/>
    <path fill="#34A853" d="M12 21.5c2.62 0 4.82-.85 6.43-2.32l-3.07-2.34c-.82.55-1.93.94-3.36.94a5.82 5.82 0 0 1-5.51-3.96l-.12.01-3 2.28-.04.11A9.72 9.72 0 0 0 12 21.5Z"/>
    <path fill="#FBBC05" d="M6.49 13.82A5.8 5.8 0 0 1 6.17 12c0-.63.11-1.24.3-1.82v-.12L3.43 7.74l-.1.05A9.4 9.4 0 0 0 2.3 12c0 1.51.37 2.94 1.03 4.21l3.16-2.39Z"/>
    <path fill="#EA4335" d="M12 6.22c1.83 0 3.06.78 3.76 1.42l2.73-2.63C16.81 3.47 14.62 2.5 12 2.5a9.72 9.72 0 0 0-8.67 5.29l3.14 2.39A5.84 5.84 0 0 1 12 6.22Z"/>
  </svg>;
}

function nextPath() {
  if (typeof window === "undefined") return "/my";
  const value = new URLSearchParams(window.location.search).get("next");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/my";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreements, setAgreements] = useState({ terms: false, privacy: false, marketing: false });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const configured = hasSupabaseEnv();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const notice = params.get("notice");
    const copy = error === "auth_callback" ? "로그인을 완료하지 못했습니다. 다시 시도해 주세요."
      : error === "consent_failed" ? "필수 약관 동의를 저장하지 못했습니다. 다시 가입해 주세요."
      : error === "service_unavailable" ? "현재 로그인 서비스를 점검 중입니다. 잠시 후 다시 시도해 주세요."
      : notice === "password_changed" ? "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요."
      : notice === "withdrawn" ? "회원 탈퇴가 완료되었습니다."
      : "";
    if (!copy) return;
    const timer = window.setTimeout(() => setMessage(copy), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) {
      setMessage("사이트 연결값을 설정한 뒤 로그인 기능이 활성화됩니다.");
      return;
    }

    setPending(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage("이메일 또는 비밀번호를 확인해 주세요.");
        setPending(false);
        return;
      }
      router.push(nextPath());
      router.refresh();
      return;
    }

    if (!isValidPassword(password)) {
      setMessage(PASSWORD_REQUIREMENT);
      setPending(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
        data: { phone: normalizePhone(phone), full_name: name.trim(), terms_version: POLICY_VERSION, privacy_version: POLICY_VERSION, consented_at: new Date().toISOString(), marketing_consent: agreements.marketing },
      },
    });
    if (error) {
      setMessage(error.message.includes("registered") ? "이미 가입된 이메일입니다." : "회원가입 정보를 다시 확인해 주세요.");
      setPending(false);
      return;
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setMessage("이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정해 주세요.");
      setPending(false);
      return;
    }
    if (data.session) {
      router.push(nextPath());
      router.refresh();
      return;
    }
    setMessage("인증 메일을 보냈습니다. 이메일의 링크를 누르면 가입이 완료됩니다.");
    setPending(false);
  }

  async function handleSocial(provider: Provider) {
    if (!configured) {
      setMessage("사이트 연결값을 설정한 뒤 소셜 로그인이 활성화됩니다.");
      return;
    }
    setPending(true);
    setMessage("");

    try {
      const { publicUrl, publishableKey } = getSupabasePublicConfig();
      const response = await fetch(`${publicUrl}/auth/v1/settings`, {
        headers: { apikey: publishableKey },
      });
      const settings = response.ok ? await response.json() : null;
      const providerEnabled = settings?.external?.[provider] === true;

      if (!providerEnabled) {
        setMessage(`${provider === "kakao" ? "카카오" : "Google"} 로그인은 현재 설정 중입니다. 이메일 로그인을 이용해 주세요.`);
        setPending(false);
        return;
      }
    } catch {
      setMessage("소셜 로그인 설정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });
    if (error) {
      setMessage(`${provider === "kakao" ? "카카오" : "Google"} 로그인 설정을 확인해 주세요.`);
      setPending(false);
    }
  }

  async function handleReset() {
    if (!configured || !email) {
      setMessage("먼저 가입한 이메일을 입력해 주세요.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/my/settings`,
    });
    setMessage(error ? "재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." : "비밀번호 재설정 메일을 보냈습니다.");
    setPending(false);
  }

  return <main className="auth-screen">
    <section className="auth-brand-panel"><Link href="/" className="auth-logo">BRANDYACTION <span>EDU</span></Link><div><span>LEARN · APPLY · GROW</span><h1>배운 것을<br/>실행으로 바꾸는 곳</h1><p>결제부터 VOD, 라이브 일정과 다시보기까지<br/>하나의 학습 공간에서 이어집니다.</p></div><small>© 2026 BrandyAction</small></section>
    <section className="auth-form-panel"><div className="auth-card">
      <div className="auth-tabs"><button type="button" aria-pressed={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>로그인</button><button type="button" aria-pressed={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>회원가입</button></div>
      <div className="auth-heading"><span>{mode === "login" ? "WELCOME BACK" : "JOIN BRANDYACTION EDU"}</span><h2>{mode === "login" ? "다시 만나 반갑습니다." : "실행을 시작할 계정을 만드세요."}</h2><p>{mode === "login" ? "수강 중인 클래스와 다음 일정을 확인하세요." : "가입 후 결제한 클래스가 내 학습공간에 연결됩니다."}</p></div>
      <div className="social-login"><button type="button" className="kakao-button" onClick={() => handleSocial("kakao")} disabled={pending}><span className="social-icon kakao-icon"><KakaoIcon/></span><span>카카오로 {mode === "login" ? "로그인" : "시작하기"}</span></button><button type="button" className="google-button" onClick={() => handleSocial("google")} disabled={pending}><span className="social-icon google-icon"><GoogleIcon/></span><span>Google로 {mode === "login" ? "로그인" : "시작하기"}</span></button></div>
      <div className="auth-divider"><span>또는 이메일로 계속</span></div>
      <form onSubmit={handleEmail}>
        <div className="auth-fields">{mode === "signup" && <label><span><UserRound/>이름</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required/></label>}<label><span><Mail/>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" required/></label><label><span><LockKeyhole/>비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "영문+숫자 8자 이상" : "비밀번호"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} pattern={mode === "signup" ? "(?=.*[A-Za-z])(?=.*[0-9]).{8,}" : undefined} title={mode === "signup" ? PASSWORD_REQUIREMENT : undefined} required/></label>{mode === "signup" && <label><span><Smartphone/>휴대폰 번호</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000"/></label>}</div>
        {mode === "login" && <div className="auth-options"><span>보안 연결로 로그인합니다.</span><button type="button" onClick={handleReset}>비밀번호 재설정</button></div>}
        {mode === "signup" && <div className="signup-agreements"><label><input type="checkbox" checked={agreements.terms} onChange={(event)=>setAgreements({...agreements,terms:event.target.checked})}/><span>[필수] <Link href="/policies/terms" target="_blank">이용약관</Link> 동의</span></label><label><input type="checkbox" checked={agreements.privacy} onChange={(event)=>setAgreements({...agreements,privacy:event.target.checked})}/><span>[필수] <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link> 동의</span></label><label><input type="checkbox" checked={agreements.marketing} onChange={(event)=>setAgreements({...agreements,marketing:event.target.checked})}/><span>[선택] 클래스·무료강의 등 마케팅 정보 수신 동의</span></label></div>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="button button-primary button-lg full auth-submit" type="submit" disabled={pending || (mode === "signup" && (!agreements.terms || !agreements.privacy))}>{pending ? "처리 중..." : mode === "login" ? "로그인" : "이메일 인증 후 가입"}<ArrowRight/></button>
      </form>
      {mode === "signup" && <p className="signup-note"><CheckCircle2/>같은 이메일은 하나의 계정으로 관리됩니다.</p>}
    </div></section>
  </main>;
}
