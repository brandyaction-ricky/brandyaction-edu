'use client';

import { useState, type FormEvent } from 'react';
import type { ConversionAdjudicationNote, ConversionSnapshot, JevCalibration, JevDimension, JevResult } from '@/lib/conversion-review';
import { isRunStale } from '@/lib/conversion-review';
import { AdminButton, AdminEmptyState, AdminSelect, AdminTextarea } from './final/admin-system';

const dimensions: { key: JevDimension; label: string }[] = [
  { key: 'purchase_intent', label: '구매 의도' },
  { key: 'primary_barrier', label: '주요 장애물' },
  { key: 'purchase_readiness', label: '구매 준비도' },
  { key: 'next_action', label: '다음 행동' },
];
const choiceNames: Record<string, string> = {
  high: '높음', medium: '중간', low: '낮음', unclear: '판단 보류',
  price: '가격', schedule: '일정', skill_level: '수강 수준', content_fit: '내용 적합성', trust: '신뢰', none_or_unknown: '불명확',
  answer_specific_questions: '질문에 구체적으로 답변', invite_webinar: '무료 웨비나 안내', offer_purchase_info: '구매 절차 안내',
  human_consult: '운영자 상담', hold_no_contact: '추가 접촉 보류',
};
const assessmentNames: Record<ConversionAdjudicationNote['assessment'], string> = {
  human_better_supported: '사람 판정의 근거가 더 분명함',
  jev_better_supported: 'Jev 판정의 근거가 더 분명함',
  both_plausible: '두 해석 모두 가능',
  neither_supported: '어느 쪽도 충분히 뒷받침되지 않음',
  insufficient_evidence: '주어진 정보만으로 판단 보류',
};
const basisNames: Record<ConversionAdjudicationNote['basis'], string> = {
  explicit_signal: '문의에 명시된 행동·표현',
  interpretation: '문맥 해석',
  category_gap: '분류 기준·선택지의 공백',
  missing_context: '추가 맥락 부족',
};

function compared(result: JevResult, calibration: JevCalibration, dimension: JevDimension) {
  const answer = result.decisions[dimension];
  const predicted = dimension === 'purchase_readiness' ? Math.round(result.decisions.purchase_readiness.score) : (answer as { choice: string }).choice;
  return { predicted, human: calibration[dimension], same: predicted === calibration[dimension], confidence: answer.confidence };
}

