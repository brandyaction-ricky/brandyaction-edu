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
import { isRecruiting, recordId } from "@/lib/platform-rules";
import { archiveValues, cohortPeriod, cohortStatus } from "@/lib/qa-rules";
import { ArrowRight, BookOpen, FileText, GripVertical, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
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
    [archived, setArchived] = useState(false);
  const rows = data[s.table] || [];
  const courses = useMemo(() => data.courses || [], [data.courses]);
  const weeks = useMemo(() => data.curriculum_weeks || [], [data.curriculum_weeks]);
  const lessons = useMemo(
    () => data.curriculum_lessons || [],
    [data.curriculum_lessons],
  );
  const cohorts = data.cohorts || [];
  const enrollments = useMemo(() => data.enrollments || [], [data.enrollments]);
  const customerCourseNames = useMemo(() => {
    const courseNames = new Map(courses.map((item) => [item.id, named(item)]));
    const result = new Map<unknown, Set<string>>();
    for (const enrollment of enrollments) {
      if (enrollment.status !== "active") continue;
      const name = courseNames.get(String(enrollment.course_id));
      if (!name || name === "—") continue;
      const names = result.get(enrollment.user_id) || new Set<string>();
      names.add(name);
      result.set(enrollment.user_id, names);
    }
    return result;
  }, [courses, enrollments]);
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
      : t(r, "status") ||
        (r.is_active || r.is_published ? "published" : "hidden");
  const filtered = rows.filter(
    (r) =>
      (archived || !r.archived_at) &&
      (!status || getStatus(r) === status) &&
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
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
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
              : ""
        }
      >
        {labels[value] || value}
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
      { label: "공개 상태", value: badge },
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
          <div className="catalog-name">
            <span className="avatar">{named(r).slice(0, 1)}</span>
            <div>
              <b>{named(r)}</b>
              <p>{t(r, "email")}</p>
            </div>
          </div>
        ),
      },
      {
        label: "수강 중인 클래스",
        value: (r) => customerCourses(r.id).join(", ") || "수강 없음",
      },
      {
        label: "태그",
        value: (r) => (
          <div className="tag-list">
            {(data.crm_member_tags || [])
              .filter((m) => m.member_id === r.id)
              .map((m) => (
                <Badge key={t(m, "tag_id")}>
                  {named((data.crm_tags || []).find((x) => x.id === m.tag_id))}
                </Badge>
              ))}
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
      { label: "태그명", value: (r) => <Badge>{t(r, "name")}</Badge> },
      {
        label: "구분",
        value: (r) => (r.tag_kind === "automatic" ? "자동" : "수동"),
      },
      {
        label: "조건·설명",
        value: (r) => t(r, "description") || "관리자가 직접 부여",
      },
      {
        label: "연결 회원",
        value: (r) =>
          Array.isArray(r.crm_member_tags)
            ? String(r.crm_member_tags[0]?.count ?? 0) + "명"
            : "집계 없음",
      },
      { label: "등록일", value: (r) => date(r.created_at) },
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
      { label: "상품", value: courseName },
      {
        label: "작성자",
        value: (r) => t(r, "author_name") || t(r, "author_nickname"),
      },
      {
        label: "평점·후기",
        value: (r) => (
          <>
            <span className="stars">
              {"★".repeat(Math.max(0, Math.min(5, num(r, "rating"))))}
            </span>
            <p className="table-excerpt">{t(r, "body")}</p>
          </>
        ),
      },
      { label: "공개 상태", value: badge },
      { label: "대표 노출", value: (r) => (r.is_featured ? "대표" : "일반") },
    ],
    banners: [
      {
        label: "메인 히어로",
        value: (r) => (
          <div className="catalog-name">
            <div className="catalog-cover">
              {safeUrl(r.image_path) ? (
                <img src={safeUrl(r.image_path)} alt="" />
              ) : (
                <FileText />
              )}
            </div>
            <div>
              <button className="title-btn" onClick={() => edit(s, r)}>{t(r, "title")}</button>
              <p>{t(r, "eyebrow")} · {t(r, "description")}</p>
            </div>
          </div>
        ),
      },
      {
        label: "CTA 버튼·연결",
        value: (r) =>
          safeUrl(r.link_url) ? (
            <a
              className="text-link"
              href={safeUrl(r.link_url)}
              target="_blank"
              rel="noreferrer"
            >
              {t(r, "link_label") || t(r, "link_url")}
            </a>
          ) : (
            "연결 없음"
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
      { label: "노출 순서", value: (r) => num(r, "display_order") },
      { label: "사용 상태", value: badge },
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
        placeholder={s.title + (pagination ? " 현재 페이지 검색" : " 검색")}
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
          {labels[s] || s}
        </option>
      ))}
    </select>
  );
  const scope = ["learning", "missions", "cohorts"].includes(s.key) ? (
    <div className="scope">
      <div className="scope-icon">
        <BookOpen />
      </div>
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
      <span className="spacer" />
      <span className="meta">
        {pagination ? "현재 조회 페이지 기준" : "공개·비공개 학습 함께 표시"}
      </span>
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
            label="모집 중"
            value={
              rows.filter((c) =>
                cohorts.some((g) => g.course_id === c.id && isRecruiting(g)),
              ).length
            }
            note="현재 페이지 상품 기준"
            highlight
          />
          <Metric
            label="공개"
            value={rows.filter((r) => r.status === "published").length}
            note="고객에게 공개된 상품"
          />
          <Metric
            label="작성 중"
            value={rows.filter((r) => r.status === "draft").length}
            note="공개 전 필수 정보 확인"
          />
        </div>
      )}
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
            note="로그인·수강 이용 가능"
            highlight
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
              value={pagination?.total ?? rows.length}
              note="일차별 학습 콘텐츠"
            />
            <Metric
              label="공개"
              value={rows.filter((r) => r.is_published).length}
              note="현재 조회 페이지 기준"
              highlight
            />
            <Metric
              label="비공개"
              value={rows.filter((r) => !r.is_published).length}
              note="작성·검토 후 공개"
            />
            <Metric
              label="학습 주차"
              value={
                weeks.filter((w) => !course || w.course_id === course).length
              }
              note="상품별 커리큘럼"
            />
          </div>
          <div className="toolbar">
            <Link className="btn" href="/admin/weeks">
              주차 구성
            </Link>
            <Link className="btn" href="/admin/contents">
              영상·자료 등록
            </Link>
            <Link className="btn" href="/admin/missions">
              미션·퀴즈 관리
            </Link>
          </div>
        </>
      )}
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
      {s.key === "missions" && (
        <>
          <div className="tabs admin-content-tabs" role="tablist" aria-label="커리큘럼 관리 영역">
            <button className="tab active" type="button" role="tab" aria-selected="true">
              일차별 미션 <span>{rows.length}</span>
            </button>
            <Link className="tab" href="/admin/learning">
              학습 콘텐츠 <span>{lessons.length}</span>
            </Link>
          </div>
          <div className="mission-week-pills" aria-label="미션 주차 선택">
            <button className={!week ? "pill active" : "pill"} onClick={() => setWeek("")}>전체 주차</button>
            {weeks
              .filter((item) => !course || item.course_id === course)
              .map((item) => (
                <button
                  className={week === item.id ? "pill active" : "pill"}
                  key={item.id}
                  onClick={() => setWeek(item.id)}
                >
                  {num(item, "week_number")}주차 <span>{lessons.filter((lesson) => lesson.week_id === item.id).length}</span>
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
              onClick={() => setWeek("")}
            >
              전체 주차
            </button>
            {weeks
              .filter((w) => !course || w.course_id === course)
              .map((w) => (
                <button
                  className={week === w.id ? "active" : ""}
                  key={w.id}
                  onClick={() => setWeek(w.id)}
                >
                  {num(w, "week_number")}주차 · {t(w, "title")}
                </button>
              ))}
          </aside>
        )}
        <div
          className={
            ["learning", "missions", "questions"].includes(s.key) ? "" : "panel"
          }
        >
          {s.key !== "missions" && <div className="filter-row">
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
            {s.key === "customers" && (
              <select
                aria-label="수강 클래스"
                value={course}
                onChange={(e) => {
                  setCourse(e.target.value);
                  setSelection([]);
                }}
              >
                <option value="">전체 클래스</option>
                {courses.map((item) => <option key={item.id} value={item.id}>{t(item, "title")}</option>)}
              </select>
            )}
            {statusFilter}
          </div>}
          {s.key !== "missions" && <div className="toolbar">
            <label className="checkline">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setSelection([]);
                }}
              />
              보관 항목 포함
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
                선택 {selection.length}개 보관·숨김
              </button>
            )}
          </div>}
          {s.key === "learning" ? (
            <div className="lesson-list">
              {filtered.map((l) => (
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
                      {labels[t(l, "content_type")] || t(l, "content_type")} ·{" "}
                      {t(l, "description")}
                    </p>
                  </div>
                  <div className="lesson-tools">
                    {badge(l)}
                    <button className="btn small" onClick={() => edit(s, l)}>
                      편집
                      <ArrowRight />
                    </button>
                    <input
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
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : s.key === "missions" ? (
            <section className="week-card mission-catalog">
              <div className="spread week-head">
                <div className="row">
                  <span className="week-label">CURRICULUM</span>
                  <strong>{week ? named(weeks.find((item) => item.id === week)) : "전체 주차 미션"}</strong>
                </div>
                <span className="meta">공개 {filtered.filter((item) => item.is_published).length} · 비공개 {filtered.filter((item) => !item.is_published).length}</span>
              </div>
              <p className="meta mb16">미션 제목을 누르면 제출 방식과 공개 상태를 편집할 수 있습니다.</p>
              {filtered.map((m) => (
                <article className="mission-row" key={m.id}>
                  <GripVertical className="draghandle" aria-hidden="true" />
                  <span className="day-no">{String(num(lessons.find((l) => l.id === m.lesson_id), "day_number")).padStart(2, "0")}</span>
                  <div className="mission-copy">
                    <button className="title-btn" onClick={() => edit(s, m)}><strong>{t(m, "title")}</strong></button>
                    <p>{labels[t(m, "submission_type")] || t(m, "submission_type")} · {t(m, "instructions")}</p>
                  </div>
                  {badge(m)}
                  {Boolean(m.is_required) && <Badge color="red">필수</Badge>}
                  <div className="row mission-actions">
                    <input
                      type="checkbox"
                      aria-label={title(m) + " 선택"}
                      checked={selection.includes(recordId(m))}
                      onChange={(e) => setSelection(e.target.checked ? [...selection, recordId(m)] : selection.filter((id) => id !== recordId(m)))}
                    />
                    <button className="btn small" onClick={() => edit(s, m)}>편집</button>
                  </div>
                </article>
              ))}
            </section>
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
                    <th>{selectAll}</th>
                    {cols.map((c) => (
                      <th key={c.label}>{c.label}</th>
                    ))}
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={recordId(r)}>
                      <td data-label="선택">
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
                      </td>
                      {cols.map((c) => (
                        <td data-label={c.label} key={c.label}>
                          {c.value(r)}
                        </td>
                      ))}
                      <td data-label="관리">
                        <button
                          className="btn small"
                          onClick={() => edit(s, r)}
                        >
                          {s.readOnly ? "상세" : "수정"}
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
      {s.key === "products" && (
        <div className="notice mt24">
          상품은 가격·판매·자료의 단위, 기수는 일정·정원·수강생의 단위로
          분리합니다. 상품을 수정해도 기존 주문 금액은 소급 변경하지 않습니다.
        </div>
      )}
    </>
  );
}
