"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { emailAddress, emailConfirmRedirect, loginEmailChangeError } from "@/lib/email-auth";
import { isValidPassword, PASSWORD_REQUIREMENT } from "@/lib/auth-validation";

export function LoginEmailSettings({ email }: { email: string }) {
  const [currentEmail, setCurrentEmail] = useState(email);
  const [nextEmail, setNextEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  const refreshEmailStatus = useCallback(async (announce = false) => {
    try {
      const userResult = await createClient().auth.getUser();
      if (userResult.data.user) {
        const confirmed = userResult.data.user.email || email;
        const awaiting = userResult.data.user.new_email || "";
        setCurrentEmail(confirmed);
        setPendingEmail(awaiting);
        if (announce) setEmailMessage(awaiting
          ? `아직 확인을 기다리고 있어요. ${awaiting} 메일함에서 ‘새 이메일 확인하기’를 눌러 주세요.`
          : `변경 확인 대기 중인 주소가 없습니다. 현재 로그인 이메일은 ${confirmed}입니다.`);
      }
    } catch { /* A temporary client configuration failure must not blank the profile. */ }
  }, [email]);

  useEffect(() => {
    void Promise.resolve().then(() => refreshEmailStatus());
    const onFocus = () => { void refreshEmailStatus(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshEmailStatus]);

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setEmailMessage(""); setEmailError("");
    try {
      const requested = emailAddress(nextEmail).toLowerCase();
      if (requested === currentEmail.toLowerCase()) throw Error("현재 로그인 이메일과 다른 주소를 입력해 주세요.");
      if (!isValidPassword(password) || password.length > 128) throw Error(PASSWORD_REQUIREMENT);
      if (password !== confirmPassword) throw Error("비밀번호가 일치하지 않습니다.");
      const { data, error: authError } = await createClient().auth.updateUser(
        { email: requested, password },
        { emailRedirectTo: emailConfirmRedirect(location.origin, "/my/profile") + "&flow=email_change" },
      );
      if (authError) throw Error(loginEmailChangeError(authError));
      setPendingEmail(data.user.new_email || requested);
      setNextEmail(""); setPassword(""); setConfirmPassword("");
      setEmailMessage(`브랜디에듀 비밀번호를 설정하고 ${requested} 주소로 확인 메일을 보냈어요. 메일의 ‘새 이메일 확인하기’를 누르면 변경이 끝납니다.`);
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : "이메일 변경을 요청하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <section className="panel mt24" aria-labelledby="login-email-title">
    <div className="panel-head"><h2 id="login-email-title">로그인 이메일 변경</h2></div>
    <div className="panel-body">
      <p className="meta">현재 로그인 이메일: <strong>{currentEmail}</strong></p>
      <p className="meta mt8">이메일을 바꿔도 이 계정의 수강 기록과 주문 내역은 그대로예요.</p>
      <p className="notice mt16">새 이메일과 <strong>브랜디에듀에서 쓸 비밀번호</strong>를 함께 정해 주세요. 네이버 메일 비밀번호를 입력하는 곳이 아니에요. 이미 브랜디에듀 비밀번호가 있다면 아래 비밀번호로 바뀝니다.</p>
      <form onSubmit={requestEmailChange} className="mt16">
        <label className="field">새 로그인 이메일
          <input type="email" autoComplete="email" maxLength={254} required value={nextEmail} onChange={event => setNextEmail(event.target.value)} placeholder="예: name@naver.com" disabled={busy} />
        </label>
        <label className="field mt16">브랜디에듀 새 비밀번호
          <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        </label>
        <label className="field mt16">비밀번호 한 번 더
          <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} />
        </label>
        <small>{PASSWORD_REQUIREMENT}</small>
        <button className="btn primary mt16" type="submit" disabled={busy || !nextEmail.trim() || !password || !confirmPassword}>{busy ? "처리 중…" : "비밀번호 설정하고 확인 메일 받기"}</button>
      </form>
      {emailError && <p className="notice red mt16" role="alert">{emailError}</p>}
      {emailMessage && <p className="notice mt16" role="status">{emailMessage}</p>}
      {pendingEmail && <div className="notice mt16" role="status">
        <strong>메일 확인을 기다리고 있어요</strong>
        <p className="mt8"><strong>{pendingEmail}</strong> 메일함에서 ‘새 이메일 확인하기’를 눌러 주세요. 그 뒤 새 이메일과 방금 정한 브랜디에듀 비밀번호로 로그인할 수 있어요.</p>
        <button className="btn mt16" type="button" onClick={() => void refreshEmailStatus(true)} disabled={busy}>이메일 변경 상태 확인</button>
      </div>}
    </div>
  </section>;
}
