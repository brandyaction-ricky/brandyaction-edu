import { timingSafeEqual } from 'node:crypto';
import { dispatchWebPush } from '@/lib/web-push-server';
export const maxDuration = 60;
export async function GET(request: Request) {
  const supplied = Buffer.from(request.headers.get('authorization') || ''), expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
  if (!process.env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await dispatchWebPush(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '알림 발송 결과를 확인하지 못했습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
