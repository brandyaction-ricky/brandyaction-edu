"use client";

import { useState } from "react";
import { Check, Download, Star } from "lucide-react";

export function ProgressButton({ enrollmentId, lessonId, initial }: { enrollmentId: string; lessonId: string; initial: number }) {
  const [progress, setProgress] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const complete = async () => {
    setPending(true); setError("");
    const response = await fetch("/api/learning/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enrollmentId, lessonId, progress: 100 }) });
    const result = await response.json() as { error?: string; progress?: number };
    if (response.ok) setProgress(result.progress || 100); else setError(result.error || "진도를 저장하지 못했습니다.");
    setPending(false);
  };
  return <div className="lesson-progress-action"><button className={progress === 100 ? "completed" : ""} onClick={complete} disabled={pending || progress === 100}><Check/>{progress === 100 ? "학습 완료" : pending ? "저장 중..." : "학습 완료로 표시"}</button>{error && <p role="alert">{error}</p>}</div>;
}

export function ResourceDownload({ enrollmentId, lessonId, name }: { enrollmentId: string; lessonId: string; name: string }) {
  return <a className="learning-download" href={`/api/learning/resources?enrollment=${encodeURIComponent(enrollmentId)}&lesson=${encodeURIComponent(lessonId)}`}><Download/><span><strong>{name}</strong><small>권한 확인 후 안전하게 다운로드됩니다.</small></span></a>;
}

export function ReviewForm({ courseId, cohortId, authorName }: { courseId: string; cohortId: string; authorName: string }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true); setMessage("");
    const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, cohortId, authorName, rating, body }) });
    const result = await response.json() as { error?: string };
    setMessage(response.ok ? "후기가 접수되었습니다. 관리자 확인 후 공개됩니다." : result.error || "후기를 저장하지 못했습니다.");
    if (response.ok) setBody("");
    setPending(false);
  };
  return <section className="learning-review-form"><div><Star/><h2>수강 후기 작성</h2></div><label>별점<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option value={value} key={value}>{value}점</option>)}</select></label><label>후기<textarea value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={2000} placeholder="수강 후 달라진 점을 10자 이상 작성해 주세요."/></label><button onClick={submit} disabled={pending || body.trim().length < 10}>{pending ? "접수 중..." : "후기 접수"}</button>{message && <p role="status">{message}</p>}</section>;
}
