import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') return reply({ error: '사용하지 않는 기능입니다.' }, 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  // No client-supplied member, time, URL, IP, or device information is accepted.
  if (request.body !== null) { await request.body.cancel(); return reply({ error: '요청 본문을 사용할 수 없습니다.' }, 400); }
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'student') return reply({ error: '수강생 방문만 기록합니다.' }, 403);
    const { error } = await createAdminClient().rpc('edu_record_member_visit', { p_member: user.id }).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    return reply({ ok: true });
  } catch { return reply({ error: '방문 기록을 저장하지 못했습니다.' }, 503); }
}
