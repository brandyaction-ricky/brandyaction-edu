'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AdminDrawer } from '@/features/admin-ui';
import { careLabels, careSymbols, careTime, careLessonLabel, careProgress, canCareContact, recentlyContacted, type CareCell, type CareRow } from '@/lib/learning-care';
import { MemberConversation } from './member-conversation';

export function CareStudentDetail({ row, asOf, messagesEnabled, onClose, onEncourage }: {
  row: CareRow; asOf: string; messagesEnabled: boolean; onClose: () => void; onEncourage: (row: CareRow, cell: CareCell) => void;
}) {
  const [history, setHistory] = useState(false), [lesson, setLesson] = useState('');
  const available = row.cells.filter(c => canCareContact(row, c.lessonId, asOf));
  const target = available.find(c => c.lessonId === lesson) || available.find(c => c.state === 'changes_requested') || available[0];
  const progress = careProgress(row.cells);
  const published = row.cells.filter(c => c.published), upcoming = row.cells.filter(c => !c.published);
  const state = (cell: CareCell) => <span className={'care-state care-' + cell.state}>{careSymbols[cell.state]} {careLabels[cell.state]}</span>;
  const items = (cells: CareCell[]) => cells.map(c => <article key={c.lessonId}><div className="care-detail-item-copy"><small>{careLessonLabel(c)}</small><b>{c.title}</b>{c.reason && <small>{c.reason}</small>}</div><div className="care-detail-item-state">{state(c)}<small>{c.state === 'completed' ? careTime(c.completedAt) : c.submittedAt ? '제출 ' + careTime(c.submittedAt) : ''}</small></div></article>);
  const unavailable = !messagesEnabled ? '메시지 기능을 준비 중입니다.' : row.contactEligible === false ? '수강권 상태 확인이 필요한 기록입니다. 안내는 보낼 수 없습니다.' : recentlyContacted(row, asOf) ? '최근 24시간 안에 안내했습니다. 이전 안내를 먼저 확인해 주세요.' : !target ? '지금 독려할 미완료 학습이 없습니다. 검토 대기 또는 공개 예정 항목은 안내 대상에서 제외합니다.' : '';
  return <AdminDrawer title="수강생 상세" size="large" className="care-detail-drawer" onClose={onClose}>
    <section className="care-detail" aria-label="수강생 상세">
      <div className="care-detail-top">
        <h2>{row.name || '회원'}님의 현재 위치</h2>
        <p>공개된 학습 <b>{progress.done}/{progress.total}개 완료 · {progress.percent === null ? '공개 전' : progress.percent + '%'}</b></p>
        {target && <label className="care-detail-target">독려할 학습<select aria-label="독려할 학습" value={target.lessonId} onChange={e => setLesson(e.target.value)}>{available.map(c => <option key={c.lessonId} value={c.lessonId}>{careLessonLabel(c)} · {c.title}</option>)}</select></label>}
        <div className="care-detail-actions">
          <button className="btn primary" disabled={!!unavailable} onClick={() => target && onEncourage(row, target)}>학습 독려하기</button>
          <button className="btn" aria-pressed={history} onClick={() => setHistory(v => !v)}>{history ? '학습 진행 보기' : '안내·질문 이력'}</button>
          {row.cells.some(c => c.submissionId) && <Link className="btn" href={'/admin/reviews?tab=blocks&member=' + row.memberId}>제출한 과제 보기</Link>}
        </div>
        <small className="care-detail-help">{unavailable || '독려할 학습을 선택하면 안내 문구를 확인한 뒤 보낼 수 있습니다.'}</small>
      </div>
      <div className="admin-dialog-body care-detail-body">
        {history ? <MemberConversation key={row.memberId} member={row.memberId}/> : <>
          <p className="care-note">최근 방문 {careTime(row.lastVisitAt)} · 마지막 안내 {careTime(row.lastContactAt)}</p>
          <div className="care-detail-list">{items(published)}</div>
          {!published.length && <p className="care-empty">아직 공개된 학습이 없습니다.</p>}
          {upcoming.length > 0 && <details className="care-upcoming"><summary>앞으로 공개할 학습 {upcoming.length}개</summary><div className="care-detail-list">{items(upcoming)}</div></details>}
        </>}
      </div>
    </section>
  </AdminDrawer>;
}
