import {cleanAnswer, type Answers} from './content';

export type ContentStationInputs = {
  product: string;
  competitor: string;
  customer: string;
  facts: string;
};

export type ContentStationDraft = {
  inputs: ContentStationInputs;
  requestReady: boolean;
};

export const CONTENT_STATION_LIMITS = {product: 300, competitor: 1200, customer: 400, facts: 1800} as const;

const exampleSource = '가상 리뷰:';

export const CONTENT_STATION_EXAMPLE: ContentStationInputs = {
  product: '데일리 보습 마스크팩',
  competitor: 'A브랜드·B브랜드 (가상 예시)',
  customer: '얼마나 오래 붙여야 하는지 헷갈리는 마스크팩 사용자',
  facts: `${exampleSource} 오래 붙이면 얼굴이 당겨요. / 언제 떼야 하나요?\n고객 질문: 오래 붙이거나 붙이고 자도 되나요?\n가상 상품 사용 가이드: 10~15분 사용 후 떼어내기.`,
};

export function parseContentStationDraft(value: unknown): ContentStationDraft {
  const draft = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<ContentStationDraft> : {};
  const source = draft.inputs;
  const field = (key: keyof ContentStationInputs) => {
    const value = source?.[key];
    return typeof value === 'string'
      ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, CONTENT_STATION_LIMITS[key])
      : '';
  };
  const inputs = {product: field('product'), competitor: field('competitor'), customer: field('customer'), facts: field('facts')};
  return {inputs, requestReady: draft.requestReady === true && contentStationReady(inputs)};
}

export function contentStationReady(inputs: ContentStationInputs): boolean {
  return Boolean(inputs.product.trim() && inputs.competitor.trim());
}

function contentStationUsesExample(inputs: ContentStationInputs): boolean {
  return inputs.competitor.trim() === CONTENT_STATION_EXAMPLE.competitor || inputs.facts.includes(exampleSource);
}

/** Reuse the visitor's relevant fields, filling only blank answers. */
export function reuseContentStationAnswers(inputs: ContentStationInputs, answers: Answers): Answers {
  if (contentStationUsesExample(inputs)) return answers;
  const product = inputs.product.trim();
  const customer = inputs.customer.trim();
  const productAndCustomer = product && (customer ? `${product}\n주요 고객: ${customer}` : product);
  const a = answers.a.trim() ? answers.a : cleanAnswer(productAndCustomer) || answers.a;
  const b = answers.b.trim() ? answers.b : cleanAnswer(inputs.facts) || answers.b;
  return a === answers.a && b === answers.b ? answers : {a, b};
}

export function buildContentStationPrompt(inputs: ContentStationInputs): string {
  if (!contentStationReady(inputs)) return '';
  const product = inputs.product.trim(), competitor = inputs.competitor.trim();

  const customer = inputs.customer.trim() || '아직 정하지 않았어. 필요한 정보를 질문해줘.';
  const facts = inputs.facts.trim() || '아직 정리하지 않았어. 실제 고객 질문과 내 상품 가이드를 물어봐줘.';
  const sourceInstructions = contentStationUsesExample(inputs)
    ? '가상 실습이야. 예시의 A·B 브랜드와 리뷰는 실제 업체나 후기가 아니야. 해당 업체를 검색하거나 실제 조사처럼 설명하지 말고, 아래 가상 리뷰만 써줘. 가상 사례라고 표시하고 제품의 효능이나 피부 변화를 단정하지 마.'
    : '입력한 경쟁사의 상품·홈페이지·공개 광고와 리뷰부터 검토해줘. 이름이 같은 업체가 있다면 어느 곳인지 물어보고, 다른 곳으로 바꾸지 마. 실제로 읽은 자료의 URL과 확인 날짜를 남겨줘. 웹이나 일부 자료를 열 수 없으면 어떤 주소나 리뷰 원문이 필요한지 알려줘. 확인하지 않은 자료, 별점, 후기, 고객의 말을 만들어내지 마.';

  return `너는 소규모 사업자의 콘텐츠 기획 파트너야. 아래 사업 정보를 바탕으로 경쟁사의 고객 반응과 우리 상품을 비교해, 제작자에게 전달할 15~30초 콘텐츠 기획안을 완성하고 싶어. 지금은 조사와 기획까지만 진행해줘.

[내가 알려준 사업 정보]
상품·서비스: ${product}
조사할 경쟁사 이름·링크: ${competitor}
고객: ${customer}
고객 질문·실제 특징·사용 가이드: ${facts}

[1. 먼저 고객의 반응을 조사해줘]
${sourceInstructions}
이미 알려준 내용은 다시 묻지 말고, 기획에 꼭 필요한 정보가 빠졌을 때 하나씩 질문해줘. 고객이 반복해서 겪는 불편이나 구매 전에 망설이는 이유를 찾아, 직접 확인한 사실과 해석·가설을 나눠줘.

[2. 우리 상품에 적용할 방향을 함께 골라줘]
찾은 불편을 우리 상품의 확인된 특징과 실제 사용 가이드에 대조해줘. 근거가 없다면 확인이 필요하다고 표시하고, 우리 상품의 장점으로 단정하지 마. 서로 다른 콘텐츠 방향을 두 가지 제안해줘. 각각 고객이 겪는 장면, 첫 3초 문장, 보여줄 수 있는 실제 근거를 적고, 내가 방향을 고를 때까지 기다려줘.

[3. 내가 고른 방향으로 기획안을 만들어줘]
- 제목, 구체적인 시청자, 핵심 메시지 한 문장.
- 장면표: 시간 / 화면 / 내레이션 / 자막 / 원본 자료. 전체 길이 안에서 초 구간이 이어지게 하고, 한 장면에는 핵심 하나만 넣어줘.
- 행동 유도 문구(CTA): 구매, 문의, 예약 등 실제 가능한 행동 하나. 링크·가격·혜택은 내가 확인한 정보만 써줘.
- 준비물: 이미 있는 자료와 추가 자료를 나눠줘. 제작 요청문에 장면 순서, 분위기, 화면 비율, 유지할 제품 외형·로고, 금지 표현을 담아줘.

[4. 공개 전에 검수해줘]
첫 장면에서 고객이 자기 상황을 알아볼 수 있는지, 모든 설명에 근거가 있는지, 다음 행동이 하나로 분명한지 확인해줘. 없는 후기·성과·효과를 만들거나 AI 인물을 실제 고객으로 소개하지 마. 결과에 수정한 점과 내가 확인해야 할 점을 따로 적어줘.

먼저 경쟁사 확인이나 자료 검토부터 시작해줘.`;
}
