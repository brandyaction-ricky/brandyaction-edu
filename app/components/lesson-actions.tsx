"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Download, RotateCcw, Send, Star } from "lucide-react";
import type { LearningMission } from "@/lib/learning-data";

export function ProgressButton({ enrollmentId, lessonId, initial }: { enrollmentId: string; lessonId: string; initial: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const complete = async () => {
    setPending(true); setError("");
    const response = await fetch("/api/learning/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId, lessonId, progress: 100 }) });
    const result = await response.json() as { error?: string; progress?: number };
    if (response.ok) {
      setProgress(result.progress || 100);
      router.refresh();
    } else setError(result.error || "진도를 저장하지 못했습니다.");
    setPending(false);
  };
  return <div className="lesson-progress-action"><button className={progress === 100 ? "completed" : ""} onClick={complete} disabled={pending || progress === 100}><Check/>{progress === 100 ? "학습 완료" : pending ? "저장 중..." : "학습 완료로 표시"}</button>{error && <p role="alert">{error}</p>}</div>;
}

export function ResourceDownload({ enrollmentId, lessonId, name }: { enrollmentId: string; lessonId: string; name: string }) {
  return <a className="learning-download" href={`/api/learning/resources?enrollment=${encodeURIComponent(enrollmentId)}&lesson=${encodeURIComponent(lessonId)}`}><Download/><span><strong>{name}</strong><small>권한 확인 후 안전하게 다운로드됩니다.</small></span></a>;
}

export function MissionSubmissionForm({ enrollmentId, mission }: { enrollmentId: string; mission: LearningMission }) {
  const router = useRouter();
  const [answerText, setAnswerText] = useState(mission.submission?.answerText || "");
  const [evidenceUrl, setEvidenceUrl] = useState(mission.submission?.evidenceUrl || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const status = mission.submission?.status;
  const canResubmit = !status || status === "rejected" || status === "changes_requested";
  const submit = async () => {
    setPending(true);
    setError("");
    const response = await fetch("/api/learning/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentId, missionId: mission.id, answerText, evidenceUrl }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (response.ok) router.refresh();
    else setError(result.error || "과제를 제출하지 못했습니다.");
    setPending(false);
  };

  return <section className="mission-submission-card">
    <header><div><span>{mission.required ? "필수 과제" : "선택 과제"}</span><h2>{mission.title}</h2></div>{status && <strong className={"mission-status " + status}>{status === "approved" ? "승인 완료" : status === "submitted" ? "검토 대기" : "보완 필요"}</strong>}</header>
    {mission.instructions && <p>{mission.instructions}</p>}
    {status === "approved" ? <div className="mission-result approved"><CheckCircle2/><span><strong>과제가 승인됐습니다.</strong><small>달성도와 레벨에 반영되었습니다.</small></span></div>
      : status === "submitted" ? <div className="mission-result pending"><Send/><span><strong>관리자 검토를 기다리고 있습니다.</strong><small>검토 결과가 이 화면에 표시됩니다.</small></span></div>
      : canResubmit ? <>
        {mission.submission?.feedback && <div className="mission-feedback"><RotateCcw/><span><strong>관리자 피드백</strong><p>{mission.submission.feedback}</p></span></div>}
        {(mission.submissionType === "text" || mission.submissionType === "mixed") && <label>과제 답변<textarea value={answerText} onChange={(event) => setAnswerText(event.target.value)} maxLength={10000} placeholder="실행 내용과 결과를 구체적으로 작성해 주세요."/></label>}
        {(mission.submissionType === "link" || mission.submissionType === "mixed") && <label>증빙 링크<input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} maxLength={2048} placeholder="https://"/></label>}
        <button className="mission-submit-button" onClick={submit} disabled={pending}><Send/>{pending ? "제출 중..." : mission.submission ? "과제 재제출" : "과제 제출"}</button>
      </> : null}
    {error && <p className="mission-submit-error" role="alert">{error}</p>}
  </section>;
}

export function ReviewForm({ courseId, cohortId, authorName, courseTitle }: { courseId: string; cohortId: string; authorName: string; courseTitle: string }) {
  const [rating, setRating] = useState(5);
  const [nickname, setNickname] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true); setMessage("");
    const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, cohortId, nickname, rating, body }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "후기가 접수되었습니다. 관리자 확인 후 공개됩니다." : result.error || "후기를 저장하지 못했습니다.");
    if (response.ok) setBody("");
    setPending(false);
  };
  return <section className="learning-review-form"><div><Star/><h2>수강 후기 작성</h2><p>승인 후 고객 화면에 공개됩니다.</p></div><label>작성자<input value={authorName} readOnly/><small>계정 이름은 안전하게 마스킹됩니다.</small></label><label>공개 이름<input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={20} placeholder="예: 김대표"/></label><label>상품<input value={courseTitle} readOnly/></label><label>별점<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option value={value} key={value}>{"★".repeat(value)} {value}점</option>)}</select></label><label className="review-body-field">후기<textarea value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={2000} placeholder="수강 전 문제와 수강 후 달라진 점을 10자 이상 작성해 주세요."/></label><button onClick={submit} disabled={pending || nickname.trim().length < 2 || body.trim().length < 10}>{pending ? "접수 중..." : "후기 등록"}</button>{message && <p role="status">{message}</p>}</section>;
}
