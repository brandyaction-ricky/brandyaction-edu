import { parseMetaCampaignIds } from './meta-campaign-settings';

type MetaPage<T> = { data?: T[]; paging?: { next?: string } };
type MetaInsight = { date_start: string; campaign_id: string; campaign_name?: string; adset_id: string; adset_name?: string; ad_id: string; ad_name?: string; impressions?: string; spend?: string; actions?: { action_type: string; value: string }[] };
type MetaAd = { id: string; name?: string; adset_id?: string; creative?: { id?: string } };
const GRAPH_HOST = 'graph.facebook.com';

async function graphPages<T>(url: URL, token: string) {
  const rows: T[] = [];
  let next: string | null = url.toString();
  for (let page = 0; next && page < 100; page += 1) {
    const target = new URL(next);
    if (target.hostname !== GRAPH_HOST || target.protocol !== 'https:') throw Error('META_INVALID_PAGING_URL');
    target.searchParams.set('access_token', token);
    const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(25000) });
    const body = await response.json() as MetaPage<T> & { error?: { message?: string } };
    if (!response.ok || body.error) throw Error('META_API_FAILED');
    rows.push(...(body.data || []));
    next = body.paging?.next || null;
  }
  if (next) throw Error('META_PAGING_LIMIT');
  return rows;
}

export async function fetchMetaCampaign(input: { version: string; token: string; accountId: string; campaignId: string; startDay: string; endDay: string }) {
  if (!/^v\d+\.\d+$/.test(input.version)) throw Error('META_VERSION_REQUIRED');
  const base = `https://${GRAPH_HOST}/${input.version}`;
  const identityUrl = new URL(`${base}/${input.campaignId}`);
  identityUrl.searchParams.set('fields', 'id,account_id,name');
  identityUrl.searchParams.set('access_token', input.token);
  const identityResponse = await fetch(identityUrl, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const identity = await identityResponse.json() as { id?: string; account_id?: string; name?: string; error?: unknown };
  if (!identityResponse.ok || identity.error || identity.id !== input.campaignId || `act_${identity.account_id}` !== input.accountId) throw Error('META_CAMPAIGN_MISMATCH');

  const adsUrl = new URL(`${base}/${input.campaignId}/ads`);
  adsUrl.searchParams.set('fields', 'id,name,adset_id,creative{id}');
  adsUrl.searchParams.set('limit', '500');
  const ads = await graphPages<MetaAd>(adsUrl, input.token);
  const adsById = new Map(ads.map(ad => [ad.id, ad]));

  const insightsUrl = new URL(`${base}/${input.campaignId}/insights`);
  insightsUrl.searchParams.set('fields', 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,spend,actions');
  insightsUrl.searchParams.set('level', 'ad');
  insightsUrl.searchParams.set('time_increment', '1');
  insightsUrl.searchParams.set('limit', '500');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: input.startDay, until: input.endDay }));
  const insights = await graphPages<MetaInsight>(insightsUrl, input.token);
  return insights.map(row => {
    if (row.campaign_id !== input.campaignId) throw Error('META_CAMPAIGN_MISMATCH');
    const ad = adsById.get(row.ad_id);
    const linkClicks = (row.actions || []).filter(action => action.action_type === 'link_click').reduce((sum, action) => sum + Number(action.value || 0), 0);
    return {
      day: row.date_start, campaign_name: row.campaign_name || identity.name || input.campaignId,
      adset_name: row.adset_name || row.adset_id, creative_name: row.ad_name || ad?.name || row.ad_id,
      meta_campaign_id: row.campaign_id, meta_adset_id: row.adset_id, meta_ad_id: row.ad_id,
      meta_creative_id: ad?.creative?.id || null, impressions: Math.max(0, Number(row.impressions || 0)),
      link_clicks: Math.max(0, linkClicks), spend: Math.max(0, Number(row.spend || 0)),
    };
  });
}

export async function fetchMetaCampaigns(input: Omit<Parameters<typeof fetchMetaCampaign>[0], 'campaignId'> & { campaignIds: string[] }) {
  const rows: Awaited<ReturnType<typeof fetchMetaCampaign>> = [];
  // Finish every campaign before the caller writes anything. A failed campaign
  // must not present a partial total as a successful synchronization.
  for (const campaignId of parseMetaCampaignIds(input.campaignIds)) {
    rows.push(...await fetchMetaCampaign({ ...input, campaignId }));
  }
  return rows;
}
