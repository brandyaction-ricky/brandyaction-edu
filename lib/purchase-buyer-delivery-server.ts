import 'server-only';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadSmsSettings } from '@/lib/crm-sms-settings';
import { maskEmail, purchaseEmailConfigured } from '@/lib/crm-purchase-email';
import { sendBatch, type Member, type Template } from '@/lib/crm-delivery';
import { permissionsFor } from '@/lib/operator-permissions';
import { purchaseDestination, validPurchaseDestination, type PurchaseChannel } from '@/lib/purchase-buyer-delivery';

type Buyer = Member & { role: string; deleted_at: string | null; is_internal: boolean | null };
type DeliveryTemplate = Template & { name: string };
export const purchaseTemplateHash = (template: DeliveryTemplate) => createHash('sha256')
  .update(JSON.stringify([template.id, template.channel, template.purpose, template.name, template.content, template.alimtalk_template_id, template.buttons])).digest('hex');

export function purchaseBuyerDeliveryEnabled() {
  return process.env.EDU_PURCHASE_BUYER_DELIVERY_ENABLED === 'true' &&
    process.env.CRM_DELIVERY_ENABLED === 'true';
}

export async function purchaseBuyerChannels() {
  if (!purchaseBuyerDeliveryEnabled()) return { sms: false, lms: false, alimtalk: false, email: false };
  const sms = await loadSmsSettings();
  const mobile = Boolean(sms.transactionalEnabled && sms.senderPhone && process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET);
  return { sms: mobile, lms: mobile, alimtalk: mobile && !!process.env.SOLAPI_KAKAO_PF_ID, email: purchaseEmailConfigured() };
}

export async function purchaseBuyerTemplates() {
  const result = await createAdminClient().from('crm_templates')
    .select('id,name,channel,purpose,content,alimtalk_template_id,buttons,is_active')
    .eq('purpose', 'transactional').eq('is_active', true).in('channel', ['sms', 'lms', 'alimtalk'])
    .order('name').limit(100);
  if (result.error) throw result.error;
  return (result.data as DeliveryTemplate[]).filter(t => t.channel !== 'alimtalk' || t.alimtalk_template_id);
}

export async function purchaseBuyers(cohort: string, ids?: string[]) {
  const db = createAdminClient();
  const rows: Buyer[] = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  for (let offset = 0; ; offset += 250) {
    let query = db.from('enrollments').select(
      'id,profiles!enrollments_user_id_fkey!inner(id,full_name,email,phone,status,role,is_internal,deleted_at),order_items!inner(cohort_id,orders!inner(user_id,status,total_amount,is_test_order))',
    ).eq('cohort_id', cohort).eq('order_items.cohort_id', cohort).eq('status', 'active').is('revoked_at', null)
      .or('access_ends_at.is.null,access_ends_at.gt.' + now)
      .eq('profiles.status', 'active').is('profiles.deleted_at', null)
      .eq('order_items.orders.status', 'paid').gt('order_items.orders.total_amount', 0)
      .eq('order_items.orders.is_test_order', false)
      .order('id').range(offset, offset + 249);
    if (ids) query = query.in('user_id', ids);
    const result = await query;
    if (result.error) throw result.error;
    for (const row of result.data) {
      const buyer = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as Buyer | null;
      const item = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
      const order = Array.isArray(item?.orders) ? item.orders[0] : item?.orders;
      if (!buyer || buyer.id !== order?.user_id || buyer.is_internal || ['admin','staff'].includes(buyer.role) || seen.has(buyer.id)) continue;
      seen.add(buyer.id);
      rows.push(buyer);
    }
    if (result.data.length < 250) break;
    if (offset >= 9750) throw new Error('대상 명단이 조회 한도를 초과했습니다.');
  }
  return rows;
}

export function reachableBuyers(channel: PurchaseChannel, buyers: Buyer[]) {
  const counts = new Map<string, number>();
  for (const buyer of buyers) {
    const destination = purchaseDestination(channel, buyer);
    counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }
  return buyers.filter(buyer => {
    const destination = purchaseDestination(channel, buyer);
    return validPurchaseDestination(channel, destination) && counts.get(destination) === 1;
  });
}

