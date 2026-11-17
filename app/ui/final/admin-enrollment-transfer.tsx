'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { AdminAlert, AdminButton, AdminCheckbox } from '@/features/admin-ui';
import './admin-enrollment-transfer.css';

type Target = { id: string; name: string; email: string };
type Command = { requestId: string; source: string; member: string; target: string; reason: string; confirmed: true };
export function AdminEnrollmentTransfer({ member, source, onTransferred }: { member: string; source: string; onTransferred: (message: string) => void }) {
  const id = useId(), [open, setOpen] = useState(false), [email, setEmail] = useState(''), [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState<Command | null>(null);
  const pending = useRef(false), lookup = useRef<AbortController | null>(null), feedback = useRef<HTMLDivElement>(null);
  useEffect(() => () => lookup.current?.abort(), []);
  useEffect(() => { if (error) feedback.current?.focus(); }, [error]);
  function changeEmail(value: string) {
    lookup.current?.abort(); setEmail(value); setTarget(null); setConfirmed(false); setError('');
  }
  async function find() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setTarget(null); setConfirmed(false);
    const controller = new AbortController(); lookup.current = controller;
    try {
      const params = new URLSearchParams({ member, source, email: email.trim() });
      const response = await fetch(`/api/admin/member-enrollment-transfer?${params}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '받는 회원을 확인하지 못했습니다.');
      if (!data.target?.id || !data.target.email || !data.target.name) throw Error('회원 정보를 다시 확인해 주세요.');
      if (!controller.signal.aborted) setTarget(data.target);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '받는 회원을 확인하지 못했습니다.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function transfer() {
    if (pending.current || !target || !confirmed || reason.trim().length < 2) return;
    const command = attempt || { requestId: crypto.randomUUID(), source, member, target: target.id, reason: reason.trim(), confirmed: true as const };
    pending.current = true; setBusy(true); setAttempt(command); setError('');
    try {
      const response = await fetch('/api/admin/member-enrollment-transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const data = await response.json();
      if (!response.ok) {
        // Unknown outcomes keep exactly the same command; never create a second transfer.
        if (response.status < 500) setAttempt(null);
        throw Error(data.error || '처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
      }
      if (data.ok !== true) throw Error('처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
      onTransferred(data.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const locked = busy || !!attempt;
  return <section className="enrollment-transfer" aria-label="회원 간 수강권 이전">
    <AdminButton type="button" size="sm" disabled={busy || !!attempt} aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen(value => !value)}>다른 회원에게 수강권 이전</AdminButton>
    {open && <div id={`${id}-form`} className="enrollment-transfer-form" onKeyDown={event => {
      // This section lives inside the member profile form. Enter must never save that form.
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        if (event.target.type === 'email' && !locked && email.trim()) void find();
      }
    }}>
      <h4>수강권을 받을 회원을 확인해 주세요</h4>
      <p className="meta">수강 권한과 이용 기간을 옮깁니다. 기존 계정은 이 수강권으로 학습할 수 없게 됩니다.</p>
      <div className="field"><label htmlFor={`${id}-email`}>받는 회원의 가입 이메일</label><div className="enrollment-transfer-lookup"><input id={`${id}-email`} type="email" autoComplete="off" maxLength={254} value={email} disabled={locked} placeholder="이미 가입한 계정의 이메일" onChange={event => changeEmail(event.target.value)}/><AdminButton type="button" disabled={locked || !email.trim()} loading={busy && !attempt} onClick={() => void find()}>회원 확인</AdminButton></div></div>
      {target && <>
        <div className="enrollment-transfer-target"><span>받는 회원</span><strong>{target.name}</strong><span>{target.email}</span><a className="text-link" href={`/admin/customers?member=${target.id}`} target="_blank" rel="noopener noreferrer">회원 정보 확인</a></div>
        <div className="field"><label htmlFor={`${id}-reason`}>이전 사유</label><textarea id={`${id}-reason`} rows={2} maxLength={500} value={reason} disabled={locked} onChange={event => { setReason(event.target.value); setConfirmed(false); }} placeholder="예: 본인 확인 후 실제 이용할 가입 계정으로 이전"/></div>
        <ul className="enrollment-transfer-scope"><li>학습 진도·제출물·질문·AI 대화는 원래 계정에 남습니다.</li><li>결제·환불·쿠폰 기록은 구매한 계정에 보존됩니다. 원래 결제를 전액 환불하면 이전한 수강권도 회수됩니다.</li><li>받는 회원에게 같은 기수의 수강권 이력이 있으면 이전할 수 없습니다.</li></ul>
        <AdminCheckbox checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} label={`${target.name} (${target.email}) 계정과 이전 범위를 확인했습니다.`}/>
        <AdminButton type="button" variant="primary" className="mt16" loading={busy && !!attempt} disabled={busy || !confirmed || reason.trim().length < 2} onClick={() => void transfer()}>{attempt ? '같은 요청으로 결과 확인' : '수강권 이전 실행'}</AdminButton>
        {attempt && <p className="meta mt8">처리 결과가 확인될 때까지 입력을 유지합니다. 다시 누르면 같은 요청의 결과만 확인합니다.</p>}
      </>}
      {error && <div ref={feedback} tabIndex={-1} className="mt16"><AdminAlert tone="error">{error}</AdminAlert></div>}
    </div>}
  </section>;
}
