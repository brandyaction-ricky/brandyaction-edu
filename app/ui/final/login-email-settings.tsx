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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshEmailStatus = useCallback(async (announce = false) => {
    try {
      const auth = createClient().auth;
      const [userResult, identityResult] = await Promise.all([auth.getUser(), auth.getUserIdentities()]);
      if (userResult.data.user) {
        const confirmed = userResult.data.user.email || email;
        const awaiting = userResult.data.user.new_email || "";
        setCurrentEmail(confirmed);
        setPendingEmail(awaiting);
        if (announce) setMessage(awaiting
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
    setBusy(true); setMessage(""); setError("");
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
      setMessage("확인 메일을 보냈습니다. 새 주소와 기존 주소에 각각 메일이 왔다면 두 메일을 모두 확인해 주세요. 확인 링크를 연 뒤 이 화면으로 돌아와 변경 상태를 확인하세요.");
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
      setPasswordReady(true);
      setMessage("이메일 로그인용 비밀번호를 설정했습니다. 주소 변경이 완료되면 새 이메일과 이 비밀번호로 같은 계정에 로그인할 수 있습니다.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 설정하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <section className="panel mt24" aria-labelledby="login-email-title">
    <div className="panel-head"><h2 id="login-email-title">로그인 이메일 변경</h2></div>
    <div className="panel-body">
      <p className="meta">현재 로그인 이메일: <strong>{currentEmail}</strong></p>
      <p className="meta mt8">이 계정의 주문·수강 기록은 유지됩니다. 안내받을 이메일은 위 기본 정보에서 별도로 관리합니다.</p>
      {socialProvider && <div className="notice mt16">
        <strong>새 이메일로 직접 로그인하려면 비밀번호를 설정하세요.</strong>
        <p className="meta mt8">카카오·구글로만 로그인했다면 이메일 로그인용 비밀번호가 없습니다. 주소를 바꿔도 자동으로 생기지 않습니다. 아래에서 비밀번호를 만들면 주소 변경 후에도 기존 주문·수강 기록이 있는 계정으로 로그인할 수 있습니다. 소셜 로그인만 계속 사용할 경우에는 설정하지 않아도 됩니다.</p>
        <form onSubmit={addEmailPassword} className="mt16">
          <label className="field">새 비밀번호<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
          <label className="field mt16">새 비밀번호 확인<input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} /></label>
          <small>{PASSWORD_REQUIREMENT}</small>
          <button className="btn mt16" type="submit" disabled={busy}>이메일 로그인 비밀번호 설정</button>
        </form>
        {passwordReady && <p className="meta mt8" role="status">이메일 로그인용 비밀번호 설정 완료. 변경을 이미 요청했다면 두 주소의 확인 메일을 확인하세요.</p>}
      </div>}
      {pendingEmail && <p className="notice mt16" role="status">변경 확인 대기: {pendingEmail}. 기존 주소에도 확인 메일이 왔다면 함께 확인해야 변경이 완료됩니다. 그전까지 현재 로그인 주소는 {currentEmail}입니다.</p>}
      <button className="btn mt16" type="button" onClick={() => void refreshEmailStatus(true)} disabled={busy}>이메일 변경 상태 새로 확인</button>
      <form onSubmit={requestEmailChange} className="mt16">
        <label className="field">새 로그인 이메일
          <input type="email" autoComplete="email" maxLength={254} required value={nextEmail} onChange={event => setNextEmail(event.target.value)} placeholder="자주 사용하는 이메일" disabled={busy} />
        </label>
        <button className="btn primary mt16" type="submit" disabled={busy || !nextEmail.trim()}>{busy ? "처리 중…" : "변경 확인 메일 받기"}</button>
      </form>
      {message && <p className="notice mt16" role="status">{message}</p>}
      {error && <p className="notice mt16" role="alert">{error}</p>}
    </div>
  </section>;
}
