import Link from "next/link";
import { ArrowRight, BookOpen, ChevronRight, Clock3, Download, PlayCircle } from "lucide-react";
import { LearnerShell } from "../components/learner-shell";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

type CourseRelation = { title: string; slug: string };
type CohortRelation = { name: string; operation_start_at: string | null };
type EnrollmentRow = {
  id: string;
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
      .select("id,cohort_id,courses(title,slug),cohorts(name,operation_start_at)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .lte("access_starts_at", new Date().toISOString())
      .or(`access_ends_at.is.null,access_ends_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false }),
  ]);

  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "회원";
  const enrollments = (enrollmentData || []) as unknown as EnrollmentRow[];
  const enrollmentIds = enrollments.map((item) => item.id);
  const cohortIds = enrollments.map((item) => item.cohort_id);

  let progress = 0;
  if (enrollmentIds.length) {
    const { data } = await supabase
      .from("lesson_progress")
      .select("progress_percent")
      .in("enrollment_id", enrollmentIds);
    if (data?.length) progress = Math.round(data.reduce((sum, item) => sum + item.progress_percent, 0) / data.length);
  }

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
  const course = primary ? relationOne(primary.courses) : null;
  const cohort = primary ? relationOne(primary.cohorts) : null;
  const sessionCohort = nextSession ? relationOne(nextSession.cohorts) : null;
  const nextEnrollment = nextSession ? enrollments.find((item) => item.cohort_id === nextSession.cohort_id) : null;

  return <LearnerShell active="home" userName={name}>
    <div className="app-page-heading"><div><span>{todayLabel()}</span><h1>{name}님, 오늘도 실행해 볼까요?</h1></div><Link href="/classes">새 클래스 둘러보기 <ArrowRight/></Link></div>
    {nextSession?.scheduled_at && <section className="next-live-card"><div className="live-badge">NEXT LIVE</div><div className="next-date"><strong>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", day: "2-digit" }).format(new Date(nextSession.scheduled_at))}</strong><span>{new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "short", weekday: "short" }).format(new Date(nextSession.scheduled_at)).toUpperCase()}</span></div><div className="next-info"><span>{sessionCohort?.name || cohort?.name}</span><h2>{nextSession.title}</h2><p><Clock3/> {liveDateLabel(nextSession.scheduled_at)}</p></div><div className="next-action"><span>{dDay(nextSession.scheduled_at)}</span>{nextEnrollment && <Link href={`/my/cohort/${nextEnrollment.id}`}>수업 상세 확인</Link>}</div></section>}

    {primary && course ? <div className="learner-dashboard-grid"><section><div className="panel-heading"><h2>수강 중인 클래스</h2><Link href="/my/cohort">전체보기 <ChevronRight/></Link></div><article className="enrolled-card"><div className="enrolled-art"><span>LIVE CLASS</span><strong>01</strong></div><div className="enrolled-copy"><span className="cohort-tag">{cohort?.name || "수강 중"}</span><h3>{course.title}</h3><div className="progress-copy"><span>전체 진도</span><strong>{progress}%</strong></div><div className="progress-bar"><i style={{width:`${progress}%`}}/></div><Link href={`/my/cohort/${primary.id}`}>기수 홈으로 <ArrowRight/></Link></div></article></section>
      <section><div className="panel-heading"><h2>학습 안내</h2></div><div className="catalog-note"><strong>결제한 계정에 수강권이 연결되었습니다.</strong><p>VOD, 자료와 라이브 일정은 기수 홈에서 확인할 수 있습니다.</p><Link className="button button-dark" href={`/my/cohort/${primary.id}`}>기수 홈 열기</Link></div></section></div>
      : <section className="catalog-note my-empty-state"><strong>아직 수강 중인 클래스가 없습니다.</strong><p>클래스를 결제하면 일정·VOD·자료가 이곳에 자동으로 연결됩니다.</p><Link className="button button-dark" href="/classes">클래스 둘러보기</Link></section>}

    <section className="quick-links"><Link href="/my/cohort"><PlayCircle/><div><strong>라이브 수업</strong><span>수업 일정 확인</span></div><ArrowRight/></Link><Link href="/my/cohort"><Download/><div><strong>학습 자료</strong><span>워크북·템플릿</span></div><ArrowRight/></Link><Link href="/my/cohort"><BookOpen/><div><strong>전체 커리큘럼</strong><span>VOD·자료 한눈에 보기</span></div><ArrowRight/></Link></section>
  </LearnerShell>;
}
