import type { CampusSnapshot } from '../contracts';
import { campusError } from '../snapshot';
import { calculateCommunityRewards, validateCommunityCommand, type CommunityState, type CommunityCommand, type CommunityPost } from './domain';
export const demoPeerId = '10000000-0000-4000-8000-000000000002';
const demoPostId = '10000000-0000-4000-8000-000000000003';
export function createCommunityDemo(snapshot: CampusSnapshot): CommunityState {
  const scope = snapshot.scopes.find(s => s.enrollmentId === snapshot.selectedEnrollmentId);
  const now = new Date().toISOString();
  const peer: CommunityPost = { id: demoPostId, owner_id: demoPeerId, enrollment_id: '10000000-0000-4000-8000-000000000004', cohort_id: scope?.cohortId ?? '', alias: '예시 동료 지우', kind: 'feedback', title: '첫 화면만 보고 누구를 위한 서비스인지 알 수 있나요?', body: '지역 공방을 위한 신청 페이지를 만들었어요.\n\n시도한 것: 대상과 받을 수 있는 결과를 첫 화면에 넣었습니다.\n궁금한 점: 신청 버튼을 누르기 전에 더 필요한 정보가 있을까요?', url: 'https://example.com/workshop', image_urls: [], lesson_id: snapshot.lessons[0]?.id ?? null, visibility: 'cohort', revision: 1, hidden: false, created_at: now, updated_at: now };
  const missions = snapshot.lessons.flatMap(l => l.missions).filter(m => m.required);
  return { posts: [peer], revisions: [{ ...peer, post_id: peer.id, change_note: '첫 결과물 저장' }], comments: [], acknowledgments: [], reports: [], blockedIds: [], operator: false, demo: true, rewards: calculateCommunityRewards(missions.filter(m => m.status === 'approved').length, missions.length, 0, 0) };
}
/** Synthetic memory-only transport. It runs the real command validator and mirrors the server's ownership/CAS transitions. */
export function mutateCommunityDemo(original: CommunityState, input: CommunityCommand, snapshot: CampusSnapshot, actor = snapshot.viewer.id, receipts = new Map<string, string>()): CommunityState {
  const c = validateCommunityCommand(input), signature = JSON.stringify(c);
  if (receipts.has(c.requestId)) { if (receipts.get(c.requestId) !== signature) campusError(409, '같은 요청의 내용이 다릅니다.'); return original; }
  const scope = snapshot.scopes.find(s => s.enrollmentId === c.enrollmentId);
  if (!scope) campusError(403, '기수를 선택해 주세요.');
  const state = structuredClone(original), now = new Date().toISOString();
  let post = state.posts.find(p => p.id === c.postId);
  if (['revise', 'comment', 'acknowledge', 'report'].includes(c.action) && (!post || post.cohort_id !== scope.cohortId || post.hidden || (post.owner_id !== actor && post.visibility !== 'cohort'))) campusError(403, '공유된 작업물을 선택해 주세요.');
  if (post && state.blockedIds.includes(post.owner_id)) campusError(403, '차단된 동료입니다.');
  if (['create', 'revise'].includes(c.action)) {
    if (c.lessonId && !snapshot.lessons.some(l => l.id === c.lessonId)) campusError(403, '수업을 확인해 주세요.');
    if (c.action === 'revise' && (post!.owner_id !== actor || post!.kind !== c.kind)) campusError(403, '내 작업물만 수정할 수 있어요.');
    if (c.action === 'revise' && post!.revision !== c.expectedRevision) campusError(409, '최신 버전을 확인해 주세요.');
    post = { id: post?.id ?? c.requestId, owner_id: actor, enrollment_id: scope.enrollmentId, cohort_id: scope.cohortId, alias: c.alias!, kind: c.kind!, title: c.title!, body: c.body!, url: c.url!, image_urls: c.imageUrls!, lesson_id: c.lessonId ?? null, visibility: c.visibility!, revision: (post?.revision ?? 0) + 1, hidden: false, created_at: post?.created_at ?? now, updated_at: now };
    state.posts = [post, ...state.posts.filter(p => p.id !== post!.id)];
    state.revisions.unshift({ ...post, id: c.requestId, post_id: post.id, change_note: c.changeNote! });
  } else if (c.action === 'comment') {
    if (post!.visibility !== 'cohort' || post!.revision !== c.expectedRevision) campusError(409, '공유 범위와 최신 버전을 확인해 주세요.');
    if (state.comments.some(v => v.author_id === actor && v.post_id === post!.id && (v.body === c.body || Date.parse(v.created_at) > Date.now() - 10000))) campusError(409, '같은 의견을 반복 등록할 수 없어요.');
    state.comments.push({ id: c.requestId, post_id: post!.id, author_id: actor, alias: c.alias!, body: c.body!, post_revision: post!.revision, hidden: false, created_at: now });
  } else if (c.action === 'acknowledge') {
    const comment = state.comments.find(v => v.id === c.commentId && v.post_id === post!.id && !v.hidden);
    if (post!.owner_id !== actor || !comment || comment.author_id === actor) campusError(403, '피드백을 받은 사람만 확인할 수 있어요.');
    const prev = state.acknowledgments.find(v => v.comment_id === c.commentId);
    if ((prev?.revision ?? 0) !== c.expectedRevision) campusError(409, '확인 기록이 바뀌었습니다.');
    if (c.decision === 'apply' && (c.appliedRevision! <= comment.post_revision || !state.revisions.some(v => v.post_id === post!.id && v.revision === c.appliedRevision))) campusError(400, '의견을 받은 뒤 저장한 새 버전을 선택해 주세요.');
    state.acknowledgments = [{ comment_id: comment.id, owner_id: actor, useful: c.useful!, decision: c.decision!, reason: c.reason!, applied_revision: c.appliedRevision ?? null, revision: (prev?.revision ?? 0) + 1, updated_at: now }, ...state.acknowledgments.filter(v => v.comment_id !== c.commentId)];
  } else if (c.action === 'block') {
    if (c.targetId === actor) campusError(400, '자신은 차단할 수 없어요.');
    state.blockedIds = [...new Set([...state.blockedIds, c.targetId!])];
  } else if (c.action === 'unblock') state.blockedIds = state.blockedIds.filter(id => id !== c.targetId);
  else if (c.action === 'report') {
    if (state.reports.some(r => r.reporter_id === actor && r.post_id === post!.id && r.comment_id === (c.commentId ?? null) && r.status === 'open')) campusError(409, '이미 접수한 신고입니다.');
    state.reports.push({ id: c.requestId, reporter_id: actor, post_id: post!.id, comment_id: c.commentId ?? null, reason: c.reason!, status: 'open', created_at: now });
  } else if (c.action === 'launch') {
    if (!state.rewards.eligible) campusError(400, '발사 조건을 먼저 충족해 주세요.');
    if (!state.rewards.claimedAt) { state.rewards.claimedAt = now; state.rewards.cohortLaunches++; }
  } else campusError(403, '운영자 권한이 필요합니다.');
  const viewer = snapshot.viewer.id;
  const usefulOwners = new Set(state.acknowledgments.filter(a => a.useful).flatMap(a => {
    const co = state.comments.find(v => v.id === a.comment_id && !v.hidden && v.author_id === viewer);
    const po = state.posts.find(v => v.id === co?.post_id && v.owner_id !== viewer && v.visibility === 'cohort' && !v.hidden);
    return po && a.owner_id === po.owner_id ? [po.owner_id] : [];
  }));
  const appliedPosts = new Set(state.acknowledgments.filter(a => a.owner_id === viewer && a.decision === 'apply').flatMap(a => {
    const co = state.comments.find(v => v.id === a.comment_id && v.author_id !== viewer && !v.hidden);
    return co && a.applied_revision! > co.post_revision ? [co.post_id] : [];
  }));
  const missions = snapshot.lessons.flatMap(l => l.missions).filter(m => m.required);
  state.rewards = calculateCommunityRewards(missions.filter(m => m.status === 'approved').length, missions.length, usefulOwners.size, appliedPosts.size, state.rewards.claimedAt, state.rewards.cohortLaunches);
  receipts.set(c.requestId, signature);
  return state;
}
