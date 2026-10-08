import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET() {
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const { data, error } = await createAdminClient().rpc('edu_member_learning_care', { p_actor: user.id }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error; return reply(data);
  } catch { return reply({ error: '다음 학습을 확인하지 못했습니다. 다시 불러와 주세요.' }, 503); }
}
