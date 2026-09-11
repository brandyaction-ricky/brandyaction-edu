import Link from "next/link";
import { ArrowRight, BookOpen, ChevronRight, Clock3, Download, PlayCircle } from "lucide-react";
import { LearnerShell } from "../components/learner-shell";
import { calculateLearningProgressByEnrollment, unavailableAchievement, type LearningProgressSummary } from "@/lib/achievement";
import { getEnrollmentAchievements } from "@/lib/learning-data";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

type CourseRelation = { title: string; slug: string };
type CohortRelation = { name: string; operation_start_at: string | null };
type EnrollmentRow = {
  id: string;
  course_id: string;
  cohort_id: string;
  courses: CourseRelation | CourseRelation[] | null;
  cohorts: CohortRelation | CohortRelation[] | null;
};
type SessionWithCohort = {
  cohort_id: string;
  title: string;
  scheduled_at: string;
  cohorts: { name: string } | { name: string }[] | null;
};

function relationOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] || null : value;
}

function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function liveDateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function dDay(value: string) {
  const difference = new Date(value).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(difference / 86_400_000));
  return days === 0 ? "D-DAY" : `D-${days}`;
}

export default async function MyPage() {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: profile }, { data: enrollmentData }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("enrollments")
      .select("id,course_id,cohort_id,courses(title,slug),cohorts(name,operation_start_at)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("access_starts_at", new Date().toISOString())
      .or(`access_ends_at.is.null,access_ends_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false }),
  ]);

  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "회원";
  const enrollments = (enrollmentData || []) as unknown as EnrollmentRow[];
  const enrollmentIds = enrollments.map((item) => item.id);
  const courseIds = [...new Set(enrollments.map((item) => item.course_id))];
  const cohortIds = enrollments.map((item) => item.cohort_id);

  const progressMap = new Map<string, LearningProgressSummary>();
  if (enrollmentIds.length) {
    const [{ data: weekRows }, { data: progressRows }] = await Promise.all([
      supabase.from("curriculum_weeks").select("course_id,curriculum_lessons(id,is_published)").in("course_id", courseIds).eq("is_published", true),
      supabase.from("lesson_progress").select("enrollment_id,lesson_id,progress_percent").in("enrollment_id", enrollmentIds),
    ]);
    const courseLessons = (weekRows || []).flatMap((week) => (week.curriculum_lessons || [])
      .filter((lesson) => lesson.is_published)
      .map((lesson) => ({ course_id: week.course_id, lesson_id: lesson.id })));
    for (const [id, summary] of calculateLearningProgressByEnrollment(enrollments, courseLessons, progressRows || [])) {
      progressMap.set(id, summary);
    }
  }
  const achievementMap = await getEnrollmentAchievements(enrollments.map((item) => ({ id: item.id, courseId: item.course_id })));

  let nextSession: SessionWithCohort | null = null;
  if (cohortIds.length) {
    const { data } = await supabase
      .from("cohort_sessions")
      .select("cohort_id,title,scheduled_at,cohorts(name)")
      .in("cohort_id", cohortIds)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    nextSession = data as unknown as SessionWithCohort | null;
  }

  const primary = enrollments[0];
  const learningProgress = primary ? progressMap.get(primary.id) : null;
  const achievement = primary ? achievementMap.get(primary.id) || unavailableAchievement : unavailableAchievement;
  const course = primary ? relationOne(primary.courses) : null;
  const cohort = primary ? relationOne(primary.cohorts) : null;
  const sessionCohort = nextSession ? relationOne(nextSession.cohorts) : null;
  const nextEnrollment = nextSession ? enrollments.find((item) => item.cohort_id === nextSession.cohort_id) : null;

  return <LearnerShell active="home" userName={name}>
    <div className="app-page-heading"><div><span>{todayLabel()}</span><h1>{name}님, 오늘도 실행해 볼까요?</h1></div><Link href="/classes">새 클래스 둘러보기 <ArrowRight/></Link></div>


    {primary && course ? <div className="learner-dashboard-grid"><section><div className="panel-heading"><h2>이어서 학습하기</h2><Link href="/my/cohort">전체보기 <ChevronRight/></Link></div><article className="enrolled-card"><div className="enrolled-art"><span>LIVE CLASS</span><strong>01</strong></div><div className="enrolled-copy"><span className="cohort-tag">{cohort?.name || "수강 중"}</span><h3>{course.title}</h3><div className="progress-copy"><span>학습 진도 · {learningProgress?.completed || 0}/{learningProgress?.total || 0}</span><strong>{learningProgress?.percent || 0}%</strong></div><div className="progress-bar"><i style={{width:`${learningProgress?.percent || 0}%`}}/></div><div className="achievement-inline"><span>과제 달성도</span><strong>{achievement.available ? `${achievement.percent}%` : "집계 준비 중"}</strong><small>{achievement.level ? `Lv.${achievement.level.number} ${achievement.level.name}` : "과제 승인 후 레벨 반영"}</small></div><Link href={`/my/cohort/${primary.id}`}>기수 홈으로 <ArrowRight/></Link></div></article></section>
      <section><div className="panel-heading"><h2>학습 안내</h2></div><div className="catalog-note"><strong>결제한 계정에 수강권이 연결되었습니다.</strong><p>VOD, 자료와 라이브 일정은 기수 홈에서 확인할 수 있습니다.</p><Link className="button button-dark" href={`/my/cohort/${primary.id}`}>기수 홈 열기</Link></div></section></div>
      : <section className="catalog-note my-empty-state"><strong>아직 수강 중인 클래스가 없습니다.</strong><p>클래스를 결제하면 일정·VOD·자료가 이곳에 자동으로 연결됩니다.</p><Link className="button button-dark" href="/classes">클래스 둘러보기</Link></section>}

    {nextSession?.scheduled_at && <section className="next-live-card"><div className="live-badge">NEXT LIVE</div><div className="next-date"><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", day: "2-digit" }).format(new Date(nextSession.scheduled_at))}</strong><span>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "short", weekday: "short" }).format(new Date(nextSession.scheduled_at)).toUpperCase()}</span></div><div className="next-info"><span>{sessionCohort?.name || cohort?.name}</span><h2>{nextSession.title}</h2><p><Clock3/> {liveDateLabel(nextSession.scheduled_at)}</p></div><div className="next-action"><span>{dDay(nextSession.scheduled_at)}</span>{nextEnrollment && <Link href={`/my/cohort/${nextEnrollment.id}`}>수업 상세 확인</Link>}</div></section>}

    <section className="quick-links"><Link href="/my/cohort"><PlayCircle/><div><strong>라이브 수업</strong><span>수업 일정 확인</span></div><ArrowRight/></Link><Link href="/my/resources"><Download/><div><strong>학습 자료</strong><span>워크북·템플릿</span></div><ArrowRight/></Link><Link href="/my/cohort"><BookOpen/><div><strong>전체 커리큘럼</strong><span>VOD·자료 한눈에 보기</span></div><ArrowRight/></Link></section>
  </LearnerShell>;
}
