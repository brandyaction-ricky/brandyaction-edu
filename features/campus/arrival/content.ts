/** Public, editorial examples only. No learner records or AI responses are read here. */
export const audiences = ['work', 'business', 'preparing', 'exploring'] as const;
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
  work: {
    label: '회사 업무에 AI를 써보고 싶어요',
    shortLabel: '회사 업무',
    greeting: '흩어진 업무 메모를 보고할 수 있는 초안으로 정리합니다.',
    goal: '업무 메모를 보고용 초안으로 정리하기',
    staff: '업무 보고를 정리하는 직원',
    intro: '읽는 사람이 무엇을 판단해야 하는지 알려주고, 진행 상황과 확인할 일, 다음 행동을 나눠 정리합니다.',
    q1: '어떤 업무를 정리하고 싶나요? 참고할 메모도 함께 적어주세요.',
    q2: '누가 읽고, 무엇을 판단하거나 확인해야 하나요?',
    hint1: '실명이나 회사 기밀 대신 가상의 메모를 적어도 괜찮아요. 완료한 일과 아직 진행 중인 일을 구분해 주세요.',
    hint2: '예: 팀장이 현재 진행 상황을 보고, 추가로 결정할 일이 있는지 확인해야 해요.',
    example: {
      a: '신입 동료 안내자료를 만드는 중이에요. 목차는 정리했고, 계정 신청 안내는 담당 부서 확인을 기다리고 있어요. 기존 자료의 연락처가 맞는지도 확인해야 해요. 전체 완료일은 아직 정하지 않았어요.',
      b: '팀장에게 이번 주 진행 상황을 보고하려고 해요. 무엇이 끝났고, 무엇을 기다리는지, 다음에 무엇을 할지 빠르게 볼 수 있어야 해요.',
      before: '[진행 상황]\n신입 동료 안내자료의 목차 정리를 완료했습니다. 계정 신청 안내는 담당 부서의 확인을 기다리고 있습니다.\n\n[확인할 사항]\n기존 자료의 연락처가 현재도 유효한지 확인이 필요합니다. 전체 완료일은 아직 정해지지 않았습니다.\n\n[다음 행동]\n계정 신청 안내에 대한 회신을 확인하고, 기존 연락처를 점검한 뒤 안내자료에 반영합니다.\n\n[보고 전 확인]\n연락처 점검 담당자와 완료일은 메모에 없습니다. 실제 담당자와 일정을 확인한 뒤 추가하세요.',
      revision: '팀장이 빠르게 읽을 수 있게 완료·대기·다음 행동 세 항목으로 줄여줘. 전체 완료일이 미정인 점은 남기고, 내가 쓰지 않은 담당자나 날짜는 추가하지 마.',
      after: '[완료]\n신입 동료 안내자료의 목차 정리.\n\n[대기]\n계정 신청 안내에 대한 담당 부서 확인. 전체 완료일은 미정.\n\n[다음 행동]\n회신 확인과 기존 연락처 점검 후 자료에 반영. 점검 담당자와 일정은 확인 필요.',
    },
    checks: ['원래 메모의 완료·진행 상태를 정확하게 구분했나요?', '읽는 사람이 확인할 일과 다음 행동이 보이나요?', '메모에 없는 수치·담당자·일정을 만들어내지는 않았나요?'],
    bridge: '내 업무와 보고 형식을 매번 설명하지 않고, 정해둔 기준으로 반복 업무를 맡기려면?',
    question: '내 업무 자료와 보고 기준을 AI 직원에게 어떻게 알려주면 좋을까요?',
  },
  "business": {
    "label": "이미 사업을 하고 있어요",
    "shortLabel": "사업 중",
    "greeting": "고객이 우리 상품을 선택할 이유부터 정리합니다.",
    "goal": "고객이 우리 상품을 선택할 이유 찾기",
    "staff": "상품의 구매 이유를 정리하는 직원",
    "intro": "상품의 특징을 고객이 얻는 가치로 바꾸고, 그 이유가 드러나는 소개 문구를 만듭니다.",
    "q1": "무엇을 판매하고, 주로 어떤 고객이 구매하나요?",
    "q2": "그 고객에게 가장 강조하고 싶은 상품의 특징은 무엇인가요?",
    "hint1": "상품·서비스와 구매하는 사람을 함께 적어주세요.",
    "hint2": "실제로 제공하는 구성이나 기능을 적어주세요. 아직 확인하지 않은 효과는 빼주세요.",
    "example": {
      "a": "퇴근 후 혼자 저녁을 먹는 직장인을 위한 냉동 한식 반찬 세트예요.",
      "b": "한식 반찬 3종을 각각 1인분씩 포장했어요. 반찬을 사놓고 남기는 게 부담스러운 사람에게 알리고 싶어요.",
      "before": "[고객이 선택할 이유]\n먹을 반찬만 1인분씩 꺼내 준비할 수 있다는 점입니다. 남는 반찬이 부담스러운 고객에게 전달할 수 있는 구매 이유입니다.\n\n[이유를 뒷받침하는 특징]\n한식 반찬 3종이 각각 1인분으로 포장되어 있습니다.\n\n[고객에게 보여줄 문구]\n“혼자 먹는 저녁, 반찬까지 한꺼번에 꺼낼 필요는 없으니까. 한식 반찬 3종을 각각 1인분씩 담았습니다.”\n\n[사용 전에 확인할 점]\n고객이 실제로 더 불편해하는 것은 남는 반찬일까요, 매일 메뉴를 고르는 일일까요? 정리한 구매 이유는 고객 반응으로 확인할 가설입니다.",
      "revision": "남는 반찬이 부담스러운 고객에게 초점을 맞춰줘. 상품 소개 페이지 첫 화면에 넣을 제목 한 줄과 설명 한 줄로 정리해줘. 1인분 개별 포장이라는 특징을 살리고, 비용 절약이나 음식물 쓰레기 감소 효과는 단정하지 마.",
      "after": "[제목]\n반찬은 세 가지, 꺼낼 때는 1인분씩.\n\n[설명]\n한식 반찬 3종을 각각 나눠 담아, 먹을 반찬만 골라 준비할 수 있습니다."
    },
    "checks": [
      "내가 알려준 상품 특징에 근거했나요?",
      "고객이 선택할 이유가 구체적인가요?",
      "확인하지 않은 효과나 고객 반응을 만들어내지는 않았나요?"
    ],
    "bridge": "상품과 고객을 매번 처음부터 설명하지 않고, 내가 정한 기준으로 계속 일을 맡기려면?",
    "question": "우리 상품과 고객, 표현 기준을 AI 직원에게 어떻게 알려주면 좋을까요?"
  },
  "preparing": {
    "label": "창업을 준비하고 있어요",
    "shortLabel": "창업 준비",
    "greeting": "만들기 전에 고객에게 확인할 것을 정리합니다.",
    "goal": "만들기 전에 확인할 고객 문제 정리하기",
    "staff": "아이디어 검증을 돕는 직원",
    "intro": "좋은 아이디어라는 답 대신, 실제 고객에게 무엇을 확인해야 할지 정리합니다.",
    "q1": "어떤 사람을 위한 상품이나 서비스를 준비하고 있나요?",
    "q2": "그 사람이 어떤 불편을 겪을 거라고 생각하나요?",
    "hint1": "완성된 사업 계획이 아니어도 괜찮아요. 지금 생각을 적어주세요.",
    "hint2": "직접 들은 이야기인지, 아직 내 예상인지도 함께 알려주세요.",
    "example": {
      "a": "여러 쇼핑몰에서 판매하는 소규모 판매자를 위한 주문 정리 서비스를 생각하고 있어요.",
      "b": "쇼핑몰마다 주문을 내려받아 엑셀로 합치느라 번거로울 것 같아요. 실제 판매자에게 물어본 적은 아직 없어요.",
      "before": "[먼저 확인할 가설]\n여러 쇼핑몰의 주문을 한곳에 모으는 일이 판매자에게 반복적인 부담일 수 있습니다. 아직 고객에게 확인된 문제는 아닙니다.\n\n[먼저 만나볼 사람]\n여러 쇼핑몰의 주문을 직접 정리하고 있는 판매자입니다.\n\n[고객에게 물어볼 질문]\n1. 가장 최근에 주문을 모아서 발송하기까지 어떤 순서로 처리하셨나요?\n2. 그중 가장 손이 많이 갔던 단계는 무엇이었나요?\n3. 그 단계는 현재 어떤 도구나 방법으로 처리하시나요?\n\n[대화 후 판단할 것]\n이미 충분히 해결하고 있는 문제인지, 여전히 반복되는 불편이 있는지 나눠 기록하세요. 한 사람의 답만으로 수요가 있다고 결론 내리지는 않습니다.",
      "revision": "판매자 지인에게 먼저 연락하려고 해. 서비스를 소개하거나 구매 의사를 묻지 말고, 최근 주문 정리 경험을 10분 정도 듣고 싶다는 카톡 메시지를 써줘. 대화에서 가장 먼저 물어볼 질문도 하나 붙여줘.",
      "after": "[먼저 보낼 메시지]\n“요즘 주문을 어떻게 모아서 정리하시는지 알아보고 있어요. 가장 최근에 주문을 처리하셨던 과정에 대해 10분 정도 여쭤봐도 될까요?”\n\n[대화의 첫 질문]\n“주문을 확인한 순간부터 발송 준비가 끝날 때까지, 실제로 하신 일을 순서대로 들려주실 수 있을까요?”\n\n[기록할 것]\n실제 작업 순서, 손이 많이 가는 단계, 현재 해결 방법을 나눠 적어보세요."
    },
    "checks": [
      "고객의 최근 경험을 묻고 있나요?",
      "예상과 고객에게 확인한 사실을 구분했나요?",
      "내가 원하는 답을 유도하고 있지는 않나요?"
    ],
    "bridge": "고객에게 들은 이야기를 모아, 다음에 확인할 일까지 AI 직원에게 정리하게 하려면?",
    "question": "고객의 이야기를 어떤 형태로 모아두면 AI 직원과 함께 검토하기 좋을까요?"
  },
  "exploring": {
    "label": "아직 아이템이 없어요",
    "shortLabel": "아이템 탐색",
    "greeting": "내 경험에서 누군가에게 필요한 일을 찾습니다.",
    "goal": "내 경험에서 시작할 사업 아이디어 찾기",
    "staff": "경험을 아이디어로 정리하는 직원",
    "intro": "사람들이 도움을 구했던 경험에서, 실제로 확인해볼 수 있는 아이디어를 찾습니다.",
    "q1": "사람들이 내게 자주 물어보거나 도움을 요청하는 일은 무엇인가요?",
    "q2": "그 사람은 무엇을 어려워했고, 나는 어떻게 도왔나요?",
    "hint1": "회사나 일상에서 반복해서 알려주거나 도와준 일을 떠올려보세요.",
    "hint2": "실명은 빼고, 실제 상황과 내가 한 행동을 적어주세요.",
    "example": {
      "a": "엑셀을 처음 쓰는 동료에게 주간 보고용 표를 정리하는 방법을 여러 번 알려줬어요.",
      "b": "매번 새 파일에 표를 만드는 걸 어려워해서, 같은 양식에 숫자만 바꾸면 되도록 표를 만들어줬어요.",
      "before": "[내 경험에서 발견한 가치]\n엑셀 기능을 설명하는 데서 그치지 않고, 반복해서 만드는 보고서를 재사용할 수 있는 양식으로 정리해줬습니다.\n\n[도움이 필요할 수 있는 사람]\n엑셀이 익숙하지 않지만 정기적으로 보고서를 작성해야 하는 직장인입니다.\n\n[확인해볼 아이디어]\n실제 업무에 맞춘 보고서 양식과, 처음 사용하는 사람을 위한 작성 안내를 함께 제공하는 방법입니다.\n\n[이번 주에 해볼 일]\n도움을 요청했던 동료에게 다음 보고서를 작성할 때 그 양식을 사용해보도록 제안하세요.\n\n[아직 확인할 점]\n다른 사람도 같은 어려움을 겪는지, 무료 양식으로 해결되지 않는 점은 무엇인지 확인해야 합니다. 도움을 줄 수 있다는 사실만으로 판매 가능성이 확인된 것은 아닙니다.",
      "revision": "새 상품부터 만들지 않고, 도움을 요청했던 동료 한 명에게 먼저 확인하고 싶어. 보낼 제안문과 실제 사용 후 물어볼 질문 하나로 정리해줘. 유료 서비스나 수익으로 단정하지 마.",
      "after": "[먼저 보낼 제안]\n“다음 주간 보고서를 작성할 때 같이 만든 양식을 한번 써보실래요? 쓰다가 헷갈리는 부분을 알려주시면 그 부분부터 정리해볼게요.”\n\n[사용 후 확인할 질문]\n“실제로 보고서를 작성하면서, 여전히 직접 고치거나 도움을 받아야 했던 부분은 어디였나요?”\n\n[확인 후 할 일]\n반복해서 막히는 부분이 있다면, 양식과 작성 안내 중 무엇을 보완해야 할지 정리하세요."
    },
    "checks": [
      "내가 실제로 도와준 경험에 근거했나요?",
      "누구에게 어떤 행동으로 확인할지 보이나요?",
      "이미 검증된 사업이나 수익처럼 단정하지는 않았나요?"
    ],
    "bridge": "내 경험과 관심사를 AI 직원에게 알려주고, 아이디어를 확인하는 다음 행동까지 함께 정리하려면?",
    "question": "아직 사업 아이템이 없을 때 AI 직원에게 어떤 일부터 맡기면 좋을까요?"
  }
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
  if (audience === 'work') return `아래 업무 메모를 읽는 사람의 목적에 맞는 보고용 초안으로 정리해줘.\n\n맡길 업무와 원자료·메모:\n${a}\n\n읽는 사람과 확인할 목적:\n${b}\n\n아래 네 항목으로 정리해줘.\n1. 진행 상황: 메모에 있는 완료·진행·대기 상태를 구분해줘.\n2. 확인할 사항: 결정이 필요한 문제와 정보가 없는 부분을 나눠줘.\n3. 다음 행동: 메모에서 이어지는 행동만 적어줘. 확정되지 않은 행동은 제안이라고 표시해줘.\n4. 보고 전 확인: 메모에 없는 수치·담당자·일정은 '확인 필요'로 표시해줘.\n\n내가 쓰지 않은 성과, KPI, 마감일, 담당자를 만들지 마. 계획을 완료한 사실로 바꾸지 마. 메모가 부족하면 추측으로 채우지 말고 꼭 필요한 질문을 남겨줘. 바로 검토할 수 있는 간결한 문장으로 작성해줘.`;
  if (audience === 'business') return `내 상품의 특징을 바탕으로 고객이 선택할 이유를 정리하고, 그 이유를 담은 소개 문구를 작성해줘.\n\n상품·고객:\n${a}\n\n실제로 제공하는 특징:\n${b}\n\n아래 네 항목으로 정리해줘.\n1. 고객이 이 상품을 선택할 이유 한 가지. 고객 반응으로 확인하기 전의 가설임을 밝혀줘.\n2. 그 이유를 뒷받침하는 상품의 특징. 내가 알려준 사실만 사용해줘.\n3. 고객에게 보여줄 소개 문구. 제목 한 줄과 설명 두 문장으로 작성해줘.\n4. 실제 사용 전에 고객에게 확인할 점 한 가지.\n\n처음 읽는 사람도 이해하는 쉬운 말로 써줘. 내가 알려주지 않은 가격, 일정, 후기, 효과는 만들지 마. 특징만으로 비용 절약이나 매출 상승을 단정하지 마.`;
  if (audience === 'preparing') return `내 사업 아이디어를 만들기 전에 실제 고객에게 무엇을 확인해야 할지 정리해줘.\n\n준비 중인 상품·서비스와 고객:\n${a}\n\n고객이 겪을 거라고 생각하는 불편:\n${b}\n\n아래 네 항목으로 정리해줘.\n1. 먼저 확인할 가설. 내가 예상한 것과 고객에게 확인한 사실을 구분해줘.\n2. 그 가설을 확인하려면 어떤 사람을 만나야 하는지.\n3. 고객의 최근 경험과 현재 처리 방법을 알아볼 질문 세 개.\n4. 답을 들은 뒤 무엇을 기록하고 어떤 점을 판단해야 하는지.\n\n“이 서비스가 있으면 쓰시겠어요?”처럼 답을 유도하지 말고, 한 질문에는 한 가지 내용만 담아줘. 시장 규모나 수요가 있다고 추측해서 결론 내리지 마.`;
  return `내가 실제로 다른 사람을 도운 경험에서, 사업 아이디어로 확인해볼 일을 정리해줘.\n\n자주 도움을 요청받은 일:\n${a}\n\n상대가 어려워한 점과 내가 도운 방법:\n${b}\n\n아래 다섯 항목으로 정리해줘.\n1. 내 경험에서 발견한 가치. 내가 실제로 한 행동에 근거해줘.\n2. 비슷한 도움이 필요할 수 있는 사람.\n3. 처음 제공해볼 결과물이나 도움 한 가지.\n4. 이번 주에 주변 한 사람에게 직접 확인할 행동과 질문.\n5. 아직 확인하지 못한 점. 기존 무료 대안으로 해결되는지도 확인해줘.\n\n탐색용 가설로 작성해줘. 사업성이 검증됐다거나 수익이 날 것이라고 판단하지 마. 내가 말하지 않은 경력이나 능력도 추가하지 마.`;
}
export function buildRevision(audience: Audience, revision: Revision, extra = ''): string {
  if (revision === 'short') return {
    work: '완료·대기·다음 행동 세 항목으로 줄여줘. 결정이나 확인이 필요한 내용은 남기고, 원자료에 없는 수치·담당자·일정은 추가하지 마.',
    business: '구매 이유와 상품 특징이 드러나도록 소개 문구를 두 문장으로 줄여줘. 내가 알려주지 않은 정보는 추가하지 마.',
    preparing: '가장 먼저 물어볼 질문 하나만 골라줘. 고객이 최근에 한 일을 묻는 쉬운 문장으로 써줘.',
    exploring: '이번 주에 주변 사람 한 명에게 확인해볼 수 있는 행동 하나와 질문 하나로 줄여줘.',
  }[audience];
  if (revision === 'easy') return '처음 읽는 사람도 이해하도록 어려운 말과 추상적인 표현을 풀어줘. 내가 알려준 사실과 목적은 유지해줘.';
  if (revision === 'vague') return {
    work: '원자료에서 확인한 사실과 제안하는 행동을 구분해줘. 누가 무엇을 판단해야 하는지 드러내고, 없는 담당자나 일정은 확인 필요로 표시해줘.',
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
    {label: audience === 'work' ? '업무와 메모' : audience === 'exploring' ? '출발한 경험' : '상품과 고객', value: cleanAnswer(answers.a)},
    {label: audience === 'work' ? '읽는 사람과 목적' : audience === 'business' ? '꼭 전달할 장점' : audience === 'preparing' ? '확인할 것' : '사람과 상황', value: cleanAnswer(answers.b)},
    {label: '결과를 다듬는 기준', value: revisionCriterion},
  ].filter(item => Boolean(item.value));
}
