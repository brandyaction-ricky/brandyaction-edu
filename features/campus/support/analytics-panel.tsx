'use client';
import Link from 'next/link';
import {ToolObstaclesPanel} from './tool-obstacles-panel';
import {retrospectiveMarkdown,type SupportAnalytics} from './analytics';
import {obstacleKinds,type ObstacleKind} from './domain';
import s from './panel.module.css';
export function AnalyticsPanel({data}:{data:SupportAnalytics|undefined}){
 if(!data)return <section className={s.card}><h3>지원·과제 기록을 함께 확인합니다</h3><p className={s.muted}>기록을 조회하면 반복 막힘, 답변 이후 행동, 관측된 지원량을 표시합니다. 확인하지 않은 값을 0건으로 표시하지 않습니다.</p></section>;
 function download(){const url=URL.createObjectURL(new Blob([retrospectiveMarkdown(data!)],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='문샷-운영-회고-검토초안.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <div className={s.grid}>
 <section className={s.card}><h3>반복 막힘 · 최근 7일 비교</h3><p>이번 {data.currentRequests}건 / 앞선 7일 {data.previousRequests}건</p>{!data.obstacles.length?<p className={s.empty}>해당 기간의 요청이 없습니다.</p>:<div className={s.tableWrap}><table><thead><tr><th>수업·유형</th><th>요청자</th><th>이번 / 이전</th></tr></thead><tbody>{data.obstacles.map(r=><tr key={r.lessonId+':'+r.category}><td>{r.title}<br/><small>{obstacleKinds[r.category as ObstacleKind]}</small></td><td>{r.learners}명</td><td>{r.current} / {r.previous}건</td></tr>)}</tbody></table></div>}</section>
 <ToolObstaclesPanel rows={data.toolObstacles}/>
 <section className={s.card}><h3>지원 후 이어진 행동</h3><p className={s.muted}>첫 답변 후 7일 동안 같은 수강권·수업에 남은 기록입니다. 지원의 인과 효과나 학습 집중도를 뜻하지 않습니다. 같은 행동이 여러 지원 요청과 연결될 수 있습니다.</p>{data.effects.length?<div className={s.list}>{data.effects.map(r=><article className={s.item} key={r.requestId}><h4>{r.title}</h4><p>제출 {r.submitted} · 그중 재제출 {r.resubmitted} · 승인 {r.approved} · 실행 마무리 기록 {r.executed}</p><small>{r.windowComplete?'7일 관측 종료':'7일 관측 진행 중'}</small></article>)}</div>:<p className={s.empty}>아직 첫 답변 이후의 관측 기록이 없습니다.</p>}</section>
 <section className={s.card}><h3>운영 지원량 준비</h3>{data.forecast?<><p>최근 4주에 들어온 요청은 주당 평균 <strong>{data.forecast.weeklyAverage.toFixed(1)}건</strong>입니다.</p><p>관측 범위 {data.forecast.observedLow}–{data.forecast.observedHigh}건 / 주 · 해결 완료 평균 {data.forecast.weeklyResolved.toFixed(1)}건 / 주</p><p>현재 지원 대기 {data.forecast.waiting}건 + 과제 검토 대기 {data.submissionQueue.length}건</p><p className={s.muted}>과거 분포를 사용하는 준비용 기준이며 미래 확정치나 통계적 신뢰구간이 아닙니다. 운영자 작업시간은 측정하지 않습니다.</p></>:<p className={s.muted}>최소 4주의 요청 기록이 쌓이면 주간 평균·관측 범위를 계산합니다. 현재는 대기 과제 {data.submissionQueue.length}건과 확정된 일정을 먼저 확인하세요.</p>}<h4>앞으로 7일의 모임</h4>{data.upcoming.length?data.upcoming.map((r,i)=><p key={i}>{r.title} · 예약 {r.reserved} / 정원 {r.capacity}명</p>):<p>예정된 모임 없음</p>}</section>
 <section className={s.card}><h3>과제 검토 대기</h3><p className={s.muted}>각 수강권·과제의 최신 제출만 표시합니다. 오래된 재시도는 중복 집계하지 않습니다.</p>{data.submissionQueue.slice(0,30).map(r=><div className={s.item} key={r.id}><strong>{r.title}</strong><p>{r.hours.toFixed(1)}시간 경과</p></div>)}{!data.submissionQueue.length&&<p>검토 대기 중인 제출이 없습니다.</p>}<Link href="/admin/reviews">기존 과제 검토 화면 열기</Link><hr/><h3>기수 회고 초안</h3><p>요청 변화·반복 막힘·대기량을 묶어 검토용 문서로 저장합니다.</p><button onClick={download}>회고 초안 내려받기</button></section>
 </div>;
}
