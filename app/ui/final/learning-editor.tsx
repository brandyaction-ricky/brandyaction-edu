"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, Plus, Video as VideoIcon, X } from "lucide-react";
import { number as num, safeUrl, text as t, type Row } from "@/lib/platform";
import { validateQuiz, type QuizDefinition, type QuizQuestion } from "@/lib/mission-quiz";
import { UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";
import { AdminHeading } from "./admin-shell";
import { AdminButton, AdminEmptyState, AdminFormField, AdminLinkButton, AdminStatusBadge } from "@/features/admin-ui";
import { Badge, Video } from "./primitives";
import { LessonText } from "./lesson-text";
import { LessonBodyEditor } from "./lesson-body-editor";
import { lessonBodyHasText } from "@/lib/lesson-body";
import { OngoingLessonSettings } from './ongoing-lesson-settings';
import { LessonBlockAuthor, type BlockAuthorHandle, type BlockAuthorState } from './lesson-block-author';
import type { LessonBlock } from '@/lib/lesson-blocks';
import type { LearningEditorDraft, LearningFormDraft } from '@/lib/learning-editor-draft';
import { LearningEditorDraftPanel, type LearningDraftHandle } from './learning-editor-draft';

type Props = { data: Data; row?: Row; pending: boolean; send: WorkflowSend; back: () => void; blockEditingEnabled?: boolean; actorId?: string };
type ContentType = "text" | "vod" | "material" | "link";
const formats: { key: ContentType; label: string; icon: typeof FileText }[] = [
  { key: "text", label: "학습 본문", icon: FileText },
  { key: "vod", label: "영상", icon: VideoIcon },
  { key: "material", label: "자료", icon: Download },
  { key: "link", label: "외부 링크", icon: ExternalLink },
];

function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <AdminFormField className={"field" + (wide ? " wide" : "")} label={label} helper={hint}>{children}</AdminFormField>;
}

