"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LessonBlockAutosave, type AutosaveState } from '@/lib/lesson-block-autosave';
import { defaultBlockCompletion, missingBlockRequirements, type LessonBlockAnswers, type PublicBlockDocument } from '@/lib/lesson-blocks';
import { canRenderLessonBlocks, LessonBlockView, type BlockGrade } from './lesson-block-view';
import { blockSubmissionState, canEditBlockSubmission, type BlockSubmission as Submission } from '@/lib/lesson-block-review';
import { BlockSubmissionHistory } from './lesson-block-submission-history';

type Snapshot = {
  document: PublicBlockDocument | null; revision: string | null; currentRevision: string | null;
  draft: { values: LessonBlockAnswers; writeId: string; updatedAt: string } | null;
  previousDrafts: { revision: string; updatedAt: string }[];
  submission?: Submission | null;
  submissions?: Submission[];
};
async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', signal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  let data;
  try { data = await response.json(); } catch { throw new Error('서버 응답을 확인하지 못했습니다. 다시 시도해 주세요.'); }
  if (!response.ok) throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : '학습 정보를 처리하지 못했습니다.'), { status: response.status });
  return data;
}
const statusText: Record<AutosaveState['phase'], string> = { saved: '답변 저장됨', dirty: '답변 저장 대기 중', saving: '답변 저장 중…', error: '답변을 저장하지 못했습니다.', conflict: '저장된 답변과 현재 입력이 다릅니다.' };

