import type { createAdminClient } from './supabase/admin';
import { normalizeMetaAccountId } from './meta-campaign-settings';

// Server-side source of truth. Campaign rows keep the column for older readers,
// but neither a stale row nor a client payload can override the shared setting.
export async function commonMetaAccountId(db: ReturnType<typeof createAdminClient>) {
  const result = await db.from('site_settings').select('value').eq('key', 'edu_meta_marketing').maybeSingle();
  if (result.error) throw Error('Meta 공통 설정을 확인하지 못했습니다.');
  const value = result.data?.value;
  return normalizeMetaAccountId(value && typeof value === 'object' ? (value as Record<string, unknown>).adAccountId : null);
}
