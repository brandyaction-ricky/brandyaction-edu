import { isCampusId } from './snapshot';
import type { CampusSnapshot } from './contracts';

type Viewer = { id: string; full_name?: string | null };
type Dependencies = {
  enabled: boolean;
  authenticate: () => Promise<Viewer | null>;
  load: (viewer: Viewer, enrollmentId: string | null) => Promise<CampusSnapshot>;
};
const reply = (value: unknown, status: number) => Response.json(value, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });

export async function handleCampusGet(request: Request, deps: Dependencies) {
  if (!deps.enabled) return reply({ error: '준비 중인 기능입니다.' }, 404);
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const enrollmentId = url.searchParams.get('enrollmentId');
  if (enrollmentId !== null && !isCampusId(enrollmentId)) return reply({ error: '수강권을 확인해 주세요.' }, 400);
  try {
    const viewer = await deps.authenticate();
    if (!viewer) return reply({ error: '로그인이 필요합니다.' }, 401);
    return reply(await deps.load(viewer, enrollmentId), 200);
  } catch (error) {
    const denied = error instanceof Error && 'status' in error && error.status === 403;
    return reply({ error: denied ? '현재 이용 가능한 수강권을 선택해 주세요.' : '학습 정보를 확인하지 못했습니다. 다시 시도해 주세요.' }, denied ? 403 : 503);
  }
}
