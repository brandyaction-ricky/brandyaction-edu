import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { fetchMetaCampaign } from '@/lib/meta-marketing';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  const user = await getOperatorUser('marketing');
  if (!user || user.role !== 'admin') return reply({ error: 'Meta 연결과 동기화는 관리자만 실행할 수 있습니다.' }, 403);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!validId(body.campaign_id)) return reply({ error: '캠페인을 선택해 주세요.' }, 400);
    const db = createAdminClient();
    const found = await db.from('landing_campaigns').select('*').eq('id', body.campaign_id).maybeSingle();
    if (found.error || !found.data) return reply({ error: '캠페인을 찾을 수 없습니다.' }, 404);
    const campaign = found.data;
    if (!campaign.meta_ad_account_id || !campaign.meta_campaign_id) return reply({ error: 'Meta 광고계정과 캠페인 ID를 먼저 연결해 주세요.' }, 400);
    const token = process.env.META_ACCESS_TOKEN, version = process.env.META_GRAPH_API_VERSION;
    if (!token || !version) return reply({ error: 'DEV 서버의 Meta API 환경변수가 설정되지 않았습니다.' }, 503);
    await db.from('landing_campaigns').update({ meta_sync_status: 'syncing', meta_sync_error: null, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', campaign.id);
    try {
      const rows = await fetchMetaCampaign({ version, token, accountId: campaign.meta_ad_account_id, campaignId: campaign.meta_campaign_id, startDay: campaign.start_day, endDay: campaign.end_day });
      if (rows.length) {
        const meta = await db.from('landing_campaign_meta_daily').upsert(rows.map(row => ({ campaign_id: campaign.id, ...row, synced_at: new Date().toISOString() })), { onConflict: 'campaign_id,day,meta_ad_id' });
        if (meta.error) throw Error('META_STORE_FAILED');
        const dimensions = await db.from('landing_campaign_dimensions').upsert(rows.map(row => ({ campaign_id: campaign.id, adset_key: encodeURIComponent(row.adset_name), creative_key: encodeURIComponent(row.creative_name), meta_adset_id: row.meta_adset_id, meta_ad_id: row.meta_ad_id, meta_creative_id: row.meta_creative_id, ad_type: 'unclassified', updated_by: user.id, updated_at: new Date().toISOString() })), { onConflict: 'campaign_id,adset_key,creative_key', ignoreDuplicates: true });
        if (dimensions.error) throw Error('META_DIMENSION_STORE_FAILED');
      }
      const syncedAt = new Date().toISOString();
      await db.from('landing_campaigns').update({ meta_sync_status: 'success', meta_last_synced_at: syncedAt, meta_sync_error: null, updated_by: user.id, updated_at: syncedAt }).eq('id', campaign.id);
      return reply({ ok: true, rows: rows.length, synced_at: syncedAt });
    } catch {
      await db.from('landing_campaigns').update({ meta_sync_status: 'failed', meta_sync_error: 'Meta 동기화에 실패했습니다. 연결 ID와 권한을 확인해 주세요.', updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', campaign.id);
      return reply({ error: 'Meta 동기화에 실패했습니다. 기존 데이터는 보존했습니다.' }, 502);
    }
  } catch { return reply({ error: 'Meta 동기화 요청을 확인해 주세요.' }, 400); }
}
