import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { publicQuiz, type PublicQuiz, type QuizDefinition } from "@/lib/mission-quiz";
import { calculateAchievement, calculateLearningProgress, type AchievementSummary, type LearningProgressSummary } from "@/lib/achievement";
import { createClient } from "@/lib/supabase/server";
import { safeExternalUrl } from "@/lib/safe-url";

type Relation<T> = T | T[] | null;
function one<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] || null : value; }

type Course = { id: string; title: string; slug: string; summary: string | null; duration_label: string | null };
type Cohort = { id: string; name: string; operation_start_at: string | null; operation_end_at: string | null; status: string };
type EnrollmentRow = { id: string; course_id: string; cohort_id: string; access_starts_at: string; access_ends_at: string | null; courses: Relation<Course>; cohorts: Relation<Cohort> };

export type LearningLesson = {
  id: string;
  day: number;
  title: string;
  description: string;
  kind: "vod" | "material" | "text" | "link";
  duration: string;
  vodUrl: string | null;
  bodyText: string | null;
  externalUrl: string | null;
  resourceName: string | null;
  resourcePath: string | null;
  progress: number;
  mission: LearningMission | null;
};

export type LearningMission = {
  id: string;
  title: string;
  instructions: string;
  required: boolean;
  submissionType: "text" | "link" | "mixed" | "quiz";
  quiz: PublicQuiz | null;
  submission: {
    id: string;
    attempt: number;
    status: "submitted" | "changes_requested" | "approved" | "rejected";
    feedback: string;
    answerText: string;
    evidenceUrl: string;
  } | null;
};

export type LearningWeek = { id: string; number: number; title: string; goal: string; lessons: LearningLesson[] };
export type LearningSession = { id: string; number: number; title: string; expectedOutput: string; scheduledAt: string | null; liveUrl: string | null; replayUrl: string | null };
export type LearningHome = { enrollment: { id: string; accessEndsAt: string | null }; course: Course; cohort: Cohort; weeks: LearningWeek[]; sessions: LearningSession[]; learningProgress: LearningProgressSummary; achievement: AchievementSummary };

export async function getEnrollmentAchievements(enrollments: Array<{ id: string; courseId: string }>) {
  const summaries = new Map<string, AchievementSummary>();
  if (!enrollments.length) return summaries;
  const supabase = await createClient();
  const courseIds = [...new Set(enrollments.map((item) => item.courseId))];
  const enrollmentIds = enrollments.map((item) => item.id);
  const missionsResult = await supabase
    .from("curriculum_missions")
    .select("id,is_required,curriculum_lessons!inner(is_published,curriculum_weeks!inner(course_id,is_published))")
    .eq("is_published", true)
    .eq("is_required", true)
    .eq("curriculum_lessons.is_published", true)
    .eq("curriculum_lessons.curriculum_weeks.is_published", true)
    .in("curriculum_lessons.curriculum_weeks.course_id", courseIds);
  if (missionsResult.error) return summaries;
  const missionsByCourse = new Map<string, string[]>();
  for (const mission of missionsResult.data || []) {
    const lesson = one(mission.curriculum_lessons);
    const week = one(lesson?.curriculum_weeks || null);
    if (!week) continue;
    const ids = missionsByCourse.get(week.course_id) || [];
    ids.push(mission.id);
    missionsByCourse.set(week.course_id, ids);
  }
  const missionIds = (missionsResult.data || []).map((mission) => mission.id);
  const submissionsResult = missionIds.length
    ? await supabase
        .from("mission_submissions")
        .select("enrollment_id,mission_id,status,attempt_number")
        .in("enrollment_id", enrollmentIds)
        .in("mission_id", missionIds)
        .order("attempt_number", { ascending: true })
    : { data: [], error: null };
  if (submissionsResult.error) return summaries;
  for (const enrollment of enrollments) {
    const courseMissionIds = new Set(missionsByCourse.get(enrollment.courseId) || []);
    const rows = (submissionsResult.data || [])
      .filter((row) => row.enrollment_id === enrollment.id && courseMissionIds.has(row.mission_id))
      .map((row) => ({ mission_id: row.mission_id, status: row.status }));
    summaries.set(enrollment.id, calculateAchievement(courseMissionIds.size, rows));
  }
  return summaries;
}

