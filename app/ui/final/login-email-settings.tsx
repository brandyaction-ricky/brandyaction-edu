"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { emailAddress, emailConfirmRedirect, loginEmailChangeError } from "@/lib/email-auth";
import { isValidPassword, PASSWORD_REQUIREMENT } from "@/lib/auth-validation";

export function LoginEmailSettings({ email }: { email: string }) {
  const [currentEmail, setCurrentEmail] = useState(email);
  const [nextEmail, setNextEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [socialProvider, setSocialProvider] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const refreshEmailStatus = useCallback(async (announce = false) => {
    try {
      const auth = createClient().auth;
      const [userResult, identityResult] = await Promise.all([auth.getUser(), auth.getUserIdentities()]);
      if (userResult.data.user) {
        const confirmed = userResult.data.user.email || email;
        const awaiting = userResult.data.user.new_email || "";
        setCurrentEmail(confirmed);
        setPendingEmail(awaiting);
        if (announce) setEmailMessage(awaiting
          ? "아직 이메일 변경 확인 대기 중입니다. 기존 주소와 새 주소로 온 메일을 모두 확인해 주세요."
          : `변경 확인 대기 중인 주소가 없습니다. 현재 로그인 이메일은 ${confirmed}입니다.`);
      }
      if (!identityResult.error) {
        setSocialProvider(identityResult.data.identities.some(identity => identity.provider === "kakao" || identity.provider === "google"));
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
      const { data, error: authError } = await createClient().auth.updateUser(
        { email: requested },
        { emailRedirectTo: emailConfirmRedirect(location.origin, "/my/profile") + "&flow=email_change" },
      );
      if (authError) throw Error(loginEmailChangeError(authError));
      setPendingEmail(data.user.new_email || requested);
      setNextEmail("");
      setEmailMessage("확인 메일을 보냈습니다. 새 주소와 기존 주소에 각각 메일이 왔다면 두 메일을 모두 확인해 주세요. 확인 링크를 연 뒤 이 화면으로 돌아와 변경 상태를 확인하세요.");
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : "이메일 변경을 요청하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  async function addEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setPasswordMessage(""); setPasswordError("");
    try {
      if (!isValidPassword(password) || password.length > 128) throw Error(PASSWORD_REQUIREMENT);
      if (password !== confirmPassword) throw Error("비밀번호가 일치하지 않습니다.");
      const { error: authError } = await createClient().auth.updateUser({ password });
      if (authError) throw Error(loginEmailChangeError(authError));
      setPassword(""); setConfirmPassword("");
      setPasswordReady(true);
      setPasswordMessage("비밀번호 설정 완료. 이메일 변경까지 확인되면 새 이메일과 이 비밀번호로 로그인할 수 있습니다.");
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : "비밀번호를 설정하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <section className="panel mt24" aria-labelledby="login-email-title">
    <div className="panel-head"><h2 id="login-email-title">로그인 이메일 변경</h2></div>
    <div className="panel-body">
      <p className="meta">현재 로그인 이메일: <strong>{currentEmail}</strong></p>
      <p className="meta mt8">이 계정의 주문·수강 기록은 유지됩니다. 안내받을 이메일은 위 기본 정보에서 별도로 관리합니다.</p>
      <form onSubmit={requestEmailChange} className="mt16">
        <label className="field">새 로그인 이메일
          <input type="email" autoComplete="email" maxLength={254} required value={nextEmail} onChange={event => setNextEmail(event.target.value)} placeholder="자주 사용하는 이메일" disabled={busy} />
        </label>
        <button className="btn primary mt16" type="submit" disabled={busy || !nextEmail.trim()}>{busy ? "처리 중…" : "변경 확인 메일 받기"}</button>
      </form>
      {emailError && <p className="notice red mt16" role="alert">{emailError}</p>}
      {emailMessage && <p className="notice mt16" role="status">{emailMessage}</p>}
      {pendingEmail && <div className="notice mt16" role="status">
        <strong>이메일 변경 확인 대기</strong>
        <p className="mt8">새 주소 {pendingEmail}와 기존 주소로 온 확인 메일을 모두 확인해 주세요. 완료 전에는 현재 로그인 이메일 {currentEmail}을 사용합니다.</p>
        <button className="btn mt16" type="button" onClick={() => void refreshEmailStatus(true)} disabled={busy}>확인 후 변경 상태 보기</button>
      </div>}
      {socialProvider && <details className="accordion mt24">
        <summary>새 이메일로 비밀번호 로그인도 사용하기 (선택)</summary>
        <div className="inside">
          <p>카카오·구글 로그인은 계속 사용할 수 있습니다. 새 이메일과 비밀번호로도 로그인하려는 경우에만 설정하세요. 이미 비밀번호를 설정했다면 다시 만들 필요가 없습니다.</p>
          {!passwordReady && <form onSubmit={addEmailPassword} className="mt16">
            <label className="field">새 비밀번호<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
            <label className="field mt16">새 비밀번호 확인<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} /></label>
            <small>{PASSWORD_REQUIREMENT}</small>
            <button className="btn mt16" type="submit" disabled={busy}>비밀번호 설정</button>
          </form>}
          {passwordMessage && <p className="notice green mt16" role="status">{passwordMessage}</p>}
          {passwordError && <p className="notice red mt16" role="alert">{passwordError}</p>}
        </div>
      </details>}
    </div>
  </section>;
}
