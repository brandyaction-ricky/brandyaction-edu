import type { createClient } from '@/lib/supabase/server';
import { campusError } from '../snapshot';
import { loadCampusSnapshot } from '../repository';
import { validateCommunityCommand, type CommunityState, type CommunityCommand, type CommunityRewards } from './domain';
type Database = Awaited<ReturnType<typeof createClient>>;
const columns = {
  posts: 'id,owner_id,enrollment_id,cohort_id,alias,kind,title,body,url,image_urls,lesson_id,visibility,revision,hidden,created_at,updated_at',
  revisions: 'id,post_id,revision,title,body,url,image_urls,visibility,change_note,created_at',
  comments: 'id,post_id,author_id,alias,body,post_revision,hidden,created_at',
  acknowledgments: 'comment_id,owner_id,useful,decision,reason,applied_revision,revision,updated_at',
  reports: 'id,reporter_id,post_id,comment_id,reason,status,created_at',
};
type QueryResult = { data: unknown; error: unknown; count?: number | null };
async function all<T>(query: PromiseLike<QueryResult>): Promise<T[]> {
  const r = await query;
  if (r.error || !Array.isArray(r.data) || (r.count != null && r.count !== r.data.length)) campusError(503, '목록 전체를 확인하지 못했습니다. 범위를 줄여 다시 시도해 주세요.');
  return r.data as T[];
}
export async function loadCommunityState(db: Database, viewer: { id: string }, enrollmentId: string, operator = false, page = 0, view = 'all',postId?:string): Promise<CommunityState> {
  const campus = await loadCampusSnapshot(db, viewer, enrollmentId);
  const scope = campus.scopes.find(s => s.enrollmentId === enrollmentId);
  if (!scope) campusError(403, '이용 가능한 기수를 선택해 주세요.');
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) campusError(400, '조회 범위를 확인해 주세요.');
  let postQuery = db.from('edu_campus_posts').select(columns.posts, { count: 'exact' }).eq('cohort_id', scope.cohortId).eq('hidden', false);
  if(postId)postQuery=postQuery.eq('id',postId);
  if (view === 'mine') postQuery = postQuery.eq('owner_id', viewer.id);
  else {
    postQuery = postQuery.eq('visibility', 'cohort');
    if (view === 'feedback' || view === 'demo_day') postQuery = postQuery.eq('kind', view);
    if (view === 'talent') postQuery = postQuery.in('kind', ['talent_offer', 'talent_request']);
  }
  const [postsResult, rewardsResult, blocks] = await Promise.all([
    postQuery.order('updated_at', { ascending: false }).order('id', { ascending: false }).range(page * 30, page * 30 + 29),
    db.rpc('edu_campus_community_rewards', { p_enrollment: enrollmentId }),
    all<{ target_id: string }>(db.from('edu_campus_blocks').select('target_id', { count: 'exact' }).eq('cohort_id', scope.cohortId).eq('owner_id', viewer.id).limit(500)),
  ]);
  if (rewardsResult.error || !rewardsResult.data || typeof rewardsResult.data !== 'object') campusError(503, '성장 기록을 확인하지 못했습니다.');
  if (postsResult.error || !Array.isArray(postsResult.data) || postsResult.count == null) campusError(503, '작업물을 확인하지 못했습니다.');
  const posts = postsResult.data as unknown as CommunityState['posts'];
  const ids = posts.map(p => p.id);
  const [revisions, comments, reports] = ids.length ? await Promise.all([
    all<CommunityState['revisions'][number]>(db.from('edu_campus_post_revisions').select(columns.revisions, { count: 'exact' }).in('post_id', ids).order('revision', { ascending: false }).limit(3000)),
    all<CommunityState['comments'][number]>(db.from('edu_campus_comments').select(columns.comments, { count: 'exact' }).in('post_id', ids).order('created_at').limit(3000)),
    all<CommunityState['reports'][number]>(db.from('edu_campus_reports').select(columns.reports, { count: 'exact' }).in('post_id', ids).order('created_at', { ascending: false }).limit(1000)),
  ]) : [[], [], []];
  const acknowledgments = comments.length ? await all<CommunityState['acknowledgments'][number]>(db.from('edu_campus_feedback_acknowledgments').select(columns.acknowledgments, { count: 'exact' }).in('comment_id', comments.map(c => c.id)).limit(3000)) : [];
  return { posts, revisions, comments, acknowledgments, reports, blockedIds: blocks.map(b => b.target_id), rewards: rewardsResult.data as CommunityRewards, operator, demo: false, pageInfo: { page, hasNext: (page + 1) * 30 < postsResult.count } };
}
export async function saveCommunityCommand(db: Database, command: unknown) {
  const normalized = validateCommunityCommand(command);
  const result = await db.rpc('edu_campus_community_mutate', { p_command: normalized });
  if (result.error) {
    const code = result.error.code;
    campusError(code === '42501' ? 403 : ['40001', '23505'].includes(code) ? 409 : ['23514', '22P02', '23502'].includes(code) ? 400 : 503, '요청을 처리하지 못했습니다.');
  }
  if (!result.data) campusError(503, '저장 결과를 확인하지 못했습니다.');
  return result.data as { postId?: string; revision?: number; commentId?: string; launched?: boolean };
}
export type CommunityModerationState = Pick<CommunityState, 'posts' | 'comments' | 'reports'> & {viewerId?:string};
export async function loadCommunityModeration(db: Database, cohortId: string): Promise<CommunityModerationState> {
  const posts = await all<CommunityState['posts'][number]>(db.from('edu_campus_posts').select(columns.posts, { count: 'exact' }).eq('cohort_id', cohortId).order('updated_at', { ascending: false }).limit(500));
  if (!posts.length) return { posts: [], comments: [], reports: [] };
  const [comments, reports] = await Promise.all([
    all<CommunityState['comments'][number]>(db.from('edu_campus_comments').select(columns.comments, { count: 'exact' }).in('post_id', posts.map(p => p.id)).limit(3000)),
    all<CommunityState['reports'][number]>(db.from('edu_campus_reports').select(columns.reports, { count: 'exact' }).in('post_id', posts.map(p => p.id)).order('created_at', { ascending: false }).limit(1000)),
  ]);
  return { posts, comments, reports };
}
export type { CommunityCommand };
