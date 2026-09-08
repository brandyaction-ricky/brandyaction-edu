export type LearningProgressRow = {
  lesson_id: string;
  progress_percent: number | null;
};

export type EnrollmentProgressRow = LearningProgressRow & {
  enrollment_id: string;
};

export type EnrollmentCourseRef = {
  id: string;
  course_id: string;
};

export type CourseLessonRef = {
  course_id: string;
  lesson_id: string;
};

export type LearningProgressSummary = {
  percent: number;
  completed: number;
  total: number;
};

export type MissionStatus = "draft" | "submitted" | "pending" | "approved" | "changes_requested" | "rejected";

export type MissionAchievementRow = {
  mission_id: string;
  status: MissionStatus;
};

export type AchievementLevel = {
  number: 1 | 2 | 3 | 4 | 5;
  name: "시작" | "실행" | "성장" | "성과" | "완주";
  minimumPercent: number;
};

export type AchievementSummary = {
  available: boolean;
  percent: number | null;
  approved: number;
  pending: number;
  rejected: number;
  total: number | null;
  level: AchievementLevel | null;
};

const ACHIEVEMENT_LEVELS: AchievementLevel[] = [
  { number: 1, name: "시작", minimumPercent: 0 },
  { number: 2, name: "실행", minimumPercent: 25 },
  { number: 3, name: "성장", minimumPercent: 50 },
  { number: 4, name: "성과", minimumPercent: 75 },
  { number: 5, name: "완주", minimumPercent: 100 },
];

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

export function calculateLearningProgress(
  lessonIds: Iterable<string>,
  progressRows: LearningProgressRow[],
): LearningProgressSummary {
  const uniqueLessonIds = [...new Set(lessonIds)];
  if (!uniqueLessonIds.length) return { percent: 0, completed: 0, total: 0 };

  const allowedLessons = new Set(uniqueLessonIds);
  const progressByLesson = new Map<string, number>();
  for (const row of progressRows) {
    if (!allowedLessons.has(row.lesson_id)) continue;
    const value = clampPercent(row.progress_percent);
    progressByLesson.set(row.lesson_id, Math.max(progressByLesson.get(row.lesson_id) || 0, value));
  }

  const progressTotal = uniqueLessonIds.reduce(
    (sum, lessonId) => sum + (progressByLesson.get(lessonId) || 0),
    0,
  );
  const completed = uniqueLessonIds.filter((lessonId) => (progressByLesson.get(lessonId) || 0) >= 100).length;

  return {
    percent: completed === uniqueLessonIds.length ? 100 : Math.min(99, Math.round(progressTotal / uniqueLessonIds.length)),
    completed,
    total: uniqueLessonIds.length,
  };
}

export function calculateLearningProgressByEnrollment(
  enrollments: EnrollmentCourseRef[],
  courseLessons: CourseLessonRef[],
  progressRows: EnrollmentProgressRow[],
) {
  const lessonIdsByCourse = new Map<string, string[]>();
  for (const lesson of courseLessons) {
    const lessonIds = lessonIdsByCourse.get(lesson.course_id) || [];
    lessonIds.push(lesson.lesson_id);
    lessonIdsByCourse.set(lesson.course_id, lessonIds);
  }

  const progressRowsByEnrollment = new Map<string, LearningProgressRow[]>();
  for (const row of progressRows) {
    const rows = progressRowsByEnrollment.get(row.enrollment_id) || [];
    rows.push(row);
    progressRowsByEnrollment.set(row.enrollment_id, rows);
  }

  return new Map(enrollments.map((enrollment) => [
    enrollment.id,
    calculateLearningProgress(
      lessonIdsByCourse.get(enrollment.course_id) || [],
      progressRowsByEnrollment.get(enrollment.id) || [],
    ),
  ]));
}

export function getAchievementLevel(percent: number): AchievementLevel {
  const normalized = clampPercent(percent);
  return [...ACHIEVEMENT_LEVELS].reverse().find((level) => normalized >= level.minimumPercent) || ACHIEVEMENT_LEVELS[0];
}

export function calculateAchievement(
  totalMissions: number | null,
  rows: MissionAchievementRow[] = [],
): AchievementSummary {
  if (totalMissions === null) {
    return { available: false, percent: null, approved: 0, pending: 0, rejected: 0, total: null, level: null };
  }

  const total = Math.max(0, Math.floor(totalMissions));
  const latestByMission = new Map(rows.map((row) => [row.mission_id, row.status]));
  const statuses = [...latestByMission.values()];
  const approved = Math.min(total, statuses.filter((status) => status === "approved").length);
  const pending = statuses.filter((status) => status === "submitted" || status === "pending").length;
  const rejected = statuses.filter((status) => status === "rejected" || status === "changes_requested").length;
  const percent = total ? (approved === total ? 100 : Math.min(99, Math.floor((approved / total) * 100))) : 0;

  return {
    available: true,
    percent,
    approved,
    pending,
    rejected,
    total,
    level: getAchievementLevel(percent),
  };
}

export const unavailableAchievement = calculateAchievement(null);
