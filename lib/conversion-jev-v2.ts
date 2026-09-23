import { redactJevText } from './conversion-jev';
import type { JevChoiceAnswer } from './conversion-review';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_V2_CHOICES = {
  information_need: ['price_or_payment', 'schedule_or_deadline', 'curriculum_or_fit', 'skill_requirement', 'registration_or_access', 'other_or_unclear'],
  confirmed_barrier: ['explicit_price_burden', 'explicit_schedule_conflict', 'explicit_skill_concern', 'explicit_content_mismatch', 'explicit_trust_concern', 'none_stated', 'unclear'],
  operational_issue: ['registration_failure', 'replay_access_failure', 'payment_process_failure', 'other_access_failure', 'none_stated', 'unclear'],
  observable_stage: ['no_purchase_signal', 'information_seeking', 'specific_evaluation', 'conditional_purchase_statement', 'application_or_payment_attempt', 'unclear'],
} as const;

/** Version 2 deliberately asks for observable distinctions, not an inferred readiness score. */
export const JEV_V2_QUESTIONS = {
  information_need: { type: 'choice', instructions: '문의에서 명시적으로 요청한 정보의 주된 주제를 고르세요. 여러 주제면 가장 직접적으로 질문한 것을 고르되, 표현만으로 구분할 수 없으면 other_or_unclear를 선택하세요.', criteria: {
    price_or_payment: '가격, 할인, 할부, 월 납부액 등 가격·결제 조건을 질문함. 부담을 느낀다는 뜻은 아님',
    schedule_or_deadline: '교육 일정, 모집 마감, 신청 가능 기간을 질문함. 일정 충돌을 뜻하지는 않음',
    curriculum_or_fit: '다루는 내용, 방식, 기대 성과, 적합성을 질문함. 내용이 맞지 않는다고 단정하지 않음',
    skill_requirement: '필요한 경험이나 수준을 질문함. 본인이 따라가기 어렵다고 밝힌 것은 아님',
    registration_or_access: '신청, 결제, 다시보기 등의 방법·접근을 질문함',
    other_or_unclear: '위 정보 요청이 없거나 주제를 특정할 수 없음',
  } },
  confirmed_barrier: { type: 'choice', instructions: '고객이 유료 교육 구매를 막는 우려나 제약을 직접 밝혔다면 그 한 가지를 고르세요. 단순 가격·일정·난이도 질문만으로 장애물을 추론하지 마세요. 버튼 오류 등 운영 문제는 별도 항목에서 판정하세요.', criteria: {
    explicit_price_burden: '비용이 부담되거나 예산이 부족하다고 직접 밝힘',
    explicit_schedule_conflict: '참여할 수 없는 시간 충돌을 직접 밝힘',
    explicit_skill_concern: '본인 역량 때문에 따라가기 어렵다고 직접 밝힘',
    explicit_content_mismatch: '교육 내용이 자신의 목적에 맞지 않는다고 직접 밝힘',
    explicit_trust_concern: '제공자나 성과를 신뢰하기 어렵다고 직접 밝힘',
    none_stated: '구매를 막는 우려나 제약을 직접 밝히지 않음',
    unclear: '표현이 모호하여 직접 밝힌 장애물인지 구분할 수 없음',
  } },
  operational_issue: { type: 'choice', instructions: '신청·결제·시청 과정에서 실제로 겪었다고 밝힌 운영 문제를 고르세요. 단순히 이용 방법을 물은 것은 문제가 아닙니다.', criteria: {
    registration_failure: '신청 버튼이나 양식이 작동하지 않는 등 신청 시도 실패',
    replay_access_failure: '다시보기 영상 또는 링크에 접근하지 못함',
    payment_process_failure: '결제 시도 중 오류가 발생함',
    other_access_failure: '그 밖의 명시적인 이용·접근 실패',
    none_stated: '겪은 운영 문제를 밝히지 않음',
    unclear: '실패 여부나 종류를 구분할 수 없음',
  } },
  observable_stage: { type: 'choice', instructions: '문의에 실제로 표현된 구매 행동의 가장 높은 단계만 고르세요. 할인이나 마감일 질문만으로 구매 약속이나 신청 시도를 추정하지 마세요.', criteria: {
    no_purchase_signal: '유료 교육에 대한 관심이나 행동 표현이 없음',
    information_seeking: '유료 교육 관련 일반 정보를 질문함',
    specific_evaluation: '구체적인 조건을 비교하거나 자신의 상황에 맞는지 평가함',
    conditional_purchase_statement: '특정 조건이 맞으면 구매·신청하겠다고 직접 말함',
    application_or_payment_attempt: '신청 또는 결제를 실제로 시도했다고 직접 말함',
    unclear: '행동 단계를 판단할 정보가 부족함',
  } },
} as const;

export type JevV2Result = { contract_version: 2; model: string; decisions: { [K in keyof typeof JEV_V2_CHOICES]: JevChoiceAnswer } };
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

export async function createJevV2Judgment(subject: string, content: string, apiKey: string, requester: typeof fetch = fetch): Promise<JevV2Result> {
  if (!apiKey) throw new Error('JEV_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await requester(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state: { inquiry: redactJevText(`${subject}\n${content}`) }, questions: JEV_V2_QUESTIONS }),
      cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('JEV_UNAVAILABLE'); }
  if (!response.ok) throw new Error([429, 529].includes(response.status) ? 'JEV_BUSY' : 'JEV_UNAVAILABLE');
  let raw: Json;
  try { raw = object(await response.json()); } catch { throw new Error('JEV_INVALID_RESPONSE'); }
  const answers = object(raw.answers);
  return { contract_version: 2, model: typeof raw.model === 'string' ? raw.model.slice(0, 100) : 'jev-latest', decisions: {
    information_need: answer(answers.information_need, JEV_V2_CHOICES.information_need),
    confirmed_barrier: answer(answers.confirmed_barrier, JEV_V2_CHOICES.confirmed_barrier),
    operational_issue: answer(answers.operational_issue, JEV_V2_CHOICES.operational_issue),
    observable_stage: answer(answers.observable_stage, JEV_V2_CHOICES.observable_stage),
  } };
}
