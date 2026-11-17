import type { createAdminClient } from './supabase/admin';
import type { PerformanceCampaign } from './landing-performance';
import { filterValues } from './landing-performance';
import { metaCampaignIds } from './meta-campaign-settings';
import { aggregateAdDays, type AdTrend, type StoredAdDay } from './landing-ad-trends';

export async function readAdTrend(db: ReturnType<typeof createAdminClient>, campaign: PerformanceCampaign, params: URLSearchParams, signal: AbortSignal): Promise<AdTrend> {
  const empty = { current: [], previous: [] };
  const ids = metaCampaignIds(campaign);
  if (!campaign.uses_ads || !ids.length) return { ...empty, state: 'unlinked' };
  // UTM names may resolve through historical session aliases in the main RPC.
  // Do not silently apply a different filter to supplemental daily totals.
  if (['utm_campaign','ad_type','adset','creative','device','layout'].some(key => filterValues(params, key).length)) return { ...empty, state: 'filtered' };
  try {
    const start = params.get('start')!, end = params.get('end')!;
    const aStart = params.get('compare_start'), aEnd = params.get('compare_end');
    const from = aStart && aStart < start ? aStart : start, to = aEnd && aEnd > end ? aEnd : end;
    const raw: StoredAdDay[] = [];
    const limited = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from('landing_campaign_meta_daily')
        .select('day,spend,impressions,link_clicks,registrations,registration_available')
        .eq('campaign_id', campaign.id).in('meta_campaign_id', ids).gte('day', from).lte('day', to)
        .order('day').order('meta_ad_id').range(offset, offset + 999).abortSignal(limited);
      if (result.error || !Array.isArray(result.data) || raw.length + result.data.length > 50000) throw Error('조회 실패');
      raw.push(...result.data as StoredAdDay[]);
      if (result.data.length < 1000) break;
    }
    const daily = aggregateAdDays(raw);
    return { state: 'ready', current: daily.filter(row => row.day >= start && row.day <= end), previous: aStart && aEnd ? daily.filter(row => row.day >= aStart && row.day <= aEnd) : [] };
  } catch { return { ...empty, state: 'error' }; }
}
