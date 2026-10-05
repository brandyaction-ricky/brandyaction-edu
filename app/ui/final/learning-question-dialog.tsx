'use client';
import { useCallback, useRef, useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import type { QuestionContext } from '@/lib/question-hub';
import { AdminModal } from './admin-system';
import { QuestionComposer } from './question-composer';
import './learning-question-dialog.css';

export const learningQuestionCreatedEvent = 'edu:learning-question-created';

export function LearningQuestionShortcut({ context }: { context?: QuestionContext }) {
  const [open, setOpen] = useState(false), [created, setCreated] = useState(false), [closeNotice, setCloseNotice] = useState('');
  const composer = useRef({ dirty: false, locked: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const updateState = useCallback((state: { dirty: boolean; locked: boolean }) => { composer.current = state; }, []);
  function close() {
    if (composer.current.locked) { setCloseNotice('질문 등록·첨부가 끝날 때까지 잠시 기다려 주세요. 등록 결과가 불확실하면 먼저 다시 확인해 주세요.'); return; }
    if (composer.current.dirty && !window.confirm('작성 중인 질문이 있습니다. 저장하지 않고 닫을까요?')) return;
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return <>
    <button ref={trigger} type="button" className="link header-questions learning-question-trigger" aria-haspopup="dialog" disabled={!context} onClick={() => { composer.current = { dirty: false, locked: false }; setCreated(false); setCloseNotice(''); setOpen(true); }}>질문·답변</button>
    {open && context && <AdminModal title="이 수업에 질문하기" className="learning-question-dialog" initialFocus="textarea" onClose={close}>
      <div className="learning-question-body">
        {created ? <div className="learning-question-success" role="status"><Check aria-hidden="true"/><h3>질문을 등록했어요</h3><p>답변은 마이페이지의 ‘질문·답변’에서 확인할 수 있어요.</p><button autoFocus className="btn primary" onClick={close}>학습 계속하기</button></div> : <>
          <p className="learning-question-context"><MessageCircle size={18} aria-hidden="true"/><span><b>지금 보고 있는 수업</b>{context.label}</span></p>
          <p className="learning-question-hint">한 줄만 적어도 괜찮아요. 막힌 화면이 있으면 캡처를 첨부해 주세요.</p>
          <QuestionComposer initialContext={context} quick onStateChange={updateState} onCreated={() => { composer.current = { dirty: false, locked: false }; setCreated(true); setCloseNotice(''); window.dispatchEvent(new CustomEvent(learningQuestionCreatedEvent, { detail: { enrollmentId: context.enrollmentId, lessonId: context.lessonId } })); }}/>
        </>}
        {closeNotice && <p role="alert" className="form-error">{closeNotice}</p>}
      </div>
    </AdminModal>}
  </>;
}
