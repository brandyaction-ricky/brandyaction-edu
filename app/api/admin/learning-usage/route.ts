import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('members', user)) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams, member = params.get('member'), page = Number(params.get('page') || 1);
    if (!uuid(member) || !Number.isInteger(page) || page < 1 || page > 100000) return reply({ error: '회원과 조회 조건을 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc('edu_admin_learning_usage', { p_actor: user.id, p_member: member, p_page: page }).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    return reply(data);
  } catch { return reply({ error: '이용 기록을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
