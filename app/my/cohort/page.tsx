import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock3, PlayCircle } from "lucide-react";
import { LearnerShell } from "../../components/learner-shell";
import { calculateLearningProgressByEnrollment, unavailableAchievement } from "@/lib/achievement";
import { getEnrollmentAchievements } from "@/lib/learning-data";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CourseRelation = { title: string; slug: string; summary: string | null; duration_label: string | null };
type CohortRelation = { name: string; operation_start_at: string | null; operation_end_at: string | null; status: string };
type EnrollmentRow = {
  id: string;
  course_id: string;
  access_starts_at: string;
  access_ends_at: string | null;
  courses: CourseRelation | CourseRelation[] | null;
  cohorts: CohortRelation | CohortRelation[] | null;
};

function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] || null : value; }
function dateLabel(value: string | null) {
  if (!value) return "미정";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim();
}
function statusLabel(status: string) {
  if (status === "in_progress") return "진행 중";
  if (status === "completed") return "종료·복습 가능";
  if (status === "recruiting") return "수강 예정";
  return "이용 가능";
}

function accessState(startsAt: string, endsAt: string | null) {
  const now = Date.now();
  if (new Date(startsAt).getTime() > now) return "scheduled" as const;
  if (endsAt && new Date(endsAt).getTime() <= now) return "expired" as const;
  return "active" as const;
}

export default async function MyClassesPage() {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: enrollmentData }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("enrollments").select("id,course_id,access_starts_at,access_ends_at,courses(title,slug,summary,duration_label),cohorts(name,operation_start_at,operation_end_at,status)").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }),
  ]);
  const enrollments = (enrollmentData || []) as unknown as EnrollmentRow[];
  const enrollmentIds = enrollments.map((item) => item.id);
  const courseIds = [...new Set(enrollments.map((item) => item.course_id))];
  let progressMap = calculateLearningProgressByEnrollment([], [], []);
  if (enrollmentIds.length) {
    const [{ data: weekRows }, { data: progressRows }] = await Promise.all([
      supabase.from("curriculum_weeks").select("course_id,curriculum_lessons(id,is_published)").in("course_id", courseIds).eq("is_published", true),
      supabase.from("lesson_progress").select("enrollment_id,lesson_id,progress_percent").in("enrollment_id", enrollmentIds),
    ]);
    const courseLessons = (weekRows || []).flatMap((week) => (week.curriculum_lessons || [])
      .filter((lesson) => lesson.is_published)
      .map((lesson) => ({ course_id: week.course_id, lesson_id: lesson.id })));
    progressMap = calculateLearningProgressByEnrollment(enrollments, courseLessons, progressRows || []);
  }
  const achievementMap = await getEnrollmentAchievements(enrollments.map((item) => ({ id: item.id, courseId: item.course_id })));
  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "회원";

  return <LearnerShell active="classes" userName={name}>
    <div className="app-page-heading"><div><span>MY CLASSES</span><h1>내 클래스</h1></div><Link href="/classes">새 클래스 둘러보기 <ArrowRight/></Link></div>
    {enrollments.length ? <div className="my-class-grid">{enrollments.map((enrollment, index) => {
      const course = one(enrollment.courses);
      const cohort = one(enrollment.cohorts);
      if (!course) return null;
      const access = accessState(enrollment.access_starts_at, enrollment.access_ends_at);
      const progress = progressMap.get(enrollment.id) || { percent: 0, completed: 0, total: 0 };
      const achievement = achievementMap.get(enrollment.id) || unavailableAchievement;
      return <article className="my-class-card" key={enrollment.id}><div className="my-class-art"><span>CLASS {String(index + 1).padStart(2, "0")}</span><strong>{String(index + 1).padStart(2, "0")}</strong></div><div><span className="cohort-tag">{cohort?.name || "수강 중"} · {access === "expired" ? "수강 기간 종료" : access === "scheduled" ? "수강 시작 전" : statusLabel(cohort?.status || "")}</span><h2>{course.title}</h2><p><CalendarDays/> 운영기간 {dateLabel(cohort?.operation_start_at || null)} — {dateLabel(cohort?.operation_end_at || null)}</p><p><Clock3/> 접근 가능 기간 {dateLabel(enrollment.access_starts_at)} — {enrollment.access_ends_at ? dateLabel(enrollment.access_ends_at) : "제한 없음"}</p><div className="progress-copy"><span>학습 진도 · {progress.completed}/{progress.total}</span><strong>{progress.percent}%</strong></div><div className="progress-bar"><i style={{ width: `${progress.percent}%` }}/></div><div className="achievement-inline"><span>과제 달성도</span><strong>{achievement.available ? `${achievement.percent}%` : "집계 준비 중"}</strong><small>{achievement.level ? `Lv.${achievement.level.number} ${achievement.level.name}` : "과제 승인 후 레벨 반영"}</small></div><div className="my-class-actions">{access === "active" ? <Link href={`/my/cohort/${enrollment.id}`}><PlayCircle/> 수강하기</Link> : <span className="class-access-disabled"><Clock3/> {access === "expired" ? "수강 종료" : "시작 전"}</span>}<Link href={`/classes/${course.slug}`}><BookOpen/> 클래스 정보</Link></div></div></article>;
    })}</div> : <section className="catalog-note my-empty-state"><strong>아직 이용 가능한 클래스가 없습니다.</strong><p>상품 결제 또는 관리자의 수강권 발급이 완료되면 등록된 클래스가 이 화면에 자동으로 나타납니다.</p><Link className="button button-dark" href="/classes">클래스 둘러보기</Link></section>}
  </LearnerShell>;
}
