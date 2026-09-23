/** Shared DTOs and deterministic demo helpers. No model call or delivery occurs here. */
export type ConversionCase = {
  id: string;
  source_type: 'native' | 'manual';
  sample_origin: 'current' | 'external_legacy';
  legacy_course_label: string | null;
  question_id: string | null;
  course_id: string | null;
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

export type JevChoiceAnswer = { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> };
export type JevScoreAnswer = { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };
export type JevResult = Omit<MockResult, 'mode'> & {
  mode: 'jev';
  model: string;
  decision_version: 1;
  decisions: {
    purchase_intent: JevChoiceAnswer;
    primary_barrier: JevChoiceAnswer;
    purchase_readiness: JevScoreAnswer;
    next_action: JevChoiceAnswer;
  };
};

export type JevCalibration = {
  purchase_intent: 'high' | 'medium' | 'low' | 'unclear';
  primary_barrier: 'price' | 'schedule' | 'skill_level' | 'content_fit' | 'trust' | 'none_or_unknown';
  purchase_readiness: 0 | 1 | 2 | 3 | 4;
  next_action: 'answer_specific_questions' | 'invite_webinar' | 'offer_purchase_info' | 'human_consult' | 'hold_no_contact';
};

export type JevDimension = keyof JevCalibration;
export type ConversionAdjudicationNote = {
  id: string;
  run_id: string;
  calibration_review_id: string;
  dimension: JevDimension;
  assessment: 'human_better_supported' | 'jev_better_supported' | 'both_plausible' | 'neither_supported' | 'insufficient_evidence';
  basis: 'explicit_signal' | 'interpretation' | 'category_gap' | 'missing_context';
  rationale: string;
  actor_id: string;
  created_at: string;
};

export type ConversionJevV2Run = {
  id: string;
  v1_run_id: string;
  case_id: string;
  calibration_review_id: string;
  input_version: number;
  status: 'pending' | 'completed' | 'failed';
  result: import('./conversion-jev-v2').JevV2Result | null;
  created_at: string;
  updated_at: string;
};

export type ConversionJevV3Run = {
  id: string;
  v1_run_id: string;
  case_id: string;
  calibration_review_id: string;
  input_version: number;
  status: 'pending' | 'completed' | 'failed';
  result: import('./conversion-jev-v3').JevV3Result | null;
  created_at: string;
  updated_at: string;
};

export type ConversionJevV4Run = {
  id: string;
  v1_run_id: string;
  case_id: string;
  calibration_review_id: string;
  input_version: number;
  status: 'pending' | 'completed' | 'failed';
  result: import('./conversion-jev-v4').JevV4Result | null;
  created_at: string;
  updated_at: string;
};

export type ConversionRun = {
  id: string;
  case_id: string;
  input_version: number;
  provider: 'mock' | 'jev';
  result: MockResult | JevResult;
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
  calibration: JevCalibration | null;
  calibration_sample_kind: 'operational' | 'test' | null;
  created_at: string;
  actor_id: string;
};

export type JevCalibrationSummary = {
  samples: number;
  test_samples: number;
  current_samples: number;
  legacy_samples: number;
  minimum_samples: number;
  remaining_for_threshold_review: number;
  dimensions: Record<keyof JevCalibration, { matches: number; total: number; rate: number | null }>;
  by_origin: Record<'current' | 'external_legacy', Record<keyof JevCalibration, { matches: number; total: number; rate: number | null }>>;
  low_confidence_disagreements: number;
};

export type ConversionSnapshot = {
  cases: ConversionCase[];
  evidence: ConversionEvidence[];
  questions: { id: string; title: string; content: string; course_id: string | null; user_id: string; updated_at: string; created_at: string }[];
  courses: { id: string; title: string }[];
  cohorts: { id: string; course_id: string; name: string }[];
  runs: ConversionRun[];
  reviews: ConversionReviewRecord[];
  adjudications?: ConversionAdjudicationNote[];
  jev_v2_runs?: ConversionJevV2Run[];
  jev_v3_runs?: ConversionJevV3Run[];
  jev_v4_runs?: ConversionJevV4Run[];
  capabilities: { can_manage_evidence: boolean; can_mock: boolean; can_jev?: boolean; can_adjudicate?: boolean; can_jev_v2?: boolean; can_jev_v3?: boolean; can_jev_v4?: boolean; can_analyze?: boolean; analyze_provider?: 'mock' | 'jev' | null; can_manage_funnel?: boolean };
};

export const MOCK_NOTICE = '모의 판단입니다. 단어 일치로 화면과 기록 흐름을 확인하며, 실제 AI 판단이나 답변 정확도를 검증한 결과가 아닙니다. 모든 내용은 운영자가 확인해야 합니다.';
export const topicLabels: Record<ConversionTopic, string> = {
  price: '가격', schedule: '일정', content: '내용', level: '수준', usage: '이용 방법',
};
export const inquiryTypeLabels: Record<InquiryType, string> = {
  prepurchase: '구매 전 상품 질문', support: '이용 지원', payment_refund: '결제·환불', mixed: '혼합', unknown: '판단 불가',
};

const calibrationKeys = ['purchase_intent', 'primary_barrier', 'purchase_readiness', 'next_action'] as const;

export function calibrationForRun(runId: string, reviews: ConversionReviewRecord[]): ConversionReviewRecord | undefined {
  return reviews.filter(review => review.run_id === runId && review.calibration)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

/** Only fresh, first-time historical Jev reviews belong in the blind batch queue. */
export function historicalCalibrationQueue(snapshot: Pick<ConversionSnapshot, 'cases' | 'runs' | 'reviews' | 'evidence'>) {
  const latestRun = new Map<string, ConversionRun>();
  for (const run of snapshot.runs) {
    const previous = latestRun.get(run.case_id);
    if (!previous || run.created_at > previous.created_at || (run.created_at === previous.created_at && run.id > previous.id)) {
      latestRun.set(run.case_id, run);
    }
  }
  const calibratedCases = new Set(snapshot.reviews.filter(review => review.calibration).map(review => review.case_id));
  return snapshot.cases.flatMap(item => {
    const run = latestRun.get(item.id);
    if (item.sample_origin !== 'external_legacy' || item.subject.startsWith('[DEV 검증]')
      || calibratedCases.has(item.id) || !run || run.provider !== 'jev'
      || isRunStale(run, item, snapshot.evidence)) return [];
    return [{ inquiry: item, run }];
  }).sort((a, b) => a.inquiry.received_at.localeCompare(b.inquiry.received_at) || a.inquiry.id.localeCompare(b.inquiry.id));
}

export function buildJevCalibrationSummary(runs: ConversionRun[], reviews: ConversionReviewRecord[], cases: ConversionCase[] = []): JevCalibrationSummary {
  const emptyDimensions = () => Object.fromEntries(calibrationKeys.map(key => [key, { matches: 0, total: 0, rate: null }])) as JevCalibrationSummary['dimensions'];
  const dimensions = emptyDimensions();
  const byOrigin = { current: emptyDimensions(), external_legacy: emptyDimensions() };
  let samples = 0;
  let testSamples = 0;
  let currentSamples = 0;
  let legacySamples = 0;
  let lowConfidenceDisagreements = 0;
  const firstByCase = new Map<string, { run: ConversionRun; review: ConversionReviewRecord }>();
  for (const run of runs) {
    if (run.result.mode !== 'jev') continue;
    const review = calibrationForRun(run.id, reviews);
    if (!review?.calibration) continue;
    const previous = firstByCase.get(run.case_id);
    if (!previous || review.created_at < previous.review.created_at
      || (review.created_at === previous.review.created_at && review.id < previous.review.id)) {
      firstByCase.set(run.case_id, { run, review });
    }
  }
  for (const { run, review } of firstByCase.values()) {
    if (!review.calibration || run.result.mode !== 'jev') continue;
    if (review.calibration_sample_kind === 'test') { testSamples += 1; continue; }
    if (review.calibration_sample_kind !== 'operational') continue;
    samples += 1;
    const origin = cases.find(item => item.id === run.case_id)?.sample_origin
      ?? run.input_snapshot?.sample_origin;
    const group = origin === 'external_legacy' ? 'external_legacy' : 'current';
    if (group === 'external_legacy') legacySamples += 1;
    else currentSamples += 1;
    for (const key of calibrationKeys) {
      const answer = run.result.decisions[key];
      const predicted = key === 'purchase_readiness'
        ? Math.round(run.result.decisions.purchase_readiness.score)
        : (answer as JevChoiceAnswer).choice;
      const matched = predicted === review.calibration[key];
      dimensions[key].total += 1;
      byOrigin[group][key].total += 1;
      if (matched) { dimensions[key].matches += 1; byOrigin[group][key].matches += 1; }
      else if (answer.confidence < 0.7) lowConfidenceDisagreements += 1;
    }
  }
  for (const group of [dimensions, byOrigin.current, byOrigin.external_legacy]) for (const key of calibrationKeys) {
    const item = group[key];
    item.rate = item.total ? item.matches / item.total : null;
  }
  const minimumSamples = 20;
  return { samples, test_samples: testSamples, current_samples: currentSamples, legacy_samples: legacySamples, minimum_samples: minimumSamples,
    remaining_for_threshold_review: Math.max(0, minimumSamples - samples),
    dimensions, by_origin: byOrigin, low_confidence_disagreements: lowConfidenceDisagreements };
}

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
