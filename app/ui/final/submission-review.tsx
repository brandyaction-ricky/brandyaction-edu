"use client";

import { labels, object, safeUrl, text as t, type Row } from "@/lib/platform";
import { ArrowRight, Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { timeLabel, type Data, type WorkflowSend } from "../learning-workflows";
import { Badge, Empty } from "./primitives";

type Submission = Row & { member?: Row; mission?: Row; course?: Row };
const name = (row?: Row) =>
  t(row, "title") || t(row, "full_name") || t(row, "email");
const states = [
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "",
] as const;

export function SubmissionReview({
  data,
  send,
  pending,
}: {
  data: Data;
  send: WorkflowSend;
  pending: boolean;
}) {
  const params = useSearchParams();
  const [status, setStatus] = useState(
    params.get("submission") ? "" : "submitted",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("old");
  const [currentId, setCurrentId] = useState(params.get("submission") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const enriched: Submission[] = (data.mission_submissions || []).map(
    (submission) => {
      const enrollment = (data.enrollments || []).find(
        (row) => row.id === submission.enrollment_id,
      );
      return {
        ...submission,
        member: (data.profiles || []).find(
          (row) => row.id === enrollment?.user_id,
        ),
        mission: (data.curriculum_missions || []).find(
          (row) => row.id === submission.mission_id,
        ),
        course: (data.courses || []).find(
          (row) => row.id === enrollment?.course_id,
        ),
      };
    },
  );
  const list = enriched
    .filter(
      (row) =>
        (!status || row.status === status) &&
        [name(row.member), name(row.mission), name(row.course)]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        String(a.submitted_at).localeCompare(String(b.submitted_at)) *
        (sort === "old" ? 1 : -1),
    );
  const current = list.find((row) => row.id === currentId) || list[0];
  async function save(ids: string[], decision: string, feedback: string) {
    await send(
      { action: "review", ids, decision, feedback },
      `${ids.length}건을 검토했습니다.`,
    );
    setSelected([]);
    setMessage("검토 결과와 피드백을 저장했습니다.");
    if (current && ids.includes(current.id))
      setCurrentId(list.find((row) => !ids.includes(row.id))?.id || "");
  }
  return (
    <>
      <div className="tabs" aria-label="제출 상태">
        {states.map((value) => (
          <button
            key={value}
            className={"tab " + (status === value ? "active" : "")}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setSelected([]);
            }}
          >
            {value ? labels[value] : "전체"}{" "}
            <span>
              {enriched.filter((row) => !value || row.status === value).length}
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <input
          aria-label="제출물 검색"
          type="search"
          placeholder="회원명 · 미션명 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="spacer" />
        <select
          aria-label="제출물 정렬"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="old">오래 기다린 순</option>
          <option value="new">최근 제출순</option>
        </select>
      </div>
      <details className="panel pad mb24">
        <summary>여러 제출물 일괄 검토</summary>
        <div className="mt16">
          <button
            className="btn small"
            onClick={() =>
              setSelected(
                list
                  .filter((row) => row.status === "submitted")
                  .slice(0, 50)
                  .map((row) => row.id),
              )
            }
            disabled={pending}
          >
            대기 중인 제출 선택 (최대 50건)
          </button>
          <button
            className="btn small"
            onClick={() => setSelected([])}
            disabled={pending}
          >
            선택 해제
          </button>
          <p className="meta mt16">
            목록에서 선택한 {selected.length}건에 같은 검토 결과와 피드백을
            적용합니다.
          </p>
          <DecisionForm
            key={"bulk-" + selected.join(",")}
            pending={pending}
            disabled={!selected.length}
            onSave={(decision, feedback) => save(selected, decision, feedback)}
            bulk
          />
        </div>
      </details>
      {message && (
        <p className="notice mb24" role="status">
          {message}
        </p>
      )}
      {current ? (
        <div className="review-shell">
          <aside className="queue" aria-label="제출물 목록">
            <div className="queue-title">
              {list.length}건 ·{" "}
              {sort === "old" ? "오래 기다린 순" : "최근 제출순"}
            </div>
            {list.map((row) => (
              <div className="queue-entry" key={row.id}>
                <label className="queue-select">
                  <input
                    type="checkbox"
                    aria-label={`${name(row.member)} · ${name(row.mission)} 일괄 검토 선택`}
                    checked={selected.includes(row.id)}
                    disabled={
                      pending ||
                      row.status !== "submitted" ||
                      (!selected.includes(row.id) && selected.length >= 50)
                    }
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, row.id]
                          : previous.filter((id) => id !== row.id),
                      )
                    }
                  />
                </label>
                <button
                  className={
                    "queue-item " + (row.id === current.id ? "active" : "")
                  }
                  aria-pressed={row.id === current.id}
                  onClick={() => setCurrentId(row.id)}
                >
                  <div className="spread">
                    <strong>{name(row.member) || "회원"}</strong>
                    <span className="meta">{t(row, "attempt_number")}차</span>
                  </div>
                  <p>{name(row.mission) || "미션"}</p>
                  <div className="spread">
                    <Badge
                      color={
                        row.status === "approved"
                          ? "green"
                          : row.status === "submitted"
                            ? "red"
                            : ""
                      }
                    >
                      {labels[t(row, "status")]}
                    </Badge>
                    <small>{timeLabel(row.submitted_at)}</small>
                  </div>
                </button>
              </div>
            ))}
          </aside>
          <section className="review-main">
            <div className="review-heading">
              <div className="row">
                <span className="avatar">
                  {(name(current.member) || "회원").slice(0, 1)}
                </span>
                <b>{name(current.member) || "회원"}</b>
                <Badge>{labels[t(current, "status")]}</Badge>
              </div>
              <h2>{name(current.mission) || "미션"}</h2>
              <p className="meta mt8">
                {name(current.course)} · {t(current, "attempt_number")}차 제출 ·{" "}
                {timeLabel(current.submitted_at)}
              </p>
            </div>
            <div className="review-grid">
              <div className="answers">
                <details className="guide">
                  <summary>현재 미션 안내와 제출 기준 보기</summary>
                  <p className="reading-copy">
                    {t(current.mission, "instructions") ||
                      "등록된 안내가 없습니다."}
                  </p>
                </details>
                <div className="answer-block">
                  <label>회원이 제출한 답변</label>
                  <div className="answer-copy reading-copy">
                    {String(
                      object(current, "response").text || "텍스트 답변 없음",
                    )}
                  </div>
                </div>
                {safeUrl(object(current, "response").url) && (
                  <div className="answer-block">
                    <label>결과 증빙</label>
                    <a
                      className="btn"
                      href={safeUrl(object(current, "response").url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      제출 결과물 열기
                      <ArrowRight />
                    </a>
                  </div>
                )}
                {Boolean(current.quiz_required) && (
                  <p className="notice">
                    퀴즈 {String(object(current, "response").score ?? "—")}점 ·
                    통과
                  </p>
                )}
                <h3>멘토 피드백</h3>
                {current.status === "submitted" ? (
                  <DecisionForm
                    key={current.id}
                    pending={pending}
                    onSave={(decision, feedback) =>
                      save([current.id], decision, feedback)
                    }
                  />
                ) : (
                  <div className="answer-copy reading-copy mt16">
                    {t(current, "reviewer_feedback") ||
                      "등록된 피드백이 없습니다."}
                  </div>
                )}
              </div>
              <aside className="inspector">
                <h3>승인 전 확인</h3>
                <div className="review-checks" key={current.id}>
                  {[
                    "필수 답변이 모두 작성됨",
                    "실행 결과와 증빙이 일치함",
                    "미션의 완료 기준을 충족함",
                  ].map((label) => (
                    <label className="checkline" key={label}>
                      <input type="checkbox" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="divider" />
                <h3>제출 정보</h3>
                <div className="setting-line">
                  <span>회원</span>
                  <b>{name(current.member) || "회원"}</b>
                </div>
                <div className="setting-line">
                  <span>제출 횟수</span>
                  <b>{t(current, "attempt_number")}회</b>
                </div>
                <div className="mini-timeline">
                  <div>
                    <b>제출 접수</b>
                    {timeLabel(current.submitted_at)}
                  </div>
                  <div>
                    <b>{labels[t(current, "status")]}</b>
                    {current.reviewed_at
                      ? timeLabel(current.reviewed_at)
                      : "아직 검토 기록이 없습니다."}
                  </div>
                </div>
                <p className="meta">
                  피드백과 상태는 기존 검토 API를 통해 함께 저장됩니다.
                </p>
              </aside>
            </div>
          </section>
        </div>
      ) : (
        <Empty title="해당 상태의 제출물이 없습니다." />
      )}
    </>
  );
}

function DecisionForm({
  onSave,
  pending,
  disabled = false,
  bulk = false,
}: {
  onSave: (decision: string, feedback: string) => Promise<void>;
  pending: boolean;
  disabled?: boolean;
  bulk?: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
        ?.value || "approved";
    if (decision !== "approved" && !feedback.trim()) {
      setMessage("보완·반려 사유를 작성해 주세요.");
      return;
    }
    setMessage("");
    try {
      await onSave(decision, feedback);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <textarea
        className="mt8"
        rows={4}
        maxLength={2000}
        value={feedback}
        aria-label={bulk ? "일괄 검토 피드백" : "멘토 피드백"}
        placeholder="잘한 점과 보완할 점을 구체적으로 남겨 주세요."
        onChange={(event) => setFeedback(event.target.value)}
      />
      <p className="meta mt8">보완 요청과 반려 시 사유가 필요합니다.</p>
      {message && (
        <p className="notice mt8" role="alert">
          {message}
        </p>
      )}
      <div className="review-actions">
        <button
          className="btn"
          name="decision"
          value="rejected"
          disabled={pending || disabled}
        >
          반려
        </button>
        <button
          className="btn danger"
          name="decision"
          value="changes_requested"
          disabled={pending || disabled}
        >
          보완 요청
        </button>
        <button
          className="btn primary"
          name="decision"
          value="approved"
          disabled={pending || disabled}
        >
          <Check />
          {bulk ? "선택 제출 승인" : "승인 후 다음"}
        </button>
      </div>
    </form>
  );
}
