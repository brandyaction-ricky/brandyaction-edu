import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function emptyBody(request: Request) {
  if (!request.body) return true;
  // The deployed Node adapter can supply a stream even for a bodyless POST.
  // Inspect bytes instead of stream presence; stop at the first supplied byte.
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return true;
          if (value.byteLength) return false;
        }
      })(),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 5_000); }),
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  // No client-supplied member, time, URL, IP, or device information is accepted.
  if (!await emptyBody(request)) return reply({ error: '요청 본문을 사용할 수 없습니다.' }, 400);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'student') return reply({ error: '수강생 방문만 기록합니다.' }, 403);
    const { error } = await createAdminClient().rpc('edu_record_member_visit', { p_member: user.id }).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
    return reply({ ok: true });
  } catch { return reply({ error: '방문 기록을 저장하지 못했습니다.' }, 503); }
}
