import { careAggregate, careAttention, careLearningCells, careLearningProgress, careLearningSnapshot, type CareBand, type CareSnapshot } from './learning-care';

export type ClassStudentsInput = {
  cohort: string;
  student_name?: string;
  progress_range?: CareBand | 'all';
  inactive_only?: boolean;
  attention_only?: boolean;
  offset?: number;
  limit?: number;
};
export class ClassStudentsInputError extends Error {}
const invalid = () => new ClassStudentsInputError('기수와 조회 조건을 확인해 주세요.');
const bands = ['all', 'starting', 'progressing', 'finishing', 'unknown'];
const keys = ['cohort', 'student_name', 'progress_range', 'inactive_only', 'attention_only', 'offset', 'limit'];
export function parseClassStudentsInput(value: unknown): ClassStudentsInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !keys.includes(key))) throw invalid();
  for (const [key, max] of [['cohort', 200], ['student_name', 100]] as const) {
    const text = input[key];
    if ((key === 'cohort' || text !== undefined) && (typeof text !== 'string' || text.length > max || /[\u0000-\u001f]/u.test(text) || (key === 'cohort' && !text.trim()))) throw invalid();
  }
  if (input.progress_range !== undefined && (typeof input.progress_range !== 'string' || !bands.includes(input.progress_range))) throw invalid();
  for (const key of ['inactive_only', 'attention_only']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw invalid();
  for (const [key, min, max] of [['offset', 0, 100000], ['limit', 1, 100]] as const) {
    const number = input[key];
    if (number !== undefined && (typeof number !== 'number' || !Number.isInteger(number) || number < min || number > max)) throw invalid();
  }
  const cohort = (input.cohort as string).trim();
  return { ...input, cohort: classStudentsUuid(cohort) ? cohort.toLowerCase() : cohort, student_name: (input.student_name as string | undefined)?.trim(), offset: input.offset ?? 0, limit: input.limit ?? 50 } as ClassStudentsInput;
}
export const classStudentsUuid = (value: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const classLabel = (value: string) => value.normalize('NFKC').replace(/[·\s]+/gu, ' ').trim().toLowerCase();
export function resolveClassStudentsCohort(snapshot: CareSnapshot, name: string) {
  const label = classLabel(name);
  const matches = snapshot.cohorts.filter(cohort => cohort.id === name || classLabel(cohort.name) === label || classLabel(`${cohort.courseTitle} ${cohort.name}`) === label);
  if (matches.length !== 1) throw new ClassStudentsInputError('과정명과 기수명을 함께 정확하게 입력해 주세요.');
  return matches[0].id;
}

// Whitelist every returned field. Neither model arguments nor snapshots are
// spread into the response, which must never contain contacts or member IDs.
export function classStudentsProjection(raw: CareSnapshot, input: ClassStudentsInput) {
  const snapshot = careLearningSnapshot(raw);
  const cohort = snapshot.cohorts.find(choice => choice.id === snapshot.cohortId);
  if (!cohort || !Number.isFinite(Date.parse(snapshot.asOf))) throw invalid();
  const query = (input.student_name || '').toLowerCase();
  const students = snapshot.rows.map(row => {
    const progress = careLearningProgress(row.cells), attention = careAttention(row, snapshot.asOf);
    // This is the dashboard's next-item order, rather than the learner widget's
    // priority order. Unknown visits are not inferred to be inactivity.
    const next = progress.invalid ? undefined : careLearningCells(row.cells).find(cell => cell.published && ['changes_requested', 'not_submitted'].includes(cell.state));
    const inactive = !!row.lastVisitAt && Date.parse(row.lastVisitAt) < Date.parse(snapshot.asOf) - 3 * 86400000;
    return {
      name: row.name || '이름 미등록', progress_percent: progress.percent,
      progress_range: progress.band, completed_learning: progress.done,
      total_published_learning: progress.total,
      next_learning: next ? { title: next.title, week: next.week, day: next.day } : null,
      last_visit_at: row.lastVisitAt, inactive,
      needs_attention: attention.needsAttention,
    };
  });
  const filtered = students.filter(student => student.name.toLowerCase().includes(query) &&
    (!input.progress_range || input.progress_range === 'all' || input.progress_range === student.progress_range) &&
    (!input.inactive_only || student.inactive) && (!input.attention_only || student.needs_attention));
  const offset = input.offset ?? 0, limit = input.limit ?? 50;
  const page = filtered.slice(offset, offset + limit);
  return {
    as_of: snapshot.asOf,
    cohort_name: `${cohort.courseTitle} · ${cohort.name}`,
    total_students: careAggregate(snapshot.rows, snapshot.asOf).members,
    total_enrollments: snapshot.rows.length,
    matching_enrollments: filtered.length,
    offset, limit, next_offset: offset + page.length < filtered.length ? offset + page.length : null,
    students: page,
  };
}
