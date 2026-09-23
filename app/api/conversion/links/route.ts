import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionDatabaseError, conversionError } from '@/lib/conversion-review-server';
import { recruitmentPeriod } from '@/lib/recruitment-rooms';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handle(request: Request, write: boolean) {
  try {
    if (!conversionCapabilities(process.env).enabled) conversionError('기능이 활성화되지 않았습니다.', 404);
    if (write && request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    const actor = await getOperatorUser('marketing');
    if (!actor?.permissions.products) conversionError('마케팅·상품 권한이 필요합니다.', 403);
    let body;
    if (write) {
      const raw = await request.text();
      if (raw.length > 1000) conversionError('입력 내용이 너무 큽니다.', 413);
      try { body = JSON.parse(raw); } catch { conversionError('입력을 확인해 주세요.'); }
      if (!body || typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.version) || body.version < 1 || !Number.isSafeInteger(body.expected) || body.expected < 0) conversionError('최신 설정을 불러와 주세요.');
    }
    let period: string;
    try { period = recruitmentPeriod(write ? body.period : new URL(request.url).searchParams.get('period')); } catch { conversionError('모집 구분을 확인해 주세요.'); }
    const { data, error } = await createAdminClient().rpc('edu_manage_recruitment_links', { p_actor: actor.id, p_period: period, p_version: write ? body.version : null, p_expected: write ? body.expected : null, p_enabled: write ? body.enabled : null });
    if (error) conversionDatabaseError(error);
    return reply(data);
  } catch (e) {
    const status = Number((e as {status?: number})?.status || 503);
    return reply({ error: status === 503 ? '모집 링크를 확인하지 못했습니다.' : (e as Error).message }, status);
  }
}
export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
