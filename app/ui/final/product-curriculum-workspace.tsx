"use client";

import Link from "next/link";
import { number as num, safeUrl, text as t, type Row } from "@/lib/platform";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";

import { Video } from "./primitives";
import { LessonText } from "./lesson-text";
import { LessonBodyEditor } from "./lesson-body-editor";
import { lessonBodyHasText } from "@/lib/lesson-body";
import { useUnsavedLearningChanges } from "./use-unsaved-learning-changes";
import { CurriculumCopyPanel } from "./curriculum-copy-panel";
import { LessonCurriculumImport } from "./lesson-curriculum-import";
import { ProductMissionWorkspace } from "./product-mission-workspace";

import { ChevronRight, Plus, BookOpen } from 'lucide-react';
import { CurriculumLessonPane } from './curriculum-lesson-pane';
import type { LearningEditorSession } from './learning-editor';
export type CurriculumNavigation = { leave: (next: () => void) => void };
type StudioOptions = { actorId: string; initialLessonId?: string; onLessonChange: (id: string) => void; navigationRef: Ref<CurriculumNavigation>; blockEditingEnabled?: boolean };

type ContentType = "text" | "vod" | "material" | "link";

function message(error: unknown) {
  return error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.";
}

function lessonVisibility(lesson: Row, week?: Row) {
  if (!lesson.is_published) return "비공개";
  return week?.is_published ? "공개" : "주차 비공개로 숨김";
}

