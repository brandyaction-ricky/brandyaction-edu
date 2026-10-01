import { number as num, text, type Row } from './platform';
import { lessonBodyHasText } from './lesson-body';

export type CurriculumData = Record<string, Row[]>;
export type VisibilityDraft = Record<string, boolean>;
export const visibilityKey = (kind: 'weeks' | 'learning', id: string) => `${kind}:${id}`;
export function curriculumRows(data: CurriculumData, courseId: string) {
  const weeks = (data.curriculum_weeks || []).filter(row => row.course_id === courseId && !row.archived_at).toSorted((a,b) => num(a,'week_number') - num(b,'week_number'));
  const ids = new Set(weeks.map(row => row.id));
  const lessons = (data.curriculum_lessons || []).filter(row => ids.has(String(row.week_id)) && !row.archived_at).toSorted((a,b) => num(a,'day_number') - num(b,'day_number'));
  return { weeks, lessons };
}
export function savedVisibility(data: CurriculumData, row: Row, kind: 'weeks' | 'learning', cohortId = '') {
  if (!cohortId) return Boolean(row.is_published);
  const table = kind === 'weeks' ? 'edu_cohort_week_visibility' : 'edu_cohort_lesson_visibility';
  const key = kind === 'weeks' ? 'week_id' : 'lesson_id';
  return Boolean(row.is_published && (data[table] || []).some(value =>
    value.cohort_id === cohortId && value[key] === row.id && value.is_published === true));
}
export function plannedVisibility(row: Row, kind: 'weeks' | 'learning', draft: VisibilityDraft, data?: CurriculumData, cohortId = '') {
  return draft[visibilityKey(kind, String(row.id))] ?? (data ? savedVisibility(data,row,kind,cohortId) : Boolean(row.is_published));
}
export function lessonReady(lesson: Row, data: CurriculumData) {
  if (lesson.has_blocks) return true;
  const body = (data.lesson_contents || []).find(row => row.lesson_id === lesson.id);
  return Boolean(body && (lessonBodyHasText(text(body,'body_text')) || body.vod_url || body.external_url || body.resource_storage_path));
}
export function visibilityPlan(data: CurriculumData, courseId: string, draft: VisibilityDraft, cohortId = '') {
  const { weeks, lessons } = curriculumRows(data, courseId);
  const changes = (['weeks', 'learning'] as const).flatMap(section => (section === 'weeks' ? weeks : lessons).flatMap(row => {
    const value = plannedVisibility(row, section, draft, data, cohortId);
    return value === savedVisibility(data,row,section,cohortId) ? [] : [{ section, row, value }];
  }));
  // Close parents first; open parents only after all child settings have succeeded.
  const priority = (section: string, value: boolean) => !value ? (section === 'weeks' ? 0 : 1) : (section === 'learning' ? 2 : 3);
  changes.sort((a,b) => priority(a.section,a.value) - priority(b.section,b.value));
  const impacts = lessons.flatMap(lesson => {
    const week = weeks.find(row => row.id === lesson.week_id)!;
    const before = savedVisibility(data,week,'weeks',cohortId) && savedVisibility(data,lesson,'learning',cohortId);
    const after = plannedVisibility(week, 'weeks', draft, data, cohortId) && plannedVisibility(lesson, 'learning', draft, data, cohortId);
    return before === after ? [] : [{ lesson, week, before, after }];
  });
  const invalid = lessons.filter(lesson => (!lessonReady(lesson,data) || (cohortId && (!lesson.is_published || !weeks.find(week=>week.id===lesson.week_id)?.is_published))) && (
    changes.some(change => change.section === 'learning' && change.row.id === lesson.id && change.value)
    || impacts.some(impact => impact.lesson.id === lesson.id && impact.after)
  ));
  return { changes, impacts, invalid };
}
export function curriculumFingerprint(data: CurriculumData, courseId: string, cohortId = '') {
  const { weeks, lessons } = curriculumRows(data, courseId);
  return JSON.stringify({ rows: [weeks,lessons].map(rows => rows.map(row => [row.id,row.week_id,row.week_number,row.day_number,row.title,row.updated_at,Boolean(row.is_published),Boolean(row.is_preview),Boolean(row.has_blocks)])),
    cohortId, weeks: weeks.map(row => savedVisibility(data,row,'weeks',cohortId)), lessons: lessons.map(row => savedVisibility(data,row,'learning',cohortId)) });
}
