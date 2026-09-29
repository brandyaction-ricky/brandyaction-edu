"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminLoadingState, AdminInlineError, AdminEmptyState, AdminPagination } from '@/features/admin-ui';
import './admin-learning-progress.css';

type Track = { track: 'daily' | 'learning'; total: number; completed: number; currentDay: number; nextDay: number | null; waiting: boolean; finished: boolean };
type ProgressRow = { enrollmentId: string; memberId: string; memberName: string; memberEmail: string; courseTitle: string; cohortName: string | null; accessActive: boolean; status: string; tracks: Track[] };
type Result = { rows: ProgressRow[]; total: number; page: number; pageSize: number };
export function AdminLearningProgress({ member = '', cohort = '' }: { member?: string; cohort?: string }) {
  const [filter, setFilter] = useState({ search: '', page: 1, retry: 0 }), [search, setSearch] = useState('');
  const [state, setState] = useState<{ key: string; data?: Result; error?: string } | null>(null);
  const key = JSON.stringify({ member, cohort, ...filter });
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ member, cohort, search: filter.search, page: String(filter.page) });
    void fetch('/api/admin/learning-progress?' + query, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '학습 진도를 불러오지 못했습니다.');
      if (!controller.signal.aborted) setState({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, member, cohort, filter.search, filter.page]);
  const data = state?.key === key ? state.data : undefined;
  return <section className="alp-panel" aria-label="과정별 학습 진도">
    <h3>과정별 학습 진도</h3><p className="meta">데일리 미션과 학습·시험을 따로 확인합니다. 완료 기록과 현재 공개된 학습 기준입니다.</p>
    {!member && <form className="alp-search" onSubmit={event => { event.preventDefault(); setFilter(value => ({ ...value, search: search.trim(), page: 1 })); }}><label>진도 회원 검색 <input className="input" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="이름 · 이메일 · 전화번호 · 회원 ID"/></label><button className="btn small">검색</button></form>}
    {state?.key === key && state.error ? <AdminInlineError onRetry={() => setFilter(value => ({ ...value, retry: value.retry + 1 }))}>{state.error}</AdminInlineError> : !data ? <AdminLoadingState title="학습 진도를 불러오는 중입니다."/> : <>
      {!data.rows.length && <AdminEmptyState title="조건에 맞는 수강권이 없습니다."/>}
      {data.rows.map(row => <article className="alp-member" key={row.enrollmentId}>
        <h4>{row.memberName || '이름 미등록'} · {row.courseTitle}</h4><p className="meta">{row.memberEmail}{row.cohortName ? ` · ${row.cohortName}` : ''}</p>
        {!row.accessActive && <p>현재 수강할 수 없는 수강권의 기록입니다.</p>}
        {row.status !== 'ready' ? <p role="alert">학습 구성을 확인하지 못했습니다. 운영 설정을 확인해 주세요.</p> : !row.tracks.length ? <p>공개된 과정별 학습이 없습니다.</p> : <div className="alp-tracks">{row.tracks.map(track => <div key={track.track}>
          <b>{track.track === 'daily' ? '데일리 미션' : '학습 & 시험'}</b><p>{track.completed} / {track.total}개 완료 · {Math.round(track.completed / track.total * 100)}%</p>
          <p>{track.finished ? '전체 완료' : `현재 DAY ${track.currentDay}${track.waiting ? ' · 공개 대기' : ''}`}</p>
        </div>)}</div>}
        <Link className="text-link" href={`/admin/reviews?tab=blocks&member=${encodeURIComponent(row.memberId)}`}>회원의 학습 제출물 보기</Link>
      </article>)}
      <AdminPagination page={data.page} pages={Math.ceil(data.total / data.pageSize)} total={data.total} pageSize={data.pageSize} onChange={page => setFilter(value => ({ ...value, page }))}/>
    </>}
  </section>;
}
