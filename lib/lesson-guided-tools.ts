// Question text, options and prompt output ported without rewriting from the
// user-provided Replit source snapshot (2026-09-07). New live export must be
// compared before migration. Keep this version for historical lesson answers.
// PersonaGenerator.tsx SHA256 24359f9677422c4de8df28f3acbaf0352d2177d64cff7623cad3946c416b5712
// LandingFunnelBlock.tsx SHA256 c4fc81120a1546d3572ed03e7e202af189f8f27db6b61cc936b2bd02a6b55628
import type { BlockField, LessonBlock, PublicLessonBlock } from './lesson-blocks';

export const GUIDED_TOOL_VERSION = 'replit-2026-09-07' as const;
export type GuidedToolType = 'persona-generator' | 'landing-planner';

type PersonaQuestion = {
  key: string;
  emoji: string;
  text: string;
  opts?: string[];
  type?: "text";
  placeholder?: string;
};

export const PERSONA_QUESTIONS: PersonaQuestion[] = [
  { key: "age", emoji: "🎂", text: "주요 고객의 나이대는?", opts: ["10대", "20대", "30대", "40대", "50대 이상", "다양함"] },
  { key: "gender", emoji: "👥", text: "주요 고객의 성별은?", opts: ["여성 위주", "남성 위주", "비슷비슷"] },
  { key: "job", emoji: "💼", text: "주요 고객의 직업/상황은?", opts: ["직장인", "학생", "자영업자·사업가", "프리랜서", "주부", "다양함"] },
  { key: "channel", emoji: "🌐", text: "고객이 우리 브랜드를 주로 어디서 만나나요?", opts: ["온라인(앱·웹)", "오프라인 매장·현장", "온·오프라인 모두", "B2B 영업·파트너십"] },
  { key: "discovery", emoji: "🔍", text: "우리를 처음 알게 되는 경로는?", opts: ["인스타그램·틱톡", "네이버·구글 검색", "지인 추천", "AI 검색", "유튜브"] },
  { key: "situation", emoji: "💡", text: "주로 어떤 상황에서 우리를 찾나요?", opts: ["특정 문제 해결", "정기적으로 필요해서", "기분 전환·즐거움", "선물·특별한 날", "가격·혜택에 끌려서"] },
  { key: "concern", emoji: "😟", text: "구매·이용 전 가장 큰 걱정은?", opts: ["가격이 적절한지", "품질·효과가 있을지", "믿을 수 있는 브랜드인지", "사용하기 어렵진 않을지", "나에게 맞는지 모르겠어서"] },
  { key: "decision", emoji: "✅", text: "최종 결정할 때 가장 중요하게 보는 건?", opts: ["후기와 평점", "가격과 혜택", "브랜드 신뢰도", "편의성·접근성", "전문성·차별성"] },
  { key: "sns", emoji: "📱", text: "주로 시간을 보내는 미디어·플랫폼은?", opts: ["인스타그램", "유튜브", "틱톡", "카카오톡·오픈채팅", "네이버·블로그"] },
  { key: "spending", emoji: "💰", text: "우리 제품·서비스에 대한 지출 성향은?", opts: ["가성비 최우선", "적당한 가격이면 OK", "좋으면 비싸도 OK"] },
  { key: "purchase", emoji: "🛒", text: "구매·이용 방식 선호는?", opts: ["온라인 즉시 결제", "앱으로 간편 이용", "오프라인 직접 방문", "상담 후 결정", "구독·정기 이용"] },
  { key: "frequency", emoji: "🔄", text: "재구매·재이용 주기는?", opts: ["매주 이상", "한 달에 한 번", "분기에 한 번", "필요할 때만"] },
  { key: "review", emoji: "💬", text: "후기·리뷰를 남기는 편인가요?", opts: ["자주 남김", "요청하면 남김", "잘 안 남김"] },
  { key: "tone", emoji: "🗣️", text: "가장 잘 반응하는 말투·톤은?", opts: ["친근하고 편한", "전문적이고 신뢰감 있는", "트렌디하고 감각적인", "데이터·근거 중심"] },
  { key: "reason", emoji: "🏆", text: "우리를 선택하는 결정적 이유는?", type: "text", placeholder: "예: 타사 대비 속도가 3배 빠르고 가격이 저렴해서, 10년 경력 전문가가 직접 운영해서..." },
];

