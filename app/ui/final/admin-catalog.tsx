"use client";
import { MemberVisitsToggle } from './member-visits';
import { MvpBadge, useMemberMvps } from './member-mvp';
import { QuestionAiBatch } from './question-ai-batch';
import { lessonBodyPlainText } from "@/lib/lesson-body";
import {
  date,
  labels,
  money,
  number as num,
  object,
  safeUrl,
  text as t,
  type Row,
  type Section,
} from "@/lib/platform";
import { productSalesStatus, recordId } from "@/lib/platform-rules";
import { couponStatus } from "@/lib/coupon-rules";
import { productConversion } from "@/lib/product-conversion";
import { isProductListed } from "@/lib/product-visibility";
import { archiveValues, cohortPeriod, cohortStatus } from "@/lib/qa-rules";
import { ArrowRight, BookOpen, ChevronDown, ChevronUp, FileText, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AdminButton, AdminDataTable, AdminEmptyState, AdminFilterBar, AdminLinkButton, AdminPagination, AdminSearchField, AdminSelect, AdminStatusBadge, AdminSummaryCard } from "@/features/admin-ui";
import type { Data, WorkflowSend } from "../learning-workflows";
import { Empty, courseType } from "./primitives";
import type { MissionContext } from "./mission-target-fields";

export type MissionScope = MissionContext & { state: "active" | "published" | "hidden" | "archived" };

type Props = {
  section: Section;
  data: Data;
  selection: string[];
  setSelection: (ids: string[]) => void;
  edit: (section: Section, row?: Row, context?: MissionContext) => void;
  missionScope?: MissionScope;
  onMissionScopeChange?: (scope: MissionScope) => void;
  archive: (section: Section, ids: string[]) => void;
  pending: boolean;
  loading: boolean;
  pagination: { page: number; pageSize: number; total: number } | null;
  setPage: (page: number) => void;
  exportCsv: (rows: Row[], name: string) => void;
  send?: WorkflowSend;
  tools?: ReactNode;
  onQuestionChanged?: () => void;
  blockLearningEnabled?: boolean;
};
type Column = { label: string; value: (row: Row) => ReactNode };
function CatalogTable({ label, loading, children }: { label: string; loading: boolean; children: ReactNode }) {
  return <AdminDataTable label={label} density="standard" loading={loading}>{children}</AdminDataTable>;
}
const named = (r?: Row) =>
  t(r, "title") || t(r, "name") || t(r, "full_name") || t(r, "email") || "—";
