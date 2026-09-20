import { createHash } from 'node:crypto';

export function conversionCapabilities(env: Record<string, string | undefined>) {
  const enabled = env.EDU_CONVERSION_REVIEW_ENABLED === 'true';
  const production = env.NEXT_PUBLIC_APP_ENV === 'production' || env.VERCEL_ENV === 'production';
  const explicitTest = ['development', 'test'].includes(env.NEXT_PUBLIC_APP_ENV || '') || env.VERCEL_ENV === 'preview';
  return { enabled, can_mock: enabled && env.EDU_CONVERSION_MOCK_ENABLED === 'true' && explicitTest && !production };
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
function version(value: unknown, required = true) {
  if (!required && value === undefined) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) conversionError('최신 버전을 다시 불러와 주세요.', 409);
  return Number(value);
}
export function conversionPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) conversionError('요청 형식을 확인해 주세요.');
  const body = raw as Record<string, unknown>;
  const requestId = conversionId(body.requestId)!;
  const action = String(body.action || '');
  let payload: Record<string, unknown>;
  if (action === 'save_case') {
    const id = conversionId(body.id, false), question_id = conversionId(body.question_id, false);
    const received = question_id ? null : text(body.received_at, 40);
    if (received && (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(received) || !Number.isFinite(Date.parse(received)) || Date.parse(received) > Date.now() + 300000)) conversionError('접수 시각을 확인해 주세요.');
    payload = { id, expected_version: version(body.expected_version, Boolean(id)), question_id,
      course_id: conversionId(body.course_id), cohort_id: conversionId(body.cohort_id, false),
      subject: question_id ? '' : text(body.subject, 200), content: question_id ? '' : text(body.content, 10000),
      source_label: question_id ? '' : text(body.source_label, 200), received_at: received ? new Date(received).toISOString() : null };
  } else if (action === 'save_evidence') {
    const id = conversionId(body.id, false), source_url = text(body.source_url, 2048);
    try { const url = new URL(source_url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) conversionError('자료 출처는 http 또는 https 주소를 사용해 주세요.'); } catch { conversionError('자료 출처 주소를 확인해 주세요.'); }
    if (!['draft', 'approved', 'retired'].includes(String(body.status))) conversionError('자료 상태를 확인해 주세요.');
    payload = { id, expected_version: version(body.expected_version, Boolean(id)), course_id: conversionId(body.course_id), cohort_id: conversionId(body.cohort_id, false), title: text(body.title, 200), body: text(body.body, 10000), source_url, status: body.status };
  } else if (action === 'analyze') {
    payload = { case_id: conversionId(body.case_id), expected_version: version(body.expected_version) };
  } else if (action === 'review') {
    if (!['accept', 'edit', 'hold', 'reject'].includes(String(body.decision))) conversionError('검토 결정을 확인해 주세요.');
    payload = { case_id: conversionId(body.case_id), run_id: conversionId(body.run_id), decision: body.decision,
      reply_text: text(body.reply_text, 10000, ['accept', 'edit'].includes(String(body.decision))), reason: text(body.reason, 1000, body.decision !== 'accept') };
  } else conversionError('지원하지 않는 작업입니다.');
  // Only validated semantic input is fingerprinted. Generated mock output is not
  // part of the client's intent, so a lost response can be retried unchanged.
  const payload_hash = createHash('sha256').update(JSON.stringify({ action, payload })).digest('hex');
  return { action, requestId, payload, payload_hash };
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
