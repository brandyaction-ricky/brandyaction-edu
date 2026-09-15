import { metaCampaignIds, normalizeMetaAccountId, parseMetaCampaignIds } from '@/lib/meta-campaign-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { filterValues, parsePartialActual, validateDashboardRange, validDay, type PerformanceCampaign } from '@/lib/landing-performance';
import { performanceUiDetails } from '@/lib/landing-performance-ui-server';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const sameOrigin = (request: Request) => request.headers.get('origin') === new URL(request.url).origin;
const nullable = <T,>(values: T[]) => values.length ? values : null;

async function commonMetaAccountId(db: ReturnType<typeof createAdminClient>) {
  const result = await db.from('site_settings').select('value').eq('key', 'edu_meta_marketing').maybeSingle();
  if (result.error) throw Error('Meta 공통 설정을 확인하지 못했습니다.');
  const account = result.data?.value && typeof result.data.value === 'object' ? String((result.data.value as Record<string,unknown>).adAccountId || '').trim() : '';
  return account ? normalizeMetaAccountId(account) : '';
}

async function campaignFor(db: ReturnType<typeof createAdminClient>, id: string) {
  const result = await db.from('landing_campaigns').select('*').eq('id', id).maybeSingle();
  if (result.error) throw Error('캠페인을 확인하지 못했습니다.');
  return result.data as PerformanceCampaign | null;
}

