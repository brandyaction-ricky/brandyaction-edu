"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import {
  AdminCohort,
  CohortStatus,
  createAdminCohort,
  deleteAdminCohort,
  loadAdminCohorts,
  saveAdminCohort,
} from "@/lib/admin-content";

export { AdminProductsManager } from "./admin-products-manager";
export { AdminSettingsManager } from "./admin-settings-manager";

const statusLabel: Record<CohortStatus, string> = {
  upcoming: "예정",
  recruiting: "모집 중",
  closed: "모집 마감",
  in_progress: "진행 중",
  completed: "종료",
  cancelled: "취소",
};
const statusTone = (status: CohortStatus) =>
  status === "recruiting" || status === "in_progress"
    ? "success"
    : status === "completed" || status === "closed"
      ? "closed"
      : "planned";
const dateOnly = (value: string) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date(value))
        .replace(/\.\s?/g, ".")
        .replace(/\.$/, "")
    : "미정";
const dateInput = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value))
    : "";
const dateTimeInput = (value: string) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};
const seoulIso = (value: string) =>
  value && !value.startsWith("T")
    ? new Date(
        `${value}${value.length === 10 ? "T00:00:00" : ""}+09:00`,
      ).toISOString()
    : "";
function Toast({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`admin-toast ${show ? "show" : ""}`}>
      <Check />
      {children}
    </div>
  );
}

