'use client';
import { useState } from 'react';
import { careDaySummaries, careSortDays, careDuration, type CareDaySort, type CareRow } from '@/lib/learning-care';

export function CareDayOverview({ rows, asOf, onDay }: { rows: CareRow[]; asOf: string; onDay: (id: string, filter: string) => void }) {
  const [sort, setSort] = useState<CareDaySort>('curriculum');
  const days = careSortDays(careDaySummaries(rows, asOf), sort);
  return <section className="care-day-overview" aria-label="일차별 학습 진행률">
    <div className="care-board-heading"><div><h2>일차별로 진행 상황을 확인하세요</h2><p>일차를 누르면 해당 수강생 명단이 열립니다.</p></div></div>
    <div className="care-controls"><label>일차 정렬<select value={sort} onChange={e => setSort(e.target.value as CareDaySort)}>
      <option value="curriculum">커리큘럼 순</option><option value="completion">완료율 낮은 순</option><option value="duration">완료시간 중앙값 긴 순</option>
    </select></label></div>
    <p className="care-note">완료율 = 완료 ÷ (완료 + 미완료). 앞 단계 대기·공개 예정·검토 대기·보완 요청은 제외합니다. 완료시간은 이전 필수 학습 완료부터 현재 학습 완료까지의 경과시간입니다.</p>
    {!days.length && <p className="care-empty">아직 등록된 학습이 없습니다.</p>}
    <div className="care-day-tiles">{days.map(day => <article key={day.lessonId} className={!day.available ? 'care-day-unpublished' : ''}>
      <button disabled={day.invalid} onClick={() => onDay(day.lessonId, 'all')} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} 명단 보기`}>
        <b>{day.week}주차 {day.day}일차</b><span className="care-day-title">{day.title}</span>
        <strong>{day.completionRate === null ? '—' : day.completionRate + '%'}</strong>
        <span>{day.invalid ? '설정 확인' : !day.available ? '공개 예정' : !day.eligible ? '완료·미완료 대상 없음' : `완료율 · ${day.done}/${day.eligible}명 완료`}</span>
        <span className="care-day-duration">완료시간 중앙값 <b>{day.invalid ? '설정 확인' : day.firstDay ? '— (첫 일차)' : day.medianMilliseconds === null ? day.timingMissing ? '기록 확인 필요' : '완료 기록 없음' : careDuration(day.medianMilliseconds)}</b></span>
        <span>{day.timingSamples > 0 ? `${day.timingSamples}명 완료 기록 기준` : ' '}{day.timingMissing > 0 && ` · 시간 기록 확인 ${day.timingMissing}명`}</span>
        <progress value={day.done} max={day.eligible || 1} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} 완료율`}/>
      </button>
      {day.available > 0 && !day.invalid && <div className="care-day-actions"><div className="care-day-statuses">{([['not_submitted', '미완료', day.missing], ['submitted', '검토 대기', day.pending], ['changes_requested', '보완 요청', day.returned]] as const).map(([filter, label, count]) => count > 0 && <button key={filter} onClick={() => onDay(day.lessonId, filter)} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} ${label} ${count}명`}>{label} <b>{count}</b></button>)}</div>{day.locked > 0 && <small>앞 단계 대기 {day.locked}명</small>}</div>}
    </article>)}</div>
  </section>;
}
