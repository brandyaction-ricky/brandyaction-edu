import { redactJevText } from './conversion-jev';
import type { JevChoiceAnswer } from './conversion-review';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export const JEV_V3_CHOICES = {
  information_need: ['price_or_payment', 'schedule_or_deadline', 'curriculum_or_fit', 'skill_requirement', 'registration_or_access', 'other_or_unclear'],
  confirmed_barrier: ['explicit_price_burden', 'explicit_schedule_conflict', 'explicit_skill_concern', 'explicit_content_mismatch', 'explicit_trust_concern', 'none_stated', 'unclear'],
  attempted_action_target: ['free_live_or_replay', 'paid_application', 'paid_payment', 'other_nonpurchase_action', 'no_attempt_stated', 'unclear'],
  operational_issue: ['free_content_access_failure', 'paid_application_failure', 'paid_payment_failure', 'other_access_failure', 'none_stated', 'unclear'],
  observable_stage: ['no_purchase_signal', 'information_seeking', 'specific_evaluation', 'conditional_purchase_statement', 'paid_application_or_payment_attempt', 'unclear'],
} as const;

// Every question concerns what the customer actually said. A free content link
// leading to a checkout page is not evidence of an attempted paid purchase.
export const JEV_V3_QUESTIONS = {
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
  attempted_action_target: { type: 'choice', instructions: '고객이 실제로 시도했다고 직접 밝힌 행동의 대상을 고르세요. 향후 유료 교육을 고려한다는 문장과 현재 무료 라이브·다시보기를 열려는 행동을 분리하세요. 단지 결제창이 나타났다는 사실만으로 유료 신청·결제 시도를 선택하지 마세요.', criteria: {
    free_live_or_replay: '무료 웨비나 생방송 또는 다시보기 영상·링크에 접근하려고 시도함',
    paid_application: '유료 교육 신청 버튼 또는 신청 양식을 실제로 시도함',
    paid_payment: '유료 교육 결제를 실제로 시도함',
    other_nonpurchase_action: '그 밖의 비구매 행동을 시도함',
    no_attempt_stated: '실제로 시도한 행동을 밝히지 않음',
    unclear: '행동의 대상을 원문만으로 구분할 수 없음',
  } },
  operational_issue: { type: 'choice', instructions: '실제로 겪었다고 밝힌 실패를 행동의 대상에 맞춰 고르세요. 무료 다시보기 링크가 결제창으로 연결되면 무료 콘텐츠 접근 실패이며, 고객이 유료 신청을 시도했다는 증거가 아닙니다.', criteria: {
    free_content_access_failure: '무료 방송·다시보기 링크 또는 영상 접근에 실패함',
    paid_application_failure: '유료 교육 신청 버튼·양식 시도 중 실패함',
    paid_payment_failure: '유료 교육 결제 시도 중 실패함',
    other_access_failure: '그 밖의 명시적 접근 실패',
    none_stated: '겪은 운영 실패를 밝히지 않음',
    unclear: '실패 여부나 대상을 구분할 수 없음',
  } },
  observable_stage: { type: 'choice', instructions: '유료 교육에 관해 직접 표현된 행동만 고르세요. 무료 콘텐츠 접근이나 결제창 노출을 유료 교육 신청·결제 시도로 추정하지 마세요. 유료 구매 의도·준비도 점수를 만들지 마세요.', criteria: {
    no_purchase_signal: '유료 교육에 관한 표현이 없음',
    information_seeking: '유료 교육의 일반 정보를 요청함',
    specific_evaluation: '유료 교육 조건을 구체적으로 검토하거나 비교함',
    conditional_purchase_statement: '조건이 맞으면 유료 교육을 신청·구매하겠다고 직접 밝힘',
    paid_application_or_payment_attempt: '유료 교육 신청·결제를 실제로 시도했다고 직접 밝힘',
    unclear: '유료 교육 관련 행동 단계를 구분할 수 없음',
  } },
} as const;

export type JevV3DecisionKey = keyof typeof JEV_V3_CHOICES;
export type JevV3ConsistencyFlag = 'paid_attempt_without_paid_target' | 'paid_failure_without_paid_target' | 'free_failure_without_free_target';
export type JevV3Result = {
  contract_version: 3;
  model: string;
  decisions: { [K in JevV3DecisionKey]: JevChoiceAnswer };
  consistency_flags: JevV3ConsistencyFlag[];
};

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

export function jevV3ConsistencyFlags(decisions: JevV3Result['decisions']): JevV3ConsistencyFlag[] {
  const target = decisions.attempted_action_target.choice;
  const issue = decisions.operational_issue.choice;
  const flags: JevV3ConsistencyFlag[] = [];
  if (decisions.observable_stage.choice === 'paid_application_or_payment_attempt' && !['paid_application', 'paid_payment'].includes(target)) flags.push('paid_attempt_without_paid_target');
  if ((issue === 'paid_application_failure' && target !== 'paid_application') || (issue === 'paid_payment_failure' && target !== 'paid_payment')) flags.push('paid_failure_without_paid_target');
  if (issue === 'free_content_access_failure' && target !== 'free_live_or_replay') flags.push('free_failure_without_free_target');
  return flags;
}

export async function createJevV3Judgment(subject: string, content: string, apiKey: string, requester: typeof fetch = fetch): Promise<JevV3Result> {
  if (!apiKey) throw new Error('JEV_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await requester(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state: { inquiry: redactJevText(`${subject}\n${content}`) }, questions: JEV_V3_QUESTIONS }),
      cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('JEV_UNAVAILABLE'); }
  if (!response.ok) throw new Error([429, 529].includes(response.status) ? 'JEV_BUSY' : 'JEV_UNAVAILABLE');
  let raw: Json;
  try { raw = object(await response.json()); } catch { throw new Error('JEV_INVALID_RESPONSE'); }
  const answers = object(raw.answers);
  const decisions: JevV3Result['decisions'] = {
    information_need: answer(answers.information_need, JEV_V3_CHOICES.information_need),
    confirmed_barrier: answer(answers.confirmed_barrier, JEV_V3_CHOICES.confirmed_barrier),
    attempted_action_target: answer(answers.attempted_action_target, JEV_V3_CHOICES.attempted_action_target),
    operational_issue: answer(answers.operational_issue, JEV_V3_CHOICES.operational_issue),
    observable_stage: answer(answers.observable_stage, JEV_V3_CHOICES.observable_stage),
  };
  return { contract_version: 3, model: typeof raw.model === 'string' ? raw.model.slice(0, 100) : 'jev-latest', decisions,
    consistency_flags: jevV3ConsistencyFlags(decisions) };
}
