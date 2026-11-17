import { isCampusId } from '../snapshot';
import { validateCommunityCommand, type CommunityCommand } from './domain';
import { readLimitedUtf8Body } from './request-body';
type Viewer = { id: string };
type Dependencies = { enabled: boolean; unauthorizedStatus?: 401 | 403; authenticate: () => Promise<Viewer | null>; load: (viewer: Viewer, enrollmentId: string, page: number, view: string, postId?:string) => Promise<unknown>; save: (viewer: Viewer, command: CommunityCommand) => Promise<unknown> };
const reply = (value: unknown, status: number) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function handleCommunity(request: Request, deps: Dependencies) {
  if (!deps.enabled) return reply({ error: '준비 중인 기능입니다.' }, 404);
  const url = new URL(request.url), origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site' || (request.method === 'POST' && origin !== url.origin)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: '지원하지 않는 요청입니다.' }, 405);
  try {
    const viewer = await deps.authenticate();
    if (!viewer) return reply({ error: deps.unauthorizedStatus === 403 ? '커뮤니티 운영 권한이 필요합니다.' : '로그인해 주세요.' }, deps.unauthorizedStatus ?? 401);
    if (request.method === 'GET') {
      const enrollmentId = url.searchParams.get('enrollmentId');
      const page = Number(url.searchParams.get('page') ?? 0), view = url.searchParams.get('view') ?? 'all';
      if (!Number.isSafeInteger(page) || page < 0 || page > 10000 || !['all', 'mine', 'feedback', 'talent', 'demo_day'].includes(view)) return reply({ error: '조회 범위를 확인해 주세요.' }, 400);
      if (!enrollmentId || !isCampusId(enrollmentId)) return reply({ error: '이용할 기수를 선택해 주세요.' }, 400);
      const postId=url.searchParams.get('postId');if(postId&&!isCampusId(postId))return reply({error:'작업물을 확인해 주세요.'},400);
      return reply(await deps.load(viewer, enrollmentId, page, view,postId??undefined), 200);
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json') || Number(request.headers.get('content-length')) > 24000) return reply({ error: '요청 형식을 확인해 주세요.' }, 400);
    const raw = await readLimitedUtf8Body(request, 24000);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return reply({ error: '요청 형식을 확인해 주세요.' }, 400); }
    const command = validateCommunityCommand(input);
    return reply(await deps.save(viewer, command), 200);
  } catch (e) {
    const status = e instanceof Error && 'status' in e && [400, 403, 404, 409].includes(Number(e.status)) ? Number(e.status) : 503;
    return reply({ error: ({ 400: '입력 내용과 반영 버전을 확인해 주세요.', 403: '현재 기수의 이용 권한이나 공개 범위를 확인해 주세요.', 404: '기록을 찾을 수 없습니다.', 409: '다른 창에서 바뀌었거나 같은 요청이 있습니다. 새로고침 후 확인해 주세요.', 503: '기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' } as Record<number, string>)[status] }, status);
  }
}
