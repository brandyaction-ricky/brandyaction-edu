/** Shared DTOs and deterministic demo helpers. No model call or delivery occurs here. */
export type ConversionCase = {
  id: string;
  source_type: 'native' | 'manual';
  question_id: string | null;
  course_id: string;
  cohort_id: string | null;
  subject: string;
  content: string;
  source_label: string;
  received_at: string;
  customer_id: string | null;
  input_version: number;
  created_at: string;
};

export type ConversionEvidence = {
  id: string;
  course_id: string;
  cohort_id: string | null;
  title: string;
  body: string;
  source_url: string;
  version: number;
  status: 'draft' | 'approved' | 'retired';
};

export type ConversionTopic = 'price' | 'schedule' | 'content' | 'level' | 'usage';
export type InquiryType = 'prepurchase' | 'support' | 'payment_refund' | 'mixed' | 'unknown';
export type InquirySpan = { field: 'subject' | 'content'; start: number; end: number; text: string };
export type MockResult = {
  mode: 'mock';
  notice: string;
  inquiry_type: InquiryType;
  topics: { topic: ConversionTopic; status: 'explicit' | 'not_explicit'; spans: InquirySpan[] }[];
  candidates: {
    evidence_id: string;
    evidence_version: number;
    fit: 'partial' | 'irrelevant';
    matched_topics: ConversionTopic[];
    reason: string;
  }[];
  missing_topics: ConversionTopic[];
  proposed_reply: string;
  requires_human_review: true;
};

export type ConversionRun = {
  id: string;
  case_id: string;
  input_version: number;
  provider: 'mock';
  result: MockResult;
  evidence_versions: Record<string, number>;
  input_snapshot?: Pick<ConversionCase, 'subject' | 'content' | 'course_id' | 'cohort_id' | 'input_version'> & Record<string, unknown>;
  evidence_snapshot?: ConversionEvidence[];
  created_at: string;
};

export type ConversionReviewRecord = {
  id: string;
  case_id: string;
  run_id: string;
  decision: 'accept' | 'edit' | 'hold' | 'reject';
  reply_text: string;
  reason: string;
  created_at: string;
  actor_id: string;
};

export type ConversionSnapshot = {
  cases: ConversionCase[];
  evidence: ConversionEvidence[];
  questions: { id: string; title: string; content: string; course_id: string | null; user_id: string; updated_at: string; created_at: string }[];
  courses: { id: string; title: string }[];
  cohorts: { id: string; course_id: string; name: string }[];
  runs: ConversionRun[];
  reviews: ConversionReviewRecord[];
  capabilities: { can_manage_evidence: boolean; can_mock: boolean };
};

export const MOCK_NOTICE = '모의 판단입니다. 단어 일치로 화면과 기록 흐름을 확인하며, 실제 AI 판단이나 답변 정확도를 검증한 결과가 아닙니다. 모든 내용은 운영자가 확인해야 합니다.';
export const topicLabels: Record<ConversionTopic, string> = {
  price: '가격', schedule: '일정', content: '내용', level: '수준', usage: '이용 방법',
};
export const inquiryTypeLabels: Record<InquiryType, string> = {
  prepurchase: '구매 전 상품 질문', support: '이용 지원', payment_refund: '결제·환불', mixed: '혼합', unknown: '판단 불가',
};

const topicPatterns: Record<ConversionTopic, RegExp> = {
  price: /가격|수강료|비용|금액|얼마|할인/gu,
  schedule: /일정|날짜|언제|요일|몇\s*시|시간표|기간/gu,
  content: /커리큘럼|내용|무엇을|뭘\s*배우|어떤\s*(?:것|걸|수업)|실습/gu,
  level: /초보|입문|난이도|수준|선수\s*지식|따라갈|경험이\s*없/gu,
  usage: /녹화|다시\s*보기|다시\s*볼|실시간|참석|이용\s*방법|수강\s*방법|온라인|오프라인/gu,
};

function spansFor(topic: ConversionTopic, item: Pick<ConversionCase, 'subject' | 'content'>): InquirySpan[] {
  return (['subject', 'content'] as const).flatMap(field => {
    const matches = item[field].matchAll(new RegExp(topicPatterns[topic].source, topicPatterns[topic].flags));
    return Array.from(matches, match => ({ field, start: match.index, end: match.index + match[0].length, text: match[0] }));
  });
}

