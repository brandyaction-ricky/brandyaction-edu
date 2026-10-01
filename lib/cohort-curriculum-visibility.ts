import type { Row } from './platform';

export type CohortCurriculumData = Record<string, Row[]>;

export function cohortWeekVisible(data: CohortCurriculumData, cohortId: string, week: Row): boolean {
  if (!week.is_published || week.archived_at) return false;
  return (data.edu_cohort_week_visibility || []).some(row =>
    row.cohort_id === cohortId && row.week_id === week.id && row.is_published === true);
}

export function cohortLessonVisible(data: CohortCurriculumData, cohortId: string, lesson: Row): boolean {
  if (!lesson.is_published || lesson.archived_at) return false;
  const week = (data.curriculum_weeks || []).find(row => row.id === lesson.week_id);
  return Boolean(week && cohortWeekVisible(data, cohortId, week) &&
    (data.edu_cohort_lesson_visibility || []).some(row =>
      row.cohort_id === cohortId && row.lesson_id === lesson.id && row.is_published === true));
}

export function visibleLessonIds(data: CohortCurriculumData, cohortId: string): Set<string> {
  return new Set((data.curriculum_lessons || [])
    .filter(lesson => cohortLessonVisible(data, cohortId, lesson))
    .map(lesson => String(lesson.id)));
}
