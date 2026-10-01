"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { emailAddress, loginEmailChangeError } from "@/lib/email-auth";
import { isValidPassword, PASSWORD_REQUIREMENT } from "@/lib/auth-validation";

export function LoginEmailSettings({ email }: { email: string }) {
  const [currentEmail, setCurrentEmail] = useState(email);
  const [nextEmail, setNextEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [socialProvider, setSocialProvider] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    try {
      const auth = createClient().auth;
      Promise.all([auth.getUser(), auth.getUserIdentities()]).then(([userResult, identityResult]) => {
        if (!active) return;
        if (userResult.data.user) {
          setCurrentEmail(userResult.data.user.email || email);
          setPendingEmail(userResult.data.user.new_email || "");
        }
        if (!identityResult.error) {
          setSocialProvider(identityResult.data.identities.some(identity => identity.provider === "kakao" || identity.provider === "google"));
        }
      }).catch(() => { /* The server-rendered email remains visible. */ });
    } catch { /* A temporary client configuration failure must not blank the profile. */ }
    return () => { active = false; };
  }, [email]);

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const requested = emailAddress(nextEmail).toLowerCase();
      if (requested === currentEmail.toLowerCase()) throw Error("현재 로그인 이메일과 다른 주소를 입력해 주세요.");
      const { data, error: authError } = await createClient().auth.updateUser(
        { email: requested },
        { emailRedirectTo: new URL("/auth/callback?next=%2Fmy%2Fprofile", location.origin).href },
      );
      if (authError) throw Error(loginEmailChangeError(authError));
      setPendingEmail(data.user.new_email || requested);
      setNextEmail("");
      setMessage("변경 확인 메일을 보냈습니다. 새 주소의 메일을 확인해 주세요. 보안 설정에 따라 기존 주소로도 확인 메일이 갑니다. 두 확인이 끝날 때까지 현재 로그인 주소를 사용하세요.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "이메일 변경을 요청하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  async function addEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      if (!isValidPassword(password) || password.length > 128) throw Error(PASSWORD_REQUIREMENT);
      if (password !== confirmPassword) throw Error("비밀번호가 일치하지 않습니다.");
      const { error: authError } = await createClient().auth.updateUser({ password });
      if (authError) throw Error(loginEmailChangeError(authError));
      setPassword(""); setConfirmPassword("");
      setMessage("이메일 로그인용 비밀번호를 설정했습니다. 다음부터 이 이메일과 비밀번호로도 같은 계정에 로그인할 수 있습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 설정하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <section className="panel mt24" aria-labelledby="login-email-title">
    <div className="panel-head"><h2 id="login-email-title">로그인 이메일 변경</h2></div>
    <div className="panel-body">
      <p className="meta">현재 로그인 이메일: <strong>{currentEmail}</strong></p>
      <p className="meta mt8">이 계정의 주문·수강 기록은 유지됩니다. 안내받을 이메일은 위 기본 정보에서 별도로 관리합니다.</p>
      {pendingEmail && <p className="notice mt16" role="status">변경 확인 대기: {pendingEmail}. 메일 인증이 완료되기 전에는 기존 이메일을 사용하세요.</p>}
      <form onSubmit={requestEmailChange} className="mt16">
        <label className="field">새 로그인 이메일
          <input type="email" autoComplete="email" maxLength={254} required value={nextEmail} onChange={event => setNextEmail(event.target.value)} placeholder="자주 사용하는 이메일" disabled={busy} />
        </label>
        <button className="btn primary mt16" type="submit" disabled={busy || !nextEmail.trim()}>{busy ? "처리 중…" : "변경 확인 메일 받기"}</button>
      </form>
      {socialProvider && <details className="mt24">
        <summary>이메일과 비밀번호로도 로그인하기</summary>
        <p className="meta mt8">카카오·구글 로그인은 그대로 사용할 수 있습니다. 이메일과 비밀번호로도 이 계정에 로그인하려면 비밀번호를 설정하세요. 주소를 변경 중이라면 메일 인증을 먼저 마쳐 주세요.</p>
        <form onSubmit={addEmailPassword} className="mt16">
          <label className="field">새 비밀번호<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy || !!pendingEmail} /></label>
          <label className="field mt16">새 비밀번호 확인<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy || !!pendingEmail} /></label>
          <small>{PASSWORD_REQUIREMENT}</small>
          <button className="btn mt16" type="submit" disabled={busy || !!pendingEmail}>이메일 로그인 비밀번호 설정</button>
        </form>
      </details>}
      {message && <p className="notice mt16" role="status">{message}</p>}
      {error && <p className="notice mt16" role="alert">{error}</p>}
    </div>
  </section>;
}
