"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LearningDraftStore, learningDraftKey, parseLearningEditorDraft, type LearningEditorDraft } from '@/lib/learning-editor-draft';

export type LearningDraftHandle = { clear: () => void; saveNow: () => void };
export function LearningEditorDraftPanel({ actorId, lessonId, dirty, ready, capture, restore, handleRef, onPending }: {
  actorId: string; lessonId: string; dirty: boolean; ready: boolean;
  capture: () => LearningEditorDraft; restore: (draft: LearningEditorDraft) => void;
  handleRef: React.RefObject<LearningDraftHandle | null>; onPending: (pending: boolean) => void;
}) {
  const [savedAt, setSavedAt] = useState(''), [error, setError] = useState('');
  const [recovery, setRecovery] = useState<{ raw: string; draft?: LearningEditorDraft } | null>(null);
  const [available, setAvailable] = useState(false);
  const router = useRouter();
  const store = useRef<LearningDraftStore | null>(null);
  const latest = useRef({ capture, restore, dirty, ready, recovery });
  useEffect(() => { latest.current = { capture, restore, dirty, ready, recovery }; });
  useEffect(() => {
    let cancelled = false;
    // Read browser-only storage after hydration; Strict Mode cleanup cancels stale reads.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        store.current = new LearningDraftStore(window.localStorage, learningDraftKey(actorId, lessonId));
        setAvailable(true);
        const raw = store.current.read();
        if (raw) {
          onPending(true);
          try { const draft = parseLearningEditorDraft(raw, actorId, lessonId); setRecovery({ raw, draft }); setSavedAt(draft.savedAt); }
          catch (e) { setRecovery({ raw }); setError((e as Error).message); }
        } else onPending(false);
      } catch { onPending(false); setError('이 브라우저에서는 임시저장을 사용할 수 없습니다. 편집 내용을 내려받거나 학습 저장을 눌러 주세요.'); }
    });
    return () => { cancelled = true; store.current = null; };
  }, [actorId, lessonId, onPending]);
  const saveNow = useCallback(() => {
    const current = latest.current;
    if (!current.dirty || !current.ready || current.recovery || !store.current) return;
    try { const draft = current.capture(); setSavedAt(store.current.write(draft)); setError(''); }
    catch (e) { setError(e instanceof Error && e.message.includes('임시저장') ? e.message : '임시저장에 실패했습니다. 브라우저 저장 공간을 확인하거나 편집 내용을 내려받아 주세요.'); }
  }, []);
  const clear = useCallback(() => {
    try { store.current?.clear(); setSavedAt(''); setRecovery(null); onPending(false); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, [onPending]);
  useImperativeHandle(handleRef, () => ({ clear, saveNow }), [clear, saveNow]);
  useEffect(() => {
    const timer = window.setInterval(saveNow, 30_000);
    const leave = (event: BeforeUnloadEvent) => { if (latest.current.dirty) { saveNow(); event.preventDefault(); event.returnValue = ''; } };
    const hide = () => { if (document.visibilityState === 'hidden') saveNow(); };
    window.addEventListener('beforeunload', leave); document.addEventListener('visibilitychange', hide);
    return () => { clearInterval(timer); window.removeEventListener('beforeunload', leave); document.removeEventListener('visibilitychange', hide); };
  }, [saveNow]);
  function download(raw?: string) {
    try {
      const content = raw ?? JSON.stringify(capture(), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = '학습-임시저장.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('학습 구성을 불러온 뒤 내려받아 주세요.'); }
  }
  function load() {
    if (!recovery?.draft || !ready) return;
    try { restore(recovery.draft); setRecovery(null); onPending(false); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  function openRegisteredLesson() {
    const draft = recovery?.draft; if (!draft?.storedLessonId) return;
    try {
      const destination = new LearningDraftStore(window.localStorage, learningDraftKey(actorId, draft.storedLessonId));
      if (destination.read()) throw new Error('등록된 학습에도 임시저장본이 있습니다. 현재 임시저장본을 내려받아 보관한 뒤 해당 학습을 열어 주세요.');
      destination.write({ ...draft, scopeLessonId: draft.storedLessonId });
      store.current?.clear();
      router.push('/admin/learning-editor?id=' + encodeURIComponent(draft.storedLessonId));
    } catch (e) { setError((e as Error).message); }
  }
  let actions: ReactNode;
  if (recovery) actions = <>
    <p>이 브라우저에 보관된 편집 내용이 있습니다. 불러올지 버릴지 선택한 뒤 학습을 저장해 주세요.</p>
    {recovery.draft && (!lessonId && recovery.draft.storedLessonId
      ? <button className="btn small" type="button" disabled={!ready} onClick={openRegisteredLesson}>등록된 학습에서 복구하기</button>
      : <button className="btn small" type="button" disabled={!ready} onClick={load}>임시저장본 불러오기</button>)}
    <button className="btn small" type="button" onClick={() => download(recovery.raw)}>임시저장본 내려받기</button>
    <button className="btn small" type="button" onClick={() => { if (window.confirm('브라우저의 임시저장본을 버릴까요? 서버에 저장된 학습은 그대로 유지됩니다.')) clear(); }}>임시저장본 버리기</button>
  </>;
  else actions = <>
    <button className="btn small" type="button" disabled={!available || !ready || !dirty} onClick={() => saveNow()}>지금 임시저장</button>
    <button className="btn small" type="button" disabled={!ready} onClick={() => download()}>편집 내용 내려받기</button>
  </>;
  return <section className="learning-local-draft notice" aria-label="편집 임시저장">
    <p>작성 중인 제목·본문·학습 구성은 이 브라우저에 30초마다 임시저장됩니다. 학생에게 반영하려면 ‘학습 저장’을 눌러 주세요.</p>
    {savedAt && <p role="status">브라우저 임시저장: {new Date(savedAt).toLocaleString('ko-KR')}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="learning-draft-actions">{actions}</div>
  </section>;
}
