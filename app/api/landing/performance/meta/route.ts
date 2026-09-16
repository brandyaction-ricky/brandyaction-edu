import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { fetchMetaCampaigns } from '@/lib/meta-marketing';
import { metaCampaignIds } from '@/lib/meta-campaign-settings';
import { commonMetaAccountId } from '@/lib/meta-common-account';

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
    const accountId = await commonMetaAccountId(db), campaignIds = metaCampaignIds(campaign);
    if (!accountId) return reply({ error: '공통 광고계정이 설정되지 않았습니다. 운영 담당자에게 공통 설정을 요청해 주세요.' }, 503);
    if (!campaignIds.length) return reply({ error: 'Meta 캠페인 ID를 입력하고 설정을 저장해 주세요.' }, 400);
    const token = process.env.META_ACCESS_TOKEN, version = process.env.META_GRAPH_API_VERSION;
    if (!token || !version) {
      const error = '서버 연동 설정이 필요합니다. 운영 담당자가 META_ACCESS_TOKEN과 META_GRAPH_API_VERSION을 설정해야 합니다. 저장된 ID는 유지됩니다.';
      await db.from('landing_campaigns').update({ meta_sync_status: 'failed', meta_sync_error: error, updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('updated_at', campaign.updated_at);
      return reply({ error }, 503);
    }
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10);
    const endDay = campaign.end_day < today ? campaign.end_day : today;
    if (campaign.start_day > endDay) return reply({ error: '캠페인 시작일 이후에 Meta 데이터를 동기화할 수 있습니다.' }, 400);
    const syncStarted = new Date().toISOString();
    const started = await db.from('landing_campaigns').update({ meta_sync_status: 'syncing', meta_sync_error: null, updated_by: user.id, updated_at: syncStarted }).eq('id', campaign.id).eq('updated_at', campaign.updated_at).select('updated_at').maybeSingle();
    if (started.error || !started.data) return reply({ error: '설정이 변경됐습니다. 새로고침 후 다시 동기화해 주세요.' }, 409);
    try {
      const rows = await fetchMetaCampaigns({ version, token, accountId, campaignIds, startDay: campaign.start_day, endDay });
      const dimensions = rows.map(row => ({ adset_key: row.adset_name, creative_key: row.creative_name, meta_adset_id: row.meta_adset_id, meta_ad_id: row.meta_ad_id, meta_creative_id: row.meta_creative_id }));
      const stored = await db.rpc('edu_store_campaign_meta', { p_campaign: campaign.id, p_expected_updated_at: started.data.updated_at, p_rows: rows, p_dimensions: dimensions, p_actor: user.id });
      if (stored.error) throw Error('META_STORE_FAILED');
      return reply({ ok: true, rows: rows.length, campaigns: campaignIds.length });
    } catch {
      const error = 'Meta 동기화에 실패했습니다. 캠페인의 광고계정 소속과 조회 권한을 확인해 주세요. 기존 실적은 보존됐습니다.';
      await db.from('landing_campaigns').update({ meta_sync_status: 'failed', meta_sync_error: error, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('updated_at', started.data.updated_at);
      return reply({ error }, 502);
    }
  } catch { return reply({ error: 'Meta 동기화 요청을 확인해 주세요.' }, 400); }
}
