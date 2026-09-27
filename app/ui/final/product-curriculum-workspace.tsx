"use client";

import { number as num, safeUrl, text as t, type Row } from "@/lib/platform";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";

import { Video } from "./primitives";
import { useUnsavedLearningChanges } from "./use-unsaved-learning-changes";
import { CurriculumCopyPanel } from "./curriculum-copy-panel";
import { ProductMissionWorkspace } from "./product-mission-workspace";

type ContentType = "text" | "vod" | "material" | "link";

function message(error: unknown) {
  return error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.";
}

function lessonVisibility(lesson: Row, week?: Row) {
  if (!lesson.is_published) return "비공개";
  return week?.is_published ? "공개" : "주차 비공개로 숨김";
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
  useUnsavedLearningChanges(changed);
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
    <span className="meta" role="status">{busy ? "저장 중…" : changed ? "저장하지 않은 변경" : "저장된 상태"}</span>
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
  useUnsavedLearningChanges(changed);
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
    <span className="meta" role="status">{busy ? "저장 중…" : changed ? "저장하지 않은 변경" : "저장된 상태"}</span>
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}

export function ProductCurriculumWorkspace({ course, pending, send, commonResources, resourceCount = 0, active: isActive = true, productDirty = false }: {
  course?: Row;
  commonResources?: ReactNode;
  active?: boolean;
  productDirty?: boolean;
  resourceCount?: number;
  pending: boolean;
  send: WorkflowSend;
}) {
  const [snapshot, setSnapshot] = useState<Data | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  useEffect(() => {
    if (!course?.id || !isActive) return;
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
  }, [course?.id, readVersion, isActive]);
  const curriculum: Data = snapshot || {};
  const weeks = (curriculum.curriculum_weeks || [])
    .filter((week) => week.course_id === course?.id && !week.archived_at)
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const weekIds = new Set(weeks.map((week) => String(week.id)));
  const lessons = (curriculum.curriculum_lessons || [])
    .filter((lesson) => weekIds.has(String(lesson.week_id)) && !lesson.archived_at)
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
  const publishedWeeks = weeks.filter(week => week.is_published === true);
  const publishedWeekIds = new Set(publishedWeeks.map(week => String(week.id)));
  const publishedLessons = lessons.filter(lesson => lesson.is_published === true && publishedWeekIds.has(String(lesson.week_id)));
  const [weekTitle, setWeekTitle] = useState("");
  const [weekId, setWeekId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [addingTo, setAddingTo] = useState("");
  const [savedContentDraft, setSavedContentDraft] = useState("");
  const [openedLessons, setOpenedLessons] = useState<string[]>([]);
  const contentEditorRef = useRef<HTMLElement>(null);
  const weekSettingsRefs = useRef(new Map<string, HTMLDetailsElement>());
  function openWeekSettings(id: string) {
    const settings = weekSettingsRefs.current.get(id);
    if (!settings) return;
    const outline = settings.parentElement;
    if (outline instanceof HTMLDetailsElement) outline.open = true;
    settings.open = true;
    settings.querySelector("summary")?.focus({ preventScroll: true });
    settings.scrollIntoView({ block: "center", behavior: "smooth" });
  }
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

  const contentDraft = JSON.stringify([contentType, contentValue, resourceName]);
  const contentDirty = Boolean(lessonId) && contentDraft !== savedContentDraft;
  useUnsavedLearningChanges(contentDirty || Boolean(weekTitle.trim()) || Boolean(lessonTitle.trim()));
  function selectLesson(lesson: Row) {
    if (lesson.id === lessonId) return;
    if (contentDirty && !window.confirm("저장하지 않은 학습 내용이 있습니다. 다른 학습으로 이동할까요?")) return;
    const content = (curriculum.lesson_contents || []).find((item) => item.lesson_id === lesson.id);
    const type = (t(lesson, "content_type") || "text") as ContentType;
    setLessonId(String(lesson.id));
    setOpenedLessons(ids => ids.includes(String(lesson.id)) ? ids : [...ids, String(lesson.id)]);
    setContentType(type);
    setContentValue(type === "text" ? t(content, "body_text") : type === "vod" ? t(content, "vod_url") : type === "material" ? t(content, "resource_storage_path") : t(content, "external_url"));
    setResourceName(t(content, "resource_name"));
    setSavedContentDraft(JSON.stringify([type, type === "text" ? t(content, "body_text") : type === "vod" ? t(content, "vod_url") : type === "material" ? t(content, "resource_storage_path") : t(content, "external_url"), t(content, "resource_name")]));
    setPreviewOpen(false);
    setUploadStatus("idle");
    setError("");
    requestAnimationFrame(() => { contentEditorRef.current?.focus({ preventScroll: true }); contentEditorRef.current?.scrollIntoView({ block: "start" }); });
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
    if (contentDirty && !window.confirm("저장하지 않은 학습 내용이 있습니다. 새 학습을 추가할까요?")) return;
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
      if (created?.id) { setOpenedLessons(ids => [...ids, String(created.id)]); setLessonId(String(created.id)); setContentType("text"); setContentValue(""); setResourceName(""); setSavedContentDraft(JSON.stringify(["text", "", ""])); }
      setLessonTitle(""); setAddingTo("");
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
      setSavedContentDraft(contentDraft);
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  if (!course?.id) return <div className="section-pad"><p className="notice">상품을 먼저 저장하면 같은 화면에서 주차·일차·콘텐츠를 등록할 수 있습니다.</p></div>;

  return <div className="section-pad product-curriculum-workspace">
    <h2>상품별 커리큘럼</h2>
    <p className="meta">학습 편집을 선택해 본문·영상·자료와 미션을 함께 관리합니다. 같은 상품의 모든 기수가 이 커리큘럼을 함께 사용합니다.</p>
    <section className="product-curriculum-guide" aria-label="학습 공개 상태">
      <div className="curriculum-readiness"><h3>학습 공개 상태</h3>{!loading && !readError && <span role="status">공개 주차 <b>{publishedWeeks.length}개</b> · 공개 학습 <b>{publishedLessons.length}개</b></span>}</div>
      <p>{loading || readError ? "커리큘럼을 정상적으로 불러온 뒤 준비 상태를 확인할 수 있습니다." : publishedWeeks.length && publishedLessons.length ? "공개된 학습이 있습니다. 수강생에게 제공할 내용을 확인해 주세요." : "아직 수강생에게 공개되는 학습이 없습니다. 수업 준비가 끝나면 주차와 일차를 각각 공개해 주세요."}</p>
      <p>커리큘럼이 비공개여도 상품 모집과 결제를 진행할 수 있습니다. 판매 설정은 기본·판매 탭에서 확인하세요.</p>
      <details><summary>공개 범위와 등록 방법</summary><p>주차를 추가하고 학습 내용을 저장한 다음, 주차 공개와 일차 공개를 각각 저장합니다. 상세페이지에 적은 목차는 이 설정에 반영되지 않습니다.</p><p>공개한 제목은 상품 목차에 표시됩니다. 학습 내용은 기존 수강 권한에 따라 열리며, 공개 체크가 무료 미리보기 허용을 뜻하지는 않습니다.</p><p>가격과 모집·교육 일정은 기수·회차 탭에서 관리합니다. 같은 상품의 기수는 커리큘럼을 공유합니다.</p></details>
    </section>
    <details className="curriculum-copy-disclosure"><summary>기존 커리큘럼 불러오기</summary><CurriculumCopyPanel targetId={String(course.id)} eligible={t(course, "status") === "draft" && !(curriculum.curriculum_weeks || []).length && resourceCount === 0} disabled={saving} dirty={productDirty || Boolean(weekTitle.trim()) || Boolean(lessonTitle.trim())} onCopied={() => { setLoading(true); setReadVersion(version => version + 1); }} /></details>
    {loading && <p className="meta" role="status">상품 커리큘럼을 불러오는 중입니다.</p>}
    {readError && <p className="notice warning" role="alert">{readError} <button className="btn small" type="button" onClick={() => { setLoading(true); setReadVersion((version) => version + 1); }}>다시 시도</button></p>}
    <div className="curriculum-studio">
    <div className="curriculum-outline" aria-label="커리큘럼 목차">
    <div className="product-curriculum-create">
      <label>새 주차 제목<input value={weekTitle} maxLength={300} onChange={(event) => setWeekTitle(event.target.value)} placeholder="예: 시작하기" disabled={saving} /></label>
      <button className="btn" type="button" onClick={() => void createWeek()} disabled={saving || !weekTitle.trim()}>주차 추가</button>
    </div>
    {!weeks.length && <p className="notice">먼저 주차를 추가해 주세요.</p>}
    {weeks.map((week) => <section key={week.id} className="product-curriculum-week" aria-label={`${num(week, "week_number")}주차 ${t(week, "title")}`}>
      <details open><summary><h3>{num(week, "week_number")}주차 · {t(week, "title")}</h3><span className="meta">{lessons.filter(l=>l.week_id===week.id).length}개 학습 · {week.is_published ? "공개" : "비공개"}</span></summary>
      <details className="curriculum-week-settings" ref={element => { if (element) weekSettingsRefs.current.set(String(week.id), element); else weekSettingsRefs.current.delete(String(week.id)); }}><summary>주차 설정</summary><WeekSettings key={`${week.id}:${week.updated_at}`} week={week} disabled={saving} send={send} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} /></details>
      {lessons.filter((lesson) => lesson.week_id === week.id).length ? <ul>{lessons.filter((lesson) => lesson.week_id === week.id).map((lesson) => <li key={lesson.id} className={lesson.id === lessonId ? "selected" : ""}><div><span>Day {num(lesson, "day_number")} · {t(lesson, "title")}</span><small>{({text:"텍스트",vod:"영상",material:"자료",link:"외부 링크"} as Record<string,string>)[t(lesson,"content_type")] || "학습"} · {(curriculum.lesson_contents || []).some(c=>c.lesson_id===lesson.id) ? "내용 등록됨" : "내용 없음"} · {lessonVisibility(lesson, week)}</small></div><button className="btn small" type="button" aria-pressed={lesson.id===lessonId} onClick={() => selectLesson(lesson)} disabled={saving}>학습 편집</button></li>)}</ul> : <p className="meta">등록된 학습이 없습니다.</p>}
      <button className="btn small curriculum-add-lesson" type="button" disabled={saving} onClick={()=>{setWeekId(String(week.id));setAddingTo(String(week.id));}}>＋ 학습 추가</button>
      {addingTo === week.id && <div className="product-curriculum-create"><label>새 일차 제목<input autoFocus value={lessonTitle} maxLength={300} onChange={event=>setLessonTitle(event.target.value)} disabled={saving}/></label><button type="button" className="btn" disabled={saving || !lessonTitle.trim()} onClick={()=>void createLesson()}>일차 추가</button></div>}
      </details>
    </section>)}
    </div>
    <div className="curriculum-editor-column">
    {!selectedLesson && <div className="curriculum-editor-empty"><h3>편집할 학습을 선택해 주세요</h3><p>목차의 ‘학습 편집’을 누르면 이곳에서 내용과 미션을 관리할 수 있습니다.</p></div>}
    {selectedLesson && <section ref={contentEditorRef} tabIndex={-1} className="product-curriculum-content" aria-label="일차별 콘텐츠 편집">
      <header className="curriculum-editor-heading"><div><p className="meta">{num(weeks.find(w=>w.id===selectedLesson.week_id), "week_number")}주차 · 선택한 학습</p><h3>Day {num(selectedLesson, "day_number")} · {t(selectedLesson, "title")}</h3></div><button className="btn small" type="button" aria-expanded={previewOpen} onClick={()=>setPreviewOpen(value=>!value)}>{previewOpen ? "미리보기 닫기" : "학습 내용 미리보기"}</button></header>
      {previewOpen && <div className="curriculum-lesson-preview" role="region" aria-label="학습 내용 미리보기"><p className="meta">현재 편집 내용의 미리보기입니다. 저장·공개·수강 권한은 변경되지 않습니다.</p>{contentType === "text" ? <p className="reading-copy">{contentValue || "아직 작성한 내용이 없습니다."}</p> : contentType === "vod" && safeUrl(contentValue) ? <Video url={contentValue}/> : <p>{contentType === "material" ? resourceName || "학습 자료" : contentValue}</p>}</div>}
      <div className="notice" aria-label="저장된 학습 공개 상태">
        <p><b>{lessonVisibility(selectedLesson, weeks.find(week => week.id === selectedLesson.week_id))}</b> · 저장된 설정 기준</p>
        {!weeks.find(week => week.id === selectedLesson.week_id)?.is_published && <><p>상위 주차가 비공개입니다. 일차 공개를 저장해도 수강생에게 보이지 않습니다. 주차를 공개하면 그 안의 공개된 학습도 함께 표시되므로 먼저 확인해 주세요.</p><button type="button" className="btn small" onClick={() => openWeekSettings(String(selectedLesson.week_id))}>이 학습의 주차 설정</button></>}
      </div>
      {openedLessons.map(id => { const draftLesson = lessons.find(item=>item.id===id); return draftLesson && <div key={id} hidden={lessonId!==id}><LessonSettings key={`${draftLesson.id}:${draftLesson.updated_at}`} lesson={draftLesson} hasContent={(curriculum.lesson_contents || []).some(item=>item.lesson_id===id)} disabled={saving} send={send} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} /></div>; })}
      <label>콘텐츠 유형<select value={contentType} onChange={(event) => { setContentType(event.target.value as ContentType); setContentValue(""); setUploadStatus("idle"); }} disabled={saving}><option value="text">텍스트</option><option value="vod">영상 URL</option><option value="material">자료 파일</option><option value="link">외부 링크</option></select></label>
      {contentType === "text" ? <label>학습 본문<textarea rows={7} value={contentValue} onChange={(event) => setContentValue(event.target.value)} disabled={saving} /></label> : contentType === "material" ? <><label>자료 이름<input value={resourceName} onChange={(event) => setResourceName(event.target.value)} disabled={saving} /></label><UploadField key={lessonId} name="curriculum_resource" value={contentValue} image={false} disabled={saving} onChange={setContentValue} onStatusChange={setUploadStatus} /></> : <label>{contentType === "vod" ? "영상 URL" : "외부 링크"}<input type="url" value={contentValue} onChange={(event) => setContentValue(event.target.value)} placeholder="https://" disabled={saving} /></label>}
      <button className="btn primary" type="button" onClick={() => void saveContent()} disabled={saving || !contentValue.trim() || !contentDirty}>콘텐츠 저장</button>
      <p className="meta" role="status">{contentDirty ? "콘텐츠에 저장하지 않은 변경이 있습니다." : "콘텐츠 변경사항이 없습니다."}</p>
    </section>}
    {openedLessons.map(id => <div key={id} hidden={lessonId !== id}>
      <ProductMissionWorkspace course={course} pending={pending} send={send} lessonScope={id} />
    </div>)}
    </div></div>
    {commonResources && <details className="product-common-resources">
      <summary>과정 공통 자료 <span>{resourceCount}개</span></summary>
      <div className="product-common-resources-body">{commonResources}</div>
    </details>}
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}
