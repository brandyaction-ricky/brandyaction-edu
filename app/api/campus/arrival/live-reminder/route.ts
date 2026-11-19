import {readSpaceJson} from '@/features/campus/space/body';
import {
  arrivalLiveReminderEnabled, arrivalLiveReminderOpen, normalizeArrivalReminderPhone, registerArrivalLiveReminder,
} from '@/features/campus/arrival/live-reminder-server';

function reply(data: {registered:true} | {error:string}, status = 200) {
  return Response.json(data, {status, headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(request: Request) {
  if (!arrivalLiveReminderEnabled()) return reply({error:'unavailable'}, 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'invalid'}, 403);
  if (!arrivalLiveReminderOpen()) return reply({error:'closed'}, 410);

  let body: Record<string, unknown>;
  try {
    body = await readSpaceJson(request, 256);
  } catch {
    return reply({error:'invalid'}, 400);
  }

  const phone = normalizeArrivalReminderPhone(body.phone);
  if (!phone || body.consent !== true || Object.keys(body).length !== 2) return reply({error:'invalid'}, 400);
  try {
    await registerArrivalLiveReminder(phone);
    return reply({registered:true});
  } catch {
    return reply({error:'unavailable'}, 503);
  }
}
