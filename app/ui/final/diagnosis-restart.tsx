'use client';
import { useId, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

/** The API and database independently enforce the administrator role. */
export function DiagnosisRestart({ onRestart, disabled = false }: { onRestart: () => Promise<void>; disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), titleId = useId();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  async function restart() {
    if (locked.current) return;
    locked.current = true; setPending(true); setError('');
    try { await onRestart(); dialog.current?.close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '새 검사를 준비하지 못했습니다. 다시 시도해 주세요.'); }
    finally { locked.current = false; setPending(false); }
  }
  return <div className="diagnosis-restart">
    <button type="button" className="diagnosis-restart-trigger" disabled={disabled} onClick={() => { setError(''); dialog.current?.showModal(); }}><RotateCcw size={16} aria-hidden="true"/>다시 진단하기</button>
    <dialog ref={dialog} className="diagnosis-restart-dialog" aria-labelledby={titleId} onCancel={event => { if (pending) event.preventDefault(); }}>
      <p className="diagnosis-restart-eyebrow">관리자 검수용</p>
      <h2 id={titleId}>새 검사로 다시 시작할까요?</h2>
      <p>이전 답변과 보고서는 기록에 보관됩니다.<br/>이 화면에서는 새 검사를 진행하게 됩니다.</p>
      <p>빠르게 선택한 응답도 보고서 생성 단계로 넘어갈 수 있습니다. 제출하면 보고서 생성 비용이 발생할 수 있습니다.</p>
      {error && <p role="alert">{error}</p>}
      <div className="diagnosis-restart-actions"><button type="button" disabled={pending} autoFocus onClick={() => dialog.current?.close()}>취소</button><button type="button" className="confirm" disabled={pending} onClick={() => void restart()}>{pending ? '새 검사 준비 중…' : '새 검사 시작'}</button></div>
    </dialog>
  </div>;
}