export function AdminCohortsManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCourse = searchParams.get("course");
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [courses, setCourses] = useState<
    Array<{ id: string; courseCode: string; title: string; listPrice: number }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [courseFilter, setCourseFilter] = useState(searchParams.get("course") || "all");
  const [draft, setDraft] = useState({
    courseId: "",
    name: "새 기수",
    status: "upcoming" as CohortStatus,
    capacity: "30",
    salePrice: "0",
    recruitStart: "",
    recruitEnd: "",
    operationStart: "",
    operationEnd: "",
    firstSession: "",
    sessionTime: "20:00",
    sessionCount: "4",
  });
  const applyData = useCallback((data: Awaited<ReturnType<typeof loadAdminCohorts>>) => {
    setCourses(data.courses);
    setCohorts(data.cohorts);
    const initialCourse = data.courses.find((course) => course.id === requestedCourse) || data.courses[0];
    if (requestedCourse && data.courses.some((course) => course.id === requestedCourse)) setCourseFilter(requestedCourse);
    setDraft((current) => ({
      ...current,
      courseId: current.courseId || initialCourse?.id || "",
      salePrice: current.courseId
        ? current.salePrice
        : String(initialCourse?.listPrice || 0),
    }));
    setLoading(false);
  }, [requestedCourse]);
  const refresh = async () => applyData(await loadAdminCohorts());
  useEffect(() => {
    let active = true;
    loadAdminCohorts()
      .then((data) => {
        if (active) applyData(data);
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "기수 정보를 불러오지 못했습니다.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [applyData]);
  const selected = cohorts.find((cohort) => cohort.id === selectedId) || null;
  const updateSelected = (changes: Partial<AdminCohort>) =>
    setCohorts((rows) =>
      rows.map((row) => (row.id === selectedId ? { ...row, ...changes } : row)),
    );
  const updateSession = (
    sessionId: string,
    key: "title" | "expectedOutput" | "scheduledAt" | "liveUrl" | "replayUrl",
    value: string,
  ) =>
    setCohorts((rows) =>
      rows.map((row) =>
        row.id === selectedId
          ? {
              ...row,
              sessions: row.sessions.map((session) =>
                session.id === sessionId
                  ? { ...session, [key]: value }
                  : session,
              ),
            }
          : row,
      ),
    );
  const addSession = () => {
    if (!selectedId) return;
    setCohorts((rows) => rows.map((row) => row.id === selectedId ? {
      ...row,
      sessions: [...row.sessions, { id: `new-${crypto.randomUUID()}`, sessionNumber: row.sessions.length + 1, title: `${row.sessions.length + 1}회차 라이브 클래스`, description: "", expectedOutput: "", scheduledAt: "", liveUrl: "", replayUrl: "" }],
    } : row));
  };
  const removeSession = (sessionId: string) => {
    if (!selectedId || !window.confirm("이 회차를 삭제할까요? 저장하면 실제 DB에서도 삭제됩니다.")) return;
    setCohorts((rows) => rows.map((row) => row.id === selectedId ? {
      ...row,
      sessions: row.sessions.filter((session) => session.id !== sessionId).map((session, index) => ({ ...session, sessionNumber: index + 1 })),
    } : row));
  };
  const removeCohort = async (cohort: AdminCohort) => {
    if (!window.confirm(`‘${cohort.name}’ 기수를 삭제할까요? 연결 주문·수강생이 있으면 안전하게 차단됩니다.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteAdminCohort(cohort.id);
      await refresh();
      if (selectedId === cohort.id) setSelectedId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기수를 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const create = async () => {
    const course = courses.find((item) => item.id === draft.courseId);
    if (!course || saving) return;
    setSaving(true);
    setError("");
    try {
      await createAdminCohort({
        course,
        name: draft.name,
        status: draft.status,
        capacity: Number(draft.capacity),
        price: Number(draft.salePrice),
        recruitmentStartAt: seoulIso(draft.recruitStart),
        recruitmentEndAt: seoulIso(draft.recruitEnd),
        operationStartAt: seoulIso(draft.operationStart),
        operationEndAt: seoulIso(`${draft.operationEnd}T23:59:59`),
        firstSessionAt: seoulIso(
          `${draft.firstSession}T${draft.sessionTime}:00`,
        ),
        sessionCount: Number(draft.sessionCount),
      });
      await refresh();
      setCreating(false);
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기수를 생성하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveAdminCohort(selected);
      await refresh();
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "기수·회차를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };
  const sessionDates = useMemo(
    () =>
      Array.from({ length: Number(draft.sessionCount) || 0 }, (_, index) => {
        if (!draft.firstSession) return "날짜 미정";
        const date = new Date(`${draft.firstSession}T12:00:00+09:00`);
        date.setDate(date.getDate() + index * 7);
        return `${dateOnly(date.toISOString())} ${draft.sessionTime}`;
      }),
    [draft.firstSession, draft.sessionTime, draft.sessionCount],
  );

  if (loading)
    return (
      <section className="admin-panel admin-loading-state">
        <strong>기수 정보를 불러오는 중입니다.</strong>
      </section>
    );
  if (creating) {
    const course = courses.find((item) => item.id === draft.courseId);
    return (
      <div className="admin-editor-wrap cohort-create-wrap">
        <div className="editor-head">
          <button onClick={() => setCreating(false)}>
            <ArrowLeft /> 기수 목록
          </button>
          <div>
            <strong>새 기수 만들기</strong>
            <span className="status-label planned">작성 중</span>
          </div>
          <div>
            <button
              className="admin-outline"
              onClick={() => setCreating(false)}
            >
              취소
            </button>
            <button
              className="admin-primary"
              onClick={create}
              disabled={saving}
            >
              <Check /> {saving ? "생성 중..." : "기수 생성"}
            </button>
          </div>
        </div>
        <div className="cohort-create-layout">
          <main>
            <section className="admin-panel admin-form-card cohort-create-section">
              <div className="form-card-head">
                <div>
                  <h2>기수 기본·판매 정보</h2>
                  <p>
                    연결 상품, 모집 상태, 가격과 실제 운영기간을 설정합니다.
                  </p>
                </div>
                <span className="required-note">실제 DB 생성</span>
              </div>
              <div className="admin-field-grid">
                <label className="field-full">
                  연결 상품
                  <select
                    value={draft.courseId}
                    onChange={(event) => {
                      const next = courses.find(
                        (item) => item.id === event.target.value,
                      );
                      setDraft({
                        ...draft,
                        courseId: event.target.value,
                        salePrice: String(next?.listPrice || draft.salePrice),
                      });
                    }}
                  >
                    {courses.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  기수명
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  상태
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: event.target.value as CohortStatus,
                      })
                    }
                  >
                    {Object.entries(statusLabel).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  모집 정원
                  <input
                    type="number"
                    min="1"
                    value={draft.capacity}
                    onChange={(event) =>
                      setDraft({ ...draft, capacity: event.target.value })
                    }
                  />
                </label>
                <label>
                  판매가
                  <input
                    inputMode="numeric"
                    value={draft.salePrice}
                    onChange={(event) =>
                      setDraft({ ...draft, salePrice: event.target.value })
                    }
                  />
                </label>
                <label>
                  모집 시작
                  <input
                    type="date"
                    value={draft.recruitStart}
                    onChange={(event) =>
                      setDraft({ ...draft, recruitStart: event.target.value })
                    }
                  />
                </label>
                <label>
                  모집 마감
                  <input
                    type="date"
                    value={draft.recruitEnd}
                    onChange={(event) =>
                      setDraft({ ...draft, recruitEnd: event.target.value })
                    }
                  />
                </label>
                <label>
                  운영 시작일
                  <input
                    type="date"
                    value={draft.operationStart}
                    onChange={(event) =>
                      setDraft({ ...draft, operationStart: event.target.value })
                    }
                  />
                </label>
                <label>
                  운영 종료일
                  <input
                    type="date"
                    value={draft.operationEnd}
                    onChange={(event) =>
                      setDraft({ ...draft, operationEnd: event.target.value })
                    }
                  />
                </label>
              </div>
            </section>
            <section className="admin-panel admin-form-card cohort-create-section">
              <div className="form-card-head">
                <div>
                  <h2>라이브 회차 자동 생성</h2>
                  <p>첫 수업을 기준으로 매주 같은 요일과 시간에 생성합니다.</p>
                </div>
              </div>
              <div className="admin-field-grid schedule-start-fields">
                <label>
                  첫 수업일
                  <input
                    type="date"
                    value={draft.firstSession}
                    onChange={(event) =>
                      setDraft({ ...draft, firstSession: event.target.value })
                    }
                  />
                </label>
                <label>
                  시작 시간
                  <input
                    type="time"
                    value={draft.sessionTime}
                    onChange={(event) =>
                      setDraft({ ...draft, sessionTime: event.target.value })
                    }
                  />
                </label>
                <label>
                  회차 수
                  <select
                    value={draft.sessionCount}
                    onChange={(event) =>
                      setDraft({ ...draft, sessionCount: event.target.value })
                    }
                  >
                    <option value="4">4회차</option>
                    <option value="6">6회차</option>
                    <option value="8">8회차</option>
                  </select>
                </label>
              </div>
              <div className="generated-session-list">
                {sessionDates.map((value, index) => (
                  <article key={`${value}-${index}`}>
                    <b>LIVE {index + 1}</b>
                    <span>{value}</span>
                    <small>생성 후 링크 등록</small>
                  </article>
                ))}
              </div>
            </section>
            {error && (
              <p className="admin-save-error" role="alert">
                {error}
              </p>
            )}
          </main>
          <aside className="admin-panel cohort-create-summary">
            <span>생성 미리보기</span>
            <strong>
              {course?.title}
              <br />· {draft.name}
            </strong>
            <dl>
              <div>
                <dt>상태</dt>
                <dd>{statusLabel[draft.status]}</dd>
              </div>
              <div>
                <dt>운영기간</dt>
                <dd>
                  {draft.operationStart || "미정"}
                  <br />— {draft.operationEnd || "미정"}
                </dd>
              </div>
              <div>
                <dt>정원</dt>
                <dd>{draft.capacity}명</dd>
              </div>
              <div>
                <dt>판매가</dt>
                <dd>{Number(draft.salePrice || 0).toLocaleString()}원</dd>
              </div>
              <div>
                <dt>회차</dt>
                <dd>{draft.sessionCount}회</dd>
              </div>
            </dl>
            <button
              className="admin-primary"
              onClick={create}
              disabled={saving}
            >
              <Check /> 이 내용으로 생성
            </button>
          </aside>
        </div>
      </div>
    );
  }
  if (selected)
    return (
      <div className="admin-editor-wrap">
        <div className="editor-head">
          <button onClick={() => setSelectedId(null)}>
            <ArrowLeft /> 기수 목록
          </button>
          <div>
            <strong>{selected.name}</strong>
            <span className={`status-label ${statusTone(selected.status)}`}>
              {statusLabel[selected.status]}
            </span>
          </div>
          <button className="admin-primary" onClick={save} disabled={saving}>
            <Save /> {saving ? "저장 중..." : "저장"}
          </button>
        </div>
        <div className="cohort-editor-grid">
          <section className="admin-panel admin-form-card">
            <div className="form-card-head">
              <div>
                <h2>기수 판매·운영 정보</h2>
                <p>모집 기간, 운영기간, 정원, 가격과 상태를 설정합니다.</p>
              </div>
            </div>
            <div className="admin-field-grid">
              <label className="field-full">
                연결 상품
                <select value={selected.courseId} onChange={(event) => {
                  const course = courses.find((item) => item.id === event.target.value);
                  updateSelected({ courseId: event.target.value, courseTitle: course?.title || selected.courseTitle, courseCode: course?.courseCode || selected.courseCode });
                }}>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                </select>
                <small>주문·수강생이 연결된 기수는 상품 변경이 차단됩니다.</small>
              </label>
              <label>
                기수명
                <input
                  value={selected.name}
                  onChange={(event) =>
                    updateSelected({ name: event.target.value })
                  }
                />
              </label>
              <label>
                상태
                <select
                  value={selected.status}
                  onChange={(event) =>
                    updateSelected({
                      status: event.target.value as CohortStatus,
                    })
                  }
                >
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                정원
                <input
                  value={selected.capacity}
                  onChange={(event) =>
                    updateSelected({ capacity: event.target.value })
                  }
                />
              </label>
              <label>
                판매가
                <input
                  value={selected.price}
                  onChange={(event) =>
                    updateSelected({ price: event.target.value })
                  }
                />
              </label>
              <label>
                모집 시작
                <input
                  type="date"
                  value={dateInput(selected.recruitmentStartAt)}
                  onChange={(event) =>
                    updateSelected({
                      recruitmentStartAt: seoulIso(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                모집 마감
                <input
                  type="date"
                  value={dateInput(selected.recruitmentEndAt)}
                  onChange={(event) =>
                    updateSelected({
                      recruitmentEndAt: seoulIso(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                운영 시작
                <input
                  type="date"
                  value={dateInput(selected.operationStartAt)}
                  onChange={(event) =>
                    updateSelected({
                      operationStartAt: seoulIso(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                운영 종료
                <input
                  type="date"
                  value={dateInput(selected.operationEndAt)}
                  onChange={(event) =>
                    updateSelected({
                      operationEndAt: seoulIso(
                        `${event.target.value}T23:59:59`,
                      ),
                    })
                  }
                />
              </label>
            </div>
          </section>
          <aside className="admin-panel cohort-summary-card">
            <span>신청 현황</span>
            <strong>
              {selected.enrolledCount} / {selected.capacity || "∞"}명
            </strong>
            <dl>
              <div>
                <dt>운영기간</dt>
                <dd>
                  {dateOnly(selected.operationStartAt)} —{" "}
                  {dateOnly(selected.operationEndAt)}
                </dd>
              </div>
              <div>
                <dt>활성 수강권</dt>
                <dd>{selected.enrolledCount}명</dd>
              </div>
              <div>
                <dt>라이브 회차</dt>
                <dd>{selected.sessions.length}회</dd>
              </div>
            </dl>
            <Link className="admin-outline cohort-student-link" href={`/admin/members?cohort=${selected.id}`}><Users /> 이 기수 수강생 관리</Link>
          </aside>
        </div>
        <section className="admin-panel cohort-session-editor">
          <div className="form-card-head">
            <div>
              <h2>회차 운영</h2>
              <p>기수별 날짜·라이브 입장·다시보기 링크를 관리합니다.</p>
            </div>
            <button className="admin-outline" onClick={addSession}><Plus /> 회차 추가</button>
          </div>
          {selected.sessions.map((session) => (
            <article key={session.id}>
              <span>
                <b>LIVE {session.sessionNumber}</b>
                <i
                  className={
                    session.replayUrl ? "done" : session.liveUrl ? "ready" : ""
                  }
                />
              </span>
              <div>
                <input
                  value={session.title}
                  onChange={(event) =>
                    updateSession(session.id, "title", event.target.value)
                  }
                />
                <small>{session.expectedOutput || "결과물 미입력"}</small>
              </div>
              <label>
                일시
                <input
                  type="datetime-local"
                  value={dateTimeInput(session.scheduledAt)}
                  onChange={(event) =>
                    updateSession(
                      session.id,
                      "scheduledAt",
                      seoulIso(event.target.value),
                    )
                  }
                />
              </label>
              <label>
                라이브 링크
                <input
                  type="url"
                  value={session.liveUrl}
                  onChange={(event) =>
                    updateSession(session.id, "liveUrl", event.target.value)
                  }
                />
              </label>
              <label>
                다시보기
                <input
                  type="url"
                  value={session.replayUrl}
                  onChange={(event) =>
                    updateSession(session.id, "replayUrl", event.target.value)
                  }
                />
              </label>
              <button className="session-remove" onClick={() => removeSession(session.id)} aria-label="회차 삭제"><Trash2 /></button>
            </article>
          ))}
          {error && (
            <p className="admin-save-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <Toast show={saved}>기수와 회차가 DB에 저장되었습니다.</Toast>
      </div>
    );
  return (
    <>
      <div className="cohort-status-cards">
        <article>
          <span>모집 중</span>
          <strong>
            {cohorts.filter((row) => row.status === "recruiting").length}
          </strong>
          <p>현재 신청 가능한 기수</p>
        </article>
        <article>
          <span>진행 중</span>
          <strong>
            {cohorts.filter((row) => row.status === "in_progress").length}
          </strong>
          <p>현재 라이브 운영</p>
        </article>
        <article>
          <span>예정</span>
          <strong>
            {cohorts.filter((row) => row.status === "upcoming").length}
          </strong>
          <p>오픈 전 운영 준비</p>
        </article>
        <article>
          <span>전체 수강권</span>
          <strong>
            {cohorts.reduce((sum, row) => sum + row.enrolledCount, 0)}
          </strong>
          <p>활성 수강생 기준</p>
        </article>
      </div>
      <section className="admin-panel table-panel">
        <div className="admin-toolbar product-toolbar">
          <div>
            <strong>기수별 운영 현황</strong>
            <span>실제 DB의 판매 조건과 라이브 회차를 관리합니다.</span>
          </div>
          <div className="cohort-toolbar-actions">
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">전체 상품</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
            <button className="admin-primary" onClick={() => setCreating(true)}><Plus /> 새 기수 만들기</button>
          </div>
        </div>
        <div className="data-table cohort-table">
          <div className="data-head">
            <span>기수</span>
            <span>운영 기간</span>
            <span>신청 인원</span>
            <span>회차</span>
            <span>상태</span>
            <span>운영</span>
            <span />
          </div>
          {cohorts.filter((row) => courseFilter === "all" || row.courseId === courseFilter).map((row) => (
            <div className="data-row" key={row.id}>
              <span>
                <strong>{row.name}</strong>
                <small>{row.courseTitle} · {row.note || row.cohortCode}</small>
              </span>
              <span>
                {dateOnly(row.operationStartAt)} —{" "}
                {dateOnly(row.operationEndAt)}
              </span>
              <span>
                <b className="count-strong">
                  {row.enrolledCount} / {row.capacity || "∞"}명
                </b>
              </span>
              <span>{row.sessions.length}회</span>
              <span className={`status-label ${statusTone(row.status)}`}>
                {statusLabel[row.status]}
              </span>
              <button
                className="manage-button prominent"
                onClick={() => setSelectedId(row.id)}
              >
                관리하기
              </button>
              <button className="icon-danger" onClick={() => void removeCohort(row)} aria-label="기수 삭제"><Trash2 /></button>
            </div>
          ))}
        </div>
        {error && (
          <p className="admin-save-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <Toast show={saved}>기수가 생성되었습니다.</Toast>
    </>
  );
}
