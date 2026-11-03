import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { analyticsExclusionFailure, analyticsExclusionInput } from '@/lib/analytics-exclusions';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function admin() {
  const user = await getAuthenticatedUser();
  if (!user) throw Object.assign(Error('로그인이 필요합니다.'), { status: 401 });
  if (user.role !== 'admin') throw Object.assign(Error('관리자만 집계 제외 표시를 변경할 수 있습니다.'), { status: 403 });
  return user;
}
function failure(error: unknown) {
  const value = analyticsExclusionFailure(error);
  return reply({ error: value.message }, value.status);
}
export async function GET(request: Request) {
  try {
    await admin();
    const params = new URL(request.url).searchParams;
    const kind = params.get('kind'), id = params.get('id');
    if (!['member', 'order'].includes(kind || '') || !uuid(id)) return reply({ error: '대상을 선택해 주세요.' }, 400);
    const db = createAdminClient();
    const result = await db.from(kind === 'member' ? 'profiles' : 'orders')
      .select(kind === 'member' ? 'is_internal,role,status' : 'is_test_order').eq('id', id!).maybeSingle();
    if (result.error) throw result.error;
    const row = result.data as unknown as Record<string, unknown> | null;
    if (!row || row.status === 'withdrawn') return reply({ error: '대상을 찾지 못했습니다.' }, 404);
    const excluded = kind === 'member' ? row.is_internal : row.is_test_order;
    if (typeof excluded !== 'boolean') throw Error('Invalid analytics flag');
    return reply({ excluded, forced: kind === 'member' && ['admin', 'staff'].includes(String(row.role)) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await admin();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ error: '현재 관리자 화면에서 다시 시도해 주세요.' }, 403);
    const input = analyticsExclusionInput(await request.json().catch(() => null));
    const result = await createAdminClient().rpc('edu_set_analytics_exclusion', {
      p_actor: actor.id, p_kind: input.kind, p_id: input.id, p_excluded: input.excluded, p_expected: input.expected, p_reason: input.reason,
    });
    if (result.error) throw result.error;
    return reply(result.data);
  } catch (error) { return failure(error); }
}
