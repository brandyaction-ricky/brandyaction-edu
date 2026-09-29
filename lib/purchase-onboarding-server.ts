import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMoonshotFourth, onboardingSettingsKey, purchaseOnboardingSettings, uuid, type PurchaseOnboardingSettings } from '@/lib/purchase-onboarding';

export type EligiblePurchase = {
  orderId: string;
  orderNumber: string;
  itemName: string;
  cohortId: string;
  telegramOnly: boolean;
  settings: PurchaseOnboardingSettings;
};

export async function eligiblePurchase(userId: string, requestedOrder: string | null): Promise<EligiblePurchase | null> {
  if (requestedOrder && !uuid(requestedOrder)) throw Object.assign(new Error('주문 번호를 확인해 주세요.'), { status: 400 });
  const db = await createClient();
  let query = db.from('orders').select('id,order_number,status,paid_at').eq('user_id', userId).eq('status', 'paid').order('paid_at', { ascending: false }).limit(requestedOrder ? 1 : 30);
  if (requestedOrder) query = query.eq('id', requestedOrder);
  const orders = await query;
  if (orders.error) throw orders.error;
  const rows = orders.data || [];
  if (!rows.length) return null;
  const items = await db.from('order_items').select('order_id,cohort_id,item_name').in('order_id', rows.map(row => row.id));
  if (items.error) throw items.error;
  const itemRows = items.data || [];
  const cohortIds = [...new Set(itemRows.map(row => row.cohort_id).filter(uuid))];
  if (!cohortIds.length) return null;
  const keys = cohortIds.map(onboardingSettingsKey);
  const adminDb = createAdminClient();
  const [configs, cohorts] = await Promise.all([
    adminDb.from('site_settings').select('key,value').in('key', keys).eq('is_public', false),
    adminDb.from('cohorts').select('id,name,courses(title)').in('id', cohortIds),
  ]);
  if (configs.error) throw configs.error;
  const byKey = new Map((configs.data || []).map(row => [row.key, row.value]));
  if (cohorts.error) throw cohorts.error;
  const byCohort = new Map((cohorts.data || []).map(row => [row.id, row]));
  for (const order of rows) {
    for (const item of itemRows.filter(row => row.order_id === order.id)) {
      const config = byKey.get(onboardingSettingsKey(item.cohort_id));
      if (!config) continue;
      try {
        const settings = purchaseOnboardingSettings(config);
        if (settings.enabled) {
          const cohort = byCohort.get(item.cohort_id);
          const course = Array.isArray(cohort?.courses) ? cohort.courses[0] : cohort?.courses;
          return { orderId: order.id, orderNumber: order.order_number, itemName: item.item_name, cohortId: item.cohort_id,
            telegramOnly: isMoonshotFourth(course?.title, cohort?.name), settings };
        }
      } catch { /* Invalid or incomplete settings cannot make an order eligible. */ }
    }
  }
  return null;
}
