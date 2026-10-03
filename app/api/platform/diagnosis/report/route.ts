import { resolveDiagnosisAudience } from '@/lib/diagnosis-audience';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { DiagnosisBridgeError } from '@/lib/diagnosis-bridge';
import { sendDiagnosisReportCommand } from '@/lib/diagnosis-report';
import { runDiagnosisReport } from '@/lib/diagnosis-report-service';

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: privateHeaders });

export async function GET(request: Request) {
  if (process.env.EDU_MYIN_DIAGNOSIS_ENABLED !== 'true' || process.env.EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED !== 'true'
    || process.env.EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED !== 'true') return reply({ error: '검사 결과 기능을 준비하고 있습니다.' }, 404);
  try {
    const actor = await getAuthenticatedUser();
    if (!actor) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await resolveDiagnosisAudience(actor, async (name, args) => await createAdminClient().rpc(name, args))) return reply({ error: '현재 계정에는 진단이 공개되지 않았습니다.' }, 403);
    const query = new URL(request.url).searchParams, keys = [...query.keys()];
    if (keys.length > 1 || keys.some(key => !['preview','download','html'].includes(key) || query.get(key) !== '1'))
      return reply({ code: 'INVALID', error: '요청 내용을 확인해 주세요.' }, 400);
    const download = query.has('download'), preview = query.has('preview'), html = query.has('html');
    const db = createAdminClient();
    const result = await runDiagnosisReport({ actor, rpc: async (name, args) => await db.rpc(name, args),
      send: sendDiagnosisReportCommand }, html ? 'html' : download || preview ? 'download' : 'status');
    if (html) return new Response(result.html, { headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      'Content-Disposition': `attachment; filename="N6-report.html"; filename*=UTF-8''${encodeURIComponent('N6-정밀보고서.html')}` } });
    if (download) return new Response(result.markdown, { headers: { ...privateHeaders, 'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="N6-report.md"; filename*=UTF-8''${encodeURIComponent('N6-검사결과.md')}` } });
    return reply(result);
  } catch (error) {
    const code = error instanceof DiagnosisBridgeError ? error.code : 'UNAVAILABLE';
    const messages: Record<string,string> = { INVALID: '요청 내용을 확인해 주세요.',
      FORBIDDEN: '검사 결과를 이용할 수 있는 구매·수강 정보를 확인해 주세요.',
      NOT_READY: '아직 검사 결과가 준비되지 않았어요. 잠시 후 진행 상태를 확인해 주세요.',
      UNAVAILABLE: '검사 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.' };
    return reply({ code, error: messages[code] || messages.UNAVAILABLE }, error instanceof DiagnosisBridgeError ? error.status : 503);
  }
}
