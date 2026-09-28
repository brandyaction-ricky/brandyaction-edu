"use client";

import { useEffect, useState } from 'react';
import { blockReviewLabels, blockSubmissionState, type BlockSubmission, type BlockSubmissionDetail } from '@/lib/lesson-block-review';
import { LessonBlockView } from './lesson-block-view';

export function BlockReviewHistory({ detail }: { detail: BlockSubmissionDetail }) {
  return <div className="lb-session-notice"><h3>검토 이력</h3>
    {detail.history.length ? <ol>{detail.history.map(event => <li key={event.id}>
      <strong>{blockReviewLabels[event.decision] || event.decision}</strong> · {new Date(event.createdAt).toLocaleString('ko-KR')}
      {event.feedback && <p className="reading-copy">{event.feedback}</p>}
    </li>)}</ol> : <p>아직 검토 의견이 없습니다.</p>}
  </div>;
}
export function BlockSubmissionHistory({ submissions, enrollmentId }: { submissions: BlockSubmission[]; enrollmentId: string }) {
  const [selected, setSelected] = useState('');
  const [loaded, setLoaded] = useState<{ id: string; detail?: BlockSubmissionDetail; error?: string } | null>(null);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    void fetch(`/api/platform/lesson-blocks?${new URLSearchParams({ submission: selected, enrollment: enrollmentId })}`, { cache: 'no-store', signal: abort.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || '이전 제출물을 불러오지 못했습니다.'); return result; })
      .then(detail => { if (!abort.signal.aborted) setLoaded({ id: selected, detail }); })
      .catch(error => { if (!abort.signal.aborted) setLoaded({ id: selected, error: error.message }); });
    return () => abort.abort();
  }, [selected, enrollmentId]);
  if (!submissions.length) return null;
  return <details className="mt24"><summary>내 제출 기록 ({submissions.length}건)</summary>
    {submissions.map((submission, index) => <p key={submission.id}><button type="button" className="btn small" onClick={() => setSelected(submission.id)}>
      {submissions.length - index}차 제출 · {blockReviewLabels[blockSubmissionState(submission)]} · {new Date(submission.createdAt).toLocaleString('ko-KR')}
    </button></p>)}
    {selected && <section aria-label="이전 제출 답변">
      <button type="button" className="btn small" onClick={() => setSelected('')}>제출 기록 닫기</button>
      {loaded?.id !== selected ? <p role="status">제출 당시 답변을 불러오고 있습니다.</p> : loaded.error ? <p role="alert">{loaded.error}</p> : loaded.detail && <>
        <p>제출 당시의 질문과 답변입니다. 현재 작성 중인 답변은 바뀌지 않습니다.</p>
        <BlockReviewHistory detail={loaded.detail} />
        <LessonBlockView document={loaded.detail.document} values={loaded.detail.values} onChange={() => {}} readOnly />
      </>}
    </section>}
  </details>;
}
