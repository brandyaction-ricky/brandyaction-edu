import type { Row } from '../../../lib/platform';

// These fixtures represent cohorts that existed before the visibility migration.
// Mirror its backfill so learner screens exercise the new publication contract.
export function withExistingCohortVisibility<T extends {
  cohorts?: Row[];
  enrollments?: Row[];
  curriculum_weeks?: Row[];
  curriculum_lessons?: Row[];
}>(data: T) {
  const cohorts = data.cohorts || [];
  const courseFor = (cohort: Row) => cohort.course_id || data.enrollments?.find(enrollment => enrollment.cohort_id === cohort.id)?.course_id;
  const weeks = data.curriculum_weeks || [];
  const lessons = data.curriculum_lessons || [];
  return {
    ...data,
    edu_cohort_week_visibility: cohorts.flatMap(cohort => weeks
      .filter(week => week.course_id === courseFor(cohort))
      .map(week => ({ id: `${cohort.id}:${week.id}`, cohort_id: cohort.id, week_id: week.id, is_published: week.is_published === true }))),
    edu_cohort_lesson_visibility: cohorts.flatMap(cohort => lessons
      .filter(lesson => weeks.some(week => week.id === lesson.week_id && week.course_id === courseFor(cohort)))
      .map(lesson => ({ id: `${cohort.id}:${lesson.id}`, cohort_id: cohort.id, lesson_id: lesson.id, is_published: lesson.is_published === true }))),
  };
}
