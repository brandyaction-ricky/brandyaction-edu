import {
  createMockJudgment,
  type ConversionCase,
  type ConversionEvidence,
  type JevChoiceAnswer,
  type JevResult,
  type JevScoreAnswer,
} from './conversion-review';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const CHOICES = {
  purchase_intent: ['high', 'medium', 'low', 'unclear'],
  primary_barrier: ['price', 'schedule', 'skill_level', 'content_fit', 'trust', 'none_or_unknown'],
  next_action: ['answer_specific_questions', 'invite_webinar', 'offer_purchase_info', 'human_consult', 'hold_no_contact'],
} as const;

export const JEV_QUESTIONS = {
  purchase_intent: {
    type: 'choice',
    instructions: '이 잠재고객의 현재 유료 교육 구매 의도를 가장 잘 설명하는 단계를 고르세요.',
    criteria: {
      high: '구매 의사가 명확하며 마지막 조건이나 절차만 확인 중',
      medium: '관심이 있고 구체적인 정보를 비교하거나 우려를 해소하는 중',
      low: '일반적인 호기심이나 탐색 수준이며 구매 행동 신호가 약함',
      unclear: '주어진 정보만으로 구매 의도를 판단하기 어려움',
    },
  },
  primary_barrier: {
    type: 'choice',
    instructions: '유료 교육 전환을 가장 크게 막고 있는 단일 장애물을 고르세요.',
    criteria: {
      price: '가격 또는 지불 부담',
      schedule: '시간, 날짜 또는 참여 일정',
      skill_level: '초보 여부, 경험 부족 또는 난이도 우려',
      content_fit: '교육 내용이나 기대 효과의 적합성',
      trust: '성과나 제공자에 대한 신뢰 부족',
      none_or_unknown: '명확한 장애물이 없거나 판단할 수 없음',
    },
  },
  purchase_readiness: {
    type: 'score',
    instructions: '현재 유료 교육 구매 준비도를 평가하세요.',
    criteria: [
      '구매 의도 없음 또는 관련 없음',
      '막연한 관심만 있음',
      '구매를 고려하기 시작함',
      '구체적인 조건과 장애물을 확인 중',
      '마지막 확인 후 구매할 준비가 됨',
    ],
  },
  next_action: {
    type: 'choice',
    instructions: '현재 상태에서 전환 가능성을 높이기 위한 가장 적절한 다음 행동 하나를 고르세요.',
    criteria: {
      answer_specific_questions: '가격, 일정, 녹화, 난이도 등 현재 질문에 구체적으로 답변',
      invite_webinar: '무료 웨비나 참여를 먼저 권유',
      offer_purchase_info: '구매 링크와 신청 절차를 안내',
      human_consult: '운영자가 직접 상담하거나 복합 우려를 확인',
      hold_no_contact: '추가 접촉을 보류',
    },
  },
} as const;

type Requester = typeof fetch;
type Json = Record<string, unknown>;

const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JEV_INVALID_RESPONSE');
  return value as Json;
};
const finite = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('JEV_INVALID_RESPONSE');
  return value;
};
const probabilities = (value: unknown, allowed: readonly string[]) => {
  const raw = object(value);
  const result: Record<string, number> = {};
  for (const key of allowed) result[key] = finite(raw[key], 0, 1);
  return result;
};
function choice(value: unknown, allowed: readonly string[]): JevChoiceAnswer {
  const raw = object(value), selected = String(raw.choice || '');
  if (!allowed.includes(selected)) throw new Error('JEV_INVALID_RESPONSE');
  return { type: 'choice', choice: selected, confidence: finite(raw.confidence, 0, 1), probabilities: probabilities(raw.probabilities, allowed) };
}
function score(value: unknown): JevScoreAnswer {
  const raw = object(value), levels = ['0', '1', '2', '3', '4'];
  return { type: 'score', score: finite(raw.score, 0, 4), confidence: finite(raw.confidence, 0, 1), probabilities: probabilities(raw.probabilities, levels) };
}

export function redactJevText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[이메일 제거]')
    .replace(/(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/gu, '[전화번호 제거]')
    .slice(0, 10000);
}

export async function createJevJudgment(
  item: ConversionCase,
  evidence: ConversionEvidence[],
  apiKey: string,
  requester: Requester = fetch,
): Promise<JevResult> {
  if (!apiKey) throw new Error('JEV_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await requester(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: { inquiry: redactJevText(`${item.subject}\n${item.content}`) },
        questions: JEV_QUESTIONS,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('JEV_UNAVAILABLE');
  }
  if (!response.ok) throw new Error(response.status === 429 || response.status === 529 ? 'JEV_BUSY' : 'JEV_UNAVAILABLE');
  let raw: Json;
  try { raw = object(await response.json()); } catch { throw new Error('JEV_INVALID_RESPONSE'); }
  const answers = object(raw.answers);
  const base = createMockJudgment(item, evidence);
  return {
    ...base,
    mode: 'jev',
    notice: 'Jev 그림자 판정입니다. 자동 발송이나 고객 상태 변경에는 사용하지 않으며 운영자가 결과와 설명자료를 확인해야 합니다.',
    model: typeof raw.model === 'string' ? raw.model.slice(0, 100) : 'jev-latest',
    decision_version: 1,
    decisions: {
      purchase_intent: choice(answers.purchase_intent, CHOICES.purchase_intent),
      primary_barrier: choice(answers.primary_barrier, CHOICES.primary_barrier),
      purchase_readiness: score(answers.purchase_readiness),
      next_action: choice(answers.next_action, CHOICES.next_action),
    },
  };
}
