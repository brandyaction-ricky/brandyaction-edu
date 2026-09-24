import { redactJevText } from './conversion-jev';
import type { JevChoiceAnswer } from './conversion-review';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export const JEV_V4_CHOICES = {
  information_need: ['price_or_payment', 'schedule_or_deadline', 'curriculum_or_fit', 'skill_requirement', 'registration_or_access', 'other_or_unclear'],
  confirmed_barrier: ['explicit_price_burden', 'explicit_schedule_conflict', 'explicit_skill_concern', 'explicit_content_mismatch', 'explicit_trust_concern', 'none_stated', 'unclear'],
  attempted_action_target: ['free_live_or_replay', 'paid_application', 'paid_payment', 'other_nonpurchase_action', 'no_attempt_stated', 'unclear'],
  operational_issue: ['free_content_access_failure', 'paid_application_failure', 'paid_payment_failure', 'other_access_failure', 'none_stated', 'unclear'],
  paid_program_reference: ['future_consideration_after_free_content', 'paid_program_question', 'paid_application_or_payment', 'no_paid_reference', 'unclear'],
  observable_stage: ['no_purchase_signal', 'information_seeking', 'specific_evaluation', 'future_consideration_after_free_content', 'conditional_purchase_statement', 'paid_application_or_payment_attempt', 'unclear'],
} as const;

