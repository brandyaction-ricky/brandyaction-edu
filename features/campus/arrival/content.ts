/** Public, editorial examples only. No learner records or AI responses are read here. */
export const audiences = ['business', 'preparing', 'exploring'] as const;
export type Audience = (typeof audiences)[number];
export type Answers = {a: string; b: string};
export const ANSWER_LIMIT = 500;
export const REVISION_LIMIT = 300;
export const revisionOptions = [
  {id: 'short', label: '조금 더 짧게'},
  {id: 'easy', label: '더 쉬운 말로'},
  {id: 'vague', label: '더 구체적으로'},
  {id: 'different', label: '내 상황에 맞게'},
] as const;
export type Revision = (typeof revisionOptions)[number]['id'];

type AudienceContent = {
  label: string; shortLabel: string; greeting: string; goal: string; staff: string;
  intro: string; q1: string; q2: string; hint1: string; hint2: string;
  example: Answers & {before: string; after: string; revision: string};
  checks: readonly string[]; bridge: string; question: string;
};

export const audienceContent: Record<Audience, AudienceContent> = {
  business: {
    label: '사업 중이에요', shortLabel: '사업 중', greeting: '오늘도 혼자 여러 일을 맡고 있는 당신께.',
    goal: '고객에게 보낼 소개글 한 개', staff: '소개글을 쓰는 직원',
    intro: '내 상품을 처음 보는 고객에게, 가장 알려주고 싶은 장점부터 전해봐요.',
    q1: '무엇을 누구에게 판매하나요?', q2: '고객에게 꼭 알려주고 싶은 장점은요?',
    hint1: '상품이나 서비스와, 주로 찾는 사람을 함께 적어주세요.',
    hint2: '여러 장점 중 한 가지만 골라도 좋아요.',
    example: {
      a: '아이 사진을 정리하고 싶은 부모를 위한 스마트폰 사진 정리 수업',
      b: '자기 휴대폰으로 직접 사진을 분류해보는 실습이 있어요.',
      before: '휴대폰에 쌓인 아이 사진, 어디서부터 정리할지 막막하신가요?\n스마트폰 사진 정리 수업에서 내 휴대폰으로 사진을 직접 분류해봅니다.\n수업 내용이 궁금하시면 문의해 주세요.',
      revision: '친한 학부모에게 카톡으로 소개하듯 편하게 바꿔줘. 두 문장으로 줄이고, 내가 알려준 특징은 유지해줘.',
      after: '휴대폰에 쌓인 아이 사진, 같이 정리해보실래요?\n내 휴대폰으로 사진을 직접 분류해보는 수업이니, 궁금하시면 편하게 물어봐 주세요.',
    },
    checks: ['내 상품과 고객이 맞게 담겼나요?', '내가 알려준 장점이 보이나요?', '말하지 않은 가격이나 효과를 만들어내지는 않았나요?'],
    bridge: '매번 설명하지 않아도, 내 상품과 말투를 참고해 일하게 하려면?',
    question: '우리 상품과 고객에 대한 정보를 AI에게 어떻게 알려주면 좋을까요?',
  },
  preparing: {
    label: '창업을 준비 중이에요', shortLabel: '창업 준비', greeting: '생각해둔 일을, 작게 확인해보고 싶은 당신께.',
    goal: '고객에게 물어볼 질문 세 개', staff: '고객을 이해하는 직원',
    intro: '좋은 생각인지 혼자 고민하는 대신, 고객이 실제로 겪은 일을 물어볼 준비를 해요.',
    q1: '어떤 상품·서비스를 누구에게 제공하려고 하나요?', q2: '그 고객에 대해 아직 확인하지 못한 점은요?',
    hint1: '완성된 사업 계획이 아니어도 괜찮아요. 지금 생각을 적어주세요.',
    hint2: '어디서 불편한지, 지금은 어떻게 해결하는지처럼 궁금한 점 하나요.',
    example: {
      a: '소규모 온라인 판매자를 위한 주문 정리 서비스',
      b: '주문 정리 중 어느 부분에서 시간이 많이 드는지 모르겠어요.',
      before: '1. 가장 최근에 주문을 모아 발송하기까지 어떤 순서로 처리하셨나요?\n2. 그 과정에서 가장 시간이 많이 든 부분은 무엇이었나요?\n3. 그 부분을 지금은 어떤 방법으로 처리하고 계신가요?',
      revision: '지인인 판매자에게 카톡으로 물어보려고 해. 가장 중요한 질문 하나부터 편하게 물어볼 수 있도록 바꿔줘.',
      after: '가장 최근에 주문을 모아서 발송하셨던 과정을 편하게 들려주실 수 있을까요?',
    },
    checks: ['고객의 최근 경험을 묻고 있나요?', '한 질문에 한 가지 내용만 담겼나요?', '내가 원하는 답을 유도하고 있지는 않나요?'],
    bridge: '고객에게 들은 이야기를 모아, 다음에 확인할 일까지 정리하게 하려면?',
    question: '고객에게 들은 이야기를 어떤 형태로 모아두면 AI와 함께 정리하기 좋을까요?',
  },
  exploring: {
    label: '아직 아이템이 없어요', shortLabel: '아이템 탐색', greeting: '어디서부터 시작할지 찾고 있는 당신께.',
    goal: '살펴볼 문제 카드 한 장', staff: '내 경험을 정리하는 직원',
    intro: '거창한 아이디어가 없어도 괜찮아요. 내가 겪거나 도와준 일에서 시작해봐요.',
    q1: '최근 겪었거나 다른 사람을 도와준 불편한 일은요?', q2: '누가, 어떤 상황에서 겪는 일이었나요?',
    hint1: '일상이나 회사에서 반복해서 설명해준 일도 좋아요.',
    hint2: '실명은 쓰지 않아도 돼요. 어떤 사람인지와 상황만 적어주세요.',
    example: {
      a: '엑셀을 처음 쓰는 동료에게 표 만들기와 반복 작업 정리 방법을 여러 번 설명했어요.',
      b: '업무에서 엑셀을 막 사용하기 시작한 동료가 표를 정리하다가 자주 막혔어요.',
      before: '살펴볼 사람: 업무에서 엑셀을 막 사용하기 시작한 동료\n살펴볼 문제: 반복 작업을 정리하는 방법이 익숙하지 않아 자주 도움을 요청함\n작게 도와볼 일: 실제 사용하는 표의 반복 작업 하나를 정리한 안내서 만들기\n확인 질문: 최근 엑셀로 일하다가 막혔던 작업 하나를 보여주실 수 있나요?',
      revision: '이번 주에 주변 동료 한 명에게 확인해볼 수 있는 행동 하나와 질문 하나로 줄여줘.',
      after: '이번 주에 해볼 일: 도움을 요청했던 동료 한 명에게 최근 막혔던 엑셀 작업을 보여달라고 하기.\n먼저 물어볼 말: “그때 어떤 작업을 하다가 막혔는지 한번 보여주실 수 있어요?”',
    },
    checks: ['내가 실제로 겪은 일에서 출발했나요?', '누구에게 무엇을 물어볼지 보이나요?', '이미 검증된 사업이나 수익처럼 단정하지는 않았나요?'],
    bridge: '오늘 찾은 문제를 실제 사람에게 확인하고, 그다음 일을 AI와 함께 정리하려면?',
    question: '아직 사업 아이템이 없을 때 AI에게 어떤 일부터 맡겨보면 좋을까요?',
  },
};

