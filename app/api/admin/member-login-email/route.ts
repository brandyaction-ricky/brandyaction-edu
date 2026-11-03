import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { adminEmailOrigin, completeAdminEmailChange, requestAdminEmailChange } from '@/lib/admin-login-email';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function admin() {
  const user = await getAuthenticatedUser();
  if (!user) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  if (user.role !== 'admin') throw Object.assign(new Error('관리자만 로그인 이메일을 변경할 수 있습니다.'), { status: 403 });
  return user;
}
function failure(error: unknown) {
  const status = (error as { status?: number })?.status || 503;
  return reply({ error: status < 500 && error instanceof Error ? error.message : '이메일 변경 정보를 확인하지 못했습니다. 다시 시도해 주세요.' }, status);
}
export async function GET(request: Request) {
  try {
    await admin();
    const member = new URL(request.url).searchParams.get('member');
    if (!uuid(member)) return reply({ error: '회원을 선택해 주세요.' }, 400);
    const db = createAdminClient();
    const result = await db.auth.admin.getUserById(member!);
    if (result.error || !result.data.user) return reply({ error: '회원의 로그인 정보를 확인하지 못했습니다.' }, 404);
    const history = await db.from('audit_logs').select('id,actor_user_id,before_data,after_data,created_at').eq('action', 'member.login_email_change').eq('entity_type', 'member').eq('entity_id', member!).order('created_at', { ascending: false }).limit(10);
    if (history.error) throw history.error;
    for (const record of history.data || []) {
      if (['requesting', 'waiting'].includes(record.after_data?.status) && !result.data.user.new_email && record.after_data?.new_email?.toLowerCase() === result.data.user.email?.toLowerCase()) {
        if (await completeAdminEmailChange(db, String(record.id), result.data.user)) record.after_data = { ...record.after_data, status: 'completed' };
      }
    }
    return reply({ currentEmail: result.data.user.email || '', pendingEmail: result.data.user.new_email || '', history: history.data || [] });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await admin();
    const origin = adminEmailOrigin(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: '변경할 이메일과 사유를 입력해 주세요.' }, 400);
    if (!uuid(body.member)) return reply({ error: '회원을 선택해 주세요.' }, 400);
    return reply(await requestAdminEmailChange(createAdminClient(), actor.id, body.member, body, origin));
  } catch (error) { return failure(error); }
}