async function sendBuyerEmails(batch: { id: string; subject: string; content: string }, buyers: Buyer[]) {
  const db = createAdminClient();
  const receipts = await db.from('crm_message_logs').insert(buyers.map(buyer => ({
    purchase_batch_id: batch.id, member_id: buyer.id, channel: 'email',
    recipient_masked: maskEmail(purchaseDestination('email', buyer)), status: 'processing',
  })));
  if (receipts.error) throw receipts.error;
  let status: 'accepted' | 'failed' | 'unknown' = 'unknown';
  try {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'edu-buyer-' + batch.id,
        'x-batch-validation': 'strict',
      },
      body: JSON.stringify(buyers.map(buyer => ({
        from: process.env.CRM_EMAIL_FROM, to: [purchaseDestination('email', buyer)],
        subject: batch.subject, text: batch.content,
      }))),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const result = await response.json();
      if (Array.isArray(result.data) && result.data.length === buyers.length && result.data.every((item: { id?: unknown }) => typeof item?.id === 'string')) status = 'accepted';
    } else if (response.status < 500 && ![408, 409, 429].includes(response.status)) status = 'failed';
  } catch { /* An uncertain provider outcome must never trigger automatic resend. */ }
  const update = await db.from('crm_message_logs').update({
    status, provider_status: status, sent_at: status === 'accepted' ? new Date().toISOString() : null,
  }).eq('purchase_batch_id', batch.id);
  if (update.error) throw update.error;
  return status;
}

export async function dispatchPurchaseBuyerDelivery() {
  if (!purchaseBuyerDeliveryEnabled()) return;
  const db = createAdminClient();
  const channels = await purchaseBuyerChannels();
  const available = Object.entries(channels).filter(([, active]) => active).map(([channel]) => channel);
  const stale = await db.from('edu_purchase_delivery_batches').update({ status: 'unknown' })
    .eq('status', 'sending').lt('started_at', new Date(Date.now() - 5 * 60000).toISOString());
  if (stale.error) throw stale.error;
  if (!available.length) return;
  const due = await db.from('edu_purchase_delivery_batches').select('*').eq('status', 'scheduled')
    .in('channel', available).lte('scheduled_at', new Date().toISOString()).order('scheduled_at').order('id').limit(1).maybeSingle();
  if (due.error) throw due.error;
  const batch = due.data;
  if (!batch) return;
  const lock = await db.from('edu_purchase_delivery_batches').update({ status: 'sending', started_at: new Date().toISOString() })
    .eq('id', batch.id).eq('status', 'scheduled').select('id').maybeSingle();
  if (lock.error) throw lock.error;
  if (!lock.data) return;

  let status = 'failed';
  let accepted_count = 0, failed_count = 0, skipped_count = 0, unknown_count = 0;
  let attempted = false;
  try {
    const actor = await db.from('profiles').select('id,role,status,deleted_at').eq('id', batch.created_by).maybeSingle();
    if (actor.error) throw actor.error;
    if (!actor.data || actor.data.status !== 'active' || actor.data.deleted_at) throw new Error('예약자 권한을 확인할 수 없습니다.');
    const permissions = await permissionsFor(actor.data);
    if (!permissions.products || !permissions.orders || !permissions.marketing) throw new Error('예약자 권한이 변경됐습니다.');
    const channel = batch.channel as PurchaseChannel;
    const template = channel === 'email' ? null : (await purchaseBuyerTemplates()).find(t => t.id === batch.template_id);
    if (channel !== 'email' && (!template || purchaseTemplateHash(template) !== batch.template_hash)) throw new Error('템플릿이 변경됐습니다.');
    const ids = new Set<string>(batch.recipient_ids);
    const buyers = reachableBuyers(channel, await purchaseBuyers(batch.cohort_id)).filter(buyer => ids.has(buyer.id));
    skipped_count = ids.size - buyers.length;
    if (buyers.length && channel === 'email') {
      attempted = true;
      const result = await sendBuyerEmails(batch, buyers);
      if (result === 'accepted') accepted_count = buyers.length;
      else if (result === 'failed') failed_count = buyers.length;
      else unknown_count = buyers.length;
    } else if (buyers.length && template) {
      const settings = await loadSmsSettings();
      attempted = true;
      const result = await sendBatch(template, buyers, { purchaseBatchId: batch.id, purchaseRoomLink: batch.room_link }, settings);
      if (result.disabled) throw new Error('문자 발송 설정을 확인해 주세요.');
      accepted_count = result.sent;
      failed_count = result.failed;
    }
    status = unknown_count ? 'unknown' : 'completed';
  } catch {
    if (attempted) {
      status = 'unknown';
      unknown_count = batch.recipient_ids.length - accepted_count - failed_count - skipped_count;
    }
  }
  const finish = await db.from('edu_purchase_delivery_batches').update({
    status, accepted_count, failed_count, skipped_count, unknown_count,
  }).eq('id', batch.id).eq('status', 'sending');
  if (finish.error) throw finish.error;
}
