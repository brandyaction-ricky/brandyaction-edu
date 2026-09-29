"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LessonBlockAnswers, PublicBlockDocument } from '@/lib/lesson-blocks';
import { ongoingLabels, ongoingPeriodLabel, type OngoingCadence } from '@/lib/ongoing-lessons';
import { LessonBlockView } from './lesson-block-view';
type Selection = { lessonId: string; enrollmentId: string; periodStart: string };
type Row = Selection & { periodEnd: string; memberName: string; courseTitle: string; lessonTitle: string; cadence: OngoingCadence; completedAt: string | null; updatedAt: string; enrollmentStatus: string };
type Detail = Row & { revision: string; document: PublicBlockDocument; values: LessonBlockAnswers; snapshot: 'latest' | 'completed' };
type Queue = { rows: Row[]; total: number; page: number; pageSize: number };
type Option = { id: string; title: string; courseTitle: string; cadence: OngoingCadence; archived: boolean };
async function read<T>(params: Record<string, string>, signal: AbortSignal): Promise<T> {
 const result = await fetch('/api/admin/ongoing-lessons?' + new URLSearchParams(params), { cache: 'no-store', signal });
 const data = await result.json(); if (!result.ok) throw new Error(data.error || '참여 기록을 불러오지 못했습니다.'); return data;
}
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
export function OngoingLessonReviews() {
 const [filter, setFilter] = useState({ lesson: '', scope: 'current', state: '', page: 1, refresh: 0 });
 const [options, setOptions] = useState<Option[]>([]), [optionError, setOptionError] = useState('');
 const [queue, setQueue] = useState<{ key: string; data?: Queue; error?: string }>();
 const [selection, setSelection] = useState<Selection | null>(null), [snapshot, setSnapshot] = useState<'latest' | 'completed'>('latest'), [refresh, setRefresh] = useState(0);
 const [loaded, setLoaded] = useState<{ key: string; data?: Detail; error?: string }>();
 const listKey = JSON.stringify(filter), detailKey = JSON.stringify({ selection, snapshot, refresh });
 useEffect(() => {
  const abort = new AbortController();
  void read<{ lessons: Option[] }>({ action: 'options' }, abort.signal).then(data => { if (!abort.signal.aborted) { setOptions(data.lessons); setOptionError(''); } }).catch(e => { if (!abort.signal.aborted) setOptionError(e.message); });
  return () => abort.abort();
 }, [filter.refresh]);
 useEffect(() => {
  const abort = new AbortController();
  void read<Queue>({ action: 'list', lesson: filter.lesson, scope: filter.scope, state: filter.state, page: String(filter.page) }, abort.signal).then(data => { if (!abort.signal.aborted) setQueue({ key: listKey, data }); }).catch(e => { if (!abort.signal.aborted) setQueue({ key: listKey, error: e.message }); });
  return () => abort.abort();
 }, [filter, listKey]);
 useEffect(() => {
  if (!selection) return;
  const abort = new AbortController();
  void read<Detail>({ action: 'detail', lesson: selection.lessonId, enrollment: selection.enrollmentId, period: selection.periodStart, snapshot }, abort.signal).then(data => { if (!abort.signal.aborted) setLoaded({ key: detailKey, data }); }).catch(e => { if (!abort.signal.aborted) setLoaded({ key: detailKey, error: e.message }); });
  return () => abort.abort();
 }, [selection, snapshot, detailKey]);
 const list = queue?.key === listKey ? queue.data : undefined, detail = loaded?.key === detailKey ? loaded.data : undefined;
 function change(field: 'lesson' | 'scope' | 'state', value: string) { setSelection(null); setFilter(old => ({ ...old, [field]: value, page: 1 })); }
 return <section className="lb-review-panel lb-ongoing-review" aria-label="지속 챌린지 참여 기록">
  <h2>지속 챌린지 참여 기록</h2><p>작성 중인 답변과 완료 당시 답변을 구분해 확인합니다. 표시 시각은 한국 시간입니다.</p>
  <div className="row mb16">
   <label>챌린지<select value={filter.lesson} onChange={e => change('lesson', e.target.value)}><option value="">전체 챌린지</option>{options.map(item => <option key={item.id} value={item.id}>{item.courseTitle} · {item.title} · {ongoingLabels[item.cadence]}{item.archived ? ' · 보관됨' : ''}</option>)}</select></label>
   <label>조회 기간<select value={filter.scope} onChange={e => change('scope', e.target.value)}><option value="current">이번 기간</option><option value="all">모든 기간</option></select></label>
   <label>완료 상태<select value={filter.state} onChange={e => change('state', e.target.value)}><option value="">전체</option><option value="completed">완료</option><option value="draft">작성 중</option></select></label>
   <button className="btn small" onClick={() => setFilter(old => ({ ...old, refresh: old.refresh + 1 }))}>참여 목록 새로고침</button>
  </div>
  {filter.lesson && process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === "true" && <p><Link className="btn small" href={"/my/messages?ongoing=" + encodeURIComponent(filter.lesson)}>완료 참여자에게 메시지 작성</Link></p>}
  {optionError && <p role="alert">{optionError} 목록 새로고침으로 다시 확인해 주세요.</p>}
  {queue?.key === listKey && queue.error ? <p role="alert">{queue.error}</p> : !list ? <p role="status">참여 기록을 불러오고 있습니다.</p> : <>
   <p>기간별 참여 기록 {list.total}건 · {list.page}페이지</p>{!list.rows.length && <p>이 조건에 맞는 참여 기록이 없습니다.</p>}
   <div className="lb-review-queue">{list.rows.map(row => <button className="btn" key={`${row.lessonId}:${row.enrollmentId}:${row.periodStart}`} aria-pressed={selection?.lessonId === row.lessonId && selection.enrollmentId === row.enrollmentId && selection.periodStart === row.periodStart} onClick={() => { setSelection({ lessonId: row.lessonId, enrollmentId: row.enrollmentId, periodStart: row.periodStart }); setSnapshot('latest'); }}>
    {row.memberName || '회원'} · {row.courseTitle} · {row.lessonTitle} · {ongoingPeriodLabel(row.periodStart, row.periodEnd)} · {row.completedAt ? '완료' : '작성 중'}{row.enrollmentStatus !== 'active' ? ' · 수강 종료/취소' : ''}
   </button>)}</div>
   <div className="row mt16"><button className="btn small" disabled={list.page <= 1} onClick={() => { setSelection(null); setFilter(old => ({ ...old, page: old.page - 1 })); }}>이전 페이지</button><button className="btn small" disabled={list.page * list.pageSize >= list.total} onClick={() => { setSelection(null); setFilter(old => ({ ...old, page: old.page + 1 })); }}>다음 페이지</button></div>
  </>}
  {selection && <section className="panel pad mt24" aria-label="선택한 챌린지 답변">
   {loaded?.key === detailKey && loaded.error ? <p role="alert">{loaded.error}</p> : !detail ? <p role="status">선택한 답변을 불러오고 있습니다.</p> : <>
    <h3>{detail.memberName || '회원'} · {detail.lessonTitle}</h3><p>{detail.courseTitle} · {ongoingPeriodLabel(detail.periodStart, detail.periodEnd)}</p>
    <div className="row mb16"><button className="btn small" aria-pressed={snapshot === 'latest'} onClick={() => setSnapshot('latest')}>마지막 저장 답변</button><button className="btn small" aria-pressed={snapshot === 'completed'} disabled={!detail.completedAt} onClick={() => setSnapshot('completed')}>완료 당시 답변</button></div>
    <p>{detail.snapshot === 'completed' ? '완료 당시 보관한 답변' : '이 기간에 마지막으로 저장한 답변'} · {time(detail.updatedAt)}</p>
    {detail.completedAt && <p>완료 시각: {time(detail.completedAt)}</p>}
    <LessonBlockView key={detailKey} document={detail.document} values={detail.values} livePrompts onChange={() => {}} readOnly fileContext={{ lessonId: detail.lessonId, enrollmentId: detail.enrollmentId, revision: detail.revision, ongoingReview: { periodStart: detail.periodStart, snapshot: detail.snapshot } }} />
   </>}
   <button className="btn small mt16" onClick={() => setRefresh(old => old + 1)}>답변 다시 확인</button>
  </section>}
 </section>;
}
