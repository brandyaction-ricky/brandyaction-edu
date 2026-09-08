import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, BookOpen, CalendarDays, CheckCircle2, Clock3, Download, ExternalLink, PlayCircle, Radio } from "lucide-react";
import { LearnerShell } from "../../../components/learner-shell";
import { ReviewForm } from "../../../components/lesson-actions";
import { getLearningHome } from "@/lib/learning-data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "일정 추후 안내";
}

function canEnterLive(scheduledAt: string | null, liveUrl: string | null) {
  if (!scheduledAt || !liveUrl) return false;
  return new Date(scheduledAt).getTime() - Date.now() <= 30 * 60 * 1000;
}

export default async function CohortHome({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const home = await getLearningHome(enrollmentId);
  if (!home) notFound();
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const name = user.user?.user_metadata?.full_name || user.user?.email?.split("@")[0] || "회원";
  const lessons = home.weeks.flatMap((week) => week.lessons);
  const progress = home.learningProgress;
  const achievement = home.achievement;

  return <LearnerShell active="classes" userName={name}>
    <div className="learning-home-heading">
      <div><span>{home.cohort.name}</span><h1>{home.course.title}</h1><p>{home.course.summary}</p></div>
      <div><strong>{progress.percent}%</strong><span>학습 진도 · {progress.completed}/{progress.total}</span></div>
    </div>
    <section className="achievement-overview">
      <div><Award/><span><small>현재 달성 레벨</small><strong>Lv.{achievement.level?.number || 1} {achievement.level?.name || "시작"}</strong></span></div>
      <div><span><small>과제 달성도</small><strong>{achievement.percent ?? 0}%</strong></span><i><b style={{ width: String(achievement.percent ?? 0) + "%" }}/></i></div>
      <div><small>승인된 필수 과제</small><strong>{achievement.approved}/{achievement.total || 0}</strong>{achievement.pending > 0 && <span>{achievement.pending}건 검토 대기</span>}</div>
    </section>
    <section className="learning-live-list">
      <div className="panel-heading"><h2>라이브 일정·다시보기</h2><span>{home.sessions.length}회</span></div>
      {home.sessions.length ? home.sessions.map((session) => {
        const canEnter = canEnterLive(session.scheduledAt, session.liveUrl);
        const trackingBase = "/api/learning/session-link?enrollment=" + encodeURIComponent(home.enrollment.id) + "&session=" + encodeURIComponent(session.id);
        return <article key={session.id}><span className="live-number">LIVE {session.number}</span><div><strong>{session.title}</strong><small><CalendarDays/>{dateTime(session.scheduledAt)} · {session.expectedOutput}</small></div><div className="live-row-actions">{canEnter && <a href={trackingBase + "&kind=live"} target="_blank" rel="noreferrer"><Radio/> 라이브 입장</a>}{session.replayUrl && <a href={trackingBase + "&kind=replay"} target="_blank" rel="noreferrer"><PlayCircle/> 다시보기</a>}{!canEnter && !session.replayUrl && <span><Clock3/> 수업 30분 전 오픈</span>}</div></article>;
      }) : <div className="learning-empty">등록된 라이브 일정이 없습니다.</div>}
    </section>
    <section className="learning-curriculum">
      <div className="panel-heading"><h2>커리큘럼·실행 과제</h2><span>{lessons.length}개</span></div>
      {home.weeks.map((week) => <article className="learning-week" key={week.id}>
        <header><span>WEEK {week.number}</span><div><h3>{week.title}</h3><p>{week.goal}</p></div></header>
        <div>{week.lessons.map((lesson) => <Link key={lesson.id} href={"/my/cohort/" + home.enrollment.id + "/lessons/" + lesson.id} className={lesson.progress === 100 ? "done" : ""}>
          <span>{lesson.kind === "vod" ? <PlayCircle/> : <Download/>}</span>
          <div><strong>Day {lesson.day} · {lesson.title}</strong><small>{lesson.kind === "vod" ? "VOD" : "자료"}{lesson.duration ? " · " + lesson.duration : ""}{lesson.mission ? " · 과제 " + (lesson.mission.submission?.status === "approved" ? "승인" : lesson.mission.submission?.status === "submitted" ? "검토 중" : "제출 필요") : ""}</small></div>
          {lesson.progress === 100 ? <CheckCircle2/> : <BookOpen/>}
        </Link>)}</div>
      </article>)}
    </section>
    <ReviewForm courseId={home.course.id} cohortId={home.cohort.id} authorName={name} courseTitle={home.course.title}/>
    <p className="learning-support-note"><ExternalLink/> 콘텐츠가 열리지 않으면 고객지원으로 주문 이메일과 함께 문의해 주세요.</p>
  </LearnerShell>;
}
