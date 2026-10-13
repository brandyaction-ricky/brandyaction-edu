'use client';
import { useState } from 'react';
import { ArrowUpRight, Flag } from 'lucide-react';
import { careLearningProgress, careBandLabels, careAttention, careTime, careDuration, currentCareCell, type CareRow, type CareBand } from '@/lib/learning-care';

import { CareDayOverview } from './learning-care-days';

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
  const attentionCount = new Set(students.filter(s => s.attention.needsAttention).map(s => s.row.memberId)).size;
  return <section className="care-overview" aria-label="기수별 수강생 현황판">
    <div className="care-attention-heading"><button className="care-attention-toggle" aria-pressed={attentionOnly} aria-controls="care-student-list" onClick={() => { setAttentionOnly(v => !v); setBand('all'); setSearch(''); }}><Flag size={15}/> 확인 필요 수강생 <b>{attentionCount}명</b></button><p>72시간 이상 학습 정체 · 3일 이상 방문 기록 없음 · 보완 요청</p></div>
    <div className="care-board-heading"><div><span className="care-eyebrow">기수별 진행 현황</span><h2>수강생별 진행률</h2><p>지금 공개된 학습 중 완료한 비율입니다.</p></div><span className="care-board-count">{rows.length}개 수강 기록</span></div>
    <div className="care-band-filters" aria-label="진행률 필터">
      <button aria-pressed={band === 'all'} onClick={() => setBand('all')}>전체 <b>{rows.length}</b></button>
      {bands.map(value => <button key={value} className={'care-band-filter care-band-' + value} aria-pressed={band === value} onClick={() => setBand(value)}><i aria-hidden="true"/><span>{value === 'finishing' ? '80% 이상 완료' : careBandLabels[value]}<small>{ranges[value]}</small></span><b>{students.filter(s => s.progress.band === value).length}</b></button>)}
    </div>
    <div className="care-board-tools"><label>수강생 찾기<input placeholder="이름 또는 이메일" value={search} onChange={e => setSearch(e.target.value)}/></label><small>수강 내역 {shown.length}건 표시</small></div>
    <div id="care-student-list">{attentionOnly ? <div className="care-table-scroll"><table className="care-table care-attention-table" aria-label="확인 필요 수강생 목록"><thead><tr><th>수강생</th><th>현재 진행할 일차</th><th>확인 필요 상태</th><th>정체 시간</th><th>마지막 방문</th><th>마지막 안내</th></tr></thead><tbody>{shown.map(({ row, attention }) => <tr key={row.enrollmentId}>
      <th><button className="care-name" onClick={() => onStudent(row.enrollmentId)}>{row.name || '이름 미등록'} <ArrowUpRight size={14}/></button></th>
      <td data-label="현재 진행할 일차">{attention.current ? `${attention.current.week}주차 ${attention.current.day}일차 · ${attention.current.title}` : '수행할 학습 없음'}</td>
      <td data-label="확인 필요 상태">{attention.stalled && <span className="care-signal">72시간 이상 학습 정체</span>}{attention.stale && <span className="care-signal">3일 이상 방문 기록 없음</span>}{attention.returned > 0 && <span className="care-signal">보완 요청 {attention.returned}건</span>}</td>
      <td data-label="정체 시간">{attention.current?.state === 'not_submitted' ? attention.current.timing?.state === 'first' ? '— (첫 일차)' : careDuration(attention.stalledMilliseconds) : '—'}</td><td data-label="마지막 방문">{careTime(row.lastVisitAt)}</td><td data-label="마지막 안내">{careTime(row.lastContactAt)}</td>
    </tr>)}</tbody></table></div> : <div className="care-student-tiles">
      {shown.map(({ row, progress, attention }) => {
        const next = currentCareCell(row.cells);
        return <button key={row.enrollmentId} className={'care-student-tile care-band-' + progress.band} aria-label={`${row.name || '이름 미등록'} 상세 · 공개 학습 ${progress.percent === null ? '공개 전·설정 확인' : progress.percent + '%'}`} onClick={() => onStudent(row.enrollmentId)}>
          <span className="care-tile-top"><b>{row.name || '이름 미등록'}</b><ArrowUpRight size={17}/></span>
          <span className="care-tile-number">{progress.percent === null ? '—' : progress.percent}<small>{progress.percent === null ? '공개 전·설정 확인' : '%'}</small></span>
          <span className="care-tile-caption">{progress.invalid ? '설정 확인' : `${progress.done}/${progress.total}개 완료`}</span>
          <span className="care-tile-progress" aria-hidden="true"><i style={{ width: `${progress.percent || 0}%` }}/></span>
          <span className="care-tile-next">{progress.invalid ? '학습 설정 확인이 필요해요' : next ? `다음: ${next.week}주차 ${next.day}일차` : attention.pending ? '제출한 과제의 검토를 기다리고 있어요' : progress.percent === 100 ? '공개된 항목을 모두 완료했어요!' : '다음 학습 공개를 기다리고 있어요'}</span>

          <span className="care-tile-signals">{attention.returned > 0 && <span className="care-signal"><Flag size={12}/> 보완 요청 {attention.returned}건</span>}{attention.followUp && <span className="care-signal"><Flag size={12}/> 3일 이상 방문 기록 없음</span>}{attention.stalled && <span className="care-signal"><Flag size={12}/> 72시간 이상 학습 정체</span>}{attention.pending > 0 && <span className="care-signal care-signal-review">검토 대기 {attention.pending}건</span>}</span>
        </button>;
      })}
    </div>}</div>
    {!shown.length && <p className="care-empty">조건에 맞는 수강생이 없습니다.</p>}
    <p className="care-note">진행률에는 현재 공개된 학습만 포함합니다. 빨강은 시작 단계이며 지연 판정이 아닙니다. 확인 필요는 보완 요청, 이전 필수 학습 완료 후 수행할 학습이 72시간 이상 미완료인 경우, 또는 3일 이상 방문 기록이 없고 미완료 학습이 있는 경우입니다. 방문 기록 없음은 실제 미접속과 다를 수 있습니다.</p>
    <CareDayOverview rows={rows} asOf={asOf} onDay={onDay}/>
  </section>;
}
