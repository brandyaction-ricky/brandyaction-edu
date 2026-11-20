import {timingSafeEqual} from 'node:crypto';
import {runArrivalLiveReminderDelivery} from '@/features/campus/arrival/live-reminder-delivery';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const headers = {'Cache-Control': 'no-store'};

export async function HEAD() {
  return new Response(null, {status: 405, headers: {...headers, Allow: 'GET'}});
}

export async function GET(request: Request) {
  const key = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${key || ''}`);
  if (!key || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response(null, {status: 401, headers});
  }
  try {
    // Use the authenticated recovery path if the deployment was unavailable
    // during the scheduled day. Recovery can only purge after the set time.
    const recoverPurge = new URL(request.url).searchParams.get('recover') === '1';
    return Response.json(await runArrivalLiveReminderDelivery(Date.now, recoverPurge), {headers});
  } catch {
    console.error('Moonshot live reminder job failed');
    return Response.json({error: 'Live reminder job failed'}, {status: 503, headers});
  }
}
