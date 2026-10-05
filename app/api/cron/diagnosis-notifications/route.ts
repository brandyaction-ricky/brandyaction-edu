import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendDiagnosisReportCommand } from '@/lib/diagnosis-report';
import { diagnosisReadyPushEnabled, pollDiagnosisReadyPush } from '@/lib/diagnosis-ready-push';
export const maxDuration = 60;
export async function GET(request: Request) {
  const supplied = Buffer.from(request.headers.get('authorization') || ''), expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
  if (!process.env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!diagnosisReadyPushEnabled()) return Response.json({ enabled: false }, { headers });
    const db = createAdminClient();
    return Response.json(await pollDiagnosisReadyPush({ enabled: true, rpc: async (name, args) => await db.rpc(name, args), send: sendDiagnosisReportCommand }), { headers });
  } catch { return Response.json({ error: '보고서 완성 알림 확인을 다시 시도합니다.' }, { status: 503, headers }); }
}
