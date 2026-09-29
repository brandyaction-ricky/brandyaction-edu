import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { koreanDay, visitDay } from '@/lib/member-visits';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') return reply({ error: '사용하지 않는 기능입니다.' }, 404);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('members', user)) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams, member = params.get('member'), page = Number(params.get('page') || 1);
    const day = member ? null : params.get('day') || koreanDay();
    if ((member !== null && !uuid(member)) || (!member && !visitDay(day)) || (member && params.has('day')) || !Number.isSafeInteger(page) || page < 1 || page > 100000)
      return reply({ error: '회원·날짜·페이지를 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc('edu_admin_member_visits', { p_actor: user.id, p_member: member, p_day: day, p_page: page }).abortSignal(AbortSignal.timeout(10_000));
    if (error?.message === 'VISIT_NOT_FOUND') return reply({ error: '조회할 회원이 없거나 탈퇴한 회원입니다.' }, 404);
    if (error) throw error;
    return reply(data);
  } catch { return reply({ error: '방문 기록을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
