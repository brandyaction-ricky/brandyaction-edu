'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Star, X, PencilLine } from 'lucide-react';
import type { ReviewContext, ReviewPage } from '@/lib/product-reviews';
import type { WorkflowSend } from '../learning-workflows';
import './product-reviews.css';

async function readReviews<T>(courseId: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/product-reviews?' + new URLSearchParams({ course: courseId, ...params }), { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '후기를 불러오지 못했습니다.');
  return result;
}

export function useProductReviews(courseId: string) {
  const [snapshot, setState] = useState<{ courseId: string; data?: ReviewPage; busy: boolean; error: string }>({ courseId, busy: true, error: '' });
  const state = snapshot.courseId === courseId ? snapshot : { courseId, busy: true, error: '', data: undefined };
  const [revision, setRevision] = useState(0);
  const moreFlight = useRef(false);
  const generation = useRef(0);
  const moreAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const currentGeneration = ++generation.current;
    const abort = new AbortController();
    readReviews<ReviewPage>(courseId, {}, abort.signal).then(data => { if (!abort.signal.aborted) setState({ courseId, data, busy: false, error: '' }); })
      .catch(error => { if (!abort.signal.aborted) setState({ courseId, busy: false, error: error.message }); });
    return () => { abort.abort(); moreAbort.current?.abort(); generation.current = currentGeneration + 1; };
  }, [courseId, revision]);
  async function more() {
    if (!state.data?.hasMore || moreFlight.current || state.busy) return;
    moreFlight.current = true;
    const currentGeneration = generation.current;
    const abort = new AbortController();
    moreAbort.current = abort;
    setState(previous => ({ ...previous, busy: true, error: '' }));
    try {
      const page = await readReviews<ReviewPage>(courseId, { page: String(state.data.page + 1) }, abort.signal);
      if (currentGeneration === generation.current) setState(previous => ({ courseId, data: { ...page, rows: [...new Map([...(previous.data?.rows || []), ...page.rows].map(row => [row.id, row])).values()] }, busy: false, error: '' }));
    } catch (error) { if (currentGeneration === generation.current) setState(previous => ({ ...previous, busy: false, error: (error as Error).message })); }
    finally { moreFlight.current = false; }
  }
  return { ...state, more, reload: () => { setState(previous => ({ ...previous, busy: true, error: '' })); setRevision(value => value + 1); } };
}
type ReviewState = ReturnType<typeof useProductReviews>;

export function ProductReviewRating({ state }: { state: ReviewState }) {
  return <a className="product-review-rating" href="#product-reviews"><Star aria-hidden="true"/>{state.data?.summary.count
    ? <><b>{state.data.summary.average?.toFixed(1)}</b><span>수강 후기 {state.data.summary.count}개</span></>
    : <span>{state.busy ? '수강 후기 확인 중' : '수강 후기 보기'}</span>}</a>;
}

export function ProductReviews({ courseId, courseTitle, signedIn, state }: { courseId: string; courseTitle: string; signedIn: boolean; state: ReviewState }) {
  return <section className="product-reviews detail-section" id="product-reviews" aria-label="수강 후기">
    <div className="product-reviews-heading"><div><h2>수강 후기{state.data ? <span>{state.data.summary.count}</span> : null}</h2><p>직접 수강한 분들의 경험을 만나보세요.</p></div>
      <CourseReviewButton courseId={courseId} courseTitle={courseTitle} signedIn={signedIn} onSaved={state.reload}/></div>
    {state.data && state.data.summary.count > 0 && <div className="product-reviews-score"><Star aria-hidden="true"/><strong>{state.data.summary.average?.toFixed(1)}</strong><span>5점 만점 · 공개 후기 {state.data.summary.count}개</span></div>}
    <p className="product-reviews-policy">수강권이 있는 회원이 작성한 후기입니다. 작성·수정한 후기는 운영자 검토 후 공개됩니다.</p>
    {state.data?.rows.map(review => <article className="product-review" key={review.id}>
      <div className="product-review-meta"><b>{String(review.author)}</b><time dateTime={String(review.published_at || '')}>{review.published_at ? new Date(String(review.published_at)).toLocaleDateString('ko-KR') : ''}</time></div>
      <div className="product-review-stars" aria-label={`5점 만점에 ${review.rating}점`}>{[1,2,3,4,5].map(n => <Star key={n} aria-hidden="true" className={Number(review.rating) >= n ? 'is-filled' : ''}/>)}</div>
      <p>{String(review.body || '')}</p>
    </article>)}
    {state.data?.summary.count === 0 && <div className="product-reviews-empty">아직 공개된 후기가 없어요. 첫 수강 경험을 남겨 주세요.</div>}
    {state.busy && <p role="status">후기를 불러오고 있어요.</p>}
    {state.error && <div role="alert"><p>{state.error}</p><button className="btn small" type="button" onClick={state.data?.hasMore ? state.more : state.reload}>다시 불러오기</button></div>}
    {state.data?.hasMore && !state.error && <button className="btn product-reviews-more" type="button" disabled={state.busy} onClick={() => void state.more()}>후기 더 보기</button>}
  </section>;
}

