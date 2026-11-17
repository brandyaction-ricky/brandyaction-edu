'use client';

import { useState } from 'react';
import { AD_METRICS, adMetric, summarizeAdDays, type AdDay, type AdMetric } from '@/lib/landing-ad-trends';
import type { DashboardReport } from '@/lib/landing-performance';
import { AdminButton, AdminDataTable, AdminMetric, AdminMetricGrid, AdminSection } from '@/features/admin-ui';
import { InlineError } from './tracking-controls';

const index = (day: string, start: string) => Math.round((Date.parse(day) - Date.parse(start)) / 86400000);
const formatted = (row: AdDay | null, metric: AdMetric) => {
  if (!row) return '기록 없음';
  if ((metric === 'registrations' || metric === 'cpa') && row.registration_state !== 'ready') return row.registration_state === 'missing' ? '미수집' : '확인 필요';
  const value = adMetric(row, metric);
  return value === null ? '계산 불가' : value.toLocaleString('ko-KR', { maximumFractionDigits: metric === 'ctr' ? 2 : 0 }) + AD_METRICS.find(item => item.key === metric)!.unit;
};
export function AdDailyTrend({ report, compare, onRetry }: { report: DashboardReport; compare: boolean; onRetry?: () => void }) {
  const [metric, setMetric] = useState<AdMetric>('spend');
  const trend = report.ui?.ad_trend;
  if (!trend) return null;
  if (trend.state !== 'ready') return <AdminSection bordered className="tracking-ad-trend" title="일별 광고 성과">
    {trend.state === 'error' ? <InlineError onRetry={onRetry}>일별 광고 자료를 불러오지 못했습니다. 기간을 줄이거나 다시 조회해 주세요.</InlineError> : <p className="tracking-help">{trend.state === 'filtered' ? '일별 광고 성과는 상세 필터를 해제한 캠페인 전체에서 확인할 수 있습니다. 방문 추이는 현재 필터를 유지합니다.' : 'Meta 광고 캠페인을 연결하면 일별 광고 성과를 확인할 수 있습니다.'}</p>}
  </AdminSection>;
  const summary = summarizeAdDays(trend.current);
  const periods = [{ key: 'B', label: 'B · 최근 기간', rows: trend.current, start: report.range.startDay }, ...(compare ? [{ key: 'A', label: 'A · 예전 기간', rows: trend.previous, start: report.range.compareStartDay! }] : [])];
  const max = Math.max(1, ...periods.flatMap(period => period.rows.map(row => adMetric(row, metric) ?? 0)));
  const length = Math.max(1, index(report.range.endDay, report.range.startDay));
  const x = (day: string, start: string) => 56 + index(day, start) / length * 760;
  const y = (value: number) => 202 - value / max * 170;
  const label = AD_METRICS.find(item => item.key === metric)!;
  const path = (rows: AdDay[], start: string) => {
    let last = -2;
    return rows.map(row => {
      const value = adMetric(row, metric), position = index(row.day, start);
      if (value === null) { last = -2; return ''; }
      const command = last === position - 1 ? 'L' : 'M'; last = position;
      return `${command}${x(row.day, start)},${y(value)}`;
    }).join(' ');
  };
  return <AdminSection bordered className="tracking-ad-trend" title="일별 광고 성과" description={`Meta · ${report.range.startDay} — ${report.range.endDay} · 캠페인 전체`}>
    <AdminMetricGrid columns={4}>
      <AdminMetric label="수집된 광고비" value={formatted(summary, 'spend')} note="선택 기간에 저장된 광고비 합계"/>
      <AdminMetric label="Meta 등록완료" value={formatted(summary, 'registrations')} note="누락된 등록 자료가 있으면 합계 표시 보류"/>
      <AdminMetric label="등록당 비용" value={formatted(summary, 'cpa')} note="광고비 합계 ÷ 등록완료 합계"/>
      <AdminMetric label="등록 표본" value={!summary || summary.registrations === null ? '확인 필요' : summary.registrations < 30 ? '판단 보류' : '30건 이상'} note="등록완료 30건 미만은 효율 판단 보류"/>
    </AdminMetricGrid>
    <div className="tracking-chart-toggles" role="group" aria-label="일별 광고 지표">{AD_METRICS.map(item => <AdminButton type="button" size="sm" key={item.key} aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</AdminButton>)}</div>
    <p className="tracking-help">등록당 비용·CTR·CPM은 일별 합계로 계산합니다. CTR = 링크 클릭 ÷ 노출, CPM = 광고비 ÷ 노출 × 1,000. 단위가 다른 지표는 한 번에 하나씩 표시합니다.</p>
    <p className="tracking-help">B: {index(report.range.endDay, report.range.startDay) + 1}일 중 {trend.current.length}일의 저장 자료가 있습니다. 기록 없는 날은 0으로 채우거나 선으로 연결하지 않습니다. 일부 소재의 동기화 실패 여부는 Meta 수집 상태도 확인해 주세요.</p>
    {compare && <p className="tracking-help">B 실선 / A 점선 · 각 기간 시작 후 같은 일차를 비교합니다. A 저장 자료 {trend.previous.length}일.</p>}
    {!periods.some(period => period.rows.some(row => adMetric(row, metric) !== null)) ? <p role="status">선택 지표를 계산할 수 있는 광고 자료가 없습니다.</p> : <div className="tracking-chart"><svg viewBox="0 0 880 240" role="img" aria-label={`일별 ${label.label} 추이`}>
      <text x="12" y="22">{max.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}{label.unit}</text>
      {[32, 117, 202].map(value => <line key={value} x1="56" x2="816" y1={value} y2={value} stroke="#e5e7eb"/>)}
      {periods.map(period => <g key={period.key}>
        <path d={path(period.rows, period.start)} fill="none" stroke="#b51f32" strokeWidth="2" strokeDasharray={period.key === 'A' ? '5 5' : undefined}/>
        {period.rows.map(row => { const value = adMetric(row, metric); return value === null ? null : <circle key={row.day} cx={x(row.day, period.start)} cy={y(value)} r="4" fill={period.key === 'A' ? '#fff' : '#b51f32'} stroke="#b51f32" tabIndex={0} aria-label={`${period.label} ${row.day} ${label.label} ${formatted(row, metric)}`}><title>{period.label} · {row.day} · {formatted(row, metric)}</title></circle>; })}
      </g>)}
      <text x="56" y="230">{report.range.startDay}</text><text x="816" y="230" textAnchor="end">{report.range.endDay}</text>
    </svg></div>}
    <details className="tracking-chart-data"><summary>광고 일별 수치 보기</summary><AdminDataTable label="광고 일별 수치"><thead><tr><th scope="col">기간</th><th scope="col">날짜</th>{AD_METRICS.map(item => <th scope="col" key={item.key} data-align="number">{item.label}</th>)}</tr></thead><tbody>{periods.flatMap(period => period.rows.map(row => <tr key={`${period.key}-${row.day}`}><th scope="row">{period.key}</th><td>{row.day}</td>{AD_METRICS.map(item => <td key={item.key} data-align="number">{formatted(row, item.key)}</td>)}</tr>))}</tbody></AdminDataTable></details>
  </AdminSection>;
}
