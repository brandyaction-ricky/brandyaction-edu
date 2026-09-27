'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminTimeline } from '@/features/admin-ui';
import { labels } from '@/lib/platform';
import { reviewCheckItems, type ReviewHistory } from '@/lib/submission-review';
import { timeLabel } from '../learning-workflows';

export async function readReviewHistory(id: string, page = 1, signal?: AbortSignal): Promise<ReviewHistory> {
  const response = await fetch(`/api/admin/submission-review-history?submission=${encodeURIComponent(id)}&page=${page}`, { cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '검토 이력을 불러오지 못했습니다.');
  return body;
}

export function SubmissionReviewHistory({ id, revision }: { id: string; revision: number }) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ result?: ReviewHistory; error?: string; loading: boolean }>({ loading: true });
  const region = useRef<HTMLElement>(null), focusAfterLoad = useRef(false);
  useEffect(() => {
    if (!state.loading && focusAfterLoad.current) { region.current?.focus(); focusAfterLoad.current = false; }
  }, [state.loading]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ loading: true });
      readReviewHistory(id, page, controller.signal).then(result => {
        if (!controller.signal.aborted) setState({ loading: false, result });
      }).catch(error => { if (!controller.signal.aborted) setState({ loading: false, error: error.message }); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, page, revision, retry]);
  return <section ref={region} tabIndex={-1} className="review-history" aria-label="이 제출물의 검토 이력" aria-busy={state.loading}>
    <h3>검토 이력</h3><p className="meta">이 제출물에 저장된 기록입니다. 과거에 저장하지 않은 체크는 복원하거나 추정하지 않습니다.</p>
    {state.loading ? <p role="status">검토 이력을 불러오는 중입니다.</p> : state.error ? <div role="alert"><p>{state.error}</p><button className="btn small" type="button" onClick={() => { focusAfterLoad.current = true; setRetry(value => value + 1); }}>검토 이력 다시 불러오기</button></div> : state.result && <>
      {state.result.rows.length ? <AdminTimeline label="저장된 검토 기록" items={state.result.rows.map(row => ({ id: row.id,
        heading: labels[row.decision], meta: `${row.reviewer} · ${timeLabel(row.reviewedAt)}`,
        children: <><p className="reading-copy">{row.feedback || '등록된 피드백이 없습니다.'}</p>
          {row.checks ? <ul className="review-check-records">{reviewCheckItems.map(item => <li key={item.key}>{item.label} · <strong>{row.checks![item.key] ? '확인' : '미확인'}</strong></li>)}</ul> : <p className="meta">{row.mode === 'bulk' ? '일괄 처리 · 개별 체크 미기록' : '체크 결과 기록 없음'}</p>}
        </> }))}/> : <p className="notice">저장된 검토 이력이 없습니다. 체크 결과는 기록 없음으로 표시됩니다.</p>}
      <div className="review-history-pages"><span className="meta">전체 {state.result.total}건 · {page}페이지</span>
        <button type="button" className="btn small" disabled={page === 1} onClick={() => { focusAfterLoad.current = true; setPage(value => value - 1); }}>이전 기록</button>
        <button type="button" className="btn small" disabled={page * state.result.pageSize >= state.result.total} onClick={() => { focusAfterLoad.current = true; setPage(value => value + 1); }}>다음 기록</button>
      </div>
    </>}
  </section>;
}