function LessonQuiz({ mission, current, pending, send }: { mission: Row; current?: Row; pending: boolean; send: WorkflowSend }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => (current?.questions as QuizQuestion[]) || []);
  const pass = Number(current?.pass_percent || 100);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  function update(index: number, patch: Partial<QuizQuestion>) {
    setDirty(true);
    setQuestions(previous => previous.map((question, i) => i === index ? { ...question, ...patch } : question));
  }
  function addQuestion() {
    setDirty(true);
    setQuestions(previous => [...previous, { id: crypto.randomUUID(), prompt: "", options: ["", "", "", ""], correctIndex: 0 }]);
  }
  function removeOption(question: QuizQuestion, index: number, optionIndex: number) {
    update(index, {
      options: question.options.filter((_, i) => i !== optionIndex),
      correctIndex: question.correctIndex === optionIndex ? -1 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex,
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quiz: QuizDefinition | null = questions.length ? { questions, passPercent: pass } : null;
    const invalid = quiz && validateQuiz(quiz);
    if (invalid) { setMessage(invalid); return; }
    setSaving(true);
    try {
      await send({ action: "quiz", workflow: true, missionId: mission.id, revision: current?.revision || null, quiz }, "퀴즈를 저장했습니다.");
      setDirty(false);
      setMessage(quiz ? "퀴즈를 저장했습니다." : "퀴즈를 해제했습니다.");
    } catch (cause) { setMessage((cause as Error).message); }
    finally { setSaving(false); }
  }
  return <form onSubmit={event => void save(event)}>
    <div className="panel-head learning-quiz-head"><div><h2>확인 퀴즈 <span className="muted">{questions.length}문항</span></h2><p>선택지 앞 원을 눌러 정답을 지정합니다.</p></div><button type="button" className="btn small" onClick={addQuestion} disabled={pending || saving || questions.length >= 20}><Plus size={16} />문제 추가</button></div>
    <fieldset className="section-pad learning-editor-fields" disabled={pending || saving}>
      {questions.length ? questions.map((question, index) => <article className="question-editor" key={question.id}>
        <div className="question-title-row"><span>{index + 1}.</span><input type="text" aria-label={`${index + 1}번 문제`} value={question.prompt} placeholder="문제를 입력해 주세요" maxLength={1000} required onChange={event => update(index, { prompt: event.target.value })} /><button type="button" className="btn iconbtn ghost danger" aria-label={`${index + 1}번 문제 삭제`} onClick={() => { setQuestions(previous => previous.filter((_, i) => i !== index)); setDirty(true); }}><X size={16} /></button></div>
        {question.options.map((choice, optionIndex) => <div className={"option-row" + (question.correctIndex === optionIndex ? " correct" : "")} key={optionIndex}>
          <input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === optionIndex} aria-label={`${index + 1}번 문제 ${String.fromCharCode(65 + optionIndex)} 정답 선택`} onChange={() => update(index, { correctIndex: optionIndex })} />
          <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><input type="text" aria-label={`${index + 1}번 문제 선택지 ${String.fromCharCode(65 + optionIndex)}`} value={choice} placeholder="선택지 입력" maxLength={500} required onChange={event => update(index, { options: question.options.map((option, i) => i === optionIndex ? event.target.value : option) })} />
          <button type="button" className="btn iconbtn ghost small" aria-label={`${index + 1}번 문제 선택지 ${String.fromCharCode(65 + optionIndex)} 삭제`} disabled={question.options.length <= 2} onClick={() => removeOption(question, index, optionIndex)}><X size={14} /></button>
        </div>)}
        <div className="q-actions"><button type="button" className="btn small ghost" disabled={question.options.length >= 6} onClick={() => update(index, { options: [...question.options, ""] })}>+ 선택지 추가</button><span className="meta">정답: {question.correctIndex < 0 ? "미지정" : String.fromCharCode(65 + question.correctIndex)}</span></div>
      </article>) : <AdminEmptyState title="퀴즈가 아직 없습니다.">문제 추가로 첫 번째 확인 퀴즈를 작성해 주세요.</AdminEmptyState>}
      <div className="learning-section-actions"><span className="meta">{dirty ? "저장하지 않은 퀴즈 변경사항이 있습니다." : "정답은 관리자와 채점 서버에만 공개됩니다."}</span><button className="btn primary" disabled={!dirty || pending || saving}>{saving ? "저장 중…" : questions.length ? "퀴즈 저장" : "퀴즈 해제"}</button></div>
      {message && <p className="notice mt16" role="status">{message}</p>}
    </fieldset>
  </form>;
}

