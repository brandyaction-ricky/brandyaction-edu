'use client';

import { useState } from 'react';
import type { JevV4BoundaryCaseId } from '@/lib/conversion-jev-v4-boundary-cases';
import type { JevV4DecisionKey, JevV4Result, JevV4UncertaintyFlag } from '@/lib/conversion-jev-v4';
import { AdminButton } from './final/admin-system';

type SyntheticCaseResult = {
  case: { id: JevV4BoundaryCaseId; title: string; subject: string; content: string; reviewGuide: string };
  result: JevV4Result;
};

const labels: Record<JevV4DecisionKey, string> = {
  information_need: '명시한 정보 요청', confirmed_barrier: '직접 밝힌 구매 장애물',
  attempted_action_target: '실제로 시도한 행동 대상', operational_issue: '겪은 운영 문제',
  paid_program_reference: '유료 교육에 대한 직접 언급', observable_stage: '관찰된 유료 구매 행동',
};
const choices: Record<string, string> = {
  price_or_payment: '가격·결제 질문', schedule_or_deadline: '일정·마감 질문', curriculum_or_fit: '내용·적합성 질문',
  skill_requirement: '필요 역량 질문', registration_or_access: '신청·접근 질문', other_or_unclear: '그 밖의 질문·불명확',
  explicit_price_burden: '비용 부담 명시', explicit_schedule_conflict: '일정 충돌 명시', explicit_skill_concern: '역량 우려 명시',
  explicit_content_mismatch: '내용 불일치 명시', explicit_trust_concern: '신뢰 우려 명시', none_stated: '직접 밝힌 내용 없음', unclear: '판단 보류',
  free_live_or_replay: '무료 방송·다시보기 접근', paid_application: '유료 신청', paid_payment: '유료 결제',
  other_nonpurchase_action: '그 밖의 행동', no_attempt_stated: '시도 언급 없음',
  free_content_access_failure: '무료 콘텐츠 접근 실패', paid_application_failure: '유료 신청 실패', paid_payment_failure: '유료 결제 실패', other_access_failure: '그 밖의 접근 실패',
  future_consideration_after_free_content: '무료 콘텐츠 이후 유료 교육 검토', paid_program_question: '유료 교육 조건 질문',
  paid_application_or_payment: '유료 신청·결제 시도 명시', no_paid_reference: '유료 언급 없음',
  no_purchase_signal: '유료 구매 신호 언급 없음', information_seeking: '유료 정보 탐색', specific_evaluation: '구체 조건 검토',
  conditional_purchase_statement: '조건부 신청·구매 의사', paid_application_or_payment_attempt: '유료 신청·결제 시도 명시',
};
const consistencyLabels: Record<string, string> = {
  paid_attempt_without_paid_target: '유료 신청·결제 단계인데 실제 시도 대상이 유료로 판정되지 않음',
  paid_failure_without_paid_target: '유료 신청·결제 실패인데 시도 대상이 유료로 판정되지 않음',
  free_failure_without_free_target: '무료 콘텐츠 실패인데 시도 대상이 무료로 판정되지 않음',
  paid_reference_without_stage: '유료 언급은 있으나 행동 단계는 구매 신호 없음',
  paid_stage_without_reference: '유료 언급은 없으나 행동 단계는 유료 신호 있음',
};
const uncertaintyLabels: Record<JevV4UncertaintyFlag['reason'], string> = {
  unclear_choice: '모델이 판단 보류를 선택함',
  unresolved_category: '정보 없음과 불명확이 한 선택지에 합쳐짐',
  low_reported_confidence: '모델 표시 신뢰도 70% 미만',
  narrow_probability_margin: '상위 선택지 확률 차이가 15%p 미만',
  choice_not_top_probability: '선택값과 가장 높은 확률 항목이 다름',
};

export function ConversionJevV4Synthetic() {
  const [results, setResults] = useState<SyntheticCaseResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function runAll() {
    if (busy) return;
    setBusy(true); setError(''); setResults([]);
    const completed: SyntheticCaseResult[] = [];
    try {
      const casesResponse = await fetch('/api/conversion/jev-v4-synthetic/cases', { cache: 'no-store' });
      if (!casesResponse.ok) throw new Error('합성 사례 목록을 불러오지 못했습니다.');
      const { cases } = await casesResponse.json() as { cases: Array<{ id: JevV4BoundaryCaseId; title: string; subject: string; content: string }> };
      for (const [index, testCase] of cases.entries()) {
        setProgress(`합성 경계 사례 ${index + 1}/${cases.length} 판정 중`);
        const response = await fetch('/api/conversion/jev-v4-synthetic', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: testCase.id }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Jev 판정을 완료하지 못했습니다.');
        completed.push(payload as SyntheticCaseResult);
        setResults([...completed]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '합성 경계 사례를 완료하지 못했습니다.');
    } finally {
      setBusy(false); setProgress('');
    }
  }

  return <section className="conversion-v2-result" aria-label="Jev v4 합성 경계 사례 DEV 시험">
    <h4>새 합성 경계 사례 · DEV 전용 · 저장하지 않음</h4>
    <p className="conversion-muted">실제 상담 원문을 쓰지 않습니다. 새로 만든 사례를 Jev에 한 번씩 보내고 결과는 이 화면에만 표시합니다. 기존 20건의 설계 표본은 정확도 분모에서 제외합니다.</p>
    <AdminButton disabled={busy} onClick={() => void runAll()}>{busy ? '합성 사례 판정 중' : '8개 새 경계 사례 실행'}</AdminButton>
    {progress && <p role="status" className="conversion-muted">{progress}</p>}
    {error && <p role="alert" className="conversion-alert">{error}</p>}
    {results.map(({ case: testCase, result }) => {
      const uncertaintyByDecision = new Map<JevV4DecisionKey, JevV4UncertaintyFlag[]>();
      for (const flag of result.uncertainty_flags) uncertaintyByDecision.set(flag.decision, [...(uncertaintyByDecision.get(flag.decision) || []), flag]);
      return <article key={testCase.id} className="conversion-synthetic-case">
        <h5>{testCase.title}</h5>
        <p className="conversion-quote">{testCase.subject}<br />{testCase.content}</p>
        <p className="conversion-muted">검토 포인트: {testCase.reviewGuide}</p>
        <dl>{(Object.keys(labels) as JevV4DecisionKey[]).map(key => {
          const decision = result.decisions[key];
          const uncertainty = uncertaintyByDecision.get(key) || [];
          return <div key={key}><dt>{labels[key]}</dt><dd>{choices[decision.choice] || decision.choice} · 표시 신뢰도 {Math.round(decision.confidence * 100)}%{uncertainty.length ? ` · 검토 신호: ${uncertainty.map(flag => uncertaintyLabels[flag.reason]).join(', ')}` : ''}</dd></div>;
        })}</dl>
        {result.consistency_flags.length > 0 && <p role="alert" className="conversion-alert">판정 간 형식 충돌: {result.consistency_flags.map(flag => consistencyLabels[flag] || flag).join(' · ')}. 원문 근거를 확인하세요.</p>}
        {result.uncertainty_flags.length === 0 && result.consistency_flags.length === 0 && <p className="conversion-muted">표시된 불확실성·형식 충돌은 없지만, 원문과의 일치나 정확성을 확인한 것은 아닙니다.</p>}
      </article>;
    })}
    {results.length > 0 && <p className="conversion-muted">모델 표시 신뢰도와 선택 확률은 정답 확률로 검증되지 않았습니다. 사례별 판정은 경계 점검 자료이며 독립된 실제 고객 표본의 정확도 수치가 아닙니다.</p>}
  </section>;
}
