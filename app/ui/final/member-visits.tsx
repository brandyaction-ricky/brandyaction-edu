'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminLoadingState, AdminInlineError, AdminEmptyState, AdminPagination } from '@/features/admin-ui';
import { koreanDay, type MemberVisitsResult } from '@/lib/member-visits';
import { MvpBadge, useMemberMvps } from './member-mvp';
import { AdminLearningProgress } from './admin-learning-progress';
import './member-visits.css';

const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const time = (value: string) => Number.isFinite(Date.parse(value)) ? clock.format(new Date(value)) : '확인 불가';
export function MemberVisits({ member = '' }: { member?: string }) {
  const [day, setDay] = useState(''), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [expanded, setExpanded] = useState('');
  const [state, setState] = useState<{ key: string; data?: MemberVisitsResult; error?: string } | null>(null);
  const key = JSON.stringify([member, day, page]);
  useEffect(() => {
    let disposed = false; const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    const params = new URLSearchParams({ page: String(page) }); if (member) params.set('member', member); else if (day) params.set('day', day);
    void fetch('/api/admin/member-visits?' + params, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || '방문 기록을 불러오지 못했습니다.');
      if (!disposed && !controller.signal.aborted) setState({ key, data });
    }).catch(cause => { if (!disposed) setState({ key, error: controller.signal.aborted ? '조회 시간이 초과됐습니다. 다시 시도해 주세요.' : cause.message }); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [key, member, day, page, attempt]);
  useEffect(() => {
    if (member || day) return;
    // Refresh today's count only while this view is actually visible.
    const refresh = () => { if (document.visibilityState === 'visible') setAttempt(value => value + 1); };
    const timer = setInterval(refresh, 60_000); document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [member, day]);
  const data = state?.key === key ? state.data : undefined;
  const mvps = useMemberMvps(member ? [] : data?.rows.map(row => row.member) || [], true);
  const ready = state?.key === key;
  const focus = () => document.activeElement?.closest<HTMLElement>('.member-visits')?.focus();
  return <section className="panel pad member-visits" aria-label={member ? '회원 방문 기록' : '수강생 방문 현황'} tabIndex={-1}>
    <h3>{member ? '회원 방문 기록' : '수강생 방문 현황'}</h3>
    <p className="meta">한국 시간 기준 · 로그인한 수강생이 마이페이지·학습 화면을 연 기록입니다. 로그인 횟수나 실시간 접속 인원이 아닙니다. 운영 계정은 제외하며 최근 방문 시각은 약 5분 간격으로 갱신합니다.</p>
    <div className="member-visits-controls">{!member && <><label className="field"><span>방문 날짜</span><input type="date" value={day || data?.day || koreanDay()} onChange={event => { setDay(event.target.value); setPage(1); setExpanded(''); }}/></label><button className="btn small" onClick={() => { setDay(''); setPage(1); setAttempt(value => value + 1); setExpanded(''); }}>오늘 보기</button></>}
      <button className="btn small" onClick={() => { focus(); setAttempt(value => value + 1); }}>방문 기록 새로고침</button></div>
    {!ready ? <AdminLoadingState title="방문 기록을 불러오는 중입니다."/> : state.error ? <AdminInlineError onRetry={() => { focus(); setAttempt(value => value + 1); }}>{state.error}</AdminInlineError> : data && <>
      <p role="status">{member ? `방문한 날짜 ${data.total}일` : `${data.day} · 방문 수강생 ${data.total}명`} · {time(data.asOf)} KST 기준</p>
      {mvps.error && <p role="alert">{mvps.error}</p>}
      {!data.rows.length && <AdminEmptyState title="해당 방문 기록이 없습니다.">기능을 켠 이후 수집된 기록부터 표시됩니다.</AdminEmptyState>}
      {data.rows.map(row => { const mvp = mvps.members[row.member], color = mvp?.color || mvps.color; return <article className="member-visit" key={`${row.member}:${row.day}`}>
        <div className="member-visit-summary"><span className="avatar" aria-hidden="true" style={mvp?.isMvp ? { border: `3px solid ${color}` } : undefined}>{(row.name || '회').slice(0, 1)}</span>
          <div><h4>{member ? row.day : row.name || '이름 미등록'}</h4>{!member && row.phone && <p className="meta">{row.phone}</p>}{mvp?.isMvp && <MvpBadge color={color}/>}</div>
          <p className="meta">첫 방문 {time(row.firstSeen)}<br/>최근 방문 {time(row.lastSeen)} KST</p></div>
        {!member && <><div className="member-visits-controls"><Link className="text-link" href={`/admin/customers?member=${row.member}`}>회원 상세 보기</Link><button className="btn small" aria-expanded={expanded === row.member} onClick={() => setExpanded(value => value === row.member ? '' : row.member)}>학습 진도 {expanded === row.member ? '닫기' : '보기'}</button></div>{expanded === row.member && <AdminLearningProgress member={row.member}/>}</>}
      </article>; })}
      <AdminPagination page={data.page} pages={Math.ceil(data.total / data.pageSize)} total={data.total} pageSize={data.pageSize} onChange={value => { focus(); setPage(value); setExpanded(''); }}/>
    </>}
  </section>;
}
export function MemberVisitsToggle() {
  const [open, setOpen] = useState(false);
  return <div className="member-visits-toggle"><button className="btn small" aria-expanded={open} onClick={() => setOpen(value => !value)}>수강생 방문 현황 {open ? '닫기' : '보기'}</button>{open && <MemberVisits/>}</div>;
}
