import { arrivalLiveReminderEnabled, readArrivalLiveReminders } from '@/features/campus/arrival/live-reminder-server';
import { getOperatorUser } from '@/lib/operator-permissions';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  if (!arrivalLiveReminderEnabled()) return new Response(null, { status: 404, headers });

  try {
    if (!await getOperatorUser('marketing')) return new Response(null, { status: 403, headers });

    const { count, latest } = await readArrivalLiveReminders();
    return Response.json({
      count,
      latest: latest.slice(0, 50).map(({ maskedPhone, consentedAt }) => ({
        maskedPhone: /^010-\*{4}-\d{4}$/.test(maskedPhone) ? maskedPhone : '010-****-****',
        consentedAt,
      })),
    }, { headers });
  } catch {
    return Response.json({ error: '라이브 알림 신청을 불러오지 못했습니다.' }, { status: 503, headers });
  }
}
