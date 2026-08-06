"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

type Mode = "login" | "signup";
type Provider = "kakao" | "google";

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
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const configured = hasSupabaseEnv();

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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
        data: { phone },
      },
    });
    if (error) {
      setMessage(error.message.includes("registered") ? "이미 가입된 이메일입니다." : "회원가입 정보를 다시 확인해 주세요.");
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
      <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(""); }}>로그인</button><button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>회원가입</button></div>
      <div className="auth-heading"><span>{mode === "login" ? "WELCOME BACK" : "JOIN BRANDYACTION EDU"}</span><h2>{mode === "login" ? "다시 만나 반갑습니다." : "실행을 시작할 계정을 만드세요."}</h2><p>{mode === "login" ? "수강 중인 클래스와 다음 일정을 확인하세요." : "가입 후 결제한 클래스가 내 학습공간에 연결됩니다."}</p></div>
      <div className="social-login"><button type="button" className="kakao-button" onClick={() => handleSocial("kakao")} disabled={pending}><b>K</b>카카오로 {mode === "login" ? "로그인" : "시작하기"}</button><button type="button" className="google-button" onClick={() => handleSocial("google")} disabled={pending}><b>G</b>Google로 {mode === "login" ? "로그인" : "시작하기"}</button></div>
      <div className="auth-divider"><span>또는 이메일로 계속</span></div>
      <form onSubmit={handleEmail}>
        <div className="auth-fields"><label><span><Mail/>이메일</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" required/></label><label><span><LockKeyhole/>비밀번호</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8자 이상" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required/></label>{mode === "signup" && <label><span><Smartphone/>휴대폰 번호</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" placeholder="010-0000-0000"/></label>}</div>
        {mode === "login" && <div className="auth-options"><label><input type="checkbox" defaultChecked/> 로그인 상태 유지</label><button type="button" onClick={handleReset}>비밀번호 재설정</button></div>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="button button-primary button-lg full auth-submit" type="submit" disabled={pending}>{pending ? "처리 중..." : mode === "login" ? "로그인" : "이메일 인증 후 가입"}<ArrowRight/></button>
      </form>
      {mode === "signup" && <p className="signup-note"><CheckCircle2/>같은 이메일은 하나의 계정으로 관리됩니다.</p>}
    </div></section>
  </main>;
}
