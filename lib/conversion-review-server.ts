import { createHash } from 'node:crypto';

export function conversionCapabilities(env: Record<string, string | undefined>) {
  const enabled = env.EDU_CONVERSION_REVIEW_ENABLED === 'true';
  const appEnvironment = env.NEXT_PUBLIC_APP_ENV || '';
  const production = appEnvironment === 'production';
  const explicitTest = ['development', 'test'].includes(appEnvironment) || (!appEnvironment && env.VERCEL_ENV === 'preview');
  const can_mock = enabled && env.EDU_CONVERSION_MOCK_ENABLED === 'true' && explicitTest && !production;
  const can_jev = enabled && env.EDU_CONVERSION_JEV_ENABLED === 'true' && Boolean(env.TYPESAFE_API_KEY) && explicitTest && !production;
  return { enabled, can_mock, can_jev, can_analyze: can_jev || can_mock, analyze_provider: can_jev ? 'jev' as const : can_mock ? 'mock' as const : null };
}

export function conversionError(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function conversionId(value: unknown, required = true): string | null {
  if (!required && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) conversionError('연결할 항목을 확인해 주세요.');
  return value.toLowerCase();
}
function text(value: unknown, maximum: number, required = true) {
  if (!required && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) conversionError('입력 내용의 필수 항목과 길이를 확인해 주세요.');
  return value.trim();
}
function containsDirectIdentifier(value: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(value)
    || /(?<!\d)(?:\+?82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/u.test(value)
    || /(?<!\d)0(?:2|[3-6]\d|70)[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/u.test(value)
    || /(?:https?:\/\/|www\.)\S+/iu.test(value);
}
function version(value: unknown, required = true) {
  if (!required && value === undefined) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) conversionError('최신 버전을 다시 불러와 주세요.', 409);
  return Number(value);
}
function calibration(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) conversionError('운영자 독립 판정을 확인해 주세요.');
  const item = value as Record<string, unknown>;
  const allowed = {
    purchase_intent: ['high', 'medium', 'low', 'unclear'],
    primary_barrier: ['price', 'schedule', 'skill_level', 'content_fit', 'trust', 'none_or_unknown'],
    purchase_readiness: [0, 1, 2, 3, 4],
    next_action: ['answer_specific_questions', 'invite_webinar', 'offer_purchase_info', 'human_consult', 'hold_no_contact'],
  } as const;
  if (Object.keys(item).length !== 4 || !Object.entries(allowed).every(([key, values]) => (values as readonly unknown[]).includes(item[key]))) {
    conversionError('운영자 독립 판정의 모든 항목을 확인해 주세요.');
  }
  return { purchase_intent: item.purchase_intent, primary_barrier: item.primary_barrier,
    purchase_readiness: item.purchase_readiness, next_action: item.next_action };
}
export function conversionPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) conversionError('요청 형식을 확인해 주세요.');
  const body = raw as Record<string, unknown>;
  const requestId = conversionId(body.requestId)!;
  const action = String(body.action || '');
  let payload: Record<string, unknown>;
  if (action === 'save_case') {
    const id = conversionId(body.id, false), question_id = conversionId(body.question_id, false);
    const sampleOrigin = question_id ? 'current' : (body.sample_origin ?? 'current');
    if (!['current', 'external_legacy'].includes(String(sampleOrigin))) conversionError('문의 표본 출처를 확인해 주세요.');
    const legacyCourseLabel = sampleOrigin === 'external_legacy' ? text(body.legacy_course_label, 200) : null;
    if (sampleOrigin === 'current' && body.legacy_course_label) conversionError('과거 상품명은 과거 교육 상담에만 입력해 주세요.');
    const received = question_id ? null : text(body.received_at, 40);
    if (received && (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(received) || !Number.isFinite(Date.parse(received)) || Date.parse(received) > Date.now() + 300000)) conversionError('접수 시각을 확인해 주세요.');
    const subject = question_id ? '' : text(body.subject, 200);
    const content = question_id ? '' : text(body.content, 10000);
    const sourceLabel = question_id ? '' : text(body.source_label, 200);
    if (!question_id && body.deidentified_confirmed !== true) conversionError('외부 문의의 고객 식별정보 제거 여부를 확인해 주세요.');
    if (!question_id && containsDirectIdentifier(`${subject}\n${content}\n${sourceLabel}`)) conversionError('전화번호·이메일·링크가 포함되어 있습니다. 식별정보를 제거한 발췌만 저장해 주세요.');
    const courseId = conversionId(body.course_id, sampleOrigin !== 'external_legacy');
    const cohortId = conversionId(body.cohort_id, false);
    if (sampleOrigin === 'external_legacy' && cohortId) conversionError('과거 교육 상담에는 현재 기수를 연결할 수 없습니다.');
    if (!question_id && legacyCourseLabel && containsDirectIdentifier(legacyCourseLabel)) conversionError('과거 상품명에서 고객 식별정보를 제거해 주세요.');
    payload = { id, expected_version: version(body.expected_version, Boolean(id)), question_id,
      course_id: courseId, cohort_id: cohortId, sample_origin: sampleOrigin, legacy_course_label: legacyCourseLabel,
      subject, content, source_label: sourceLabel, received_at: received ? new Date(received).toISOString() : null };
  } else if (action === 'save_evidence') {
    const id = conversionId(body.id, false), source_url = text(body.source_url, 2048);
    try { const url = new URL(source_url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) conversionError('자료 출처는 http 또는 https 주소를 사용해 주세요.'); } catch { conversionError('자료 출처 주소를 확인해 주세요.'); }
    if (!['draft', 'approved', 'retired'].includes(String(body.status))) conversionError('자료 상태를 확인해 주세요.');
    payload = { id, expected_version: version(body.expected_version, Boolean(id)), course_id: conversionId(body.course_id), cohort_id: conversionId(body.cohort_id, false), title: text(body.title, 200), body: text(body.body, 10000), source_url, status: body.status };
  } else if (action === 'analyze') {
    payload = { case_id: conversionId(body.case_id), expected_version: version(body.expected_version) };
  } else if (action === 'review') {
    if (!['accept', 'edit', 'hold', 'reject'].includes(String(body.decision))) conversionError('검토 결정을 확인해 주세요.');
    const calibrationValue = calibration(body.calibration);
    const sampleKind = body.calibration_sample_kind === undefined || body.calibration_sample_kind === null ? null : String(body.calibration_sample_kind);
    if ((calibrationValue && !['operational', 'test'].includes(sampleKind || '')) || (!calibrationValue && sampleKind !== null)) conversionError('교정 표본 용도를 확인해 주세요.');
    payload = { case_id: conversionId(body.case_id), run_id: conversionId(body.run_id), decision: body.decision,
      reply_text: text(body.reply_text, 10000, ['accept', 'edit'].includes(String(body.decision))), reason: text(body.reason, 1000, body.decision !== 'accept'),
      calibration: calibrationValue, calibration_sample_kind: sampleKind };
  } else conversionError('지원하지 않는 작업입니다.');
  // Only validated semantic input is fingerprinted. Generated mock output is not
  // part of the client's intent, so a lost response can be retried unchanged.
  const payload_hash = createHash('sha256').update(JSON.stringify({ action, payload })).digest('hex');
  return { action, requestId, payload, payload_hash };
}

