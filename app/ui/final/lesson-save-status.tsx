import { Check, CircleAlert, Clock3 } from 'lucide-react';
import type { AutosaveState } from '@/lib/lesson-block-autosave';

const labels: Record<AutosaveState['phase'], string> = {
  saved: '답변 저장됨', dirty: '답변 저장 대기 중', saving: '답변 저장 중…',
  error: '답변을 저장하지 못했습니다.', conflict: '저장된 답변과 현재 입력이 다릅니다.',
};

export function LessonSaveStatus({ status, hasDraft, practice, onSave }: {
  status: AutosaveState; hasDraft: boolean; practice?: boolean; onSave: () => void;
}) {
  const { phase } = status;
  const ready = phase === 'saved' && !status.updatedAt && !hasDraft;
  const tone = ready ? 'ready' : phase;
  const Icon = tone === 'saved' ? Check : phase === 'error' || phase === 'conflict' ? CircleAlert : Clock3;
  return <div className="lb-save-status" data-phase={tone}>
    <span role="status" aria-atomic="true"><Icon aria-hidden="true" size={15} />
      {practice ? '개인 실습 · ' : ''}{ready ? '답변 자동 저장' : labels[phase]}
    </span>
    {(phase === 'dirty' || phase === 'error') && <button type="button" className="btn small" onClick={onSave}>
      {phase === 'error' ? '저장 다시 시도' : '지금 저장'}
    </button>}
  </div>;
}
