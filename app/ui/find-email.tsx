"use client";
import { forgetAccountHint, recentAccountHint } from '@/lib/recent-account-hint';
import { useRef, useState, type FormEvent } from 'react';

export function FindEmail({ supportUrl }: { supportUrl: string }) {
  const [recent, setRecent] = useState(recentAccountHint);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [result, setResult] = useState('');
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setResult('');
    try {
      const response = await fetch('/api/auth/find-email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: form.get('order'), phone: form.get('phone') }) });
      const data = await response.json();
      if (!response.ok) { setResult(data.error || '잠시 후 다시 시도해 주세요.'); return; }
      setResult(data.hint ? '가입 이메일은 ' + data.hint + '입니다.' : '일치하는 계정을 찾지 못했어요. 입력한 내용을 확인하거나 고객센터에 문의해 주세요.');
    } catch {
      setResult('인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally { setBusy(false); lock.current = false; }
  }
  return <section className="mt16" id="email-hint-form" aria-labelledby="email-hint-title">
    <h2 id="email-hint-title">가입 이메일 찾기</h2>
    {recent && <div className="notice mt16"><p>이 기기에서 최근 사용한 이메일 <strong>{recent}</strong></p>
      <button className="text-link" type="button" onClick={() => { forgetAccountHint(); setRecent(''); }}>이 기기에서 힌트 지우기</button>
    </div>}
    <p className="meta">결제 영수증의 주문번호로 가입 이메일 일부를 확인할 수 있어요.</p>
    <form onSubmit={search} onChange={() => setResult('')}>
      <fieldset className="email-auth-fields" disabled={busy}>
        <label className="field"><span>주문번호</span><input name="order" required maxLength={40} placeholder="BAE-로 시작하는 주문번호" autoCapitalize="characters" spellCheck={false} /></label>
        <label className="field"><span>결제할 때 입력한 전화번호</span><input name="phone" type="tel" autoComplete="tel-national" required maxLength={20} /></label>
        <button className="btn primary full">{busy ? '확인 중…' : '이메일 확인하기'}</button>
      </fieldset>
    </form>
    {result && <p className="notice mt16" role="status">{result}</p>}
    <p className="meta mt16">간편가입은 위의 카카오 또는 Google 버튼으로 로그인하면 회원 정보에서 이메일을 확인할 수 있어요.</p>
    <a className="text-link" href={supportUrl} target="_blank" rel="noreferrer">주문번호를 모르면 고객센터에 문의하기</a>
  </section>;
}