export function conversionAdjudicationPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) conversionError('요청 형식을 확인해 주세요.');
  const body = raw as Record<string, unknown>;
  const requestId = conversionId(body.requestId)!;
  const runId = conversionId(body.run_id)!;
  const calibrationReviewId = conversionId(body.calibration_review_id)!;
  const dimension = String(body.dimension || '');
  const assessment = String(body.assessment || '');
  const basis = String(body.basis || '');
  const rationale = text(body.rationale, 1000);
  if (!['purchase_intent', 'primary_barrier', 'purchase_readiness', 'next_action'].includes(dimension)
    || !['human_better_supported', 'jev_better_supported', 'both_plausible', 'neither_supported', 'insufficient_evidence'].includes(assessment)
    || !['explicit_signal', 'interpretation', 'category_gap', 'missing_context'].includes(basis)
    || rationale.length < 10) conversionError('재검토 항목과 근거를 확인해 주세요.');
  if (containsDirectIdentifier(rationale)) conversionError('재검토 근거에서 연락처·이메일·링크를 제거해 주세요.');
  const payload = { run_id: runId, calibration_review_id: calibrationReviewId, dimension, assessment, basis, rationale };
  const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { requestId, payload, payloadHash };
}

export function conversionDatabaseError(error: { code?: string; message?: string }) {
  const message = error.message || '';
  if (message.includes('CONVERSION_FORBIDDEN')) conversionError('이 작업에 필요한 운영 권한이 없습니다.', 403);
  if (message.includes('CONVERSION_STALE')) conversionError('문의 또는 자료가 변경됐습니다. 최신 내용을 동기화하고 다시 판단해 주세요.', 409);
  if (message.includes('CONVERSION_REQUEST_REUSED')) conversionError('같은 요청 ID로 다른 내용을 저장할 수 없습니다.', 409);
  if (message.includes('CONVERSION_NOT_FOUND')) conversionError('연결된 항목을 찾을 수 없습니다.', 404);
  if (message.includes('CONVERSION_INVALID') || ['23503', '23514', '22P02'].includes(error.code || '')) conversionError('상품·기수·자료와 입력 내용을 확인해 주세요.');
  if (error.code === '23505') conversionError('이미 연결된 문의입니다. 기존 검토 건을 열어 주세요.', 409);
  conversionError('전환 관리 저장소를 사용할 수 없습니다. 연결과 migration 적용 상태를 확인해 주세요.', 503);
}