const PERSONA_NAME_MAP: Record<string, string> = {
  "20대_여성 위주": "하은 씨 (24세)", "20대_남성 위주": "준서 씨 (24세)",
  "30대_여성 위주": "지은 씨 (32세)", "30대_남성 위주": "민준 씨 (33세)",
  "40대_여성 위주": "수연 씨 (43세)", "40대_남성 위주": "상호 씨 (44세)",
  "50대 이상_여성 위주": "미경 씨 (52세)", "50대 이상_남성 위주": "영호 씨 (53세)",
};

export function buildPersonaPrompt(answers: Record<string, string>): string {
  return `우리 핵심 고객은 ${answers.age} ${answers.gender} ${answers.job}이야.\n주로 ${answers.channel} 채널에서 브랜드를 접하고, ${answers.discovery}를 통해 처음 알게 돼.\n'${answers.situation}' 상황에서 우리를 찾아오고, 구매·이용 전 가장 큰 걱정은 '${answers.concern}'이야.\n결정할 때 '${answers.decision}'을 가장 중요하게 보고, 지출은 '${answers.spending}' 성향이야.\n${answers.sns}를 주로 보고, '${answers.purchase}' 방식을 선호해.\n재구매·재이용 주기는 '${answers.frequency}'이고, 후기는 '${answers.review}' 편이야.\n'${answers.tone}' 말투에 잘 반응해.\n우리를 선택하는 결정적인 이유는 '${answers.reason}'.\n\n앞으로 광고 문구, 홈페이지 글, 콘텐츠를 만들 때 이 사람이 혹할 표현으로 써줘.\n결과물은 반드시 마크다운(.md) 파일 형식으로 저장해줘.`;
}

export const Q4_OPTIONS = [
  { value: "리드형", label: "연락처 남기기 (상담 신청)", event: "Lead" },
  { value: "채팅형", label: "카톡 채널로 상담 시작", event: "Contact" },
  { value: "예약형", label: "예약하기", event: "Schedule" },
  { value: "구매형", label: "구매 페이지로 이동", event: "InitiateCheckout" },
  { value: "구독형", label: "뉴스레터 구독", event: "Subscribe" },
] as const;

type Q4Value = (typeof Q4_OPTIONS)[number]["value"];

export const Q4_1_MAP: Record<Q4Value, { question: string; placeholder: string }> = {
  리드형: {
    question: "상담 신청 시 무엇을 받을까요? 상담 가능 시간대도 함께 적어주세요.",
    placeholder: "이름, 연락처, 희망 시간대 / 평일 10~19시",
  },
  채팅형: {
    question: "카카오톡 채널(또는 오픈챗) 링크를 적어주세요. 아직 없으면 '없음'.",
    placeholder: "http://pf.kakao.com/...",
  },
  예약형: {
    question: "예약 페이지 링크를 적어주세요. 아직 없으면 '없음'.",
    placeholder: "네이버 예약 링크",
  },
  구매형: {
    question: "이동시킬 상품/스토어 링크를 적어주세요. 아직 없으면 '없음'.",
    placeholder: "스마트스토어 상품 링크",
  },
  구독형: {
    question: "구독 시 받을 정보와 가입 링크를 적어주세요. 아직 없으면 '없음'.",
    placeholder: "이메일 / 스티비 구독 폼 링크",
  },
};

interface Question {
  id: string;
  label: string;
  sub: string;
  placeholder: string;
  type: "textarea" | "choice" | "branch";
}

