'use client';

import { useEffect, useState } from 'react';
import { AdminButton, AdminInlineError, AdminLoadingState } from '@/features/admin-ui';
import { externalPartnerUrl } from '@/lib/external-partner-url';

type Cohort = { id: string; name: string; course_id: string; courses: { title: string } };
type Grant = { id: string; access_ends_at: string; revoked_at: string | null; courses: { title: string }; cohorts: { name: string } };
type Info = { cohorts: Cohort[]; grants: Grant[]; checkedAt: number };

const displayDate = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });
const koreanDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });

export function AdminPartnerAccess({ member }: { member: string }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<Info>();
  const [readError, setReadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [cohort, setCohort] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();
  const [revokeId, setRevokeId] = useState('');
  const endpoint = '/api/admin/partner-access';

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(endpoint + '?' + new URLSearchParams({ member }), { cache: 'no-store', signal: controller.signal })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        if (!controller.signal.aborted) { setInfo({ ...data, checkedAt: Date.now() }); setReadError(''); }
      }).catch(error => { if (!controller.signal.aborted) setReadError(error.message || '권한을 확인하지 못했습니다.'); });
    return () => controller.abort();
  }, [open, member, attempt]);

  async function change(input: Record<string, string>) {
    setBusy(true);
    setStatus(undefined);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, member }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setStatus({ text: input.action === 'revoke' ? '협력자 권한을 회수했습니다.' : '협력자 권한을 부여했습니다.' });
      setRevokeId('');
      setAttempt(value => value + 1);
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : '처리 상태를 확인하지 못했습니다.', error: true });
    } finally {
      setBusy(false);
    }
  }
  function grant() {
    const choice = info?.cohorts.find(row => row.id === cohort);
    if (choice && endDate && !busy) void change({ action: 'grant', course: choice.course_id, cohort, endDate });
  }

  async function copyAccess(id: string) {
    try {
      await navigator.clipboard.writeText(location.origin + externalPartnerUrl(id));
      setStatus({ text: '협력자 접속 주소를 복사했습니다.' });
    } catch {
      setStatus({ text: '주소를 자동으로 복사하지 못했습니다. 입력란에서 주소를 복사해 주세요.', error: true });
    }
  }

  return <details className="notice mt24" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>외부 협력자 권한</summary>
    <p className="meta mt8">지정한 과정의 모든 공개 수업을 열고, 선택한 기수의 캠퍼스를 이용할 수 있습니다.</p>
    {open && (readError ? <AdminInlineError onRetry={() => { setReadError(''); setAttempt(n => n + 1); }}>{readError}</AdminInlineError> : !info ? <AdminLoadingState/> :
      <>
        <fieldset className="mt16" style={{ border: 0, padding: 0, minWidth: 0 }} onKeyDown={event => { if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") event.preventDefault(); }}>
          <label className="field">과정·캠퍼스 기수
            <select value={cohort} onChange={event => setCohort(event.target.value)}>
              <option value="">과정·기수 선택</option>
              {info.cohorts.map(row => <option key={row.id} value={row.id}>{row.courses.title} · {row.name}</option>)}
            </select>
          </label>
          <label className="field mt8">이용 종료일
            <input type="date" min={koreanDate.format(info.checkedAt)} value={endDate} onChange={event => setEndDate(event.target.value)}/>
          </label>
          <p className="meta mt8">선택한 날짜의 밤 12시까지 이용할 수 있습니다. 한국 시간 기준입니다.</p>
          <AdminButton type="button" onClick={grant} className="mt16" loading={busy && !revokeId} disabled={!cohort || !endDate || busy}>권한 부여</AdminButton>
        </fieldset>
        {status && <p role={status.error ? 'alert' : 'status'} className="mt8">{status.text}</p>}
        <h4 className="mt24">부여한 권한</h4>
        {!info.grants.length && <p className="meta">부여 이력이 없습니다.</p>}
        {info.grants.map(item => {
          const active = !item.revoked_at && Date.parse(item.access_ends_at) > info.checkedAt;
          return <article className="panel pad mt8" key={item.id}>
            <strong>{item.courses.title} · {item.cohorts.name}</strong>
            <p className="meta">{item.revoked_at ? '회수' : active ? '이용 가능' : '기간 만료'} · {displayDate.format(new Date(Date.parse(item.access_ends_at) - 1))}까지</p>
            {active && <>{revokeId === item.id ? <div className="row wrap-flex mt8">
              <p>이 회원의 협력자 권한을 지금 회수할까요?</p>
              <AdminButton type="button" onClick={() => void change({ action: 'revoke', access: item.id })} loading={busy}>회수 확인</AdminButton>
              <AdminButton type="button" onClick={() => setRevokeId('')} disabled={busy}>취소</AdminButton>
            </div> : <div className="row wrap-flex mt8">
              <label className="field grow" style={{ flex: '1 1 22rem', minWidth: 0 }}>협력자 접속 주소<input readOnly value={location.origin + externalPartnerUrl(item.id)} onFocus={event => event.currentTarget.select()}/></label>
              <AdminButton type="button" onClick={() => void copyAccess(item.id)}>주소 복사</AdminButton>
              <AdminButton type="button" onClick={() => setRevokeId(item.id)} disabled={busy}>권한 회수</AdminButton>
            </div>}</>}
          </article>;
        })}
      </>)}
  </details>;
}