export async function GET(request: Request) {
  const user = await getOperatorUser('marketing');
  if (!user) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
  const params = new URL(request.url).searchParams;
  const landingId = params.get('landing');
  const campaignId = params.get('campaign');
  try {
    const db = createAdminClient();
    if (!landingId && !campaignId) {
      const [courses, configs, campaigns] = await Promise.all([
        db.from('courses').select('id,title,slug,status,category').eq('category', 'free').is('archived_at', null).order('created_at', { ascending: false }),
        db.from('landing_configs').select('id,enabled,layout_ver'),
        db.from('landing_campaigns').select('*').order('start_day', { ascending: false }),
      ]);
      if (courses.error || configs.error || campaigns.error) throw Error('무료클래스와 캠페인 목록을 불러오지 못했습니다.');
      return reply({ can_manage_campaign: user.role === 'admin', courses: (courses.data || []).map(course => {
        const config = configs.data?.find(value => value.id === course.id);
        return { ...course, tracking: !config?.layout_ver ? 'not_configured' : config.enabled ? 'active' : 'paused', campaigns: (campaigns.data?.filter(value => value.landing_id === course.id) || []) };
      }) });
    }
    if (!validId(landingId) || !validId(campaignId)) return reply({ error: '무료클래스와 캠페인을 선택해 주세요.' }, 400);
    const campaign = await campaignFor(db, campaignId);
    if (!campaign || campaign.landing_id !== landingId) return reply({ error: '선택한 클래스의 캠페인이 아닙니다.' }, 404);
    const range = validateDashboardRange(params.get('start'), params.get('end'), campaign);
    const compareStart = params.get('compare_start'), compareEnd = params.get('compare_end');
    if ((compareStart || compareEnd) && (!validDay(compareStart) || !validDay(compareEnd) || Date.parse(compareEnd) < Date.parse(compareStart) || Date.parse(compareEnd) - Date.parse(compareStart) !== Date.parse(range.endDay) - Date.parse(range.startDay))) {
      return reply({ error: '비교 기간은 조회 기간과 같은 길이로 선택해 주세요.' }, 400);
    }
    const [rpc, ui] = await Promise.all([db.rpc('edu_marketing_dashboard', {
      p_campaign: campaignId, p_b_start: range.startDay, p_b_end: range.endDay,
      p_a_start: compareStart || null, p_a_end: compareEnd || null,
      p_campaigns: nullable(filterValues(params, 'utm_campaign')), p_ad_types: nullable(filterValues(params, 'ad_type')),
      p_adsets: nullable(filterValues(params, 'adset')), p_creatives: nullable(filterValues(params, 'creative')),
      p_devices: nullable(filterValues(params, 'device')), p_layouts: nullable(filterValues(params, 'layout').map(Number).filter(Number.isInteger)),
    }), params.get('include') === 'ui' ? performanceUiDetails(db, campaign, params, request.signal) : Promise.resolve(undefined)]);
    if (rpc.error) throw Error('성과 데이터를 불러오지 못했습니다.');
    if (!rpc.data) return reply({ error: '캠페인 범위 안에서 조회해 주세요.' }, 400);
    const performance = Array.isArray(rpc.data.performance) ? rpc.data.performance as { adset?: unknown; creative?: unknown }[] : [];
    const observed = performance.map(row => ({ campaign_id: campaign.id, adset_key: String(row.adset || '').slice(0,250), creative_key: String(row.creative || '').slice(0,250), ad_type: 'unclassified', updated_at: new Date().toISOString() }));
    if (observed.length) await db.from('landing_campaign_dimensions').upsert(observed, { onConflict: 'campaign_id,adset_key,creative_key', ignoreDuplicates: true });
    return reply({ ...rpc.data, ...(ui ? { ui } : {}), campaign, range: { startDay: range.startDay, endDay: range.endDay, compareStartDay: compareStart || null, compareEndDay: compareEnd || null } });
  } catch (error) { const message=error instanceof Error?error.message:'조회에 실패했습니다.';return reply({ error: message }, /날짜|기간|선택/.test(message)?400:503); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  const user = await getOperatorUser('marketing');
  if (!user) return reply({ error: '마케팅 관리 권한이 필요합니다.' }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 50000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!validId(body.campaign_id)) return reply({ error: '캠페인을 선택해 주세요.' }, 400);
    const db = createAdminClient();
    const campaign = await campaignFor(db, body.campaign_id);
    if (!campaign) return reply({ error: '캠페인을 찾을 수 없습니다.' }, 404);
    if (body.action === 'actual') {
      const parsed = parsePartialActual(body.values);
      const result = await db.rpc('edu_upsert_campaign_actual', { p_campaign: campaign.id, p_day: parsed.day, p_values: parsed.values, p_clear: parsed.clear, p_actor: user.id });
      if (result.error) throw Error(result.error.message.includes('INVALID_CAMPAIGN_DAY') ? '캠페인 기간 안의 날짜를 선택해 주세요.' : '실측값을 저장하지 못했습니다.');
      return reply({ ok: true, actual: result.data });
    }
    if (body.action === 'campaign') {
      if (user.role !== 'admin') return reply({ error: '캠페인 설정은 관리자만 변경할 수 있습니다.' }, 403);
      const values = body.values && typeof body.values === 'object' ? body.values as Record<string, unknown> : {};
      const start = String(values.start_day || ''), end = String(values.end_day || '');
      if (!validDay(start) || !validDay(end) || end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 3660) throw Error('캠페인 기간을 확인해 주세요.');
      const newPrice = Number(values.new_customer_price), existingPrice = Number(values.existing_customer_price);
      const livePeak = values.live_peak === '' || values.live_peak === null ? null : Number(values.live_peak);
      if (![newPrice,existingPrice].every(value => Number.isInteger(value) && value >= 0) || (livePeak !== null && (!Number.isInteger(livePeak) || livePeak < 0))) throw Error('가격과 최대 동시시청 값을 확인해 주세요.');
      const account = normalizeMetaAccountId('meta_ad_account_id' in values ? values.meta_ad_account_id : campaign.meta_ad_account_id || await commonMetaAccountId(db));
      const metaIds = 'meta_campaign_ids' in values ? parseMetaCampaignIds(values.meta_campaign_ids) : 'meta_campaign_id' in values ? parseMetaCampaignIds(values.meta_campaign_id) : metaCampaignIds(campaign);
      const connectionChanged = account !== (campaign.meta_ad_account_id || '') || JSON.stringify(metaIds) !== JSON.stringify(metaCampaignIds(campaign));
      const syncStatus = !account || !metaIds.length ? 'not_configured' : connectionChanged || campaign.meta_sync_status === 'not_configured' ? 'idle' : campaign.meta_sync_status;
      const result = await db.from('landing_campaigns').update({
        name: String(values.name || campaign.name).trim().slice(0,200), utm_campaign: String(values.utm_campaign || campaign.utm_campaign).trim().slice(0,250),
        start_day: start, end_day: end, new_customer_price: newPrice, existing_customer_price: existingPrice, live_peak: livePeak,
        meta_ad_account_id: account || null, meta_campaign_id: metaIds[0] || null, meta_campaign_ids: metaIds,
        meta_sync_status: syncStatus, meta_sync_error: connectionChanged ? null : campaign.meta_sync_error, updated_by: user.id, updated_at: new Date().toISOString(),
      }).eq('id', campaign.id).select('*').single();
      if (result.error) throw Error('캠페인 설정을 저장하지 못했습니다.');
      return reply({ ok: true, campaign: result.data });
    }
    if (body.action === 'classification') {
      const adType = String(body.ad_type || '');
      if (!['cold','retarget','unclassified'].includes(adType)) throw Error('광고 유형을 선택해 주세요.');
      const result = await db.from('landing_campaign_dimensions').upsert({ campaign_id: campaign.id, adset_key: String(body.adset || '').slice(0,250), creative_key: String(body.creative || '').slice(0,250), ad_type: adType, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'campaign_id,adset_key,creative_key' });
      if (result.error) throw Error('광고 유형을 저장하지 못했습니다.');
      return reply({ ok: true });
    }
    return reply({ error: '요청을 확인해 주세요.' }, 400);
  } catch (error) { return reply({ error: error instanceof Error ? error.message : '저장에 실패했습니다.' }, 400); }
}
