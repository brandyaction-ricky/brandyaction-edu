"use client";
import { MemberLearningCare } from "./learning-care";
import { PersonalizationSettings } from '../personalization-settings';
import { ConsentSettings } from '../consent-settings';
import { contentVisibility } from '@/lib/content-visibility';
import { PushSettings } from './push-settings';
import { LearningProgress } from './learning-progress';
import { AppInstallCard } from './app-install';
import { DiagnosisEntry } from './diagnosis-entry';
import { QuestionImage } from './question-image';
import { QuestionAnswerHistory } from './question-thread';
import { AnswerText } from './lesson-text';
import { MemberMessages } from './member-messages';
import { EncouragementEditor, EncouragementWall } from './member-encouragement';
import { EnrollmentLearningOverview } from './enrollment-learning-overview';
import { LoginEmailSettings } from './login-email-settings';
import { learningOverview } from '@/lib/learning-overview';
import { achievement } from "@/lib/edu-workflows";
import {
  date,
  labels,
  money,
  number as num,
  object,
  safeUrl,
  text as t,
  type Row,
  type User,
} from "@/lib/platform";
import { hasLearningAccess } from "@/lib/platform-rules";
import { isGraduate } from '@/lib/alumni-access';
import { cohortLessonVisible, cohortWeekVisible } from '@/lib/cohort-curriculum-visibility';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Play,
  Settings,
  Star,
  Target,
  Ticket,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  LiveSchedule,
  type Data,
  type WorkflowSend,
} from "../learning-workflows";
import { QuestionHub } from "./question-hub";
import { Badge, Empty, Heading, ResourceRow } from "./primitives";
import { DigitalContentOutline, ProductResourceRow } from "./primitives";
import { productDigitalSections, productResources } from "@/lib/product-metadata";
import './member-learning-ux.css';

