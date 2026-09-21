import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionId } from '@/lib/conversion-review-server';
import { isTestRequest } from '@/lib/landing';
import { recruitmentJoinHtml, RECRUITMENT_JOIN_HEADERS } from '@/lib/recruitment-join';
type Context = { params: Promise<{id: string; channel: string}> };
const headers = RECRUITMENT_JOIN_HEADERS;
async function handle(request: Request, context: Context, write: boolean) {
  try {
    if (!conversionCapabilities(process.env).enabled) conversionError('현재 사용할 수 없는 모집 링크입니다.', 404);
    const {id, channel} = await context.params;
    conversionId(id);
    if (!['paid','organic'].includes(channel)) conversionError('모집 링크를 확인해 주세요.', 404);
    let event: string | null = null, version: number | null = null;
    if (write) {
      if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('모집 링크를 다시 열어 주세요.', 403);
      const raw = await request.text();
      if (raw.length > 500) conversionError('입력을 확인해 주세요.', 413);
      const form = new URLSearchParams(raw);
      event = conversionId(form.get('event'));
      version = Number(form.get('version'));
      if (!Number.isSafeInteger(version) || version < 1) conversionError('모집 링크를 다시 열어 주세요.');
    }
    const test = isTestRequest(request.headers.get('cookie'));
    const {data, error} = await createAdminClient().rpc('edu_recruitment_destination', { p_link: id, p_channel: channel, p_event: test ? null : event, p_version: version });
    if (error) conversionDatabaseError(error);
    if (!/^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/.test(data.url)) conversionError('방 주소를 확인하지 못했습니다.', 503);
    if (write) return new Response(null, { status: 303, headers: { ...headers, Location: data.url } });
    return new Response(recruitmentJoinHtml(data.label, data.version, randomUUID()), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (e) {
    const status = Number((e as {status?: number})?.status || 503);
    return new Response(status === 503 ? '일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '모집 링크가 변경되었거나 중지되었습니다. 안내받은 링크를 다시 열어 주세요.', {status, headers});
  }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);
