import { MousePointerClick, UsersRound, WalletCards } from 'lucide-react';
import { delta, displayDimension, engagementLabel, rate, type DashboardReport, type PerformanceRow } from '@/lib/landing-performance';

const count = (value: number | null | undefined) => value == null ? '—' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const money = (value: number) => value.toLocaleString('ko-KR') + '원';
function Compare({ current, previous, previousHasData }: { current: number; previous?: number; previousHasData: boolean }) {
  if (previous === undefined) return null;
  const change = delta(current, previous, previousHasData);
  return <small>{!change ? '비교 못함' : `A ${count(previous)} → B ${count(current)} · ${change.amount >= 0 ? '+' : ''}${count(change.amount)} (${change.rate === null ? '증감률 계산 불가' : `${change.rate >= 0 ? '+' : ''}${change.rate.toFixed(1)}%`})`}</small>;
}
function Kpi({ label, value, aValue, compare, previousHasData, icon: Icon, note }: { label: string; value: string; aValue?: number; compare: boolean; previousHasData: boolean; icon: typeof UsersRound; note: string }) {
  return <section className="metric"><div className="metric-label"><Icon size={16} aria-hidden="true" />{label}</div><div className="metric-value num">{value}</div>{compare && <Compare current={Number(value.replace(/[^0-9.-]/g,'')) || 0} previous={aValue} previousHasData={previousHasData} />}<div className="metric-note">{note}</div></section>;
}
export function PerformanceDashboard({ report, compare, onClassify }: { report: DashboardReport; compare: boolean; onClassify: (row: PerformanceRow, value: string) => void }) {
  const b = report.summary_b, a = report.summary_a;
  const visitorRate = rate(b.converted_visitors,b.visitors), sessionRate = rate(b.cta_click_sessions,b.sessions);
  const aVisitorRate = a ? rate(a.converted_visitors,a.visitors) : undefined, aSessionRate = a ? rate(a.cta_click_sessions,a.sessions) : undefined;
  const summary = report.campaign_summary;
  return <div>
    <div className="metrics landing-kpis">
      <Kpi label="고유 방문자" value={count(b.visitors)} aValue={a?.visitors} compare={compare} previousHasData={Boolean(a?.has_data)} icon={UsersRound} note="브라우저 방문자 ID 중복 제거" />
      <Kpi label="전체 방문" value={count(b.sessions)} aValue={a?.sessions} compare={compare} previousHasData={Boolean(a?.has_data)} icon={UsersRound} note="세션 기준" />
      <Kpi label="CTA 클릭 세션" value={count(b.cta_click_sessions)} aValue={a?.cta_click_sessions} compare={compare} previousHasData={Boolean(a?.has_data)} icon={MousePointerClick} note={`전체 클릭 ${count(b.cta_clicks)}회`} />
      <Kpi label="광고비" value={count(b.spend)} aValue={a?.spend} compare={compare} previousHasData={Boolean(a?.has_data)} icon={WalletCards} note="Meta 동기화 기준" />
    </div>
    <section className="panel mt24"><div className="panel-head"><h2>CTA 전환율 기준</h2></div><div className="panel-body landing-rate-pair">
      <div><span>방문자 기준</span><strong>{visitorRate.toFixed(1)}%</strong><p>클릭 고유 방문자 {count(b.converted_visitors)} ÷ 고유 방문자 {count(b.visitors)}</p>{compare && <Compare current={visitorRate} previous={aVisitorRate} previousHasData={Boolean(a?.has_data)} />}</div>
      <div><span>방문 기준</span><strong>{sessionRate.toFixed(1)}%</strong><p>클릭 세션 {count(b.cta_click_sessions)} ÷ 전체 세션 {count(b.sessions)}</p>{compare && <Compare current={sessionRate} previous={aSessionRate} previousHasData={Boolean(a?.has_data)} />}</div>
    </div></section>
    <div className="landing-stats mt24">
      <div><span>라이브 최대 동시시청</span><strong>{count(summary.live_peak)}</strong></div>
      <div><span>현재 카카오톡방 인원</span><strong>{count(summary.kakao_members)}</strong><small>직전 기록 대비 {summary.kakao_delta == null ? '—' : `${summary.kakao_delta >= 0 ? '+' : ''}${count(summary.kakao_delta)}`}</small></div>
      <div><span>누적 결제</span><strong>{count(summary.new_payments + summary.existing_payments)}건</strong><small>신규 {count(summary.new_payments)} · 기존 {count(summary.existing_payments)}</small></div>
      <div><span>누적 매출 / ROAS</span><strong>{money(summary.revenue)}</strong><small>{summary.roas == null ? '광고비 0 · 계산 불가' : `ROAS ${summary.roas.toFixed(1)}%`} · 광고비 {money(summary.spend)}</small></div>
    </div>
    <section className="panel mt24"><div className="panel-head"><h2>소재별 성과</h2></div>{report.performance.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="소재별 성과표"><table className="landing-performance-table"><thead><tr>{['광고 유형','캠페인','광고세트','소재','방문','고유 방문자','CTA 클릭 세션','CTA 클릭 횟수','방문 전환율','평균 스크롤','평균 체류','Meta 노출','Meta 링크 클릭','Meta CTR','광고비'].map(value=><th key={value}>{value}</th>)}</tr></thead><tbody>{report.performance.map((row,index)=><tr key={`${row.campaign}-${row.adset}-${row.creative}-${index}`}>
        <td><select aria-label={`${displayDimension(row.adset)} 광고 유형`} value={row.ad_type} onChange={event=>onClassify(row,event.target.value)}><option value="cold">콜드</option><option value="retarget">리타겟</option><option value="unclassified">미분류</option></select></td><td>{displayDimension(row.campaign)}</td><td>{displayDimension(row.adset)}</td><td>{displayDimension(row.creative)}</td><td>{count(row.sessions)}</td><td>{count(row.visitors)}</td><td>{count(row.cta_click_sessions)}</td><td>{count(row.cta_clicks)}</td><td>{rate(row.cta_click_sessions,row.sessions).toFixed(1)}%</td><td>{engagementLabel(row.avg_scroll_depth,row.sessions,'percent')}</td><td>{engagementLabel(row.avg_dwell_ms,row.sessions,'time')}</td><td>{count(row.impressions)}</td><td>{count(row.link_clicks)}</td><td>{rate(row.link_clicks,row.impressions).toFixed(1)}%</td><td>{money(Number(row.spend))}</td>
      </tr>)}</tbody></table></div> : <div className="empty"><h3>조건에 맞는 데이터가 없습니다.</h3><p>{report.data_state.sessions_exist ? '필터를 초기화하거나 기간을 변경해 주세요.' : '선택한 기간에 원천 방문 데이터가 없습니다.'}</p></div>}</section>
    <section className="panel mt24"><div className="panel-head"><h2>일별 방문 추이</h2></div><div className="table-scroll"><table><thead><tr><th>날짜 · KST</th><th>방문</th><th>고유 방문자</th><th>CTA 클릭 세션</th><th>CTA 클릭 횟수</th></tr></thead><tbody>{report.daily.map(row=><tr key={row.day}><th>{row.day}</th><td>{count(row.sessions)}</td><td>{count(row.visitors)}</td><td>{count(row.cta_click_sessions)}</td><td>{count(row.cta_clicks)}</td></tr>)}</tbody></table></div></section>
    <section className="panel mt24"><div className="panel-head"><h2>일별 실측 기록</h2></div>{report.actuals.length?<div className="table-scroll"><table><thead><tr><th>날짜</th><th>카카오톡방 인원</th><th>신규 결제</th><th>기존 결제</th><th>당일 매출</th><th>메모</th></tr></thead><tbody>{report.actuals.map(row=><tr key={row.day}><th>{row.day}</th><td>{count(row.kakao_members)}</td><td>{count(row.new_payments)}</td><td>{count(row.existing_payments)}</td><td>{money(row.revenue)}</td><td>{row.memo||'—'}</td></tr>)}</tbody></table></div>:<div className="empty"><p>선택 기간에 저장된 실측값이 없습니다.</p></div>}</section>
  </div>;
}