// Every question concerns what the customer actually said. A free content link
// leading to a checkout page is not evidence of an attempted paid purchase.
export const JEV_V4_QUESTIONS = {
  information_need: { type: 'choice', instructions: '문의에서 명시적으로 요청한 주된 정보를 고르세요. 무료 영상 이용 질문과 유료 교육 구매 질문을 혼동하지 마세요.', criteria: {
    price_or_payment: '가격, 할인, 할부 등 가격·결제 조건 질문',
    schedule_or_deadline: '일정, 마감, 신청 가능 기간 질문',
    curriculum_or_fit: '교육 내용, 방식, 적합성 질문',
    skill_requirement: '필요한 경험이나 수준 질문',
    registration_or_access: '신청, 결제, 무료 영상·다시보기 접근 방법 질문',
    other_or_unclear: '정보 요청이 없거나 주제를 특정할 수 없음',
  } },
  confirmed_barrier: { type: 'choice', instructions: '유료 교육 구매를 막는 우려나 제약을 고객이 직접 밝혔는지 판정하세요. 가격·일정·수준을 단순히 질문하거나 무료 영상을 보려는 것은 구매 장애물의 증거가 아닙니다.', criteria: {
    explicit_price_burden: '비용 부담이나 예산 부족을 직접 밝힘',
    explicit_schedule_conflict: '참여할 수 없는 시간 충돌을 직접 밝힘',
    explicit_skill_concern: '본인 역량 때문에 따라가기 어렵다고 직접 밝힘',
    explicit_content_mismatch: '내용이 목적에 맞지 않는다고 직접 밝힘',
    explicit_trust_concern: '제공자나 성과를 신뢰하기 어렵다고 직접 밝힘',
    none_stated: '구매를 막는 우려·제약을 직접 밝히지 않음',
    unclear: '직접 밝힌 구매 장애물인지 구분할 수 없음',
  } },
  attempted_action_target: { type: 'choice', instructions: '고객이 실제로 시도했다고 직접 밝힌 행동의 대상을 고르세요. 향후 유료 교육을 고려한다는 문장과 현재 무료 라이브·다시보기를 열려는 행동을 분리하세요. 단지 결제창이 나타났다는 사실만으로 유료 신청·결제 시도를 선택하지 마세요. 어떤 링크인지 기억나지 않거나 대상이 특정되지 않으면 무료 콘텐츠 접근으로 추정하지 말고 unclear를 선택하세요.', criteria: {
    free_live_or_replay: '무료 웨비나 생방송 또는 다시보기 영상·링크에 접근하려고 시도함',
    paid_application: '유료 교육 신청 버튼 또는 신청 양식을 실제로 시도함',
    paid_payment: '유료 교육 결제를 실제로 시도함',
    other_nonpurchase_action: '그 밖의 비구매 행동을 시도함',
    no_attempt_stated: '실제로 시도한 행동을 밝히지 않음',
    unclear: '행동의 대상을 원문만으로 구분할 수 없음',
  } },
  operational_issue: { type: 'choice', instructions: '실제로 겪었다고 밝힌 실패를 행동의 대상에 맞춰 고르세요. 무료 다시보기 링크가 결제창으로 연결되면 무료 콘텐츠 접근 실패이며, 고객이 유료 신청을 시도했다는 증거가 아닙니다. 오류가 난 링크·행동의 대상이 불명확하면 무료 접근 실패로 좁혀 추정하지 말고 unclear를 선택하세요.', criteria: {
    free_content_access_failure: '무료 방송·다시보기 링크 또는 영상 접근에 실패함',
    paid_application_failure: '유료 교육 신청 버튼·양식 시도 중 실패함',
    paid_payment_failure: '유료 교육 결제 시도 중 실패함',
    other_access_failure: '그 밖의 명시적 접근 실패',
    none_stated: '겪은 운영 실패를 밝히지 않음',
    unclear: '실패 여부나 대상을 구분할 수 없음',
  } },
  paid_program_reference: { type: 'choice', instructions: '문의 원문에 유료 교육이 직접 언급된 방식을 고르세요. 무료 영상이나 자료만 요청한 것은 유료 교육 언급이나 구매 관심이 아닙니다. “유료 교육은 아직 알아보지 않았다”, “신청할 생각이 없다”처럼 유료 관심을 부정하면 no_paid_reference를 선택하세요. 유료 언급이 실제로 있어도 무료 자료 요청만으로 유료 관심을 추론하지 마세요. 무료 영상을 본 뒤 유료 교육을 결정하겠다는 명시적 표현만 future_consideration_after_free_content입니다. 이는 유료 신청·결제를 이미 시도했다는 뜻이 아닙니다.', criteria: {
    future_consideration_after_free_content: '무료 방송·다시보기를 본 뒤 유료 교육을 결정·검토하겠다고 직접 밝힘',
    paid_program_question: '유료 교육의 가격·일정·내용·신청 방법 등을 직접 질문함',
    paid_application_or_payment: '유료 교육 신청·결제를 실제로 시도했다고 직접 밝힘',
    no_paid_reference: '유료 교육에 관한 표현이 없음, 무료 자료만 요청함, 또는 유료 관심을 명시적으로 부정함',
    unclear: '유료 교육에 관한 표현인지 구분할 수 없음',
  } },
  observable_stage: { type: 'choice', instructions: '유료 교육에 관해 직접 표현된 단계만 고르세요. 무료 자료만 요청했거나 유료 관심을 명시적으로 부정했다면 no_purchase_signal입니다. “무료 영상을 본 뒤 신청할지 결정하겠다”처럼 결정을 미룬 표현은 future_consideration_after_free_content입니다. “내용이 맞으면 신청하겠다”, “일정이 가능하면 구매하겠다”처럼 조건 충족 시 유료 신청·구매를 하겠다는 직접 약속은 conditional_purchase_statement입니다. “일정이 맞으면 참여를 검토하겠다”처럼 검토 의사만 밝힌 표현은 specific_evaluation으로 분류하고 conditional_purchase_statement로 올려 잡지 마세요. 두 표현을 혼동하지 마세요. 무료 자료 접근, 유료에 대한 단순 부정 또는 결제창 노출만으로 유료 관심·신청·결제를 추정하지 마세요. 유료 구매 의도·준비도 점수를 만들지 마세요.', criteria: {
    no_purchase_signal: '유료 교육에 관한 표현이 없음',
    information_seeking: '유료 교육의 일반 정보를 요청함',
    specific_evaluation: '유료 교육 조건을 구체적으로 검토하거나 비교함',
    future_consideration_after_free_content: '무료 콘텐츠를 본 뒤 유료 교육 신청 여부를 결정·검토하겠다고 직접 밝힘',
    conditional_purchase_statement: '조건이 맞으면 유료 교육을 신청·구매하겠다고 직접 밝힘',
    paid_application_or_payment_attempt: '유료 교육 신청·결제를 실제로 시도했다고 직접 밝힘',
    unclear: '유료 교육 관련 행동 단계를 구분할 수 없음',
  } },
} as const;

export type JevV4DecisionKey = keyof typeof JEV_V4_CHOICES;
export type JevV4ConsistencyFlag = 'paid_attempt_without_paid_target' | 'paid_failure_without_paid_target' | 'free_failure_without_free_target' | 'paid_reference_without_stage' | 'paid_stage_without_reference';
export type JevV4UncertaintyReason = 'unclear_choice' | 'unresolved_category' | 'low_reported_confidence' | 'narrow_probability_margin' | 'choice_not_top_probability';
export type JevV4UncertaintyFlag = { decision: JevV4DecisionKey; reason: JevV4UncertaintyReason };
export type JevV4Result = {
  contract_version: 4;
  model: string;
  decisions: { [K in JevV4DecisionKey]: JevChoiceAnswer };
  consistency_flags: JevV4ConsistencyFlag[];
  uncertainty_flags: JevV4UncertaintyFlag[];
};

