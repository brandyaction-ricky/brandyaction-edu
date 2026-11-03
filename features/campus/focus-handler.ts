import {readCampusJson} from './request-json';
import { isCampusId } from './snapshot';
import type { FocusRequest, FocusState } from './focus-repository';
type Viewer = { id: string };
type Dependencies = {
  enabled: boolean;
  authenticate: () => Promise<Viewer | null>;
  load: (viewer: Viewer, enrollmentId: string) => Promise<FocusState>;
  save: (viewer: Viewer, command: FocusRequest) => Promise<FocusState>;
};
const reply = (value: unknown, status: number) => Response.json(value, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function handleCampusFocus(request: Request, deps: Dependencies) {
  if (!deps.enabled) return reply({ error: '준비 중인 기능입니다.' }, 404);
  const url = new URL(request.url), origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site'
    || (request.method === 'POST' && origin !== url.origin)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: '허용되지 않은 요청입니다.' }, 405);
  try {
    const viewer = await deps.authenticate();
    if (!viewer) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (request.method === 'GET') {
      const enrollmentId = url.searchParams.get('enrollmentId');
      if (!enrollmentId || !isCampusId(enrollmentId)) return reply({ error: '수강권을 확인해 주세요.' }, 400);
      return reply(await deps.load(viewer, enrollmentId), 200);
    }
    const command=await readCampusJson(request,12000);
    if (!command || typeof command !== 'object' || Array.isArray(command) || !('kind' in command)
      || !['start', 'pause', 'resume', 'finish'].includes(String(command.kind))) return reply({ error: '실행 요청을 확인해 주세요.' }, 400);
    return reply(await deps.save(viewer, command as FocusRequest), 200);
  } catch (error) {
    const status = error instanceof Error && 'status' in error && [400, 403, 404, 409].includes(Number(error.status)) ? Number(error.status) : 503;
    const messages: Record<number, string> = { 400: '입력 내용과 실행 요청을 확인해 주세요.', 403: '현재 이용 가능한 수강권과 수업을 선택해 주세요.',
      404: '실행 기록을 찾을 수 없습니다.', 409: '기록이나 수업이 바뀌었습니다. 최신 기록을 다시 확인해 주세요.', 503: '실행 기록을 확인하지 못했습니다. 다시 시도해 주세요.' };
    return reply({ error: messages[status] }, status);
  }
}