const tagRuleLabel = (value: unknown) => ({ free_lesson_1: "무료강의 1강 시청", free_lesson_2: "무료강의 2강 시청", free_lesson_3: "무료강의 3강 시청", paid_customer: "결제 완료", mission_completed: "미션 수행", signed_up: "회원가입" }[String(value)] || "관리자가 직접 부여");
export function AdminCatalog({
  section: s,
  data,
  selection,
  setSelection,
  edit,
  archive,
  pending,
  loading,
  pagination,
  setPage,
  exportCsv,
  send,
  tools,
  missionScope,
  onMissionScopeChange,
  onQuestionChanged,
  blockLearningEnabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true',
}: Props) {
  const params = useSearchParams(), router = useRouter();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [localCourse, setLocalCourse] = useState(""),
    [localWeek, setLocalWeek] = useState(""),
    [archived, setArchived] = useState(false),
    [productVisibility, setProductVisibility] = useState<"active" | "archived">("active"),
    [bulkMode, setBulkMode] = useState(false),
    [tagMode, setTagMode] = useState(""),
    [now] = useState(Date.now);
  const [localMissionState, setLocalMissionState] = useState<MissionScope["state"]>("active");
  const [restoreError, setRestoreError] = useState("");
  const course = missionScope?.courseId ?? localCourse, week = missionScope?.weekId ?? localWeek;
  const missionState = missionScope?.state ?? localMissionState;
  const changeMissionScope = (next: Partial<MissionScope>) => {
    const scope = { courseId: course, weekId: week, state: missionState, ...next };
    if (onMissionScopeChange) onMissionScopeChange(scope);
    else { setLocalCourse(scope.courseId); setLocalWeek(scope.weekId); setLocalMissionState(scope.state); }
    setSelection([]);
    setRestoreError("");
  };
  const setCourse = (value: string) => s.key === "missions" ? changeMissionScope({ courseId: value, weekId: "" }) : setLocalCourse(value);
  const setWeek = (value: string) => s.key === "missions" ? changeMissionScope({ weekId: value }) : setLocalWeek(value);
  const rows = data[s.table] || [];
  const productSummary = data.product_summary?.[0];
  const courses = useMemo(() => data.courses || [], [data.courses]);
  const weeks = useMemo(() => data.curriculum_weeks || [], [data.curriculum_weeks]);
  const lessons = useMemo(
    () => data.curriculum_lessons || [],
    [data.curriculum_lessons],
  );
  const cohorts = useMemo(() => data.cohorts || [], [data.cohorts]);
  const memberTags = useMemo(() => data.crm_member_tags || [], [data.crm_member_tags]);
  const tags = useMemo(() => data.crm_tags || [], [data.crm_tags]);
  const lessonById = new Map(lessons.map((item) => [item.id, item]));
  const scopedWeeks = weeks.filter((item) => !course || item.course_id === course).toSorted((a, b) => num(a, "week_number") - num(b, "week_number"));
  const missionWeekGroups = Array.from(scopedWeeks.reduce((groups, item) => {
    const courseId = String(item.course_id);
    groups.set(courseId, [...(groups.get(courseId) || []), item]);
    return groups;
  }, new Map<string, Row[]>()).entries()).toSorted(([first], [second]) =>
    named(courses.find((item) => item.id === first)).localeCompare(named(courses.find((item) => item.id === second)), "ko"),
  );
  const scopedLessons = lessons.filter((item) => scopedWeeks.some((w) => w.id === item.week_id));
  const quizByMission = new Map((data.mission_quizzes || []).map((item) => [String(item.mission_id), item]));
  const quizCount = (missionId: string) => { const quiz = quizByMission.get(missionId); return Array.isArray(quiz?.questions) ? quiz.questions.length : 0; };
  const enrollments = useMemo(() => data.enrollments || [], [data.enrollments]);
  const customerCourseNames = useMemo(() => {
    const courseNames = new Map(courses.map((item) => [item.id, named(item)]));
    const cohortNames = new Map(cohorts.map((item) => [item.id, named(item)]));
    const result = new Map<unknown, Set<string>>();
    for (const enrollment of enrollments) {
      if (enrollment.status !== "active") continue;
      const name = courseNames.get(String(enrollment.course_id));
      if (!name || name === "—") continue;
      const names = result.get(enrollment.user_id) || new Set<string>();
      const cohortName = cohortNames.get(String(enrollment.cohort_id));
      names.add(cohortName ? `${name} · ${cohortName}` : name);
      result.set(enrollment.user_id, names);
    }
    return result;
  }, [courses, cohorts, enrollments]);
  const resourceCounts = useMemo(() => {
    const weekCourse = new Map(weeks.map((item) => [item.id, String(item.course_id)]));
    const lessonCourse = new Map(
      lessons.map((item) => [item.id, weekCourse.get(String(item.week_id)) || ""]),
    );
    const result = new Map<string, number>();
    for (const item of data.lesson_contents || []) {
      if (!item.resource_storage_path && !item.resource_name) continue;
      const productId = lessonCourse.get(String(item.lesson_id));
      if (productId) result.set(productId, (result.get(productId) || 0) + 1);
    }
    return result;
  }, [data.lesson_contents, lessons, weeks]);
  const customerCourses = (memberId: unknown) => [...(customerCourseNames.get(memberId) || [])];
  const customerTags = (memberId: unknown) => memberTags.filter((item) => item.member_id === memberId).flatMap((item) => { const tag = tags.find((tag) => tag.id === item.tag_id); return tag ? [tag] : []; });
  const bannerStatus = (row: Row) => !row.is_active ? "hidden" : row.ends_at && Date.parse(String(row.ends_at)) < now ? "completed" : row.starts_at && Date.parse(String(row.starts_at)) > now ? "upcoming" : "published";
  const statusLabel = (value: string) => s.key === "coupons" ? ({ active: "발급 중", upcoming: "발급 예정", expired: "종료", inactive: "비활성", draft: "임시 저장", admin_test: "관리자 테스트" }[value] || value) : s.key === "banners" ? ({ published: "게시 중", upcoming: "예약", completed: "노출 종료", hidden: "비공개" }[value] || value) : s.key === "customers" ? ({ active: "정상", suspended: "이용 제한" }[value] || labels[value] || value) : s.key === "products" ? ({ published: "판매 중", draft: "작성 중", archived: "판매 종료" }[value] || labels[value] || value) : value === "hidden" && ["learning", "missions"].includes(s.key) ? "비공개" : labels[value] || value;
  const productResourceCount = (productId: unknown) => resourceCounts.get(String(productId)) || 0;
  const getCourse = (r: Row) =>
    r.course_id ||
    (s.key === "learning"
      ? weeks.find((w) => w.id === r.week_id)?.course_id
      : s.key === "missions"
        ? weeks.find(
            (w) => w.id === lessons.find((l) => l.id === r.lesson_id)?.week_id,
          )?.course_id
        : "");
  const getStatus = (r: Row) =>
    s.key === "cohorts"
      ? cohortStatus(r)
      : s.key === "coupons" ? couponStatus(r)
      : s.key === "banners" ? bannerStatus(r)
      : t(r, "status") ||
        (r.is_active || r.is_published ? "published" : "hidden");
  const scopedMissions = rows.filter(r => (!course || getCourse(r) === course) && (!week || lessonById.get(String(r.lesson_id))?.week_id === week));
  const missionSummary = data.mission_summary?.[0] || {
    id: "local-summary", active: scopedMissions.filter(r => !r.archived_at).length,
    published: scopedMissions.filter(r => !r.archived_at && r.is_published).length,
    hidden: scopedMissions.filter(r => !r.archived_at && !r.is_published).length,
    archived: scopedMissions.filter(r => r.archived_at).length,
  };
  const memberSummary = data.member_summary?.[0];
  const filtered = rows.filter(
    (r) =>
      (s.key === "missions" ? missionState === "archived" ? Boolean(r.archived_at) : !r.archived_at && (missionState === "active" || Boolean(r.is_published) === (missionState === "published")) : s.key === "products" ? productVisibility === "archived" ? Boolean(r.archived_at) : !r.archived_at : archived || !r.archived_at) &&
      (!status || (s.key === "coupons" && status === "admin_test" ? r.discount_type === "ADMIN_FREE" : getStatus(r) === status)) &&
      (!tagMode || r.tag_kind === tagMode) &&
      (!type ||
        (s.key === "products" ? courseType(r) : r.content_type) === type) &&
      (!course ||
        (s.key === "customers"
          ? enrollments.some(
              (enrollment) =>
                enrollment.user_id === r.id &&
                enrollment.course_id === course &&
                enrollment.status === "active",
            )
          : getCourse(r) === course)) &&
      (!week ||
        (s.key === "learning"
          ? r.week_id
          : lessons.find((l) => l.id === r.lesson_id)?.week_id) === week) &&
    (s.key === "customers" ? `${JSON.stringify(r)} ${customerTags(r.id).map(named).join(" ")} ${customerCourses(r.id).join(" ")}` : JSON.stringify(r)).toLowerCase().includes(query.toLowerCase()),
  ).toSorted((a, b) => s.key === "banners" ? num(a, "display_order") - num(b, "display_order") : s.key === "weeks" ? num(a, "week_number") - num(b, "week_number") || named(a).localeCompare(named(b), "ko") : 0);
  const mvps = useMemberMvps(s.key === "customers" ? filtered.map(row => row.id) : [], blockLearningEnabled);
  const allCourseWeeks = course ? rows.filter((row) => row.course_id === course).toSorted((a, b) => num(a, "week_number") - num(b, "week_number")) : [];
  // Onboarding stays at week zero; only the regular weeks can trade places.
  const activeCourseWeeks = allCourseWeeks.filter((row) => !row.archived_at && num(row, "week_number") > 0);
  const weekGroups = s.key === "weeks"
    ? Array.from(filtered.reduce((groups, row) => {
        const number = num(row, "week_number");
        groups.set(number, [...(groups.get(number) || []), row]);
        return groups;
      }, new Map<number, Row[]>()).entries()).sort(([a], [b]) => a - b)
    : [];
  const weekReorderDisabled = !course || Boolean(query || status || archived) || pagination !== null && pagination.total > rows.length;
  async function moveBanner(row: Row, direction: -1 | 1) {
    if (!send || pending) return;
    const index = filtered.findIndex(item => item.id === row.id);
    const target = filtered[index + direction];
    if (!target) return;
    const currentOrder = num(row, "display_order");
    const targetOrder = num(target, "display_order");
    await send({ action: "save", section: "banners", id: row.id, values: { display_order: targetOrder } });
    await send({ action: "save", section: "banners", id: target.id, values: { display_order: currentOrder } }, "배너 노출 순서를 변경했습니다.");
  }
  async function moveWeek(row: Row, direction: -1 | 1) {
    if (!send || pending || weekReorderDisabled) return;
    const index = activeCourseWeeks.findIndex((item) => item.id === row.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= activeCourseWeeks.length) return;
    const reorderedActive = [...activeCourseWeeks];
    [reorderedActive[index], reorderedActive[targetIndex]] = [reorderedActive[targetIndex], reorderedActive[index]];
    let activeIndex = 0;
    const ids = allCourseWeeks.filter(item => !item.archived_at).map((item) => num(item, "week_number") === 0 ? String(item.id) : String(reorderedActive[activeIndex++].id));
    await send({ action: "reorder-weeks", courseId: course, ids }, "주차 순서를 변경했습니다.");
  }
  const missionGroups = scopedWeeks
    .filter((item) => !week || item.id === week)
    .map((item) => ({ week: item, missions: filtered.filter((mission) => lessonById.get(String(mission.lesson_id))?.week_id === item.id).toSorted((a, b) => num(lessonById.get(String(a.lesson_id)), "day_number") - num(lessonById.get(String(b.lesson_id)), "day_number")) }))
    .filter((group) => group.missions.length);
  const unmatchedMissions = s.key === "missions" ? filtered.filter((mission) => !weeks.some((item) => item.id === lessonById.get(String(mission.lesson_id))?.week_id)) : [];
  const renderMission = (mission: Row) => (
    <article className="mission-row mission-day-row" key={mission.id}>
      <span className="day-no">{lessonById.has(String(mission.lesson_id)) ? String(num(lessonById.get(String(mission.lesson_id)), "day_number")).padStart(2, "0") : "—"}</span>
      <div className="mission-copy">
        <span className="mission-day-label">Day {lessonById.has(String(mission.lesson_id)) ? num(lessonById.get(String(mission.lesson_id)), "day_number") : "—"}</span>
        {mission.archived_at ? <strong>{t(mission, "title")}</strong> : <button className="title-btn" onClick={() => edit(s, mission)}><strong>{t(mission, "title")}</strong></button>}
        <p>{labels[t(mission, "submission_type")] || t(mission, "submission_type")} · 확인 퀴즈 {quizCount(mission.id)}문항 · {mission.is_required ? "필수 미션" : "선택 미션"}{mission.submission_type === "quiz" ? "" : " · 관리자 승인"}</p>
      </div>
      <AdminStatusBadge status={mission.archived_at ? "archived" : mission.is_published ? "published" : "hidden"} label={mission.archived_at ? "보관" : mission.is_published ? "공개" : "비공개"} />
      <div className="row mission-actions">
        {lessonById.has(String(mission.lesson_id)) && <AdminLinkButton size="sm" className="mission-content-edit" href={`/admin/learning-editor?id=${encodeURIComponent(String(mission.lesson_id))}`}><FileText size={15} />콘텐츠 편집</AdminLinkButton>}
        {bulkMode && <input type="checkbox" aria-label={t(mission, "title") + " 선택"} checked={selection.includes(recordId(mission))} onChange={(event) => setSelection(event.target.checked ? [...selection, recordId(mission)] : selection.filter((id) => id !== recordId(mission)))} />}
        {!mission.archived_at && <AdminButton size="sm" variant="outline" onClick={() => edit(s, mission)}>미션 설정</AdminButton>}
        {Boolean(mission.archived_at) && send && <AdminButton size="sm" variant="outline" disabled={pending || loading} onClick={async () => {
          setRestoreError("");
          try { await send({ action: "save", section: "missions", id: mission.id, values: { is_published: false } }, "비공개로 복구했습니다. 비공개 목록에서 확인해 주세요."); }
          catch (error) { setRestoreError(error instanceof Error ? error.message : "복구하지 못했습니다. 다시 시도해 주세요."); }
        }}><RotateCcw size={15} />비공개로 복구</AdminButton>}
      </div>
    </article>
  );
  const badge = (r: Row) => {
    const value = getStatus(r);
    if (s.key === "products") {
      const sale = productSalesStatus(r, cohorts, now, Boolean(productConversion(object(r, "metadata")).url));
      return <><AdminStatusBadge status={value} label={sale.label} tone={sale.label === "판매 보류" ? "warning" : value === "published" ? "success" : "neutral"} />{value === "published" && sale.issues.length > 0 && <small>{sale.issues.join(" · ")}</small>}</>;
    }
    return <AdminStatusBadge status={value} label={statusLabel(value)} />;
  };
  const courseName = (r: Row) =>
    named(courses.find((c) => c.id === getCourse(r)));
  const title = (r: Row) =>
    t(r, "title") ||
    t(r, "name") ||
    t(r, "full_name") ||
    t(r, "key") ||
    t(r, "author_name") ||
    "기록";
  const columns: Record<string, Column[]> = {
    products: [
      {
        label: "상품",
        value: (r) => (
          <div className="catalog-name">
            <div
              className={
                "catalog-cover " +
                (courseType(r) === "무료 클래스"
                  ? "red-cover"
                  : courseType(r) === "디지털 상품"
                    ? "gray-cover"
                    : "")
              }
            >
              {safeUrl(
                object(r, "metadata").thumbnail_url ||
                  object(r, "metadata").thumbnailUrl,
              ) ? (
                <img
                  src={safeUrl(
                    object(r, "metadata").thumbnail_url ||
                      object(r, "metadata").thumbnailUrl,
                  )}
                  alt=""
                />
              ) : (
                <>
                  BRANDY
                  <br />
                  EDU
                </>
              )}
            </div>
            <div>
              <button className="title-btn" onClick={() => edit(s, r)}>
                {t(r, "title")}
              </button>
              {!isProductListed(r) && <AdminStatusBadge status="hidden" label="비노출" />}
            </div>
          </div>
        ),
      },
      { label: "유형", value: courseType },
      {
        label: "판매가",
        value: (r) => (
          <b>{num(r, "list_price") ? money(num(r, "list_price")) : "무료"}</b>
        ),
      },
      {
        label: "연결 기수",
        value: (r) =>
          cohorts
            .filter((c) => c.course_id === r.id)
            .map((c) => `${t(c, "name")} · ${labels[t(c, "status")] || t(c, "status")}`)
            .join(", ") || "미연결",
      },
      { label: "자료", value: (r) => productResourceCount(r.id) + "개" },
      { label: "공개 점검", value: (r) => {
        const issues = productSalesStatus(r, cohorts, now, Boolean(productConversion(object(r, "metadata")).url)).issues;
        return issues.length ? <><AdminStatusBadge status="not_configured" label="확인 필요" tone="warning" /><small>{issues.join(" · ")}</small></> : <AdminStatusBadge status="approved" label="준비 완료" />;
      } },
      { label: "판매 상태", value: badge },
    ],
    cohorts: [
      {
        label: "기수·회차",
        value: (r) => (
          <>
            <b>{t(r, "name")}</b>
            <small>{t(r, "cohort_code")}</small>
          </>
        ),
      },
      { label: "상품", value: courseName },
      {
        label: "모집 기간",
        value: (r) => (
          <>
            {date(r.recruitment_start_at)}
            <br />~ {date(r.recruitment_end_at)}
          </>
        ),
      },
      { label: "교육 일정", value: (r) => cohortPeriod(r) },
      {
        label: "정원",
        value: (r) => (r.capacity ? num(r, "capacity") + "명" : "제한 없음"),
      },
      { label: "판매가", value: (r) => money(num(r, "price")) },
      { label: "상태", value: badge },
    ],
    customers: [
      {
        label: "회원",
        value: (r) => (
          <div className="person">
            <span className="avatar" style={mvps.members[r.id]?.isMvp ? { border: `3px solid ${mvps.members[r.id].color || mvps.color}` } : undefined}>{named(r).slice(0, 1)}</span>
            <div>
              <button className="title-btn" onClick={() => edit(s, r)}>{named(r)}</button>{mvps.members[r.id]?.isMvp && <MvpBadge color={mvps.members[r.id].color || mvps.color}/>}
              <small>{t(r, "email")}</small>
              {Boolean(r.phone) && <small>{t(r, "phone")}</small>}
            </div>
          </div>
        ),
      },
      {
        label: "수강 중인 클래스",
        value: (r) => customerCourses(r.id).join(", ") || "수강 없음",
      },
      {
        label: "고객 태그",
        value: (r) => (
          <div className="tag-list">
            {customerTags(r.id).map((tag) => <span className="tag-chip" key={tag.id}>{named(tag)}</span>)}
            {!customerTags(r.id).length && <span className="meta">—</span>}
          </div>
        ),
      },
      { label: "가입일", value: (r) => date(r.created_at) },
      {
        label: "수신 동의",
        value: (r) => r.marketing_consent ? "동의" : "미동의",
      },
      { label: "계정 상태", value: badge },
    ],
    tags: [
      { label: "태그", value: (r) => <b className="tag-name"><span className="tag-marker" style={{ "--tag-color": /^#[0-9a-f]{3,8}$/i.test(t(r, "color")) ? t(r, "color") : "#667ca0" } as CSSProperties} />{t(r, "name")}</b> },
      { label: "분류", value: (r) => <AdminStatusBadge status={String(r.tag_kind)} label={r.tag_kind === "automatic" ? "자동" : "수동"} tone={r.tag_kind === "automatic" ? "info" : "neutral"} /> },
      { label: "부여 조건", value: (r) => <p className="tag-condition">{r.tag_kind === "automatic" ? tagRuleLabel(r.rule_key) : "관리자가 직접 부여"}</p> },
      { label: "회원 수", value: (r) => Array.isArray(r.crm_member_tags) ? String(r.crm_member_tags[0]?.count ?? 0) + "명" : "—" },
      { label: "상태", value: (r) => <AdminStatusBadge status={r.is_active === false ? "inactive" : "active"} label={r.is_active === false ? "사용 중지" : "사용 중"} /> },
    ],
    coupons: [
      {
        label: "쿠폰",
        value: (r) => (
          <>
            <b>{t(r, "name")}</b>
            <small>{t(r, "code")}</small>
            {r.discount_type === 'ADMIN_FREE' && <AdminStatusBadge status="admin_only" label="관리자 전용" tone="info" />}
          </>
        ),
      },
      {
        label: "혜택",
        value: (r) => <>{r.discount_type === 'ADMIN_FREE' ? '100% 무료' : r.discount_type === "percentage" ? num(r, "discount_value") + "%" : money(num(r, "discount_value"))}<small>{Number(r.minimum_order_amount || 0) > 0 ? `최소 ${money(num(r, "minimum_order_amount"))}` : "최소 주문 제한 없음"}</small></>,
      },
      {
        label: "적용 대상",
        value: (r) => { const tag = tags.find(item => item.id === r.target_tag_id); const products = courses.filter(item => (data.coupon_products || []).some(link => link.coupon_id === r.id && link.course_id === item.id)); return <>{r.discount_type === "ADMIN_FREE" ? "관리자만" : r.issue_target === "tag" ? named(tag) : "전체 회원"}<small>{r.product_scope === "specific" ? products.map(named).join(", ") : r.product_scope === "paid" ? "유료 클래스" : "전체 상품"}</small></>; },
      },
      {
        label: "사용 / 수량",
        value: (r) => `${(data.coupon_redemptions || []).filter(redemption => redemption.coupon_id === r.id && redemption.status === "used").length} / ${r.usage_limit ? num(r, "usage_limit") : "∞"}`,
      },
      { label: "유효기간", value: (r) => <>{date(r.starts_at)}<br />~ {date(r.ends_at)}</> },
      { label: "상태", value: badge },
    ],
    "product-reviews": [
      {
        label: "작성자 · 상품",
        value: (r) => <div className="review-author"><b>{t(r, "author_name") || t(r, "author_nickname") || named((data.profiles || []).find((member) => member.id === r.user_id))}</b><p>{courseName(r)}</p><small>{r.order_id ? "구매 연결" : "수강 후기"}</small></div>,
      },
      {
        label: "평점·후기",
        value: (r) => (
          <>
            <span className="stars">
              {"★".repeat(Math.max(0, Math.min(5, num(r, "rating"))))}{"☆".repeat(5 - Math.max(0, Math.min(5, num(r, "rating"))))}
            </span>
            <p className="table-excerpt">{t(r, "body")}</p>
          </>
        ),
      },
      { label: "공개 상태", value: badge },
      { label: "상품 대표 노출", value: (r) => r.is_featured ? <AdminStatusBadge status="featured" label="상품 대표" tone="info" /> : <span className="meta">일반 후기</span> },
    ],
    banners: [
      { label: "순서", value: (r) => num(r, "display_order") },
      {
        label: "배너 텍스트·이미지",
        value: (r) => (
          <div className="catalog-name">
            <div className="asset-preview">
              {safeUrl(r.image_url || r.image_path) ? (
                <img src={safeUrl(r.image_url || r.image_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span>{t(r, "title") || "메인 배너"}</span>
              )}
            </div>
            <div>
              <span className="section-code">{t(r, "eyebrow") || "상단 문구 미등록"}</span>
              <button className="title-btn" onClick={() => edit(s, r)}>{t(r, "title")}</button>
              <p>{t(r, "description") || "설명 문구 미등록"}</p>
            </div>
          </div>
        ),
      },
      {
        label: "CTA 버튼·연결",
        value: (r) => (
          <div className="banner-cta-cell">
            <b>{t(r, "link_label") || "기본 CTA 문구"}</b>
            {safeUrl(r.link_url) ? (
              <a className="text-link" href={safeUrl(r.link_url)} target="_blank" rel="noreferrer">
                {t(r, "link_url")}
              </a>
            ) : <small>기본 무료 클래스 연결</small>}
          </div>
        ),
      },
      {
        label: "노출 기간",
        value: (r) => (
          <>
            {date(r.starts_at)}
            <br />~ {date(r.ends_at)}
          </>
        ),
      },
      { label: "노출 상태", value: badge },
    ],
    articles: [
      {
        label: "아티클",
        value: (r) => (
          <div className="article-table-title">
            {safeUrl(r.cover_image_url || r.cover_image_path) ? <img className="article-admin-thumb" src={safeUrl(r.cover_image_url || r.cover_image_path)} alt="" /> : <span className="article-type-icon">{r.content_type === "video" ? <BookOpen /> : <FileText />}</span>}
            <div>
              <button className="title-btn" onClick={() => edit(s, r)}>
                {t(r, "title")}
              </button>
              <p>/articles/{t(r, "slug")}</p>
            </div>
          </div>
        ),
      },
      {
        label: "유형",
        value: (r) => (r.content_type === "video" ? "영상" : "글"),
      },
      { label: "상태", value: badge },
      { label: "대표", value: (r) => (r.is_featured ? "대표 노출" : "—") },
      { label: "발행일", value: (r) => date(r.published_at || r.created_at) },
    ],
    testimonials: [
      {
        label: "고객 이야기",
        value: (r) => (
          <>
            <b>{t(r, "title")}</b>
            <small>
              {t(r, "reviewer_name")} · {t(r, "reviewer_role")}
            </small>
          </>
        ),
      },
      {
        label: "내용",
        value: (r) => <p className="table-excerpt">{t(r, "description")}</p>,
      },
      {
        label: "영상",
        value: (r) =>
          safeUrl(r.video_url) ? (
            <a
              className="text-link"
              href={safeUrl(r.video_url)}
              target="_blank"
              rel="noreferrer"
            >
              영상 보기
            </a>
          ) : (
            "미등록"
          ),
      },
      { label: "공개", value: badge },
    ],
    weeks: [
      { label: "주차", value: (r) => num(r, "week_number") + "주차" },
      { label: "제목", value: (r) => <b>{t(r, "title")}</b> },
      { label: "상품", value: courseName },
      { label: "학습 목표", value: (r) => t(r, "goal") },
      { label: "공개", value: badge },
    ],
    contents: [
      {
        label: "학습",
        value: (r) => named(lessons.find((l) => l.id === r.lesson_id)),
      },
      { label: "영상", value: (r) => (r.vod_url ? "등록됨" : "미등록") },
      { label: "자료", value: (r) => t(r, "resource_name") || "미등록" },
      {
        label: "본문",
        value: (r) => <p className="table-excerpt">{lessonBodyPlainText(t(r, "body_text"))}</p>,
      },
    ],
  };
  const cols = columns[s.key] || [
    { label: "제목", value: (r: Row) => <b>{title(r)}</b> },
    { label: "상태", value: badge },
    { label: "등록일", value: (r: Row) => date(r.created_at) },
  ];
  const search = (
    <AdminSearchField
      value={query}
      placeholder={s.key === "customers" ? "이름 · 이메일 · 연락처 · 태그 검색" : s.key === "products" ? "상품명 검색" : s.key === "learning" ? "학습 제목 검색" : s.title + " 검색"}
      label={`${s.title} 목록 검색`}
      onChange={(e) => {
        setQuery(e.target.value);
        setSelection([]);
      }}
    />
  );
  const statusFilter = (
    <AdminSelect
      label="상태 필터"
      labelHidden
      value={status}
      onChange={(e) => {
        setStatus(e.target.value);
        setSelection([]);
      }}
    >
      <option value="">전체 상태</option>
      {(s.key === 'coupons' ? ['draft','upcoming','active','expired','inactive','admin_test'] : [...new Set(rows.map(getStatus))]).map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </AdminSelect>
  );
  const scope = ["learning", "missions", "cohorts"].includes(s.key) ? (
    <div className="scope product-scope">
      <div>
        <label>
          상품
          <select
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              if (s.key !== "missions") setWeek("");
              setSelection([]);
            }}
          >
            <option value="">전체 상품</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c, "title")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scope-summary">
        <div className="scope-title">{course ? named(courses.find((item) => item.id === course)) : s.key === "cohorts" ? "전체 상품 기수·회차 운영" : "전체 상품 학습 운영"}</div>
        {s.key === "cohorts" ? <p>{rows.filter((item) => !course || item.course_id === course).length}개 기수 · {(data.cohort_sessions || []).filter((session) => !course || rows.some((cohort) => cohort.id === session.cohort_id && cohort.course_id === course)).length}개 회차</p> : <p>{scopedWeeks.length}주차 · {scopedLessons.length}개 학습{s.key === "missions" ? ` · 보관 제외 미션 ${num(missionSummary, "active")}개` : course ? ` · ${rows.filter((item) => getCourse(item) === course).length}개 항목` : ""}</p>}
      </div>
      <span className="spacer" />
      {course && <AdminStatusBadge status={t(courses.find((item) => item.id === course), "status")} label={labels[t(courses.find((item) => item.id === course), "status")] || "작성 중"} />}
    </div>
  ) : null;
  const selectAll = (
    <input
      type="checkbox"
      aria-label="현재 목록 전체 선택"
      checked={
        filtered.length > 0 &&
        filtered.every((r) => selection.includes(recordId(r)))
      }
      onChange={(e) =>
        setSelection(e.target.checked ? filtered.map(recordId) : [])
      }
    />
  );
  return (
    <>
      {s.key === 'customers' && blockLearningEnabled && <MemberVisitsToggle/>}
      {s.key === 'customers' && mvps.error && <p role="alert" className="notice">{mvps.error}</p>}
      {['customers', 'questions'].includes(s.key) && (params.get('member') || params.get('question')) && <p className="notice mb16">연결된 {params.get('question') ? '질문' : '회원'}만 조회 중입니다. <Link className="text-link" href={`/admin/${s.key}`}>전체 목록 보기</Link></p>}
      {s.key === "products" && <div className="admin-pilot-summary" aria-label="상품 요약">
        <AdminSummaryCard compact label="전체 상품" value={`${productSummary ? num(productSummary, "total") : pagination?.total ?? rows.filter(item => !item.archived_at).length}개`} scope="클래스 · 디지털 자료" />
        <AdminSummaryCard compact label="공개 설정" value={`${productSummary ? num(productSummary, "published") : rows.filter(item => !item.archived_at && item.status === "published").length}개`} scope="DB 공개 상태 · 판매 준비 점검 별도" />
        <AdminSummaryCard compact label="모집 예정" value={`${productSummary ? num(productSummary, "upcoming") : rows.filter(item => !item.archived_at && cohorts.some(cohort => cohort.course_id === item.id && cohortStatus(cohort) === "upcoming")).length}개`} scope="연결 기수의 모집 일정 기준" />
        <AdminSummaryCard compact label="작성 중" value={`${productSummary ? num(productSummary, "draft") : rows.filter(item => !item.archived_at && item.status === "draft").length}개`} scope="공개 전 필수 정보 확인" />
      </div>}
      {s.key === "coupons" && <div className="admin-pilot-summary">
        <AdminSummaryCard compact label="전체 쿠폰" value={`${pagination?.total ?? rows.length}개`} scope="등록된 할인 혜택" />
        <AdminSummaryCard compact label="발급 중" value={`${rows.filter((item) => couponStatus(item) === "active").length}개`} scope="현재 조회 페이지 · 기간 내 발급" />
        <AdminSummaryCard compact label="발급 예정" value={`${rows.filter((item) => couponStatus(item) === "upcoming").length}개`} scope="현재 조회 페이지 · 시작일 이후" />
        <AdminSummaryCard compact label="사용 횟수" value={`${(data.coupon_redemptions || []).filter(item => item.status === "used").length}회`} scope="조회된 쿠폰 전체 합계" />
      </div>}
      {s.key === "product-reviews" && <div className="ops-callout mb16">상품 후기 → 해당 상품 상세페이지에 표시 · <Link className="text-link" href="/admin/testimonials">고객 후기</Link> → 별도로 선정한 홈페이지 사례</div>}
      {scope}
      {s.key === "customers" && !params.get('member') && (
        <div className="admin-pilot-summary">
          <AdminSummaryCard compact
            label="전체 회원"
            value={`${pagination?.total ?? rows.length}명`}
            scope="탈퇴 제외 · 관리자·스태프 포함"
          />
          <AdminSummaryCard compact
            label="정상 회원"
            value={`${memberSummary ? num(memberSummary, "active") : rows.filter((r) => r.status === "active").length}명`}
            scope="회원 계정 상태"
          />
          <AdminSummaryCard compact
            label="이용 제한"
            value={`${memberSummary ? num(memberSummary, "suspended") : rows.filter((r) => r.status === "suspended").length}명`}
            scope="계정 상태 기준"
          />
          <AdminSummaryCard compact
            label="마케팅 수신 동의"
            value={`${memberSummary ? num(memberSummary, "marketing") : rows.filter((r) => r.marketing_consent).length}명`}
            scope="서비스 알림과 구분"
          />
        </div>
      )}
      {s.key === "learning" && (
        <>
          <div className="admin-pilot-summary">
            <AdminSummaryCard compact
              label="전체 학습"
              value={`${course ? scopedLessons.length : pagination?.total ?? rows.length}개`}
              scope="일차별 학습 콘텐츠"
            />
            <AdminSummaryCard compact
              label="공개"
              value={`${scopedLessons.filter((r) => r.is_published).length}개`}
              scope="현재 상품의 학습 · 회원 공개"
            />
            <AdminSummaryCard compact
              label="비공개"
              value={`${scopedLessons.filter((r) => !r.is_published).length}개`}
              scope="현재 상품의 학습 · 작성·검토"
            />
            <AdminSummaryCard compact
              label="확인 퀴즈"
              value={`${(data.curriculum_missions || []).filter((mission) => scopedLessons.some((item) => item.id === mission.lesson_id)).reduce((count, mission) => count + quizCount(mission.id), 0)}문항`}
              scope="학습별 문항·정답·해설 관리"
            />
          </div>

        </>
      )}
      {s.key === "tags" && (
        <div className="tabs catalog-tabs" role="tablist" aria-label="태그 분류">
          {[["", "전체 태그"], ["automatic", "자동 태그"], ["manual", "수동 태그"]].map(([value, label]) => (
            <button className={tagMode === value ? "tab active" : "tab"} key={value} type="button" role="tab" aria-selected={tagMode === value} onClick={() => { setTagMode(value); setSelection([]); }}>
              {label} <span>{rows.filter((item) => !value || item.tag_kind === value).length}</span>
            </button>
          ))}
        </div>
      )}
      {s.key === "missions" && (
        <>
          <div className="tabs admin-content-tabs" aria-label="미션 상태 선택">
            {([["active", "전체 운영"], ["published", "공개"], ["hidden", "비공개"], ["archived", "보관"]] as const).map(([value, label]) => <button key={value} className={missionState === value ? "tab active" : "tab"} type="button" aria-pressed={missionState === value} disabled={loading} onClick={() => changeMissionScope({ state: value })}>{label} <span>{num(missionSummary, value)}</span></button>)}
            <Link className="tab" href="/admin/learning">
              학습 콘텐츠 <span>{scopedLessons.length}</span>
            </Link>
          </div>
          <p className="meta">일차별 미션 · 선택한 상품·주차 기준 · 전체 운영 = 공개 + 비공개 · 보관은 별도 집계합니다.</p>
          {restoreError && <p className="notice" role="alert">{restoreError}</p>}
          <div className="mission-week-picker" aria-label="미션 주차 선택">
            <div className="mission-week-picker-heading">
              <strong>상품별 주차</strong>
              <button className={!week ? "pill active" : "pill"} type="button" aria-pressed={!week} onClick={() => { setWeek(""); setSelection([]); }}>전체 주차</button>
            </div>
            {missionWeekGroups.map(([courseId, productWeeks]) => (
              <section className="mission-product-group" key={courseId}>
                <div className="mission-product-heading">
                  <strong>{named(courses.find((item) => item.id === courseId))}</strong>
                  <span>{productWeeks.length}개 주차</span>
                </div>
                <div className="mission-week-pills">
                  {productWeeks.map((item) => (
                    <button
                      className={week === item.id ? "pill active" : "pill"}
                      type="button"
                      key={item.id}
                      aria-pressed={week === item.id}
                      onClick={() => { setWeek(item.id); setSelection([]); }}
                    >
                      {num(item, "week_number")}주차
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <div
        className={
          s.key === "learning" ? "learning-layout" : ""
        }
      >
        {s.key === "learning" && (
          <aside className="week-nav">
            <div className="week-nav-title">학습 구성</div>
            <button
              className={!week ? "active" : ""}
              onClick={() => { setWeek(""); setSelection([]); }}
              aria-pressed={!week}
            >
              <span>전체 학습</span><span className="meta">{scopedLessons.length}</span>
            </button>
            {weeks
              .filter((w) => !course || w.course_id === course)
              .map((w) => (
                <button
                  className={week === w.id ? "active" : ""}
                  key={w.id}
                  aria-pressed={week === w.id}
                  onClick={() => { setWeek(w.id); setSelection([]); }}
                >
                  <span>{num(w, "week_number")}주차</span><span className="meta">{lessons.filter((item) => item.week_id === w.id).length}</span>
                </button>
              ))}
          </aside>
        )}
        <div
          className={
            ["learning", "missions", "questions"].includes(s.key) ? "" : s.key === "weeks" ? "panel weeks-table-workspace" : "panel"
          }
        >
          {s.key === "products" && <AdminFilterBar
            className="admin-pilot-filter"
            filters={<><AdminSelect label="상품 유형" labelHidden value={type} onChange={event => { setType(event.target.value); setSelection([]); }}><option value="">전체 유형</option>{["무료 클래스", "유료 클래스", "디지털 상품"].map(value => <option key={value}>{value}</option>)}</AdminSelect><AdminSelect label="상품 표시 범위" labelHidden value={productVisibility} onChange={event => { setProductVisibility(event.target.value as "active" | "archived"); setSelection([]); }}><option value="active">판매 상품</option><option value="archived">삭제된 상품</option></AdminSelect></>}
            status={<AdminSelect label="판매 상태" labelHidden value={status} onChange={event => { setStatus(event.target.value); setSelection([]); }}><option value="">전체 상태</option>{["draft", "published", "archived"].map(value => <option value={value} key={value}>{statusLabel(value)}</option>)}</AdminSelect>}
            search={search}
            action={<AdminButton variant="primary" onClick={() => edit(s)}><Plus size={16} aria-hidden="true" />상품 등록</AdminButton>}
          />}
          {s.key !== "products" && !["missions", "tags"].includes(s.key) && <AdminFilterBar
            className="admin-catalog-filter"
            filters={<>
              {s.key === "articles" && <AdminSelect label="콘텐츠 유형" labelHidden value={type} onChange={(e) => setType(e.target.value)}><option value="">전체 유형</option><option value="column">글</option><option value="video">영상</option></AdminSelect>}
              {s.key === "product-reviews" && <AdminSelect label="후기 상품" labelHidden value={course} onChange={(event) => { setCourse(event.target.value); setSelection([]); }}><option value="">전체 상품</option>{courses.map((item) => <option key={item.id} value={item.id}>{named(item)}</option>)}</AdminSelect>}
              {s.key === "weeks" && <AdminSelect label="주차 상품" aria-label="주차 상품" labelHidden value={course} onChange={(event) => { setCourse(event.target.value); setSelection([]); }}><option value="">전체 상품</option>{courses.map((item) => <option key={item.id} value={item.id}>{named(item)}</option>)}</AdminSelect>}
              {s.key === "customers" && <AdminSelect label="수강 클래스" labelHidden value={course} onChange={(event) => { setCourse(event.target.value); setSelection([]); }}><option value="">전체 클래스</option>{courses.map((item) => <option key={item.id} value={item.id}>{t(item, "title")}</option>)}</AdminSelect>}
            </>}
            status={s.key === "questions" ? <AdminSelect label="질문 처리 상태" labelHidden value={params.has('question') ? 'selected' : params.get('questionState') || 'active'} onChange={event => { const next = new URLSearchParams(params.toString()); next.set('questionState', event.target.value); next.delete('question'); router.push(`/admin/questions?${next}`); }}>{params.has('question') && <option value="selected" disabled>선택한 질문 · 보관 포함</option>}<option value="active">전체 운영 질문</option><option value="open">미답변</option><option value="answered">답변 완료</option><option value="archived">보관</option></AdminSelect> : statusFilter}
            search={search}
            action={s.key === "weeks" ? <AdminButton className="weeks-create" variant="primary" type="button" onClick={() => edit(s)}><Plus size={16} aria-hidden="true" />새로 등록</AdminButton> : undefined}
          />}
          {s.key === "weeks" && <p className="meta week-order-help">상품을 선택하면 해당 상품 안에서 주차 순서를 조정할 수 있습니다. 검색·상태 필터를 해제한 뒤 이동해 주세요.</p>}
          {s.key === "learning" ? (
            <div className="lesson-list">
              {filtered.toSorted((a, b) => num(a, "day_number") - num(b, "day_number")).map((l) => (
                <article className="lesson-list-item" key={l.id}>
                  <span className="lesson-day">{num(l, "day_number")}</span>
                  <div>
                    <span className="learning-tag">
                      Day {num(l, "day_number")} ·{" "}
                      {num(
                        weeks.find((w) => w.id === l.week_id),
                        "week_number",
                      )}
                      주차 · {t(l, "duration_label")}
                    </span>
                    <button className="title-btn" onClick={() => edit(s, l)}>
                      <h3>{t(l, "title")}</h3>
                    </button>
                    <p>
                      {labels[t(l, "content_type")] || t(l, "content_type")} · 확인 퀴즈 {(data.curriculum_missions || []).filter((mission) => mission.lesson_id === l.id).reduce((count, mission) => count + quizCount(mission.id), 0)}문항
                      {t(l, "description") ? ` · ${t(l, "description")}` : ""}
                    </p>
                  </div>
                  <div className="lesson-tools">
                    {badge(l)}
                    <AdminButton size="sm" variant="outline" onClick={() => edit(s, l)}>
                      편집
                      <ArrowRight />
                    </AdminButton>
                    {bulkMode && <input
                      type="checkbox"
                      aria-label={title(l) + " 선택"}
                      checked={selection.includes(recordId(l))}
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? [...selection, recordId(l)]
                            : selection.filter((id) => id !== recordId(l)),
                        )
                      }
                    />}
                  </div>
                </article>
              ))}
            </div>
          ) : s.key === "missions" ? (
            <div className="mission-groups">
              {missionGroups.map((group) => (
                <section className="week-card mission-catalog" key={group.week.id}>
                  <div className="spread week-head">
                    <div className="row"><span className="week-label">WEEK {num(group.week, "week_number")}</span><strong>{named(group.week)}</strong></div>
                    <AdminButton size="sm" variant="outline" onClick={() => edit(s, undefined, { courseId: String(group.week.course_id), weekId: group.week.id })}>+ 미션 등록</AdminButton>
                  </div>
                  <p className="meta mb16">{!course ? `${named(courses.find((item) => item.id === group.week.course_id))} · ` : ""}현재 페이지 {group.missions.length}개{missionState === "archived" ? " · 보관된 미션" : ""}</p>
                  {group.missions.map(renderMission)}
                  {!group.missions.length && <Empty title="등록된 미션이 없습니다.">이 주차의 학습을 선택해 미션을 등록해 주세요.</Empty>}
                </section>
              ))}
              {!!unmatchedMissions.length && <section className="week-card mission-catalog"><div className="week-head"><strong>학습 연결 확인</strong></div>{unmatchedMissions.map(renderMission)}</section>}
            </div>
          ) : s.key === "questions" ? (
            <div className="stack question-admin-list">{process.env.NEXT_PUBLIC_EDU_QUESTION_AI_BATCH_ENABLED === 'true' && process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' && <QuestionAiBatch changed={onQuestionChanged}/>}
              {filtered.map((q) => (
                <article className="panel question-admin-card" key={q.id}>
                  <div className="panel-head">
                    <div>
                      <p className="meta">{t(object(q, 'profiles') as Row, 'full_name') || '회원 정보 확인 필요'} · {t(object(q, 'profiles') as Row, 'email')} · {t(object(q, 'courses') as Row, 'title') || '일반 질문'}</p>
                      <AdminStatusBadge status={q.is_archived ? "archived" : t(q, "status")} label={q.is_archived ? "보관" : labels[t(q, "status")]} />
                      <h2 className="mt8">{t(q, "title")}</h2>
                    </div>
                    <AdminButton size="sm" variant="outline" className="question-answer-open" onClick={() => edit(s, q)}>
                      {q.answer ? "답변 수정" : "답변하기"}
                    </AdminButton>
                  </div>
                  <div className="panel-body">
                    {Boolean(q.learning_context) && <p className="meta">학습 위치: {t(q, "learning_context")}</p>}
                    <p className="reading-copy">{t(q, "content")}</p>
                    {Boolean(q.answer) && (
                      <div className="answer-block mt16">
                        <b>운영자 답변</b>
                        <p className="reading-copy">{t(q, "answer")}</p>
                      </div>
                    )}
                    <p className="meta mt16">접수 {date(q.created_at)} · {q.status === 'open' && !q.is_archived ? '답변 필요' : q.is_archived ? '보관된 질문 · 삭제되지 않음' : '답변 완료'}</p>
                    {Boolean(q.user_id) && <Link className="text-link" href={`/admin/customers?member=${encodeURIComponent(t(q, 'user_id'))}`}>회원 운영 정보 보기</Link>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CatalogTable label={["weeks", "cohorts"].includes(s.key) ? `${s.title} 데이터` : `${s.title} 목록`} loading={loading}>
                <thead>
                  <tr>
                    {bulkMode && <th className="selection-column">{selectAll}</th>}
                    {cols.map((c) => (
                      <th key={c.label}>{c.label}</th>
                    ))}
                    <th data-align="action">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {s.key === "weeks" ? weekGroups.map(([weekNumber, groupRows]) => <Fragment key={weekNumber}>
                    <tr className="week-group-heading"><th scope="rowgroup" colSpan={cols.length + 1 + Number(bulkMode)}><span>{weekNumber}주차</span><small>{groupRows.length}개 상품</small></th></tr>
                    {groupRows.map((r) => (
                      <tr key={recordId(r)}>
                        {bulkMode && <td data-label="선택" className="selection-column"><input type="checkbox" aria-label={title(r) + " 선택"} checked={selection.includes(recordId(r))} onChange={(e) => setSelection(e.target.checked ? [...selection, recordId(r)] : selection.filter((id) => id !== recordId(r)))} /></td>}
                        {cols.map((c) => <td data-label={c.label} key={c.label}>{c.value(r)}</td>)}
                        <td data-label="관리" data-align="action"><div className="catalog-actions week-order-actions">
          <AdminButton size="sm" variant="outline" type="button" title="위로 이동" aria-label={`${t(r, "title")} 위로 이동`} disabled={pending || weekReorderDisabled || Boolean(r.archived_at) || num(r, "week_number") === 0 || activeCourseWeeks[0]?.id === r.id} onClick={() => void moveWeek(r, -1)}><ChevronUp size={17} aria-hidden="true" /></AdminButton>
          <AdminButton size="sm" variant="outline" type="button" title="아래로 이동" aria-label={`${t(r, "title")} 아래로 이동`} disabled={pending || weekReorderDisabled || Boolean(r.archived_at) || num(r, "week_number") === 0 || activeCourseWeeks.at(-1)?.id === r.id} onClick={() => void moveWeek(r, 1)}><ChevronDown size={17} aria-hidden="true" /></AdminButton>
          <AdminButton size="sm" variant="outline" onClick={() => edit(s, r)}>수정</AdminButton>
                        </div></td>
                      </tr>
                    ))}
                  </Fragment>) : filtered.map((r) => (
                    <tr key={recordId(r)}>
                      {bulkMode && <td data-label="선택" className="selection-column">
                        <input
                          type="checkbox"
                          aria-label={title(r) + " 선택"}
                          checked={selection.includes(recordId(r))}
                          onChange={(e) =>
                            setSelection(
                              e.target.checked
                                ? [...selection, recordId(r)]
                                : selection.filter((id) => id !== recordId(r)),
                            )
                          }
                        />
                      </td>}
                      {cols.map((c) => (
                        <td data-label={c.label} key={c.label}>
                          {c.value(r)}
                        </td>
                      ))}
                      <td data-label="관리" data-align="action">
                        {s.key === "banners" ? <div className="catalog-actions banner-order-actions">
                          <AdminButton size="sm" variant="outline" type="button" title="위로 이동" aria-label={t(r, "title") + " 위로 이동"} disabled={pending || filtered[0]?.id === r.id} onClick={() => void moveBanner(r, -1)}><ChevronUp size={17} aria-hidden="true" /></AdminButton>
                          <AdminButton size="sm" variant="outline" type="button" title="아래로 이동" aria-label={t(r, "title") + " 아래로 이동"} disabled={pending || filtered.at(-1)?.id === r.id} onClick={() => void moveBanner(r, 1)}><ChevronDown size={17} aria-hidden="true" /></AdminButton>
                          <AdminButton size="sm" variant="outline" type="button" title="수정" aria-label={t(r, "title") + " 수정"} onClick={() => edit(s, r)}><Pencil size={17} aria-hidden="true" /></AdminButton>
                        </div> : s.key === "products" ? <div className="catalog-actions">
                          {r.archived_at ? (
                            <AdminButton
                              size="sm" variant="outline"
                              type="button"
                              disabled={pending || !send}
                              onClick={() => void send?.(
                                { action: "restore-products", ids: [recordId(r)] },
                                `「${t(r, "title")}」 상품을 작성 중 상태로 복원했습니다.`,
                              )}
                            >
                              <RotateCcw size={16} aria-hidden="true" />
                              복원
                            </AdminButton>
                          ) : (
                            <>
                              <AdminButton size="sm" variant="outline" type="button" title="수정" aria-label={t(r, "title") + " 수정"} onClick={() => edit(s, r)}><Pencil size={17} aria-hidden="true" /></AdminButton>
                              <AdminButton size="sm" variant="danger" type="button" title="삭제" aria-label={t(r, "title") + " 삭제"} disabled={pending} onClick={() => archive(s, [recordId(r)])}><Trash2 size={17} aria-hidden="true" /></AdminButton>
                            </>
                          )}
                        </div> : <AdminButton
                            size="sm" variant="outline"
                            onClick={() => edit(s, r)}
                          >
                            {s.key === "customers" || s.readOnly ? "상세" : s.key === "tags" ? "조건설정" : s.key === "coupons" ? "설정" : s.key === "product-reviews" ? "검토" : "수정"}
                          </AdminButton>}
                      </td>
                    </tr>
                  ))}
                </tbody>
            </CatalogTable>
          )}
          {!filtered.length && !loading && s.key === "missions" ? (
            <AdminEmptyState title={missionState === "active" && num(missionSummary, "archived") > 0 ? "보관된 미션만 있습니다." : "이 조건에 해당하는 미션이 없습니다."} action={missionState !== "archived" && num(missionSummary, "archived") > 0 ? <AdminButton variant="outline" onClick={() => changeMissionScope({ state: "archived" })}>보관 미션 보기</AdminButton> : <AdminButton variant="primary" onClick={() => edit(s, undefined, { courseId: course, weekId: week })}>미션 등록</AdminButton>}>
              보관 미션은 삭제되지 않습니다. 보관 목록에서 비공개로 복구한 뒤 내용을 확인하고 공개하세요.
            </AdminEmptyState>
          ) : !filtered.length && !loading && (
            <AdminEmptyState title="조회된 항목이 없습니다." action={<AdminButton variant="outline" type="button" onClick={() => { setQuery(""); setStatus(""); setType(""); setCourse(""); setWeek(""); setSelection([]); }}>검색·필터 초기화</AdminButton>}>
              검색어 또는 상태 필터를 변경하면 전체 목록을 다시 확인할 수 있습니다.
            </AdminEmptyState>
          )}
          <div className="table-foot">
            {filtered.length}개 표시
            {pagination
              ? ` · 전체 ${s.key === "products" && productSummary ? (productVisibility === "archived" ? num(productSummary, "archived") : num(productSummary, "total")) : pagination.total}개 · ${s.key === "missions" ? "선택한 상품·주차·상태 기준" : "현재 페이지에서 검색"}`
              : ""}
          </div>
        </div>
      </div>
      {pagination && pagination.total > pagination.pageSize && (
        <AdminPagination
          page={pagination.page}
          pages={Math.ceil(pagination.total / pagination.pageSize)}
          disabled={loading}
          onChange={(nextPage) => {
            setSelection([]);
            setPage(nextPage);
          }}
        />
      )}
      {s.key === "learning" && <div className="row mt24"><AdminLinkButton href="/admin/weeks">주차 구성</AdminLinkButton><AdminLinkButton href="/admin/contents">영상·자료 등록</AdminLinkButton><AdminLinkButton href="/admin/missions">미션·퀴즈 관리</AdminLinkButton></div>}
      {s.key === "missions" && <div className="notice mt16">미션은 연결 학습의 일차 순서로 표시됩니다. 학습 순서는 학습 콘텐츠 편집에서 변경할 수 있습니다. 제출물 검토와 피드백은 <Link className="text-link" href="/admin/reviews">제출물 검토</Link>에서 관리합니다.</div>}
      {s.key === "product-reviews" && <div className="notice mt24">후기 원문과 평점은 유지하며, 검토 화면에서 공개 상태와 상품 대표 노출을 설정합니다.</div>}
      {!["products", "banners", "customers", "tags", "coupons"].includes(s.key) && <details className="catalog-bulk-tools mt24" onToggle={(event) => { if (!(event.currentTarget as HTMLDetailsElement).open) { setBulkMode(false); setSelection([]); } }}>
        <summary>목록 내보내기 · 선택 관리</summary>
        <div className="catalog-bulk-body">
          <label className="checkline"><input type="checkbox" checked={bulkMode} onChange={(event) => { setBulkMode(event.target.checked); setSelection([]); }} />목록 선택 표시</label>
          <div className="toolbar">
            {s.key !== "missions" && <label className="checkline">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setSelection([]);
                }}
              />
              {s.key === "products" ? "삭제 항목 포함" : "보관 항목 포함"}
            </label>}
            <span className="spacer" />
            <AdminButton size="sm" variant="outline" onClick={() => exportCsv(filtered, s.key)}>
              {pagination ? "현재 페이지 CSV" : "CSV 내보내기"}
            </AdminButton>
            {archiveValues[s.key] && (
              <AdminButton
                size="sm"
                variant="outline"
                disabled={pending || !selection.length || selection.length > 50 || (s.key === "missions" && missionState === "archived")}
                onClick={() => archive(s, selection)}
              >
                선택 {selection.length}개 {s.key === "products" ? "삭제" : "보관·숨김"}
              </AdminButton>
            )}
          </div>
        </div>
      </details>}
      {tools && s.key !== "customers" && (
        <details className="panel operation-tools mb24">
          <summary className="section-pad">
            {s.key === "cohorts"
              ? "회차 일정·복제·일괄 업로드"
              : s.key === "missions"
                ? "미션 퀴즈 편집"
                : s.key === "customers"
                  ? "선택 회원 · 태그·쿠폰·수강권 관리"
                  : "운영 도구"}
          </summary>
          <div className="panel-body">{tools}</div>
        </details>
      )}
    </>
  );
}