export const LANDING_QUESTIONS: Question[] = [
  {
    id: "q1",
    label: "무슨 사업을 하시나요?",
    sub: "누구에게 무엇을 제공하는지 한 문장으로 적어주세요.",
    placeholder: "30~40대 여성에게 1:1 필라테스를 제공합니다",
    type: "textarea",
  },
  {
    id: "q2",
    label: "광고를 보고 들어올 사람은 누구인가요?",
    sub: "연령, 상황, 특징을 떠오르는 대로.",
    placeholder: "출산 후 체형이 고민인 30대 여성",
    type: "textarea",
  },
  {
    id: "q3",
    label: "그 사람이 지금 겪는 불편, 또는 바라는 변화는 뭔가요?",
    sub: "고객이 실제로 하는 말투로 적으면 더 좋습니다.",
    placeholder: '"허리가 아픈데 헬스는 무서워요"',
    type: "textarea",
  },
  {
    id: "q4",
    label: "이 페이지에서 고객이 마지막에 딱 하나, 무엇을 하면 성공인가요?",
    sub: "하나만 골라주세요. 이게 페이지의 목적지가 됩니다.",
    placeholder: "",
    type: "choice",
  },
  {
    id: "q4_1",
    label: "", // 동적으로 채움
    sub: "",
    placeholder: "",
    type: "branch",
  },
  {
    id: "q5",
    label: "고객이 찾아오는 이유를 3~5가지로 나눈다면?",
    sub: "쉼표로 구분해서 적어주세요. 이게 페이지의 선택지가 됩니다.",
    placeholder: "다이어트, 체형교정, 통증·재활",
    type: "textarea",
  },
  {
    id: "q6",
    label: "고객에게 보여줄 수 있는 증거는 뭐가 있나요?",
    sub: "후기, 전후 사진, 사례, 숫자, 수상 등. 아직 없다면 '없음'이라고 적어주세요.",
    placeholder: "회원 후기 30건, 전후 사진 10세트",
    type: "textarea",
  },
  {
    id: "q7",
    label: "고객이 신청 버튼 앞에서 망설인다면 이유가 뭘까요? 그리고 뭐라고 답해주고 싶나요?",
    sub: '"망설임 → 답변" 형태로 적어주세요.',
    placeholder: "비쌀 것 같다 → 첫 체험은 무료입니다",
    type: "textarea",
  },
  {
    id: "q8",
    label: "이 페이지로 사람을 어디서 데려올 건가요? 그 광고에서 뭐라고 말하고 데려올 건가요?",
    sub: "유입 채널과 광고 문구를 함께 적어주세요.",
    placeholder: '인스타 광고, "산후 체형, 3개월이 골든타임입니다"',
    type: "textarea",
  },
  {
    id: "q9",
    label: "브랜드 느낌을 형용사 3개로 표현하면?",
    sub: "참고하고 싶은 페이지나 색이 있다면 같이 적어주세요.",
    placeholder: "따뜻한, 전문적인, 담백한 / 베이지톤",
    type: "textarea",
  },
  {
    id: "q10",
    label: "이 페이지가 성공했다고 말할 수 있는 숫자는?",
    sub: "기간과 숫자로 적어주세요.",
    placeholder: "주간 상담 신청 10건, 방문 대비 신청률 5%",
    type: "textarea",
  },
];