const accountGroups = [
  [
    "나의 학습",
    [
      ["", "마이페이지", LayoutDashboard],
      ["classes", "내 클래스", BookOpen],
      ["missions", "내 미션", Target],
      ["questions", process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === "true" ? "질문·답변" : "내 질문", MessageCircle],
    ],
  ],
  [
    "내 계정",
    [
      ["orders", "신청·주문 내역", FileText],
      ["coupons", "내 쿠폰", Ticket],
      ["reviews", "내 상품 후기", Star],
      ["profile", "회원 정보", UserRound],
    ],
  ],
] as const;
const rows = (data: Data, key: string) => data[key] || [];
export function enrollmentLessons(data: Data, e: Row) {
  const weeks = new Set(
    rows(data, "curriculum_weeks")
      .filter((w) => w.course_id === e.course_id && cohortWeekVisible(data,String(e.cohort_id),w))
      .map((w) => w.id),
  );
  return rows(data, "curriculum_lessons")
    .filter((l) => weeks.has(t(l, "week_id")) && cohortLessonVisible(data,String(e.cohort_id),l))
    .sort((a, b) => {
      const weekA = rows(data, 'curriculum_weeks').find(w => w.id === a.week_id);
      const weekB = rows(data, 'curriculum_weeks').find(w => w.id === b.week_id);
      return num(weekA, 'week_number') - num(weekB, 'week_number') || num(a, 'day_number') - num(b, 'day_number') || a.id.localeCompare(b.id);
    });
}
function completedLessonProgress(
  data: Data,
  enrollment: Row,
  lessons = enrollmentLessons(data, enrollment),
) {
  return rows(data, "lesson_progress").filter(
    (progress) =>
      progress.enrollment_id === enrollment.id &&
      progress.completed_at &&
      lessons.some((lesson) => lesson.id === progress.lesson_id),
  );
}
export function missionEntries(data: Data, enrollments: Row[]) {
  return enrollments.flatMap((enrollment) => {
    const lessons = enrollmentLessons(data, enrollment);
    return rows(data, "curriculum_missions")
      .filter((m) => lessons.some((l) => l.id === m.lesson_id))
      .map((mission) => {
        const submission = rows(data, "mission_submissions")
          .filter(
            (s) =>
              s.mission_id === mission.id && s.enrollment_id === enrollment.id,
          )
          .sort(
            (a, b) => num(b, "attempt_number") - num(a, "attempt_number"),
          )[0];
        return {
          mission,
          enrollment,
          submission,
          lesson: lessons.find((l) => l.id === mission.lesson_id),
          status: t(submission, "status") || "draft",
          href:
            "/learn/" +
            enrollment.id +
            "/" +
            mission.lesson_id +
            "/mission?mission=" +
            mission.id,
        };
      });
  });
}
function Progress({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: percent + "%" }} />
    </div>
  );
}
function EnrolledCard({
  data,
  enrollment: e,
  blockLearningEnabled,
}: {
  data: Data;
  enrollment: Row;
  blockLearningEnabled: boolean;
}) {
  const c = rows(data, "courses").find((c) => c.id === e.course_id),
    cohort = rows(data, "cohorts").find((c) => c.id === e.cohort_id),
    lessons = enrollmentLessons(data, e),
    complete = completedLessonProgress(data, e, lessons),
    next =
      lessons.find((l) => !complete.some((p) => p.lesson_id === l.id)) ||
      lessons[0],
    allowed = hasLearningAccess(e),
    graduate = isGraduate(e, c, cohort);
  return (
    <article className="class-enrolled">
      <div className="flex">
        <div className="cover-mini">
          <span>BRANDYACTION EDU</span>
          <b>{t(cohort, "name") || "CLASS"}</b>
        </div>
        <div className="row-text">
          <div className="flex gap8">
            <Badge color={allowed ? "green" : ""}>
              {graduate ? '졸업생' : allowed ? "수강 중" : labels[t(e, "status")] || "수강 종료"}
            </Badge>
            <Badge>{t(cohort, "name")}</Badge>
          </div>
          <h3 className="mt8">{t(c, "title") || "클래스"}</h3>
          <p className="meta">
            {t(c, "schedule_label") || t(c, "duration_label")}
          </p>
        </div>
      </div>
      <div className="class-footer">
        {graduate ? <><p className="meta">최신 공개 커리큘럼은 계속 열람할 수 있습니다. 기존 제출·피드백 기록도 보관됩니다.</p><Link className="btn primary" href={'/learn/' + e.id}>최신 커리큘럼 보기 <ArrowRight /></Link></> : blockLearningEnabled ? <EnrollmentLearningOverview data={data} enrollment={e} compact /> : <>
        <div className="progress-line">
          <span className="meta">
            {complete.length} / {lessons.length}개 학습 완료 · 현재 공개된 학습 기준
          </span>
          <Progress
            value={complete.length}
            total={lessons.length}
            label="클래스 학습 진도"
          />
        </div>
        <Link
          className={"btn primary " + (!allowed ? "disabled" : "")}
          aria-disabled={!allowed}
          href={"/learn/" + e.id + (next ? "/" + next.id : "")}
        >
          {allowed ? "학습 이어가기" : "수강 기간 종료"}
          <ArrowRight />
        </Link>
        </>}
      </div>
    </article>
  );
}
function Dashboard({
  data,
  user,
  active,
  blockLearningEnabled,
}: {
  data: Data;
  user: User;
  active: Row[];
  blockLearningEnabled: boolean;
}) {
  const participating = active.filter(enrollment => !isGraduate(enrollment,
    rows(data, 'courses').find(course => course.id === enrollment.course_id),
    rows(data, 'cohorts').find(cohort => cohort.id === enrollment.cohort_id))),
    e = participating[0] || active[0],
    graduate = e ? !participating.some(enrollment => enrollment.id === e.id) : false,
    lessons = e ? enrollmentLessons(data, e) : [],
    complete = e ? completedLessonProgress(data, e, lessons) : [];
  const next =
      lessons.find((l) => !complete.some((p) => p.lesson_id === l.id)) ||
      lessons[0],
    c = rows(data, "courses").find((c) => c.id === e?.course_id),
    cohort = rows(data, "cohorts").find((c) => c.id === e?.cohort_id),
    entries = missionEntries(data, participating),
    result = e
      ? achievement(
          e.id,
          entries.filter((m) => m.enrollment.id === e.id).map((m) => m.mission),
          rows(data, "mission_submissions"),
        )
      : null;
  const pending = entries.filter((x) => x.status === "submitted").length,
    returned = entries.filter((x) => x.status === "changes_requested"),
    todo = entries.filter((x) => x.status === "draft"),
    coupons = rows(data, "customer_coupons").filter(
      (c) => c.status === "available",
    );
  const overviews = blockLearningEnabled ? participating.map(enrollment => learningOverview(data, enrollment)) : [];
  const completedCount = blockLearningEnabled
    ? overviews.every(overview => overview.status === 'ready')
      ? overviews.reduce((total, overview) => total + overview.groups.reduce((sum, group) => sum + group.completed, 0), 0)
      : null
    : participating.reduce((total, enrollment) => total + completedLessonProgress(data, enrollment).length, 0);
  const primaryOverview = e && blockLearningEnabled ? learningOverview(data, e) : null;
  const nextAvailableItem = primaryOverview?.status === 'ready' ? primaryOverview.groups.find(group => group.next)?.next : null;
  const visibleWeeks = e ? rows(data, 'curriculum_weeks')
    .filter(week => week.course_id === e.course_id && cohortWeekVisible(data, String(e.cohort_id), week) && lessons.some(lesson => lesson.week_id === week.id))
    .sort((a, b) => num(a, 'week_number') - num(b, 'week_number')) : [];
  const upcomingLesson = blockLearningEnabled ? lessons.find(lesson => lesson.id === nextAvailableItem?.id) : lessons.find(lesson => !complete.some(progress => progress.lesson_id === lesson.id));
  return (
    <>
      <Heading
        title="마이페이지"
        description={`${user.full_name || "회원"}님, 오늘의 학습과 실행을 이어가세요.`}
      >
        <Link className="btn small" href="/my/profile">
          <UserRound />
          회원 정보
        </Link>
      </Heading>
      <div className="member-focus-grid">
        {graduate && e ? <section className="member-learning-intro"><h2>{t(c, 'title')}</h2><p className="meta">{t(cohort, 'name')} · 졸업생</p><p>최신 공개 커리큘럼을 언제든 다시 볼 수 있습니다.</p><Link className="btn primary mt16" href={'/learn/' + e.id}>최신 커리큘럼 보기 <ArrowRight /></Link></section> : blockLearningEnabled && e ? <section className="member-learning-intro"><div className="member-journey-head"><div><span className="member-journey-eyebrow">나의 학습</span><h2>{t(c, "title")}</h2><p className="meta">{t(cohort, "name")} · 현재 공개된 학습을 이어가세요.</p></div>{primaryOverview?.status === 'ready' && <Link className="btn primary" href={'/learn/' + e.id + (upcomingLesson ? '/' + upcomingLesson.id : '')}>{upcomingLesson ? '이어서 학습하기' : '공개된 학습 보기'} <ArrowRight /></Link>}</div><div className="member-next-lesson"><span>다음 학습</span><b>{upcomingLesson ? `${nextAvailableItem?.day ? `DAY ${nextAvailableItem.day} · ` : ''}${t(upcomingLesson, 'title')}` : lessons.length && complete.length === lessons.length ? '현재 공개된 학습을 완료했습니다.' : lessons.length ? '다음 학습을 기다리고 있습니다.' : '공개된 학습을 준비하고 있습니다.'}</b><small>{upcomingLesson ? '이어보기를 눌러 학습을 시작하세요.' : '다음 학습이 열리면 이곳에서 확인할 수 있습니다.'}</small></div>{visibleWeeks.length > 0 && <div className="member-week-journey" aria-label="현재 공개된 주차">{visibleWeeks.map(week => { const weekLessons = lessons.filter(lesson => lesson.week_id === week.id); const weekDone = weekLessons.filter(lesson => complete.some(progress => progress.lesson_id === lesson.id)).length; return <div className="member-week-step" key={week.id}><span>{num(week, 'week_number') === 0 ? 'W0' : `W${num(week, 'week_number')}`}</span><b>{t(week, 'title')}</b><small>{weekDone} / {weekLessons.length}개 완료</small></div>; })}</div>}{!(primaryOverview?.status === 'ready' && primaryOverview.groups.length === 0) && <EnrollmentLearningOverview data={data} enrollment={e}/>}</section> : <>
        <section className="member-continue">
          <div className="member-kicker">
            이어서 학습하기 <span>{t(cohort, "name") || "MY LEARNING"}</span>
          </div>
          <p className="member-class-name">{t(c, "title")}</p>
          <h2>
            {t(next, "title") ||
              (active.length
                ? "공개된 학습을 준비하고 있습니다."
                : "첫 배움을 시작해 보세요.")}
          </h2>
          <p className="member-lesson-meta">
            {next
              ? `DAY ${String(num(next, "day_number")).padStart(2, "0")} · ${t(next, "duration_label")}`
              : "내 업무에 필요한 클래스를 찾아보세요."}
          </p>
          <div className="member-progress-caption">
            <span>현재 공개된 학습 진도</span>
            <b>
              {lessons.length
                ? Math.round((complete.length / lessons.length) * 100)
                : 0}
              %
            </b>
          </div>
          <Progress
            value={complete.length}
            total={lessons.length}
            label="학습 진도"
          />
          <div className="member-continue-foot">
            <span>
              {complete.length}개 완료 / 공개된 {lessons.length}개
            </span>
            <Link
              className="btn primary"
              href={
                e ? "/learn/" + e.id + (next ? "/" + next.id : "") : "/classes?type=free"
              }
            >
              {e ? "학습 이어가기" : "무료 클래스 시작하기"}
              <ArrowRight />
            </Link>
          </div>
        </section>
        <section className="member-level panel">
          <div className="between">
            <h2>나의 실행 레벨</h2>
            <Target />
          </div>
          <div className="member-level-value">
            <span>
              {result?.level === null || !result ? "—" : "Lv." + result.level}
            </span>
            <strong>
              {result?.level === null || !result ? "시작 준비" : "실행 중"}
            </strong>
          </div>
          <p>{t(c, "title") || "필수 미션 승인으로 실행을 쌓아요."}</p>
          <div className="member-progress-caption">
            <span>필수 미션 승인</span>
            <b>
              {result?.approved || 0} / {result?.total || 0}
            </b>
          </div>
          <Progress
            value={result?.approved || 0}
            total={result?.total || 0}
            label="미션 승인 진도"
          />
          <p className="member-level-next">
            승인된 필수 미션 기준으로 계산됩니다.
          </p>
          <Link className="link" href="/my/missions">
            내 미션 확인
            <ArrowRight />
          </Link>
        </section>
        </>}
      </div>
      {blockLearningEnabled && <MemberLearningCare key={user.id}/>}
      <DiagnosisEntry key={user.id}/>
      <div className="member-stats">
        {[
          ["수강 중", participating.length, "개", "클래스별 학습 이어가기", "classes"],
          [
            "학습 완료",
            completedCount ?? '—',
            completedCount === null ? '' : '개',
            completedCount === null ? '학습 상태를 다시 불러와 주세요.' : '완료한 학습 기록',
            "classes",
          ],
          [
            "검토 대기",
            pending,
            "건",
            `보완이 필요한 미션 ${returned.length}건`,
            "missions",
          ],
          [
            "사용 가능한 쿠폰",
            coupons.length,
            "장",
            "사용 조건과 기간 확인",
            "coupons",
          ],
        ].map(([label, value, suffix, desc, route]) => (
          <Link
            className="member-stat"
            href={"/my/" + route}
            key={String(route) + label}
          >
            <div>
              <span>{label}</span>
              <ChevronRight />
            </div>
            <strong>
              {value}
              <small>{suffix}</small>
            </strong>
            <p>{desc}</p>
          </Link>
        ))}
      </div>
      <div className="member-lower-grid">
        <section className="panel member-tasks">
          <div className="panel-head">
            <h2>지금 확인할 일</h2>
            <Link className="link" href="/my/missions">
              내 미션
              <ChevronRight />
            </Link>
          </div>
          {[...returned, ...todo].slice(0, 2).map((x) => (
            <Link
              className="member-task"
              key={x.mission.id + x.enrollment.id}
              href={x.href}
            >
              <span
                className={
                  "member-task-icon " +
                  (x.status === "changes_requested" ? "red" : "")
                }
              >
                <Target />
              </span>
              <div>
                <Badge color={x.status === "changes_requested" ? "red" : ""}>
                  {x.status === "draft" ? "제출 전" : labels[x.status]}
                </Badge>
                <h3>{t(x.mission, "title")}</h3>
                <p>
                  {x.status === "changes_requested"
                    ? "강사 피드백을 확인하고 내용을 보완해 주세요."
                    : t(x.mission, "instructions")}
                </p>
              </div>
              <ChevronRight />
            </Link>
          ))}
          {rows(data, "edu_questions")
            .filter((q) => q.status === "answered")
            .slice(0, 1)
            .map((q) => (
              <Link className="member-task" key={q.id} href="/my/questions">
                <span className="member-task-icon">
                  <MessageCircle />
                </span>
                <div>
                  <Badge color="green">답변 완료</Badge>
                  <h3>{t(q, "title")}</h3>
          {Boolean(q.learning_context) && <p className="meta">{t(q, "learning_context")}</p>}
                  <p>강사의 답변을 확인해 주세요.</p>
                </div>
                <ChevronRight />
              </Link>
            ))}
          {!returned.length && !todo.length && (
            <p className="panel-body muted">지금 처리할 미션이 없습니다.</p>
          )}
        </section>
        <section className="panel member-agenda">
          <div className="panel-head">
            <h2>다가오는 일정</h2>
            <CalendarDays />
          </div>
          {participating.map((e) => (
            <LiveSchedule key={e.id} data={data} cohortId={t(e, "cohort_id")} />
          ))}
          {!rows(data, "cohort_sessions").some((s) =>
            participating.some((e) => s.cohort_id === e.cohort_id),
          ) && <p className="panel-body muted">지금 확인할 일정이 없습니다. 새 일정이 등록되면 이곳에서 확인할 수 있습니다.</p>}
          <Link className="member-agenda-link" href="/my/orders">
            신청·주문 내역 확인
            <ArrowRight />
          </Link>
        </section>
      </div>
      {(!blockLearningEnabled || active.length !== 1) && <section className="member-classes">
        <div className="section-head">
          <div>
            <h2>내 클래스</h2>
            <p>배우던 클래스와 자료를 바로 열어보세요.</p>
          </div>
          <Link className="link" href="/my/classes">
            전체 보기
            <ArrowRight />
          </Link>
        </div>
        {(blockLearningEnabled ? active.filter(enrollment => enrollment.id !== e?.id) : active).slice(0, 2).map((e) => (
          <EnrolledCard key={e.id} data={data} enrollment={e} blockLearningEnabled={blockLearningEnabled} />
        ))}
        {!active.length && (
          <Empty title="신청한 클래스가 없습니다.">
            <Link href="/classes?type=free">무료 클래스부터 시작하기</Link>
          </Empty>
        )}
      </section>}
      {blockLearningEnabled && <EncouragementWall/>}
      <div className="member-shortcuts">
        {hasMemberResources(data) && <Link href="/my/resources">
          <Download />
          <div>
            <b>수강 자료·구매 파일</b>
            <span>등록된 자료 내려받기</span>
          </div>
          <ArrowRight />
        </Link>}
        {(contentVisibility(data).articles || contentVisibility(data).lectures) && <Link href="/articles">
          <Play />
          <div>
            <b>{contentVisibility(data).articles ? contentVisibility(data).lectures ? "무료강의와 아티클" : "아티클" : "무료강의"}</b>
            <span>업무에 적용할 인사이트</span>
          </div>
          <ArrowRight />
        </Link>}
        <Link href="/my/reviews">
          <Star />
          <div>
            <b>내 상품 후기</b>
            <span>수강 경험 남기기</span>
          </div>
          <ArrowRight />
        </Link>
      </div>
    </>
  );
}
function Missions({ data, active }: { data: Data; active: Row[] }) {
  const [enrollmentId, setEnrollmentId] = useState(""),
    [status, setStatus] = useState("전체");
  const entries = missionEntries(
    data,
    active.filter((e) => !enrollmentId || e.id === enrollmentId),
  ).filter(entry => Boolean(entry.submission) || !isGraduate(entry.enrollment,
    rows(data, 'courses').find(course => course.id === entry.enrollment.course_id),
    rows(data, 'cohorts').find(cohort => cohort.id === entry.enrollment.cohort_id)));
  const statuses = [
    "전체",
    "draft",
    "submitted",
    "changes_requested",
    "approved",
  ];
  return (
    <>
      <Heading
        title="내 미션"
        description="공개된 미션의 제출 상태와 다음에 할 일을 확인하세요."
      />
      <section className="member-mission-journey" aria-label="미션 진행 안내"><div><b>1. 미션 작성</b><span>공개된 수업에서 제출</span></div><div><b>2. 검토·보완</b><span>피드백을 확인하고 수정</span></div><div><b>3. 승인 완료</b><span>완료 기록 확인</span></div></section>
      <LearningProgress complete={entries.filter(entry => entry.status === "approved").length} total={entries.length} label="현재 공개된 미션 승인"/>
      <div className="member-mission-filter">
        <label>
          클래스 · 기수
          <select
            value={enrollmentId}
            onChange={(e) => {
              setEnrollmentId(e.target.value);
              setStatus("전체");
            }}
          >
            <option value="">전체 클래스</option>
            {active.map((e) => (
              <option key={e.id} value={e.id}>
                {t(
                  rows(data, "courses").find((c) => c.id === e.course_id),
                  "title",
                )}{" "}
                ·{" "}
                {t(
                  rows(data, "cohorts").find((c) => c.id === e.cohort_id),
                  "name",
                )}
              </option>
            ))}
          </select>
        </label>
        <p className="member-mission-filter-note">공개 전 미션은 수업이 열리면 목록에 나타납니다.</p>
      </div>
      <div className="chips member-mission-tabs" aria-label="미션 상태">
        {statuses.map((s) => (
          <button
            key={s}
            className={"chip " + (status === s ? "active" : "")}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "전체" ? "전체" : s === "draft" ? "제출 전" : labels[s]}{" "}
            <span>
              {entries.filter((e) => s === "전체" || e.status === s).length}
            </span>
          </button>
        ))}
      </div>
      <div className="member-mission-list">
        {entries
          .filter((e) => status === "전체" || e.status === status)
          .map((x) => (
            <article
              className="member-mission-row"
              key={x.mission.id + x.enrollment.id}
            >
              <span className="member-mission-day">
                DAY
                <strong>
                  {String(num(x.lesson, "day_number")).padStart(2, "0")}
                </strong>
              </span>
              <div className="row-text">
                <div className="flex gap8">
                  <Badge>
                    {t(
                      rows(data, "courses").find(
                        (c) => c.id === x.enrollment.course_id,
                      ),
                      "title",
                    )}
                  </Badge>
                  <Badge
                    color={
                      x.status === "approved"
                        ? "green"
                        : x.status === "changes_requested"
                          ? "red"
                          : x.status === "submitted"
                            ? "amber"
                            : ""
                    }
                  >
                    {x.status === "draft" ? "제출 전" : labels[x.status]}
                  </Badge>
                </div>
                <h3>{t(x.mission, "title")}</h3>
                <p>
                  {x.submission
                    ? date(x.submission.submitted_at) + " 제출"
                    : t(x.mission, "instructions")}
                </p>
                <p className="member-mission-format">제출 방식 · {labels[t(x.mission, 'submission_type')] || '텍스트'} · {x.status === 'approved' ? '승인 완료' : x.status === 'submitted' ? '검토 중' : x.status === 'changes_requested' ? '보완 필요' : '제출 후 검토'}</p>
              </div>
              <Link
                className={
                  "btn small " +
                  (x.status === "changes_requested" ? "primary" : "")
                }
                href={x.href}
              >
                {isGraduate(x.enrollment,
                  rows(data, 'courses').find(course => course.id === x.enrollment.course_id),
                  rows(data, 'cohorts').find(cohort => cohort.id === x.enrollment.cohort_id))
                  ? '기존 제출 보기'
                  : x.status === "draft"
                  ? "미션 작성"
                  : x.status === "changes_requested"
                    ? "피드백 확인"
                    : "제출 내용"}
              </Link>
            </article>
          ))}
        {!entries.filter((e) => status === "전체" || e.status === status)
          .length && <Empty title={status === '전체' ? '현재 공개된 미션이 없습니다.' : '이 상태의 미션이 없습니다.'}><p>새 미션은 해당 수업이 공개되면 확인할 수 있습니다.</p></Empty>}
      </div>
    </>
  );
}
function Questions(props: {data: Data; pending: boolean; send: WorkflowSend; order?: string | null}) {
  return process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' ? <QuestionHub order={props.order}/> : <LegacyQuestions {...props}/>;
}
function LegacyQuestions({
  data,
  pending,
  send,
  order,
}: {
  data: Data;
  pending: boolean;
  send: WorkflowSend;
  order?: string | null;
}) {
  const [filter, setFilter] = useState("전체"),
    [writing, setWriting] = useState(!!order),
    [error, setError] = useState("");
  const [threadStatuses, setThreadStatuses] = useState<Record<string, string>>({});
  const questionStatus = (q: Row) => threadStatuses[String(q.id)] || q.status;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await send(
        {
          action: "question",
          title: f.get("title"),
          content: f.get("content"),
        },
        "질문을 접수했습니다.",
      );
      setWriting(false);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const list = rows(data, "edu_questions").filter(
    (q) =>
      filter === "전체" ||
      (questionStatus(q) === "answered" ? "답변 완료" : "답변 대기") === filter,
  );
  return (
    <>
      <Heading
        title="내 질문"
        description="학습 중 막혔던 부분을 묻고, 답변을 한곳에서 확인하세요."
      >
        <button className="btn primary" onClick={() => setWriting(!writing)}>
          <MessageCircle />
          {writing ? "작성 닫기" : "질문하기"}
        </button>
      </Heading>
      {writing && (
        <form className="panel pad mb24" onSubmit={submit}>
          <label className="field">
            질문 제목
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={order ? "주문 " + order + " 문의" : ""}
            />
          </label>
          <label className="field">
            질문 내용
            <textarea name="content" required rows={5} />
          </label>
          <button className="btn primary" disabled={pending}>
            질문 등록
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <div className="chips mb24">
        {["전체", "답변 대기", "답변 완료"].map((x) => (
          <button
            className={"chip " + (filter === x ? "active" : "")}
            key={x}
            aria-pressed={filter === x}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {list.map((q) => (
        <article className="question-card" key={q.id}>
          <div className="between">
            <Badge color={questionStatus(q) === "answered" ? "green" : "amber"}>
              {questionStatus(q) === "answered" ? "답변 완료" : "답변 대기"}
            </Badge>
            <span className="meta">{date(q.created_at)}</span>
          </div>
          <h3>{t(q, "title")}</h3>
          {Boolean(q.learning_context) && <p className="meta">{t(q, "learning_context")}</p>}
          <p className="reading-copy">{t(q, "content")}</p><QuestionImage questionId={String(q.id)} imageId={q.image_id}/>
          {process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' ? <QuestionAnswerHistory questionId={String(q.id)} fallback={String(q.answer || '')} onStatusChange={status => setThreadStatuses(old => old[String(q.id)] === status ? old : {...old, [String(q.id)]: status})}/> : q.answer ? (
            <div className="answer">
              <b>운영자 답변</b>
              <p className="reading-copy"><AnswerText text={t(q, "answer")}/></p>
            </div>
          ) : (
            <p className="meta mt16">답변이 도착하면 이곳에서 확인해 주세요.</p>
          )}
        </article>
      ))}
      {!list.length && <Empty title="이 상태의 질문이 없습니다." />}
    </>
  );
}
function Orders({ data }: { data: Data }) {
  const [course, setCourse] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const valid = !from || !to || from <= to;
  const list = rows(data, "orders").filter(
    (o) =>
      (!course ||
        rows(data, "order_items").some(
          (i) => i.order_id === o.id && i.course_id === course,
        )) &&
      (!from || t(o, "created_at").slice(0, 10) >= from) &&
      (!to || t(o, "created_at").slice(0, 10) <= to),
  );
  return (
    <>
      <Heading
        title="신청·주문 내역"
        description="클래스 신청부터 결제와 환불 상태까지 확인하세요."
      />
      <section className="panel mb24">
        <div className="panel-body">
          <label className="field">
            상품
            <select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">전체 상품</option>
              {rows(data, "courses").map((c) => (
                <option key={c.id} value={c.id}>
                  {t(c, "title")}
                </option>
              ))}
            </select>
          </label>
          <div className="date-range">
            <label>
              주문일 시작
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <span>–</span>
            <label>
              주문일 종료
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              className="btn"
              onClick={() => {
                setCourse("");
                setFrom("");
                setTo("");
              }}
            >
              초기화
            </button>
          </div>
          {!valid && (
            <p className="form-error" role="alert">
              시작일은 종료일보다 늦을 수 없습니다.
            </p>
          )}
        </div>
      </section>
      {valid &&
        list.map((o) => (
          <article className="order-card" key={o.id}>
            <div className="order-card-head">
              <span>
                <b>{date(o.created_at)}</b> · {t(o, "order_number")}
              </span>
              <Badge color={o.status === "paid" ? "green" : "amber"}>
                {labels[t(o, "status")] || t(o, "status")}
              </Badge>
            </div>
            <div className="order-card-body">
              <div className="summary-thumb">
                {num(o, "total_amount") === 0 ? "FREE" : "CLASS"}
              </div>
              <div>
                <h3>
                  {rows(data, "order_items")
                    .filter((i) => i.order_id === o.id)
                    .map((i) => t(i, "item_name"))
                    .join(" · ")}
                </h3>
              </div>
              <span className="spacer" />
              <strong className="price">{money(num(o, "total_amount"))}</strong>
            </div>
            <div className="order-card-actions">
              <Link
                className="btn small"
                href={"/order-complete?order=" + o.id}
              >
                주문 상세
              </Link>
              {rows(data, "payments")
                .filter((p) => p.order_id === o.id && safeUrl(p.receipt_url))
                .map((p) => (
                  <a
                    key={p.id}
                    className="btn small"
                    href={safeUrl(p.receipt_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    영수증
                  </a>
                ))}
              {o.status === "paid" && (
                <Link
                  className="btn ghost small"
                  href={
                    "/my/questions?order=" +
                    encodeURIComponent(t(o, "order_number"))
                  }
                >
                  결제·환불 문의
                </Link>
              )}
              <span className="spacer" />
              <Link className="link" href="/my/classes">
                내 클래스
                <ArrowRight />
              </Link>
            </div>
          </article>
        ))}
      {valid && !list.length && <Empty title="조회된 주문이 없습니다." />}
    </>
  );
}
function Coupons({ data }: { data: Data }) {
  const [tab, setTab] = useState("available");
  const all = rows(data, "customer_coupons"),
    list = all.filter((c) => c.status === tab);
  return (
    <>
      <Heading
        title="내 쿠폰"
        description="사용할 수 있는 혜택과 적용 조건을 확인하세요."
      />
      <div className="status-tabs">
        {["available", "used", "revoked"].map((s) => (
          <button
            className={"tab " + (tab === s ? "active" : "")}
            key={s}
            onClick={() => setTab(s)}
          >
            {labels[s]}
            <span>{all.filter((c) => c.status === s).length}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        {list.map((c) => {
          const coupon = object(c, "coupon");
          return (
            <article className="coupon" key={c.id}>
              <div className="coupon-content">
                <Badge color="red">
                  {date(c.expires_at || coupon.ends_at)}까지
                </Badge>
                <strong className="mt16">
                  {coupon.discount_type === "percentage"
                    ? String(coupon.discount_value) + "%"
                    : money(Number(coupon.discount_value || 0))}{" "}
                  할인
                </strong>
                <h3>{String(coupon.name || "쿠폰")}</h3>
                <p>
                  코드 · {String(coupon.code || "")}
                  <br />
                  결제 단계에서 적용 조건을 확인하세요.
                </p>
                <Link className="btn small mt16" href="/classes">
                  클래스 보기
                </Link>
              </div>
              <div className="coupon-side">
                BRANDYACTION / {String(coupon.code || "COUPON")}
              </div>
            </article>
          );
        })}
      </div>
      {!list.length && <Empty title="해당하는 쿠폰이 없습니다." />}
      <div className="notice mt24">
        결제 화면에서 쿠폰 코드를 입력하세요. 쿠폰마다 사용 기간과 적용 조건이 다를 수 있으니 결제창에서 할인 금액을 확인해 주세요.
      </div>
    </>
  );
}
function hasMemberResources(data: Data) {
  return rows(data, 'enrollments').some(e => {
    if (!hasLearningAccess(e)) return false;
    const course = rows(data, 'courses').find(c => c.id === e.course_id);
    const ids = new Set(enrollmentLessons(data, e).map(l => l.id));
    return rows(data, 'lesson_contents').some(c => c.resource_storage_path && ids.has(t(c, 'lesson_id'))) || Boolean(course && (course.has_resources === true || productDigitalSections(object(course, 'metadata'), false).length || productResources(object(course, 'metadata')).length));
  });
}
function Resources({ data }: { data: Data }) {
  const [course, setCourse] = useState("");
  const contents = rows(data, "lesson_contents").filter(
      (c) => c.resource_storage_path,
    ),
    grouped = rows(data, "courses")
      .map((c) => {
        const enrollments = rows(data, "enrollments").filter(entry => entry.course_id === c.id && hasLearningAccess(entry));
        const lessonIds = new Set(enrollments.flatMap(enrollment =>
          enrollmentLessons(data, enrollment).map(lesson => lesson.id),
        ));
        const digitalSections = enrollments.length ? productDigitalSections(object(c, "metadata"), false) : [];
        const productFiles = enrollments.length ? productResources(object(c, "metadata")) : [];
        return {
          c,
          files: contents.filter(r => lessonIds.has(t(r, "lesson_id"))),
          digitalSections,
          productFiles,
        };
      })
      .filter((g) => (g.files.length || g.digitalSections.length || g.productFiles.length) && (!course || course === g.c.id));
  return (
    <>
      <Heading
        title="수강 자료·구매 파일"
        description="신청한 클래스의 자료와 구매한 파일을 한곳에서."
      />
      <div className="filter-row">
        <label className="full">
          클래스·상품
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">전체 자료</option>
            {rows(data, "courses").map((c) => (
              <option key={c.id} value={c.id}>
                {t(c, "title")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {grouped.map(({ c, files, digitalSections, productFiles }) => (
        <section className="panel mb24" key={c.id}>
          <div className="panel-head">
            <h2>{t(c, "title")}</h2>
            <Badge>수강 자료</Badge>
          </div>
          <div className="panel-body">
            {files.map((r) => (
              <ResourceRow key={t(r, "lesson_id")} content={r} />
            ))}
            {digitalSections.length ? <DigitalContentOutline sections={digitalSections} courseId={c.id} accessible /> : productFiles.map(resource => <ProductResourceRow key={resource.id} resource={resource} courseId={c.id} />)}
          </div>
        </section>
      ))}
      {!grouped.length && <Empty title="이용 가능한 자료가 없습니다." />}
    </>
  );
}
function Profile({
  user,
  pending,
  send,
  logout,
}: {
  user: User;
  pending: boolean;
  send: WorkflowSend;
  logout: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await send({
        action: "profile",
        name: f.get("name"),
        phone: f.get("phone"),
        contact_email: f.get("contact_email"),
      });
      setMessage("회원 정보를 저장했습니다.");
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  return (
    <>
      <Heading
        title="회원 정보"
        description="클래스 이용과 안내에 필요한 정보를 관리하세요."
      />
      <form onSubmit={submit}>
        <section className="panel">
          <div className="panel-head">
            <h2>기본 정보</h2>
          </div>
          <div className="panel-body">
            <div className="flex mb24">
              <span className="avatar">
                {(user.full_name || "나").slice(0, 1)}
              </span>
              <div>
                <b>{user.full_name || "회원"}</b>
                <p className="meta">내 학습 계정</p>
              </div>
            </div>
            <div className="profile-grid">
              <label className="field">
                이름
                <input
                  name="name"
                  autoComplete="name"
                  required
                  defaultValue={user.full_name || ""}
                />
              </label>
              <label className="field">
                휴대폰 번호
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  pattern="0[0-9 ()-]{8,15}"
                  title="예: 010-1234-5678"
                  defaultValue={user.phone || ""}
                />
              </label>
              <label className="field wide">
                로그인 이메일
                <input type="email" aria-label="로그인 이메일" value={user.email} readOnly />
                <small>변경하려면 아래의 로그인 이메일 변경을 이용해 주세요.</small>
              </label>
              <label className="field wide">
                안내받을 이메일
                <input name="contact_email" type="email" aria-label="안내받을 이메일" aria-describedby="contact-email-help contact-email-fallback" autoComplete="email" maxLength={254} defaultValue={user.contact_email || ""} placeholder={user.email || "example@email.com"} />
                <small id="contact-email-help">앞으로 보내는 결제·수강 안내를 이 주소로 받습니다. 기존 결제 건에도 적용되며 로그인 계정은 바뀌지 않습니다.</small>
                <small id="contact-email-fallback">비워 두면 결제할 때 등록한 이메일 또는 로그인 이메일을 사용합니다. 이미 보낸 메일은 다시 보내지 않습니다.</small>
              </label>
            </div>
          </div>
        </section>
        <div className="between mt24">
          <button
            className="btn ghost"
            type="button"
            disabled={pending}
            onClick={() => void logout()}
          >
            <LogOut />
            로그아웃
          </button>
          <button className="btn primary" disabled={pending}>
            변경 내용 저장
          </button>
        </div>
        {message && (
          <p className="notice mt16" role="status">
            {message}
          </p>
        )}
      </form>
      <LoginEmailSettings email={user.email} />
      {process.env.NEXT_PUBLIC_EDU_PERSONALIZATION_CONSENT_ENABLED === 'true' && <PersonalizationSettings/>}
      {process.env.NEXT_PUBLIC_EDU_OPTIONAL_CONSENT_ENABLED === 'true' && <ConsentSettings/>}
      {process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <EncouragementEditor/>}
    </>
  );
}
function Reviews({
  data,
  active,
  pending,
  send,
}: {
  data: Data;
  active: Row[];
  pending: boolean;
  send: WorkflowSend;
}) {
  const [tab, setTab] = useState("write"),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState("");
  const mine = rows(data, "my_reviews");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await send(
        {
          action: "review",
          enrollmentId: selected,
          rating: Number(f.get("rating")),
          content: f.get("content"),
        },
        "후기를 등록했습니다. 운영자 검토 후 공개됩니다.",
      );
      setSelected("");
      setTab("mine");
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  return (
    <>
      <Heading
        title="내 상품 후기"
        description="직접 실행해 본 경험을 다음 수강생에게 나눠 주세요."
      />
      <div className="status-tabs">
        <button
          className={"tab " + (tab === "write" ? "active" : "")}
          onClick={() => setTab("write")}
        >
          작성 가능한 후기
        </button>
        <button
          className={"tab " + (tab === "mine" ? "active" : "")}
          onClick={() => setTab("mine")}
        >
          내가 쓴 후기<span>{mine.length}</span>
        </button>
      </div>
      {tab === "write" ? (
        <>
          {active.map((e) => (
            <article className="order-card" key={e.id}>
              <div className="order-card-body">
                <div className="row-text">
                  <Badge color="green">수강 확인</Badge>
                  <h3>
                    {t(
                      rows(data, "courses").find((c) => c.id === e.course_id),
                      "title",
                    )}
                  </h3>
                  <p>내 업무에 적용한 경험을 남겨 주세요.</p>
                </div>
                <button className="btn small" onClick={() => setSelected(e.id)}>
                  후기 작성
                </button>
              </div>
            </article>
          ))}
          {selected && (
            <form className="panel pad mt24" onSubmit={submit}>
              <label className="field">
                만족도
                <select name="rating">
                  {[5, 4, 3, 2, 1].map((v) => (
                    <option key={v} value={v}>
                      {v}점
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                실행 경험
                <textarea name="content" required rows={5} />
              </label>
              <div className="flex">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setSelected("")}
                >
                  취소
                </button>
                <button className="btn primary" disabled={pending}>
                  후기 등록
                </button>
              </div>
              {message && (
                <p role="alert" className="form-error">
                  {message}
                </p>
              )}
            </form>
          )}
          {!active.length && (
            <Empty title="수강 신청 후 후기를 작성할 수 있습니다." />
          )}
        </>
      ) : (
        <>
          {mine.map((r) => (
            <article className="question-card" key={r.id}>
              <div className="between">
                <b>
                  {t(
                    rows(data, "courses").find((c) => c.id === r.course_id),
                    "title",
                  )}
                </b>
                <Badge>{labels[t(r, "status")] || t(r, "status")}</Badge>
              </div>
              <div className="stars mt16">
                {"★".repeat(Math.max(0, Math.min(5, num(r, "rating"))))}
              </div>
              <p>{t(r, "body")}</p>
              <div className="meta mt16">{date(r.created_at)}</div>
            </article>
          ))}
          {!mine.length && <Empty title="아직 작성한 후기가 없습니다." />}
        </>
      )}
      <div className="notice mt24">
        남겨주신 후기는 내용을 확인한 뒤 공개됩니다.
      </div>
    </>
  );
}
export function MemberViews({
  section = "",
  data,
  user,
  pending,
  send,
  logout,
  order,
  blockLearningEnabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true',
}: {
  section?: string;
  data: Data;
  user: User;
  pending: boolean;
  send: WorkflowSend;
  logout: () => Promise<void>;
  order?: string | null;
  ongoingLesson?: string;
  blockLearningEnabled?: boolean;
}) {
  const enrollments = rows(data, "enrollments"),
    active = enrollments.filter(enrollment => hasLearningAccess(enrollment));
  let content;
  switch (section) {
    case "":
    case "dashboard":
      content = <><Dashboard data={data} user={user} active={active} blockLearningEnabled={blockLearningEnabled} /><AppInstallCard/></>;
      break;
    case "classes":
      content = (
        <>
          <Heading
            title="내 클래스"
            description="나의 배움과 다음 일정을 확인하세요."
          />
          {enrollments.map((e) => (
            <div key={e.id}>
              <EnrolledCard data={data} enrollment={e} blockLearningEnabled={blockLearningEnabled} />
              {hasLearningAccess(e) && !isGraduate(e, rows(data, 'courses').find(course => course.id === e.course_id), rows(data, 'cohorts').find(cohort => cohort.id === e.cohort_id)) && (
                <LiveSchedule data={data} cohortId={t(e, "cohort_id")} />
              )}
            </div>
          ))}
          {hasMemberResources(data) && <Link className="btn mb24" href="/my/resources"><Download/> 수강 자료·구매 파일 받기</Link>}
          {!enrollments.length && (
            <Empty title="신청한 클래스가 없습니다.">
              <Link href="/classes">클래스 찾아보기</Link>
            </Empty>
          )}
        </>
      );
      break;
    case "missions":
      content = <Missions data={data} active={active} />;
      break;
    case "messages":
    case "questions":
      content = (
        <><Questions data={data} pending={pending} send={send} order={order} /><details className="panel pad mt24"><summary>질문·답변 알림 설정</summary><PushSettings userId={user.id}/></details>{process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === "true" && <details className="panel pad mt24" open={section === "messages"}><summary>이전 메시지 기록</summary><MemberMessages userId={user.id} readOnly /></details>}</>
      );
      break;
    case "orders":
      content = <Orders data={data} />;
      break;
    case "coupons":
      content = <Coupons data={data} />;
      break;
    case "resources":
      content = <Resources data={data} />;
      break;
    case "profile":
      content = (
        <><Profile user={user} pending={pending} send={send} logout={logout} /><AppInstallCard settings/></>
      );
      break;
    case "reviews":
      content = (
        <Reviews data={data} active={active} pending={pending} send={send} />
      );
      break;
    default:
      content = <Empty title="페이지를 찾을 수 없습니다." />;
  }
  return (
    <div className="account-bg">
      <div className="wrap account-layout">
        <aside className="account-aside">
          <div className="account-profile">
            <span className="avatar">
              {(user.full_name || "나").slice(0, 1)}
            </span>
            <div>
              <b>{user.full_name || "회원"}님</b>
              <p>나의 배움과 실행</p>
            </div>
          </div>
          <nav className="account-nav" aria-label="마이페이지">
            {["admin", "staff"].includes(user.role) && (
              <Link className="member-mobile-admin-tab" href="/admin">
                <Settings />
                운영 관리자
              </Link>
            )}
            {accountGroups.map(([title, links]) => (
              <div className="member-nav-group" key={title}>
                <span className="member-nav-label">{title}</span>
                {links.map(([route, label, Icon]) => (
                  <Link
                    key={route}
                    className={
                      (section === "dashboard" ? "" : section === "messages" ? "questions" : section) === route
                        ? "active"
                        : ""
                    }
                    aria-current={
                      (section === "dashboard" ? "" : section === "messages" ? "questions" : section) === route
                        ? "page"
                        : undefined
                    }
                    href={"/my" + (route ? "/" + route : "")}
                  >
                    <Icon />
                    {label}
                  </Link>
                ))}
                {title === '나의 학습' && <DiagnosisEntry navigation/>}
              </div>
            ))}
          </nav>
          <div className="member-help">
            <button
              className="btn ghost small"
              disabled={pending}
              onClick={() => void logout()}
            >
              <LogOut />
              로그아웃
            </button>
            {["admin", "staff"].includes(user.role) && (
              <Link className="btn ghost small" href="/admin">
                <Settings />
                운영 관리자
              </Link>
            )}
          </div>
        </aside>
        <div className="account-main">{content}</div>
      </div>
    </div>
  );
}
