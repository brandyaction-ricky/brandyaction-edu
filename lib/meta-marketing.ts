import { parseMetaCampaignIds } from './meta-campaign-settings';

type MetaPage<T> = { data?: T[]; paging?: { next?: string }; error?: MetaApiError };
type MetaApiError = { message?: string; code?: number; error_subcode?: number; is_transient?: boolean };
type ActionStat = { action_type: string; value: string };
type MetaInsight = { date_start: string; campaign_id: string; campaign_name?: string; adset_id: string; adset_name?: string; ad_id: string; ad_name?: string; impressions?: string; spend?: string; actions?: ActionStat[]; cost_per_action_type?: ActionStat[] };
type MetaAd = { id: string; name?: string; creative?: { id?: string } };
export type MetaFailureType = 'authentication' | 'token_expired' | 'permission' | 'invalid_account' | 'invalid_campaign' | 'rate_limit' | 'temporary' | 'timeout' | 'invalid_response' | 'paging_limit';
export type MetaFailureStage = 'campaign_identity' | 'ads' | 'insights';
const GRAPH_HOST = 'graph.facebook.com', RETRY_DELAYS = [250, 750];

export class MetaSyncError extends Error {
  completedCampaigns = 0; totalCampaigns = 1;
  constructor(public type: MetaFailureType, public stage: MetaFailureStage, public retryable: boolean, public upstreamStatus: number | null, public metaCode: number | null, public metaSubcode: number | null) {
    super(`META_SYNC_${type.toUpperCase()}`); this.name = 'MetaSyncError';
  }
}
export function metaActionValue(rows: ActionStat[] | undefined, action: string) {
  const exact = rows?.find(row => row.action_type === action), compatible = exact || rows?.find(row => row.action_type.endsWith(action));
  const value = Number(compatible?.value); return Number.isFinite(value) && value >= 0 ? value : null;
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function classify(error: MetaApiError | undefined, stage: MetaFailureStage, status: number) {
  const code = Number.isInteger(error?.code) ? error!.code! : null, subcode = Number.isInteger(error?.error_subcode) ? error!.error_subcode! : null;
  const message = (error?.message || '').toLowerCase();
  if (code === 190 && (subcode === 463 || subcode === 467 || message.includes('expired'))) return new MetaSyncError('token_expired', stage, false, status, code, subcode);
  if (code === 190 || status === 401) return new MetaSyncError('authentication', stage, false, status, code, subcode);
  if (code === 10 || code === 200 || status === 403) return new MetaSyncError('permission', stage, false, status, code, subcode);
  if (code === 17 || code === 32 || code === 613 || status === 429) return new MetaSyncError('rate_limit', stage, true, status, code, subcode);
  if (error?.is_transient || code === 1 || code === 2 || status >= 500) return new MetaSyncError('temporary', stage, true, status, code, subcode);
  return new MetaSyncError(stage === 'campaign_identity' ? 'invalid_campaign' : 'invalid_response', stage, false, status, code, subcode);
}
async function graphRequest<T>(url: URL, token: string, stage: MetaFailureStage): Promise<MetaPage<T>> {
  for (let attempt = 0; ; attempt += 1) {
    const target = new URL(url); target.searchParams.set('access_token', token);
    try {
      const response = await fetch(target, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const text = await response.text(); let body: MetaPage<T>;
      try { body = text ? JSON.parse(text) as MetaPage<T> : {}; } catch { throw new MetaSyncError('invalid_response', stage, false, response.status, null, null); }
      if (!response.ok || body.error) {
        const failure = classify(body.error, stage, response.status);
        if (failure.retryable && attempt < RETRY_DELAYS.length) { await pause(RETRY_DELAYS[attempt]); continue; }
        throw failure;
      }
      return body;
    } catch (error) {
      if (error instanceof MetaSyncError) throw error;
      const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const failure = new MetaSyncError(timeout ? 'timeout' : 'temporary', stage, true, null, null, null);
      if (attempt < RETRY_DELAYS.length) { await pause(RETRY_DELAYS[attempt]); continue; }
      throw failure;
    }
  }
}
async function graphPages<T>(url: URL, token: string, stage: MetaFailureStage) {
  const rows: T[] = []; let next: string | null = url.toString();
  for (let page = 0; next && page < 50; page += 1) {
    const target: URL = new URL(next);
    if (target.hostname !== GRAPH_HOST || target.protocol !== 'https:') throw new MetaSyncError('invalid_response', stage, false, null, null, null);
    const body: MetaPage<T> = await graphRequest<T>(target, token, stage); rows.push(...(body.data || [])); next = body.paging?.next || null;
  }
  if (next) throw new MetaSyncError('paging_limit', stage, false, null, null, null); return rows;
}

export async function fetchMetaCampaign(input: { version: string; token: string; accountId: string; campaignId: string; startDay: string; endDay: string }) {
  if (!/^v\d+\.\d+$/.test(input.version)) throw new MetaSyncError('invalid_response', 'campaign_identity', false, null, null, null);
  const base = `https://${GRAPH_HOST}/${input.version}`;
  const identityUrl = new URL(`${base}/${input.campaignId}`); identityUrl.searchParams.set('fields', 'id,account_id,name');
  const identity = await graphRequest<never>(identityUrl, input.token, 'campaign_identity') as { id?: string; account_id?: string; name?: string };
  if (identity.id !== input.campaignId) throw new MetaSyncError('invalid_campaign', 'campaign_identity', false, null, null, null);
  if (`act_${identity.account_id}` !== input.accountId) throw new MetaSyncError('invalid_account', 'campaign_identity', false, null, null, null);
  const adsUrl = new URL(`${base}/${input.campaignId}/ads`); adsUrl.searchParams.set('fields', 'id,name,adset_id,creative{id}'); adsUrl.searchParams.set('limit', '500');
  const ads = await graphPages<MetaAd>(adsUrl, input.token, 'ads'), adsById = new Map(ads.map(ad => [ad.id, ad]));
  const insightsUrl = new URL(`${base}/${input.campaignId}/insights`);
  insightsUrl.searchParams.set('fields', 'date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,spend,actions,cost_per_action_type');
  insightsUrl.searchParams.set('level', 'ad'); insightsUrl.searchParams.set('time_increment', '1'); insightsUrl.searchParams.set('limit', '500');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since: input.startDay, until: input.endDay }));
  const insights = await graphPages<MetaInsight>(insightsUrl, input.token, 'insights');
  return insights.map(row => {
    if (row.campaign_id !== input.campaignId) throw new MetaSyncError('invalid_campaign', 'insights', false, null, null, null);
    const ad = adsById.get(row.ad_id), linkClicks = metaActionValue(row.actions, 'link_click') || 0, registrations = metaActionValue(row.actions, 'complete_registration') || 0;
    return { day: row.date_start, campaign_name: row.campaign_name || identity.name || input.campaignId, adset_name: row.adset_name || row.adset_id,
      creative_name: row.ad_name || ad?.name || row.ad_id, meta_campaign_id: row.campaign_id, meta_adset_id: row.adset_id, meta_ad_id: row.ad_id,
      meta_creative_id: ad?.creative?.id || null, impressions: Math.max(0, Number(row.impressions || 0)), link_clicks: Math.max(0, linkClicks),
      spend: Math.max(0, Number(row.spend || 0)), registrations: Math.max(0, registrations), registration_cost: metaActionValue(row.cost_per_action_type, 'complete_registration') };
  });
}

export async function fetchMetaCampaigns(input: Omit<Parameters<typeof fetchMetaCampaign>[0], 'campaignId'> & { campaignIds: string[] }) {
  const ids = parseMetaCampaignIds(input.campaignIds), rows: Awaited<ReturnType<typeof fetchMetaCampaign>> = [];
  for (let index = 0; index < ids.length; index += 1) {
    try { rows.push(...await fetchMetaCampaign({ ...input, campaignId: ids[index] })); }
    catch (error) { if (error instanceof MetaSyncError) { error.completedCampaigns = index; error.totalCampaigns = ids.length; } throw error; }
  }
  return rows;
}
