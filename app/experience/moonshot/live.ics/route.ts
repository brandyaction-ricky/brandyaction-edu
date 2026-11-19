import {arrivalLiveEvent, DEFAULT_ARRIVAL} from '@/features/campus/arrival/config';
import {calendarIcs} from '@/features/campus/arrival/model';

export function GET() {
  if (process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_APP_ENV === 'production') {
    return new Response(null, {status: 404});
  }

  const event = arrivalLiveEvent(DEFAULT_ARRIVAL);
  const file = calendarIcs(event);
  if (!file) return new Response(null, {status: 404});
  return new Response(file, {headers: {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="${event.id}.ics"`,
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  }});
}
