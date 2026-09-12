import { createAdminClient } from '@/lib/supabase/admin';
import { isTestRequest, validatePacket } from '@/lib/landing';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (isTestRequest(request.headers.get('cookie'))) return new Response(null, { status: 204 });
  try {
    if (Number(request.headers.get('content-length')) > 48000) return new Response(null, { status: 413 });
    const raw = await request.text();
    if (raw.length > 48000) return new Response(null, { status: 413 });
    const packet = validatePacket(JSON.parse(raw));
    const { error } = await createAdminClient().rpc('edu_ingest_landing', { p_packet: packet });
    return new Response(null, { status: error ? 503 : 204 });
  } catch { return new Response(null, { status: 400 }); }
}
