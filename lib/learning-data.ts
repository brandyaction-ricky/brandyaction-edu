import "server-only";
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
  kind: "vod" | "material";
  duration: string;
  vodUrl: string | null;
  resourceName: string | null;
  resourcePath: string | null;
  progress: number;
};

export type LearningWeek = { id: string; number: number; title: string; goal: string; lessons: LearningLesson[] };
export type LearningSession = { id: string; number: number; title: string; expectedOutput: string; scheduledAt: string | null; liveUrl: string | null; replayUrl: string | null };
export type LearningHome = { enrollment: { id: string; accessEndsAt: string | null }; course: Course; cohort: Cohort; weeks: LearningWeek[]; sessions: LearningSession[] };

export async function getLearningHome(enrollmentId: string): Promise<LearningHome | null> {
  const supabase = await createClient();
  const { data: enrollmentData, error } = await supabase
    .from("enrollments")
    .select("id,course_id,cohort_id,access_starts_at,access_ends_at,courses(id,title,slug,summary,duration_label),cohorts(id,name,operation_start_at,operation_end_at,status)")
    .eq("id", enrollmentId)
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
    supabase.from("curriculum_weeks").select("id,week_number,title,goal,display_order,curriculum_lessons(id,day_number,title,description,content_type,duration_label,display_order,lesson_contents(vod_url,resource_name,resource_storage_path))").eq("course_id", enrollment.course_id).eq("is_published", true).order("display_order"),
    supabase.from("cohort_sessions").select("id,session_number,title,expected_output,scheduled_at,cohort_session_contents(live_url,replay_url)").eq("cohort_id", enrollment.cohort_id).order("session_number"),
    supabase.from("lesson_progress").select("lesson_id,progress_percent").eq("enrollment_id", enrollment.id),
  ]);
  if (weeksResult.error || sessionsResult.error) return null;
  const progress = new Map((progressResult.data || []).map((row) => [row.lesson_id, row.progress_percent]));
  const weeks: LearningWeek[] = (weeksResult.data || []).map((week) => ({
    id: week.id,
    number: week.week_number,
    title: week.title,
    goal: week.goal || "",
    lessons: [...(week.curriculum_lessons || [])].sort((a, b) => a.display_order - b.display_order).map((lesson) => {
      const content = Array.isArray(lesson.lesson_contents) ? lesson.lesson_contents[0] : lesson.lesson_contents;
      return {
        id: lesson.id,
        day: lesson.day_number,
        title: lesson.title,
        description: lesson.description || "",
        kind: lesson.content_type as "vod" | "material",
        duration: lesson.duration_label || "",
        vodUrl: content?.vod_url || null,
        resourceName: content?.resource_name || null,
        resourcePath: content?.resource_storage_path || null,
        progress: progress.get(lesson.id) || 0,
      };
    }),
  }));
  const sessions: LearningSession[] = (sessionsResult.data || []).map((session) => {
    const content = Array.isArray(session.cohort_session_contents) ? session.cohort_session_contents[0] : session.cohort_session_contents;
    return { id: session.id, number: session.session_number, title: session.title, expectedOutput: session.expected_output || "", scheduledAt: session.scheduled_at, liveUrl: safeExternalUrl(content?.live_url), replayUrl: safeExternalUrl(content?.replay_url) };
  });
  return { enrollment: { id: enrollment.id, accessEndsAt: enrollment.access_ends_at }, course, cohort, weeks, sessions };
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
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (url.hostname.includes("vimeo.com") && /^\/\d+/.test(url.pathname)) return `https://player.vimeo.com/video/${url.pathname.split("/")[1]}`;
    return url.toString();
  } catch { return null; }
}
