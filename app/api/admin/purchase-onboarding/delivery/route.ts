import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { telegramInviteUrl, uuid } from '@/lib/purchase-onboarding';
import { purchaseBatchLimit, purchaseChannels, purchaseRecipientLimit, purchaseRoomToken, purchaseTextBytes, purchaseTextLimits, type PurchaseChannel } from '@/lib/purchase-buyer-delivery';
import { purchaseBuyers, purchaseBuyerChannels, purchaseBuyerHistory, purchaseBuyerTemplates, purchaseTemplateHash, reachableBuyers } from '@/lib/purchase-buyer-delivery-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const error = (message: string, status = 400) => reply({ error: message }, status);

async function operator() {
  const user = await getOperatorUser('products');
  return user?.permissions.orders && user.permissions.marketing ? user : null;
}

async function paidCohort(cohort: string) {
  const result = await createAdminClient().from('cohorts').select('id,courses!inner(list_price,category)')
    .eq('id', cohort).gt('courses.list_price', 0).neq('courses.category', 'free').maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

export async function GET(request: Request) {
  try {
    if (!await operator()) return error('상품·주문·마케팅 관리 권한이 필요합니다.', 403);
    const cohort = new URL(request.url).searchParams.get('cohort');
    if (!uuid(cohort) || !await paidCohort(cohort)) return error('유료 클래스 기수를 확인해 주세요.');
    const [buyers, channels, templates, deliveryByBuyer, history] = await Promise.all([
      purchaseBuyers(cohort), purchaseBuyerChannels(), purchaseBuyerTemplates(), purchaseBuyerHistory(cohort),
      createAdminClient().from('edu_purchase_delivery_reservations')
        .select('id,channel,subject,content,count,scheduled_at,status,pending_count,accepted_count,failed_count,skipped_count,unknown_count')
        .eq('cohort_id', cohort).order('created_at', { ascending: false }).order('id').limit(50),
    ]);
    if (history.error) throw history.error;
    const reachable = Object.fromEntries(purchaseChannels.map(channel => [channel, new Set(reachableBuyers(channel, buyers).map(buyer => buyer.id))]));
    return reply({
      channels,
      templates: templates.map(template => ({ id: template.id, name: template.name, channel: template.channel, content: template.content, version: purchaseTemplateHash(template) })),
      buyers: buyers.map(buyer => ({
        id: buyer.id, name: buyer.full_name || '이름 미등록',
        channels: purchaseChannels.filter(channel => reachable[channel].has(buyer.id)),
        delivery: deliveryByBuyer.get(buyer.id),
      })),
      history: history.data,
    });
  } catch {
    return error('구매자와 발송 내역을 불러오지 못했습니다.', 503);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return error('요청 출처를 확인해 주세요.', 403);
    const user = await operator();
    if (!user) return error('상품·주문·마케팅 관리 권한이 필요합니다.', 403);
    const raw = await request.text();
    if (raw.length > purchaseRecipientLimit * 40 + 9000) return error('입력 내용이 너무 큽니다.', 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return error('입력 형식을 확인해 주세요.'); }
    if (!body || !uuid(body.cohort) || !uuid(body.id) || !await paidCohort(body.cohort)) return error('기수와 예약 번호를 확인해 주세요.');
    const { cohort, id } = body;
    const db = createAdminClient();
    if (body.action === 'cancel') {
      const result = await db.from('edu_purchase_delivery_batches').update({ status: 'cancelled' })
        .eq('cohort_id', cohort).eq('status', 'scheduled').or(`id.eq.${id},reservation_id.eq.${id}`).select('id');
      if (result.error) throw result.error;
      return result.data.length ? reply({ ok: true }) : error('이미 처리 중이거나 종료된 예약입니다.', 409);
    }
    if (body.action !== 'schedule' || !purchaseChannels.includes(body.channel as PurchaseChannel)) return error('발송 방법을 확인해 주세요.');
    const existing = await db.from('edu_purchase_delivery_batches').select('id').eq('id', id).eq('cohort_id', cohort).eq('created_by', user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return reply({ ok: true });
    const channel = body.channel as PurchaseChannel;
    const ids = body.recipients;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > purchaseRecipientLimit || !ids.every(uuid) || new Set(ids).size !== ids.length) return error('예약할 구매자 목록을 확인해 주세요.');
    const at = typeof body.scheduledAt === 'string' ? Date.parse(body.scheduledAt) : NaN;
    if (!Number.isFinite(at) || at <= Date.now()) return error('현재 이후의 발송 시간을 선택해 주세요.');
    const directText = (channel === 'sms' || channel === 'lms') && !body.templateId;
    const needsTemplate = channel !== 'email' && !directText;
    const [channels, buyers, templates] = await Promise.all([
      purchaseBuyerChannels(), purchaseBuyers(cohort), needsTemplate ? purchaseBuyerTemplates() : [],
    ]);
    if (!channels[channel]) return error('이 채널의 발송 설정을 먼저 확인해 주세요.', 409);
    const eligible = new Set(reachableBuyers(channel, buyers).map(buyer => buyer.id));
    if (ids.some(id => !eligible.has(id))) return error('구매자 상태 또는 연락처가 변경됐습니다. 목록을 새로 불러와 주세요.', 409);
    const template = templates.find(t => t.id === body.templateId && t.channel === channel);
    if (needsTemplate && (!template || purchaseTemplateHash(template) !== body.templateVersion)) return error('메시지 템플릿이 바뀌었습니다. 문구를 다시 확인해 주세요.', 409);
    const subject = channel === 'email' && typeof body.subject === 'string' ? body.subject.trim() : null;
    let roomLink: string | null = null;
    const token = purchaseRoomToken(channel);
    if (template?.content.includes(token)) {
      try { roomLink = telegramInviteUrl(body.roomLink) || null; } catch { return error('텔레그램 공지방 초대 링크를 확인해 주세요.'); }
      if (!roomLink) return error('공지방 링크를 입력해 주세요.');
    }
    if (channel === 'alimtalk' && template && [...template.content.matchAll(/#\{[^}]+\}/g)].some(match => !['#{이름}', token].includes(match[0]))) return error('이 화면에서 지원하지 않는 알림톡 변수가 있습니다.');
    const content = template?.content ?? (typeof body.content === 'string' ? body.content.trim() : '');
    if (directText && (channel === 'sms' || channel === 'lms')) {
      const bytes = purchaseTextBytes(content);
      if (bytes === null) return error('이모지 등 문자 발송에서 지원하지 않는 문자를 지워 주세요.');
      if (!bytes || bytes > purchaseTextLimits[channel]) return error(channel === 'sms' ? '문자 내용을 90바이트 이내로 줄이거나 장문 문자를 선택해 주세요.' : '장문 문자 내용을 2,000바이트 이내로 입력해 주세요.');
    }
    if (!content || (channel === 'email' && (!subject || subject.length > 120 || content.length > 4000))) return error('이메일 제목과 내용을 확인해 주세요.');
    const reservation = {
      cohort_id: cohort, created_by: user.id, channel, subject, content: roomLink ? content.replaceAll(token, roomLink) : content, room_link: roomLink,
      template_id: template?.id ?? null, template_hash: template ? purchaseTemplateHash(template) : null,
      scheduled_at: new Date(at).toISOString(), reservation_id: ids.length > purchaseBatchLimit ? id : null,
    };
    const batches = [];
    for (let offset = 0; offset < ids.length; offset += purchaseBatchLimit) {
      batches.push({ ...reservation, id: offset === 0 ? id : crypto.randomUUID(), recipient_ids: ids.slice(offset, offset + purchaseBatchLimit) });
    }
    const saved = await db.from('edu_purchase_delivery_batches').insert(batches);
    if (saved.error) {
      if (saved.error.code !== '23505') throw saved.error;
      const duplicate = await db.from('edu_purchase_delivery_batches').select('id').eq('id', id).eq('cohort_id', cohort).eq('created_by', user.id).maybeSingle();
      if (duplicate.error || !duplicate.data) throw saved.error;
    }
    return reply({ ok: true });
  } catch {
    return error('예약 상태를 확인하지 못했습니다. 같은 화면에서 다시 시도하거나 예약 내역을 확인해 주세요.', 503);
  }
}
