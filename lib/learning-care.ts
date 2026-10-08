export type CareState = 'completed' | 'submitted' | 'changes_requested' | 'not_submitted' | 'locked' | 'scheduled' | 'error';
export type CareCell = { lessonId: string; title: string; week: number; day: number; track: string; state: CareState; published: boolean; completedAt: string | null; submittedAt: string | null; reviewedAt: string | null; submissionId: string | null; reason: string };
export type CareRow = { enrollmentId: string; memberId: string; name: string | null; email: string | null; cells: CareCell[]; lastVisitAt: string | null; lastContactAt: string | null; openQuestions: number; contactEligible?: boolean };
export type CareSnapshot = { cohorts: { id: string; name: string; courseTitle: string; status?: 'in_progress' | 'upcoming' | 'completed'; startsAt?: string | null; endsAt?: string | null; memberCount?: number }[]; cohortId: string | null; rows: CareRow[]; asOf: string };
export type PersonalCare = { asOf: string; rows: { enrollmentId: string; courseTitle: string; cohortName: string; cells: CareCell[] }[] };
// Admin care tracks the curriculum's learning items; standalone missions remain in the curriculum itself.
export const careLearningCells = (cells: CareCell[]) => cells.filter(c => c.track !== 'daily');
export function careLearningSnapshot<T extends CareSnapshot>(snapshot: T): T {
  return { ...snapshot, rows: snapshot.rows.map(row => ({ ...row, cells: careLearningCells(row.cells) })) };
}
export function careLearningLessons(rows: CareRow[]) {
  return [...new Map(rows.flatMap(row => careLearningCells(row.cells)).map(cell => [cell.lessonId, cell])).values()]
    .sort((a, b) => a.week - b.week || a.day - b.day || a.lessonId.localeCompare(b.lessonId));
}
export const careLabels: Record<CareState, string> = { completed: '완료', submitted: '검토 대기', changes_requested: '보완 요청', not_submitted: '미완료', locked: '앞 단계 대기', scheduled: '공개 예정', error: '설정 확인' };
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
  return row.contactEligible !== false && !recentlyContacted(row, asOf) && row.cells.some(c => c.track !== 'daily' && c.published && c.lessonId === lessonId && ['not_submitted', 'changes_requested'].includes(c.state));
}
export function nextCareCell(cells: CareCell[]) {
  return cells.find(c => c.state === 'changes_requested') || cells.find(c => c.state === 'not_submitted') || cells.find(c => c.state === 'submitted');
}
// Shareable output uses only this aggregate projection, never member records.
export function careAggregate(rows: CareRow[], asOf: string) {
  const members = new Set(rows.map(r => r.memberId)).size;
  const cells = rows.flatMap(r => careLearningCells(r.cells)).filter(c => c.published);
  const completed = cells.filter(c => c.state === 'completed');
  return { members, enrollments: rows.length, available: cells.length, completed: completed.length,
    learning: completed.length,
    recent: completed.filter(c => c.completedAt && Date.parse(c.completedAt) >= Date.parse(asOf) - 7 * 86400000 && Date.parse(c.completedAt) <= Date.parse(asOf)).length,
    pending: cells.filter(c => c.state === 'submitted').length,
    percent: cells.length && !cells.some(c => c.state === 'error') ? Math.round(completed.length / cells.length * 100) : null };
}

export function careLearningProgress(cells: CareCell[]) {
  const p = careProgress(cells, 'learning');
  const invalid = careLearningCells(cells).some(c => c.published && c.state === 'error');
  const band: CareBand = p.percent === null ? 'unknown' : p.done / p.total < .1 ? 'starting' : p.done / p.total < .8 ? 'progressing' : 'finishing';
  return { ...p, band, invalid };
}
export type CareBand = 'starting' | 'progressing' | 'finishing' | 'unknown';
export const careBandLabels: Record<CareBand, string> = { starting: '시작 단계', progressing: '진행 중', finishing: '완주에 가까움', unknown: '공개 전·설정 확인' };
export function careAttention(row: CareRow, asOf: string) {
  const cells = careLearningCells(row.cells).filter(c => c.published);
  const returned = cells.filter(c => c.state === 'changes_requested').length;
  const pending = cells.filter(c => c.state === 'submitted').length;
  const stale = !!row.lastVisitAt && Date.parse(row.lastVisitAt) <= Date.parse(asOf) - 3 * 86400000;
  const followUp = stale && cells.some(c => c.state === 'not_submitted');
  return { returned, pending, followUp, needsAttention: returned > 0 || followUp };
}
export function careDaySummaries(rows: CareRow[]) {
  const byRow = rows.map(row => {
    const groups = new Map<string, CareCell[]>();
    for (const cell of careLearningCells(row.cells)) {
      const group = groups.get(cell.lessonId) || [];
      group.push(cell); groups.set(cell.lessonId, group);
    }
    return groups;
  });
  return careLearningLessons(rows).map(lesson => {
    const groups = byRow.map(index => index.get(lesson.lessonId) || []);
    const cells = groups.flat();
    const invalid = groups.some(g => g.length > 1) || cells.some(c => c.state === 'error');
    const published = cells.filter(c => c.published);
    const done = published.filter(c => c.state === 'completed').length;
    return { day: lesson.day, week: lesson.week, title: lesson.title, lessonId: lesson.lessonId, invalid,
      available: published.length, done, percent: !invalid && published.length ? Math.round(done / published.length * 100) : null,
      pending: published.filter(c => c.state === 'submitted').length,
      returned: published.filter(c => c.state === 'changes_requested').length,
      missing: published.filter(c => c.state === 'not_submitted').length,
      locked: published.filter(c => c.state === 'locked').length };
  });
}

export const careCohortStatus = { in_progress: '진행 중', upcoming: '시작 전', completed: '종료' };
