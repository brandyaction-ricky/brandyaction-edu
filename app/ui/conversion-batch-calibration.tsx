'use client';

import { useState } from 'react';
import { historicalCalibrationQueue, type ConversionSnapshot, type JevCalibration } from '@/lib/conversion-review';
import { AdminButton, AdminEmptyState, AdminSection, AdminSelect } from './final/admin-system';

type Draft = { purchase_intent: string; primary_barrier: string; purchase_readiness: string; next_action: string };
export type BatchCalibrationSubmission = { caseId: string; runId: string; calibration: JevCalibration };

const blank: Draft = { purchase_intent: '', primary_barrier: '', purchase_readiness: '', next_action: '' };
const complete = (draft?: Draft) => Boolean(draft?.purchase_intent && draft.primary_barrier && draft.purchase_readiness !== '' && draft.next_action);

export function ConversionBatchCalibration({ snapshot, pending, onSave, onSingle }: {
  snapshot: ConversionSnapshot;
  pending: boolean;
  onSave: (items: BatchCalibrationSubmission[]) => Promise<void>;
  onSingle: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const queue = historicalCalibrationQueue(snapshot);
  const ready = queue.filter(item => complete(drafts[item.run.id]));
  const waitingForAnalysis = snapshot.cases.filter(item => item.sample_origin === 'external_legacy'
    && !item.subject.startsWith('[DEV 검증]')
    && !snapshot.reviews.some(review => review.case_id === item.id && review.calibration)).length - queue.length;

  function setField(runId: string, field: keyof Draft, value: string) {
    setDrafts(previous => ({ ...previous, [runId]: { ...(previous[runId] || blank), [field]: value } }));
    setConfirmed(false);
  }

  async function submit() {
    if (!confirmed || !ready.length || saving || pending) return;
    setSaving(true);
    setError('');
    try {
      await onSave(ready.map(({ inquiry, run }) => {
        const draft = drafts[run.id];
        return { caseId: inquiry.id, runId: run.id, calibration: {
          purchase_intent: draft.purchase_intent as JevCalibration['purchase_intent'],
          primary_barrier: draft.primary_barrier as JevCalibration['primary_barrier'],
          purchase_readiness: Number(draft.purchase_readiness) as JevCalibration['purchase_readiness'],
          next_action: draft.next_action as JevCalibration['next_action'],
        } };
      }));
      setConfirmed(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="conversion-batch" aria-label="과거 상담 일괄 독립 판정" aria-busy={saving || pending}>
    <AdminSection title="과거 상담 일괄 독립 판정" description="준비된 상담을 한 화면에서 읽고 사람 판단을 저장합니다." bordered actions={<AdminButton disabled={saving || pending} onClick={onSingle}>개별 검토로 돌아가기</AdminButton>}>
      <p className="conversion-muted">Jev 판단·제안 답변·일치율은 이 화면에 표시하지 않습니다. 상담별 네 항목을 문의 원문만 보고 선택하세요. 여기서 저장한 판단은 고객에게 발송되지 않습니다.</p>
      <div className="conversion-batch-progress" role="status">판정 대기 <strong>{queue.length}건</strong> · 네 항목 입력 완료 <strong>{ready.length}건</strong> · Jev 분석 준비 전 <strong>{Math.max(0, waitingForAnalysis)}건</strong></div>
      {!queue.length && <AdminEmptyState compact title="일괄 판정할 상담이 없습니다.">비식별 상담을 등록하고 승인 범위에서 Jev 그림자 판정을 실행하면 여기에 표시됩니다.</AdminEmptyState>}
      <div className="conversion-batch-list">
        {queue.map(({ inquiry, run }, index) => {
          const draft = drafts[run.id] || blank;
          return <article className="conversion-batch-card" key={run.id} aria-label={`${index + 1}번 상담 독립 판정`}>
            <div className="conversion-batch-heading"><span className="conversion-tag">{index + 1} / {queue.length}</span><strong>{inquiry.subject}</strong><span className="conversion-muted">{inquiry.legacy_course_label || '당시 상품 미확인'} · {new Date(inquiry.received_at).toLocaleDateString('ko-KR')}</span>{complete(draft) && <span className="conversion-tag">입력 완료</span>}</div>
            <p className="conversion-quote">{inquiry.content}</p>
            <div className="conversion-batch-fields">
              <AdminSelect label={`${index + 1}번 · 구매 의도`} value={draft.purchase_intent} onChange={event => setField(run.id, 'purchase_intent', event.target.value)} disabled={saving || pending}><option value="">선택</option><option value="high">높음</option><option value="medium">중간</option><option value="low">낮음</option><option value="unclear">판단 보류</option></AdminSelect>
              <AdminSelect label={`${index + 1}번 · 주요 장애물`} value={draft.primary_barrier} onChange={event => setField(run.id, 'primary_barrier', event.target.value)} disabled={saving || pending}><option value="">선택</option><option value="price">가격</option><option value="schedule">일정</option><option value="skill_level">수강 수준</option><option value="content_fit">내용 적합성</option><option value="trust">신뢰</option><option value="none_or_unknown">불명확</option></AdminSelect>
              <AdminSelect label={`${index + 1}번 · 구매 준비도`} value={draft.purchase_readiness} onChange={event => setField(run.id, 'purchase_readiness', event.target.value)} disabled={saving || pending}><option value="">선택</option><option value="0">0 · 정보 부족</option><option value="1">1 · 관심 탐색</option><option value="2">2 · 비교 검토</option><option value="3">3 · 구매 직전</option><option value="4">4 · 구매 결정</option></AdminSelect>
              <AdminSelect label={`${index + 1}번 · 다음 행동`} value={draft.next_action} onChange={event => setField(run.id, 'next_action', event.target.value)} disabled={saving || pending}><option value="">선택</option><option value="answer_specific_questions">질문에 구체적으로 답변</option><option value="invite_webinar">무료 웨비나 안내</option><option value="offer_purchase_info">구매 절차 안내</option><option value="human_consult">운영자 상담</option><option value="hold_no_contact">추가 접촉 보류</option></AdminSelect>
            </div>
          </article>;
        })}
      </div>
      {queue.length > 0 && <div className="conversion-batch-actions">
        <label className="conversion-batch-confirm"><input type="checkbox" checked={confirmed} disabled={saving || pending || !ready.length} onChange={event => setConfirmed(event.target.checked)} /> 입력 완료한 {ready.length}건이 실제 고객의 구매 전 상담이며, 검수·연습용이 아님을 확인합니다.</label>
        <p className="conversion-muted">완료한 건만 저장합니다. 아직 입력하지 않은 상담은 대기열에 남고, 저장 중 일부 실패하면 완료된 건은 유지됩니다.</p>
        {error && <p role="alert" className="conversion-alert">{error}</p>}
        <AdminButton tone="primary" disabled={!confirmed || !ready.length || saving || pending} onClick={() => void submit()}>{saving || pending ? '저장 중' : `입력 완료 ${ready.length}건 한 번에 저장`}</AdminButton>
      </div>}
    </AdminSection>
  </section>;
}
