import { campusError, isCampusId } from '../snapshot';
export type ExhibitionItem = { id: string; title: string; alias: string; revision: number; updatedAt: string };
export type ExhibitionCandidate = { id: string; cohort_id: string; kind: string; visibility: string; hidden: boolean; title: string; alias: string; revision: number; updated_at: string };
export type ExhibitionPorts = {
  scope: (viewerId: string, enrollmentId: string) => Promise<string>;
  authorizedPosts: (cohortId: string, ids?: string[]) => Promise<ExhibitionCandidate[]>;
  reportedPostIds: (ids: string[]) => Promise<string[]>;
};
export async function loadCommunityExhibition(ports: ExhibitionPorts, viewerId: string, enrollmentId: string): Promise<{ items: ExhibitionItem[] }> {
  const cohortId = await ports.scope(viewerId, enrollmentId);
  const eligible = (rows: ExhibitionCandidate[]) => rows.filter(p => p.cohort_id === cohortId && p.kind === 'portfolio' && p.visibility === 'cohort' && p.hidden === false);
  const candidates = eligible(await ports.authorizedPosts(cohortId));
  if (candidates.length > 24) campusError(503, '전시 범위를 확인하지 못했습니다.');
  if (!candidates.length) return { items: [] };
  // Report reasons/identities never leave the server. The privileged read is bounded
  // to IDs already visible to this authenticated viewer under ordinary post RLS.
  const held = new Set(await ports.reportedPostIds(candidates.map(p => p.id)));
  const ids = candidates.filter(p => !held.has(p.id)).map(p => p.id);
  if (!ids.length) return { items: [] };
  const selected = new Set(ids);
  // Re-read current sharing/RLS after moderation filtering: a stale candidate is
  // not permission to expose a private, hidden or newly blocked post.
  const current = eligible(await ports.authorizedPosts(cohortId, ids)).filter(p => selected.has(p.id));
  const newlyHeld = new Set(await ports.reportedPostIds(current.map(p => p.id)));
  return { items: current.filter(p => !newlyHeld.has(p.id)).slice(0, 6).map(p => ({ id: p.id, title: p.title, alias: p.alias, revision: p.revision, updatedAt: p.updated_at })) };
}
export async function handleCommunityExhibition(req: Request, deps: {
  enabled: boolean; authenticate: () => Promise<{ id: string } | null>;
  load: (viewerId: string, enrollmentId: string) => Promise<{ items: ExhibitionItem[] }>;
}) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  if (!deps.enabled) return reply({ error: '준비 중입니다.' }, 404);
  if (req.method !== 'GET') return reply({ error: '지원하지 않는 요청입니다.' }, 405);
  const url = new URL(req.url), origin = req.headers.get('origin');
  if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  try {
    const viewer = await deps.authenticate(); if (!viewer) return reply({ error: '로그인해 주세요.' }, 401);
    const enrollmentId = url.searchParams.get('enrollmentId'); if (!enrollmentId || !isCampusId(enrollmentId)) return reply({ error: '기수를 선택해 주세요.' }, 400);
    return reply(await deps.load(viewer.id, enrollmentId));
  } catch (error) {
    const status = error instanceof Error && 'status' in error && Number(error.status) === 403 ? 403 : 503;
    return reply({ error: status === 403 ? '현재 기수의 이용 권한을 확인해 주세요.' : '전시 목록을 불러오지 못했습니다.' }, status);
  }
}
