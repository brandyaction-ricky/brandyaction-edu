import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { parseConversationCursor } from '@/lib/member-conversations';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED !== 'true' || process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED !== 'true') return reply({ error: '대화 기록 기능을 준비 중입니다.' }, 404);
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('members', user)) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    const params = new URL(request.url).searchParams, member = params.get('member');
    if (!uuid(member)) return reply({ error: '회원을 확인해 주세요.' }, 400);
    let before; try { before = parseConversationCursor(params.get('before')); } catch { return reply({ error: '기록 조회 위치를 확인해 주세요.' }, 400); }
    const result = await createAdminClient().rpc('edu_member_conversation', { p_actor: user.id, p_member: member, p_before: before }).abortSignal(AbortSignal.timeout(10_000));
    if (result.error?.message === 'CONVERSATION_NOT_FOUND') return reply({ error: '조회할 회원이 없거나 탈퇴한 회원입니다.' }, 404);
    if (result.error) throw result.error;
    return reply(result.data);
  } catch { return reply({ error: '대화 기록을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
