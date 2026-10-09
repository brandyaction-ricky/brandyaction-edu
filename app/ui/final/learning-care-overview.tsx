'use client';
import { useState } from 'react';
import { ArrowUpRight, Flag } from 'lucide-react';
import { careLearningProgress, careBandLabels, careAttention, careDaySummaries, careLearningCells, type CareRow, type CareBand } from '@/lib/learning-care';

const bands: CareBand[] = ['starting', 'progressing', 'finishing', 'unknown'];
const ranges = { starting: '10% 미만', progressing: '10% 이상 ~ 80% 미만', finishing: '80% ~ 100%', unknown: '공개 항목·설정 확인' };

export function CareOverview({ rows, asOf, onStudent, onDay }: {
  rows: CareRow[]; asOf: string; onStudent: (id: string) => void; onDay: (id: string, filter: string) => void;
}) {
  const [search, setSearch] = useState(''), [band, setBand] = useState<CareBand | 'all'>('all'), [attentionOnly, setAttentionOnly] = useState(false);
  const students = rows.map(row => ({ row, progress: careLearningProgress(row.cells), attention: careAttention(row, asOf) }));
  const shown = students.filter(({ row, progress, attention }) =>
    `${row.name || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (band === 'all' || band === progress.band) && (!attentionOnly || attention.needsAttention));
  const days = careDaySummaries(rows);
  return <section className="care-overview" aria-label="기수별 수강생 현황판">
    <div className="care-board-heading"><div><span className="care-eyebrow">기수별 진행 현황</span><h2>수강생별 진행률</h2><p>지금 공개된 학습 중 완료한 비율입니다.</p></div><span className="care-board-count">{rows.length}개 수강 기록</span></div>
    <div className="care-band-filters" aria-label="진행률 필터">
      <button aria-pressed={band === 'all'} onClick={() => setBand('all')}>전체 <b>{rows.length}</b></button>
      {bands.map(value => <button key={value} className={'care-band-filter care-band-' + value} aria-pressed={band === value} onClick={() => setBand(value)}><i aria-hidden="true"/><span>{value === 'finishing' ? '80% 이상 완료' : careBandLabels[value]}<small>{ranges[value]}</small></span><b>{students.filter(s => s.progress.band === value).length}</b></button>)}
    </div>
    <div className="care-board-tools"><label>수강생 찾기<input placeholder="이름 또는 이메일" value={search} onChange={e => setSearch(e.target.value)}/></label><button className="care-attention-toggle" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(v => !v)}><Flag size={15}/> 확인 필요만 <b>{students.filter(s => s.attention.needsAttention).length}</b></button><small>수강 내역 {shown.length}건 표시</small></div>
    <div className="care-student-tiles">
      {shown.map(({ row, progress, attention }) => {
        const next = careLearningCells(row.cells).find(c => c.published && ['changes_requested', 'not_submitted'].includes(c.state));
        return <button key={row.enrollmentId} className={'care-student-tile care-band-' + progress.band} aria-label={`${row.name || '이름 미등록'} 상세 · 공개 학습 ${progress.percent === null ? '공개 전·설정 확인' : progress.percent + '%'}`} onClick={() => onStudent(row.enrollmentId)}>
          <span className="care-tile-top"><b>{row.name || '이름 미등록'}</b><ArrowUpRight size={17}/></span>
          <span className="care-tile-number">{progress.percent === null ? '—' : progress.percent}<small>{progress.percent === null ? '공개 전·설정 확인' : '%'}</small></span>
          <span className="care-tile-caption">{progress.invalid ? '설정 확인' : `${progress.done}/${progress.total}개 완료`}</span>
          <span className="care-tile-progress" aria-hidden="true"><i style={{ width: `${progress.percent || 0}%` }}/></span>
          <span className="care-tile-next">{progress.invalid ? '학습 설정 확인이 필요해요' : next ? `다음: ${next.week}주차 ${next.day}일차` : attention.pending ? '제출한 과제의 검토를 기다리고 있어요' : progress.percent === 100 ? '공개된 항목을 모두 완료했어요!' : '다음 학습 공개를 기다리고 있어요'}</span>

          <span className="care-tile-signals">{attention.returned > 0 && <span className="care-signal"><Flag size={12}/> 보완 요청 {attention.returned}건</span>}{attention.followUp && <span className="care-signal"><Flag size={12}/> 최근 활동 확인</span>}{attention.pending > 0 && <span className="care-signal care-signal-review">검토 대기 {attention.pending}건</span>}</span>
        </button>;
      })}
    </div>
    {!shown.length && <p className="care-empty">조건에 맞는 수강생이 없습니다.</p>}
    <p className="care-note">진행률에는 현재 공개된 학습만 포함합니다. 빨강은 시작 단계이며 지연 판정이 아닙니다. 확인 필요는 보완 요청 또는 3일 이상 방문 기록이 없고 지금 수행 가능한 항목이 있는 경우입니다.</p>
    <section className="care-day-overview" aria-label="일차별 학습 진행률">
      <div className="care-board-heading"><div><h2>일차별로 진행 상황을 확인하세요</h2><p>기수 전체의 공개된 학습 기준입니다. 일차를 누르면 해당 수강생 명단이 열립니다.</p></div></div>
      {!days.length && <p className="care-empty">아직 등록된 학습이 없습니다.</p>}
      <div className="care-day-tiles">{days.map(day => <article key={day.lessonId} className={!day.available ? 'care-day-unpublished' : ''}>
        <button disabled={day.invalid} onClick={() => day.lessonId && onDay(day.lessonId, 'all')} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} 명단 보기`}><b>{day.week}주차 {day.day}일차</b><span className="care-day-title">{day.title}</span><strong>{day.percent === null ? '—' : day.percent + '%'}</strong><span>{day.invalid ? '설정 확인' : !day.available ? '공개 예정' : `${day.done}/${day.available}명 완료`}</span><progress value={day.done} max={day.available || 1} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} 진행률`}/></button>
        {day.available > 0 && !day.invalid && <div className="care-day-actions"><div className="care-day-statuses">{([['not_submitted', '미완료', day.missing], ['submitted', '검토 대기', day.pending], ['changes_requested', '보완 요청', day.returned]] as const).map(([filter, label, count]) => count > 0 && <button key={filter} onClick={() => day.lessonId && onDay(day.lessonId, filter)} aria-label={`${day.week}주차 ${day.day}일차 · ${day.title} ${label} ${count}명`}>{label} <b>{count}</b></button>)}</div>{day.locked > 0 && <small>앞 단계 대기 {day.locked}</small>}</div>}
      </article>)}</div>
    </section>
  </section>;
}
