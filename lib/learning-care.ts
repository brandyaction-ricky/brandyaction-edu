export type CareState = 'completed' | 'submitted' | 'changes_requested' | 'not_submitted' | 'locked' | 'scheduled' | 'error';
export type CareCell = { lessonId: string; title: string; week: number; day: number; track: string; state: CareState; published: boolean; completedAt: string | null; submittedAt: string | null; reviewedAt: string | null; submissionId: string | null; reason: string };
export type CareRow = { enrollmentId: string; memberId: string; name: string | null; email: string | null; cells: CareCell[]; lastVisitAt: string | null; lastContactAt: string | null; openQuestions: number };
export type CareSnapshot = { cohorts: { id: string; name: string; courseTitle: string }[]; cohortId: string | null; rows: CareRow[]; asOf: string };
export type PersonalCare = { asOf: string; rows: { enrollmentId: string; courseTitle: string; cohortName: string; cells: CareCell[] }[] };
export const careLabels: Record<CareState, string> = { completed: '완료', submitted: '검토 대기', changes_requested: '보완 요청', not_submitted: '미제출', locked: '앞 단계 대기', scheduled: '공개 예정', error: '설정 확인' };
export const careSymbols: Record<CareState, string> = { completed: '✓', submitted: '◷', changes_requested: '↻', not_submitted: '·', locked: '—', scheduled: '○', error: '!' };
export const careTime = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
export const careLessonLabel = (cell: CareCell) => `${cell.track === 'daily' ? '미션' : '학습'} · ${cell.week}주차 ${cell.day}일차`;
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

export const careMissionTarget = 30;
export type CareBand = 'starting' | 'progressing' | 'finishing' | 'unknown';
export const careBandLabels: Record<CareBand, string> = { starting: '시작 단계', progressing: '진행 중', finishing: '완주에 가까움', unknown: '미션 확인 필요' };
// The agreed 30-day reference is separate from the currently published denominator.
export function careThirtyDayProgress(cells: CareCell[]) {
  const missions = cells.filter(c => c.track === 'daily' && Number.isInteger(c.day) && c.day >= 1 && c.day <= careMissionTarget);
  const uniqueDays = new Set(missions.map(c => c.day));
  const invalid = missions.some(c => c.state === 'error') || uniqueDays.size !== missions.length;
  const done = missions.filter(c => c.published && c.state === 'completed').length;
  const percent = missions.length && !invalid ? Math.round(done / careMissionTarget * 100) : null;
  const band: CareBand = percent === null ? 'unknown' : done < 3 ? 'starting' : done < 24 ? 'progressing' : 'finishing';
  return { done, total: careMissionTarget, registered: uniqueDays.size, percent, band, invalid };
}
export function careAttention(row: CareRow, asOf: string) {
  const cells = row.cells.filter(c => c.published);
  const returned = cells.filter(c => c.state === 'changes_requested').length;
  const pending = cells.filter(c => c.state === 'submitted').length;
  const stale = !!row.lastVisitAt && Date.parse(row.lastVisitAt) <= Date.parse(asOf) - 3 * 86400000;
  const followUp = stale && cells.some(c => c.state === 'not_submitted');
  return { returned, pending, followUp, needsAttention: returned > 0 || followUp };
}
export function careDaySummaries(rows: CareRow[]) {
  return Array.from({ length: careMissionTarget }, (_, i) => {
    const day = i + 1;
    const groups = rows.map(r => r.cells.filter(c => c.track === 'daily' && c.day === day));
    const cells = groups.flat(), ids = new Set(cells.map(c => c.lessonId));
    const invalid = groups.some(g => g.length > 1) || ids.size > 1 || cells.some(c => c.state === 'error');
    const published = cells.filter(c => c.published);
    const done = published.filter(c => c.state === 'completed').length;
    return { day, lessonId: !invalid && ids.size === 1 ? cells[0].lessonId : null, registered: cells.length > 0, invalid,
      available: published.length, done, percent: !invalid && published.length ? Math.round(done / published.length * 100) : null,
      pending: published.filter(c => c.state === 'submitted').length,
      returned: published.filter(c => c.state === 'changes_requested').length,
      missing: published.filter(c => c.state === 'not_submitted').length,
      locked: published.filter(c => c.state === 'locked').length };
  });
}
