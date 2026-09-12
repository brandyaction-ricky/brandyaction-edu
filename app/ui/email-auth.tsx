"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PASSWORD_REQUIREMENT } from '@/lib/auth-validation';
import { afterEmailLogin, emailAddress, emailAuthError, emailCallback, signupValues } from '@/lib/email-auth';

export function EmailAuth({ signup, next, disabled = false }: { signup: boolean; next: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [forgot, setForgot] = useState(false);
  const [pending, setPending] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [email, setEmail] = useState(''), [resend, setResend] = useState(false), [seconds, setSeconds] = useState(0);
  const busy = useRef(false);
  useEffect(() => { if (!seconds) return; const timer = setTimeout(() => setSeconds(s => Math.max(0, s - 1)), 1000); return () => clearTimeout(timer); }, [seconds]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setPending(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      const auth = createClient().auth;
      if (forgot) {
        const { error } = await auth.resetPasswordForEmail(emailAddress(email), { redirectTo: emailCallback(location.origin, '/auth/reset-password') });
        if (error) throw Error(emailAuthError(error));
        setNotice('가입된 이메일이라면 비밀번호 재설정 안내가 발송됩니다. 메일함과 스팸함을 확인해 주세요.'); setSeconds(60);
      } else if (signup) {
        const values = signupValues(String(form.get('name') || ''), email, String(form.get('password') || ''), String(form.get('confirm') || ''));
        const { data, error } = await auth.signUp({ ...values, options: { ...values.options, emailRedirectTo: emailCallback(location.origin, next) } });
        if (error) throw Error(emailAuthError(error));
        if (data.session) { location.assign(afterEmailLogin(data.user?.user_metadata, next)); return; }
        setNotice('가입 가능한 이메일이라면 인증 메일이 발송됩니다. 메일의 인증 링크를 연 뒤 필수 약관에 동의해 가입을 완료해 주세요. 이미 가입했다면 로그인해 주세요.');
        setResend(true); setSeconds(60);
      } else {
        const { data, error } = await auth.signInWithPassword({ email: emailAddress(email), password: String(form.get('password') || '') });
        if (error) { if (error.code === 'email_not_confirmed') setResend(true); throw Error(emailAuthError(error)); }
        location.assign(afterEmailLogin(data.user.user_metadata, next));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '잠시 후 다시 시도해 주세요.'); }
    finally { busy.current = false; setPending(false); }
  }
  async function resendEmail() {
    if (busy.current || seconds) return;
    busy.current = true; setPending(true); setError('');
    try {
      const { error } = await createClient().auth.resend({ type: 'signup', email: emailAddress(email), options: { emailRedirectTo: emailCallback(location.origin, next) } });
      if (error) throw Error(emailAuthError(error));
      setNotice('인증 메일 발송을 요청했습니다. 메일함과 스팸함을 확인해 주세요.'); setSeconds(60);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '메일을 다시 보내지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="email-auth mt24">
    <button className="btn full" type="button" disabled={disabled || pending} aria-expanded={open} aria-controls="email-auth-form" onClick={() => setOpen(!open)}>이메일로 {signup ? '회원가입' : '로그인'}</button>
    {open && <div id="email-auth-form" className="mt24">
      <form onSubmit={submit}>
        <h2>{forgot ? '비밀번호 찾기' : signup ? '이메일 회원가입' : '이메일 로그인'}</h2>
        <fieldset disabled={pending || disabled} className="email-auth-fields">
          {signup && !forgot && <label className="field"><span>이름</span><input name="name" autoComplete="name" required maxLength={80} /></label>}
          <label className="field"><span>이메일</span><input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
          {!forgot && <label className="field"><span>비밀번호</span><input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} maxLength={128} />{signup && <small>{PASSWORD_REQUIREMENT}</small>}</label>}
          {signup && !forgot && <label className="field"><span>비밀번호 확인</span><input name="confirm" type="password" autoComplete="new-password" required maxLength={128} /></label>}
          <button className="btn primary full" disabled={pending || (forgot && seconds > 0)}>{pending ? '처리 중…' : forgot ? seconds ? `${seconds}초 후 다시 요청` : '재설정 메일 받기' : signup ? '인증 메일 받고 가입하기' : '로그인'}</button>
        </fieldset>
      </form>
      {error && <p className="notice mt16" role="alert">{error}</p>}
      {notice && <p className="notice mt16" role="status">{notice}</p>}
      {resend && !forgot && <button type="button" className="btn full mt16" disabled={pending || seconds > 0} onClick={() => void resendEmail()}>{seconds ? `${seconds}초 후 인증 메일 다시 받기` : '인증 메일 다시 받기'}</button>}
      {!signup && <button type="button" className="btn ghost full mt16" disabled={pending} onClick={() => { setForgot(!forgot); setError(''); setNotice(''); }}>{forgot ? '이메일 로그인으로 돌아가기' : '비밀번호를 잊으셨나요?'}</button>}
      {signup && <p className="meta mt16">이메일 확인 후 <Link href="/policies/terms" target="_blank">이용약관</Link>과 <Link href="/policies/privacy" target="_blank">개인정보처리방침</Link> 동의를 진행합니다.</p>}
    </div>}
  </div>;
}
