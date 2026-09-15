'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { delta, displayDimension, rate, type DashboardReport, type PerformanceRow } from '@/lib/landing-performance';
import { count, money, signed, kstTime } from '@/lib/landing-admin-state';
import { AdminButton, AdminDataTable, AdminMetric, AdminMetricGrid, AdminSection } from '@/app/ui/final/admin-system';
import { CompactEmpty, InlineError } from './tracking-controls';

function Compare({ current, previous, hasData, unit = '' }: { current: number; previous?: number; hasData: boolean; unit?: string }) {
  if (previous === undefined) return null;
  const change = delta(current, previous, hasData);
  return <small className="tracking-comparison">{!change ? '비교 못함' : <>A {count(previous)}{unit} → B {count(current)}{unit}<br/>{signed(change.amount)}{unit} · {change.rate === null ? '증감률 계산 불가' : `${signed(change.rate)}%`}</>}</small>;
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
type SortKey = 'adset' | 'creative' | 'sessions' | 'visitors' | 'cta_click_sessions' | 'conversion' | 'avg_scroll_depth' | 'avg_dwell_ms' | 'spend' | 'ctr';
const columns: [SortKey, string][] = [['adset', '광고세트'], ['creative', '소재'], ['sessions', '방문'], ['visitors', '고유 방문자'], ['cta_click_sessions', 'CTA 클릭 세션'], ['conversion', '방문 전환율'], ['avg_scroll_depth', '평균 스크롤'], ['avg_dwell_ms', '평균 체류'], ['spend', '광고비'], ['ctr', 'Meta CTR']];
export function sortPerformance(rows: PerformanceRow[], key: SortKey, direction: 'asc' | 'desc') {
  const value = (row: PerformanceRow) => key === 'conversion' ? rate(row.cta_click_sessions, row.sessions) : key === 'ctr' ? rate(row.link_clicks, row.impressions) : row[key];
  return [...rows].sort((left, right) => { const a = value(left), b = value(right); if (a == null) return b == null ? 0 : 1; if (b == null) return -1; return (typeof a === 'string' && typeof b === 'string' ? displayDimension(a).localeCompare(displayDimension(b), 'ko') : Number(a) - Number(b)) * (direction === 'asc' ? 1 : -1); });
}
export function PerformanceTable({ report, onClassify, pending = false }: { report: DashboardReport; onClassify: (row: PerformanceRow, value: string) => void; pending?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'sessions', direction: 'desc' });
  const rows = useMemo(() => sortPerformance(report.performance, sort.key, sort.direction), [report.performance, sort]);
  return <AdminSection bordered title="소재별 성과" description={`${count(rows.length)}개 소재 · 열 제목을 눌러 정렬`} className="tracking-performance-section">{rows.length ? <AdminDataTable label="소재별 성과표" tableClassName="tracking-performance-table"><thead><tr><th scope="col">광고 유형</th>{columns.map(([key, label]) => <th scope="col" data-align={['adset','creative'].includes(key) ? undefined : 'number'} key={key} aria-sort={sort.key === key ? sort.direction === 'desc' ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => setSort({ key, direction: sort.key === key && sort.direction === 'desc' ? 'asc' : 'desc' })}>{label}{sort.key === key && (sort.direction === 'desc' ? <ArrowDown size={12}/> : <ArrowUp size={12}/>)}</button></th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.campaign}-${row.adset}-${row.creative}-${index}`}>
      <td><select className="admin-select tracking-inline-select" aria-label={`${displayDimension(row.adset)} ${displayDimension(row.creative)} 광고 유형`} value={row.ad_type} disabled={pending} onChange={event => onClassify(row, event.target.value)}><option value="cold">콜드</option><option value="retarget">리타겟</option><option value="unclassified">미분류</option></select></td>
      <th scope="row" className="tracking-identifier"><span tabIndex={0} title={displayDimension(row.adset)}>{displayDimension(row.adset)}</span></th><td className="tracking-identifier"><span tabIndex={0} title={`${displayDimension(row.creative)} · 캠페인: ${displayDimension(row.campaign)}`}>{displayDimension(row.creative)}</span></td>
      <td data-align="number">{count(row.sessions)}</td><td data-align="number">{count(row.visitors)}</td><td data-align="number" title={`전체 클릭 ${count(row.cta_clicks)}회`}>{count(row.cta_click_sessions)}</td><td data-align="number">{row.sessions ? `${rate(row.cta_click_sessions, row.sessions).toFixed(1)}%` : '계산 불가'}</td><td data-align="number">{row.avg_scroll_depth == null ? '—' : `${count(row.avg_scroll_depth)}%`}</td><td data-align="number">{row.avg_dwell_ms == null ? '—' : `${count(row.avg_dwell_ms / 1000)}초`}</td><td data-align="number">{money(row.spend)}</td><td data-align="number" title={`Meta 노출 ${count(row.impressions)} · Meta 링크 클릭 ${count(row.link_clicks)}`}>{row.impressions ? `${rate(row.link_clicks, row.impressions).toFixed(1)}%` : '계산 불가'}</td>
    </tr>)}</tbody></AdminDataTable> : <CompactEmpty title={report.data_state.sessions_exist ? '조건에 맞는 데이터가 없습니다.' : '선택 기간에 수집된 소재 데이터가 없습니다.'}>{report.data_state.sessions_exist ? '상세 필터를 초기화하거나 조회 기간을 변경해 주세요.' : 'UTM 또는 캠페인 설정의 Meta 연결 상태를 확인해 주세요.'}</CompactEmpty>}</AdminSection>;
}
export function PerformanceDashboard({ report, compare, onClassify, pending, onRetry }: { report: DashboardReport; compare: boolean; onClassify: (row: PerformanceRow, value: string) => void; pending?: boolean; onRetry?: () => void }) {
  const b = report.summary_b, a = report.summary_a, summary = report.campaign_summary;
  const hasVisits = report.data_state.sessions_exist, previousHasVisits = Boolean(a?.sessions);
  const presence = report.ui?.actual_presence, hasPayments = presence ? presence.new_payments || presence.existing_payments : !report.ui;
  const visitorRate = rate(b.converted_visitors, b.visitors), sessionRate = rate(b.cta_click_sessions, b.sessions);
  return <div className="tracking-stack">
    <AdminMetricGrid columns={8} className="tracking-kpis">
      <AdminMetric label="고유 방문자" value={count(hasVisits ? b.visitors : null)} note="중복 제외" change={compare && <Compare current={b.visitors} previous={a?.visitors} hasData={previousHasVisits}/>}/>
      <AdminMetric label="전체 방문" value={count(hasVisits ? b.sessions : null)} note="재방문 포함" change={compare && <Compare current={b.sessions} previous={a?.sessions} hasData={previousHasVisits}/>}/>
      <AdminMetric label="방문자 CTA 전환율" value={b.visitors ? `${visitorRate.toFixed(1)}%` : hasVisits ? '계산 불가' : '—'} note="전환 방문자 ÷ 고유 방문자" change={compare && <Compare current={visitorRate} previous={a ? rate(a.converted_visitors, a.visitors) : undefined} hasData={previousHasVisits} unit="%"/>}/>
      <AdminMetric label="방문 CTA 전환율" value={b.sessions ? `${sessionRate.toFixed(1)}%` : hasVisits ? '계산 불가' : '—'} note="클릭 세션 ÷ 전체 방문" change={compare && <Compare current={sessionRate} previous={a ? rate(a.cta_click_sessions, a.sessions) : undefined} hasData={previousHasVisits} unit="%"/>}/>
      <AdminMetric label="CTA 클릭 세션" value={count(hasVisits ? b.cta_click_sessions : null)} note="1회 이상 클릭한 방문" change={compare && <Compare current={b.cta_click_sessions} previous={a?.cta_click_sessions} hasData={previousHasVisits} unit="세션"/>}/>
      <AdminMetric label="CTA 클릭 횟수" value={count(hasVisits ? b.cta_clicks : null)} note="기간 내 전체 클릭" change={compare && <Compare current={b.cta_clicks} previous={a?.cta_clicks} hasData={previousHasVisits} unit="회"/>}/>
      <AdminMetric label="누적 매출" value={money(hasPayments ? summary.revenue : null)} note={`신규·기존 결제 ${hasPayments ? count(summary.new_payments + summary.existing_payments) + '건' : '—'}`}/>
      <AdminMetric label="ROAS" value={summary.roas == null ? hasPayments ? '계산 불가' : '—' : `${count(summary.roas)}%`} note={`누적 광고비 ${money(report.campaign.meta_last_synced_at || summary.spend > 0 || report.data_state.meta_exists ? summary.spend : null)}`}/>
    </AdminMetricGrid>
    {report.ui?.errors.collection && <InlineError onRetry={onRetry}>{report.ui.errors.collection}</InlineError>}
    <PerformanceTable report={report} onClassify={onClassify} pending={pending}/>
    <TrendChart report={report} compare={compare} onRetry={onRetry}/>
  </div>;
}
