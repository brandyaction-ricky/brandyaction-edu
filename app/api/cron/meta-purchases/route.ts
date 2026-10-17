import { timingSafeEqual } from 'node:crypto';
import { dispatchMetaPurchases } from '@/lib/meta-purchase-server';
export const maxDuration = 60;
export async function GET(request: Request) {
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`);
  if (!process.env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try { return Response.json(await dispatchMetaPurchases(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: '구매 전송 상태를 확인하지 못했습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
