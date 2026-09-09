import type { CurriculumLesson, CurriculumWeek } from "@/app/data";

export type MissionWorkspace = {
  courses: { id: string; title: string; slug: string; status: string }[];
  courseId: string | null;
  weeks: CurriculumWeek[];
  revision: string;
  counts: Record<string, { approved: number; pending: number }>;
};

export function missionIsVisible(week: CurriculumWeek, lesson: CurriculumLesson) {
  return Boolean(lesson.mission) && week.isPublished !== false && lesson.isPublished !== false && lesson.mission?.isPublished !== false;
}

/** Reorder only the mission slots, retaining every unrelated lesson and ID. */
export function reorderWeekMissions(weeks: CurriculumWeek[], weekId: string, fromId: string, toId: string) {
  if (fromId === toId) return weeks;
  return weeks.map((week) => {
    if (week.id !== weekId) return week;
    const missions = week.lessons.filter((lesson) => lesson.mission);
    const from = missions.findIndex((lesson) => lesson.id === fromId);
    const to = missions.findIndex((lesson) => lesson.id === toId);
    if (from < 0 || to < 0) return week;
    missions.splice(to, 0, missions.splice(from, 1)[0]);
    let index = 0;
    return { ...week, lessons: week.lessons.map((lesson) => lesson.mission ? missions[index++] : lesson) };
  });
}

export function missionSummary(weeks: CurriculumWeek[]) {
  let total = 0, published = 0, quizzes = 0;
  for (const week of weeks) for (const lesson of week.lessons) {
    if (!lesson.mission) continue;
    total++;
    if (missionIsVisible(week, lesson)) published++;
    if (lesson.mission.quiz) quizzes++;
  }
  return { total, published, private: total - published, quizzes };
}
