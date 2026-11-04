'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import type { QuestionContext } from '@/lib/question-hub';
import { CurriculumAiConversation } from './curriculum-ai-conversation';
import { learningQuestionCreatedEvent, openFloatingQuestionEvent } from './learning-question-dialog';
import { QuestionComposer, questionRequest } from './question-composer';
import './floating-learning-question.css';

const contextKey = (context?: QuestionContext) => context ? context.enrollmentId + ':' + context.lessonId : '';

export function FloatingLearningQuestion({ member, current }: { member: string; current?: QuestionContext }) {
  const [panel, setPanel] = useState<{ open: boolean; selected?: QuestionContext }>({ open: false });
  const [contexts, setContexts] = useState<QuestionContext[]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState(false);
  const composer = useRef({ dirty: false, locked: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const storageKey = 'edu-floating-question:' + member;
  const selected = panel.selected;
  const selectionNeeded = panel.open && !current;

  const update = useCallback((next: { dirty: boolean; locked: boolean }) => { composer.current = next; }, []);
  const save = useCallback((next: typeof panel) => {
    setPanel(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Panel remains usable without storage. */ }
  }, [storageKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (saved && typeof saved.open === 'boolean') setPanel({ open: saved.open, selected: saved.open ? saved.selected : undefined });
      } catch { /* Ignore unavailable or malformed session data. */ }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!selectionNeeded) return;
    const abort = new AbortController();
    void questionRequest<{ contexts: QuestionContext[] }>('/api/platform/question-hub?mode=contexts', undefined, abort.signal)
      .then(data => { setContexts(data.contexts); setLoadFailed(false); })
      .catch(() => { if (!abort.signal.aborted) setLoadFailed(true); });
    return () => abort.abort();
  }, [selectionNeeded, attempt]);

  const classes = new Map(contexts?.map(context => [context.enrollmentId, context.classLabel || context.label]));
  const activeClass = selected?.enrollmentId || contexts?.[0]?.enrollmentId || '';
  const lessons = contexts?.filter(context => context.enrollmentId === activeClass) || [];
  const target = selected ?? current ?? lessons[0];
  const targetKey = contextKey(target);

  function toggle(open: boolean) {
    if (open) setCreated(false);
    save({ open, selected: open && current ? current : target });
    requestAnimationFrame(() => (open ? close : trigger).current?.focus({ preventScroll: true }));
  }
  const openFor = useCallback((next?: QuestionContext) => {
    if (targetKey && next && targetKey !== contextKey(next)
      && (composer.current.locked || (composer.current.dirty && !window.confirm('작성 중인 첨부 또는 멘토 질문을 닫고 수업을 바꿀까요?')))) return;
    if (contextKey(next) !== targetKey) composer.current = { dirty: false, locked: false };
    setCreated(false);
    save({ open: true, selected: contextKey(next) === contextKey(current) ? current : next });
    requestAnimationFrame(() => close.current?.focus({ preventScroll: true }));
  }, [save, targetKey, current]);

  useEffect(() => {
    const open = (event: Event) => openFor((event as CustomEvent<QuestionContext>).detail);
    window.addEventListener(openFloatingQuestionEvent, open);
    return () => window.removeEventListener(openFloatingQuestionEvent, open);
  }, [openFor]);

  const submitted = () => {
    composer.current = { dirty: false, locked: false };
    setCreated(true);
    if (target) window.dispatchEvent(new CustomEvent(learningQuestionCreatedEvent, { detail: target }));
  };

  return <div className="floating-learning-question">
    {(panel.open || selected) && <section id="floating-learning-question" role="dialog" aria-labelledby="floating-learning-question-title" hidden={!panel.open} className="floating-learning-question-panel" onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); toggle(false); }
    }}>
      <header><h2 id="floating-learning-question-title">질문하기</h2><button ref={close} type="button" className="icon-btn" aria-label="닫기" onClick={() => toggle(false)}><X size={18} aria-hidden="true"/></button></header>
      <div className="floating-learning-question-body">
        {current ? <div className="floating-question-context"><b>{contextKey(target) === contextKey(current) ? '지금 보고 있는 수업' : '이어서 작성 중인 수업'}</b><span>{target?.label}</span>{contextKey(target) !== contextKey(current) && <button type="button" className="link" onClick={() => openFor(current)}>현재 수업으로 바꾸기</button>}</div> : <>
          <label className="field">어느 수업에서 막혔나요?
            {classes.size > 1 && <select aria-label="질문할 클래스" value={activeClass} onChange={event => {
              const next = event.target.value;
              openFor(contexts?.find(context => context.enrollmentId === next));
            }}>{[...classes].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
            <select aria-label="질문할 수업·일차" value={target?.lessonId || ''} onChange={event => openFor(lessons.find(context => context.lessonId === event.target.value))}>
              {!target && <option value="">{contexts ? '선택할 수업이 없어요' : '수업 목록 불러오는 중'}</option>}
              {target && !lessons.some(context => context.lessonId === target.lessonId) && <option value={target.lessonId}>{target.label}</option>}
              {lessons.map(context => <option key={context.lessonId} value={context.lessonId}>{context.label}</option>)}
            </select>
          </label>
          {loadFailed && <button type="button" className="link" onClick={() => setAttempt(value => value + 1)}>수업 목록 다시 불러오기</button>}
        </>}
        {created ? <p role="status">멘토 질문을 등록했어요. <Link href="/my/questions?view=mine">내 질문에서 확인하기</Link></p> : target && (
          process.env.NEXT_PUBLIC_EDU_CURRICULUM_AI_ENABLED === 'true'
            ? <CurriculumAiConversation key={contextKey(target)} context={target} showContext={false} compact onLessonPage={targetKey===contextKey(current)} onStateChange={update} onCreated={submitted}/>
            : <QuestionComposer key={contextKey(target)} initialContext={target} initialPrivate quick onStateChange={update} onCreated={submitted}/>
        )}
        <div className="floating-question-links"><Link href="/my/questions?view=general">결제·환불·계정은 일반 문의로</Link><Link href="/my/questions?view=mine">내 질문 모아보기</Link></div>
      </div>
    </section>}
    {!panel.open && <button ref={trigger} type="button" className="btn primary floating-learning-question-trigger" aria-expanded={panel.open} aria-controls={panel.open || selected ? 'floating-learning-question' : undefined} onClick={() => toggle(!panel.open)}>
      <MessageCircle size={17} aria-hidden="true"/>질문하기
    </button>}
  </div>;
}