function SessionContent({ snapshot, lessonId, enrollmentId, onSelectRevision, onCompleted }: { snapshot: Snapshot; lessonId: string; enrollmentId: string; onSelectRevision: (revision: string | null) => void; onCompleted?: () => void }) {
  const [values, setValues] = useState<LessonBlockAnswers>(() => snapshot.draft?.values || { blocks: {}, checklist: [] });
  const [status, setStatus] = useState<AutosaveState>({ phase: 'saved', message: '', updatedAt: snapshot.draft?.updatedAt || null });
  const saver = useRef<LessonBlockAutosave | null>(null);
  const valuesRef = useRef(values);
  const historical = snapshot.revision !== snapshot.currentRevision;
  const [submission, setSubmission] = useState(snapshot.submission || null);
  const [submitting, setSubmitting] = useState(false), [submitError, setSubmitError] = useState('');
  const [submitUncertain, setSubmitUncertain] = useState(false);
  const submissionRequest = useRef<{ requestId: string; writeId: string } | null>(null);
  const reopenRequest = useRef<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const locked = !canEditBlockSubmission(submission);
  const submissionState = submission && blockSubmissionState(submission);
  const submissionHistory = submission ? [submission, ...(snapshot.submissions || []).filter(item => item.id !== submission.id)] : snapshot.submissions || [];
  const credited = useRef(false);
  useEffect(() => {
    if (!historical && !credited.current && ['approved', 'completed'].includes(submissionState || '')) { credited.current = true; onCompleted?.(); }
  }, [historical, submissionState, onCompleted]);
  const policy = snapshot.document?.completion || defaultBlockCompletion;
  const missing = snapshot.document ? missingBlockRequirements(snapshot.document, values) : [];
  useEffect(() => {
    if (historical || !canEditBlockSubmission(snapshot.submission)) return;
    // Create inside the effect: StrictMode setup/cleanup must not leave a
    // disposed controller attached to a newly mounted lesson.
    const autosave = new LessonBlockAutosave(snapshot.draft?.values || { blocks: {}, checklist: [] }, snapshot.draft?.writeId || null, write => request('/api/platform/lesson-blocks', { action: 'draft', lessonId, enrollmentId, revision: snapshot.revision, ...write }));
    saver.current = autosave;
    const unsubscribe = autosave.subscribe(() => setStatus(autosave.getSnapshot()));
    function unload(event: BeforeUnloadEvent) { if (autosave.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } }
    function leaving(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download') || !autosave.hasUnsaved()) return;
      const target = new URL(link.href, location.href);
      if (target.origin === location.origin && target.pathname === location.pathname && target.search === location.search) return;
      if (!window.confirm('저장되지 않은 답변이 있습니다. 이 화면을 나가면 현재 입력을 잃을 수 있습니다. 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leaving, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leaving, true); unsubscribe(); autosave.dispose(); saver.current = null; };
  }, [snapshot, lessonId, enrollmentId, historical]);
  function change(next: LessonBlockAnswers) { valuesRef.current = next; setValues(next); saver.current?.change(next); }
  function select(revision: string | null) {
    if (saver.current?.hasUnsaved() && !window.confirm('저장되지 않은 답변이 있습니다. 현재 입력을 보관한 뒤 다른 기록을 열어 주세요. 계속 이동할까요?')) return;
    onSelectRevision(revision);
  }
  async function grade(blockId: string): Promise<BlockGrade> {
    const data = await request<{ result: BlockGrade }>('/api/platform/lesson-blocks', { action: 'grade', lessonId, enrollmentId, revision: snapshot.revision, blockId, values: valuesRef.current });
    return data.result;
  }
  async function submit() {
    if (submitting || historical || locked || !saver.current) return;
    if (missing.length) { setSubmitError('아래 필수 항목을 먼저 완료해 주세요.'); return; }
    setSubmitting(true); setSubmitError('');
    try {
      const writeId = await saver.current.finish();
      if (!submissionRequest.current || submissionRequest.current.writeId !== writeId) submissionRequest.current = { requestId: crypto.randomUUID(), writeId };
      const result = await request<Submission>('/api/platform/lesson-blocks', { action: 'submit', lessonId, enrollmentId, revision: snapshot.revision, ...submissionRequest.current });
      if (result.revision !== snapshot.revision || result.writeId !== writeId || !['completed', 'submitted'].includes(result.outcome)) throw new Error('제출 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      setSubmission(result);
    } catch (error) {
      const failure = error as { message: string; status?: number };
      const uncertain = Boolean(submissionRequest.current) && (!failure.status || failure.status >= 500);
      setSubmitUncertain(uncertain);
      setSubmitError(failure.message + (uncertain ? ' 같은 답변으로 다시 제출해 결과를 확인해 주세요.' : ''));
    }
    finally { setSubmitting(false); }
  }
  async function reopen() {
    if (!submission || reopening || !window.confirm('제출한 답변을 수정할까요? 이전 제출물과 검토 의견은 보관되며 이미 완료한 진도는 유지됩니다.')) return;
    setReopening(true); setSubmitError('');
    reopenRequest.current ??= crypto.randomUUID();
    try {
      await request('/api/platform/lesson-blocks', { action: 'reopen', lessonId, enrollmentId, revision: snapshot.revision,
        submissionId: submission.id, expectedStateId: submission.stateId || submission.id, requestId: reopenRequest.current });
      select(null);
    } catch (error) { setSubmitError((error as Error).message); }
    finally { setReopening(false); }
  }
  function downloadAnswers() {
    // Contains only this user's normal answers, never ephemeral secret fields
    // or quiz answer keys. The download is an explicit user action.
    const url = URL.createObjectURL(new Blob([JSON.stringify({ lessonId, revision: snapshot.revision, values }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '내-학습-답변.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="lesson-block-session" aria-label="학습 내용과 내 답변">
    {historical ? <div className="lb-session-notice">이전 수업에서 작성한 답변입니다. 읽기만 할 수 있습니다. <button className="btn small" type="button" onClick={() => select(null)}>현재 수업으로</button></div>
      : <div className="lb-save-status"><span role="status" aria-live="polite">{statusText[status.phase]}</span><button type="button" className="btn small" disabled={status.phase === 'saved' || status.phase === 'saving' || status.phase === 'conflict'} onClick={() => void saver.current?.flush()}>{status.phase === 'error' ? '저장 다시 시도' : '지금 저장'}</button></div>}
    {(status.phase === 'error' || status.phase === 'conflict') && <div className="lb-session-notice" role="alert"><p>{status.message} 현재 입력은 이 화면에 남아 있습니다.</p><button className="btn small" type="button" onClick={downloadAnswers}>현재 답변 내려받기</button>{status.phase === 'conflict' && <button className="btn small" type="button" onClick={() => select(null)}>저장된 답변 다시 확인</button>}</div>}
    {submission?.feedback && <div className="lb-session-notice"><h3>멘토 피드백</h3><p className="reading-copy">{submission.feedback}</p></div>}
    {snapshot.document && <LessonBlockView document={snapshot.document} values={values} onChange={change} readOnly={historical || submitting || submitUncertain || locked} grade={historical || locked ? undefined : grade} />}
    {!historical && <section className="lb-session-notice" aria-label="학습 제출">
      {locked ? <>
        <p role="status">{submissionState === 'completed' ? '학습을 완료했습니다.' : submissionState === 'approved' ? submission?.approvalKind === 'automatic' ? '자동승인되어 학습을 완료했습니다.' : '멘토가 승인했습니다. 학습을 완료했습니다.' : '미션을 제출했습니다. 멘토의 확인을 기다려 주세요.'}</p>
        <button className="btn small" type="button" disabled={reopening} onClick={() => select(null)}>검토 결과 새로고침</button>
        {submission?.outcome === 'submitted' && <button className="btn small" type="button" disabled={reopening} onClick={() => void reopen()}>{reopening ? '답변을 여는 중…' : '답변 수정하기'}</button>}
        {submitError && <p role="alert">{submitError}</p>}
      </> : <>
        {submission && <p>{submissionState === 'changes_requested' ? '수정 요청을 받았습니다. 피드백을 확인하고 답변을 다시 제출해 주세요.' : '답변을 수정하고 다시 제출할 수 있습니다.'}</p>}
        <p>{policy.mode === 'mentor' ? '제출하면 현재 답변을 보관하고 멘토 확인을 기다립니다.' : '필수 항목을 확인하고 저장된 답변으로 학습을 완료합니다.'}</p>
        {submitError && <div role="alert"><p>{submitError}</p>{missing.length > 0 && <ul>{missing.map((item, index) => <li key={`${item.id}:${index}`}>{item.label}</li>)}</ul>}</div>}
        <button className="btn primary" type="button" disabled={submitting || status.phase === 'conflict'} onClick={() => void submit()}>{submitting ? '저장·제출 중…' : policy.mode === 'mentor' ? '미션 제출하기' : '학습 완료하기'}</button>
      </>}
    </section>}
    <BlockSubmissionHistory submissions={submissionHistory} enrollmentId={enrollmentId} />
    {snapshot.previousDrafts.length > 0 && <details className="mt24"><summary>이전 수업에서 쓴 답변 보기</summary>{snapshot.previousDrafts.map(draft => <p key={draft.revision}><button type="button" className="btn small" onClick={() => select(draft.revision)}>{new Date(draft.updatedAt).toLocaleString('ko-KR')} 답변</button></p>)}</details>}
  </section>;
}

// Integrate only after the lesson-block DB migration is installed. Existing
// lesson_contents are rendered via fallback when no block document exists.
type SessionProps = { lessonId: string; enrollmentId: string; fallback?: ReactNode; onCompleted?: () => void };
export function LessonBlockSession(props: SessionProps) {
  return <SessionLoader key={`${props.enrollmentId}:${props.lessonId}`} {...props} />;
}
function SessionLoader({ lessonId, enrollmentId, fallback, onCompleted }: SessionProps) {
  const [selection, setSelection] = useState<{ revision: string | null; reload: number }>({ revision: null, reload: 0 });
  const [loaded, setLoaded] = useState<{ key: string; snapshot?: Snapshot; error?: string } | null>(null);
  const key = `${enrollmentId}:${lessonId}:${selection.revision || ''}:${selection.reload}`;
  useEffect(() => {
    const abort = new AbortController();
    const query = new URLSearchParams({ lesson: lessonId, enrollment: enrollmentId });
    if (selection.revision) query.set('revision', selection.revision);
    void request<Snapshot>(`/api/platform/lesson-blocks?${query}`, undefined, abort.signal).then(snapshot => { if (!abort.signal.aborted) setLoaded({ key, snapshot }); }).catch(error => { if (!abort.signal.aborted) setLoaded({ key, error: (error as Error).message }); });
    return () => abort.abort();
  }, [lessonId, enrollmentId, selection.revision, key]);
  function select(revision: string | null) { setSelection(previous => ({ revision, reload: previous.reload + 1 })); }
  if (loaded?.key !== key) return <p role="status">학습 내용과 저장된 답변을 불러오고 있습니다.</p>;
  if (loaded.error) return <div className="lb-session-notice" role="alert"><p>{loaded.error}</p><button type="button" className="btn small" onClick={() => select(selection.revision)}>다시 불러오기</button></div>;
  if (!loaded.snapshot?.document) return <>{fallback}</>;
  if (!canRenderLessonBlocks(loaded.snapshot.document)) return <p role="alert">학습 도구를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.</p>;
  return <SessionContent key={key} snapshot={loaded.snapshot} lessonId={lessonId} enrollmentId={enrollmentId} onSelectRevision={select} onCompleted={onCompleted} />;
}
