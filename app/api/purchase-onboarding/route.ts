import { readOnboardingProgress, confirmOnboardingStep } from '@/lib/purchase-onboarding-progress-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { imagePreviewUrl } from '@/lib/qa-rules';
import { eligiblePurchase } from '@/lib/purchase-onboarding-server';
import { MOONSHOT_SUPPORT_URL, surveyRoom, telegramPath } from '@/lib/purchase-onboarding';
import { getPublicSupport } from '@/lib/public-platform-data';
import { safeUrl } from '@/lib/platform';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({ error: status === 503 ? '결제 후 안내를 확인하지 못했습니다. 다시 시도해 주세요.' : error instanceof Error ? error.message : '요청을 확인해 주세요.' }, status);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const purchase = await eligiblePurchase(user.id, new URL(request.url).searchParams.get('order'));
    if (!purchase) return reply({ available: false, error: '안내할 결제 완료 주문이 없습니다.' }, 404);
    if (purchase.telegramOnly) return reply({ available: true, telegramOnly: true, orderId: purchase.orderId,
      orderNumber: purchase.orderNumber, itemName: purchase.itemName, roomName: purchase.settings.roomName || '교육생 공지방',
      progress: await readOnboardingProgress(user.id, purchase),
      supportUrl: MOONSHOT_SUPPORT_URL });
    const row = await createAdminClient().from('edu_purchase_onboarding').select('survey_room,survey_answered_at,tg_path,tg_link_clicked_at').eq('order_id', purchase.orderId).eq('user_id', user.id).maybeSingle();
    if (row.error) throw row.error;
    const selectedImage = row.data?.survey_room === 'paid' ? purchase.settings.paidImage : row.data?.survey_room === 'organic' ? purchase.settings.organicImage : '';
    const support = await getPublicSupport();
    return reply({ available: true, orderId: purchase.orderId, orderNumber: purchase.orderNumber, itemName: purchase.itemName,
      roomName: purchase.settings.roomName, surveyRoom: row.data?.survey_room || null, surveyAnsweredAt: row.data?.survey_answered_at || null,
      telegramPath: row.data?.tg_path || null, linkClickedAt: row.data?.tg_link_clicked_at || null,
      profileImage: selectedImage ? imagePreviewUrl(selectedImage, process.env.NEXT_PUBLIC_SUPABASE_URL || '') : '',
      supportUrl: safeUrl(support.url) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const raw = await request.text();
    if (raw.length > 6000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return reply({ error: '입력 형식을 확인해 주세요.' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.order !== 'string') return reply({ error: '주문을 확인해 주세요.' }, 400);
    const purchase = await eligiblePurchase(user.id, body.order);
    if (!purchase) return reply({ error: '결제 완료 주문을 확인해 주세요.' }, 404);
    if (purchase.telegramOnly) {
      if (body.action === 'confirm') return reply(await confirmOnboardingStep(user.id, purchase, body));
      if (body.action !== 'link') return reply({ error: '지원하지 않는 요청입니다.' }, 400);
      return reply({ ok: true, url: purchase.settings.inviteUrl });
    }
    const db = createAdminClient();
    const existing = await db.from('edu_purchase_onboarding').select('survey_room,tg_path').eq('order_id', purchase.orderId).eq('user_id', user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (body.action === 'answer') {
      const room = surveyRoom(body.room);
      if (!room) return reply({ error: '유입 경로를 하나 선택해 주세요.' }, 400);
      if (existing.data) return reply({ ok: true, surveyRoom: existing.data.survey_room });
      const saved = await db.from('edu_purchase_onboarding').insert({ order_id: purchase.orderId, user_id: user.id, survey_room: room }).select('survey_room').single();
      if (saved.error?.code === '23505') return reply({ ok: true, surveyRoom: (await db.from('edu_purchase_onboarding').select('survey_room').eq('order_id', purchase.orderId).single()).data?.survey_room });
      if (saved.error) throw saved.error;
      return reply({ ok: true, surveyRoom: saved.data.survey_room });
    }
    if (!existing.data) return reply({ error: '유입 경로를 먼저 선택해 주세요.' }, 409);
    if (body.action === 'path') {
      const path = telegramPath(body.path);
      if (!path) return reply({ error: '텔레그램 사용 방법을 선택해 주세요.' }, 400);
      const saved = await db.from('edu_purchase_onboarding').update({ tg_path: path, updated_at: new Date().toISOString() }).eq('order_id', purchase.orderId).eq('user_id', user.id).select('tg_path').maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return reply({ error: '설문 응답을 다시 확인해 주세요.' }, 409);
      return reply({ ok: true, telegramPath: path });
    }
    if (body.action === 'link') {
      if (!existing.data.tg_path) return reply({ error: '텔레그램 사용 방법을 먼저 선택해 주세요.' }, 409);
      const clickedAt = new Date().toISOString();
      const saved = await db.from('edu_purchase_onboarding').update({ tg_link_clicked_at: clickedAt, updated_at: clickedAt }).eq('order_id', purchase.orderId).eq('user_id', user.id).select('tg_link_clicked_at').maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return reply({ error: '설문 응답을 다시 확인해 주세요.' }, 409);
      return reply({ ok: true, url: purchase.settings.inviteUrl, clickedAt });
    }
    return reply({ error: '지원하지 않는 요청입니다.' }, 400);
  } catch (error) { return failure(error); }
}
