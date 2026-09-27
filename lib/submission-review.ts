import { uuid } from './edu-workflows';

export const reviewCheckItems = [
  { key: 'answers_complete', label: '필수 답변이 모두 작성됨' },
  { key: 'evidence_consistent', label: '실행 결과와 증빙이 일치함' },
  { key: 'criteria_met', label: '미션의 완료 기준을 충족함' },
] as const;
export type ReviewChecks = { version: 1; answers_complete: boolean; evidence_consistent: boolean; criteria_met: boolean };
export const emptyReviewChecks = (): ReviewChecks => ({ version: 1, answers_complete: false, evidence_consistent: false, criteria_met: false });
export const reviewDecisions = ['approved', 'changes_requested', 'rejected'] as const;
export type ReviewDecision = typeof reviewDecisions[number];
export function isReviewChecks(value: unknown): value is ReviewChecks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 4 && row.version === 1 && reviewCheckItems.every(item => typeof row[item.key] === 'boolean');
}

// Both existing write entry points share this additive, backwards-compatible contract.
export function reviewMutation(actor: string, body: Record<string, unknown>) {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every(uuid) || new Set(ids).size !== ids.length) fail('대상을 최대 50개까지 선택해 주세요.');
  if (!reviewDecisions.includes(body.decision as ReviewDecision)) fail('검토 결과를 선택해 주세요.');
  if (body.feedback != null && typeof body.feedback !== 'string') fail('피드백을 확인해 주세요.');
  const feedback = String(body.feedback || '').trim();
  if (feedback.length > 2000) fail('피드백은 2,000자 이내로 입력해 주세요.');
  if (body.decision !== 'approved' && !feedback) fail('보완·반려 사유를 입력해 주세요.');
  const params = { p_actor: actor, p_ids: ids, p_decision: body.decision, p_feedback: feedback };
  if (body.reviewMode === undefined && body.reviewChecks === undefined) return { name: 'review_mission_submissions', params };
  if (!['single', 'bulk'].includes(String(body.reviewMode))) fail('검토 방식을 확인해 주세요.');
  if (body.reviewMode === 'single' && ((ids as string[]).length !== 1 || !isReviewChecks(body.reviewChecks))) fail('검토 확인 항목을 확인해 주세요.');
  if (body.reviewMode === 'bulk' && body.reviewChecks !== undefined) fail('일괄 검토에 개별 체크 결과를 적용할 수 없습니다.');
  return { name: 'review_mission_submissions_with_checks', params: { ...params, p_checks: body.reviewChecks ?? null, p_mode: body.reviewMode } };
}

export function reviewWriteError(error: { code?: string; message?: string }) {
  if (error.code === 'PT409' || (error.code === 'P0001' && error.message?.includes('이미 검토된 제출'))) return { status: 409, code: 'REVIEW_CONFLICT', error: '다른 운영자가 먼저 검토한 제출물이 있습니다. 작성한 내용은 유지됩니다. 최신 결과를 확인해 주세요.' };
  if (error.code === '42501') return { status: 403, code: 'REVIEW_FORBIDDEN', error: '회원 관리 권한을 확인해 주세요.' };
  if (error.code === 'P0002') return { status: 404, code: 'REVIEW_NOT_FOUND', error: '일부 제출 내역이 없습니다. 최신 목록을 확인해 주세요.' };
  if (['22023', 'P0001'].includes(error.code || '')) return { status: 409, code: 'REVIEW_INVALID', error: '검토 대상과 피드백을 확인해 주세요.' };
  return { status: 503, code: 'REVIEW_UNAVAILABLE', error: '검토 저장을 확인하지 못했습니다. 작성한 내용은 유지됩니다. 최신 결과를 확인한 뒤 다시 시도해 주세요.' };
}

export type ReviewRecord = { id: string; decision: ReviewDecision; reviewedAt: string; reviewer: string; feedback: string; checks: ReviewChecks | null; mode: 'single' | 'bulk' | 'legacy' };
export type ReviewHistory = { rows: ReviewRecord[]; total: number; page: number; pageSize: number; current: { id: string; status: string; reviewed_at: string | null; reviewer_feedback: string | null } };

// Never send the raw audit JSON, actor ID, IP, or unrelated audit fields to the browser.
export function reviewRecord(row: Record<string, unknown>, reviewer: string): ReviewRecord | null {
  const decision = String(row.action || '').replace(/^mission_submission\./, '') as ReviewDecision;
  if (!reviewDecisions.includes(decision)) return null;
  const after = row.after_data && typeof row.after_data === 'object' ? row.after_data as Record<string, unknown> : {};
  return { id: String(row.id), decision, reviewedAt: String(row.created_at), reviewer,
    feedback: typeof after.feedback === 'string' ? after.feedback : '',
    checks: isReviewChecks(after.review_checks) ? after.review_checks : null,
    mode: after.review_mode === 'bulk' ? 'bulk' : after.review_mode === 'single' ? 'single' : 'legacy' };
}
