import {createAdminClient} from '@/lib/supabase/admin';
import {isTestRequest} from '@/lib/landing';
import {parseArrivalBatch} from '@/features/campus/arrival/analytics';

// Anonymous visit analytics for /experience/moonshot. Same-origin only; stored only while campus analytics is on.
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, {status: 403});
  if (isTestRequest(request.headers.get('cookie'))) return new Response(null, {status: 204});
  try {
    const raw = await request.text();
    if (raw.length > 16000) return new Response(null, {status: 413});
    const batch = parseArrivalBatch(JSON.parse(raw));
    if (!batch) return new Response(null, {status: 400});
    const {error} = await createAdminClient().rpc('edu_arrival_record', {p_session: batch.session, p_events: batch.events}).abortSignal(AbortSignal.timeout(3000));
    if (error) { console.error('arrival analytics record failed', error.code); return new Response(null, {status: 503}); }
    return new Response(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
  } catch { return new Response(null, {status: 400}); }
}