export function ConversionAdjudication({ snapshot, pending, onSave, onSingle }: {
  snapshot: ConversionSnapshot;
  pending: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onSingle: () => void;
}) {
  const candidates = snapshot.cases.flatMap(inquiry => {
    const first = snapshot.reviews.filter(review => review.case_id === inquiry.id && review.calibration)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
    const run = snapshot.runs.find(item => item.id === first?.run_id);
    if (!first || first.calibration_sample_kind !== 'operational' || !first.calibration || !run || run.result.mode !== 'jev') return [];
    const result = run.result as JevResult;
    const differences = dimensions.filter(item => !compared(result, first.calibration!, item.key).same).length;
    return [{ inquiry, run, review: first, result, differences }];
  }).sort((a, b) => b.differences - a.differences || a.inquiry.received_at.localeCompare(b.inquiry.received_at));
  const [selectedId, setSelectedId] = useState('');
  const [dimension, setDimension] = useState<JevDimension>('purchase_intent');
  const [assessment, setAssessment] = useState<ConversionAdjudicationNote['assessment'] | ''>('');
  const [basis, setBasis] = useState<ConversionAdjudicationNote['basis'] | ''>('');
  const [rationale, setRationale] = useState('');
  const [error, setError] = useState('');
  const selected = candidates.find(item => item.inquiry.id === selectedId) || candidates[0];
  const selectedRows = selected ? dimensions.map(item => ({ ...item, ...compared(selected.result, selected.review.calibration!, item.key) })) : [];
  const activeDimension = (selectedId && selectedRows.find(item => item.key === dimension)) || selectedRows.find(item => !item.same) || selectedRows[0];
  const notes = (snapshot.adjudications || []).filter(note => note.run_id === selected?.run.id && note.dimension === activeDimension?.key);
  const covered = new Set((snapshot.adjudications || []).map(note => `${note.run_id}:${note.dimension}`));
  const eligibleNotes = candidates.reduce((total, item) => total + dimensions.filter(part => !compared(item.result, item.review.calibration!, part.key).same).length, 0);
  const coveredDifferences = candidates.reduce((total, item) => total + dimensions.filter(part => !compared(item.result, item.review.calibration!, part.key).same && covered.has(`${item.run.id}:${part.key}`)).length, 0);
  const highConfidenceDifferences = candidates.reduce((total, item) => total + dimensions.filter(part => {
    const value = compared(item.result, item.review.calibration!, part.key);
    return !value.same && value.confidence >= 0.7;
  }).length, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !activeDimension || !assessment || !basis || rationale.trim().length < 10 || pending) return;
    setError('');
    try {
      await onSave({ run_id: selected.run.id, calibration_review_id: selected.review.id,
        dimension: activeDimension.key, assessment, basis, rationale: rationale.trim() });
      setAssessment(''); setBasis(''); setRationale('');
    } catch (cause) { setError((cause as Error).message); }
  }

  return <section className="conversion-adjudication" aria-label="판정 차이 재검토">
    <div className="conversion-adjudication-head">
      <div><h2>판정 차이 재검토</h2><p className="conversion-muted">첫 사람 판정과 Jev 판정은 각각 보존합니다. 여기에는 어느 쪽이 정답인지 단정하지 않고 근거와 해석의 한계를 별도 의견으로 남깁니다.</p></div>
      <AdminButton onClick={onSingle}>개별 검토로 돌아가기</AdminButton>
    </div>
    <div className="conversion-batch-progress" role="status">실제 문의 {candidates.length}건 · 의견 차이 {eligibleNotes}항목 · 재검토 의견이 있는 차이 {coveredDifferences}항목 · Jev 표시 신뢰도 70% 이상인 차이 {highConfidenceDifferences}항목</div>
    <p className="conversion-muted">일치율과 Jev의 신뢰도는 정확도가 아닙니다. 같은 선택이어도 둘 다 근거가 약할 수 있습니다. 이 화면은 고객 답변·상태·모집 성과를 바꾸지 않습니다.</p>
    {!selected ? <AdminEmptyState compact title="검토할 실제 상담이 없습니다.">Jev 그림자 판정과 첫 독립 판정이 있는 실제 문의만 표시합니다.</AdminEmptyState> : <div className="conversion-adjudication-grid">
      <div className="conversion-adjudication-list" aria-label="재검토할 상담">
        {candidates.map(item => <button type="button" key={item.inquiry.id} aria-pressed={selected.inquiry.id === item.inquiry.id} className={'conversion-case' + (selected.inquiry.id === item.inquiry.id ? ' is-selected' : '')} onClick={() => { setSelectedId(item.inquiry.id); setDimension(dimensions.find(part => !compared(item.result, item.review.calibration!, part.key).same)?.key || 'purchase_intent'); setAssessment(''); setBasis(''); setRationale(''); setError(''); }}>
          <strong>{item.inquiry.subject}</strong><small>{item.inquiry.legacy_course_label || snapshot.courses.find(course => course.id === item.inquiry.course_id)?.title || '연결 상품'} · 차이 {item.differences}항목</small>
        </button>)}
      </div>
      <div className="conversion-adjudication-detail">
        <h3>{selected.inquiry.subject}</h3><p className="conversion-quote">{selected.run.input_snapshot?.content || selected.inquiry.content}</p>
        {isRunStale(selected.run, selected.inquiry, snapshot.evidence) && <p role="alert" className="conversion-alert">문의나 자료가 변경됐습니다. 이 기록에는 재검토 의견을 저장할 수 없습니다.</p>}
        <div className="conversion-adjudication-rows" aria-label="항목별 첫 의견 비교">
          {selectedRows.map(item => <button type="button" key={item.key} className={activeDimension?.key === item.key ? 'is-selected' : ''} aria-pressed={activeDimension?.key === item.key} onClick={() => { setDimension(item.key); setAssessment(''); setBasis(''); setRationale(''); setError(''); }}>
            <strong>{item.label}</strong><span>사람 {item.key === 'purchase_readiness' ? `${item.human}/4` : choiceNames[String(item.human)]}</span><span>Jev {item.key === 'purchase_readiness' ? `${selected.result.decisions.purchase_readiness.score.toFixed(1)}/4 (비교 범주 ${item.predicted})` : choiceNames[String(item.predicted)]} · 표시 신뢰도 {Math.round(item.confidence * 100)}%</span><b>{item.same ? '같은 선택' : '의견 차이'}</b>
          </button>)}
        </div>
        {activeDimension && <form onSubmit={event => void submit(event)} className="conversion-adjudication-form">
          <h4>{activeDimension.label} 재검토 의견</h4>
          <p className="conversion-muted">상담 원문에서 확인되는 내용과 추론을 구분해 적어 주세요. 원래 독립 판정과 Jev 결과는 수정되지 않습니다.</p>
          <AdminSelect label="재검토 결론" required value={assessment} onChange={event => setAssessment(event.target.value as ConversionAdjudicationNote['assessment'])} disabled={pending}>
            <option value="">선택</option>
            {Object.entries(assessmentNames).filter(([key]) => !activeDimension.same || !['human_better_supported', 'jev_better_supported'].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </AdminSelect>
          <AdminSelect label="판단의 근거 유형" required value={basis} onChange={event => setBasis(event.target.value as ConversionAdjudicationNote['basis'])} disabled={pending}>
            <option value="">선택</option>{Object.entries(basisNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </AdminSelect>
          <AdminTextarea label="근거와 남은 불확실성" required minLength={10} maxLength={1000} value={rationale} onChange={event => setRationale(event.target.value)} disabled={pending || isRunStale(selected.run, selected.inquiry, snapshot.evidence)} helper="고객 이름·연락처·링크를 넣지 마세요. 재검토 의견은 판정 정확도나 실제 구매 성과가 아닙니다." />
          {error && <p role="alert" className="conversion-alert">{error}</p>}
          <AdminButton type="submit" tone="primary" disabled={pending || isRunStale(selected.run, selected.inquiry, snapshot.evidence) || !assessment || !basis || rationale.trim().length < 10}>재검토 의견 저장</AdminButton>
        </form>}
        {notes.length > 0 && <div className="conversion-adjudication-history"><h4>저장된 재검토 의견</h4>{notes.map(note => <article key={note.id}><strong>{assessmentNames[note.assessment]}</strong><span>{basisNames[note.basis]} · {new Date(note.created_at).toLocaleString('ko-KR')}</span><p>{note.rationale}</p></article>)}</div>}
      </div>
    </div>}
  </section>;
}
