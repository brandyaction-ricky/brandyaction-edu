import { isCampusId } from '../snapshot';
import { validateOfficeCommand, type OfficeCommand } from './domain';
import { readLimitedUtf8Body } from '../community/request-body';
export async function handleOffice(request: Request, deps: { enabled: boolean; authenticate: () => Promise<{ id: string } | null>; load: (viewer: { id: string }, enrollmentId: string) => Promise<unknown>; save: (command: OfficeCommand) => Promise<unknown> }) {
  const reply = (value: unknown, status: number) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  if (!deps.enabled) return reply({ error: '준비 중인 기능입니다.' }, 404);
  const url = new URL(request.url), origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site' || (request.method === 'POST' && origin !== url.origin)) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: '허용되지 않은 요청입니다.' }, 405);
  try {
    const viewer = await deps.authenticate(); if (!viewer) return reply({ error: '로그인해 주세요.' }, 401);
    if (request.method === 'GET') { const enrollmentId = url.searchParams.get('enrollmentId'); if (!isCampusId(enrollmentId ?? '')) return reply({ error: '기수를 선택해 주세요.' }, 400); return reply(await deps.load(viewer, enrollmentId!), 200); }
    if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 24000) return reply({ error: '요청 형식을 확인해 주세요.' }, 400);
    const raw = await readLimitedUtf8Body(request, 24000);
    let input: unknown; try { input = JSON.parse(raw); } catch { return reply({ error: '요청 형식을 확인해 주세요.' }, 400); }
    return reply(await deps.save(validateOfficeCommand(input)), 200);
  } catch (e) {
    const status = e instanceof Error && 'status' in e && [400, 403, 409].includes(Number(e.status)) ? Number(e.status) : 503;
    return reply({ error: ({ 400: '입력 내용과 자료 주소를 확인해 주세요.', 403: '현재 이용할 수 있는 내 작업만 선택해 주세요.', 409: '작업 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.', 503: '작업 기록을 확인하지 못했습니다. 다시 시도해 주세요.' } as Record<number, string>)[status] }, status);
  }
}