export function isAudience(value: unknown): value is Audience {
  return typeof value === 'string' && (audiences as readonly string[]).includes(value);
}
export function isRevision(value: unknown): value is Revision {
  return typeof value === 'string' && revisionOptions.some(option => option.id === value);
}
export function cleanAnswer(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, ANSWER_LIMIT).trim();
}
export function requestReady(answers: Answers): boolean {
  return Boolean(cleanAnswer(answers.a) && cleanAnswer(answers.b));
}
/** Never fills missing personal answers with examples without the visitor choosing that path. */
export function buildRequest(audience: Audience, answers: Answers): string {
  const a = cleanAnswer(answers.a), b = cleanAnswer(answers.b);
  if (!a || !b) return '';
  if (audience === 'business') return `내 상품을 처음 보는 고객에게 보낼 소개글을 작성해줘.\n\n상품·고객:\n${a}\n\n꼭 전달할 특징:\n${b}\n\n고객이 겪는 상황 → 상품·서비스에서 얻는 것 → 문의 안내 순서로, 쉽고 자연스럽게 세 문장으로 작성해줘.\n내가 알려주지 않은 가격, 일정, 후기, 효과는 만들지 마.\n완성된 소개글 한 개만 보여줘.`;
  if (audience === 'preparing') return `준비 중인 상품·서비스의 고객을 이해하기 위한 질문을 만들어줘.\n\n준비 중인 상품·서비스와 고객:\n${a}\n\n확인하고 싶은 점:\n${b}\n\n고객의 최근 경험과 현재 처리 방법을 알아볼 수 있는 질문을 중요한 순서대로 세 개 작성해줘.\n“이 서비스가 있으면 쓰시겠어요?”처럼 답을 유도하지 말고, 한 질문에는 한 가지 내용만 담아줘.\n시장 규모나 수요가 있다고 추측해서 결론 내리지 마.`;
  return `내 경험에서 더 알아볼 만한 고객 문제 하나를 정리해줘.\n\n내가 겪거나 도와준 일:\n${a}\n\n그 일을 겪는 사람과 상황:\n${b}\n\n아래 네 항목을 짧게 작성해줘.\n1. 살펴볼 사람\n2. 그 사람이 겪을 수 있는 구체적인 문제\n3. 내가 작게 도와볼 수 있는 결과물 한 가지\n4. 실제로 그런 문제가 있는지 확인할 질문 한 개\n\n이것은 탐색용 가설로 작성해줘. 사업성이 검증됐다거나 수익이 날 것이라고 판단하지 마. 내가 말하지 않은 경력이나 능력도 추가하지 마.`;
}
export function buildRevision(audience: Audience, revision: Revision, extra = ''): string {
  if (revision === 'short') return {
    business: '핵심 특징을 유지하면서 두 문장으로 줄여줘. 내가 알려주지 않은 정보는 추가하지 마.',
    preparing: '가장 먼저 물어볼 질문 하나만 골라줘. 고객이 최근에 한 일을 묻는 쉬운 문장으로 써줘.',
    exploring: '이번 주에 주변 사람 한 명에게 확인해볼 수 있는 행동 하나와 질문 하나로 줄여줘.',
  }[audience];
  if (revision === 'easy') return '처음 읽는 사람도 이해하도록 어려운 말과 추상적인 표현을 풀어줘. 내가 알려준 사실과 목적은 유지해줘.';
  if (revision === 'vague') return {
    business: '내가 알려준 고객과 장점이 구체적으로 드러나게 고쳐줘. 부족한 정보가 있다면 추측하지 말고 꼭 필요한 질문 하나만 해줘.',
    preparing: '고객이 가장 최근에 겪은 한 가지 상황을 떠올리며 답할 수 있게 질문을 구체화해줘.',
    exploring: '내가 제공한 경험 중 한 가지 장면으로 범위를 좁혀줘. 확인된 사실과 더 알아볼 점을 구분해줘.',
  }[audience];
  const different = cleanAnswer(extra).slice(0, REVISION_LIMIT);
  return different ? `내 실제 상황과 다른 부분은 다음과 같아.\n${different}\n\n이 내용을 반영해서 앞의 결과를 고쳐줘. 확인되지 않은 내용은 추가하지 마.` : '';
}
export type Criterion = {label: string; value: string};
/** An editorial checklist based on entered fields, not an AI assessment or needs diagnosis. */
export function buildCriteria(audience: Audience, answers: Answers, revision: Revision, options: {mode?: 'personal' | 'example'; extra?: string} = {}): Criterion[] {
  const content = audienceContent[audience];
  const revisionCriterion = options.mode === 'example'
    ? content.example.revision
    : revision === 'different'
      ? cleanAnswer(options.extra ?? '').slice(0, REVISION_LIMIT)
      : revisionOptions.find(option => option.id === revision)!.label;
  return [
    {label: '맡길 일', value: content.goal},
    {label: audience === 'exploring' ? '출발한 경험' : '상품과 고객', value: cleanAnswer(answers.a)},
    {label: audience === 'business' ? '꼭 전달할 장점' : audience === 'preparing' ? '확인할 것' : '사람과 상황', value: cleanAnswer(answers.b)},
    {label: '결과를 다듬는 기준', value: revisionCriterion},
  ].filter(item => Boolean(item.value));
}
