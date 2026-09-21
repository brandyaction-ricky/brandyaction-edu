import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionCapabilities, conversionDatabaseError, conversionError, conversionId } from '@/lib/conversion-review-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const projection = 'flow_version,version,free_course_id,free_cohort_id,paid_course_id,paid_cohort_id,created_at';
async function operator() {
  if (!conversionCapabilities(process.env).enabled) conversionError('전환 관리 기능이 활성화되지 않았습니다.', 404);
  const user = await getOperatorUser('marketing');
  if (!user || !user.permissions.products) conversionError('모집 경로 관리에는 마케팅·상품 관리 권한이 필요합니다.', 403);
  return user;
}
function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({ error: error instanceof Error && status !== 503 ? error.message : '모집 경로를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
}
export async function GET() {
  try {
    await operator();
    const { data, error } = await createAdminClient().from('edu_recruitment_funnel_revisions').select(projection).order('version', { ascending: false }).limit(1).maybeSingle();
    if (error) conversionDatabaseError(error);
    return reply({ draft: data, measurement: 'unverified' });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) conversionError('요청 출처를 확인해 주세요.', 403);
    const user = await operator();
    const raw = await request.text();
    if (raw.length > 4000) conversionError('입력 내용이 너무 큽니다.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { conversionError('요청 형식을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) conversionError('요청 형식을 확인해 주세요.');
    if (!Number.isSafeInteger(body.expected_version) || Number(body.expected_version) < 0) conversionError('최신 버전을 다시 불러와 주세요.', 409);
    const args = { p_actor: user.id, p_request: conversionId(body.requestId), p_expected: Number(body.expected_version),
      p_free_course: conversionId(body.freeCourseId), p_free_cohort: body.freeCohortId == null || body.freeCohortId === '' ? null : conversionId(body.freeCohortId),
      p_paid_course: conversionId(body.paidCourseId), p_paid_cohort: conversionId(body.paidCohortId) };
    if (args.p_free_course === args.p_paid_course) conversionError('무료 교육과 유료 교육은 서로 다른 상품으로 연결해 주세요.');
    const { data, error } = await createAdminClient().rpc('edu_save_recruitment_funnel', args);
    if (error) conversionDatabaseError(error);
    // Actor and request identifiers are audit data, not part of the UI projection.
    const draft = Object.fromEntries(projection.split(',').map(key => [key, data[key]]));
    return reply({ draft, measurement: 'unverified' });
  } catch (error) { return failure(error); }
}
