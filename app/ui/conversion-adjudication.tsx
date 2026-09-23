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
const v2Labels: Record<string, string> = {
  price_or_payment: '가격·결제 조건 질문', schedule_or_deadline: '일정·마감 질문', curriculum_or_fit: '교육 내용·적합성 질문',
  skill_requirement: '필요 역량 질문', registration_or_access: '신청·접근 방법 질문', other_or_unclear: '그 밖의 질문·불명확',
  explicit_price_burden: '비용 부담을 직접 밝힘', explicit_schedule_conflict: '일정 충돌을 직접 밝힘',
  explicit_skill_concern: '역량 우려를 직접 밝힘', explicit_content_mismatch: '내용 불일치를 직접 밝힘',
  explicit_trust_concern: '신뢰 우려를 직접 밝힘', none_stated: '직접 밝힌 내용 없음', unclear: '판단 보류',
  registration_failure: '신청 시도 실패', replay_access_failure: '다시보기 접근 실패', payment_process_failure: '결제 시도 실패',
  other_access_failure: '기타 접근 실패', no_purchase_signal: '구매 신호 없음', information_seeking: '정보 탐색',
  specific_evaluation: '구체적 조건 평가', conditional_purchase_statement: '조건부 구매 의사 명시',
  application_or_payment_attempt: '신청·결제 시도 명시',
};
const v3Labels: Record<string, string> = {
  ...v2Labels,
  free_live_or_replay: '무료 방송·다시보기 접근 시도', paid_application: '유료 교육 신청 시도', paid_payment: '유료 교육 결제 시도',
  other_nonpurchase_action: '기타 비구매 행동', no_attempt_stated: '시도한 행동 명시 없음',
  free_content_access_failure: '무료 콘텐츠 접근 실패', paid_application_failure: '유료 신청 실패', paid_payment_failure: '유료 결제 실패',
  paid_application_or_payment_attempt: '유료 신청·결제 시도 명시',
};
const v3FlagLabels: Record<string, string> = {
  paid_attempt_without_paid_target: '유료 신청·결제 시도 판정에 유료 행동 대상이 없습니다.',
  paid_failure_without_paid_target: '유료 신청·결제 실패 판정과 행동 대상이 다릅니다.',
  free_failure_without_free_target: '무료 콘텐츠 접근 실패 판정과 행동 대상이 다릅니다.',
};

function compared(result: JevResult, calibration: JevCalibration, dimension: JevDimension) {
  const answer = result.decisions[dimension];
  const predicted = dimension === 'purchase_readiness' ? Math.round(result.decisions.purchase_readiness.score) : (answer as { choice: string }).choice;
  return { predicted, human: calibration[dimension], same: predicted === calibration[dimension], confidence: answer.confidence };
}

