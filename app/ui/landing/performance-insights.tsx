'use client';

import { useState } from 'react';
import { AdminDataTable, AdminMetric, AdminMetricGrid, AdminSection } from '@/features/admin-ui';
import { count, money, kstTime } from '@/lib/landing-admin-state';
import { insightRate, versionDifference, type RevenueInsight, type LandingInsights } from '@/lib/landing-insights';

const percent = (n: number | null) => n == null ? '계산 불가' : `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
const reasons = {
  unmapped: '연결된 유료 기수가 없습니다. 모집 관리에서 무료클래스와 유료 기수의 연결을 확인해 주세요.',
  forbidden: '주문 조회 권한이 없어 매출을 표시하지 않습니다.',
  review: '주문·결제·환불 합계가 맞지 않거나 여러 기수의 묶음 주문이 있습니다. 확인 전에는 매출을 계산하지 않습니다.',
};
export function PerformanceInsights({ insights }: { insights: LandingInsights }) {
  const { revenue: r, behavior: b } = insights;
  const [left, setLeft] = useState<number | null>(null), [right, setRight] = useState<number | null>(null);
  const versions = b.versions;
  const a = versions.find(v => v.layout_ver === left) ?? versions.at(-2);
  const z = versions.find(v => v.layout_ver === right) ?? versions.at(-1);
  const [shown, setShown] = useState<number | null>(null);
  const current = versions.find(v => v.layout_ver === shown) ?? versions.at(-1);
  const difference = versionDifference(a, z);
  const selector = (label: string, value: number | undefined, change: (value: number) => void) => <label className="admin-field">{label}<select className="admin-select" aria-label={label} value={value} onChange={e=>change(Number(e.target.value))}>{versions.map(v=><option key={v.layout_ver} value={v.layout_ver}>v{v.layout_ver} · {v.note || '변경 메모 없음'}</option>)}</select></label>;
  return <>
    <RevenueSummary revenue={r}/>
    <AdminSection bordered title="스크롤 도달과 이탈" description={`측정된 방문 ${count(b.measured_sessions)} / 전체 ${count(b.sessions)}회`}>
      {!b.measured_sessions ? <p className="tracking-help">스크롤 측정값이 없습니다. 과거의 미수집 기록을 이탈이나 0%로 계산하지 않습니다.</p> : <AdminDataTable label="스크롤 구간별 도달과 이탈"><thead><tr><th scope="col">깊이</th><th scope="col">도달 방문</th><th scope="col">도달률</th><th scope="col">다음 구간 미도달</th><th scope="col">구간 이탈률</th></tr></thead><tbody>{b.scroll.map(row => <tr key={row.depth}><th scope="row">{row.depth}%</th><td>{count(row.reached)}</td><td>{percent(insightRate(row.reached,b.measured_sessions))}</td><td>{count(row.not_continued)}</td><td>{row.depth === 100 ? '—' : percent(insightRate(row.not_continued,row.reached))}</td></tr>)}</tbody></AdminDataTable>}
      <p className="tracking-help">구간 이탈률은 그 깊이에 도달한 방문 중 다음 깊이에 도달하지 않은 비율입니다. 읽는 중인 방문도 포함되므로 최종 이탈 확정값은 아닙니다. 미측정 {count(b.sessions-b.measured_sessions)}회는 분모에서 제외합니다. 버전을 바꿔 다시 방문하면 각각 기록됩니다.</p>
      <details><summary>섹션별 도달 확인</summary>
        {versions.length > 0 && <label className="admin-field">섹션 조회 버전<select className="admin-select" value={current?.layout_ver} onChange={e=>setShown(Number(e.target.value))}>{versions.map(v=><option key={v.layout_ver} value={v.layout_ver}>v{v.layout_ver} · {v.note || '변경 메모 없음'}</option>)}</select></label>}
        {current && <AdminDataTable label="섹션별 도달과 미진행"><thead><tr><th scope="col">섹션</th><th scope="col">도달</th><th scope="col">도달률</th><th scope="col">다음 섹션 미도달</th><th scope="col">미진행률</th></tr></thead><tbody>{current.sections.map(s=><tr key={s.section}><th scope="row">{s.section}</th><td>{count(s.reached)}</td><td>{percent(insightRate(s.reached,current.sessions))}</td><td>{count(s.not_continued)}</td><td>{s.not_continued == null ? '—' : percent(insightRate(s.not_continued,s.reached))}</td></tr>)}</tbody></AdminDataTable>}
        <p className="tracking-help">각 섹션 도달자의 다음 섹션 도달 여부를 직접 대조합니다. 중간 섹션을 건너뛴 방문을 단순 인원 차이로 빼지 않습니다.</p>
      </details>
    </AdminSection>
    <AdminSection bordered title="페이지 수정 전후 비교" description="발행된 페이지 버전과 실제 방문 성과">
      {versions.length < 2 ? <p className="tracking-help">비교할 두 번째 페이지 버전이 아직 없습니다. 상품 관리에서 무료 라이브 페이지를 수정·발행한 버전부터 기록되며 과거 버전을 만들어 채우지 않습니다.</p> : <>
        <div className="tracking-form-grid">{selector('이전 버전',a?.layout_ver,setLeft)}{selector('비교 버전',z?.layout_ver,setRight)}</div>
        <AdminDataTable label="페이지 버전 성과 비교"><thead><tr><th scope="col">지표</th><th scope="col">v{a?.layout_ver}</th><th scope="col">v{z?.layout_ver}</th></tr></thead><tbody>
          <tr><th scope="row">변경 메모</th><td>{a?.note || '없음'}</td><td>{z?.note || '없음'}</td></tr>
          <tr><th scope="row">발행 시각</th><td>{kstTime(a?.created_at)}</td><td>{kstTime(z?.created_at)}</td></tr>
          <tr><th scope="row">방문</th><td>{count(a?.sessions)}</td><td>{count(z?.sessions)}</td></tr>
          <tr><th scope="row">표본 상태</th><td>{(a?.sessions ?? 0)<30?'표본 부족':'30회 이상'}</td><td>{(z?.sessions ?? 0)<30?'표본 부족':'30회 이상'}</td></tr>
          <tr><th scope="row">CTA 클릭 방문</th><td>{count(a?.cta_sessions)}</td><td>{count(z?.cta_sessions)}</td></tr>
          <tr><th scope="row">CTA 클릭률</th><td>{percent(a ? insightRate(a.cta_sessions,a.sessions) : null)}</td><td>{percent(z ? insightRate(z.cta_sessions,z.sessions) : null)}</td></tr>
          <tr><th scope="row">첫 방문 — 마지막 방문 (KST)</th><td>{kstTime(a?.first_seen)} — {kstTime(a?.last_seen)}</td><td>{kstTime(z?.first_seen)} — {kstTime(z?.last_seen)}</td></tr>
        </tbody></AdminDataTable>
        <p className="tracking-help" role="status">{a?.layout_ver === z?.layout_ver ? '서로 다른 버전을 선택해 주세요.' : difference == null ? '한쪽 버전에 방문이 없어 변화율을 계산할 수 없습니다.' : `CTA 클릭률 변화 ${difference>0?'+':''}${difference.toFixed(1)}%p`}</p>
        <details><summary>섹션별 변경 전후 도달률</summary><AdminDataTable label="버전별 섹션 도달 비교"><thead><tr><th scope="col">섹션</th><th scope="col">이전 순서 · 도달률</th><th scope="col">비교 순서 · 도달률</th></tr></thead><tbody>{Array.from(new Set([...(a?.sections ?? []).map(s=>s.section),...(z?.sections ?? []).map(s=>s.section)])).map(id=>{
          const ai=a?.sections.findIndex(s=>s.section===id) ?? -1, zi=z?.sections.findIndex(s=>s.section===id) ?? -1;
          return <tr key={id}><th scope="row">{id}</th><td>{ai<0?'없음':`${ai+1} · ${percent(insightRate(a?.sections[ai].reached,a?.sessions ?? 0))}`}</td><td>{zi<0?'없음':`${zi+1} · ${percent(insightRate(z?.sections[zi].reached,z?.sessions ?? 0))}`}</td></tr>;
        })}</tbody></AdminDataTable></details>
      </>}
      <p className="tracking-help">선택한 기간·유입·소재·기기 필터를 두 버전에 동일하게 적용합니다. 방문 30회 미만은 표본이 부족합니다. 기간과 유입 구성이 다를 수 있어 페이지 수정의 효과를 확정하거나 자동으로 승자를 고르지 않습니다.</p>
    </AdminSection>
  </>;
}

export function RevenueSummary({ revenue: r }: { revenue: RevenueInsight }) {
  return (<AdminSection bordered title="기수 전체 매출 · 주문 자동 집계" description={r.cohort_label ?? '모집과 유료 기수 연결 필요'}>
      {r.state !== 'ready' ? <p className="tracking-help" role="status">{reasons[r.state]}{r.needs_review > 0 ? ` 확인할 주문 ${count(r.needs_review)}건.` : ''}</p> : <>
        <AdminMetricGrid columns={4}>
          <AdminMetric label="실결제" value={money(r.gross)} note={`${count(r.orders)}건 · 할인 후 승인액`}/>
          <AdminMetric label="환불" value={money(r.refunds)} note="완료된 부분·전체 환불 반영"/>
          <AdminMetric label="순매출" value={money(r.net)} note="실결제 − 완료된 환불 · 부가세 포함"/>
          <AdminMetric label="기수 전체 ROAS" value={percent(r.roas)} note={`Meta 광고비 ${r.spend == null ? '확인 필요' : money(r.spend)}`}/>
        </AdminMetricGrid>
      </>}
      <p className="tracking-help">기수 누적 전체 · 상단 조회 기간/필터와 별개{r.as_of ? ` · 주문·환불 확인 ${kstTime(r.as_of)}` : ''}</p>
      {r.state === 'ready' && r.spend == null && <p className="tracking-help" role="status">광고비 수집 상태·완료 기간과 다른 기수의 광고 중복 연결을 확인해 주세요. 미확인 광고비로 ROAS를 계산하지 않습니다.</p>}
      <details><summary>자동 집계 기준</summary><p className="tracking-help">광고 종료 후 발생한 결제까지 포함한 연결 기수의 누적 전체 주문입니다. 상단 조회 기간은 매출 집계를 자르지 않습니다. 내부·시험·0원 주문은 기존 집계 기준으로 제외합니다. 같은 기수에 연결된 모든 광고 페이지의 광고비를 중복 없이 합칩니다. 조회 기간·소재·기기·페이지 버전 필터는 매출과 광고비에 적용되지 않으며, 개별 광고의 구매 성과로 해석하지 않습니다. 수기 결제 기록은 자동 집계에 더하지 않습니다. 매출은 부가세 포함, Meta 광고비는 부가세 별도입니다.</p></details>
    </AdminSection>);
}
