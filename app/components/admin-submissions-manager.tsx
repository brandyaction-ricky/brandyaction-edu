"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileCheck2, RefreshCw, RotateCcw, X } from "lucide-react";

type Relation<T> = T | T[] | null;
type Profile = { id: string; full_name: string | null; email: string };
type Course = { id: string; title: string };
type Cohort = { id: string; name: string };
type Week = { id: string; title: string; week_number: number };
type Lesson = { id: string; title: string; day_number: number; curriculum_weeks: Relation<Week> };
type Mission = {
  id: string;
  title: string;
  instructions: string | null;
  submission_type: string;
  curriculum_lessons: Relation<Lesson>;
};
type Enrollment = {
  id: string;
  profiles: Relation<Profile>;
  courses: Relation<Course>;
  cohorts: Relation<Cohort>;
};
type Submission = {
  id: string;
  attempt_number: number;
  status: "submitted" | "changes_requested" | "approved" | "rejected";
  response: Record<string, unknown>;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_feedback: string | null;
  enrollments: Relation<Enrollment>;
  curriculum_missions: Relation<Mission>;
};
type Result = {
  submissions: Submission[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  counts: { submitted: number; approved: number; rejected: number };
};

const emptyResult: Result = {
  submissions: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  counts: { submitted: 0, approved: 0, rejected: 0 },
};
const statusLabel: Record<string, string> = {
  submitted: "검토 대기",
  changes_requested: "수정 요청",
  approved: "승인",
  rejected: "반려",
};

function one<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] || null : value;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function responseEntries(response: Record<string, unknown>) {
  return Object.entries(response || {}).filter(([, value]) => typeof value === "string" && value.trim());
}

