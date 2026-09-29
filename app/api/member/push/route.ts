import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { pushConfiguration, validatePushEndpoint, validatePushSubscription } from '@/lib/web-push-server';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function failure(e: unknown) {
  const code = (e as { message?: string }).message || '';
  const errors: Record<string, [string, number]> = { PUSH_INVALID: ['이 브라우저의 알림 연결 정보를 확인하지 못했습니다.', 400], PUSH_DISABLED: ['앱 알림을 준비 중입니다.', 409], PUSH_ENDPOINT_CHANGED: ['알림 연결이 바뀌었습니다. 알림을 끈 뒤 다시 켜 주세요.', 409], PUSH_DEVICE_LIMIT: ['등록 가능한 기기 수를 초과했습니다. 사용하지 않는 기기의 알림을 먼저 꺼 주세요.', 409], MESSAGE_FORBIDDEN: ['로그인 상태를 확인해 주세요.', 403] };
  const error = errors[code]; return error ? reply({ error: error[0] }, error[1]) : reply({ error: '알림 설정을 확인하지 못했습니다. 다시 시도해 주세요.' }, 503);
}
async function enabled(db: ReturnType<typeof createAdminClient>) {
  const r = await db.from('edu_push_control').select('enabled').eq('singleton', true).maybeSingle(); if (r.error) throw r.error; return r.data?.enabled === true;
}
export async function GET() {
  try {
    const actor = await getAuthenticatedUser(); if (!actor) return reply({ error: '로그인이 필요합니다.' }, 401);
    const config = pushConfiguration(); if (!config) return reply({ enabled: false });
    if (!await enabled(createAdminClient())) return reply({ enabled: false });
    return reply({ enabled: true, publicKey: config.publicKey });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
  try {
    const actor = await getAuthenticatedUser(); if (!actor) return reply({ error: '로그인이 필요합니다.' }, 401);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: '입력 형식을 확인해 주세요.' }, 400);
    const decoder = new TextDecoder(); let size = 0, raw = '';
    try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 8000) { await reader.cancel(); return reply({ error: '입력이 너무 깁니다.' }, 413); } raw += decoder.decode(value, { stream: true }); } raw += decoder.decode(); } finally { reader.releaseLock(); }
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: '입력 형식을 확인해 주세요.' }, 400); }
    if (!body || !['subscribe', 'status', 'unsubscribe'].includes(body.action)) return reply({ error: '요청을 확인해 주세요.' }, 400);
    const db = createAdminClient();
    // Revocation remains available when sending is paused or a key is rotated.
    if (body.action !== 'subscribe') {
      const r = await db.rpc('edu_push_device', { p_actor: actor.id, p_endpoint: validatePushEndpoint(body.endpoint), p_disable: body.action === 'unsubscribe' }); if (r.error) throw r.error; return reply(r.data);
    }
    if (!pushConfiguration() || !await enabled(db)) throw new Error('PUSH_DISABLED');
    const subscription = validatePushSubscription(body);
    const r = await db.rpc('edu_register_push', { p_actor: actor.id, p_endpoint: subscription.endpoint, p_key: subscription.p256dh, p_auth: subscription.auth }); if (r.error) throw r.error; return reply(r.data);
  } catch (e) { return failure(e); }
}