function WeekSettings({ week, disabled, send, onSaved, onDirty }: {
  onDirty?: (id: string, dirty: boolean) => void;
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
  useEffect(() => { onDirty?.(String(week.id), changed); return () => onDirty?.(String(week.id), false); }, [changed, onDirty, week.id]);
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

export function ProductCurriculumWorkspace({ course, pending, send, commonResources, resourceCount = 0, active: isActive = true, productDirty = false, studio }: {
  studio?: StudioOptions;
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
  const archivedWeeks = (curriculum.curriculum_weeks || [])
    .filter((week) => week.course_id === course?.id && Boolean(week.archived_at))
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const weekIds = new Set(weeks.map((week) => String(week.id)));
  const lessons = (curriculum.curriculum_lessons || [])
    .filter((lesson) => weekIds.has(String(lesson.week_id)) && !lesson.archived_at)
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
  const archivedLessons = (curriculum.curriculum_lessons || [])
    .filter((lesson) => Boolean(lesson.archived_at))
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
  const publishedWeeks = weeks.filter(week => week.is_published === true);
  const publishedWeekIds = new Set(publishedWeeks.map(week => String(week.id)));
  const publishedLessons = lessons.filter(lesson => lesson.is_published === true && publishedWeekIds.has(String(lesson.week_id)));
  const [outlineSearch, setOutlineSearch] = useState("");
  const [weekTitle, setWeekTitle] = useState("");
  const weekCreation = useRef<{ title: string; requestId: string } | null>(null);
  const [weekId, setWeekId] = useState("");
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonId, setLessonId] = useState(studio?.initialLessonId || "");
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

  const editorSession = useRef<LearningEditorSession>(null);
  const weekDrafts = useRef(new Set<string>());
  const trackWeekDraft = useCallback((id: string, dirty: boolean) => { if (dirty) weekDrafts.current.add(id); else weekDrafts.current.delete(id); }, []);
  const [nextNavigation, setNextNavigation] = useState<{ run: () => void } | null>(null);
  const [switching, setSwitching] = useState(false);
  const navigationDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (nextNavigation) navigationDialog.current?.showModal(); else navigationDialog.current?.close(); }, [nextNavigation]);
  function requestNavigation(next: () => void, keepDrafts = false) {
    if (saving || editorSession.current?.busy) { setError("불러오기·저장·파일 업로드가 끝난 뒤 이동해 주세요."); return; }
    if (weekDrafts.current.size) { setError("변경한 주차 설정을 먼저 저장해 주세요."); openWeekSettings([...weekDrafts.current][0]); return; }
    if (editorSession.current?.dirty) { setNextNavigation({ run: next }); return; }
    if (!keepDrafts && (weekTitle.trim() || lessonTitle.trim()) && !window.confirm("입력 중인 새 주차·수업 제목이 있습니다. 추가하지 않고 이동할까요?")) return;
    next();
  }
  useImperativeHandle(studio?.navigationRef, () => ({ leave: requestNavigation }));
  useEffect(() => { if (studio && lessonId) studio.onLessonChange(lessonId); }, [studio, lessonId]);
  const contentDraft = JSON.stringify([contentType, contentValue, resourceName]);
  const contentDirty = !studio && Boolean(lessonId) && contentDraft !== savedContentDraft;
  useUnsavedLearningChanges(contentDirty || Boolean(weekTitle.trim()) || Boolean(lessonTitle.trim()));
  function selectLesson(lesson: Row) {
    if (studio) { requestNavigation(() => { setLessonId(String(lesson.id)); setError(""); }); return; }
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
      if (weekCreation.current?.title !== title) weekCreation.current = { title, requestId: crypto.randomUUID() };
      const result = await send({ action: "create-curriculum-week", courseId: course.id, title, requestId: weekCreation.current.requestId }, "상품에 주차를 추가했습니다.");
      const created = result.row as Row | undefined;
      if (created?.id) setWeekId(String(created.id));
      weekCreation.current = null;
      setWeekTitle("");
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  function createLesson() { if (studio) requestNavigation(() => { void createLessonNow(); }, true); else void createLessonNow(); }
  async function createLessonNow() {
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
    const value = contentType === "text" && !lessonBodyHasText(contentValue) ? "" : contentValue.trim();
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

  function clearLessonSelection() {
    setLessonId("");
    setContentType("text");
    setContentValue("");
    setResourceName("");
    setSavedContentDraft("");
    setPreviewOpen(false);
    setUploadStatus("idle");
  }

  function archiveCurriculum(kind: "week" | "lesson", row: Row, archived: boolean) { if (studio) requestNavigation(() => { void setCurriculumArchived(kind, row, archived); }); else void setCurriculumArchived(kind, row, archived); }
  async function setCurriculumArchived(kind: "week" | "lesson", row: Row, archived: boolean) {
    if (!course?.id || saving) return;
    const affectedWeek = kind === "week" ? String(row.id) : String(row.week_id);
    const selectedIsAffected = Boolean(lessonId) && (kind === "week"
      ? String(selectedLesson?.week_id) === affectedWeek
      : String(selectedLesson?.id) === String(row.id));
    if (archived && selectedIsAffected && contentDirty && !window.confirm("저장하지 않은 학습 내용이 있습니다. 목록에서 삭제하면 이 변경사항은 버려집니다. 계속할까요?")) return;
    const label = kind === "week" ? `${num(row, "week_number")}주차 · ${t(row, "title")}` : `Day ${num(row, "day_number")} · ${t(row, "title")}`;
    if (archived && !window.confirm(`「${label}」을 현재 커리큘럼 목록에서 삭제할까요? 학습 진도·미션 제출 기록·자료는 지우지 않고 보관하며, 삭제한 항목에서 복구할 수 있습니다.${kind === "week" ? " 주차 안의 학습도 함께 숨겨집니다." : ""}`)) return;
    const numberInUse = kind === "week" && !archived && weeks.some(week => String(week.id) !== String(row.id) && num(week, "week_number") === num(row, "week_number"));
    const reassignOnConflict = Boolean(numberInUse && window.confirm(`복구하려는 ${num(row, "week_number")}주차 번호는 이미 사용 중입니다. 다른 빈 주차 번호로 옮겨 복구할까요? 학습 기록과 연결은 그대로 유지됩니다.`));
    if (numberInUse && !reassignOnConflict) return;
    setBusy(true);
    setError("");
    try {
      const request = (reassign: boolean) => send(
        { action: "set-curriculum-archive", courseId: course.id, kind, id: row.id, archived, reassignOnConflict: reassign },
        archived ? "커리큘럼 목록에서 삭제했습니다. 기록은 보관되었습니다." : reassign ? "빈 주차 번호로 옮겨 복구했습니다. 학습 기록 연결은 유지됩니다." : "커리큘럼 항목을 복구했습니다. 비공개 상태로 복구됩니다."
      );
      try {
        await request(reassignOnConflict);
      } catch (cause) {
        const racedRestore = kind === "week" && !archived && !reassignOnConflict && cause instanceof Error && cause.message.includes("주차 번호가 이미 사용 중입니다");
        if (!racedRestore) throw cause;
        const confirmed = window.confirm(`복구 중 ${num(row, "week_number")}주차 번호가 다른 주차에 배정되었습니다. 다른 빈 주차 번호로 옮겨 복구할까요? 학습 기록과 연결은 그대로 유지됩니다.`);
        if (!confirmed) { setError("복구를 취소했습니다. 기존 주차와 학습 기록은 보관 상태로 유지됩니다."); return; }
        await request(true);
      }
      if (archived && selectedIsAffected) clearLessonSelection();
      setLoading(true);
      setReadVersion((version) => version + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!course?.id) return <div className="section-pad"><p className="notice">상품을 먼저 저장하면 같은 화면에서 주차·일차·콘텐츠를 등록할 수 있습니다.</p></div>;

  return <div className={"section-pad product-curriculum-workspace" + (studio ? " curriculum-workspace--direct" : "")}>
    {!studio && <><h2>상품별 커리큘럼</h2><Link className="btn primary" href={`/admin/learning?course=${encodeURIComponent(String(course.id))}`}>커리큘럼 편집 바로 열기</Link></>}
    <p hidden={Boolean(studio)} className="meta">학습 편집을 선택해 본문·영상·자료와 미션을 함께 관리합니다. 같은 상품의 모든 기수가 이 커리큘럼을 함께 사용합니다.</p>
    <section hidden={Boolean(studio)} className="product-curriculum-guide" aria-label="학습 공개 상태">
      <div className="curriculum-readiness"><h3>학습 공개 상태</h3>{!loading && !readError && <span role="status">공개 주차 <b>{publishedWeeks.length}개</b> · 공개 학습 <b>{publishedLessons.length}개</b></span>}</div>
      <p>{loading || readError ? "커리큘럼을 정상적으로 불러온 뒤 준비 상태를 확인할 수 있습니다." : publishedWeeks.length && publishedLessons.length ? "공개된 학습이 있습니다. 수강생에게 제공할 내용을 확인해 주세요." : "아직 수강생에게 공개되는 학습이 없습니다. 수업 준비가 끝나면 주차와 일차를 각각 공개해 주세요."}</p>
      <p>커리큘럼이 비공개여도 상품 모집과 결제를 진행할 수 있습니다. 판매 설정은 기본·판매 탭에서 확인하세요.</p>
      <details><summary>공개 범위와 등록 방법</summary><p>주차를 추가하고 학습 내용을 저장한 다음, 주차 공개와 일차 공개를 각각 저장합니다. 상세페이지에 적은 목차는 이 설정에 반영되지 않습니다.</p><p>공개한 제목은 상품 목차에 표시됩니다. 학습 내용은 기존 수강 권한에 따라 열리며, 공개 체크가 무료 미리보기 허용을 뜻하지는 않습니다.</p><p>가격과 모집·교육 일정은 기수·회차 탭에서 관리합니다. 같은 상품의 기수는 커리큘럼을 공유합니다.</p></details>
    </section>
    <details className="curriculum-copy-disclosure"><summary>기존 커리큘럼 불러오기</summary><CurriculumCopyPanel targetId={String(course.id)} eligible={t(course, "status") === "draft" && !(curriculum.curriculum_weeks || []).length && resourceCount === 0} disabled={saving} dirty={productDirty || Boolean(weekTitle.trim()) || Boolean(lessonTitle.trim())} onCopied={() => { setLoading(true); setReadVersion(version => version + 1); }} /></details>
    {process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <details><summary>외부 커리큘럼 가져오기</summary><LessonCurriculumImport key={String(course.id)} courseId={String(course.id)} disabled={saving || productDirty || contentDirty || Boolean(weekTitle.trim()) || Boolean(lessonTitle.trim())} onImported={() => { setLoading(true); setReadVersion(version => version + 1); }} /></details>}
    {loading && <p className="meta" role="status">상품 커리큘럼을 불러오는 중입니다.</p>}
    {readError && <p className="notice warning" role="alert">{readError} <button className="btn small" type="button" onClick={() => { setLoading(true); setReadVersion((version) => version + 1); }}>다시 시도</button></p>}
    <div className="curriculum-studio">
    <div className="curriculum-outline" aria-label="커리큘럼 목차">
    {studio && <label className="studio-outline-search">수업 찾기<input type="search" value={outlineSearch} onChange={event => setOutlineSearch(event.target.value)} placeholder="주차 또는 수업 제목" /></label>}
    <details className="studio-add-week" open={!studio || undefined}><summary><Plus size={18} /> 주차 추가</summary><div className="product-curriculum-create">
      <label>새 주차 제목<input value={weekTitle} maxLength={300} onChange={(event) => setWeekTitle(event.target.value)} placeholder="예: 시작하기" disabled={saving} /></label>
      <button className="btn" type="button" onClick={() => void createWeek()} disabled={saving || !weekTitle.trim()}>주차 추가</button>
    </div>
    <p className="meta">새 주차는 1주차부터 가장 낮은 빈 번호로 추가됩니다. 삭제한 주차를 되살리려면 아래 ‘삭제한 주차·학습 보기’에서 복구해 주세요.</p></details>
    {!weeks.length && <p className="notice">먼저 주차를 추가해 주세요.</p>}
    {weeks.map((week) => <section hidden={Boolean(studio && outlineSearch.trim() && !t(week, "title").includes(outlineSearch.trim()) && !lessons.some(lesson => lesson.week_id === week.id && t(lesson, "title").includes(outlineSearch.trim())))} key={week.id} className="product-curriculum-week" aria-label={`${num(week, "week_number")}주차 ${t(week, "title")}`}>
      <details open={!studio || Boolean(outlineSearch.trim()) || week.id === selectedLesson?.week_id || undefined} className="studio-week-disclosure"><summary>{studio && <span className="studio-chevron"><ChevronRight size={20} aria-hidden="true" /></span>}<span className="studio-week-title"><h3>{num(week, "week_number")}주차 · {t(week, "title")}</h3><span className="meta">{lessons.filter(l=>l.week_id===week.id).length}개 학습</span></span><span className={"studio-visibility " + (week.is_published ? "is-public" : "")}>{week.is_published ? "공개" : "비공개"}</span></summary>
      <div className="product-curriculum-week-actions"><button className="btn small danger" type="button" onClick={() => archiveCurriculum("week", week, true)} disabled={saving}>주차 삭제</button></div>
      <details className="curriculum-week-settings" ref={element => { if (element) weekSettingsRefs.current.set(String(week.id), element); else weekSettingsRefs.current.delete(String(week.id)); }}><summary>주차 설정</summary><WeekSettings key={`${week.id}:${week.updated_at}`} week={week} disabled={saving} send={send} onDirty={studio ? trackWeekDraft : undefined} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} /></details>
      {lessons.filter((lesson) => lesson.week_id === week.id).length ? <ul>{lessons.filter((lesson) => lesson.week_id === week.id).map((lesson) => <li key={lesson.id} className={lesson.id === lessonId ? "selected" : ""}><div>{studio ? <button type="button" className="studio-lesson-link" aria-current={lesson.id === lessonId ? "page" : undefined} onClick={() => selectLesson(lesson)} disabled={saving}><BookOpen size={17} aria-hidden="true" /><span><small>{num(lesson, "day_number")}일차</small><b>{t(lesson, "title")}</b></span></button> : <span>Day {num(lesson, "day_number")} · {t(lesson, "title")}</span>}<small>{({text:"텍스트",vod:"영상",material:"자료",link:"외부 링크"} as Record<string,string>)[t(lesson,"content_type")] || "학습"} · {(lesson.has_blocks || (curriculum.lesson_contents || []).some(c=>c.lesson_id===lesson.id)) ? "내용 등록됨" : "내용 없음"} · {lessonVisibility(lesson, week)}</small></div><div className="row"><button hidden={Boolean(studio)} className="btn small" type="button" aria-pressed={lesson.id===lessonId} onClick={() => selectLesson(lesson)} disabled={saving}>학습 편집</button><button className="btn small danger" type="button" aria-label={`${t(lesson, "title")} 삭제`} onClick={() => archiveCurriculum("lesson", lesson, true)} disabled={saving}>삭제</button></div></li>)}</ul> : <p className="meta">등록된 학습이 없습니다.</p>}
      <button className="btn small curriculum-add-lesson" type="button" disabled={saving} onClick={()=>{setWeekId(String(week.id));setAddingTo(String(week.id));}}>＋ 학습 추가</button>
      {addingTo === week.id && <div className="product-curriculum-create"><label>새 일차 제목<input autoFocus value={lessonTitle} maxLength={300} onChange={event=>setLessonTitle(event.target.value)} disabled={saving}/></label><button type="button" className="btn" disabled={saving || !lessonTitle.trim()} onClick={()=>void createLesson()}>일차 추가</button></div>}
      </details>
    </section>)}
    {(studio || archivedWeeks.length > 0 || archivedLessons.length > 0) && <details className="curriculum-archive">
      <summary>{studio && <span className="studio-chevron"><ChevronRight size={20} aria-hidden="true" /></span>}삭제한 주차·학습 보기 ({archivedWeeks.length + archivedLessons.length})</summary>
      {!archivedWeeks.length && !archivedLessons.length && <p className="meta">삭제한 항목이 없습니다.</p>}
      <p className="meta">삭제한 항목과 연결된 학습 기록·제출물·자료는 보관되어 있습니다. 복구된 항목은 비공개 상태로 돌아옵니다.</p>
      <ul>
        {archivedWeeks.map(week => <li key={`week-${week.id}`}>
          <span>{num(week, "week_number")}주차 · {t(week, "title")} <small>주차</small></span>
          <button className="btn small" type="button" onClick={() => archiveCurriculum("week", week, false)} disabled={saving}>주차 복구</button>
        </li>)}
        {archivedLessons.map(lesson => {
          const parent = (curriculum.curriculum_weeks || []).find(week => String(week.id) === String(lesson.week_id));
          const parentArchived = Boolean(parent?.archived_at);
          return <li key={`lesson-${lesson.id}`}>
            <span>{parent ? `${num(parent, "week_number")}주차 · ` : ""}Day {num(lesson, "day_number")} · {t(lesson, "title")} <small>{parentArchived ? "상위 주차를 먼저 복구하세요" : "학습"}</small></span>
            <button className="btn small" type="button" onClick={() => archiveCurriculum("lesson", lesson, false)} disabled={saving || parentArchived}>학습 복구</button>
          </li>;
        })}
      </ul>
    </details>}
    </div>
    <div className="curriculum-editor-column">
    {!selectedLesson && <div className="curriculum-editor-empty"><h3>편집할 학습을 선택해 주세요</h3><p>목차에서 수업 제목을 누르면 바로 내용을 작성할 수 있습니다.</p></div>}
    {studio && selectedLesson && course && <CurriculumLessonPane key={String(selectedLesson.id)} lesson={selectedLesson} course={course} curriculum={curriculum} pending={pending} send={send} actorId={studio.actorId} sessionRef={editorSession} blockEditingEnabled={studio.blockEditingEnabled} onSaved={() => { setReadVersion(version => version + 1); }} />}
    {!studio && selectedLesson && <section ref={contentEditorRef} tabIndex={-1} className="product-curriculum-content" aria-label="일차별 콘텐츠 편집">
      <header className="curriculum-editor-heading"><div><p className="meta">{num(weeks.find(w=>w.id===selectedLesson.week_id), "week_number")}주차 · 선택한 학습</p><h3>Day {num(selectedLesson, "day_number")} · {t(selectedLesson, "title")}</h3></div><button className="btn small" type="button" hidden={Boolean(selectedLesson.has_blocks)} aria-expanded={previewOpen} onClick={()=>setPreviewOpen(value=>!value)}>{previewOpen ? "미리보기 닫기" : "학습 내용 미리보기"}</button></header>
      {previewOpen && !selectedLesson.has_blocks && <div className="curriculum-lesson-preview" role="region" aria-label="학습 내용 미리보기"><p className="meta">현재 편집 내용의 미리보기입니다. 저장·공개·수강 권한은 변경되지 않습니다.</p>{contentType === "text" ? <div className="reading-copy"><LessonText text={contentValue || "아직 작성한 내용이 없습니다."} /></div> : contentType === "vod" && safeUrl(contentValue) ? <Video url={contentValue}/> : <p>{contentType === "material" ? resourceName || "학습 자료" : contentValue}</p>}</div>}
      <div className="notice" aria-label="저장된 학습 공개 상태">
        <p><b>{lessonVisibility(selectedLesson, weeks.find(week => week.id === selectedLesson.week_id))}</b> · 저장된 설정 기준</p>
        {!weeks.find(week => week.id === selectedLesson.week_id)?.is_published && <><p>상위 주차가 비공개입니다. 일차 공개를 저장해도 수강생에게 보이지 않습니다. 주차를 공개하면 그 안의 공개된 학습도 함께 표시되므로 먼저 확인해 주세요.</p><button type="button" className="btn small" onClick={() => openWeekSettings(String(selectedLesson.week_id))}>이 학습의 주차 설정</button></>}
      </div>
      {openedLessons.map(id => { const draftLesson = lessons.find(item=>item.id===id); return draftLesson && <div key={id} hidden={lessonId!==id}><LessonSettings key={`${draftLesson.id}:${draftLesson.updated_at}`} lesson={draftLesson} hasContent={Boolean(draftLesson.has_blocks) || (curriculum.lesson_contents || []).some(item=>item.lesson_id===id)} disabled={saving} send={send} onSaved={() => { setLoading(true); setReadVersion((version) => version + 1); }} /></div>; })}
      {selectedLesson.has_blocks ? <p className="notice">글·질문·도구가 등록된 학습입니다. <Link className="btn" href={`/admin/learning-editor?id=${encodeURIComponent(lessonId)}`}>학습 구성 편집·미리보기</Link></p> : <>
      <label>콘텐츠 유형<select value={contentType} onChange={(event) => { setContentType(event.target.value as ContentType); setContentValue(""); setUploadStatus("idle"); }} disabled={saving}><option value="text">텍스트</option><option value="vod">영상 URL</option><option value="material">자료 파일</option><option value="link">외부 링크</option></select></label>
      {contentType === "text" ? <LessonBodyEditor key={lessonId} label="학습 본문" value={contentValue} onChange={setContentValue} disabled={saving} /> : contentType === "material" ? <><label>자료 이름<input value={resourceName} onChange={(event) => setResourceName(event.target.value)} disabled={saving} /></label><UploadField key={lessonId} name="curriculum_resource" value={contentValue} image={false} disabled={saving} onChange={setContentValue} onStatusChange={setUploadStatus} /></> : <label>{contentType === "vod" ? "영상 URL" : "외부 링크"}<input type="url" value={contentValue} onChange={(event) => setContentValue(event.target.value)} placeholder="https://" disabled={saving} /></label>}
      {contentType === "text" && <p className="meta">링크는 [보여줄 글자](https://주소) 또는 https://주소로 입력하세요.</p>}
      <button className="btn primary" type="button" onClick={() => void saveContent()} disabled={saving || !contentValue.trim() || !contentDirty}>콘텐츠 저장</button>
      <p className="meta" role="status">{contentDirty ? "콘텐츠에 저장하지 않은 변경이 있습니다." : "콘텐츠 변경사항이 없습니다."}</p>
      </>}
    </section>}
    {!studio && openedLessons.map(id => <div key={id} hidden={lessonId !== id}>
      <ProductMissionWorkspace course={course} pending={pending} send={send} lessonScope={id} />
    </div>)}
    </div></div>
    {commonResources && <details className="product-common-resources">
      <summary>과정 공통 자료 <span>{resourceCount}개</span></summary>
      <div className="product-common-resources-body">{commonResources}</div>
    </details>}
    {error && <p className="notice warning" role="alert">{error}</p>}
    {studio && <dialog ref={navigationDialog} className="studio-navigation-dialog" aria-labelledby="studio-navigation-title" onCancel={event => { event.preventDefault(); if (!switching) setNextNavigation(null); }}>
      <h2 id="studio-navigation-title">작성한 내용을 저장할까요?</h2><p>저장한 뒤 다른 수업이나 상품으로 이동합니다. 공개 범위는 현재 수업 설정을 따릅니다.</p>
      <div><button type="button" className="btn" disabled={switching} onClick={() => setNextNavigation(null)}>계속 작성</button><button type="button" className="btn primary" disabled={switching} onClick={async () => { setSwitching(true); const saved = await editorSession.current?.save(); setSwitching(false); if (saved) { const next = nextNavigation; setNextNavigation(null); next?.run(); } else { setNextNavigation(null); setError("저장하지 못해 현재 수업을 유지했습니다. 편집기의 안내를 확인해 주세요."); } }}>{switching ? "저장 중…" : "저장하고 이동"}</button></div>
    </dialog>}
  </div>;
}