function safeHttps(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

export function AdminSubmissionsManager() {
  const [data, setData] = useState<Result>(emptyResult);
  const [status, setStatus] = useState("submitted");
  const [page, setPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<Result>(`/api/admin/submissions?status=${status}&page=${page}`);
      setData(result);
      if (page > result.pagination.totalPages) setPage(result.pagination.totalPages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "과제 제출 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const review = async (submission: Submission, decision: "approved" | "rejected") => {
    if (decision === "rejected" && !feedback.trim()) {
      setError("반려 사유를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await request("/api/admin/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id, decision, feedback }),
      });
      setMessage(decision === "approved" ? "과제를 승인했습니다. 달성도에 즉시 반영됩니다." : "과제를 반려하고 피드백을 저장했습니다.");
      setReviewingId(null);
      setFeedback("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "검토 결과를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (nextStatus: string) => {
    setStatus(nextStatus);
    setPage(1);
    setReviewingId(null);
    setFeedback("");
  };

  return <div className="submission-review-page">
    <section className="submission-review-kpis">
      <button className={status === "submitted" ? "active" : ""} aria-pressed={status === "submitted"} onClick={() => changeStatus("submitted")}><span>검토 대기</span><strong>{data.counts.submitted}</strong><small>도착 순서로 검토</small></button>
      <button className={status === "approved" ? "active" : ""} aria-pressed={status === "approved"} onClick={() => changeStatus("approved")}><span>승인 완료</span><strong>{data.counts.approved}</strong><small>달성도 반영</small></button>
      <button className={status === "rejected" ? "active" : ""} aria-pressed={status === "rejected"} onClick={() => changeStatus("rejected")}><span>반려</span><strong>{data.counts.rejected}</strong><small>재제출 가능</small></button>
    </section>

    <section className="admin-panel submission-review-list">
      <header>
        <div><FileCheck2/><span><strong>{statusLabel[status] || "전체"} 제출</strong><small>총 {data.pagination.total}건 · 페이지당 {data.pagination.pageSize}건</small></span></div>
        <button className="admin-outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""}/>새로고침</button>
      </header>

      {loading ? <div className="submission-review-empty"><RefreshCw className="spin"/><strong>제출 내역을 불러오는 중입니다.</strong></div> : data.submissions.map((submission) => {
        const enrollment = one(submission.enrollments);
        const profile = one(enrollment?.profiles || null);
        const course = one(enrollment?.courses || null);
        const cohort = one(enrollment?.cohorts || null);
        const mission = one(submission.curriculum_missions);
        const lesson = one(mission?.curriculum_lessons || null);
        const week = one(lesson?.curriculum_weeks || null);
        const isReviewing = reviewingId === submission.id;
        const entries = responseEntries(submission.response);
        return <article className="submission-review-card" key={submission.id}>
          <header>
            <div><span className="submission-avatar">{(profile?.full_name || profile?.email || "회")[0]}</span><span><strong>{profile?.full_name || "이름 미입력"}</strong><small>{profile?.email || "회원 정보 없음"}</small></span></div>
            <span className={`status-label ${submission.status === "approved" ? "success" : submission.status === "rejected" ? "refund" : "planned"}`}>{statusLabel[submission.status] || submission.status}</span>
          </header>
          <div className="submission-review-meta">
            <span><small>상품·기수</small><strong>{course?.title || "상품 정보 없음"} · {cohort?.name || "기수 정보 없음"}</strong></span>
            <span><small>커리큘럼</small><strong>{week ? `${week.week_number}주차` : "주차 미지정"} · {lesson ? `Day ${lesson.day_number}` : "Day 미지정"}</strong></span>
            <span><small>제출 시각</small><strong>{formatDate(submission.submitted_at)}</strong></span>
            <span><small>시도</small><strong>{submission.attempt_number}회차</strong></span>
          </div>
          <section className="submission-answer">
            <div><strong>{mission?.title || "과제 정보 없음"}</strong>{mission?.instructions && <p>{mission.instructions}</p>}</div>
            <dl>{entries.map(([key, raw]) => {
              const value = String(raw);
              return <div key={key}><dt>{key === "answerText" || key === "answer_text" ? "답변" : key === "evidenceUrl" || key === "evidence_url" ? "증빙" : key}</dt><dd>{safeHttps(value) ? <a href={value} target="_blank" rel="noreferrer">증빙 열기 <ExternalLink/></a> : value}</dd></div>;
            })}{!entries.length && <div><dt>답변</dt><dd>표시할 제출 내용이 없습니다.</dd></div>}</dl>
          </section>

          {submission.status === "submitted" ? <footer>
            {isReviewing ? <div className="submission-review-form">
              <label>운영자 피드백 <span>반려 시 필수</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} placeholder="승인 코멘트 또는 보완할 내용을 구체적으로 입력하세요."/></label>
              <div><button className="admin-outline" onClick={() => { setReviewingId(null); setFeedback(""); }} disabled={saving}><X/>취소</button><button className="submission-reject" onClick={() => void review(submission, "rejected")} disabled={saving || !feedback.trim()}><RotateCcw/>반려</button><button className="admin-primary" onClick={() => void review(submission, "approved")} disabled={saving}><Check/>{saving ? "저장 중" : "승인"}</button></div>
            </div> : <button className="admin-primary" onClick={() => { setReviewingId(submission.id); setFeedback(""); }}>제출 검토</button>}
          </footer> : <footer className="submission-review-result"><span><strong>운영자 피드백</strong><p>{submission.reviewer_feedback || "별도 피드백 없음"}</p></span><small>{formatDate(submission.reviewed_at)} 검토</small></footer>}
        </article>;
      })}
      {!loading && !data.submissions.length && <div className="submission-review-empty"><FileCheck2/><strong>현재 {statusLabel[status] || "해당"} 제출이 없습니다.</strong><span>회원이 과제를 제출하면 이곳에 표시됩니다.</span></div>}

      <footer className="submission-pagination">
        <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}><ChevronLeft/>이전</button>
        <span>{data.pagination.page} / {data.pagination.totalPages}</span>
        <button onClick={() => setPage((current) => Math.min(data.pagination.totalPages, current + 1))} disabled={page >= data.pagination.totalPages || loading}>다음<ChevronRight/></button>
      </footer>
    </section>
    {message && <p className="admin-save-success"><Check/>{message}</p>}
    {error && <p className="admin-save-error" role="alert">{error}</p>}
  </div>;
}
