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
  Play,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  LiveSchedule,
  MissionForm,
  type Data,
  type WorkflowSend,
} from "../learning-workflows";
import { enrollmentLessons, missionEntries } from "./member-views";
import { LessonQuestions } from "./lesson-questions";
import { LessonText } from "./lesson-text";
import { LessonBlockSession } from './lesson-block-session';
import { useLessonProgression } from './use-lesson-progression';
import { Badge, Empty, Heading, ResourceRow, Video } from "./primitives";

export function Classroom({
  path,
  data,
  pending,
  send,
  loading,
  missionId,
  blockLearningEnabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true',
}: {
  path: string[];
  data: Data;
  pending: boolean;
  send: WorkflowSend;
  loading: boolean;
  missionId: string | null;
  blockLearningEnabled?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [completedHere, setCompletedHere] = useState<string[]>([]);
  const progression = useLessonProgression(path[1], blockLearningEnabled);
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
  const allLessons = enrollmentLessons(data, enrollment);
  const selectedGate = progression.lessons?.find(item => item.lessonId === (path[2] || allLessons[0]?.id));
  const lessons = allLessons.filter(item => !selectedGate?.track || progression.lessons?.some(gate => gate.lessonId === item.id && gate.track === selectedGate.track))
      .sort((a, b) => selectedGate?.track ? (progression.lessons?.find(item => item.lessonId === a.id)?.dayNumber || 0) - (progression.lessons?.find(item => item.lessonId === b.id)?.dayNumber || 0) : 0),
    lesson = lessons.find((l) => l.id === path[2]) || lessons[0],
    content = (data.lesson_contents || []).find(
      (c) => c.lesson_id === lesson?.id,
    );
  const complete = (data.lesson_progress || []).filter(
      (p) => p.enrollment_id === enrollment.id && p.completed_at,
    );
  const completedIds = new Set([
    ...complete.map(p => String(p.lesson_id)),
    ...completedHere.filter(key => key.startsWith(`${enrollment.id}:`)).map(key => key.slice(enrollment.id.length + 1)),
  ]);
  const done = completedIds.has(String(lesson?.id)),
    current = lessons.findIndex((l) => l.id === lesson?.id);
  const canOpen = (id: string) => !blockLearningEnabled || progression.lessons?.some(item => item.lessonId === id && item.isUnlocked) === true;
  const entries = missionEntries(data, [enrollment]).filter(
      (x) => x.lesson?.id === lesson?.id,
    ),
    entry = entries.find((x) => x.mission.id === missionId) || entries[0];
  const lessonHref =
    "/learn/" + enrollment.id + (lesson ? "/" + lesson.id : "");
  const legacyCompletion = lesson ? (
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
  ) : null;
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
              {t(cohort, "name")} · {completedIds.size}개 학습 완료
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
            {blockLearningEnabled && <nav aria-label="학습 종류">{(['daily', 'learning'] as const).map(track => {
              const first = progression.lessons?.filter(item => item.track === track).sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0))[0];
              return first && <Link className="btn small mb16" key={track} aria-current={selectedGate?.track === track ? 'page' : undefined} href={`/learn/${enrollment.id}/${first.lessonId}`}>{track === 'daily' ? '데일리 미션' : '별도 학습'}</Link>;
            })}</nav>}
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
                      aria-disabled={!canOpen(l.id)}
                      href={"/learn/" + enrollment.id + "/" + l.id}
                      onClick={event => { if (!canOpen(l.id)) event.preventDefault(); else setNavOpen(false); }}
                    >
                      {completedIds.has(l.id) ? (
                        <Check />
                      ) : (
                        <Play />
                      )}
                      <div>
                        <span className="meta">DAY {num(l, "day_number")}{!canOpen(l.id) ? ' · 잠김' : ''}</span>
                        <b>{t(l, "title")}</b>
                      </div>
                    </Link>
                  ))}
              </section>
            ))}
          </aside>
          <div className="learning-content">
            {lesson && canOpen(lesson.id) ? (
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
                  <a className="link" href="#lesson-questions">이 수업에 개인 질문 남기기</a>
                </header>
                <LessonContent enabled={blockLearningEnabled} lessonId={lesson.id} enrollmentId={enrollment.id} legacyCompletion={legacyCompletion} onCompleted={() => { if (!completedIds.has(lesson.id)) { setCompletedHere(previous => previous.includes(`${enrollment.id}:${lesson.id}`) ? previous : [...previous, `${enrollment.id}:${lesson.id}`]); progression.reload(); } }}>
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
                    <LessonText text={t(content, "body_text") ||
                      t(lesson, "description") ||
                      "학습 콘텐츠를 준비하고 있습니다."} />
                  </div>
                </section>
                </LessonContent>
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
                  {!blockLearningEnabled && legacyCompletion}
                  {current < lessons.length - 1 && (canOpen(lessons[current + 1].id) ? (
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
                  ) : <button className="btn" disabled>다음 학습 · 잠김</button>)}
                </div>
                <LessonQuestions key={enrollment.id + ":" + lesson.id} enrollmentId={String(enrollment.id)} lessonId={String(lesson.id)} lessonTitle={t(lesson, "title")} />
              </>
            ) : (
              <Empty title={lesson && blockLearningEnabled ? progression.error || selectedGate?.reason || (progression.lessons ? '아직 열리지 않은 학습입니다.' : '학습 개방 상태를 확인하고 있습니다.') : '공개된 학습이 없습니다.'}>
                <BookOpen />
                {lesson && blockLearningEnabled && <button className="btn mt16" onClick={progression.reload}>학습 상태 다시 확인</button>}
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonContent({ enabled, lessonId, enrollmentId, children, legacyCompletion, onCompleted }: { enabled: boolean; lessonId: string; enrollmentId: string; children: ReactNode; legacyCompletion: ReactNode; onCompleted: () => void }) {
  return enabled ? <LessonBlockSession key={`${enrollmentId}:${lessonId}`} lessonId={lessonId} enrollmentId={enrollmentId} fallback={<>{children}{legacyCompletion}</>} onCompleted={onCompleted} /> : <>{children}</>;
}
