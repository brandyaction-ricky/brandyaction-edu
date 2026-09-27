"use client";

import { labels, object, safeUrl, text as t, type Row } from "@/lib/platform";
import { ArrowRight, Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useUnsavedWarning } from '@/features/admin-ui';
import { emptyReviewChecks, reviewCheckItems, type ReviewChecks, type ReviewHistory } from '@/lib/submission-review';
import { timeLabel, type Data, type WorkflowSend } from "../learning-workflows";
import { Badge, Empty } from "./primitives";
import { readReviewHistory, SubmissionReviewHistory } from './submission-review-history';

type Submission = Row & { member?: Row; mission?: Row; course?: Row };
type Draft = { feedback: string; checks: ReviewChecks };
const emptyDraft = (): Draft => ({ feedback: '', checks: emptyReviewChecks() });
const hasDraft = (draft?: Draft) => !!draft && (!!draft.feedback || reviewCheckItems.some(item => draft.checks[item.key]));
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
    params.get("submission") || params.get("member") ? "" : "submitted",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("old");
  const [currentId, setCurrentId] = useState(params.get("submission") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [latest, setLatest] = useState<Record<string, Partial<Submission>>>({});
  const [historyRevision, setHistoryRevision] = useState(0);
  const [recheckIds, setRecheckIds] = useState<string[]>([]);
  const [bulkRecheckIds, setBulkRecheckIds] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const notice = useRef<HTMLParagraphElement>(null);
  const focusAfterSave = useRef(false);
  useUnsavedWarning(pending || !!bulkFeedback || Object.values(drafts).some(hasDraft));
  const enriched: Submission[] = (data.mission_submissions || []).map(
    (submission) => {
      const enrollment = (object(submission, 'enrollments').user_id ? object(submission, 'enrollments') : (data.enrollments || []).find(
        (row) => row.id === submission.enrollment_id,
      )) as Row | undefined;
      return {
        ...submission,
        ...latest[submission.id],
        member: (object(enrollment, 'profiles').id ? object(enrollment, 'profiles') : (data.profiles || []).find(
          (row) => row.id === enrollment?.user_id,
        )) as Row | undefined,
        mission: (object(submission, 'curriculum_missions').id ? object(submission, 'curriculum_missions') : (data.curriculum_missions || []).find(
          (row) => row.id === submission.mission_id,
        )) as Row | undefined,
        course: (object(enrollment, 'courses').id ? object(enrollment, 'courses') : (data.courses || []).find(
          (row) => row.id === enrollment?.course_id,
        )) as Row | undefined,
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
  // A conflict refresh can move the selected row out of the pending filter.
  // Keep its saved result and our unsaved draft visible until the operator moves on.
  const current = enriched.find((row) => row.id === currentId) || list[0];
  const draft = current ? drafts[current.id] || emptyDraft() : emptyDraft();
  function updateDraft(id: string, change: Partial<Draft>) {
    setDrafts(previous => ({ ...previous, [id]: { ...(previous[id] || emptyDraft()), ...change } }));
  }
  useEffect(() => {
    if (focusAfterSave.current && !pending) { (heading.current || notice.current)?.focus(); focusAfterSave.current = false; }
  }, [current?.id, pending, message]);
  async function refreshResults(ids: string[]) {
    const results: ReviewHistory[] = [];
    for (let offset = 0; offset < ids.length; offset += 5) {
      results.push(...await Promise.all(ids.slice(offset, offset + 5).map(id => readReviewHistory(id, 1, AbortSignal.timeout(15000)))));
    }
    setLatest(previous => ({ ...previous, ...Object.fromEntries(results.map(result => [result.current.id, result.current])) }));
    setRecheckIds(previous => previous.filter(id => !ids.includes(id)));
    setBulkRecheckIds(previous => previous.filter(id => !ids.includes(id)));
    if (ids.length === 1) setCurrentId(ids[0]);
    focusAfterSave.current = true;
    setHistoryRevision(value => value + 1);
    setMessage('최신 저장 결과를 확인했습니다. 내 미저장 내용은 자동으로 다시 저장되지 않습니다.');
  }
  async function save(ids: string[], decision: string, feedback: string, bulk = false) {
    setMessage('');
    if (ids.some(id => recheckIds.includes(id))) throw new Error('최신 결과를 먼저 확인해 주세요.');
    try {
      await send(
        { action: "review", ids, decision, feedback, reviewMode: bulk ? 'bulk' : 'single', ...(bulk ? {} : { reviewChecks: (drafts[ids[0]] || emptyDraft()).checks }) },
        `${ids.length}건을 검토했습니다.`,
      );
    } catch (error) {
      setRecheckIds(previous => [...new Set([...previous, ...ids])]);
      if (bulk) setBulkRecheckIds([...ids]);
      throw error;
    }
    setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))));
    setLatest(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.includes(id))));
    if (bulk) setBulkFeedback('');
    setSelected([]);
    setMessage("검토 결과와 피드백을 저장했습니다.");
    setHistoryRevision(value => value + 1);
    focusAfterSave.current = true;
    if (current && ids.includes(current.id))
      setCurrentId(list.find((row) => !ids.includes(row.id))?.id || "");
  }
  return (
    <>
      {(params.get('member') || params.get('submission')) && <p className="notice mb16">연결된 {params.get('submission') ? '제출물' : '회원'}만 조회 중입니다. <Link href="/admin/reviews" className="text-link">전체 검토 목록</Link></p>}
      <div className="tabs" aria-label="제출 상태">
        {states.map((value) => (
          <button
            key={value}
            className={"tab " + (status === value ? "active" : "")}
            aria-pressed={status === value}
            disabled={pending}
            onClick={() => {
              setStatus(value);
              setSelected([]);
              setCurrentId('');
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
          disabled={pending}
          onChange={(event) => { setQuery(event.target.value); setCurrentId(''); }}
        />
        <span className="spacer" />
        <select
          aria-label="제출물 정렬"
          value={sort}
          disabled={pending}
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
            적용합니다. 개별 체크는 저장하지 않고 일괄 처리로 기록합니다.
          </p>
          <DecisionForm
            pending={pending}
            disabled={!selected.length || selected.some(id => enriched.find(row => row.id === id)?.status !== 'submitted')}
            feedback={bulkFeedback}
            onFeedback={setBulkFeedback}
            needsRecheck={!!bulkRecheckIds.length || selected.some(id => recheckIds.includes(id))}
            onRefresh={() => refreshResults(bulkRecheckIds.length ? bulkRecheckIds : selected)}
            onSave={(decision, feedback) => save(selected, decision, feedback, true)}
            bulk
          />
        </div>
      </details>
      {message && (
        <p ref={notice} tabIndex={-1} className="notice review-result-notice mb24" role="status">
          {message}
        </p>
      )}
      {(Object.values(drafts).some(hasDraft) || bulkFeedback) && <p className="notice mb16" role="status">저장하지 않은 검토 내용이 있습니다. 다른 제출물을 열어도 이 화면 안에서는 유지되며, 화면을 나가면 사라집니다.</p>}
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
                  disabled={pending}
                  onClick={() => setCurrentId(row.id)}
                >
                  <div className="spread">
                    <strong>{name(row.member) || "회원"}</strong>
                    <span className="meta">{t(row, "attempt_number")}차</span>
                  </div>
                  <p>{name(row.mission) || "미션"}</p>
                  <p className="meta">{name(row.course)} · {t(row.member, 'email')}</p>
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
              <h2 ref={heading} tabIndex={-1}>{name(current.mission) || "미션"}</h2>
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
                <SubmissionReviewHistory key={`history-${current.id}`} id={current.id} revision={historyRevision}/>
                <h3 className="mt24">{current.status === 'submitted' ? '이번 검토 결정' : '저장된 멘토 피드백'}</h3>
                {current.status === "submitted" ? (
                  <DecisionForm
                    key={current.id}
                    pending={pending}
                    feedback={draft.feedback}
                    onFeedback={feedback => updateDraft(current.id, { feedback })}
                    checks={draft.checks}
                    onChecks={checks => updateDraft(current.id, { checks })}
                    needsRecheck={recheckIds.includes(current.id)}
                    onRefresh={() => refreshResults([current.id])}
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
                {current.status !== 'submitted' && hasDraft(draft) && <section className="review-unsaved mt24" aria-label="내 미저장 검토 내용">
                  <h3>내 미저장 검토 내용</h3><p className="meta">저장 응답을 확인하지 못해 보관한 입력 내용입니다. 서버에 저장된 검토 결과를 덮어쓰지 않습니다.</p>
                  <textarea readOnly rows={4} aria-label="내 미저장 피드백" value={draft.feedback}/>
                  <ul>{reviewCheckItems.map(item => <li key={item.key}>{item.label} · {draft.checks[item.key] ? '확인' : '미확인'}</li>)}</ul>
                  <button type="button" className="btn small" onClick={() => { if (window.confirm('내 미저장 검토 내용을 지울까요? 저장된 검토 결과는 바뀌지 않습니다.')) setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== current.id))); }}>미저장 내용 지우기</button>
                </section>}
              </div>
              <aside className="inspector">
                {current.member?.id && <Link className="btn small mb16" href={`/admin/customers?member=${current.member.id}`}>회원 운영 정보 보기</Link>}
                {current.status === "submitted" ? <>
                  <h3>검토 대기</h3><p className="meta">답변과 증빙을 확인한 뒤 체크·피드백·결정을 함께 저장하세요. 확인하지 않은 체크가 승인을 자동으로 막지는 않습니다.</p>
                </> : <>
                  <h3>검토 기록</h3>
                  <p>{labels[t(current, "status")]} · {current.reviewed_at ? timeLabel(current.reviewed_at) : "검토 시각 기록 없음"}</p>
                  <p className="meta">검토 이력에서 당시 체크 결과를 확인하세요. 저장하지 않았던 항목은 기록 없음으로 구분합니다.</p>
                </>}
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
                  검토 결과는 한 번만 처리되며 완료된 결과를 다시 덮어쓰지 않습니다.
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
  feedback,
  onFeedback,
  checks,
  onChecks,
  onRefresh,
  needsRecheck,
}: {
  onSave: (decision: string, feedback: string) => Promise<void>;
  pending: boolean;
  disabled?: boolean;
  bulk?: boolean;
  feedback: string;
  onFeedback: (value: string) => void;
  checks?: ReviewChecks;
  onChecks?: (value: ReviewChecks) => void;
  onRefresh: () => Promise<void>;
  needsRecheck: boolean;
}) {
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const saving = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || pending || disabled || needsRecheck || refreshing) return;
    const decision =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
        ?.value || "approved";
    if (decision !== "approved" && !feedback.trim()) {
      setMessage("보완·반려 사유를 작성해 주세요.");
      return;
    }
    setMessage("");
    saving.current = true;
    try {
      await onSave(decision, feedback);
    } catch (error) {
      const problem = error as Error & { code?: string };
      setMessage(problem.code === 'REVIEW_CONFLICT' ? '다른 운영자가 먼저 검토했습니다. 작성한 내용은 유지됩니다.' : problem.message || '저장 결과를 확인하지 못했습니다.');
    } finally {
      saving.current = false;
    }
  }
  return (
    <form onSubmit={submit}>
      {checks && onChecks && <fieldset className="review-checks" disabled={pending || refreshing || needsRecheck}>
        <legend>이번 검토 전 확인</legend><p className="meta">검토 결과와 함께 저장됩니다. 체크하지 않은 항목은 미확인으로 기록합니다.</p>
        {reviewCheckItems.map(item => <label className="checkline" key={item.key}><input type="checkbox" checked={checks[item.key]} onChange={event => onChecks({ ...checks, [item.key]: event.target.checked })}/><span>{item.label}</span></label>)}
      </fieldset>}
      <textarea
        className="mt8"
        rows={4}
        maxLength={2000}
        value={feedback}
        disabled={pending || refreshing}
        aria-label={bulk ? "일괄 검토 피드백" : "멘토 피드백"}
        placeholder="잘한 점과 보완할 점을 구체적으로 남겨 주세요."
        onChange={(event) => onFeedback(event.target.value)}
      />
      <p className="meta mt8">보완 요청과 반려 시 사유가 필요합니다.</p>
      {message && (
        <p className="notice mt8" role="alert">
          {message}
        </p>
      )}
      {needsRecheck && <div className="notice mt8"><p>중복 저장을 막기 위해 최신 결과를 먼저 확인하세요. 미저장 내용은 자동으로 다시 전송되지 않습니다.</p>
        <button type="button" className="btn small" disabled={refreshing || pending} onClick={async () => {
          setRefreshing(true);
          try { await onRefresh(); setMessage('최신 결과를 확인했습니다. 이미 처리된 건은 다시 검토할 수 없습니다.'); }
          catch (error) { setMessage((error as Error).message); }
          finally { setRefreshing(false); }
        }}>{refreshing ? '최신 결과 확인 중…' : '최신 결과 확인'}</button>
      </div>}
      <div className="review-actions">
        <button
          className="btn"
          name="decision"
          value="rejected"
          disabled={pending || disabled || needsRecheck || refreshing}
        >
          반려
        </button>
        <button
          className="btn danger"
          name="decision"
          value="changes_requested"
          disabled={pending || disabled || needsRecheck || refreshing}
        >
          보완 요청
        </button>
        <button
          className="btn primary"
          name="decision"
          value="approved"
          disabled={pending || disabled || needsRecheck || refreshing}
        >
          <Check />
          {bulk ? "선택 제출 승인" : "승인 후 다음"}
        </button>
      </div>
    </form>
  );
}