export function isEvidenceInScope(item: Pick<ConversionCase, 'course_id' | 'cohort_id'>, evidence: ConversionEvidence): boolean {
  return Boolean(item.course_id) && evidence.status === 'approved'
    && evidence.course_id === item.course_id
    && (evidence.cohort_id === null || evidence.cohort_id === item.cohort_id);
}

/** Every approved candidate matters, even if a mock keyword match did not select its body. */
export function evidenceVersions(item: Pick<ConversionCase, 'course_id' | 'cohort_id'>, evidence: ConversionEvidence[]): Record<string, number> {
  return Object.fromEntries(evidence.filter(entry => isEvidenceInScope(item, entry)).map(entry => [entry.id, entry.version]));
}

export function isRunStale(run: ConversionRun, item: ConversionCase, evidence: ConversionEvidence[]): boolean {
  if (run.case_id !== item.id || run.input_version !== item.input_version) return true;
  const current = evidenceVersions(item, evidence);
  const before = run.evidence_versions;
  return Object.keys(current).length !== Object.keys(before).length
    || Object.entries(current).some(([id, version]) => before[id] !== version);
}

export function createMockJudgment(item: ConversionCase, evidence: ConversionEvidence[]): MockResult {
  const topics: MockResult['topics'] = (Object.keys(topicLabels) as ConversionTopic[]).map(topic => {
    const spans = spansFor(topic, item);
    return { topic, status: spans.length ? 'explicit' : 'not_explicit', spans };
  });
  const explicitTopics = topics.filter(topic => topic.status === 'explicit').map(topic => topic.topic);
  const text = `${item.subject}\n${item.content}`;
  const payment = /환불|취소|결제|영수증|입금/u.test(text);
  const support = /오류|접속|로그인|재생|수강\s*중|비밀번호/u.test(text);
  const kinds: InquiryType[] = [];
  if (payment) kinds.push('payment_refund');
  if (support) kinds.push('support');
  if (explicitTopics.length && !payment && !support) kinds.push('prepurchase');
  const inquiry_type: InquiryType = kinds.length > 1 ? 'mixed' : kinds[0] || 'unknown';
  const eligible = evidence.filter(entry => isEvidenceInScope(item, entry)).sort((a, b) => a.id.localeCompare(b.id));
  const candidates: MockResult['candidates'] = eligible.map(entry => {
    const matched_topics = explicitTopics.filter(topic => spansFor(topic, { subject: entry.title, content: entry.body }).length > 0);
    return {
      evidence_id: entry.id,
      evidence_version: entry.version,
      fit: matched_topics.length ? 'partial' : 'irrelevant',
      matched_topics,
      reason: matched_topics.length
        ? '문의와 자료에 같은 주제 단어가 있습니다. 실제 답변 가능 여부와 상충 여부는 확인하지 않은 모의 후보입니다.'
        : '일치하는 주제 단어가 없어 모의 추천에서 제외했습니다. 실제 무관 여부를 판단한 결과는 아닙니다.',
    };
  });
  const chosen = new Set<string>();
  let replyLength = 0, omittedCount = 0;
  for (const [index, entry] of eligible.entries()) {
    const candidate = candidates[index];
    if (candidate.fit !== 'partial') continue;
    const nextLength = replyLength + (chosen.size ? 2 : 0) + entry.body.length;
    if (nextLength > 10000) {
      omittedCount += 1;
      candidate.reason += ' 검토 내용의 10,000자 한도로 제안문에는 포함하지 않았습니다. 자료 원문을 확인해 주세요.';
      continue;
    }
    chosen.add(entry.id);
    replyLength = nextLength;
  }
  return {
    mode: 'mock',
    notice: MOCK_NOTICE + (omittedCount ? ` 검토 내용의 10,000자 한도로 자료 ${omittedCount}건을 제안문에서 제외했습니다. 제외된 자료도 아래 후보에서 확인할 수 있습니다.` : ''),
    inquiry_type,
    topics,
    candidates,
    missing_topics: explicitTopics.filter(topic => !candidates.some(candidate => chosen.has(candidate.evidence_id) && candidate.matched_topics.includes(topic))),
    // Keep whole approved bodies within the review limit; never cut off conditions.
    proposed_reply: eligible.filter(entry => chosen.has(entry.id)).map(entry => entry.body).join('\n\n'),
    requires_human_review: true,
  };
}