export function jevV4UncertaintyFlags(decisions: JevV4Result['decisions']): JevV4UncertaintyFlag[] {
  const flags: JevV4UncertaintyFlag[] = [];
  for (const decision of Object.keys(JEV_V4_CHOICES) as JevV4DecisionKey[]) {
    const value = decisions[decision];
    const choice = value.choice;
    const probabilities = Object.entries(value.probabilities).sort((a, b) => b[1] - a[1]);
    if (choice === 'unclear') flags.push({ decision, reason: 'unclear_choice' });
    if (choice === 'other_or_unclear') flags.push({ decision, reason: 'unresolved_category' });
    if (value.confidence < 0.7) flags.push({ decision, reason: 'low_reported_confidence' });
    if (probabilities.length > 1 && probabilities[0][1] - probabilities[1][1] < 0.15) flags.push({ decision, reason: 'narrow_probability_margin' });
    if (probabilities[0]?.[0] !== choice) flags.push({ decision, reason: 'choice_not_top_probability' });
  }
  return flags;
}

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JEV_INVALID_RESPONSE');
  return value as Json;
}
function answer(value: unknown, allowed: readonly string[]): JevChoiceAnswer {
  const raw = object(value), probabilities = object(raw.probabilities);
  if (typeof raw.choice !== 'string' || !allowed.includes(raw.choice) || typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) throw new Error('JEV_INVALID_RESPONSE');
  const checked: Record<string, number> = {};
  for (const key of allowed) {
    const probability = probabilities[key];
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('JEV_INVALID_RESPONSE');
    checked[key] = probability;
  }
  return { type: 'choice', choice: raw.choice, confidence: raw.confidence, probabilities: checked };
}

export function jevV4ConsistencyFlags(decisions: JevV4Result['decisions']): JevV4ConsistencyFlag[] {
  const target = decisions.attempted_action_target.choice;
  const issue = decisions.operational_issue.choice;
  const flags: JevV4ConsistencyFlag[] = [];
  if (decisions.observable_stage.choice === 'paid_application_or_payment_attempt' && !['paid_application', 'paid_payment'].includes(target)) flags.push('paid_attempt_without_paid_target');
  if ((issue === 'paid_application_failure' && target !== 'paid_application') || (issue === 'paid_payment_failure' && target !== 'paid_payment')) flags.push('paid_failure_without_paid_target');
  if (issue === 'free_content_access_failure' && target !== 'free_live_or_replay') flags.push('free_failure_without_free_target');
  const reference = decisions.paid_program_reference.choice;
  const stage = decisions.observable_stage.choice;
  if (!['no_paid_reference', 'unclear'].includes(reference) && stage === 'no_purchase_signal') flags.push('paid_reference_without_stage');
  if (reference === 'no_paid_reference' && !['no_purchase_signal', 'unclear'].includes(stage)) flags.push('paid_stage_without_reference');
  return flags;
}

export async function createJevV4Judgment(subject: string, content: string, apiKey: string, requester: typeof fetch = fetch): Promise<JevV4Result> {
  if (!apiKey) throw new Error('JEV_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await requester(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state: { inquiry: redactJevText(`${subject}\n${content}`) }, questions: JEV_V4_QUESTIONS }),
      cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('JEV_UNAVAILABLE'); }
  if (!response.ok) throw new Error([429, 529].includes(response.status) ? 'JEV_BUSY' : 'JEV_UNAVAILABLE');
  let raw: Json;
  try { raw = object(await response.json()); } catch { throw new Error('JEV_INVALID_RESPONSE'); }
  const answers = object(raw.answers);
  const decisions: JevV4Result['decisions'] = {
    information_need: answer(answers.information_need, JEV_V4_CHOICES.information_need),
    confirmed_barrier: answer(answers.confirmed_barrier, JEV_V4_CHOICES.confirmed_barrier),
    attempted_action_target: answer(answers.attempted_action_target, JEV_V4_CHOICES.attempted_action_target),
    operational_issue: answer(answers.operational_issue, JEV_V4_CHOICES.operational_issue),
    paid_program_reference: answer(answers.paid_program_reference, JEV_V4_CHOICES.paid_program_reference),
    observable_stage: answer(answers.observable_stage, JEV_V4_CHOICES.observable_stage),
  };
  return { contract_version: 4, model: typeof raw.model === 'string' ? raw.model.slice(0, 100) : 'jev-latest', decisions,
    consistency_flags: jevV4ConsistencyFlags(decisions), uncertainty_flags: jevV4UncertaintyFlags(decisions) };
}
