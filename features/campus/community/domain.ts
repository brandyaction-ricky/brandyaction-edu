import { campusError, isCampusId } from '../snapshot';

export const communityKinds = ['portfolio', 'feedback', 'process', 'failure', 'talent_offer', 'talent_request', 'demo_day'] as const;
export type CommunityKind = typeof communityKinds[number];
export const kindLabels: Record<CommunityKind, string> = { portfolio: '내 결과물 모음', feedback: '의견 요청', process: '작업 과정', failure: '실패에서 배운 점', talent_offer: '도움 드려요', talent_request: '도움 구해요', demo_day: '문샷 결과물 발표회' };
export type CommunityPost = { id: string; owner_id: string; enrollment_id: string; cohort_id: string; alias: string; kind: CommunityKind; title: string; body: string; url: string; image_urls: string[]; lesson_id: string | null; visibility: 'private' | 'cohort'; revision: number; hidden: boolean; created_at: string; updated_at: string };
export type CommunityRevision = Pick<CommunityPost, 'id' | 'title' | 'body' | 'url' | 'image_urls' | 'visibility' | 'revision' | 'created_at'> & { post_id: string; change_note: string };
export type CommunityComment = { id: string; post_id: string; author_id: string; alias: string; body: string; post_revision: number; hidden: boolean; created_at: string };
export type CommunityAcknowledgment = { comment_id: string; owner_id: string; useful: boolean; decision: 'pending' | 'apply' | 'keep'; reason: string; applied_revision: number | null; revision: number; updated_at: string };
export type CommunityReport = { id: string; reporter_id: string; post_id: string; comment_id: string | null; reason: string; status: 'open' | 'resolved'; created_at: string };
export type CommunityRewards = { ruleVersion: string; approvedMissions: number; requiredMissions: number; usefulFeedback: number; appliedRevisions: number; xp: number; level: number; badges: string[]; eligible: boolean; claimedAt: string | null; cohortLaunches: number; cohortGoal: number; reasons: string[] };
export type CommunityState = { posts: CommunityPost[]; revisions: CommunityRevision[]; comments: CommunityComment[]; acknowledgments: CommunityAcknowledgment[]; reports: CommunityReport[]; blockedIds: string[]; rewards: CommunityRewards; operator: boolean; demo: boolean; pageInfo?: { page: number; hasNext: boolean } };
export type CommunityCommand = {
  requestId: string; enrollmentId: string; action: 'create' | 'revise' | 'comment' | 'acknowledge' | 'block' | 'unblock' | 'report' | 'moderate' | 'launch';
  postId?: string; commentId?: string; targetId?: string; reportId?: string; expectedRevision?: number;
  kind?: CommunityKind; title?: string; body?: string; url?: string; imageUrls?: string[]; lessonId?: string | null; alias?: string;
  visibility?: 'private' | 'cohort'; changeNote?: string; useful?: boolean; decision?: 'pending' | 'apply' | 'keep'; reason?: string; appliedRevision?: number;
  moderation?: 'hide_post' | 'restore_post' | 'hide_comment' | 'restore_comment' | 'resolve_report';
};
export function safeCommunityUrl(value: unknown, optional = true): string {
  if (optional && (value === '' || value == null)) return '';
  if (typeof value !== 'string' || value.length > 1200) campusError(400, '올바른 HTTPS 주소를 입력해 주세요.');
  let url: URL;
  try { url = new URL(value); } catch { return campusError(400, '올바른 HTTPS 주소를 입력해 주세요.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
    || /^\d[\d.]*$/.test(host) || host.includes(':') || /[\u0000-\u0020\\]/.test(value)) campusError(400, '공개 HTTPS 주소만 사용할 수 있습니다.');
  return url.href;
}
function string(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) campusError(400, '입력 길이를 확인해 주세요.');
  return value.trim();
}
export function validateCommunityCommand(input: unknown): CommunityCommand {
  if (!input || typeof input !== 'object' || Array.isArray(input)) campusError(400, '요청 형식을 확인해 주세요.');
  const c = input as CommunityCommand;
  if (!isCampusId(c.requestId) || !isCampusId(c.enrollmentId) || !['create', 'revise', 'comment', 'acknowledge', 'block', 'unblock', 'report', 'moderate', 'launch'].includes(c.action)) campusError(400, '요청 형식을 확인해 주세요.');
  const out: CommunityCommand = { requestId: c.requestId, enrollmentId: c.enrollmentId, action: c.action };
  for (const name of ['postId', 'commentId', 'targetId', 'reportId'] as const) if (c[name] !== undefined) { if (!isCampusId(c[name])) campusError(400, '대상을 확인해 주세요.'); out[name] = c[name]; }
  if (['revise', 'comment', 'acknowledge', 'report', 'moderate'].includes(c.action) && !out.postId) campusError(400, '작업물을 선택해 주세요.');
  if (['revise', 'comment', 'acknowledge'].includes(c.action)) { if (!Number.isSafeInteger(c.expectedRevision) || c.expectedRevision! < (c.action === 'acknowledge' ? 0 : 1)) campusError(400, '최신 버전을 확인해 주세요.'); out.expectedRevision = c.expectedRevision; }
  if (['create', 'revise'].includes(c.action)) {
    if (!communityKinds.includes(c.kind!) || !['private', 'cohort'].includes(c.visibility!)) campusError(400, '분류와 공개 범위를 선택해 주세요.');
    out.kind = c.kind; out.visibility = c.visibility; out.title = string(c.title, 2, 100); out.body = string(c.body, 10, 6000); out.url = safeCommunityUrl(c.url); out.alias = string(c.alias, 2, 24);
    if (!Array.isArray(c.imageUrls) || c.imageUrls.length > 4) campusError(400, '이미지 링크는 네 개까지 등록할 수 있습니다.');
    out.imageUrls = [...new Set(c.imageUrls.map(v => safeCommunityUrl(v, false)))];
    if (c.lessonId != null && !isCampusId(c.lessonId)) campusError(400, '수업을 선택해 주세요.'); out.lessonId = c.lessonId ?? null;
    out.changeNote = c.action === 'revise' ? string(c.changeNote, 5, 500) : '첫 결과물 저장';
  }
  if (c.action === 'comment') { out.body = string(c.body, 10, 2000); out.alias = string(c.alias, 2, 24); }
  if (c.action === 'acknowledge') {
    if (!out.commentId || typeof c.useful !== 'boolean' || !['pending', 'apply', 'keep'].includes(c.decision!)) campusError(400, '의견 확인 방식을 선택해 주세요.');
    out.useful = c.useful; out.decision = c.decision; out.reason = string(c.reason ?? '', c.decision === 'pending' ? 0 : 5, 1000);
    if (c.decision === 'apply') { if (!Number.isSafeInteger(c.appliedRevision) || c.appliedRevision! < 2) campusError(400, '반영한 새 버전을 선택해 주세요.'); out.appliedRevision = c.appliedRevision; }
  }
  if (['block', 'unblock'].includes(c.action) && !out.targetId) campusError(400, '대상을 선택해 주세요.');
  if (['report', 'moderate'].includes(c.action)) out.reason = string(c.reason, 5, 1000);
  if (c.action === 'moderate') { if (!['hide_post', 'restore_post', 'hide_comment', 'restore_comment', 'resolve_report'].includes(c.moderation!)) campusError(400, '처리 방법을 선택해 주세요.'); out.moderation = c.moderation; }
  return out;
}

