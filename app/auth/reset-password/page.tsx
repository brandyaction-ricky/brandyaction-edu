"use client";
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isValidPassword, PASSWORD_REQUIREMENT } from '@/lib/auth-validation';
import { emailAuthError } from '@/lib/email-auth';

export default function ResetPasswordPage() {
  const [emailChange, setEmailChange] = useState(false), [email, setEmail] = useState('');
  const [ready, setReady] = useState(false), [pending, setPending] = useState(false), [done, setDone] = useState(false), [message, setMessage] = useState('인증 정보를 확인하고 있습니다.');
  const busy = useRef(false);
  useEffect(() => { let active = true; createClient().auth.getUser().then(({ data, error }) => { if (active) { setEmailChange(new URL(location.href).searchParams.get('flow') === 'admin_email_change'); setEmail(data.user?.email || ''); setReady(!error && !!data.user); setMessage(!error && data.user ? '' : '재설정 링크가 만료되었거나 유효하지 않습니다. 로그인 화면에서 메일을 다시 요청해 주세요.'); } }).catch(() => { if (active) setMessage('인증 정보를 확인하지 못했습니다. 다시 접속해 주세요.'); }); return () => { active = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || busy.current) return;
    const form = new FormData(event.currentTarget), password = String(form.get('password') || '');
    if (!isValidPassword(password) || password.length > 128) { setMessage(PASSWORD_REQUIREMENT); return; }
    if (password !== form.get('confirm')) { setMessage('비밀번호가 일치하지 않습니다.'); return; }
    busy.current = true; setPending(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw Error(emailAuthError(error));
      setDone(true); setMessage('비밀번호를 변경했습니다.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '변경하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="edu-front"><main className="form-page"><section className="form-card"><h1>{emailChange ? "이메일이 변경됐어요" : "비밀번호 재설정"}</h1>{emailChange && ready && !done && <p className="notice mb24">새 로그인 이메일은 {email}입니다. 이제 브랜디에듀에서 사용할 비밀번호를 만들어 주세요. 이메일 서비스의 비밀번호와는 별개이며, 기존 수강권과 학습 기록은 유지됩니다.</p>}{ready && !done && <form onSubmit={submit}><label className="field"><span>새 비밀번호</span><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={pending}/><small>{PASSWORD_REQUIREMENT}</small></label><label className="field"><span>새 비밀번호 확인</span><input name="confirm" type="password" autoComplete="new-password" required maxLength={128} disabled={pending}/></label><button className="btn primary full" disabled={pending}>{pending ? '변경 중…' : emailChange ? '비밀번호 설정하고 시작하기' : '비밀번호 변경'}</button></form>}{message && <p role="status" className="notice mt16">{message}</p>}<Link className="btn full mt24" href={done ? '/my' : '/login'}>{done ? '마이페이지로 이동' : '로그인으로 돌아가기'}</Link></section></main></div>;
}
