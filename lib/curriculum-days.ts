import type { Row } from './platform';

type Curriculum = Record<string, Row[]>;
const ordinal = (row: Row, key: string) => Number(row[key]) || 0;

/** Display ordinals only. Stored week-local order and progression gates stay unchanged. */
export function curriculumDayNumbers(data: Curriculum): Map<string, number> {
  const result = new Map<string, number>();
  const totals = new Map<string, number>();
  const weeks = (data.curriculum_weeks || []).filter(week => !week.archived_at)
    .toSorted((a, b) => ordinal(a, 'week_number') - ordinal(b, 'week_number') || a.id.localeCompare(b.id));
  for (const week of weeks) {
    const lessons = (data.curriculum_lessons || []).filter(lesson => lesson.week_id === week.id && !lesson.archived_at)
      .toSorted((a, b) => ordinal(a, 'day_number') - ordinal(b, 'day_number') || a.id.localeCompare(b.id));
    const course = String(week.course_id);
    // Preparation week is independent of the main course's day one.
    if (ordinal(week, 'week_number') <= 0) {
      for (const lesson of lessons) result.set(lesson.id, ordinal(lesson, 'day_number'));
      continue;
    }
    let count = totals.get(course) || 0;
    for (const lesson of lessons) result.set(lesson.id, ++count);
    totals.set(course, count);
  }
  return result;
}

/** Learners receive the server-computed ordinal before visibility filtering. */
export function curriculumDay(data: Curriculum, lesson?: Row): number {
  if (!lesson) return 0;
  const supplied = lesson.curriculum_day_number;
  if (Number.isInteger(supplied) && Number(supplied) >= 0) return Number(supplied);
  return curriculumDayNumbers(data).get(lesson.id) ?? ordinal(lesson, 'day_number');
}
