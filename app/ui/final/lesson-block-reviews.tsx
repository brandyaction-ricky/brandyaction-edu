"use client";

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUnsavedWarning } from '@/features/admin-ui';
import { blockReviewLabels, blockSubmissionState, type BlockSubmission, type BlockSubmissionDetail } from '@/lib/lesson-block-review';
import { LessonBlockView } from './lesson-block-view';
import { BlockReviewHistory } from './lesson-block-submission-history';
import { OngoingLessonReviews } from './ongoing-lesson-reviews';
import { SubmissionReview } from './submission-review';

type QueueRow = { id: string; memberName: string; courseTitle: string; lessonTitle: string; submission: BlockSubmission };
type Queue = { rows: QueueRow[]; total: number; page: number; pageSize: number };
async function request<T>(query = '', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/admin/lesson-block-reviews' + query, { method: body ? 'POST' : 'GET', cache: 'no-store', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '검토 정보를 불러오지 못했습니다.'), { status: response.status });
  return result;
}
export function LessonBlockReviews() {
  const [filter, setFilter] = useState({ state: 'submitted', page: 1, refresh: 0 });
  const [queue, setQueue] = useState<{ key: string; data?: Queue; error?: string } | null>(null);
  const queueKey = JSON.stringify(filter);
  const [selected, setSelected] = useState('');
  const [reload, setReload] = useState(0);
  const detailKey = `${selected}:${reload}`;
  const [loaded, setLoaded] = useState<{ key: string; detail?: BlockSubmissionDetail; error?: string } | null>(null);
  const [feedback, setFeedback] = useState(''), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false), [stale, setStale] = useState(false);
  const retry = useRef<{ submissionId: string; expectedStateId: string; requestId: string; decision: string; feedback: string } | null>(null);
  useUnsavedWarning(Boolean(feedback) || pending || uncertain);
  useEffect(() => {
    const abort = new AbortController();
    void request<Queue>(`?${new URLSearchParams({ state: filter.state, page: String(filter.page) })}`, undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setQueue({ key: queueKey, data }); })
      .catch(error => { if (!abort.signal.aborted) setQueue({ key: queueKey, error: error.message }); });
    return () => abort.abort();
  }, [filter, queueKey]);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    void request<BlockSubmissionDetail>(`?${new URLSearchParams({ submission: selected })}`, undefined, abort.signal)
      .then(detail => { if (!abort.signal.aborted) setLoaded({ key: detailKey, detail }); })
      .catch(error => { if (!abort.signal.aborted) setLoaded({ key: detailKey, error: error.message }); });
    return () => abort.abort();
  }, [selected, detailKey]);
  const detail = loaded?.key === detailKey ? loaded.detail : undefined;
  function choose(id: string) {
    if (pending || uncertain || (feedback && !window.confirm('아직 저장하지 않은 피드백을 지우고 다른 제출물을 열까요?'))) return;
    setSelected(id); setFeedback(''); setMessage(''); setStale(false); retry.current = null;
  }
  async function decide(decision: string) {
    if (!detail || pending || stale) return;
    if (!retry.current && decision === 'changes_requested' && !feedback.trim()) { setMessage('수정할 내용을 피드백에 적어 주세요.'); return; }
    retry.current ??= { submissionId: detail.submission.id, expectedStateId: detail.submission.stateId || detail.submission.id, requestId: crypto.randomUUID(), decision, feedback };
    setPending(true); setMessage('');
    try {
      const result = await request<BlockSubmission>('', retry.current);
      if (result.id !== retry.current.submissionId || result.stateId !== retry.current.requestId || result.state !== retry.current.decision) {
        // The request may have succeeded before another action. Refresh before
        // making another decision; never report a guessed current state.
        setStale(true); setUncertain(false); setMessage('제출 상태가 다시 바뀌었습니다. 최신 결과를 확인해 주세요.');
      } else {
        setLoaded({ key: detailKey, detail: { ...detail, submission: result } });
        setFeedback(''); setUncertain(false); setMessage('검토 결과를 저장했습니다.');
        setReload(value => value + 1); setFilter(value => ({ ...value, refresh: value.refresh + 1 }));
      }
      retry.current = null;
    } catch (error) {
      const failure = error as { message?: string; status?: number };
      const unknown = !failure.status || failure.status >= 500;
      setUncertain(unknown); setStale(failure.status === 409 || failure.status === 403);
      setMessage((failure.message || '응답을 확인하지 못했습니다.') + (unknown ? ' 같은 요청으로 결과를 다시 확인해 주세요.' : ''));
      if (!unknown) retry.current = null;
    } finally { setPending(false); }
  }
  const list = queue?.key === queueKey ? queue.data : undefined;
  const locked = pending || uncertain;
  return <section aria-label="학습 본문 제출 검토" className="lb-review-panel">
    <h2>학습 본문 제출 검토</h2><p>질문별 답변과 제출 당시 내용을 확인한 뒤 승인하거나 수정을 요청하세요.</p>
    <div className="row mb16"><label>검토 상태 <select value={filter.state} disabled={locked} onChange={event => setFilter({ state: event.target.value, page: 1, refresh: 0 })}>
      {['submitted', 'changes_requested', 'reopened', 'approved', ''].map(state => <option key={state} value={state}>{blockReviewLabels[state] || '전체'}</option>)}
    </select></label><button className="btn small" disabled={locked} onClick={() => setFilter(value => ({ ...value, refresh: value.refresh + 1 }))}>목록 새로고침</button></div>
    {queue?.key === queueKey && queue.error ? <p role="alert">{queue.error}</p> : !list ? <p role="status">제출 목록을 불러오고 있습니다.</p> : <>
      <p>{list.total}건 · {list.page}페이지</p>
      {!list.rows.length && <p>이 상태의 제출물이 없습니다.</p>}
      <div className="lb-review-queue">{list.rows.map(row => <button className="btn" type="button" disabled={locked} aria-pressed={selected === row.id} key={row.id} onClick={() => choose(row.id)}>
        {row.memberName || '회원'} · {row.courseTitle} · {row.lessonTitle} · {blockReviewLabels[blockSubmissionState(row.submission)]}
      </button>)}</div>
      <div className="row mt16"><button className="btn small" disabled={locked || list.page <= 1} onClick={() => setFilter(value => ({ ...value, page: value.page - 1 }))}>이전 페이지</button>
        <button className="btn small" disabled={locked || list.page * list.pageSize >= list.total} onClick={() => setFilter(value => ({ ...value, page: value.page + 1 }))}>다음 페이지</button></div>
    </>}
    {selected && <section className="panel pad mt24" aria-label="선택한 학습 제출물">
      {loaded?.key === detailKey && loaded.error ? <p role="alert">{loaded.error}</p> : !detail ? <p role="status">제출물을 불러오고 있습니다.</p> : <>
        <h3>{detail.memberName || '회원'} · {detail.lessonTitle || '학습'}</h3>
        <p>{detail.courseTitle} · <strong>{blockReviewLabels[blockSubmissionState(detail.submission)]}</strong></p>
        <p>제출 당시의 수업과 답변을 표시합니다.</p>
        {detail.isLatest === false && <p className="notice">이후에 다시 제출한 답변이 있습니다. 현재 기록은 읽기만 가능합니다.</p>}
        <LessonBlockView document={detail.document} values={detail.values} submissionId={detail.submission.id} onChange={() => {}} readOnly />
        <BlockReviewHistory detail={detail} />
        {detail.isLatest !== false && blockSubmissionState(detail.submission) === 'submitted' && <div className="mt24">
          <label htmlFor="block-mentor-feedback">멘토 피드백 (수정 요청 시 필수)</label>
          <textarea id="block-mentor-feedback" className="input" maxLength={2000} value={feedback} disabled={locked || stale} onChange={event => setFeedback(event.target.value)} rows={4} />
          <div className="row mt16"><button className="btn primary" disabled={locked || stale} onClick={() => void decide('approved')}>승인하기</button>
            <button className="btn" disabled={locked || stale} onClick={() => void decide('changes_requested')}>수정 요청하기</button></div>
        </div>}
        {!!detail.previousSubmissions?.length && <details className="mt24"><summary>같은 학습의 다른 제출 기록</summary>
          {detail.previousSubmissions.map(item => <p key={item.id}><button type="button" className="btn small" disabled={locked} onClick={() => choose(item.id)}>
            {new Date(item.createdAt).toLocaleString('ko-KR')} · {blockReviewLabels[blockSubmissionState(item)]}
          </button></p>)}
        </details>}
      </>}
      {message && <p role="status" className="notice mt16">{message}</p>}
      {uncertain && <button className="btn small" disabled={pending} onClick={() => void decide(retry.current!.decision)}>같은 검토 요청 다시 확인</button>}
      {!uncertain && <button className="btn small mt16" disabled={pending} onClick={() => { setReload(value => value + 1); setStale(false); }}>제출 상태 다시 확인</button>}
    </section>}
  </section>;
}

export function SubmissionReviewWorkspace(props: ComponentProps<typeof SubmissionReview>) {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'ongoing' ? 'ongoing' : params.get('tab') === 'blocks' ? 'blocks' : 'missions');
  const enabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
  if (!enabled) return <SubmissionReview {...props} />;
  return <><div className="row mb24" aria-label="제출물 종류">
    <button className="btn" aria-pressed={tab === 'missions'} onClick={() => setTab('missions')}>미션 제출물</button>
    <button className="btn" aria-pressed={tab === 'blocks'} onClick={() => setTab('blocks')}>학습 본문 제출물</button>
    <button className="btn" aria-pressed={tab === 'ongoing'} onClick={() => setTab('ongoing')}>지속 챌린지 참여 기록</button>
  </div>
    <div hidden={tab !== 'missions'}><SubmissionReview {...props} /></div>
    <div hidden={tab !== 'blocks'}><LessonBlockReviews /></div>
    {tab === 'ongoing' && <OngoingLessonReviews />}
  </>;
}