export function buildLandingPrompt(answers: Record<string, string>): string {
  const q4Val = (answers.q4 || "") as Q4Value;
  const q4Option = Q4_OPTIONS.find((o) => o.value === q4Val);
  const q4Display = q4Option ? `${q4Option.value} (${q4Option.label})` : answers.q4 || "";
  const convertEvent = q4Option?.event || "Lead";

  return `너는 전환 랜딩페이지 기획 전문가야. 아래 문답 내용을 바탕으로 내 브랜드의 랜딩페이지 기획안을 작성해줘.

[문답 내용]
1. 사업 소개: ${answers.q1 || ""}
2. 타겟 고객: ${answers.q2 || ""}
3. 고객의 문제와 욕구: ${answers.q3 || ""}
4. 전환 목표: ${q4Display} / 상세: ${answers.q4_1 || ""}
5. 고객이 찾아오는 이유: ${answers.q5 || ""}
6. 보여줄 수 있는 증거: ${answers.q6 || ""}
7. 고객의 망설임과 나의 답: ${answers.q7 || ""}
8. 유입 경로와 광고 메시지: ${answers.q8 || ""}
9. 브랜드 톤앤매너: ${answers.q9 || ""}
10. 성공 기준: ${answers.q10 || ""}

[페이지 구조]
이 랜딩페이지는 "질문 퍼널" 방식이야. 한 화면에 하나씩 보여준다:
첫 화면(훅) → 목적 선택 → 사례 매칭 → 마지막 화면(전환) → 완료 화면

[기획안 형식]
아래 순서와 번호 그대로 작성해.

1. 한 줄 요약 — "이 페이지는 (타겟)이 (행동)을 하게 만드는 페이지다" 형태로
2. 첫 화면(훅) — 훅 문구 3안과 추천 1안. 추천 이유 포함. 광고 메시지(8번)와 반드시 일치시킬 것
3. 목적 선택 화면 — 5번 답을 고객 말투의 선택지 문구로 다듬어서
4. 사례 매칭 화면 — 선택지별로 6번의 어떤 증거를 보여줄지 매칭. 증거가 부족한 선택지는 표시할 것
5. 마지막 화면(전환) — 4번 유형에 맞는 화면 구성 + 7번 망설임을 잡는 설득 문구. 실제로 쓸 완성 문장으로
6. 완료 화면 — 행동 직후 고객을 안심시키는 문구 (다음에 무슨 일이 일어나는지)
7. 톤앤매너 — 9번을 바탕으로 색감, 글꼴 분위기, 문구 말투 지시
8. 측정 계획 — 전환 이벤트 이름은 ${convertEvent}. 화면별 이탈률을 측정할 지점 목록
9. 성공 기준 — 10번 숫자를 관리자 페이지에서 어떻게 확인할지

[규칙]
- 문구는 전부 실제로 화면에 쓸 수 있는 완성된 문장으로 써. "~하는 문구" 같은 설명으로 때우지 마.
- 내가 입력하지 않은 내용은 지어내지 말고 [확인 필요]라고 표시해.
- "없음"이라고 답한 항목은 대체 방법을 제안해줘.
- 기획안 마지막에 "개발 발주 전 체크리스트" 5개를 붙여줘.`;
}


export function isGuidedTool(type: string): type is GuidedToolType { return type === 'persona-generator' || type === 'landing-planner'; }

export function guidedToolFields(type: GuidedToolType): BlockField[] {
  return type === 'persona-generator'
    ? PERSONA_QUESTIONS.map(q => ({ id: q.key, variable: q.key, label: q.text, placeholder: q.placeholder || '', required: true, sensitive: false, ...(q.opts ? { options: [...q.opts] } : {}) }))
    : LANDING_QUESTIONS.map(q => ({ id: q.id, variable: q.id, label: q.label || '전환 목표에 따른 상세 정보', placeholder: q.placeholder, required: true, sensitive: false, ...(q.id === 'q4' ? { options: Q4_OPTIONS.map(o => o.value) } : {}) }));
}
export function hasGuidedDefinition(block: Pick<PublicLessonBlock, 'type' | 'toolVersion' | 'fields'>): boolean {
  if (!isGuidedTool(block.type) || block.toolVersion !== GUIDED_TOOL_VERSION) return false;
  const fields = block.fields, expected = guidedToolFields(block.type);
  return Boolean(fields && fields.length === expected.length && expected.every((e, i) => {
    const f = fields[i];
    return f.id === e.id && f.variable === e.variable && f.label === e.label && f.placeholder === e.placeholder && f.required === e.required && f.sensitive === e.sensitive && JSON.stringify(f.options) === JSON.stringify(e.options);
  }));
}
export function newGuidedBlock(type: GuidedToolType, id: string): LessonBlock {
  return { id, type, toolVersion: GUIDED_TOOL_VERSION, fields: guidedToolFields(type) };
}
export function firstMissingGuidedAnswer(type: GuidedToolType, answers: Record<string, string>): number {
  return guidedToolFields(type).findIndex(f => !Object.hasOwn(answers, f.id) || !answers[f.id]?.trim() || Boolean(f.options?.length && !f.options.includes(answers[f.id])));
}
export function personaIdentity(answers: Record<string, string>) {
  return { name: PERSONA_NAME_MAP[`${answers.age}_${answers.gender}`] || '우리 핵심 고객', emoji: answers.gender === '남성 위주' ? '👨' : answers.gender === '여성 위주' ? '👩' : '👤' };
}
