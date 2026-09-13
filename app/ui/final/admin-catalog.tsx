"use client";
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
import { recordId } from "@/lib/platform-rules";
import { archiveValues, cohortPeriod, cohortStatus } from "@/lib/qa-rules";
import { ArrowRight, BookOpen, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Data } from "../learning-workflows";
import { Metric } from "./admin-shell";
import { Badge, Empty, courseType } from "./primitives";

type Props = {
  section: Section;
  data: Data;
  selection: string[];
  setSelection: (ids: string[]) => void;
  edit: (section: Section, row?: Row) => void;
  archive: (section: Section, ids: string[]) => void;
  pending: boolean;
  loading: boolean;
  pagination: { page: number; pageSize: number; total: number } | null;
  setPage: (page: number) => void;
  exportCsv: (rows: Row[], name: string) => void;
  tools?: ReactNode;
};
type Column = { label: string; value: (row: Row) => ReactNode };
const named = (r?: Row) =>
  t(r, "title") || t(r, "name") || t(r, "full_name") || t(r, "email") || "—";
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
  tools,
}: Props) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [course, setCourse] = useState(""),
    [week, setWeek] = useState(""),
    [archived, setArchived] = useState(false),
    [bulkMode, setBulkMode] = useState(false),
    [tagMode, setTagMode] = useState(""),
    [now] = useState(Date.now);
  const rows = data[s.table] || [];
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
  const couponStatus = (row: Row) => !row.is_active ? "inactive" : row.ends_at && Date.parse(String(row.ends_at)) < now ? "expired" : row.starts_at && Date.parse(String(row.starts_at)) > now ? "upcoming" : "active";
  const bannerStatus = (row: Row) => !row.is_active ? "hidden" : row.ends_at && Date.parse(String(row.ends_at)) < now ? "completed" : row.starts_at && Date.parse(String(row.starts_at)) > now ? "upcoming" : "published";
  const statusLabel = (value: string) => s.key === "coupons" ? ({ active: "사용 가능", upcoming: "사용 예정", expired: "기간 종료", inactive: "사용 중지" }[value] || value) : s.key === "banners" ? ({ published: "게시 중", upcoming: "예약", completed: "노출 종료", hidden: "비공개" }[value] || value) : s.key === "customers" ? ({ active: "정상", suspended: "이용 제한" }[value] || labels[value] || value) : s.key === "products" ? ({ published: "판매 중", draft: "작성 중", archived: "판매 종료" }[value] || labels[value] || value) : value === "hidden" && ["learning", "missions"].includes(s.key) ? "비공개" : labels[value] || value;
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
  const filtered = rows.filter(
    (r) =>
      (archived || !r.archived_at) &&
      (!status || getStatus(r) === status) &&
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
  );
  const missionGroups = scopedWeeks
    .filter((item) => !week || item.id === week)
    .map((item) => ({ week: item, missions: filtered.filter((mission) => lessonById.get(String(mission.lesson_id))?.week_id === item.id).toSorted((a, b) => num(lessonById.get(String(a.lesson_id)), "day_number") - num(lessonById.get(String(b.lesson_id)), "day_number")) }))
    .filter((group) => group.missions.length || week);
  const unmatchedMissions = s.key === "missions" ? filtered.filter((mission) => !weeks.some((item) => item.id === lessonById.get(String(mission.lesson_id))?.week_id)) : [];
  const renderMission = (mission: Row) => (
    <article className="mission-row" key={mission.id}>
      <span className="day-no">{lessonById.has(String(mission.lesson_id)) ? String(num(lessonById.get(String(mission.lesson_id)), "day_number")).padStart(2, "0") : "—"}</span>
      <div className="mission-copy">
        <button className="title-btn" onClick={() => edit(s, mission)}><strong>{t(mission, "title")}</strong></button>
        <p>{labels[t(mission, "submission_type")] || t(mission, "submission_type")} · 확인 퀴즈 {quizCount(mission.id)}문항 · {mission.is_required ? "필수 미션" : "선택 미션"}{mission.submission_type === "quiz" ? "" : " · 관리자 승인"}</p>
      </div>
      <Badge color={mission.is_published ? "green" : ""}>{mission.is_published ? "공개" : "비공개"}</Badge>
      <div className="row mission-actions">
        {bulkMode && <input type="checkbox" aria-label={t(mission, "title") + " 선택"} checked={selection.includes(recordId(mission))} onChange={(event) => setSelection(event.target.checked ? [...selection, recordId(mission)] : selection.filter((id) => id !== recordId(mission)))} />}
        <button className="btn small" onClick={() => edit(s, mission)}>편집</button>
      </div>
    </article>
  );
  const badge = (r: Row) => {
    const value = getStatus(r);
    return (
      <Badge
        color={
          ["published", "approved", "active", "recruiting"].includes(value)
            ? "green"
            : value === "upcoming"
              ? "blue"
              : value === "suspended" ? "amber" : ""
        }
      >
        {statusLabel(value)}
      </Badge>
    );
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
              <p>
                {t(r, "course_code")} · /classes/{t(r, "slug")}
              </p>
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
            .map((c) => t(c, "name"))
            .join(", ") || "미연결",
      },
      { label: "자료", value: (r) => productResourceCount(r.id) + "개" },
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
            <span className="avatar">{named(r).slice(0, 1)}</span>
            <div>
              <button className="title-btn" onClick={() => edit(s, r)}>{named(r)}</button>
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
      { label: "분류", value: (r) => <Badge color={r.tag_kind === "automatic" ? "blue" : ""}>{r.tag_kind === "automatic" ? "자동" : "수동"}</Badge> },
      { label: "부여 조건", value: (r) => <p className="tag-condition">{t(r, "description") || (r.tag_kind === "automatic" ? "연결된 회원 행동 조건에 따라 부여" : "관리자가 직접 부여")}</p> },
      { label: "회원 수", value: (r) => Array.isArray(r.crm_member_tags) ? String(r.crm_member_tags[0]?.count ?? 0) + "명" : "—" },
      { label: "상태", value: () => <Badge color="green">사용 중</Badge> },
    ],
    coupons: [
      {
        label: "쿠폰",
        value: (r) => (
          <>
            <b>{t(r, "name")}</b>
            <small>{t(r, "code")}</small>
          </>
        ),
      },
      {
        label: "할인",
        value: (r) =>
          r.discount_type === "percentage"
            ? num(r, "discount_value") + "%"
            : money(num(r, "discount_value")),
      },
      {
        label: "사용 기간",
        value: (r) => (
          <>
            {date(r.starts_at)}
            <br />~ {date(r.ends_at)}
          </>
        ),
      },
      {
        label: "발급 한도",
        value: (r) =>
          r.usage_limit ? num(r, "usage_limit") + "회" : "제한 없음",
      },
      { label: "사용 상태", value: badge },
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
      { label: "상품 대표 노출", value: (r) => r.is_featured ? <Badge color="red">상품 대표</Badge> : <span className="meta">일반 후기</span> },
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
        value: (r) => <p className="table-excerpt">{t(r, "body_text")}</p>,
      },
    ],
  };
  const cols = columns[s.key] || [
    { label: "제목", value: (r: Row) => <b>{title(r)}</b> },
    { label: "상태", value: badge },
    { label: "등록일", value: (r: Row) => date(r.created_at) },
  ];
  const search = (
    <label className="search">
      <Search />
      <input
        type="search"
        value={query}
        placeholder={s.key === "customers" ? "이름 · 이메일 · 연락처 · 태그 검색" : s.key === "products" ? "상품명 검색" : s.key === "learning" ? "학습 제목 검색" : s.title + " 검색"}
        aria-label="목록 검색"
        onChange={(e) => {
          setQuery(e.target.value);
          setSelection([]);
        }}
      />
    </label>
  );
  const statusFilter = (
    <select
      aria-label="상태 필터"
      value={status}
      onChange={(e) => {
        setStatus(e.target.value);
        setSelection([]);
      }}
    >
      <option value="">전체 상태</option>
      {[...new Set(rows.map(getStatus))].map((s) => (
        <option key={s} value={s}>
          {statusLabel(s)}
        </option>
      ))}
    </select>
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
              setWeek("");
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
        {s.key === "cohorts" ? <p>{rows.filter((item) => !course || item.course_id === course).length}개 기수 · {(data.cohort_sessions || []).filter((session) => !course || rows.some((cohort) => cohort.id === session.cohort_id && cohort.course_id === course)).length}개 회차</p> : <p>{scopedWeeks.length}주차 · {scopedLessons.length}개 학습{course ? ` · ${rows.filter((item) => getCourse(item) === course).length}개 ${s.key === "missions" ? "미션" : "항목"}` : ""}</p>}
      </div>
      <span className="spacer" />
      {course && <Badge color={courses.find((item) => item.id === course)?.status === "published" ? "green" : ""}>{labels[t(courses.find((item) => item.id === course), "status")] || "작성 중"}</Badge>}
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
      {s.key === "products" && (
        <div className="metrics">
          <Metric
            label="전체 상품"
            value={
              <>
                {pagination?.total ?? rows.length}
                <small>개</small>
              </>
            }
            note="클래스 · 디지털 자료"
          />
          <Metric
            label="판매 중"
            value={<>{rows.filter((item) => item.status === "published").length}<small>개</small></>}
            note="고객에게 공개된 상품"
            highlight
          />
          <Metric
            label="모집 예정"
            value={<>{rows.filter((item) => cohorts.some((cohort) => cohort.course_id === item.id && cohortStatus(cohort) === "upcoming")).length}<small>개</small></>}
            note="연결 기수의 모집 일정 기준"
          />
          <Metric
            label="작성 중"
            value={<>{rows.filter((r) => r.status === "draft").length}<small>개</small></>}
            note="공개 전 필수 정보 확인"
          />
        </div>
      )}
      {s.key === "coupons" && <div className="metrics">
        <Metric label="전체 쿠폰" value={<>{pagination?.total ?? rows.length}<small>개</small></>} note="등록된 할인 혜택" />
        <Metric label="사용 가능" value={<>{rows.filter((item) => couponStatus(item) === "active").length}<small>개</small></>} note="현재 사용 기간 내 활성 쿠폰" highlight />
        <Metric label="사용 예정" value={<>{rows.filter((item) => couponStatus(item) === "upcoming").length}<small>개</small></>} note="시작일 이후 사용 가능" />
        <Metric label="종료·중지" value={<>{rows.filter((item) => ["expired", "inactive"].includes(couponStatus(item))).length}<small>개</small></>} note="기간 종료 또는 사용 중지" />
      </div>}
      {s.key === "product-reviews" && <div className="ops-callout mb16">상품 후기 → 해당 상품 상세페이지에 표시 · <Link className="text-link" href="/admin/testimonials">고객 후기</Link> → 별도로 선정한 홈페이지 사례</div>}
      {scope}
      {s.key === "customers" && (
        <div className="metrics">
          <Metric
            label="전체 회원"
            value={<>{pagination?.total ?? rows.length}<small>명</small></>}
            note="현재 운영 회원"
          />
          <Metric
            label="정상 회원"
            value={<>{rows.filter((r) => r.status === "active").length}<small>명</small></>}
            note="회원 계정 상태"
          />
          <Metric
            label="이용 제한"
            value={<>{rows.filter((r) => r.status === "suspended").length}<small>명</small></>}
            note="계정 상태 기준"
          />
          <Metric
            label="마케팅 수신 동의"
            value={<>{rows.filter((r) => r.marketing_consent).length}<small>명</small></>}
            note="서비스 알림과 구분"
          />
        </div>
      )}
      {s.key === "learning" && (
        <>
          <div className="metrics">
            <Metric
              label="전체 학습"
              value={<>{course ? scopedLessons.length : pagination?.total ?? rows.length}<small>개</small></>}
              note="일차별 학습 콘텐츠"
            />
            <Metric
              label="공개"
              value={<>{scopedLessons.filter((r) => r.is_published).length}<small>개</small></>}
              note="회원에게 공개되는 학습"
              highlight
            />
            <Metric
              label="비공개"
              value={<>{scopedLessons.filter((r) => !r.is_published).length}<small>개</small></>}
              note="작성·검토 후 공개"
            />
            <Metric
              label="확인 퀴즈"
              value={<>{(data.curriculum_missions || []).filter((mission) => scopedLessons.some((item) => item.id === mission.lesson_id)).reduce((count, mission) => count + quizCount(mission.id), 0)}<small>문항</small></>}
              note="학습별 문항·정답·해설 관리"
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
          <div className="tabs admin-content-tabs" role="tablist" aria-label="커리큘럼 관리 영역">
            <button className="tab active" type="button" role="tab" aria-selected="true">
              일차별 미션 <span>{rows.filter((item) => !course || getCourse(item) === course).length}</span>
            </button>
            <Link className="tab" href="/admin/learning">
              학습 콘텐츠 <span>{scopedLessons.length}</span>
            </Link>
          </div>
          <div className="mission-week-pills" aria-label="미션 주차 선택">
            <button className={!week ? "pill active" : "pill"} aria-pressed={!week} onClick={() => { setWeek(""); setSelection([]); }}>전체 주차</button>
            {weeks
              .filter((item) => !course || item.course_id === course)
              .map((item) => (
                <button
                  className={week === item.id ? "pill active" : "pill"}
                  key={item.id}
                  aria-pressed={week === item.id}
                  onClick={() => { setWeek(item.id); setSelection([]); }}
                >
                  {num(item, "week_number")}주차 <span>{rows.filter((mission) => lessonById.get(String(mission.lesson_id))?.week_id === item.id).length}</span>
                </button>
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
            ["learning", "missions", "questions"].includes(s.key) ? "" : "panel"
          }
        >
          {!["missions", "tags"].includes(s.key) && <div className={s.key === "learning" ? "toolbar learning-filter" : "filter-row"}>
            {search}
            <span className="spacer" />
            {s.key === "products" && (
              <select
                aria-label="상품 유형"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">전체 유형</option>
                {["무료 클래스", "유료 클래스", "디지털 상품"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            )}
            {s.key === "articles" && (
              <select
                aria-label="콘텐츠 유형"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">전체 유형</option>
                <option value="column">글</option>
                <option value="video">영상</option>
              </select>
            )}
            {s.key === "product-reviews" && <label className="catalog-filter-field">상품<select aria-label="후기 상품" value={course} onChange={(event) => { setCourse(event.target.value); setSelection([]); }}><option value="">전체 상품</option>{courses.map((item) => <option key={item.id} value={item.id}>{named(item)}</option>)}</select></label>}
            {s.key === "customers" && (
              <label className="catalog-filter-field">클래스<select
                aria-label="수강 클래스"
                value={course}
                onChange={(e) => {
                  setCourse(e.target.value);
                  setSelection([]);
                }}
              >
                <option value="">전체 클래스</option>
                {courses.map((item) => <option key={item.id} value={item.id}>{t(item, "title")}</option>)}
              </select></label>
            )}
            {statusFilter}
          </div>}
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
                    <button className="btn small" onClick={() => edit(s, l)}>
                      편집
                      <ArrowRight />
                    </button>
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
                    <button className="btn small" onClick={() => edit(s)}>+ 미션 등록</button>
                  </div>
                  <p className="meta mb16">{!course ? `${named(courses.find((item) => item.id === group.week.course_id))} · ` : ""}공개 {group.missions.filter((item) => item.is_published).length} · 비공개 {group.missions.filter((item) => !item.is_published).length}</p>
                  {group.missions.map(renderMission)}
                  {!group.missions.length && <Empty title="등록된 미션이 없습니다.">이 주차의 학습을 선택해 미션을 등록해 주세요.</Empty>}
                </section>
              ))}
              {!!unmatchedMissions.length && <section className="week-card mission-catalog"><div className="week-head"><strong>학습 연결 확인</strong></div>{unmatchedMissions.map(renderMission)}</section>}
            </div>
          ) : s.key === "questions" ? (
            <div className="stack">
              {filtered.map((q) => (
                <article className="panel" key={q.id}>
                  <div className="panel-head">
                    <div>
                      <Badge
                        color={q.status === "answered" ? "green" : "amber"}
                      >
                        {labels[t(q, "status")]}
                      </Badge>
                      <h2 className="mt8">{t(q, "title")}</h2>
                    </div>
                    <button className="btn small" onClick={() => edit(s, q)}>
                      {q.answer ? "답변 수정" : "답변하기"}
                    </button>
                  </div>
                  <div className="panel-body">
                    <p className="reading-copy">{t(q, "content")}</p>
                    {Boolean(q.answer) && (
                      <div className="answer-block mt16">
                        <b>운영자 답변</b>
                        <p className="reading-copy">{t(q, "answer")}</p>
                      </div>
                    )}
                    <p className="meta mt16">{date(q.created_at)}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-scroll mobile-cards">
              <table>
                <thead>
                  <tr>
                    {bulkMode && <th className="selection-column">{selectAll}</th>}
                    {cols.map((c) => (
                      <th key={c.label}>{c.label}</th>
                    ))}
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
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
                      <td data-label="관리">
                        {s.key === "products" && !r.archived_at && <button className="btn small danger" aria-label={t(r, "title") + " 삭제"} disabled={pending} onClick={() => archive(s, [recordId(r)])}>삭제</button>}
                        <button
                          className="btn small"
                          onClick={() => edit(s, r)}
                        >
                          {s.key === "customers" || s.readOnly ? "상세" : s.key === "tags" ? "조건·설정" : s.key === "product-reviews" ? "검토" : "수정"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!filtered.length && !loading && (
            <Empty title="조회된 항목이 없습니다.">
              검색어 또는 상태 필터를 변경해 보세요.
            </Empty>
          )}
          <div className="table-foot">
            {filtered.length}개 표시
            {pagination
              ? ` · 전체 ${pagination.total}개 · 현재 페이지에서 검색`
              : ""}
          </div>
        </div>
      </div>
      {pagination && pagination.total > pagination.pageSize && (
        <div className="workflow-pagination">
          <button
            className="btn"
            disabled={loading || pagination.page <= 1}
            onClick={() => {
              setSelection([]);
              setPage(pagination.page - 1);
            }}
          >
            이전
          </button>
          <span>
            {pagination.page} /{" "}
            {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}{" "}
            페이지
          </span>
          <button
            className="btn"
            disabled={
              loading ||
              pagination.page * pagination.pageSize >= pagination.total
            }
            onClick={() => {
              setSelection([]);
              setPage(pagination.page + 1);
            }}
          >
            다음
          </button>
        </div>
      )}
      {s.key === "customers" && <div className="row mt24"><Link className="btn" href="/admin/members">회원 미션관리</Link><Link className="btn" href="/admin/tags">고객 태그 설정</Link></div>}
      {s.key === "learning" && <div className="row mt24"><Link className="btn" href="/admin/weeks">주차 구성</Link><Link className="btn" href="/admin/contents">영상·자료 등록</Link><Link className="btn" href="/admin/missions">미션·퀴즈 관리</Link></div>}
      {s.key === "missions" && <div className="notice mt16">미션은 연결 학습의 일차 순서로 표시됩니다. 학습 순서는 학습 콘텐츠 편집에서 변경할 수 있습니다. 제출물 검토와 피드백은 <Link className="text-link" href="/admin/reviews">제출물 검토</Link>에서 관리합니다.</div>}
      {s.key === "banners" && <div className="equal-col mt24">
        <section className="panel"><div className="panel-head"><h2>배너 노출 기준</h2></div><div className="panel-body"><div className="setting-line"><span>노출 순서</span><b>설정한 순서대로 노출</b></div><div className="setting-line"><span>노출 기간</span><b>시작·종료 일정 기준</b></div><div className="setting-line"><span>사용 상태</span><b>사용 중인 배너만 표시</b></div><p className="meta mt16">수정에서 배너 이미지·제목·버튼·노출 순서와 일정을 함께 관리합니다.</p></div></section>
        <section className="panel"><div className="panel-head"><h2>연결 페이지 확인</h2></div><div className="panel-body"><h3>배너 이미지와 CTA가 같은 목적지로</h3><p className="mt8">고객에게 표시되는 버튼 이름과 연결 주소를 확인하고, 연결된 상품의 공개 상태와 모집 일정을 함께 확인하세요.</p><div className="row mt16"><Link className="btn" href="/admin/products">상품 관리</Link><Link className="btn" href="/">고객 화면 보기</Link></div></div></section>
      </div>}
      {s.key === "product-reviews" && <div className="notice mt24">후기 원문과 평점은 유지하며, 검토 화면에서 공개 상태와 상품 대표 노출을 설정합니다.</div>}
      {s.key === "coupons" && <div className="notice mt24">쿠폰 할인·사용 기간·사용 한도를 확인한 뒤 적용하세요. 쿠폰 사용 이력과 발급 이력은 별도로 관리됩니다.</div>}
      {s.key === "tags" && <div className="equal-col catalog-tag-panels mt24">
        <section className="panel"><div className="panel-head"><h2>자동 태그 적용 흐름</h2></div><div className="panel-body"><div className="workflow-row"><span>로그인 회원의 행동</span><span>태그 조건 확인</span><span className="active">태그 부여</span></div><p className="mt16">무료 클래스 학습 완료와 유료 상품 결제처럼 확인 가능한 회원 행동을 기준으로 자동 분류합니다.</p></div></section>
        <section className="panel"><div className="panel-head"><h2>조건 변경 시 영향</h2></div><div className="panel-body"><h3>자동 태그와 수동 태그를 구분해 관리</h3><p className="mt8">자동 태그는 연결된 행동 조건에 따라 갱신됩니다. 수동 태그는 회원 관리에서 직접 부여하거나 해제할 수 있습니다.</p><p className="privacy-note mt16">태그 이름과 설명을 변경해도 자동 부여 기준은 변경되지 않습니다.</p></div></section>
      </div>}
      <details className="catalog-bulk-tools mt24" onToggle={(event) => { if (!(event.currentTarget as HTMLDetailsElement).open) { setBulkMode(false); setSelection([]); } }}>
        <summary>목록 내보내기 · 선택 관리</summary>
        <div className="catalog-bulk-body">
          <label className="checkline"><input type="checkbox" checked={bulkMode} onChange={(event) => { setBulkMode(event.target.checked); setSelection([]); }} />목록 선택 표시</label>
          <div className="toolbar">
            <label className="checkline">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setSelection([]);
                }}
              />
              {s.key === "products" ? "삭제 항목 포함" : "보관 항목 포함"}
            </label>
            <span className="spacer" />
            <button
              className="btn small"
              onClick={() => exportCsv(filtered, s.key)}
            >
              {pagination ? "현재 페이지 CSV" : "CSV 내보내기"}
            </button>
            {archiveValues[s.key] && (
              <button
                className="btn small"
                disabled={pending || !selection.length || selection.length > 50}
                onClick={() => archive(s, selection)}
              >
                선택 {selection.length}개 {s.key === "products" ? "삭제" : "보관·숨김"}
              </button>
            )}
          </div>
        </div>
      </details>
      {tools && (
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
      {s.key === "products" && (
        <div className="notice mt24">
          상품은 가격·판매·자료의 단위, 기수는 일정·정원·수강생의 단위로
          분리합니다. 상품을 수정해도 기존 주문 금액은 소급 변경하지 않습니다.
        </div>
      )}
    </>
  );
}
