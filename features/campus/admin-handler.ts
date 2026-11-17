import { isCampusId } from './snapshot';
import type { CampusAdminSnapshot } from './admin-metrics';
import type { CampusAdminOptions } from './admin-repository';
type Dependencies = {
  enabled: boolean;
  authorize: () => Promise<{ id: string } | null>;
  load: (cohortId: string | null) => Promise<CampusAdminSnapshot | CampusAdminOptions>;
};
const reply = (value: unknown, status: number) => Response.json(value, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function handleCampusAdminGet(request: Request, deps: Dependencies) {
  if (!deps.enabled) return reply({ error: '준비 중인 기능입니다.' }, 404);
  const url = new URL(request.url), origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  const cohortId = url.searchParams.get('cohortId');
  if (cohortId !== null && !isCampusId(cohortId)) return reply({ error: '조회할 기수를 선택해 주세요.' }, 400);
  try {
    const operator = await deps.authorize();
    if (!operator) return reply({ error: '수강생 관리 권한이 필요합니다.' }, 403);
    return reply(await deps.load(cohortId), 200);
  } catch (error) {
    const notFound = error instanceof Error && 'status' in error && error.status === 404;
    return reply({ error: notFound ? '조회 가능한 기수를 찾을 수 없습니다.' : '운영 집계를 확인하지 못했습니다. 다시 시도해 주세요.' }, notFound ? 404 : 503);
  }
}
