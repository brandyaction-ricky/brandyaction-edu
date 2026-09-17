import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { fetchMetaCampaigns } from '@/lib/meta-marketing';
import { metaCampaignIds } from '@/lib/meta-campaign-settings';
import { commonMetaAccountId } from '@/lib/meta-common-account';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
type SyncFailure = { name?: string; type?: string; stage?: string; retryable?: boolean; upstreamStatus?: number | null; metaCode?: number | null; metaSubcode?: number | null; completedCampaigns?: number; totalCampaigns?: number };
const failureText: Record<string, string> = {
  authentication: 'Meta 인증에 실패했습니다. 서버 토큰 설정을 확인해 주세요.', token_expired: 'Meta 토큰이 만료됐습니다. 토큰을 갱신한 뒤 다시 시도해 주세요.',
  permission: 'Meta 광고계정 또는 캠페인 조회 권한이 부족합니다.', invalid_account: '캠페인이 설정된 공통 광고계정에 속하지 않습니다.',
  invalid_campaign: '유효하지 않거나 조회할 수 없는 Meta 캠페인 ID가 포함돼 있습니다.', rate_limit: 'Meta 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',
  timeout: 'Meta 응답 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.', temporary: 'Meta가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
  invalid_response: 'Meta 응답 형식이 예상과 다릅니다. 관리자 로그를 확인해 주세요.', paging_limit: 'Meta 조회 데이터가 안전한 처리 한도를 초과했습니다.',
  database: 'Meta 데이터 저장에 실패했습니다. 기존 실적은 보존됐습니다.', unknown: 'Meta 동기화에 실패했습니다. 기존 실적은 보존됐습니다.',
};
function safeFailure(error: unknown): SyncFailure & { type: string; stage: string; retryable: boolean } {
  const value = error && typeof error === 'object' ? error as SyncFailure : {};
  const known = typeof value.type === 'string' && value.type in failureText;
  return { type: known ? value.type! : 'unknown', stage: typeof value.stage === 'string' ? value.stage : 'unknown', retryable: value.retryable === true,
    upstreamStatus: value.upstreamStatus ?? null, metaCode: value.metaCode ?? null, metaSubcode: value.metaSubcode ?? null,
    completedCampaigns: value.completedCampaigns ?? 0, totalCampaigns: value.totalCampaigns ?? 1 };
}
function failureStatus(type: string) { return type === 'permission' ? 403 : type === 'invalid_account' || type === 'invalid_campaign' ? 422 : type === 'rate_limit' ? 429 : type === 'timeout' ? 504 : type === 'temporary' || type === 'database' ? 503 : 502; }
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
    if (campaign.meta_sync_status === 'syncing' && campaign.meta_sync_attempted_at && Date.now() - Date.parse(campaign.meta_sync_attempted_at) < 10 * 60000) return reply({ error: '이미 Meta 동기화가 진행 중입니다.', type: 'sync_in_progress', retryable: true }, 409);
    const accountId = await commonMetaAccountId(db), campaignIds = metaCampaignIds(campaign);
    if (!accountId) return reply({ error: '공통 광고계정이 설정되지 않았습니다. 운영 담당자에게 공통 설정을 요청해 주세요.' }, 503);
    if (!campaignIds.length) return reply({ error: 'Meta 캠페인 ID를 입력하고 설정을 저장해 주세요.' }, 400);
    const token = process.env.META_ACCESS_TOKEN, version = process.env.META_GRAPH_API_VERSION;
    if (!token || !version) {
      const error = '서버 연동 설정이 필요합니다. 운영 담당자가 META_ACCESS_TOKEN과 META_GRAPH_API_VERSION을 설정해야 합니다. 저장된 ID는 유지됩니다.';
      await db.from('landing_campaigns').update({ meta_sync_status: 'failed', meta_sync_error: error, meta_sync_attempted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('updated_at', campaign.updated_at);
      return reply({ error }, 503);
    }
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10);
    const endDay = campaign.end_day < today ? campaign.end_day : today;
    if (campaign.start_day > endDay) return reply({ error: '캠페인 시작일 이후에 Meta 데이터를 동기화할 수 있습니다.' }, 400);
    const syncStarted = new Date().toISOString();
    const started = await db.from('landing_campaigns').update({ meta_sync_status: 'syncing', meta_sync_error: null, meta_sync_attempted_at: syncStarted, updated_by: user.id, updated_at: syncStarted }).eq('id', campaign.id).eq('updated_at', campaign.updated_at).select('updated_at').maybeSingle();
    if (started.error || !started.data) return reply({ error: '설정이 변경됐습니다. 새로고침 후 다시 동기화해 주세요.' }, 409);
    try {
      const rows = await fetchMetaCampaigns({ version, token, accountId, campaignIds, startDay: campaign.start_day, endDay });
      const dimensionMap = new Map(rows.map(row => [`${row.meta_adset_id}\u0000${row.meta_ad_id}`, { adset_key: row.adset_name, creative_key: row.creative_name, meta_adset_id: row.meta_adset_id, meta_ad_id: row.meta_ad_id, meta_creative_id: row.meta_creative_id }]));
      const dimensions = [...dimensionMap.values()];
      const stored = await db.rpc('edu_store_campaign_meta', { p_campaign: campaign.id, p_expected_updated_at: started.data.updated_at, p_rows: rows, p_dimensions: dimensions, p_actor: user.id });
      if (stored.error) throw { type: 'database', stage: 'database', retryable: true, dbCode: stored.error.code || null };
      console.info('meta_sync_success', { campaign_id: campaign.id, campaigns: campaignIds.length, rows: rows.length, duration_ms: Date.now() - Date.parse(syncStarted) });
      return reply({ ok: true, rows: rows.length, campaigns: campaignIds.length });
    } catch (cause) {
      const failure = safeFailure(cause), partial = (failure.completedCampaigns || 0) > 0;
      const error = `${partial ? '일부 캠페인 조회 후 실패했습니다. 저장은 적용하지 않았습니다. ' : ''}${failureText[failure.type]} 기존 실적과 마지막 성공 시각은 유지됩니다.`;
      await db.from('landing_campaigns').update({ meta_sync_status: 'failed', meta_sync_error: error, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('updated_at', started.data.updated_at);
      console.error('meta_sync_failure', { campaign_id: campaign.id, type: failure.type, stage: failure.stage, retryable: failure.retryable, upstream_status: failure.upstreamStatus, meta_code: failure.metaCode, meta_subcode: failure.metaSubcode, partial, completed_campaigns: failure.completedCampaigns, total_campaigns: failure.totalCampaigns, duration_ms: Date.now() - Date.parse(syncStarted) });
      return reply({ error, type: failure.type, stage: failure.stage, retryable: failure.retryable, outcome: partial ? 'partial_failure' : 'failure' }, failureStatus(failure.type));
    }
  } catch { return reply({ error: 'Meta 동기화 요청을 확인해 주세요.' }, 400); }
}