export function LearningEditor({ data, row, pending, send, back, actorId, blockEditingEnabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' }: Props) {
  const content = (data.lesson_contents || []).find(item => item.lesson_id === row?.id);
  const [lessonId, setLessonId] = useState(row?.id || "");
  const [contentExists, setContentExists] = useState(Boolean(content));
  const [basic, setBasic] = useState({
    week_id: t(row, "week_id"), day_number: String(num(row, "day_number") || 1), title: t(row, "title"),
    description: t(row, "description"), duration_label: t(row, "duration_label"),
    is_published: Boolean(row?.is_published), is_preview: Boolean(row?.is_preview),
  });
  const [format, setFormat] = useState<ContentType>((t(row, "content_type") || "text") as ContentType);
  const [bodyText, setBodyText] = useState(t(content, "body_text"));
  const [videoUrl, setVideoUrl] = useState(t(content, "vod_url"));
  const [externalUrl, setExternalUrl] = useState(t(content, "external_url"));
  const [resourceName, setResourceName] = useState(t(content, "resource_name"));
  const [resourcePath, setResourcePath] = useState(t(content, "resource_storage_path"));
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState("");
  const previewRef = useRef<HTMLElement>(null);
  const blockRef = useRef<BlockAuthorHandle>(null);
  const blockSectionRef = useRef<HTMLElement>(null);
  const [blockState, setBlockState] = useState<BlockAuthorState>({ active: false, dirty: false, blocked: blockEditingEnabled });
  const draftRef = useRef<LearningDraftHandle>(null), [draftPending, setDraftPending] = useState(Boolean(blockEditingEnabled && actorId));
  const baseline = useRef<LearningFormDraft>({ basic: { ...basic }, format, bodyText, videoUrl, externalUrl, resourceName, resourcePath });
  function captureDraft(): LearningEditorDraft {
    if (!blockRef.current || !actorId) throw new Error('학습 구성과 계정을 확인한 뒤 다시 시도해 주세요.');
    return structuredClone({ version: 1, actorId, scopeLessonId: row?.id || '', storedLessonId: lessonId, savedAt: new Date().toISOString(), base: baseline.current,
      form: { basic, format, bodyText, videoUrl, externalUrl, resourceName, resourcePath }, blocks: blockRef.current.captureDraft() });
  }
  function restoreDraft(draft: LearningEditorDraft) {
    if (!blockRef.current) throw new Error('학습 구성을 불러온 뒤 다시 시도해 주세요.');
    if (JSON.stringify(baseline.current) !== JSON.stringify(draft.base) && JSON.stringify(baseline.current) !== JSON.stringify(draft.form)) throw new Error('서버의 기본 정보나 본문이 변경됐습니다. 임시저장본을 내려받아 비교해 주세요.');
    blockRef.current.restoreDraft(draft.blocks);
    setBasic({ ...draft.form.basic }); setFormat(draft.form.format); setBodyText(draft.form.bodyText); setVideoUrl(draft.form.videoUrl); setExternalUrl(draft.form.externalUrl); setResourceName(draft.form.resourceName); setResourcePath(draft.form.resourcePath);
    setDirty(true); setPreviewOnly(false); setMessage('임시저장본을 불러왔습니다. 내용을 확인한 뒤 학습 저장을 눌러 주세요.');
  }
  const week = (data.curriculum_weeks || []).find(item => item.id === basic.week_id);
  const course = (data.courses || []).find(item => item.id === week?.course_id);
  const missions = (data.curriculum_missions || []).filter(item => item.lesson_id === lessonId);
  const mission = missions.find(item => item.id === selectedMissionId) || missions[0];
  const quiz = (data.mission_quizzes || []).find(item => item.mission_id === mission?.id);
  const busy = pending || saving || uploadStatus === "uploading" || Boolean(blockState.uploading);
  const saveBlocked = busy || draftPending || (blockEditingEnabled && blockState.blocked);
  const legacyBlocks: LessonBlock[] = format === 'text' && bodyText ? [{ id: 'legacy-body', type: 'text', content: bodyText }]
    : format === 'vod' && videoUrl ? [{ id: 'legacy-video', type: 'video', url: videoUrl }]
    : format === 'link' && externalUrl ? [{ id: 'legacy-link', type: 'link', url: externalUrl, content: '외부 학습 열기' }] : [];
  function changeBasic<K extends keyof typeof basic>(key: K, value: typeof basic[K]) { setBasic(previous => ({ ...previous, [key]: value })); setDirty(true); }
  function changeFormat(value: ContentType) { setFormat(value); setUploadStatus("idle"); setDirty(true); }
  function close() { if (!(dirty || blockState.dirty) || window.confirm("저장하지 않은 학습 변경사항이 있습니다. 목록으로 이동할까요?")) { draftRef.current?.saveNow(); back(); } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || saving || draftPending || (blockEditingEnabled && blockState.blocked)) return;
    if (blockState.active && !blockRef.current?.validate()) { setPreviewOnly(false); blockSectionRef.current?.scrollIntoView({ block: 'start' }); return; }
    if (format === "material" && uploadStatus !== "idle") {
      setPreviewOnly(false);
      setMessage(uploadStatus === "uploading" ? "자료 업로드가 완료된 뒤 저장해 주세요." : "자료 업로드 오류를 확인한 뒤 다시 저장해 주세요.");
      return;
    }
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setPreviewOnly(false);
      requestAnimationFrame(() => form.reportValidity());
      return;
    }
    const selectedValue = { text: lessonBodyHasText(bodyText) ? bodyText : "", vod: videoUrl, material: resourcePath, link: externalUrl }[format].trim();
    if (!blockState.active && contentExists && !selectedValue) {
      setPreviewOnly(false);
      setMessage("선택한 콘텐츠 유형에 맞는 본문·영상·자료·링크를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    let storedId = lessonId;
    try {
      const result = await send({ action: "save", section: "learning", id: storedId || undefined, values: { ...basic, day_number: Number(basic.day_number), content_type: format } }, "학습 기본 정보를 저장했습니다.");
      storedId ||= String((result.row as Row | undefined)?.id || "");
      if (!storedId) throw new Error("학습 등록 결과를 확인하지 못했습니다. 목록에서 등록 여부를 확인해 주세요.");
      setLessonId(storedId);
      baseline.current = { ...baseline.current, basic: { ...basic }, format };
      if (blockState.active) {
        if (!blockRef.current) throw new Error('학습 구성을 불러온 뒤 저장해 주세요.');
        await blockRef.current.save(storedId);
      } else if (selectedValue) {
        await send({ action: "save", section: "contents", id: contentExists ? storedId : undefined, values: {
          lesson_id: storedId,
          body_text: format === "text" ? bodyText : null,
          vod_url: format === "vod" ? videoUrl : null,
          external_url: format === "link" ? externalUrl : null,
          resource_storage_path: format === "material" ? resourcePath : null,
          resource_name: format === "material" ? resourceName.trim() || resourcePath.split("/").pop() : null,
        } }, "학습 내용을 저장했습니다.");
        setContentExists(true);
      }
      setDirty(false);
      baseline.current = { basic: { ...basic }, format, bodyText, videoUrl, externalUrl, resourceName, resourcePath };
      draftRef.current?.clear();
      setMessage(blockState.active || selectedValue ? "학습 기본 정보와 콘텐츠를 저장했습니다." : "학습 기본 정보를 저장했습니다. 콘텐츠를 이어서 등록해 주세요.");
    } catch (cause) { setMessage((cause as Error).message); }
    finally { setSaving(false); }
  }
  function showPreview() {
    if (blockState.active) { setPreviewOnly(false); blockRef.current?.showPreview(); blockSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    setPreviewOnly(previous => !previous);
    requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  return <div className="learning-editor">
    <AdminHeading title="학습 콘텐츠 편집" eyebrow="LEARNING EDITOR" description={lessonId ? `Day ${basic.day_number} · ${t(week, "week_number") || "—"}주차 / ${basic.title}` : "일차별 학습 본문과 확인 퀴즈를 등록합니다."}>
      <AdminButton variant="outline" type="button" onClick={showPreview}>{previewOnly ? "편집으로" : "학습자 미리보기"}</AdminButton><AdminStatusBadge status={basic.is_published ? "published" : "hidden"} label={basic.is_published ? "공개" : "비공개"} />
    </AdminHeading>
    <div className="ops-callout mb16"><b>{basic.title || "새 학습"}</b> <span className="muted">· 본문과 확인 퀴즈를 함께 편집합니다.</span></div>
    {blockEditingEnabled && actorId && <LearningEditorDraftPanel key={`${actorId}:${row?.id || 'new'}`} actorId={actorId} lessonId={row?.id || ''} dirty={dirty || blockState.dirty} ready={!busy && Boolean(blockState.draftReady)} capture={captureDraft} restore={restoreDraft} handleRef={draftRef} onPending={setDraftPending} />}
    <form id="learning-editor-form" noValidate onSubmit={event => void save(event)}>
      <section className="panel" hidden={previewOnly}>
        <div className="panel-head"><h2>기본 정보</h2><label className="review-switch"><input type="checkbox" checked={basic.is_published} onChange={event => changeBasic("is_published", event.target.checked)} disabled={busy} /> 공개</label></div>
        <fieldset className="section-pad form-grid learning-editor-fields" disabled={busy}>
          <Field label="일차 (Day) *"><input type="number" min={1} value={basic.day_number} required onChange={event => changeBasic("day_number", event.target.value)} /></Field>
          <Field label="주차 (Week) *"><select value={basic.week_id} required onChange={event => changeBasic("week_id", event.target.value)}><option value="">주차 선택</option>{(data.curriculum_weeks || []).map(item => <option key={item.id} value={item.id}>{t((data.courses || []).find(entry => entry.id === item.course_id), "title")} · {num(item, "week_number")}주차 · {t(item, "title")}</option>)}</select></Field>
          <Field label="제목 *" wide><input value={basic.title} maxLength={300} required onChange={event => changeBasic("title", event.target.value)} /></Field>
          {!blockState.active && <Field label="콘텐츠 유형"><select value={format} onChange={event => changeFormat(event.target.value as ContentType)}>{formats.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}</select></Field>}
          <Field label="소요 시간" hint="예: 20분 · 영상 15분 + 실습 10분"><input value={basic.duration_label} onChange={event => changeBasic("duration_label", event.target.value)} /></Field>
          <div className="field wide"><label className="review-switch"><input type="checkbox" checked={basic.is_preview} onChange={event => changeBasic("is_preview", event.target.checked)} /> 무료 미리보기</label></div>
        </fieldset>
      </section>
      {blockEditingEnabled && <section ref={blockSectionRef} className="panel mt24" hidden={previewOnly}><div className="panel-head"><h2>학습 구성</h2></div><div className="section-pad">
        {resourcePath && <p className="notice">등록된 자료 파일은 학습 본문 아래에서 계속 다운로드할 수 있습니다.</p>}
        <LessonBlockAuthor key={row?.id || 'new'} ref={blockRef} lessonId={lessonId} courseId={course?.id} legacyBlocks={legacyBlocks} disabled={busy} onState={setBlockState} />
      </div></section>}
      {blockEditingEnabled && blockState.active && lessonId && <OngoingLessonSettings lessonId={lessonId} disabled={saveBlocked || dirty || blockState.dirty} />}
      {!blockState.active && !(blockEditingEnabled && blockState.blocked) && <section className={"panel" + (previewOnly ? "" : " mt24")}>
        <div className="panel-head"><h2>학습 본문</h2><span className="meta">{t(course, "title") || "학습 콘텐츠와 미리보기"}</span></div>
        <div className={"section-pad lesson-body-grid" + (previewOnly ? " learning-preview-only" : "")}>
          <fieldset className="learning-editor-fields learning-content-fields" disabled={busy} hidden={previewOnly}>
            <Field label="도입 · 학습 안내"><textarea rows={3} value={basic.description} onChange={event => changeBasic("description", event.target.value)} /></Field>
            <div className="learning-content-tabs" role="tablist" aria-label="학습 콘텐츠 유형">{formats.map(item => <button className={format === item.key ? "active" : ""} type="button" role="tab" aria-selected={format === item.key} aria-controls={`lesson-content-${item.key}`} key={item.key} onClick={() => changeFormat(item.key)}><item.icon size={15} />{item.label}</button>)}</div>
            <div id={`lesson-content-${format}`} role="tabpanel" aria-label={formats.find(item => item.key === format)?.label}>
              {format === "text" && <LessonBodyEditor value={bodyText} disabled={busy} onChange={value => { setBodyText(value); setDirty(true); }} />}
              {format === "vod" && <Field label="영상 URL" hint="공유할 YouTube·Vimeo 또는 동영상 주소를 입력해 주세요."><input type="url" value={videoUrl} required={contentExists} onChange={event => { setVideoUrl(event.target.value); setDirty(true); }} placeholder="https://" /></Field>}
              {format === "material" && <><Field label="자료 이름"><input value={resourceName} onChange={event => { setResourceName(event.target.value); setDirty(true); }} placeholder="다운로드 목록에 표시할 이름" /></Field><div className="upload-box learning-material-upload"><Download aria-hidden="true" /><p>PDF · 문서 · 템플릿 자료 추가</p><UploadField name="learning_resource" value={resourcePath} image={false} disabled={busy} onChange={value => { setResourcePath(value); setDirty(true); }} onStatusChange={setUploadStatus} /><p className="meta">등록한 파일은 수강 권한이 있는 회원에게 제공됩니다.</p></div></>}
              {format === "link" && <Field label="외부 학습 링크"><input type="url" value={externalUrl} required={contentExists} onChange={event => { setExternalUrl(event.target.value); setDirty(true); }} placeholder="https://" /></Field>}
            </div>
          </fieldset>
          <aside className="preview-window" ref={previewRef}>
            <div className="preview-window-top"><b>학습자 화면</b><span>본문 미리보기</span></div>
            <div className="safe-html-preview"><div className="learning-preview-badges"><Badge>DAY {basic.day_number}</Badge>{basic.duration_label && <Badge>{basic.duration_label}</Badge>}</div><h2>{basic.title || "학습 제목"}</h2>{basic.description && <p className="intro-preview">{basic.description}</p>}
              {format === "text" && <div className="reading-copy"><LessonText text={bodyText || "학습 내용을 작성하면 이곳에 표시됩니다."} /></div>}
              {format === "vod" && (safeUrl(videoUrl) ? <Video url={videoUrl} /> : <div className="learning-content-placeholder"><VideoIcon /><p>영상 URL을 등록해 주세요.</p></div>)}
              {format === "material" && <div className="learning-resource-preview"><Download size={20} /><div><b>{resourceName || "학습 자료"}</b><p className="meta">{resourcePath ? "자료 파일 등록됨 · 수강 회원에게 제공" : "파일을 등록해 주세요."}</p></div></div>}
              {format === "link" && (safeUrl(externalUrl) ? <a className="btn primary" href={safeUrl(externalUrl)} target="_blank" rel="noreferrer">외부 학습 열기<ExternalLink size={16} /></a> : <div className="learning-content-placeholder"><ExternalLink /><p>외부 학습 주소를 등록해 주세요.</p></div>)}
            </div>
          </aside>
        </div>
      </section>}
      <div className="editor-savebar"><span className="dirty-note">{dirty || blockState.dirty ? "저장하지 않은 변경사항이 있습니다." : "기본 정보와 학습 내용을 함께 저장합니다."}</span><AdminButton variant="outline" type="button" onClick={close} disabled={busy}><ArrowLeft size={16} />목록으로</AdminButton><AdminButton variant="primary" type="submit" disabled={saveBlocked} loading={busy}>{blockState.uploading ? "파일 업로드 중…" : busy ? "저장 중…" : lessonId ? "학습 저장" : "학습 등록"}</AdminButton></div>
      {message && <p className="notice mt16" role="status">{message}</p>}
    </form>
    <section className="panel mt24 learning-quiz-panel" hidden={previewOnly}>
      {missions.length > 1 && <div className="section-pad learning-mission-picker"><Field label="퀴즈를 연결할 미션"><select value={mission?.id || ""} onChange={event => setSelectedMissionId(event.target.value)} disabled={busy}>{missions.map(item => <option key={item.id} value={item.id}>{t(item, "title")}</option>)}</select></Field></div>}
      {mission ? <LessonQuiz key={`${mission.id}-${quiz?.revision || "new"}`} mission={mission} current={quiz} pending={busy} send={send} /> : <><div className="panel-head"><h2>확인 퀴즈</h2><AdminLinkButton size="sm" href="/admin/missions">미션 관리</AdminLinkButton></div><div className="section-pad"><AdminEmptyState title={lessonId ? "연결된 미션이 없습니다." : "학습 등록 후 퀴즈를 연결할 수 있습니다."}>미션 관리에서 이 학습에 미션을 등록한 뒤 질문·선택지·정답을 설정하세요.</AdminEmptyState></div></>}
    </section>
  </div>;
}
