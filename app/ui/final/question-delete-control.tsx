'use client';

import { useRef, useState } from 'react';
import { questionRequest } from './question-composer';

type DeleteStatus = { canDelete: boolean; supported: boolean; headId: string | null; deletedAt?: string | null };
type DeleteResult = { id: string; deletedAt: string };

export function QuestionDeleteControl({ questionId, onDeleted }: { questionId: string; onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestNumber = useRef(0);
  const deleting = useRef(false);
  const requestBody = useRef<{ questionId: string; expectedHeadId: string | null } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'busy' | 'uncertain' | 'unsupported'>('loading');
  const [error, setError] = useState('');

  async function load() {
    const current = ++requestNumber.current;
    requestBody.current = null;
    setState('loading');
    setError('');
    try {
      const result = await questionRequest<DeleteStatus>('/api/platform/question-delete?' + new URLSearchParams({ question: questionId }));
      if (current !== requestNumber.current) return;
      if (!result.supported) { setState('unsupported'); return; }
      if (!result.canDelete) { dialog.current?.close(); onDeleted(); return; }
      requestBody.current = { questionId, expectedHeadId: result.headId };
      setState('ready');
    } catch (cause) {
      if (current !== requestNumber.current) return;
      setError((cause as Error).message);
      setState('loading');
    }
  }

  function open() {
    if (dialog.current?.open) return;
    dialog.current?.showModal();
    void load();
  }

  async function remove() {
    if (deleting.current || !requestBody.current || !['ready', 'uncertain'].includes(state)) return;
    deleting.current = true;
    const current = requestNumber.current;
    setState('busy');
    setError('');
    try {
      const result = await questionRequest<DeleteResult>('/api/platform/question-delete', requestBody.current);
      if (current !== requestNumber.current) return;
      if (result.id !== questionId || !result.deletedAt) throw new Error('삭제 결과를 확인하지 못했습니다. 다시 확인해 주세요.');
      dialog.current?.close();
      onDeleted();
    } catch (cause) {
      if (current !== requestNumber.current) return;
      const failure = cause as Error & { status?: number };
      setError(failure.message);
      setState(failure.status && failure.status < 500 ? 'loading' : 'uncertain');
    } finally {
      deleting.current = false;
    }
  }

  function close() {
    if (deleting.current) return;
    ++requestNumber.current;
    requestBody.current = null;
    dialog.current?.close();
  }

  return <>
    <button type="button" className="question-delete-trigger" onClick={open}>질문 삭제</button>
    <dialog ref={dialog} className="question-delete-dialog" aria-labelledby={'question-delete-title-' + questionId} onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id={'question-delete-title-' + questionId}>이 질문을 삭제할까요?</h2>
      <p>내 질문과 수업 화면에서 질문과 답변이 사라집니다. 공개 질문이었다면 같은 기수 수강생에게도 보이지 않습니다. 첨부 사진도 더 이상 열 수 없어요.</p>
      <p className="meta">삭제한 질문은 되돌릴 수 없습니다. 이미 받은 알림은 회수되지 않습니다.</p>
      {state === 'loading' && !error && <p role="status">삭제 가능 여부를 확인하고 있습니다.</p>}
      {state === 'unsupported' && <p role="status">질문 삭제 기능을 준비하고 있습니다.</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="question-delete-dialog-actions">
        <button type="button" className="btn" disabled={state === 'busy'} onClick={close}>취소</button>
        {state === 'loading' && error ? <button type="button" className="btn" onClick={() => void load()}>다시 확인</button> :
          <button type="button" className="btn primary" disabled={!['ready', 'uncertain'].includes(state)} onClick={() => void remove()}>{state === 'busy' ? '삭제 중…' : state === 'uncertain' ? '삭제 결과 다시 확인' : '질문 삭제'}</button>}
      </div>
    </dialog>
  </>;
}
