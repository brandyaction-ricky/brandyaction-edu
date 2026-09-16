'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { delta, displayDimension, rate, type DashboardReport } from '@/lib/landing-performance';
import { count, money, signed, kstTime } from '@/lib/landing-admin-state';
import { AdminButton, AdminDataTable, AdminMetric, AdminMetricGrid, AdminSection, AdminStatusBadge } from '@/app/ui/final/admin-system';
import { CompactEmpty, InlineError } from './tracking-controls';
import { DEFAULT_SAMPLE_MIN, funnelRate, parseSampleMin, sortPerformance, type SortKey } from '@/lib/landing-operations-phase1';
import { metaCampaignIds } from '@/lib/meta-campaign-settings';
import { AdTypeControl, type Classify } from './ad-type-control';
export { sortPerformance } from '@/lib/landing-operations-phase1';

function Compare({ current, previous, hasData, unit = '' }: { current: number; previous?: number; hasData: boolean; unit?: string }) {
  if (previous === undefined) return null;
  const change = delta(current, previous, hasData);
  const amountUnit = unit === '%' ? '%p' : unit;
  return <small className="tracking-comparison">{!change ? '비교 못함' : <>A {count(previous)}{unit} → B {count(current)}{unit}<br/>{signed(change.amount)}{amountUnit} · {change.rate === null ? '증감률 계산 불가' : `${signed(change.rate)}%`}</>}</small>;
}
export function OperationsSummary({ report, collection = false }: { report: DashboardReport; collection?: boolean }) {
  const summary = report.campaign_summary, presence = report.ui?.actual_presence;
  const newCount = presence ? presence.new_payments ? summary.new_payments : null : report.ui ? null : summary.new_payments;
  const existingCount = presence ? presence.existing_payments ? summary.existing_payments : null : report.ui ? null : summary.existing_payments;
  const values = [
    ['현재 카카오톡방 인원', count(summary.kakao_members) + (summary.kakao_members == null ? '' : '명')],
    ['직전 기록 대비', signed(summary.kakao_delta) + (summary.kakao_delta == null ? '' : '명')],
    ['누적 신규 결제', count(newCount) + (newCount == null ? '' : '건')],
    ['누적 기존 결제', count(existingCount) + (existingCount == null ? '' : '건')],
    [collection ? '라이브 최대 동시시청' : '누적 매출', collection ? count(summary.live_peak) + (summary.live_peak == null ? '' : '명') : money(newCount == null && existingCount == null ? null : summary.revenue)],
    [collection ? '마지막 데이터 수집' : '라이브 최대 동시시청', collection ? kstTime(report.ui?.last_collected_at) : count(summary.live_peak) + (summary.live_peak == null ? '' : '명')],
    ['CAC', summary.new_payments + summary.existing_payments > 0 ? money(summary.spend / (summary.new_payments + summary.existing_payments)) : '—'],
    ['동시시청당 광고비', summary.live_peak && summary.spend > 0 ? money(summary.spend / summary.live_peak) : '—'],
  ];
  return <dl className="tracking-ops-strip">{values.map(([label, value]) => <div key={label} title={label === '마지막 데이터 수집' ? '현재 기간·필터에 해당하는 방문 세션의 마지막 수집 시각 (KST)' : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
const SERIES = [
  { key: 'sessions', label: '방문', color: '#2563eb' },
  { key: 'visitors', label: '고유 방문자', color: '#15803d' },
  { key: 'cta_click_sessions', label: 'CTA 클릭 세션', color: '#7c3aed' },
  { key: 'cta_clicks', label: 'CTA 클릭 횟수', color: '#b45309' },
] as const;
type SeriesKey = typeof SERIES[number]['key'];
const dayIndex = (day: string, start: string) => Math.round((Date.parse(day) - Date.parse(start)) / 86400000);
export function TrendChart({ report, compare, onRetry }: { report: DashboardReport; compare: boolean; onRetry?: () => void }) {
  const [shown, setShown] = useState<SeriesKey[]>(SERIES.map(item => item.key));
  const [point, setPoint] = useState<{ period: string; day: string } | null>(null);
  const a = report.ui?.daily_a || [], b = report.daily;
  const active = SERIES.filter(series => shown.includes(series.key));
  const periods = [{ label: 'B · 최근 기간', key: 'B', rows: b, start: report.range.startDay }, ...(compare ? [{ label: 'A · 예전 기간', key: 'A', rows: a, start: report.range.compareStartDay || report.range.startDay }] : [])];
  const max = Math.max(1, ...[...b, ...a].flatMap(row => active.map(series => Number(row[series.key]))));
  const length = Math.max(1, dayIndex(report.range.endDay, report.range.startDay));
  const x = (day: string, start: string) => 48 + dayIndex(day, start) / length * 784;
  const y = (value: number) => 202 - value / max * 170;
  const selected = periods.find(period => period.key === point?.period)?.rows.find(row => row.day === point?.day);
  const indices = [...new Set(periods.flatMap(period => period.rows.map(row => dayIndex(row.day, period.start))))].sort((a, b) => a - b);
  const indexed = periods.map(period => new Map(period.rows.map(row => [dayIndex(row.day, period.start), row])));
  return <AdminSection bordered title="일별 방문·전환 추이" description={`KST · ${report.range.startDay} — ${report.range.endDay}`}>
    <div className="tracking-chart-toggles" role="group" aria-label="차트 표시 지표">{SERIES.map(series => <AdminButton size="sm" type="button" key={series.key} aria-pressed={shown.includes(series.key)} onClick={() => setShown(values => values.includes(series.key) ? values.filter(key => key !== series.key) : [...values, series.key])}><i style={{ background: series.color }}/>{series.label}</AdminButton>)}</div>
    {compare && <p className="tracking-help">B · 최근 기간: 실선 / A · 예전 기간: 점선 · 기간 시작일부터 같은 순서로 비교합니다.</p>}
    {compare && report.ui?.errors.trend && <InlineError onRetry={onRetry}>{report.ui.errors.trend}</InlineError>}
    {compare && !report.ui?.errors.trend && !a.length && <p className="tracking-help">이전 기간 방문 데이터가 없어 추이 비교를 할 수 없습니다.</p>}
    {!b.length && !a.length ? <CompactEmpty title="방문 데이터가 없습니다." action={<Link className="admin-button admin-button--tertiary" href="/admin/settings">운영·트래킹 설정 확인</Link>}>기간을 변경하거나 무료클래스의 트래킹 설정을 확인해 주세요.</CompactEmpty> : <>
      {!active.length ? <CompactEmpty title="표시할 지표를 선택해 주세요.">차트 위의 지표 버튼을 켜면 추이를 볼 수 있습니다.</CompactEmpty> : <div className="tracking-chart"><svg viewBox="0 0 880 240" role="img" aria-label="기간별 방문 및 CTA 전환 추이"><text x="12" y="22">{count(max)}</text>{[32, 117, 202].map(value => <line key={value} x1="48" x2="832" y1={value} y2={value} stroke="#e5e7eb"/>)}
        {periods.map(period => <g key={period.key}>{active.map(series => <g key={series.key}><polyline fill="none" stroke={series.color} strokeWidth="2" strokeDasharray={period.key === 'A' ? '5 5' : undefined} points={period.rows.map(row => `${x(row.day, period.start)},${y(row[series.key])}`).join(' ')}/>{period.rows.map(row => <circle key={row.day} cx={x(row.day, period.start)} cy={y(row[series.key])} r="4" fill={period.key === 'A' ? '#fff' : series.color} stroke={series.color} onMouseEnter={() => setPoint({ period: period.key, day: row.day })} onFocus={() => setPoint({ period: period.key, day: row.day })} tabIndex={0} aria-label={`${period.label} ${row.day} ${series.label} ${row[series.key]}`}><title>{`${period.label} ${row.day} · ${series.label} ${count(row[series.key])}`}</title></circle>)}</g>)}</g>)}
        <text x="48" y="230">{report.range.startDay}</text><text x="832" y="230" textAnchor="end">{report.range.endDay}</text></svg>
        {selected && <p className="tracking-chart-tooltip" role="status">{point?.period} · {selected.day}　{active.map(series => `${series.label} ${count(selected[series.key])}`).join(' / ')}</p>}
      </div>}
      <details className="tracking-chart-data"><summary>정확한 수치 보기</summary><AdminDataTable label="방문 추이 상세 수치"><thead><tr><th scope="col">기간</th><th scope="col">날짜</th>{SERIES.map(series => <th scope="col" data-align="number" key={series.key}>{series.label}</th>)}</tr></thead><tbody>{indices.flatMap(index => periods.map((period, periodIndex) => { const row = indexed[periodIndex].get(index); return <tr key={`${index}-${period.key}`}><th scope="row">{period.label}</th><td>{row?.day || '—'}</td>{SERIES.map(series => <td data-align="number" key={series.key}>{count(row?.[series.key])}</td>)}</tr>; }))}</tbody></AdminDataTable></details>
    </>}
  </AdminSection>;
}
const columns: [SortKey, string][] = [['adset', '광고세트'], ['creative', '소재'], ['sessions', '방문'], ['visitors', '고유 방문자'], ['cta_click_sessions', 'CTA 클릭 세션'], ['conversion', '방문 전환율'], ['avg_scroll_depth', '평균 스크롤'], ['avg_dwell_ms', '평균 체류'], ['spend', '광고비'], ['ctr', 'Meta CTR'], ['registrations', '등록완료'], ['registration_cost', '등록완료 결과당 비용']];
export function PerformanceTable({ report, onClassify, pending = false, sampleMin = String(DEFAULT_SAMPLE_MIN), onSampleMin }: { report: DashboardReport; onClassify: Classify; pending?: boolean; sampleMin?: string; onSampleMin?: (value: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'sessions', direction: 'desc' });
  const threshold = parseSampleMin(sampleMin) ?? DEFAULT_SAMPLE_MIN;
  const rows = useMemo(() => sortPerformance(report.performance, sort.key, sort.direction, threshold), [report.performance, sort, threshold]);
  return <AdminSection bordered title="소재별 성과" description={`${count(rows.length)}개 소재 · 열 제목을 눌러 정렬`} className="tracking-performance-section" actions={<label className="tracking-sample-min">표본 기준 · 방문<input className="admin-input" type="number" inputMode="numeric" min="1" max="10000" step="1" value={sampleMin} aria-invalid={parseSampleMin(sampleMin) === null} aria-describedby="tracking-sample-help" onChange={event => onSampleMin?.(event.target.value)}/></label>}>
    <p id="tracking-sample-help" className="tracking-help" role={parseSampleMin(sampleMin) === null ? 'alert' : undefined}>{parseSampleMin(sampleMin) === null ? '1~10,000의 정수를 입력해 주세요. 유효한 값이 입력될 때까지 기본 기준 30회를 사용합니다.' : `방문 ${count(threshold)}회 미만은 표본 부족으로 표시하며 전환율 정렬에서 뒤에 배치합니다. 원본 수치와 CSV는 유지됩니다.`}</p>
    {rows.length ? <AdminDataTable label="소재별 성과표" tableClassName="tracking-performance-table"><thead><tr><th scope="col">광고 유형</th>{columns.map(([key, label]) => <th scope="col" data-align={['adset','creative'].includes(key) ? undefined : 'number'} key={key} aria-sort={sort.key === key ? sort.direction === 'desc' ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => setSort({ key, direction: sort.key === key && sort.direction === 'desc' ? 'asc' : 'desc' })}>{label}{sort.key === key ? sort.direction === 'desc' ? <ArrowDown size={12} aria-hidden="true"/> : <ArrowUp size={12} aria-hidden="true"/> : <ArrowUpDown size={12} aria-hidden="true"/>}</button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={JSON.stringify([row.campaign, row.adset, row.creative])}>
      <td><AdTypeControl key={row.ad_type} row={row} disabled={pending} onSave={onClassify}/></td>
      <th scope="row" className="tracking-identifier"><span tabIndex={0} title={displayDimension(row.adset)}>{displayDimension(row.adset)}</span></th><td className="tracking-identifier"><span tabIndex={0} title={`${displayDimension(row.creative)} · 캠페인: ${displayDimension(row.campaign)}`}>{displayDimension(row.creative)}</span></td>
      <td data-align="number">{count(row.sessions)}</td><td data-align="number">{count(row.visitors)}</td><td data-align="number" title={`전체 클릭 ${count(row.cta_clicks)}회`}>{count(row.cta_click_sessions)}</td><td data-align="number" title={row.sessions ? `CTA 클릭 세션 ${count(row.cta_click_sessions)} ÷ 방문 ${count(row.sessions)} = ${rate(row.cta_click_sessions, row.sessions).toFixed(1)}%` : '분모가 0이므로 계산할 수 없습니다.'}>{row.sessions < threshold ? <span className="tracking-low-sample">표본 부족<small>방문 {count(row.sessions)}회</small></span> : `${rate(row.cta_click_sessions, row.sessions).toFixed(1)}%`}</td><td data-align="number">{row.avg_scroll_depth == null ? '—' : `${count(row.avg_scroll_depth)}%`}</td><td data-align="number">{row.avg_dwell_ms == null ? '—' : `${count(row.avg_dwell_ms / 1000)}초`}</td><td data-align="number">{money(row.spend)}</td><td data-align="number" title={`Meta 노출 ${count(row.impressions)} · Meta 링크 클릭 ${count(row.link_clicks)}`}>{row.impressions ? `${rate(row.link_clicks, row.impressions).toFixed(1)}%` : '계산 불가'}</td><td data-align="number">{count(row.registrations)}</td><td data-align="number" title={row.registration_cost == null && row.registrations > 0 ? '선택 기간의 Meta 결과당 비용 값이 하나로 일치하지 않습니다.' : 'Meta cost_per_action_type 원본값'}>{row.registration_cost == null ? '—' : money(row.registration_cost)}</td>
    </tr>)}</tbody></AdminDataTable> : <CompactEmpty title={report.data_state.sessions_exist ? '조건에 맞는 데이터가 없습니다.' : '선택 기간에 수집된 소재 데이터가 없습니다.'}>{report.data_state.sessions_exist ? '상세 필터를 초기화하거나 조회 기간을 변경해 주세요.' : 'UTM 또는 캠페인 설정의 Meta 연결 상태를 확인해 주세요.'}</CompactEmpty>}</AdminSection>;
}
const percentage = (value: number | null) => value === null ? '계산 불가' : `${value.toFixed(1)}%`;
export function PerformanceDashboard({ report, compare, onClassify, pending, onRetry, filtered = false, sampleMin, onSampleMin }: { report: DashboardReport; compare: boolean; onClassify: Classify; pending?: boolean; onRetry?: () => void; filtered?: boolean; sampleMin?: string; onSampleMin?: (value: string) => void }) {
  const b = report.summary_b, a = report.summary_a, summary = report.campaign_summary;
  const hasVisits = report.data_state.sessions_exist, previousHasVisits = Boolean(a?.sessions);
  const presence = report.ui?.actual_presence, hasPayments = presence ? presence.new_payments || presence.existing_payments : !report.ui;
  const visitorRate = rate(b.converted_visitors, b.visitors), sessionRate = rate(b.cta_click_sessions, b.sessions);
  const actual = report.ui?.period_actuals, kakaoIncrease = actual?.kakao_delta;
  const visits = hasVisits ? b.sessions : null, clicks = hasVisits ? b.cta_click_sessions : null;
  const linked = !!report.campaign.meta_ad_account_id && metaCampaignIds(report.campaign).length > 0;
  const metaValue = (value: number) => report.data_state.meta_exists ? count(value) : linked ? '—' : '연동 전';
  return <div className="tracking-stack">
    <section aria-label="선택 기간 전환 퍼널" className="tracking-funnel">
      <div className="tracking-subsection-head"><h2>전환 퍼널</h2><span className="tracking-help">{report.range.startDay} — {report.range.endDay} · KST</span></div>
      <AdminMetricGrid columns={4}>
        <AdminMetric label="1. 방문" value={count(visits)} note="세션 수 · 재방문 포함" change={compare && <Compare current={b.sessions} previous={a?.sessions} hasData={previousHasVisits}/>}/>
        <AdminMetric label="2. CTA 클릭" value={count(clicks)} note={`방문 → CTA ${percentage(funnelRate(clicks, visits))}`} change={compare && <><Compare current={b.cta_click_sessions} previous={a?.cta_click_sessions} hasData={previousHasVisits} unit="세션"/><Compare current={sessionRate} previous={a ? rate(a.cta_click_sessions, a.sessions) : undefined} hasData={previousHasVisits} unit="%"/></>}/>
        <AdminMetric label="3. 카카오톡방" value={kakaoIncrease == null ? '입력 전' : count(kakaoIncrease)} note={filtered ? '캠페인 전체 실측' : `CTA → 카톡방 ${percentage(funnelRate(kakaoIncrease, clicks))}`} change={<span>{actual?.kakao_day ? `${actual.baseline_day} 자정 대비 ${actual.kakao_day} 자정 증가분` : `${report.range.endDay} 자정 입력 전`}</span>}/>
        <AdminMetric label="4. 결제" value={count(actual?.payments)} note={filtered ? '캠페인 전체 실측' : `카톡방 → 결제 ${percentage(funnelRate(actual?.payments, kakaoIncrease))}`} change={<span>선택 기간 신규·기존 결제 합계</span>}/>
      </AdminMetricGrid>
      <p className="tracking-help">CTA 클릭은 1회 이상 클릭한 세션입니다. 카톡방은 선택 기간 종료일 자정 인원에서 시작일 전날 자정 인원을 뺀 증가분입니다.</p>
      {filtered && <p className="tracking-help" role="status">실측값은 소재·기기 필터가 적용되지 않습니다. 필터 적용 중에는 CTA 이후 실측 전환율을 표시하지 않습니다.</p>}
      {report.ui?.errors.actuals && <InlineError onRetry={onRetry}>{report.ui.errors.actuals}</InlineError>}
    </section>
    <details className="tracking-metric-details"><summary>상세 지표 · Meta 성과 · 누적 성과</summary>
    <AdminMetricGrid columns={8} className="tracking-kpis">
      <AdminMetric label="고유 방문자" value={count(hasVisits ? b.visitors : null)} note="중복 제외" change={compare && <Compare current={b.visitors} previous={a?.visitors} hasData={previousHasVisits}/>}/>
      <AdminMetric label="방문자 CTA 전환율" value={b.visitors ? `${visitorRate.toFixed(1)}%` : hasVisits ? '계산 불가' : '—'} note="전환 방문자 ÷ 고유 방문자" change={compare && <Compare current={visitorRate} previous={a ? rate(a.converted_visitors, a.visitors) : undefined} hasData={previousHasVisits} unit="%"/>}/>
      <AdminMetric label="CTA 클릭 횟수" value={count(hasVisits ? b.cta_clicks : null)} note="기간 내 전체 클릭" change={compare && <Compare current={b.cta_clicks} previous={a?.cta_clicks} hasData={previousHasVisits} unit="회"/>}/>
      <AdminMetric label="광고비" value={report.data_state.meta_exists ? money(b.spend) : metaValue(b.spend)} note="선택 기간 Meta"/>
      <AdminMetric label="Meta 노출" value={metaValue(b.meta_impressions)} note="선택 기간"/>
      <AdminMetric label="Meta 링크 클릭" value={metaValue(b.meta_link_clicks)} note={`Meta CTR ${report.data_state.meta_exists ? percentage(funnelRate(b.meta_link_clicks, b.meta_impressions)) : linked ? '계산 불가' : '연동 전'}`}/>
      <AdminMetric label="누적 매출" value={money(hasPayments ? summary.revenue : null)} note={`신규·기존 결제 ${hasPayments ? count(summary.new_payments + summary.existing_payments) + '건' : '—'}`}/>
      <AdminMetric label="ROAS" value={summary.roas == null ? hasPayments ? '계산 불가' : '—' : `${count(summary.roas)}%`} note={`누적 광고비 ${money(report.campaign.meta_last_synced_at || summary.spend > 0 || report.data_state.meta_exists ? summary.spend : null)}`}/>
    </AdminMetricGrid>
    </details>
    <p className="tracking-help">마지막 데이터 수집: {kstTime(report.ui?.last_collected_at)}</p>
    {report.ui?.errors.collection && <InlineError onRetry={onRetry}>{report.ui.errors.collection}</InlineError>}
    <TopMaterials report={report}/>
    <PerformanceTable report={report} onClassify={onClassify} pending={pending} sampleMin={sampleMin} onSampleMin={onSampleMin}/>
    <TrendChart report={report} compare={compare} onRetry={onRetry}/>
  </div>;
}

export function TopMaterials({ report }: { report: DashboardReport }) {
  const rows = [...report.performance].sort((a, b) => b.cta_click_sessions - a.cta_click_sessions || b.sessions - a.sessions).slice(0, 3);
  return <AdminSection bordered title="가장 많이 데려온 TOP 3" description="CTA 클릭 수 기준">
    {rows.length ? <ol className="tracking-top-materials">{rows.map((row, index) => <li key={JSON.stringify([row.adset,row.creative])}><strong>{index + 1}위</strong><span>{displayDimension(row.creative)}</span><b>{count(row.cta_click_sessions)}건</b></li>)}</ol> : <p className="tracking-help">선택 기간의 소재별 CTA 클릭 데이터가 없습니다.</p>}
  </AdminSection>;
}

type SourceReport = DashboardReport & { source_title: string };
type SourceRow = { label: string; paid: boolean; visits: number; clicks: number; kakao: number | null; payments: number; revenue: number; spend: number };
const sourceRow = (report: SourceReport): SourceRow => ({
  label: report.source_title,
  paid: report.campaign.uses_ads,
  visits: report.summary_b.sessions,
  clicks: report.summary_b.cta_click_sessions,
  kakao: report.ui?.period_actuals?.kakao_delta ?? null,
  payments: report.ui?.period_actuals?.payments ?? 0,
  revenue: report.actuals.reduce((sum, row) => sum + row.revenue, 0),
  spend: report.summary_b.spend,
});
const totalSource = (label: string, paid: boolean, rows: SourceRow[]): SourceRow => ({
  label, paid,
  visits: rows.reduce((sum, row) => sum + row.visits, 0), clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
  kakao: rows.some(row => row.kakao == null) ? null : rows.reduce((sum, row) => sum + (row.kakao || 0), 0),
  payments: rows.reduce((sum, row) => sum + row.payments, 0), revenue: rows.reduce((sum, row) => sum + row.revenue, 0), spend: rows.reduce((sum, row) => sum + row.spend, 0),
});
export function MultiSourceComparison({ reports }: { reports: SourceReport[] }) {
  const items = reports.map(sourceRow), paid = items.filter(row => row.paid), organic = items.filter(row => !row.paid);
  const groups = [{ label: '페이드 소계', paid: true, rows: paid }, { label: '오가닉 소계', paid: false, rows: organic }].filter(group => group.rows.length);
  const total = totalSource('합계', false, items);
  const render = (row: SourceRow, totalRow = false) => <tr key={row.label} className={totalRow ? 'tracking-source-total' : undefined}><th scope="row">{row.label}{!totalRow && <AdminStatusBadge status={row.paid ? 'active' : 'not_configured'} label={row.paid ? '페이드' : '오가닉'}/>}</th><td data-align="number">{count(row.visits)}</td><td data-align="number">{count(row.clicks)}</td><td data-align="number">{count(row.kakao)}</td><td data-align="number">{count(row.payments)}</td><td data-align="number">{money(row.revenue)}</td><td data-align="number">{money(row.spend)}</td><td data-align="number">{row.paid && row.spend > 0 ? `${count(row.revenue / row.spend * 100)}%` : '—'}</td><td data-align="number">{money(row.revenue - row.spend)}</td></tr>;
  return <AdminSection bordered title="유입별 성과 비교" description="선택한 무료클래스의 기간 성과 · KST">
    <AdminDataTable label="유입별 성과 비교표" tableClassName="tracking-source-table"><thead><tr>{['페이지','방문','CTA 클릭','카톡방','결제','매출','광고비','ROAS','광고비 뺀 매출'].map((label,index) => <th scope="col" data-align={index ? 'number' : undefined} key={label}>{label}</th>)}</tr></thead><tbody>{groups.flatMap(group => [...group.rows.map(row => render(row)), render(totalSource(group.label, group.paid, group.rows), true)])}{render(total, true)}</tbody></AdminDataTable>
    <p className="tracking-help">ROAS는 광고 사용으로 표시한 페이드 페이지만 계산합니다. 광고비 뺀 매출은 매출에서 광고비만 차감한 값입니다.</p>
  </AdminSection>;
}
