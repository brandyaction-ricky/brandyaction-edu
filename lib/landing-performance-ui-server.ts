import type { createAdminClient } from './supabase/admin';
import { filterValues, type DashboardReport, type PerformanceCampaign } from './landing-performance';
import { kstDate } from './landing';
import { periodActuals } from './landing-operations-phase1';

type Db = ReturnType<typeof createAdminClient>;
type Session = { session_id: string; visitor_id?: string; created_at: string; last_seen_at: string; clicks?: number; attribution: Record<string, string> | null };
type Dimension = { adset_key: string; creative_key: string; ad_type: string };
const tuple = (adset: string, creative: string) => JSON.stringify([adset, creative]);
const PAGE = 1000;
// Bounded supplemental reads never replace the authoritative RPC's totals.
// On timeout/overflow the affected region reports unavailable, never a partial total.
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 100000) {
  const rows: T[] = [];
  for (let offset = 0; offset <= max; offset += PAGE) {
    const result = await read(offset, offset + PAGE - 1);
    if (result.error) throw Error('조회 실패');
    const batch = result.data || [];
    if (rows.length + batch.length > max) throw Error('조회 범위 초과');
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
  throw Error('조회 범위 초과');
}
export function dailySessions(rows: Session[]) {
  const days = new Map<string, { visitors: Set<string>; sessions: number; cta_click_sessions: number; cta_clicks: number }>();
  for (const row of rows) {
    const day = kstDate(row.created_at);
    const value = days.get(day) || { visitors: new Set<string>(), sessions: 0, cta_click_sessions: 0, cta_clicks: 0 };
    value.sessions++;
    if (row.visitor_id) value.visitors.add(row.visitor_id);
    if ((row.clicks || 0) > 0) value.cta_click_sessions++;
    value.cta_clicks += row.clicks || 0;
    days.set(day, value);
  }
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, ...value, visitors: value.visitors.size }));
}
export function filterAdTypes(rows: Session[], dimensions: Dimension[], selected: string[]) {
  if (!selected.length) return rows;
  const types = new Map(dimensions.map(d => [tuple(d.adset_key, d.creative_key), d.ad_type]));
  return rows.filter(row => selected.includes(types.get(tuple(row.attribution?.utm_term || '', row.attribution?.utm_content || '')) || 'unclassified'));
}
export async function performanceUiDetails(db: Db, campaign: PerformanceCampaign, params: URLSearchParams, signal: AbortSignal): Promise<NonNullable<DashboardReport['ui']>> {
  const errors: NonNullable<DashboardReport['ui']>['errors'] = {};
  const limitedSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  const adTypes = filterValues(params, 'ad_type');
  const dimensions = adTypes.length ? pages<Dimension>((from, to) => db.from('landing_campaign_dimensions').select('adset_key,creative_key,ad_type').eq('campaign_id', campaign.id).order('adset_key').order('creative_key').range(from, to).abortSignal(limitedSignal)) : Promise.resolve([] as Dimension[]);
  // PostgREST expression values are quoted, including escaped quotes/backslashes.
  const quote = (value: string) => JSON.stringify(value);
  function sessions(start: string, end: string, columns: string) {
    let query = db.from('funnel_sessions').select(columns).eq('landing_id', campaign.landing_id)
      .gte('created_at', start + 'T00:00:00+09:00').lt('created_at', new Date(Date.parse(end + 'T00:00:00+09:00') + 86400000).toISOString());
    // Match the dashboard/export RPC: all landing traffic unless explicitly filtered.
    for (const [key, column] of [['utm_campaign', 'utm_campaign'], ['adset', 'utm_term'], ['creative', 'utm_content']] as const) {
      const values = filterValues(params, key);
      if (values.length) query = query.in('attribution->>' + column, values);
    }
    const devices = filterValues(params, 'device');
    if (devices.length) query = query.or(devices.map(value => `attribution->>device.eq.${quote(value)}`).concat(devices.includes('unknown') ? ['attribution->>device.is.null', 'attribution->>device.eq.""'] : []).join(','));
    const layouts = filterValues(params, 'layout').map(Number).filter(Number.isInteger);
    if (layouts.length) query = query.in('layout_ver', layouts);
    return query.abortSignal(limitedSignal);
  }
  const trend = async () => {
    if (!params.get('compare_start')) return null;
    try {
      const [rows, types] = await Promise.all([
        pages<Session>((from, to) => sessions(params.get('compare_start')!, params.get('compare_end')!, 'session_id,visitor_id,created_at,last_seen_at,clicks,attribution').order('created_at').order('session_id').range(from, to) as unknown as PromiseLike<{ data: Session[] | null; error: unknown }>), dimensions,
      ]);
      return dailySessions(filterAdTypes(rows, types, adTypes));
    } catch { errors.trend = '이전 기간 추이를 불러오지 못했습니다. 재시도하거나 기간을 줄여 주세요.'; return null; }
  };
  const collection = async () => {
    try {
      const types = await dimensions;
      for (let offset = 0; offset < 100000; offset += PAGE) {
        const result = await sessions(params.get('start')!, params.get('end')!, 'session_id,created_at,last_seen_at,attribution').order('last_seen_at', { ascending: false }).order('session_id').range(offset, offset + (adTypes.length ? PAGE : 1) - 1);
        if (result.error) throw Error();
        const rows = result.data as unknown as Session[];
        const matched = filterAdTypes(rows, types, adTypes)[0];
        if (matched) return matched.last_seen_at;
        if (rows.length < PAGE) return null;
      }
      throw Error();
    } catch { errors.collection = '마지막 수집 시각을 확인하지 못했습니다.'; return null; }
  };
  const actuals = async () => {
    try {
      const rows = await pages<{ day: string; kakao_members: number | null; new_payments: number | null; existing_payments: number | null }>((from, to) => db.from('landing_campaign_actuals').select('day,kakao_members,new_payments,existing_payments').eq('campaign_id', campaign.id).order('day').range(from, to).abortSignal(limitedSignal), 10000);
      const byDay = new Map(rows.map(row => [row.day, row.kakao_members]));
      return { period: periodActuals(rows, params.get('start')!, params.get('end')!), presence: { new_payments: rows.some(row => row.new_payments !== null), existing_payments: rows.some(row => row.existing_payments !== null) }, previous: Object.fromEntries(rows.map(row => [row.day, byDay.get(new Date(Date.parse(row.day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)) ?? null])) };
    } catch { errors.actuals = '실측 입력 여부와 전일 인원을 확인하지 못했습니다.'; return null; }
  };
  const [daily_a, last_collected_at, actual] = await Promise.all([trend(), collection(), actuals()]);
  return { daily_a, last_collected_at, actual_presence: actual?.presence || null, previous_day_members: actual?.previous || {}, period_actuals: actual?.period ?? null, errors };
}