export function CourseReviewButton({ courseId, courseTitle, signedIn = true, label = '리뷰 작성', onSaved, save }: {
  courseId: string; courseTitle: string; signedIn?: boolean; label?: string; onSaved?: () => void; save?: WorkflowSend;
}) {
  const [open, setOpen] = useState(false), [context, setContext] = useState<ReviewContext | null>(null);
  const [rating, setRating] = useState(5), [body, setBody] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), flight = useRef(false);
  const entry = useRef<HTMLButtonElement>(null);
  const titleId = useId(), ratingId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const trigger = entry.current;
    element.showModal();
    const abort = new AbortController();
    readReviews<ReviewContext>(courseId, { context: '1' }, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setContext(result); setRating(Number(result.review?.rating || 5)); setBody(String(result.review?.body || ''));
    }).catch(cause => { if (!abort.signal.aborted) setError(cause.message); });
    return () => { abort.abort(); element.close(); queueMicrotask(() => { if (!element.isConnected && trigger?.isConnected) trigger.focus({ preventScroll: true }); }); };
  }, [open, courseId]);
  function begin() { setContext(null); setError(''); setSaved(false); setOpen(true); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context?.enrollmentId || flight.current || !body.trim()) return;
    flight.current = true; setBusy(true); setError('');
    try {
      const payload = { action: 'review', enrollmentId: context.enrollmentId, rating, content: body.trim() };
      if (save) await save(payload, '후기를 저장했어요. 검토 후 공개됩니다.');
      else {
        const response = await fetch('/api/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '후기를 저장하지 못했습니다.');
      }
      setOpen(false); setSaved(true); onSaved?.();
    } catch (cause) { setError((cause as Error).message); }
    finally { flight.current = false; setBusy(false); }
  }
  const loginHref = '/login?next=' + encodeURIComponent('/classes/' + courseId + '#product-reviews');
  return <div className="course-review-entry">
    {signedIn ? <button ref={entry} className="btn" type="button" onClick={begin}><PencilLine aria-hidden="true"/>{label}</button> : <Link href={loginHref} className="btn">로그인하고 리뷰 작성</Link>}
    {saved && <p role="status" className="course-review-saved">후기를 저장했어요. 검토 후 공개됩니다.</p>}
    {open && <dialog ref={dialog} className="course-review-dialog" aria-labelledby={titleId} onCancel={event => { if (flight.current) event.preventDefault(); else setOpen(false); }} onClose={() => { if (!dialog.current?.open && !flight.current) setOpen(false); }}>
      <div className="course-review-dialog-head"><div><span>수강 후기</span><h2 id={titleId}>{context?.review ? '리뷰 수정' : '리뷰 작성'}</h2></div><button className="btn icon-btn" type="button" aria-label="리뷰 작성 닫기" disabled={busy} onClick={() => setOpen(false)}><X/></button></div>
      <p className="course-review-title">{courseTitle}</p>
      {!context && !error && <p role="status">작성 가능한 수강권을 확인하고 있어요.</p>}
      {context?.enrollmentId ? <form onSubmit={submit}>
        <fieldset disabled={busy} className="course-review-rating"><legend>수업은 어떠셨나요?</legend><div>{[1,2,3,4,5].map(value => <label key={value}><input type="radio" name={ratingId} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value}점`}/><Star aria-hidden="true" className={rating >= value ? 'is-filled' : ''}/></label>)}<span>{rating}점</span></div></fieldset>
        <label className="field">수강 경험<textarea value={body} onChange={event => setBody(event.target.value)} required maxLength={5000} rows={6} disabled={busy} placeholder="배우기 전과 달라진 점이나 직접 해 본 경험을 들려주세요."/></label>
        <div className="course-review-help"><span>작성·수정한 후기는 검토 후 공개됩니다.</span><span>{body.length.toLocaleString()} / 5,000</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="course-review-actions"><button className="btn" type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button><button className="btn primary" disabled={busy || !body.trim()}>{busy ? '저장 중…' : '후기 저장'}</button></div>
      </form> : <>{context && <p>이 클래스를 수강 중인 계정에서 후기를 작성할 수 있어요.</p>}{error && <p role="alert">{error}</p>}{context?.review && <p className="product-review-body">{String(context.review.body)}</p>}</>}
    </dialog>}
  </div>;
}
