import { resolveDiagnosisAudience } from '@/lib/diagnosis-audience';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { DiagnosisBridgeError, sendDiagnosisCommand } from '@/lib/diagnosis-bridge';
import { runDiagnosisSession } from '@/lib/diagnosis-session-service';

const reply = (data: unknown, status = 200) => Response.json(data, { status,
  headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' } });
async function handle(request: Request, write: boolean) {
  if (process.env.EDU_MYIN_DIAGNOSIS_ENABLED !== 'true' || process.env.EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED !== 'true')
    return reply({ error: '검사 기능을 준비하고 있습니다.' }, 404);
  try {
    if (write && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const actor = await getAuthenticatedUser();
    if (!actor) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await resolveDiagnosisAudience(actor, async (name, args) => await createAdminClient().rpc(name, args))) return reply({ error: '현재 계정에는 진단이 공개되지 않았습니다.' }, 403);
    let input: unknown = { action: new URL(request.url).searchParams.get('view') === 'catalog' ? 'catalog' : 'read' };
    if (write) {
      const reader = request.body?.getReader(); if (!reader) return reply({ error: '입력 내용을 확인해 주세요.' }, 400);
      const parts: Uint8Array[] = []; let size = 0;
      try { for (;;) { const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 262144) { await reader.cancel(); return reply({ error: '입력 내용이 너무 깁니다.' }, 413); } parts.push(value); } }
      finally { reader.releaseLock(); }
      try { input = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return reply({ error: '입력 내용을 확인해 주세요.' }, 400); }
    }
    const db = createAdminClient();
    return reply(await runDiagnosisSession({ actor, rpc: async (name, args) => await db.rpc(name, args), send: sendDiagnosisCommand }, input));
  } catch (error) {
    const code = error instanceof DiagnosisBridgeError ? error.code : 'UNAVAILABLE';
    const messages: Record<string,string> = {
      INVALID: '입력 내용을 확인해 주세요.', INVALID_ANSWERS: '선택한 답변을 확인해 주세요.',
      INCOMPLETE: '빠진 문항과 안내 확인 문항을 확인해 주세요. 원하는 모습은 5개를 선택해 주세요.',
      CONFLICT: '다른 화면에서 답변이 변경되었습니다. 최신 답변을 불러와 주세요.',
      FORBIDDEN: '검사를 이용할 수 있는 구매·수강 정보를 확인해 주세요.',
      STARTS_PAUSED: '검사 업데이트 중입니다. 잠시 후 새 검사를 시작해 주세요. 진행 중인 검사는 계속할 수 있습니다.',
      UNAVAILABLE: '검사 정보를 확인하지 못했습니다. 답변을 유지한 채 잠시 후 다시 시도해 주세요.',
    };
    return reply({ code, error: messages[code] || messages.UNAVAILABLE }, error instanceof DiagnosisBridgeError ? error.status : 503);
  }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
