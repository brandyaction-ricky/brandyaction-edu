"use client";
import {
  date,
  labels,
  number as num,
  safeUrl,
  text as t,
} from "@/lib/platform";
import { hasLearningAccess } from "@/lib/platform-rules";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  MessageCircle,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  LiveSchedule,
  MissionForm,
  type Data,
  type WorkflowSend,
} from "../learning-workflows";
import { enrollmentLessons, missionEntries } from "./member-views";
import { Badge, Empty, Heading, ResourceRow, Video } from "./primitives";

export function Classroom({
  path,
  data,
  pending,
  send,
  loading,
  missionId,
}: {
  path: string[];
  data: Data;
  pending: boolean;
  send: WorkflowSend;
  loading: boolean;
  missionId: string | null;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const enrollment = (data.enrollments || []).find(
    (e) => e.id === path[1] && hasLearningAccess(e),
  );
  if (!enrollment)
    return (
      <div className="wrap">
        <Empty
          title={
            loading
              ? "학습을 불러오고 있습니다."
              : "수강 권한을 확인할 수 없습니다."
          }
        />
        <Link className="btn mt24" href="/my/classes">
          내 클래스 보기
        </Link>
      </div>
    );
  const course = (data.courses || []).find(
      (c) => c.id === enrollment.course_id,
    ),
    cohort = (data.cohorts || []).find((c) => c.id === enrollment.cohort_id);
  const weeks = (data.curriculum_weeks || [])
    .filter((w) => w.course_id === course?.id)
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const lessons = enrollmentLessons(data, enrollment),
    lesson = lessons.find((l) => l.id === path[2]) || lessons[0],
    content = (data.lesson_contents || []).find(
      (c) => c.lesson_id === lesson?.id,
    );
  const complete = (data.lesson_progress || []).filter(
      (p) => p.enrollment_id === enrollment.id && p.completed_at,
    ),
    done = complete.some((p) => p.lesson_id === lesson?.id),
    current = lessons.findIndex((l) => l.id === lesson?.id);
  const entries = missionEntries(data, [enrollment]).filter(
      (x) => x.lesson?.id === lesson?.id,
    ),
    entry = entries.find((x) => x.mission.id === missionId) || entries[0];
  const lessonHref =
    "/learn/" + enrollment.id + (lesson ? "/" + lesson.id : "");
  if (path[3] === "mission")
    return (
      <div className="account-bg">
        <div className="wrap pb64">
          <Heading
            title="미션 제출 · 피드백"
            description={[
              t(course, "title"),
              t(cohort, "name"),
              "DAY " + num(lesson, "day_number"),
            ]
              .filter(Boolean)
              .join(" · ")}
          />
          <div className="breadcrumbs">
            <Link href="/my">마이페이지</Link>
            <span>/</span>
            <Link href="/my/missions">내 미션</Link>
            <span>/ 미션 상세</span>
          </div>
          {entry ? (
            <div className="mission-guide">
              <div className="stack">
                <MissionForm
                  key={entry.mission.id + ":" + t(entry.submission, "id")}
                  mission={entry.mission}
                  enrollment={enrollment}
                  submission={entry.submission}
                  draft={(data.edu_mission_drafts || []).find(
                    (d) =>
                      d.mission_id === entry.mission.id &&
                      d.enrollment_id === enrollment.id,
                  )}
                  pending={pending}
                  send={send}
                />
                <Link className="link" href={lessonHref}>
                  <ArrowLeft />
                  학습실로
                </Link>
              </div>
              <aside className="mission-meta">
                <h3>미션 안내</h3>
                <dl className="info-lines">
                  <div>
                    <dt>제출 형식</dt>
                    <dd>
                      {labels[t(entry.mission, "submission_type")] || "텍스트"}
                    </dd>
                  </div>
                  <div>
                    <dt>완료 기준</dt>
                    <dd>관리자 승인</dd>
                  </div>
                  <div>
                    <dt>현재 상태</dt>
                    <dd>
                      {entry.status === "draft"
                        ? "제출 전"
                        : labels[entry.status]}
                    </dd>
                  </div>
                </dl>
                <hr className="rule" />
                <h3>제출 기록</h3>
                <div className="mission-history">
                  {(data.mission_submissions || [])
                    .filter(
                      (s) =>
                        s.mission_id === entry.mission.id &&
                        s.enrollment_id === enrollment.id,
                    )
                    .sort(
                      (a, b) =>
                        num(b, "attempt_number") - num(a, "attempt_number"),
                    )
                    .map((s) => (
                      <div key={s.id}>
                        <b>
                          {num(s, "attempt_number")}차 제출 ·{" "}
                          {labels[t(s, "status")]}
                        </b>
                        <p>{date(s.submitted_at)}</p>
                        {Boolean(s.reviewer_feedback) && (
                          <p>{t(s, "reviewer_feedback")}</p>
                        )}
                      </div>
                    ))}
                  {!entry.submission && (
                    <p>
                      아직 제출 전입니다. 작성 중인 내용은 임시저장할 수
                      있습니다.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          ) : (
            <Empty title="연결된 미션이 없습니다." />
          )}
        </div>
      </div>
    );
  return (
    <div className="learning-bg">
      <div className="wrap">
        <div className="learning-top">
          <div>
            <h1>{t(course, "title")}</h1>
            <p className="meta">
              {t(cohort, "name")} · {complete.length}개 학습 완료
            </p>
          </div>
          <Link className="btn small" href="/my/classes">
            <ArrowLeft />내 클래스
          </Link>
        </div>
        <LiveSchedule data={data} cohortId={t(enrollment, "cohort_id")} />
        <button
          className="btn learning-mobile-toggle"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(!navOpen)}
        >
          학습 목록
          <ChevronDown />
        </button>
        <div className="learning-layout">
          <aside
            className={"learning-nav " + (navOpen ? "open" : "")}
            aria-label="학습 목록"
          >
            {weeks.map((w) => (
              <section className="lesson-week" key={w.id}>
                <div className="lesson-week-title">
                  WEEK {num(w, "week_number")} · {t(w, "title")}
                </div>
                {lessons
                  .filter((l) => l.week_id === w.id)
                  .map((l) => (
                    <Link
                      key={l.id}
                      className={
                        "lesson-nav " + (l.id === lesson?.id ? "active" : "")
                      }
                      aria-current={l.id === lesson?.id ? "page" : undefined}
                      href={"/learn/" + enrollment.id + "/" + l.id}
                      onClick={() => setNavOpen(false)}
                    >
                      {complete.some((p) => p.lesson_id === l.id) ? (
                        <Check />
                      ) : (
                        <Play />
                      )}
                      <div>
                        <span className="meta">DAY {num(l, "day_number")}</span>
                        <b>{t(l, "title")}</b>
                      </div>
                    </Link>
                  ))}
              </section>
            ))}
          </aside>
          <div className="learning-content">
            {lesson ? (
              <>
                <header className="lesson-header">
                  <div className="flex gap8">
                    <Badge>DAY {num(lesson, "day_number")}</Badge>
                    <Badge color={done ? "green" : ""}>
                      {done ? "학습 완료" : "학습 중"}
                    </Badge>
                    <span className="meta">{t(lesson, "duration_label")}</span>
                  </div>
                  <h1>{t(lesson, "title")}</h1>
                  <p>{t(lesson, "description")}</p>
                </header>
                {safeUrl(content?.vod_url) && (
                  <Video url={t(content, "vod_url")} />
                )}
                <section className="reading">
                  {safeUrl(content?.external_url) && (
                    <a
                      className="btn primary mb24"
                      target="_blank"
                      rel="noreferrer"
                      href={safeUrl(content?.external_url)}
                    >
                      외부 학습 열기
                      <ArrowRight />
                    </a>
                  )}
                  <div className="reading-copy">
                    {t(content, "body_text") ||
                      t(lesson, "description") ||
                      "학습 콘텐츠를 준비하고 있습니다."}
                  </div>
                </section>
                {content?.resource_storage_path && (
                  <section className="reading">
                    <h2>학습 자료</h2>
                    <ResourceRow content={content} />
                  </section>
                )}
                {entries
                  .filter((x) => x.mission.submission_type === "quiz")
                  .map((x) => (
                    <section className="reading" key={x.mission.id}>
                      <MissionForm
                        key={x.mission.id + ":" + t(x.submission, "id")}
                        mission={x.mission}
                        enrollment={enrollment}
                        submission={x.submission}
                        pending={pending}
                        send={send}
                      />
                    </section>
                  ))}
                {entries
                  .filter((x) => x.mission.submission_type !== "quiz")
                  .map((x) => (
                    <section className="reading" key={x.mission.id}>
                      <div className="eyebrow">Apply what you learned</div>
                      <h2>{t(x.mission, "title")}</h2>
                      <p>{t(x.mission, "instructions")}</p>
                      <div className="between">
                        <Badge color={x.status === "approved" ? "green" : ""}>
                          {x.status === "draft" ? "제출 전" : labels[x.status]}
                        </Badge>
                        <Link className="btn primary" href={x.href}>
                          {x.status === "draft"
                            ? "미션 작성하기"
                            : "제출·피드백 확인"}
                          <ArrowRight />
                        </Link>
                      </div>
                    </section>
                  ))}
                <div className="lesson-bottom">
                  {current > 0 ? (
                    <Link
                      className="btn"
                      href={
                        "/learn/" +
                        enrollment.id +
                        "/" +
                        lessons[current - 1].id
                      }
                    >
                      <ArrowLeft />
                      이전 학습
                    </Link>
                  ) : (
                    <span />
                  )}
                  <button
                    className="btn dark"
                    disabled={pending || done}
                    onClick={() =>
                      void send(
                        {
                          action: "progress",
                          enrollmentId: enrollment.id,
                          lessonId: lesson.id,
                        },
                        "학습을 완료했습니다.",
                      ).catch(() => {})
                    }
                  >
                    {done ? (
                      <>
                        <Check />
                        학습 완료
                      </>
                    ) : (
                      "학습 완료하기"
                    )}
                  </button>
                  {current < lessons.length - 1 && (
                    <Link
                      className="btn"
                      href={
                        "/learn/" +
                        enrollment.id +
                        "/" +
                        lessons[current + 1].id
                      }
                    >
                      다음 학습
                      <ArrowRight />
                    </Link>
                  )}
                </div>
                <div className="lesson-question">
                  <Link className="btn ghost" href="/my/questions">
                    <MessageCircle />이 학습에 질문하기
                  </Link>
                </div>
              </>
            ) : (
              <Empty title="공개된 학습이 없습니다.">
                <BookOpen />
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
