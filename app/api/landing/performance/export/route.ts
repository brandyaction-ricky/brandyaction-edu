import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { validId } from '@/lib/landing';
import { displayDimension, filterValues, validateDashboardRange, type PerformanceCampaign } from '@/lib/landing-performance';
import { exportWindows, registrationCost } from '@/lib/landing-campaign-management';

export const maxDuration = 60;

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"','""')}"`;
export async function GET(request: Request) {
  if (!await getOperatorUser('marketing')) return Response.json({ error: '마케팅 관리 권한이 필요합니다.' }, { status: 403 });
  const params = new URL(request.url).searchParams, campaignId = params.get('campaign');
  if (!validId(campaignId)) return Response.json({ error: '캠페인을 선택해 주세요.' }, { status: 400 });
  const db = createAdminClient();
  const found = await db.from('landing_campaigns').select('*,landing_configs!inner(id,courses!inner(title))').eq('id', campaignId).maybeSingle();
  if (found.error || !found.data) return Response.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  try {
    const campaign = found.data as unknown as PerformanceCampaign & { landing_configs: { courses: { title: string } } };
    const range = validateDashboardRange(params.get('start'), params.get('end'), campaign);
    const nullable = (key: string) => { const values = filterValues(params,key); return values.length ? values : null; };
    const layouts = nullable('layout')?.map(Number).filter(Number.isInteger) || null;
    const rows: Record<string, unknown>[] = [];
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
    for (const window of exportWindows(range.startDay, range.endDay)) {
      const result = await db.rpc('edu_marketing_export', { p_campaign: campaignId,p_start:window.startDay,p_end:window.endDay,
        p_campaigns:nullable('utm_campaign'),p_ad_types:nullable('ad_type'),p_adsets:nullable('adset'),p_creatives:nullable('creative'),p_devices:nullable('device'),p_layouts:layouts }).abortSignal(signal);
      if (result.error) throw Error('CSV 데이터를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
      rows.push(...(result.data || []));
      if (rows.length > 25000) throw Error('CSV가 너무 큽니다. 기간이나 소재를 나눠 주세요.');
    }
    if (!rows.length) return Response.json({ error: '내보낼 데이터가 없습니다.' }, { status: 404 });
    const headers = ['날짜','광고 유형','캠페인','광고세트','소재','기기','레이아웃 버전','방문','고유 방문자','CTA 클릭 세션','CTA 클릭 횟수','CTA 전환율','평균 스크롤','평균 체류','Meta 노출','Meta 링크 클릭','Meta 랜딩 조회','광고비','등록 결과 상태','Meta 등록완료','등록당 비용','비용 계산 기준'];
    const registrationState = (row: Record<string, unknown>) => row.registration_available === true ? Number(row.registrations) === 0 ? '수집 · 0건' : '수집' : row.registration_available === false ? '미수집' : '기존 기록 · 확인 필요';
    const body = rows.map(row => [row.day,row.ad_type === 'cold'?'콜드':row.ad_type === 'retarget'?'리타겟':'미분류',displayDimension(String(row.campaign||'')),displayDimension(String(row.adset||'')),displayDimension(String(row.creative||'')),row.device,row.layout_ver,row.sessions,row.visitors,row.cta_click_sessions,row.cta_clicks,Number(row.sessions)>0?(Number(row.cta_click_sessions)/Number(row.sessions)*100).toFixed(1)+'%':'0%',row.avg_scroll_depth,row.avg_dwell_ms,row.impressions,row.link_clicks,row.landing_page_view_available === true ? row.landing_page_views : row.landing_page_view_available === false ? '미수집' : '확인 필요',row.spend,registrationState(row),row.registration_available === true ? row.registrations : row.registration_available === false ? '미수집' : '확인 필요',row.registration_available === true ? Number(row.registrations) > 0 ? Math.round(registrationCost({ spend: Number(row.spend), registrations: Number(row.registrations), registration_available: true, registration_cost: row.registration_cost == null ? null : Number(row.registration_cost) })!) : '계산 불가' : row.registration_available === false ? '미수집' : '확인 필요',row.registration_available === true && Number(row.registrations) > 0 ? row.registration_cost == null ? '광고비 ÷ 등록완료' : 'Meta 원본' : '—'].map(csvCell).join(','));
    const safe = (campaign.landing_configs.courses.title+'-'+campaign.name).replace(/[^0-9A-Za-z가-힣_-]+/g,'-').slice(0,80);
    return new Response('\ufeff'+[headers.map(csvCell).join(','),...body].join('\r\n'), { headers: { 'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`${safe}-${range.startDay}-${range.endDay}.csv`)}`,'Cache-Control':'private, no-store' } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'CSV 내보내기에 실패했습니다.' }, { status: 400 }); }
}
