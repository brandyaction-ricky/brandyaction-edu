import { ArrowDownToLine, Clock3, Globe2, MousePointerClick, UsersRound } from 'lucide-react';
import { decodeLabel } from '@/lib/landing';
import { conversionRate, engagementLabel, type PerformanceReport } from '@/lib/landing-performance';

const count = (value: number) => value.toLocaleString('ko-KR');
export function PerformanceDashboard({ report }: { report: PerformanceReport }) {
  const { summary, daily, sources } = report;
  const metrics = [
    { label: 'Unique Visitors', detail: '고유 방문자', value: count(summary.visitors), icon: UsersRound, color: 'blue' },
    { label: 'CTA Clicks', detail: '전체 CTA 클릭 횟수', value: count(summary.clicks), icon: MousePointerClick, color: 'coral' },
    { label: 'Conversion Rate', detail: 'CTA 클릭 방문자 / 고유 방문자', value: conversionRate(summary).toFixed(1) + '%', icon: ArrowDownToLine, color: 'green' },
    { label: 'Avg Dwell Time', detail: '화면이 보이는 동안의 평균 체류', value: engagementLabel(summary.avg_dwell_ms, summary.sessions, 'time'), icon: Clock3, color: 'orange' },
    { label: '평균 스크롤 깊이', detail: '방문별 최대 스크롤 깊이의 평균', value: engagementLabel(summary.avg_scroll_depth, summary.sessions, 'percent'), icon: ArrowDownToLine, color: 'blue' },
  ];
  return <div className="performance-dashboard">
    <div className="performance-metrics">{metrics.map(({ label, detail, value, icon: Icon, color }) => <section className="performance-card performance-metric" key={label} aria-label={label}><div><h2>{label}</h2><span className={'performance-icon ' + color}><Icon size={25} aria-hidden="true" /></span></div><strong>{value}</strong><p>{detail}</p></section>)}</div>
    <div className="performance-charts">
      <section className="performance-card performance-traffic"><div className="performance-card-heading"><h2>Traffic &amp; Conversions</h2><div className="performance-legend"><span><i className="visitors" />Visitors</span><span><i className="clicks" />Clicks</span></div></div><TrafficChart daily={daily} />{!summary.visitors && <p className="performance-empty-chart">선택한 기간에 수집된 방문 데이터가 없습니다.</p>}</section>
      <section className="performance-card performance-sources"><div className="performance-card-heading"><h2><Globe2 size={25} aria-hidden="true" />Top Sources</h2></div>{sources.length ? <ol>{sources.map(source => <li key={source.source}><div><span>{source.source === 'direct' ? '직접 유입' : decodeLabel(source.source)}</span><strong>{count(source.visitors)}<small>명</small></strong></div><div className="performance-source-bar"><span style={{ width: `${source.visitors / Math.max(1, sources[0].visitors) * 100}%` }} /></div><p>CTA {count(source.clicks)}회</p></li>)}</ol> : <div className="performance-empty-source"><span><Globe2 size={30} aria-hidden="true" /></span><p>No traffic data yet</p></div>}</section>
    </div>
    <div className="performance-footnote"><p>브라우저별 고유 방문자를 중복 제거합니다. 전환율은 구매율이 아닌 CTA 클릭 전환율이며, 일별 방문자의 합계와 기간 고유 방문자는 다를 수 있습니다.</p><p>체류·스크롤은 측정된 {count(summary.measured_sessions)}개 방문 기준입니다. 기존 미수집 기록은 평균에서 제외하며 테스트 모드 방문은 집계하지 않습니다.</p>{report.last_event_at && <p>마지막 수집: {new Date(report.last_event_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} KST</p>}</div>
    <details className="performance-data"><summary>일별 데이터 보기</summary><div className="landing-table"><table><caption>선택한 기간의 일별 고유 방문자와 CTA 클릭</caption><thead><tr><th scope="col">날짜 · KST</th><th scope="col">고유 방문자</th><th scope="col">CTA 클릭</th></tr></thead><tbody>{daily.map(day => <tr key={day.day}><th scope="row">{day.day}</th><td>{count(day.visitors)}</td><td>{count(day.clicks)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function TrafficChart({ daily }: { daily: PerformanceReport['daily'] }) {
  const ceiling = Math.max(4, Math.ceil(Math.max(...daily.map(day => Math.max(day.visitors, day.clicks)), 0) / 4) * 4);
  const x = (index: number) => 58 + index / Math.max(1, daily.length - 1) * 766;
  const y = (value: number) => 366 - value / ceiling * 318;
  const labels = new Set(Array.from({ length: Math.min(5, daily.length) }, (_, index) => Math.round(index * (daily.length - 1) / Math.max(1, Math.min(5, daily.length) - 1))));
  return <svg viewBox="0 0 860 426" className="performance-chart" role="img" aria-label="선택 기간의 일별 고유 방문자와 CTA 클릭 추이. 정확한 수치는 아래 일별 데이터에서 확인할 수 있습니다.">
    {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="58" x2="824" y1={y(tick * ceiling / 4)} y2={y(tick * ceiling / 4)} stroke="#e8edf4" strokeDasharray="4 4" /><text x="43" y={y(tick * ceiling / 4) + 5} textAnchor="end">{count(tick * ceiling / 4)}</text></g>)}
    <polyline fill="none" stroke="#3478ff" strokeWidth="3" strokeLinejoin="round" points={daily.map((day, index) => `${x(index)},${y(day.visitors)}`).join(' ')} />
    <polyline fill="none" stroke="#fc5938" strokeWidth="3" strokeLinejoin="round" points={daily.map((day, index) => `${x(index)},${y(day.clicks)}`).join(' ')} />
    {daily.map((day, index) => <g key={day.day}><circle cx={x(index)} cy={y(day.visitors)} r="4" fill="#3478ff" opacity={day.visitors ? 1 : 0}><title>{`${day.day} · 방문자 ${count(day.visitors)}명`}</title></circle><circle cx={x(index)} cy={y(day.clicks)} r="4" fill="#fc5938" opacity={day.clicks ? 1 : 0}><title>{`${day.day} · 클릭 ${count(day.clicks)}회`}</title></circle>{labels.has(index) && <text x={x(index)} y="404" textAnchor={index === 0 ? 'start' : index === daily.length - 1 ? 'end' : 'middle'}>{day.day}</text>}</g>)}
  </svg>;
}