export const rewardRule = { version: 'moonshot-v1', missionXp: 100, usefulXp: 20, usefulRequired: 1, revisionsRequired: 1, cohortGoal: 5 } as const;
export function calculateCommunityRewards(approved: number, required: number, useful: number, applied: number, claimedAt: string | null = null, cohortLaunches = 0): CommunityRewards {
  const xp = approved * rewardRule.missionXp + useful * rewardRule.usefulXp;
  const reasons = [required === 0 ? '현재 공개된 필수 과제가 필요해요.' : approved < required ? `필수 과제 승인 ${approved}/${required}` : '', useful < 1 ? '다른 동료에게 받은 도움됨 1개가 필요해요.' : '', applied < 1 ? '받은 의견을 새 버전에 반영한 기록 1개가 필요해요.' : ''].filter(Boolean);
  return { ruleVersion: rewardRule.version, approvedMissions: approved, requiredMissions: required, usefulFeedback: useful, appliedRevisions: applied, xp, level: 1 + Math.floor(xp / 200), badges: [approved > 0 ? '첫 과제 승인' : '', useful > 0 ? '도움이 된 동료' : '', applied > 0 ? '한 번 더 개선' : '', !reasons.length ? '문샷 발사 준비' : ''].filter(Boolean), eligible: !reasons.length, claimedAt, cohortLaunches, cohortGoal: rewardRule.cohortGoal, reasons };
}
