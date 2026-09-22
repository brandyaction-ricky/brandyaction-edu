import { text as t, number as num, type Row } from '@/lib/platform';
import type { MissionData as Data } from '../api/contracts';
const rows = (data: Data, key: string) => data[key] || [];
export function enrollmentLessons(data: Data, e: Row) {
  const weeks = new Set(
    rows(data, "curriculum_weeks")
      .filter((w) => w.course_id === e.course_id)
      .map((w) => w.id),
  );
  return rows(data, "curriculum_lessons")
    .filter((l) => weeks.has(t(l, "week_id")))
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
}
export function missionEntries(data: Data, enrollments: Row[]) {
  return enrollments.flatMap((enrollment) => {
    const lessons = enrollmentLessons(data, enrollment);
    return rows(data, "curriculum_missions")
      .filter((m) => lessons.some((l) => l.id === m.lesson_id))
      .map((mission) => {
        const submission = rows(data, "mission_submissions")
          .filter(
            (s) =>
              s.mission_id === mission.id && s.enrollment_id === enrollment.id,
          )
          .sort(
            (a, b) => num(b, "attempt_number") - num(a, "attempt_number"),
          )[0];
        return {
          mission,
          enrollment,
          submission,
          lesson: lessons.find((l) => l.id === mission.lesson_id),
          status: t(submission, "status") || "draft",
          href:
            "/learn/" +
            enrollment.id +
            "/" +
            mission.lesson_id +
            "/mission?mission=" +
            mission.id,
        };
      });
  });
}
