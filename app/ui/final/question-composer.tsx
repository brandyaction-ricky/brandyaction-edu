'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { questionCategories, type QuestionCategory, type QuestionContext, type SharedAnswer } from '@/lib/question-hub';
import { QuestionImagePicker, type QuestionImagePickerHandle } from './question-image';
import { AnswerText } from './lesson-text';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
import './question-hub.css';

export async function questionRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', signal: signal || AbortSignal.timeout(15000), ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '연결을 확인하지 못했습니다.'), { status: response.status });
  return result;
}
export function SharedAnswerCard({ answer }: { answer: SharedAnswer }) {
  return <details className="question-shared-answer"><summary>{answer.title}<span>답변 보기</span></summary><p className="meta">운영자가 확인한 답변 · {answer.context}</p><p className="reading-copy"><AnswerText text={answer.answer}/></p>{answer.lessonId && answer.enrollmentId && <Link className="link" href={`/learn/${answer.enrollmentId}/${answer.lessonId}`}>관련 수업 보기</Link>}</details>;
}
export function RelatedAnswers({ query, context }: { query: string; context: QuestionContext | null }) {
  const [result, setResult] = useState<{ key: string; answers: SharedAnswer[]; error?: string } | null>(null);
  const key = JSON.stringify([query.slice(0, 500), context?.enrollmentId, context?.lessonId]);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const abort = new AbortController(); let alive = true;
    const timer = setTimeout(() => { void questionRequest<{ answers: SharedAnswer[] }>('/api/platform/question-hub?' + new URLSearchParams({ mode: 'shared', q: query.slice(0, 500), ...(context ? { enrollment: context.enrollmentId, lesson: context.lessonId } : {}) }), undefined, abort.signal)
      .then(data => { if (alive) setResult({ key, answers: data.answers }); })
      .catch(() => { if (alive) setResult({ key, answers: [], error: '비슷한 답변을 불러오지 못했습니다. 질문은 그대로 등록할 수 있습니다.' }); }); }, 500);
    return () => { alive = false; clearTimeout(timer); abort.abort(); };
  }, [key, query, context]);
  if (query.trim().length < 2 || result?.key !== key) return null;
  return <aside className="question-related" aria-label="비슷한 질문의 답변"><b>먼저 확인해 보세요</b>{result.error ? <p role="status" className="meta">{result.error}</p> : !result.answers.length ? <p className="meta">아직 비슷한 답변이 없어요. 아래에서 질문을 등록해 주세요.</p> : result.answers.map(a => <SharedAnswerCard key={a.id} answer={a}/>)}</aside>;
}
export function QuestionComposer({ initialContext, order, onCreated }: { initialContext?: QuestionContext; order?: string | null; onCreated: () => void }) {
  const [contexts, setContexts] = useState<QuestionContext[]>(initialContext ? [initialContext] : []), [context, setContext] = useState<QuestionContext | null>(initialContext || null);
  const [category, setCategory] = useState<QuestionCategory>(order ? 'payment' : 'learning'), [title, setTitle] = useState(order ? '주문 ' + order + ' 문의' : ''), [content, setContent] = useState(''), [visibility, setVisibility] = useState<'cohort' | 'private'>('cohort');
  const [image, setImage] = useState<{ id: string | null; busy: boolean; draft: boolean }>({ id: null, busy: false, draft: false }), [imageKey, setImageKey] = useState(0);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [contextError, setContextError] = useState(''), [contextVersion, setContextVersion] = useState(0);
  const gate = useRef(false), retry = useRef<Record<string, unknown> | null>(null), imagePicker = useRef<QuestionImagePickerHandle>(null), touchedContext = useRef(Boolean(initialContext || order));
  const locked = busy || uncertain, imagesEnabled = process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
  useUnsavedLearningChanges(Boolean(content || title || image.draft) || busy || uncertain);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    void questionRequest<{ contexts: QuestionContext[] }>('/api/platform/question-hub?mode=contexts', undefined, abort.signal).then(data => {
      if (!alive) return; setContexts(data.contexts); setContextError('');
      if (!touchedContext.current) { setContext(data.contexts.find(c => c.recent) || data.contexts[0] || null); touchedContext.current = true; }
    }).catch(() => { if (alive) setContextError('학습 목록을 불러오지 못했습니다. 일반 문의로 등록하거나 다시 불러올 수 있어요.'); });
    return () => { alive = false; abort.abort(); };
  }, [contextVersion]);
  function changeContext(next: QuestionContext | null) {
    if (image.draft && !window.confirm('학습을 바꾸면 첨부 이미지를 다시 올려야 합니다. 바꿀까요?')) return false;
    touchedContext.current = true; setContext(next); setVisibility('cohort'); setImage({ id: null, busy: false, draft: false }); setImageKey(v => v + 1); return true;
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (gate.current || image.busy || (image.draft && !image.id) || (!content.trim() && !image.id)) return;
    if (!retry.current) retry.current = { requestId: crypto.randomUUID(), enrollmentId: context?.enrollmentId || null, lessonId: context?.lessonId || null, title, content, imageId: image.id, category, visibility: context && category === 'learning' ? visibility : 'private', share: false };
    gate.current = true; setBusy(true); setError('');
    try {
      const result = await questionRequest<{ question: { id: string } }>('/api/platform/question-hub', retry.current);
      if (!result.question?.id) throw new Error('등록 결과를 확인하지 못했습니다.');
      retry.current = null; setUncertain(false); setContent(''); setTitle(''); setVisibility('cohort'); setImage({ id: null, busy: false, draft: false }); setImageKey(v => v + 1); onCreated();
    } catch (cause) { const e = cause as { message: string; status?: number }; const unknown = !e.status || e.status >= 500; setUncertain(unknown); if (!unknown) retry.current = null; setError(e.message); }
    finally { gate.current = false; setBusy(false); }
  }
  return <form className="question-composer" onSubmit={submit} onPaste={event => {
    if (!imagesEnabled) return;
    const files = Array.from(event.clipboardData.items).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter((f): f is File => f !== null);
    if (files.length) { event.preventDefault(); imagePicker.current?.paste(files); }
  }}>
    <label className="field">질문 제목 (선택)<input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} disabled={locked} placeholder="비워 두면 질문 내용으로 제목을 만들어요"/></label>
    <div className="question-context-fields"><label className="field">문의 종류<select value={category} disabled={locked || image.busy} onChange={e => { const next = e.target.value as QuestionCategory; if (next === 'learning' || changeContext(null)) { setCategory(next); setVisibility('cohort'); } }}>{Object.entries(questionCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {category === 'learning' && <label className="field">관련 학습<select value={context ? context.enrollmentId + ':' + context.lessonId : ''} disabled={locked || image.busy} onChange={e => changeContext(contexts.find(c => c.enrollmentId + ':' + c.lessonId === e.target.value) || null)}><option value="">학습 선택 없이 질문하기</option>{contexts.map(c => <option key={c.enrollmentId + c.lessonId} value={c.enrollmentId + ':' + c.lessonId}>{c.label}</option>)}</select></label>}</div>
    {contextError && <p role="status" className="meta">{contextError} <button type="button" className="link" disabled={locked} onClick={() => setContextVersion(v => v + 1)}>목록 다시 불러오기</button></p>}
    <label className="field">질문 내용<textarea required={!image.id} rows={6} maxLength={10000} disabled={locked} value={content} onChange={e => setContent(e.target.value)} placeholder="어느 부분에서 막혔나요? 지금 하고 있는 일과 궁금한 점을 편하게 적어 주세요."/></label>
    {category === 'learning' && <RelatedAnswers query={content} context={context}/>}
    {imagesEnabled && <QuestionImagePicker key={imageKey} ref={imagePicker} enrollmentId={context?.enrollmentId || null} lessonId={context?.lessonId || null} locked={locked} publicQuestion={Boolean(context && category === 'learning' && visibility === 'cohort')} changed={(id, uploading, draft) => setImage({ id, busy: uploading, draft })}/>}
    <fieldset className="question-privacy" disabled={locked}><legend>공개 범위</legend>{context && category === 'learning' ? <><div className="question-visibility-options"><label><input type="radio" name="question-visibility" value="cohort" checked={visibility === 'cohort'} onChange={() => setVisibility('cohort')}/> 전체 공개</label><label><input type="radio" name="question-visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')}/> 비밀 질문</label></div><small>{visibility === 'cohort' ? '같은 기수 수강생이 질문·첨부 이미지·답변·후속 질문을 함께 볼 수 있어요. 개인정보가 포함되면 비밀 질문을 선택해 주세요.' : '나와 담당 운영자만 질문과 답변을 볼 수 있어요.'}</small></> : <><b>비밀 질문</b><small>{category === 'learning' ? '관련 학습을 선택하면 같은 기수에 공개할 수 있어요.' : '일반·결제·계정 문의는 나와 담당 운영자만 볼 수 있어요.'}</small></>}</fieldset>
    {uncertain && <p role="status">등록 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하면 중복 등록되지 않습니다.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="btn primary" disabled={busy || image.busy || (image.draft && !image.id) || (!content.trim() && !image.id)}>{busy ? '등록 중…' : uncertain ? '등록 결과 다시 확인' : '질문 등록'}</button>
  </form>;
}
