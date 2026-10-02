"use client";
import { useEffect, useRef, useState } from 'react';
import { AdminButton, AdminCheckbox, AdminInlineError } from '@/features/admin-ui';

type History = { id: number; created_at: string; actor_user_id: string; before_data: { email: string }; after_data: { new_email: string; reason: string; status: string; error?: string } };
type Snapshot = { currentEmail: string; pendingEmail: string; history: History[] };
const states: Record<string, string> = { requesting: '요청 중', waiting: '회원 확인 대기', completed: '변경 완료', failed: '요청 실패' };
async function loadSnapshot(member: string, signal?: AbortSignal): Promise<Snapshot | null> {
  const result = await fetch(`/api/admin/member-login-email?member=${encodeURIComponent(member)}`, { cache: 'no-store', signal });
  if (result.status === 403) return null;
  const data = await result.json();
  if (!result.ok) throw Error(data.error || '로그인 정보를 불러오지 못했습니다.');
  return data;
}
export function AdminLoginEmailChange({ member }: { member: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [hidden, setHidden] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [email, setEmail] = useState(''), [confirmEmail, setConfirmEmail] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function refresh(signal?: AbortSignal) {
    const data = await loadSnapshot(member, signal);
    if (!signal?.aborted) { setHidden(!data); setSnapshot(data); setError(''); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadSnapshot(member, controller.signal).then(data => { if (!controller.signal.aborted) { setHidden(!data); setSnapshot(data); } }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [member]);
  async function submit() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/member-login-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member, email, confirmEmail, reason, confirmed }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '변경 요청을 보내지 못했습니다.');
      setMessage(data.message); setEmail(''); setConfirmEmail(''); setReason(''); setConfirmed(false);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '변경 요청을 보내지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  }
  if (hidden) return null;
  return <section className="notice mt24" aria-label="관리자 로그인 이메일 변경">
    <h3>로그인 이메일 변경</h3>
    <p className="meta mt8">관리자 전용 · 회원이 새 이메일로 온 확인 링크를 눌러야 변경됩니다. 수강권과 학습 기록은 유지됩니다.</p>
    {error && <AdminInlineError onRetry={() => void refresh().catch(cause => setError(cause.message))}>{error}</AdminInlineError>}
    {!snapshot ? <p className="meta mt16">현재 로그인 이메일을 확인하고 있습니다.</p> : <>
      <p className="mt16">현재 로그인 이메일: <b>{snapshot.currentEmail}</b></p>
      {snapshot.pendingEmail && <p role="status" className="meta mt8">확인 대기: {snapshot.pendingEmail} · 확인이 끝나기 전에는 현재 주소를 사용합니다.</p>}
      <div className="field mt16"><label htmlFor={`admin-new-email-${member}`}>1. 회원이 사용할 새 이메일</label><input id={`admin-new-email-${member}`} type="email" autoComplete="off" maxLength={254} value={email} disabled={pending} onChange={e => { setEmail(e.target.value); setConfirmed(false); }}/></div>
      <div className="field"><label htmlFor={`admin-confirm-email-${member}`}>새 이메일 한 번 더 입력</label><input id={`admin-confirm-email-${member}`} type="email" autoComplete="off" maxLength={254} value={confirmEmail} disabled={pending} onChange={e => { setConfirmEmail(e.target.value); setConfirmed(false); }}/></div>
      <div className="field"><label htmlFor={`admin-email-reason-${member}`}>2. 변경 사유</label><textarea id={`admin-email-reason-${member}`} maxLength={500} rows={2} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} placeholder="예: 회원 요청으로 자주 사용하는 이메일로 변경"/></div>
      <AdminCheckbox label={`선택한 회원과 새 이메일${email ? ` (${email})` : ''}을 확인했습니다.`} checked={confirmed} disabled={pending} onChange={e => setConfirmed(e.target.checked)}/>
      <div className="row mt16 wrap-flex"><AdminButton type="button" variant="primary" loading={pending} disabled={!email || email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase() || !reason.trim() || !confirmed} onClick={() => void submit()}>3. 새 이메일로 확인 메일 보내기</AdminButton><AdminButton type="button" disabled={pending} onClick={() => void refresh().catch(cause => setError(cause.message))}>변경 상태 확인</AdminButton></div>
      <p className="meta mt8">비밀번호는 회원이 메일 확인 후 직접 설정합니다. 관리자는 비밀번호를 입력하거나 확인하지 않습니다.</p>
      {snapshot.history.length > 0 && <details className="mt16"><summary>이메일 변경 이력 {snapshot.history.length}건</summary>{snapshot.history.map(row => <article className="mt16" key={row.id}><b>{states[row.after_data.status] || '상태 확인 필요'}</b><p className="meta">{row.before_data.email} → {row.after_data.new_email}</p><p>{row.after_data.reason}</p><p className="meta">{new Date(row.created_at).toLocaleString('ko-KR')} · 처리자 {row.actor_user_id}</p>{row.after_data.error && <p>{row.after_data.error}</p>}</article>)}</details>}
    </>}
    {message && <p role="status" className="mt16">{message}</p>}
  </section>;
}
