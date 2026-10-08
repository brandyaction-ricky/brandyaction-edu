export type CareState = 'completed' | 'submitted' | 'changes_requested' | 'not_submitted' | 'locked' | 'scheduled' | 'error';
export type CareCell = { lessonId: string; title: string; week: number; day: number; track: string; state: CareState; published: boolean; completedAt: string | null; submittedAt: string | null; reviewedAt: string | null; submissionId: string | null; reason: string };
export type CareRow = { enrollmentId: string; memberId: string; name: string | null; email: string | null; cells: CareCell[]; lastVisitAt: string | null; lastContactAt: string | null; openQuestions: number };
export type CareSnapshot = { cohorts: { id: string; name: string; courseTitle: string }[]; cohortId: string | null; rows: CareRow[]; asOf: string };
export type PersonalCare = { asOf: string; rows: { enrollmentId: string; courseTitle: string; cohortName: string; cells: CareCell[] }[] };
export const careLabels: Record<CareState, string> = { completed: '완료', submitted: '검토 대기', changes_requested: '보완 요청', not_submitted: '미제출', locked: '앞 단계 대기', scheduled: '공개 예정', error: '설정 확인' };
export const careSymbols: Record<CareState, string> = { completed: '✓', submitted: '◷', changes_requested: '↻', not_submitted: '·', locked: '—', scheduled: '○', error: '!' };
export const careTime = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
export const careLessonLabel = (cell: CareCell) => `${cell.track === 'daily' ? '미션' : '학습'} · W${cell.week} DAY ${cell.day}`;
export function careProgress(cells: CareCell[], track?: string) {
  const available = cells.filter(c => c.published && (!track || (track === 'daily' ? c.track === 'daily' : c.track !== 'daily')));
  const total = available.length, done = available.filter(c => c.state === 'completed').length;
  return { total, done, percent: total && !available.some(c => c.state === 'error') ? Math.round(done / total * 100) : null };
}
export function recentlyContacted(row: CareRow, asOf: string) {
  return !!row.lastContactAt && Date.parse(row.lastContactAt) > Date.parse(asOf) - 86400000;
}
export function canCareContact(row: CareRow, lessonId: string, asOf: string) {
  return !recentlyContacted(row, asOf) && row.cells.some(c => c.lessonId === lessonId && ['not_submitted', 'changes_requested'].includes(c.state));
}
export function nextCareCell(cells: CareCell[]) {
  return cells.find(c => c.state === 'changes_requested') || cells.find(c => c.state === 'not_submitted') || cells.find(c => c.state === 'submitted');
}
// Shareable output uses only this aggregate projection, never member records.
export function careAggregate(rows: CareRow[], asOf: string) {
  const members = new Set(rows.map(r => r.memberId)).size;
  const cells = rows.flatMap(r => r.cells).filter(c => c.published);
  const completed = cells.filter(c => c.state === 'completed');
  return { members, enrollments: rows.length, available: cells.length, completed: completed.length,
    learning: completed.filter(c => c.track !== 'daily').length, missions: completed.filter(c => c.track === 'daily').length,
    recent: completed.filter(c => c.completedAt && Date.parse(c.completedAt) >= Date.parse(asOf) - 7 * 86400000 && Date.parse(c.completedAt) <= Date.parse(asOf)).length,
    pending: cells.filter(c => c.state === 'submitted').length,
    percent: cells.length && !cells.some(c => c.state === 'error') ? Math.round(completed.length / cells.length * 100) : null };
}
