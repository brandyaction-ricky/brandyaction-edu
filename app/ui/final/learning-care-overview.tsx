'use client';
import { useState } from 'react';
import { ArrowUpRight, Flag } from 'lucide-react';
import { careThirtyDayProgress, careBandLabels, careAttention, careDaySummaries, careProgress, type CareRow, type CareBand } from '@/lib/learning-care';

const bands: CareBand[] = ['starting', 'progressing', 'finishing', 'unknown'];
const ranges = { starting: '10% 미만', progressing: '10% 이상 ~ 80% 미만', finishing: '80% ~ 100%', unknown: '미등록·설정 확인' };

export function CareOverview({ rows, asOf, onStudent, onDay }: {
  rows: CareRow[]; asOf: string; onStudent: (id: string) => void; onDay: (id: string, filter: string) => void;
}) {
  const [search, setSearch] = useState(''), [band, setBand] = useState<CareBand | 'all'>('all'), [attentionOnly, setAttentionOnly] = useState(false);
  const students = rows.map(row => ({ row, progress: careThirtyDayProgress(row.cells), attention: careAttention(row, asOf) }));
  const shown = students.filter(({ row, progress, attention }) =>
    `${row.name || ''} ${row.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (band === 'all' || band === progress.band) && (!attentionOnly || attention.needsAttention));
  const days = careDaySummaries(rows);
  return <section className="care-overview" aria-label="기수별 30일 미션 현황판">
    <div className="care-board-heading"><div><span className="care-eyebrow">30 DAYS · ONE STEP AT A TIME</span><h2>우리 기수의 완주 지도</h2><p>색은 30일 기준 완성도, 깃발은 지금 확인할 일입니다.</p></div><span className="care-board-count">{rows.length}개 수강 기록</span></div>
    <div className="care-band-filters" aria-label="전체 30일 완주율 필터">
      <button aria-pressed={band === 'all'} onClick={() => setBand('all')}>전체 <b>{rows.length}</b></button>
      {bands.map(value => <button key={value} className={'care-band-filter care-band-' + value} aria-pressed={band === value} onClick={() => setBand(value)}><i aria-hidden="true"/><span>{careBandLabels[value]}<small>{ranges[value]}</small></span><b>{students.filter(s => s.progress.band === value).length}</b></button>)}
    </div>
    <div className="care-board-tools"><label>수강생 찾기<input placeholder="이름 또는 이메일" value={search} onChange={e => setSearch(e.target.value)}/></label><button className="care-attention-toggle" aria-pressed={attentionOnly} onClick={() => setAttentionOnly(v => !v)}><Flag size={15}/> 확인 필요만 <b>{students.filter(s => s.attention.needsAttention).length}</b></button><small>현재 {shown.length}명 표시</small></div>
    <div className="care-student-tiles">
      {shown.map(({ row, progress, attention }) => {
        const published = careProgress(row.cells, 'daily');
        const next = row.cells.find(c => c.track === 'daily' && c.published && ['changes_requested', 'not_submitted'].includes(c.state));
        return <button key={row.enrollmentId} className={'care-student-tile care-band-' + progress.band} aria-label={`${row.name || '이름 미등록'} 상세 · 전체 30일 ${progress.percent === null ? '집계 준비' : progress.percent + '%'}`} onClick={() => onStudent(row.enrollmentId)}>
          <span className="care-tile-top"><b>{row.name || '이름 미등록'}</b><ArrowUpRight size={17}/></span>
          <span className="care-tile-number">{progress.percent === null ? '—' : progress.percent}<small>{progress.percent === null ? '집계 준비' : '%'}</small></span>
          <span className="care-tile-caption">{careBandLabels[progress.band]} · {progress.invalid ? 'DAY 설정 확인' : `${progress.done}/30일 완료`}</span>
          <span className="care-tile-progress" aria-hidden="true"><i style={{ width: `${progress.percent || 0}%` }}/></span>
          <span className="care-tile-next">{progress.invalid ? '같은 DAY의 미션 구성을 확인해 주세요' : next ? `다음: DAY ${next.day}` : attention.pending ? '제출한 미션 검토를 기다리고 있어요' : progress.done === 30 ? '30일 완주를 축하해요!' : '다음 미션을 기다리고 있어요'}</span>
          <span className="care-tile-published">공개 미션 {published.done}/{published.total} 완료{progress.registered < 30 ? ` · 등록 ${progress.registered}/30` : ''}</span>
          <span className="care-tile-signals">{attention.returned > 0 && <span className="care-signal"><Flag size={12}/> 보완 요청 {attention.returned}건</span>}{attention.followUp && <span className="care-signal"><Flag size={12}/> 진행 확인</span>}{attention.pending > 0 && <span className="care-signal care-signal-review">운영자 검토 {attention.pending}건</span>}</span>
        </button>;
      })}
    </div>
    {!shown.length && <p className="care-empty">조건에 맞는 수강생이 없습니다.</p>}
    <p className="care-note">30일 완주율은 DAY 1~30 미션을 기준으로 계산합니다. 아직 등록·공개되지 않은 날도 30일 목표에 포함됩니다. 빨강은 시작 단계이며 지연 판정이 아닙니다. 확인 필요는 보완 요청 또는 3일 이상 방문 기록이 없고 지금 수행 가능한 항목이 있는 경우입니다.</p>
    <section className="care-day-overview" aria-label="DAY별 미션 완료율">
      <div className="care-board-heading"><div><h2>어느 DAY에서 도움이 필요할까요?</h2><p>기수 전체의 공개된 미션 기준입니다. 날짜를 누르면 해당 명단이 열립니다.</p></div></div>
      <div className="care-day-tiles">{days.map(day => <article key={day.day} className={!day.available ? 'care-day-unpublished' : ''}>
        <button disabled={!day.lessonId} onClick={() => day.lessonId && onDay(day.lessonId, 'all')} aria-label={`DAY ${day.day} 명단 보기`}><b>DAY {day.day}</b><strong>{day.percent === null ? '—' : day.percent + '%'}</strong><span>{day.invalid ? '설정 확인' : !day.registered ? '미등록' : !day.available ? '공개 예정' : `${day.done}/${day.available}명 완료`}</span><progress value={day.done} max={day.available || 1} aria-label={`DAY ${day.day} 완료율`}/></button>
        {day.available > 0 && !day.invalid && <div className="care-day-actions">{([['not_submitted', '미제출', day.missing], ['submitted', '검토 대기', day.pending], ['changes_requested', '보완 요청', day.returned]] as const).map(([filter, label, count]) => count > 0 && <button key={filter} onClick={() => day.lessonId && onDay(day.lessonId, filter)} aria-label={`DAY ${day.day} ${label} ${count}명`}>{label} <b>{count}</b></button>)}{day.locked > 0 && <small>앞 단계 대기 {day.locked}</small>}</div>}
      </article>)}</div>
    </section>
  </section>;
}
