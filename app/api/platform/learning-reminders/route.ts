import { learningReminderAction, type LearningReminderAction } from '@/lib/learning-reminders';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
});
const invalid = () => reply({ error: '알림 종류와 확인 기간을 다시 확인해 주세요.' }, 400);
const forbidden = () => reply({ error: '현재 수강 중인 과정과 알림 신청 조건을 확인해 주세요.' }, 403);

async function handle(request: Request, write: boolean) {
  if (write && request.headers.get('origin') !== new URL(request.url).origin) return forbidden();
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'student') return forbidden();

    let action: LearningReminderAction | null = null;
    if (write) {
      const reader = request.body?.getReader();
      if (!reader) return invalid();
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 1024) {
            void reader.cancel().catch(() => {});
            return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
          }
          parts.push(part.value);
        }
        action = learningReminderAction(JSON.parse(Buffer.concat(parts).toString('utf8')));
      } catch {
        return invalid();
      } finally {
        reader.releaseLock();
      }
      if (!action) return invalid();
    }

    const result = await createAdminClient().rpc('edu_learning_reminders', {
      p_user: user.id,
      p_action: action?.action ?? 'list',
      ...(action && { p_request: action.requestId }),
      ...(action?.action === 'request' && { p_enrollment: action.enrollmentId, p_kind: action.kind, p_days: action.days }),
    }).abortSignal(AbortSignal.timeout(10_000));
    if (result.error?.code === '42501') return forbidden();
    if (result.error?.code === '22023') return invalid();
    if (result.error || !result.data) throw new Error('알림 신청 확인 실패');
    return reply(result.data);
  } catch {
    return reply({ error: '학습 알림 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
