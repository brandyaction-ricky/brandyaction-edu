"use client";

import { number as num, safeUrl, text as t, type Row } from "@/lib/platform";
import { useEffect, useState } from "react";
import { UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";

type ContentType = "text" | "vod" | "material" | "link";

function message(error: unknown) {
  return error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.";
}

function WeekSettings({ week, disabled, send, onSaved }: {
  week: Row;
  disabled: boolean;
  send: WorkflowSend;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(t(week, "title"));
  const [published, setPublished] = useState(Boolean(week.is_published));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = title.trim() !== t(week, "title") || published !== Boolean(week.is_published);
  async function save() {
    if (!title.trim()) { setError("주차 제목을 입력해 주세요."); return; }
    setBusy(true); setError("");
    try {
      await send({ action: "save", section: "weeks", id: week.id, values: { title: title.trim(), is_published: published } }, "주차를 저장했습니다.");
      onSaved();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  return <div className="product-curriculum-settings">
    <label>주차 제목<input value={title} maxLength={300} onChange={event => setTitle(event.target.value)} disabled={disabled || busy} /></label>
    <label className="product-curriculum-publish"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} disabled={disabled || busy} />주차 공개</label>
    <button className="btn small" type="button" onClick={() => void save()} disabled={disabled || busy || !changed || !title.trim()}>{busy ? "저장 중…" : "주차 저장"}</button>
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}

function LessonSettings({ lesson, hasContent, disabled, send, onSaved }: {
  lesson: Row;
  hasContent: boolean;
  disabled: boolean;
  send: WorkflowSend;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(t(lesson, "title"));
  const [published, setPublished] = useState(Boolean(lesson.is_published));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = title.trim() !== t(lesson, "title") || published !== Boolean(lesson.is_published);
  async function save() {
    if (!title.trim()) { setError("일차 제목을 입력해 주세요."); return; }
    if (published && !hasContent) { setError("콘텐츠를 저장한 뒤 일차를 공개해 주세요."); return; }
    setBusy(true); setError("");
    try {
      await send({ action: "save", section: "learning", id: lesson.id, values: { title: title.trim(), is_published: published } }, "일차를 저장했습니다.");
      onSaved();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }
  return <div className="product-curriculum-settings">
    <label>일차 제목<input value={title} maxLength={300} onChange={event => setTitle(event.target.value)} disabled={disabled || busy} /></label>
    <label className="product-curriculum-publish"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} disabled={disabled || busy} />일차 공개</label>
    <button className="btn small" type="button" onClick={() => void save()} disabled={disabled || busy || !changed || !title.trim()}>{busy ? "저장 중…" : "일차 저장"}</button>
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}

export function ProductCurriculumWorkspace({ course, pending, send }: {
  course?: Row;
  pending: boolean;
  send: WorkflowSend;
}) {
  const [snapshot, setSnapshot] = useState<Data | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  useEffect(() => {
    if (!course?.id) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/platform?admin=1&section=products&record=${encodeURIComponent(String(course.id))}&part=curriculum`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "커리큘럼을 불러오지 못했습니다.");
        return result.data as Data;
      })
      .then((result) => { if (active) { setSnapshot(result); setReadError(""); setLoading(false); } })
      .catch((cause) => { if (active && !controller.signal.aborted) { setReadError(message(cause)); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [course?.id, readVersion]);
  const curriculum: Data = snapshot || {};
  const weeks = (curriculum.curriculum_weeks || [])
    .filter((week) => week.course_id === course?.id && !week.archived_at)
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const weekIds = new Set(weeks.map((week) => String(week.id)));
  const lessons = (curriculum.curriculum_lessons || [])
    .filter((lesson) => weekIds.has(String(lesson.week_id)) && !lesson.archived_at)
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
  const [weekTitle, setWeekTitle] = useState("");
  const [weekId, setWeekId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [contentValue, setContentValue] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const selectedWeekId = weekIds.has(weekId) ? weekId : String(weeks[0]?.id || "");
  const selectedLesson = lessons.find((lesson) => lesson.id === lessonId);
  const existingContent = (curriculum.lesson_contents || []).find((content) => content.lesson_id === lessonId);
  const saving = pending || busy || loading || Boolean(readError) || uploadStatus === "uploading";

  function selectLesson(lesson: Row) {
    const content = (curriculum.lesson_contents || []).find((item) => item.lesson_id === lesson.id);
    const type = (t(lesson, "content_type") || "text") as ContentType;
    setLessonId(String(lesson.id));
    setContentType(type);
    setContentValue(type === "text" ? t(content, "body_text") : type === "vod" ? t(content, "vod_url") : type === "material" ? t(content, "resource_storage_path") : t(content, "external_url"));
    setResourceName(t(content, "resource_name"));
    setUploadStatus("idle");
    setError("");
  }

  async function createWeek() {
    const title = weekTitle.trim();
    if (!course?.id || !title) { setError("상품을 먼저 저장하고 주차 제목을 입력해 주세요."); return; }
    setError(""); setBusy(true);
    try {
      const result = await send({ action: "save", section: "weeks", values: {
        course_id: course.id,
        week_number: Math.max(0, ...(curriculum.curriculum_weeks || []).filter((week) => week.course_id === course.id).map((week) => num(week, "week_number"))) + 1,
        title,
        is_published: false,
      } }, "상품에 주차를 추가했습니다.");
      const created = result.row as Row | undefined;
      if (created?.id) setWeekId(String(created.id));
      setWeekTitle("");
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function createLesson() {
    const title = lessonTitle.trim();
    if (!selectedWeekId || !title) { setError("주차를 선택하고 일차 제목을 입력해 주세요."); return; }
    setError(""); setBusy(true);
    try {
      const result = await send({ action: "save", section: "learning", values: {
        week_id: selectedWeekId,
        day_number: Math.max(0, ...lessons.map((lesson) => num(lesson, "day_number")), ...(curriculum.curriculum_lessons || []).filter((lesson) => lesson.week_id === selectedWeekId).map((lesson) => num(lesson, "day_number"))) + 1,
        title,
        content_type: "text",
        is_published: false,
        is_preview: false,
      } }, "상품에 일차별 학습을 추가했습니다. 내용을 이어서 등록해 주세요.");
      const created = result.row as Row | undefined;
      if (created?.id) { setLessonId(String(created.id)); setContentType("text"); setContentValue(""); }
      setLessonTitle("");
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function saveContent() {
    if (!selectedLesson) return;
    const value = contentValue.trim();
    if (!value) { setError("학습 내용을 입력하거나 자료를 업로드해 주세요."); return; }
    if ((contentType === "vod" || contentType === "link") && (!/^https?:\/\//i.test(value) || !safeUrl(value))) { setError("https:// 또는 http://로 시작하는 주소를 입력해 주세요."); return; }
    if (uploadStatus !== "idle") { setError("자료 업로드를 확인해 주세요."); return; }
    setError(""); setBusy(true);
    try {
      if (t(selectedLesson, "content_type") !== contentType) {
        await send({ action: "save", section: "learning", id: lessonId, values: { content_type: contentType } }, "학습 유형을 저장했습니다.");
      }
      await send({ action: "save", section: "contents", id: existingContent ? lessonId : undefined, values: {
        lesson_id: lessonId,
        body_text: contentType === "text" ? value : null,
        vod_url: contentType === "vod" ? value : null,
        resource_storage_path: contentType === "material" ? value : null,
        resource_name: contentType === "material" ? resourceName.trim() || value.split("/").pop() : null,
        external_url: contentType === "link" ? value : null,
      } }, "일차별 학습 콘텐츠를 저장했습니다.");
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  if (!course?.id) return <div className="section-pad"><p className="notice">상품을 먼저 저장하면 같은 화면에서 주차·일차·콘텐츠를 등록할 수 있습니다.</p></div>;

  return <div className="section-pad product-curriculum-workspace">
    <h2>상품별 커리큘럼</h2>
    <p className="meta">이 상품에 연결된 기존 주차와 일차를 그대로 보여 줍니다. 새 항목은 비공개로 등록되며 항목별로 즉시 저장됩니다.</p>
    {loading && <p className="meta" role="status">상품 커리큘럼을 불러오는 중입니다.</p>}
    {readError && <p className="notice warning" role="alert">{readError} <button className="btn small" type="button" onClick={() => { setLoading(true); setReadVersion((version) => version + 1); }}>다시 시도</button></p>}
    <div className="product-curriculum-create">
      <label>새 주차 제목<input value={weekTitle} maxLength={300} onChange={(event) => setWeekTitle(event.target.value)} placeholder="예: 1주차 시작하기" disabled={saving} /></label>
      <button className="btn" type="button" onClick={() => void createWeek()} disabled={saving || !weekTitle.trim()}>주차 추가</button>
    </div>
    <div className="product-curriculum-create">
      <label>일차를 추가할 주차<select value={selectedWeekId} onChange={(event) => setWeekId(event.target.value)} disabled={saving || !weeks.length}>{!weeks.length && <option value="">주차 없음</option>}{weeks.map((week) => <option key={week.id} value={week.id}>{num(week, "week_number")}주차 · {t(week, "title")}</option>)}</select></label>
      <label>새 일차 제목<input value={lessonTitle} maxLength={300} onChange={(event) => setLessonTitle(event.target.value)} placeholder="예: Day 1 실습" disabled={saving || !weeks.length} /></label>
      <button className="btn" type="button" onClick={() => void createLesson()} disabled={saving || !selectedWeekId || !lessonTitle.trim()}>일차 추가</button>
    </div>
    {!weeks.length && <p className="notice">먼저 주차를 추가해 주세요.</p>}
    {weeks.map((week) => <section key={week.id} className="product-curriculum-week" aria-label={`${num(week, "week_number")}주차 ${t(week, "title")}`}>
      <h3>{num(week, "week_number")}주차 · {t(week, "title")}</h3>
      <WeekSettings key={`${week.id}:${week.updated_at}`} week={week} disabled={saving} send={send} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} />
      {lessons.filter((lesson) => lesson.week_id === week.id).length ? <ul>{lessons.filter((lesson) => lesson.week_id === week.id).map((lesson) => <li key={lesson.id}><span>Day {num(lesson, "day_number")} · {t(lesson, "title")}{lesson.is_published ? " · 공개" : " · 비공개"}</span><button className="btn small" type="button" onClick={() => selectLesson(lesson)} disabled={saving}>콘텐츠 편집</button></li>)}</ul> : <p className="meta">등록된 일차가 없습니다.</p>}
    </section>)}
    {selectedLesson && <section className="product-curriculum-content" aria-label="일차별 콘텐츠 편집">
      <h3>Day {num(selectedLesson, "day_number")} · {t(selectedLesson, "title")}</h3>
      <LessonSettings key={`${selectedLesson.id}:${selectedLesson.updated_at}`} lesson={selectedLesson} hasContent={Boolean(existingContent)} disabled={saving} send={send} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} />
      <label>콘텐츠 유형<select value={contentType} onChange={(event) => { setContentType(event.target.value as ContentType); setContentValue(""); setUploadStatus("idle"); }} disabled={saving}><option value="text">텍스트</option><option value="vod">영상 URL</option><option value="material">자료 파일</option><option value="link">외부 링크</option></select></label>
      {contentType === "text" ? <label>학습 본문<textarea rows={7} value={contentValue} onChange={(event) => setContentValue(event.target.value)} disabled={saving} /></label> : contentType === "material" ? <><label>자료 이름<input value={resourceName} onChange={(event) => setResourceName(event.target.value)} disabled={saving} /></label><UploadField key={lessonId} name="curriculum_resource" value={contentValue} image={false} disabled={saving} onChange={setContentValue} onStatusChange={setUploadStatus} /></> : <label>{contentType === "vod" ? "영상 URL" : "외부 링크"}<input type="url" value={contentValue} onChange={(event) => setContentValue(event.target.value)} placeholder="https://" disabled={saving} /></label>}
      <button className="btn primary" type="button" onClick={() => void saveContent()} disabled={saving || !contentValue.trim()}>콘텐츠 저장</button>
    </section>}
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}
