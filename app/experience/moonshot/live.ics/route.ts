import {arrivalLiveEvent, DEFAULT_ARRIVAL} from '@/features/campus/arrival/config';
import {arrivalPublicationEnabled, arrivalRequiresPublication} from '@/features/campus/arrival/preview-gate';
import {calendarIcs} from '@/features/campus/arrival/model';
import {readPublishedArrival} from '@/features/campus/arrival/publication-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publication = arrivalPublicationEnabled(process.env) ? await readPublishedArrival() : null;
  if (!publication && arrivalRequiresPublication(process.env)) return new Response(null, {status: 404});
  const event = arrivalLiveEvent(publication?.config ?? DEFAULT_ARRIVAL);
  const file = calendarIcs(event);
  if (!file) return new Response(null, {status: 404});
  return new Response(file, {headers: {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="${event.id}.ics"`,
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  }});
}
