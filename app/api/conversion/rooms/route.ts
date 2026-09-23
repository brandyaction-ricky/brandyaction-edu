import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionId } from '@/lib/conversion-review-server';
import { recruitmentPeriod, recruitmentRooms } from '@/lib/recruitment-rooms';
const projection = 'period_id,version,settings,created_at';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function operator() {
  if (!conversionCapabilities(process.env).enabled) conversionError('전환 관리 기능이 활성화되지 않았습니다.', 404);
  const user = await getOperatorUser('marketing');
  if (!user?.permissions.products) conversionError('마케팅·상품 관리 권한이 필요합니다.', 403);
  return user;
}
function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({ error: error instanceof Error && status !== 503 ? error.message : '방 설정을 확인하지 못했습니다. 다시 시도해 주세요.' }, status);
}
export async function GET(request: Request) {
  try {
    await operator();
    let period: string;
    try { period = recruitmentPeriod(new URL(request.url).searchParams.get('period')); } catch (e) { conversionError((e as Error).message); }
    const { data, error } = await createAdminClient().from('edu_recruitment_room_revisions').select(projection).eq('period_id', period).order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) conversionDatabaseError(error);
    return reply({ draft: data });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    const user = await operator();
    const raw = await request.text();
    if (raw.length > 2000) conversionError('입력 내용이 너무 큽니다.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { conversionError('요청 형식을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) conversionError('요청 형식을 확인해 주세요.');
    let period: string, settings: ReturnType<typeof recruitmentRooms>;
    try { period = recruitmentPeriod(body.period); settings = recruitmentRooms(body.settings); } catch (e) { conversionError((e as Error).message); }
    if (!Number.isSafeInteger(body.expected_version) || Number(body.expected_version) < 0) conversionError('저장된 설정을 다시 불러와 주세요.', 409);
    const { data, error } = await createAdminClient().rpc('edu_save_recruitment_rooms', { p_actor: user.id, p_request: conversionId(body.requestId), p_period: period, p_expected: body.expected_version, p_settings: settings });
    if (error) conversionDatabaseError(error);
    return reply({ draft: Object.fromEntries(projection.split(',').map(key => [key, data[key]])) });
  } catch (e) { return failure(e); }
}
