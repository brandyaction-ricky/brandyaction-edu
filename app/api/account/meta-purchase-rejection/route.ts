import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '이 사이트에서 다시 시도해 주세요.' }, 403);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ account: 'anonymous' });
    const { error } = await createAdminClient().rpc('edu_reject_meta_purchase', { p_member: user.id, p_request: crypto.randomUUID() });
    if (error) throw new Error('unavailable');
    return reply({ account: 'withdrawn' });
  } catch { return reply({ error: '계정의 구매 정보 전송 중단을 저장하지 못했어요. 다시 시도해 주세요.' }, 503); }
}