export async function getLearningHome(enrollmentId: string): Promise<LearningHome | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: enrollmentData, error } = await supabase
    .from("enrollments")
    .select("id,course_id,cohort_id,access_starts_at,access_ends_at,profiles!enrollments_user_id_fkey!inner(status),courses(id,title,slug,summary,duration_label),cohorts(id,name,operation_start_at,operation_end_at,status)")
    .eq("id", enrollmentId)
    .eq("user_id", user.id)
    .eq("profiles.status", "active")
    .eq("status", "active")
    .lte("access_starts_at", new Date().toISOString())
    .maybeSingle();
  if (error || !enrollmentData) return null;
  const enrollment = enrollmentData as unknown as EnrollmentRow;
  if (enrollment.access_ends_at && new Date(enrollment.access_ends_at) <= new Date()) return null;
  const course = one(enrollment.courses);
  const cohort = one(enrollment.cohorts);
  if (!course || !cohort) return null;

  const [weeksResult, sessionsResult, progressResult] = await Promise.all([
    supabase.from("curriculum_weeks").select("id,week_number,title,goal,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,display_order,is_published,lesson_contents(vod_url,resource_name,resource_storage_path,body_text,external_url),curriculum_missions(id,title,instructions,is_required,submission_type,is_published))").eq("course_id", enrollment.course_id).eq("is_published", true).order("display_order"),
    supabase.from("cohort_sessions").select("id,session_number,title,expected_output,scheduled_at,cohort_session_contents(live_url,replay_url)").eq("cohort_id", enrollment.cohort_id).order("session_number"),
    supabase.from("lesson_progress").select("lesson_id,progress_percent").eq("enrollment_id", enrollment.id),
  ]);
  if (weeksResult.error || sessionsResult.error || progressResult.error) return null;
  const progress = new Map((progressResult.data || []).map((row) => [row.lesson_id, row.progress_percent]));
  const missionRows = (weeksResult.data || []).flatMap((week) =>
    (week.curriculum_lessons || []).flatMap((lesson) => {
      const relation = lesson.curriculum_missions;
      const mission = Array.isArray(relation) ? relation[0] : relation;
      return lesson.is_published && mission?.is_published ? [mission] : [];
    }),
  );
  const missionIds = missionRows.map((mission) => mission.id);
  const quizzesResult = missionIds.length ? await createAdminClient().from("mission_quizzes").select("mission_id,revision,questions,pass_percent").in("mission_id", missionIds) : { data: [], error: null };
  if (quizzesResult.error) return null;
  const quizzes = new Map((quizzesResult.data || []).map((quiz) => [quiz.mission_id, publicQuiz({ questions: quiz.questions, passPercent: quiz.pass_percent } as QuizDefinition, quiz.revision)]));
  const submissionsResult = missionIds.length
    ? await supabase
        .from("mission_submissions")
        .select("id,mission_id,attempt_number,status,response,reviewer_feedback")
        .eq("enrollment_id", enrollment.id)
        .in("mission_id", missionIds)
        .order("attempt_number", { ascending: false })
    : { data: [], error: null };
  if (submissionsResult.error) return null;
  const latestSubmission = new Map<string, (typeof submissionsResult.data)[number]>();
  for (const row of submissionsResult.data || []) {
    if (!latestSubmission.has(row.mission_id)) latestSubmission.set(row.mission_id, row);
  }
  const weeks: LearningWeek[] = (weeksResult.data || []).map((week) => ({
    id: week.id,
    number: week.week_number,
    title: week.title,
    goal: week.goal || "",
    lessons: [...(week.curriculum_lessons || [])].filter((lesson) => lesson.is_published).sort((a, b) => a.display_order - b.display_order).map((lesson) => {
      const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents;
      const missionRelation = lesson.curriculum_missions;
      const missionRow = Array.isArray(missionRelation) ? missionRelation[0] : missionRelation;
      const submission = missionRow ? latestSubmission.get(missionRow.id) : null;
      const response = submission?.response && typeof submission.response === "object" && !Array.isArray(submission.response)
        ? submission.response as Record<string, unknown>
        : {};
      return {
        id: lesson.id,
        day: lesson.day_number,
        title: lesson.title,
        description: lesson.description || "",
        kind: lesson.content_type as "vod" | "material" | "text" | "link",
        duration: lesson.duration_label || "",
        vodUrl: content?.vod_url || null,
        bodyText: content?.body_text || null,
        externalUrl: safeExternalUrl(content?.external_url),
        resourceName: content?.resource_name || null,
        resourcePath: content?.resource_storage_path || null,
        progress: progress.get(lesson.id) || 0,
        mission: missionRow?.is_published ? {
          id: missionRow.id,
          title: missionRow.title,
          quiz: quizzes.get(missionRow.id) || null,
          instructions: missionRow.instructions || "",
          required: missionRow.is_required,
          submissionType: missionRow.submission_type as "text" | "link" | "mixed" | "quiz",
          submission: submission ? {
            id: submission.id,
            attempt: submission.attempt_number,
            status: submission.status as "submitted" | "changes_requested" | "approved" | "rejected",
            feedback: submission.reviewer_feedback || "",
            answerText: typeof response.answerText === "string" ? response.answerText : "",
            evidenceUrl: typeof response.evidenceUrl === "string" ? response.evidenceUrl : "",
          } : null,
        } : null,
      };
    }),
  }));
  const sessions: LearningSession[] = (sessionsResult.data || []).map((session) => {
    const content = Array.isArray(session.cohort_session_contents) ? session.cohort_session_contents[0] : session.cohort_session_contents;
    return { id: session.id, number: session.session_number, title: session.title, expectedOutput: session.expected_output || "", scheduledAt: session.scheduled_at, liveUrl: safeExternalUrl(content?.live_url), replayUrl: safeExternalUrl(content?.replay_url) };
  });
  const lessonIds = weeks.flatMap((week) => week.lessons.map((lesson) => lesson.id));
  const learningProgress = calculateLearningProgress(lessonIds, progressResult.data || []);
  const requiredMissions = missionRows.filter((mission) => mission.is_required);
  const requiredIds = new Set(requiredMissions.map((mission) => mission.id));
  const achievement = calculateAchievement(requiredMissions.length, [...latestSubmission.values()].filter((row) => requiredIds.has(row.mission_id)).map((row) => ({
    mission_id: row.mission_id,
    status: row.status,
  })));
  return { enrollment: { id: enrollment.id, accessEndsAt: enrollment.access_ends_at }, course, cohort, weeks, sessions, learningProgress, achievement };
}

export async function getLearningLesson(enrollmentId: string, lessonId: string) {
  const home = await getLearningHome(enrollmentId);
  if (!home) return null;
  for (const week of home.weeks) {
    const lesson = week.lessons.find((item) => item.id === lessonId);
    if (lesson) return { ...home, week, lesson };
  }
  return null;
}

export function safeEmbedUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname === "youtu.be") return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if ((url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com") && /^\/\d+/.test(url.pathname)) return `https://player.vimeo.com/video/${url.pathname.split("/")[1]}`;
    if (url.hostname === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname)) return url.toString();
    return null;
  } catch { return null; }
}