export function ConversionAdjudication({ snapshot, pending, onSave, onRunV2, onRunV3, onRefresh, onSingle }: {
  snapshot: ConversionSnapshot;
  pending: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onRunV2: (runId: string) => Promise<void>;
  onRunV3: (runId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
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
  const [v2Busy, setV2Busy] = useState(false);
  const [v2Progress, setV2Progress] = useState('');
  const [v3Busy, setV3Busy] = useState(false);
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
  const v2Completed = new Set((snapshot.jev_v2_runs || []).filter(item => item.status === 'completed').map(item => item.v1_run_id));
  const remaining = candidates.filter(item => !v2Completed.has(item.run.id));
  const v2Selected = (snapshot.jev_v2_runs || []).find(item => item.v1_run_id === selected?.run.id);
  const v3Selected = (snapshot.jev_v3_runs || []).find(item => item.v1_run_id === selected?.run.id);

  async function runV2Batch() {
    if (v2Busy || pending || !snapshot.capabilities.can_jev_v2 || !remaining.length) return;
    setV2Busy(true); setError('');
    let completed = 0;
    try {
      for (const item of remaining) {
        setV2Progress(`v2 실험 판정 ${completed + 1}/${remaining.length}건 실행 중`);
        await onRunV2(item.run.id);
        completed += 1;
      }
      setV2Progress(`v2 실험 판정 ${completed}건 저장됨`);
    } catch (cause) {
      setError(`${completed}건 저장 후 중단되었습니다. ${(cause as Error).message} 저장된 건은 다시 실행하지 않습니다.`);
    } finally {
      await onRefresh();
      setV2Busy(false);
    }
  }

  async function runV3Selected() {
    if (!selected || v3Busy || pending || !snapshot.capabilities.can_jev_v3 || v3Selected?.status === 'completed') return;
    setV3Busy(true); setError('');
    try { await onRunV3(selected.run.id); await onRefresh(); }
    catch (cause) { setError((cause as Error).message); await onRefresh(); }
    finally { setV3Busy(false); }
  }

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
    {snapshot.capabilities.can_jev_v2 && <div className="conversion-v2-control">
      <div><strong>Jev 질문 계약 v2 · 실험</strong><p className="conversion-muted">과거 v1 원문만 다시 전송해 정보 요청·명시된 구매 장애물·운영 문제·관찰된 행동을 분리합니다. v1·사람 첫 판정은 수정하지 않습니다. 새 기준을 만든 20건의 결과이므로 정확도 검증으로 해석하지 마세요.</p></div>
      <AdminButton tone="primary" disabled={pending || v2Busy || remaining.length === 0} onClick={() => void runV2Batch()}>{v2Busy ? '실행 중' : remaining.length ? `남은 ${remaining.length}건 v2 실행` : 'v2 실행 완료'}</AdminButton>
      {v2Progress && <span role="status">{v2Progress}</span>}
    </div>}
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
        {snapshot.capabilities.can_jev_v2 && <div className="conversion-v2-result">
          <h4>v2 실험 판정 {v2Selected?.status === 'completed' ? '· 저장됨' : v2Selected?.status === 'failed' ? '· 재시도 가능' : v2Selected?.status === 'pending' ? '· 진행 중' : '· 실행 전'}</h4>
          {v2Selected?.status === 'completed' && v2Selected.result ? <dl>
            <dt>명시한 정보 요청</dt><dd>{v2Labels[v2Selected.result.decisions.information_need.choice]}</dd>
            <dt>직접 밝힌 구매 장애물</dt><dd>{v2Labels[v2Selected.result.decisions.confirmed_barrier.choice]}</dd>
            <dt>겪은 운영 문제</dt><dd>{v2Labels[v2Selected.result.decisions.operational_issue.choice]}</dd>
            <dt>관찰된 구매 행동</dt><dd>{v2Labels[v2Selected.result.decisions.observable_stage.choice]}</dd>
          </dl> : <p className="conversion-muted">v2 결과가 아직 없습니다. 위 버튼으로 남은 표본을 실행할 수 있습니다.</p>}
          <p className="conversion-muted">v2는 서로 다른 질문이라 v1 준비도 점수와 직접 비교할 수 없습니다. 결과는 운영자 검토용이며 자동 발송·상태 변경에 사용하지 않습니다.</p>
        </div>}
        {snapshot.capabilities.can_jev_v3 && <div className="conversion-v2-result">
          <h4>v3 행동 대상 구분 · 실험 {v3Selected?.status === 'completed' ? '· 저장됨' : v3Selected?.status === 'failed' ? '· 재시도 가능' : v3Selected?.status === 'pending' ? '· 진행 중' : '· 실행 전'}</h4>
          <p className="conversion-muted">무료 방송·다시보기 접근과 유료 신청·결제를 별도 질문으로 구분합니다. 먼저 선택한 문의만 실행해 경계 사례를 검수하세요.</p>
          <AdminButton disabled={pending || v3Busy || v2Busy || v3Selected?.status === 'completed'} onClick={() => void runV3Selected()}>{v3Busy ? '실행 중' : v3Selected?.status === 'completed' ? 'v3 저장 완료' : v3Selected?.status === 'pending' || v3Selected?.status === 'failed' ? '선택한 문의 v3 재시도' : '선택한 문의 v3 실행'}</AdminButton>
          {v3Selected?.status === 'completed' && v3Selected.result ? <>
            <dl>
              <dt>명시한 정보 요청</dt><dd>{v3Labels[v3Selected.result.decisions.information_need.choice]}</dd>
              <dt>직접 밝힌 구매 장애물</dt><dd>{v3Labels[v3Selected.result.decisions.confirmed_barrier.choice]}</dd>
              <dt>실제로 시도한 행동 대상</dt><dd>{v3Labels[v3Selected.result.decisions.attempted_action_target.choice]}</dd>
              <dt>겪은 운영 문제</dt><dd>{v3Labels[v3Selected.result.decisions.operational_issue.choice]}</dd>
              <dt>관찰된 유료 구매 행동</dt><dd>{v3Labels[v3Selected.result.decisions.observable_stage.choice]}</dd>
            </dl>
            {v3Selected.result.consistency_flags.length > 0 && <p role="alert" className="conversion-alert">판정 간 충돌: {v3Selected.result.consistency_flags.map(flag => v3FlagLabels[flag]).join(' ')} 운영자 검토가 필요합니다.</p>}
            {v3Selected.result.consistency_flags.length === 0 && <p className="conversion-muted">판정 간 형식적 충돌은 발견되지 않았습니다. 원문과의 일치 여부는 운영자가 확인해야 합니다.</p>}
          </> : <p className="conversion-muted">v3 결과가 아직 없습니다.</p>}
          <p className="conversion-muted">v3도 고객 응대·CRM·상태 변경에 자동 적용되지 않습니다. 기존 v1·사람 첫 의견·v2 결과는 그대로 보존합니다.</p>
        </div>}
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
