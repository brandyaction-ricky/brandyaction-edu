'use client';

import { useState, type FormEvent } from 'react';
import { money, text as t, type Row } from '@/lib/platform';
import { type Data, type WorkflowSend } from './learning-workflows';

export function EnrollmentGrant({ data, selection, send, pending }: { data: Data; selection: string[]; send: WorkflowSend; pending: boolean }) {
  const [message, setMessage] = useState('');
  const member = (data.profiles || []).find(p => p.id === selection[0]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const cohort = (data.cohorts || []).find(c => c.id === values.get('cohort'));
    if (!member || !cohort || !window.confirm(`${t(member, 'full_name') || t(member, 'email')}님에게 ${t(cohort, 'name')} 수강권을 발급할까요? 결제 없이 학습 권한이 부여됩니다.`)) return;
    try {
      await send({ action: 'grant-enrollment', memberId: member.id, cohortId: cohort.id, reason: values.get('reason'), endsAt: values.get('endsAt') ? new Date(String(values.get('endsAt'))).toISOString() : null }, '수강권을 발급했습니다.');
      setMessage('발급했습니다. 기존 활성 수강권은 중복 발급하지 않습니다.');
    } catch (error) { setMessage((error as Error).message); }
  }
  return <form className="panel pad mb24" onSubmit={submit}>
    <h3>선택 회원에게 수강권 발급</h3>
    <p className="meta">회원 1명을 선택하세요. 발급 사유와 관리자는 감사 기록에 남습니다.</p>
    <div className="grid2 mt16">
      <label className="field">기수<select name="cohort" required defaultValue=""><option value="">기수를 선택하세요</option>{(data.cohorts || []).filter(c => c.status !== 'cancelled').map(c => <option key={c.id} value={c.id}>{t((data.courses || []).find(p => p.id === c.course_id), 'title')} · {t(c, 'name')}</option>)}</select></label>
      <label className="field">수강 만료일 (현재 기기 시간)<input name="endsAt" type="datetime-local"/><small>비워두면 기간 제한 없이 발급됩니다.</small></label>
    </div>
    <label className="field">발급 사유<input name="reason" required minLength={2} maxLength={500} placeholder="체험·보상 등 발급 사유"/></label>
    <button className="btn primary" disabled={pending || selection.length !== 1 || member?.status !== 'active'}>수강권 발급</button>
    {message && <p className="notice mt16" role="status">{message}</p>}
  </form>;
}

export function RefundAction({ payment, requests, send, pending }: { payment: Row; requests: Row[]; send: WorkflowSend; pending: boolean }) {
  const [message, setMessage] = useState('');
  const remaining = Number(payment.approved_amount) - Number(payment.cancelled_amount);
  const unresolved = requests.find(r => r.payment_id === payment.id && r.status === 'processing');
  async function execute(body: Record<string, unknown>) {
    try { await send({ action: 'refund', paymentId: payment.id, ...body }, '환불 결과를 반영했습니다.'); setMessage('환불 완료를 확인했습니다.'); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const amount = Number(values.get('amount'));
    if (!window.confirm(`${money(amount)}을 실제 환불할까요? 전액 환불이면 해당 주문의 수강권도 회수됩니다.`)) return;
    await execute({ amount, reason: values.get('reason') });
  }
  if (remaining <= 0 && !unresolved) return null;
  return <section className="mt24">
    <h3>결제 취소·환불</h3>
    <p className="meta mt16">환불 가능액 {money(remaining)} · 부분 환불은 수강권을 유지하고 전액 환불은 회수합니다. 실결제 환불은 별도 서버 승인 설정이 필요합니다.</p>
    {unresolved ? <div className="notice mt16"><p>{money(Number(unresolved.amount))} 환불 결과 확인 중입니다. 중복 환불은 차단됩니다.</p><button className="btn mt16" disabled={pending} onClick={() => void execute({ requestId: unresolved.id, amount: unresolved.amount, reason: unresolved.reason })}>결과 재확인</button></div> : <form className="mt16" onSubmit={submit}>
      <label className="field">환불 금액<input name="amount" type="number" min={1} max={remaining} step={1} required defaultValue={remaining}/></label>
      <label className="field">환불 사유<input name="reason" minLength={2} maxLength={200} required placeholder="환불 사유를 입력하세요"/></label>
      <button className="btn" disabled={pending}>환불 내용 확인</button>
    </form>}
    {message && <p className="notice mt16" role="status">{message}</p>}
  </section>;
}
