import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
async function actor() { const user = await getAuthenticatedUser(); if (!user) return null; return await getOperatorUser('members', user); }
export async function GET(request: Request) {
  try {
    const user = await actor(); if (!user) return reply({ error: '회원 관리 권한으로 로그인해 주세요.' }, 403);
    const cohort = new URL(request.url).searchParams.get('cohort') || null;
    if (cohort && !uuid(cohort)) return reply({ error: '기수를 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc('edu_admin_learning_care', { p_actor: user.id, p_cohort: cohort }).abortSignal(AbortSignal.timeout(20000));
    if (error) throw error; return reply(data);
  } catch { return reply({ error: '현황을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    const user = await actor(); if (!user) return reply({ error: '회원 관리 권한이 필요합니다.' }, 403);
    if (process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED !== 'true') return reply({ error: '메시지 기능을 준비 중입니다.' }, 404);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: '안내 내용을 확인해 주세요.' }, 400);
    let text = '', size = 0; const decoder = new TextDecoder();
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 40000) { await reader.cancel(); return reply({ error: '안내 내용이 너무 깁니다.' }, 413); } text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
    let body; try { body = JSON.parse(text); } catch { return reply({ error: '안내 내용을 확인해 주세요.' }, 400); }
    if (!body || !uuid(body.requestId) || !uuid(body.cohortId) || !uuid(body.lessonId) || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 5000 || !Array.isArray(body.recipients) || !body.recipients.length || body.recipients.length > 100 || !body.recipients.every(uuid)) return reply({ error: '안내 내용과 받는 사람을 확인해 주세요.' }, 400);
    const { data, error } = await createAdminClient().rpc('edu_send_learning_care', { p_actor: user.id, p_request: body.requestId, p_cohort: body.cohortId, p_lesson: body.lessonId, p_recipients: [...new Set(body.recipients)].sort(), p_content: body.content.trim() }).abortSignal(AbortSignal.timeout(20000));
    if (error) {
      if (error.message === 'CARE_RECIPIENT_CHANGED') return reply({ error: '완료·검토 대기·최근 안내 등 대상 상태가 바뀌었습니다. 발송하지 않았습니다. 현황을 새로고침한 뒤 다시 선택해 주세요.' }, 409);
      if (error.message === 'MESSAGE_REQUEST_REUSED') return reply({ error: '이 안내는 이미 처리되었습니다. 보낸 메시지를 확인해 주세요.' }, 409);
      if (error.message === 'MESSAGE_RATE_LIMIT') return reply({ error: '잠시 후 발송 결과를 다시 확인해 주세요.' }, 429);
      throw error;
    }
    return reply(data);
  } catch { return reply({ error: '발송 결과를 확인하지 못했습니다. ‘발송 결과 다시 확인’을 눌러 주세요.' }, 503); }
}
