"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileText, Plus, Video as VideoIcon, X } from "lucide-react";
import { number as num, safeUrl, text as t, type Row } from "@/lib/platform";
import { validateQuiz, type QuizDefinition, type QuizQuestion } from "@/lib/mission-quiz";
import { UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";
import { AdminHeading } from "./admin-shell";
import { Badge, Empty, Video } from "./primitives";

type Props = { data: Data; row?: Row; pending: boolean; send: WorkflowSend; back: () => void };
type ContentType = "text" | "vod" | "material" | "link";
const formats: { key: ContentType; label: string; icon: typeof FileText }[] = [
  { key: "text", label: "학습 본문", icon: FileText },
  { key: "vod", label: "영상", icon: VideoIcon },
  { key: "material", label: "자료", icon: Download },
  { key: "link", label: "외부 링크", icon: ExternalLink },
];

function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={"field" + (wide ? " wide" : "")}><span className="field-label">{label}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}

function LessonQuiz({ mission, current, pending, send }: { mission: Row; current?: Row; pending: boolean; send: WorkflowSend }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => (current?.questions as QuizQuestion[]) || []);
  const [pass, setPass] = useState(Number(current?.pass_percent || 100));
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
      <div className="learning-quiz-settings"><div><b>{t(mission, "title")}</b><p className="meta">이 미션의 제출 전에 확인 퀴즈를 통과해야 합니다.</p></div><Field label="통과 기준 · %"><input type="number" min={1} max={100} value={pass} onChange={event => { setPass(Number(event.target.value)); setDirty(true); }} required /></Field></div>
      {questions.length ? questions.map((question, index) => <article className="question-editor" key={question.id}>
        <div className="question-title-row"><span>{index + 1}.</span><input type="text" aria-label={`${index + 1}번 문제`} value={question.prompt} placeholder="문제를 입력해 주세요" maxLength={1000} required onChange={event => update(index, { prompt: event.target.value })} /><button type="button" className="btn iconbtn ghost danger" aria-label={`${index + 1}번 문제 삭제`} onClick={() => { setQuestions(previous => previous.filter((_, i) => i !== index)); setDirty(true); }}><X size={16} /></button></div>
        {question.options.map((choice, optionIndex) => <div className={"option-row" + (question.correctIndex === optionIndex ? " correct" : "")} key={optionIndex}>
          <input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === optionIndex} aria-label={`${index + 1}번 문제 ${String.fromCharCode(65 + optionIndex)} 정답 선택`} onChange={() => update(index, { correctIndex: optionIndex })} />
          <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><input type="text" aria-label={`${index + 1}번 문제 선택지 ${String.fromCharCode(65 + optionIndex)}`} value={choice} placeholder="선택지 입력" maxLength={500} required onChange={event => update(index, { options: question.options.map((option, i) => i === optionIndex ? event.target.value : option) })} />
          <button type="button" className="btn iconbtn ghost small" aria-label={`${index + 1}번 문제 선택지 ${String.fromCharCode(65 + optionIndex)} 삭제`} disabled={question.options.length <= 2} onClick={() => removeOption(question, index, optionIndex)}><X size={14} /></button>
        </div>)}
        <div className="q-actions"><button type="button" className="btn small ghost" disabled={question.options.length >= 6} onClick={() => update(index, { options: [...question.options, ""] })}>+ 선택지 추가</button><span className="meta">정답: {question.correctIndex < 0 ? "미지정" : String.fromCharCode(65 + question.correctIndex)}</span></div>
      </article>) : <Empty title="퀴즈가 아직 없습니다.">문제 추가로 첫 번째 확인 퀴즈를 작성해 주세요.</Empty>}
      <div className="learning-section-actions"><span className="meta">{dirty ? "저장하지 않은 퀴즈 변경사항이 있습니다." : "정답은 관리자와 채점 서버에만 공개됩니다."}</span><button className="btn primary" disabled={!dirty || pending || saving}>{saving ? "저장 중…" : questions.length ? "퀴즈 저장" : "퀴즈 해제"}</button></div>
      {message && <p className="notice mt16" role="status">{message}</p>}
    </fieldset>
  </form>;
}

export function LearningEditor({ data, row, pending, send, back }: Props) {
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
  const week = (data.curriculum_weeks || []).find(item => item.id === basic.week_id);
  const course = (data.courses || []).find(item => item.id === week?.course_id);
  const missions = (data.curriculum_missions || []).filter(item => item.lesson_id === lessonId);
  const mission = missions.find(item => item.id === selectedMissionId) || missions[0];
  const quiz = (data.mission_quizzes || []).find(item => item.mission_id === mission?.id);
  const busy = pending || saving || uploadStatus === "uploading";
  function changeBasic<K extends keyof typeof basic>(key: K, value: typeof basic[K]) { setBasic(previous => ({ ...previous, [key]: value })); setDirty(true); }
  function changeFormat(value: ContentType) { setFormat(value); setUploadStatus("idle"); setDirty(true); }
  function close() { if (!dirty || window.confirm("저장하지 않은 학습 변경사항이 있습니다. 목록으로 이동할까요?")) back(); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const selectedValue = { text: bodyText, vod: videoUrl, material: resourcePath, link: externalUrl }[format].trim();
    if (contentExists && !selectedValue) {
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
      if (selectedValue) {
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
      setMessage(selectedValue ? "학습 기본 정보와 콘텐츠를 저장했습니다." : "학습 기본 정보를 저장했습니다. 콘텐츠를 이어서 등록해 주세요.");
    } catch (cause) { setMessage((cause as Error).message); }
    finally { setSaving(false); }
  }
  function showPreview() {
    setPreviewOnly(previous => !previous);
    requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  return <div className="learning-editor">
    <AdminHeading title="학습 콘텐츠 편집" eyebrow="LEARNING EDITOR" description={lessonId ? `Day ${basic.day_number} · ${t(week, "week_number") || "—"}주차 / ${basic.title}` : "일차별 학습 본문과 확인 퀴즈를 등록합니다."}>
      <button className="btn" type="button" onClick={showPreview}>{previewOnly ? "편집으로" : "학습자 미리보기"}</button><Badge color={basic.is_published ? "green" : ""}>{basic.is_published ? "공개" : "비공개"}</Badge>
    </AdminHeading>
    <div className="ops-callout mb16"><b>{basic.title || "새 학습"}</b> <span className="muted">· 본문과 확인 퀴즈를 함께 편집합니다.</span></div>
    <form id="learning-editor-form" noValidate onSubmit={event => void save(event)}>
      <section className="panel" hidden={previewOnly}>
        <div className="panel-head"><h2>기본 정보</h2><label className="review-switch"><input type="checkbox" checked={basic.is_published} onChange={event => changeBasic("is_published", event.target.checked)} disabled={busy} /> 공개</label></div>
        <fieldset className="section-pad form-grid learning-editor-fields" disabled={busy}>
          <Field label="일차 (Day) *"><input type="number" min={1} value={basic.day_number} required onChange={event => changeBasic("day_number", event.target.value)} /></Field>
          <Field label="주차 (Week) *"><select value={basic.week_id} required onChange={event => changeBasic("week_id", event.target.value)}><option value="">주차 선택</option>{(data.curriculum_weeks || []).map(item => <option key={item.id} value={item.id}>{t((data.courses || []).find(entry => entry.id === item.course_id), "title")} · {num(item, "week_number")}주차 · {t(item, "title")}</option>)}</select></Field>
          <Field label="제목 *" wide><input value={basic.title} maxLength={300} required onChange={event => changeBasic("title", event.target.value)} /></Field>
          <Field label="콘텐츠 유형"><select value={format} onChange={event => changeFormat(event.target.value as ContentType)}>{formats.map(item => <option value={item.key} key={item.key}>{item.label}</option>)}</select></Field>
          <Field label="소요 시간" hint="예: 20분 · 영상 15분 + 실습 10분"><input value={basic.duration_label} onChange={event => changeBasic("duration_label", event.target.value)} /></Field>
          <div className="field wide"><label className="review-switch"><input type="checkbox" checked={basic.is_preview} onChange={event => changeBasic("is_preview", event.target.checked)} /> 무료 미리보기</label></div>
        </fieldset>
      </section>
      <section className={"panel" + (previewOnly ? "" : " mt24")}>
        <div className="panel-head"><h2>학습 본문</h2><span className="meta">{t(course, "title") || "학습 콘텐츠와 미리보기"}</span></div>
        <div className={"section-pad lesson-body-grid" + (previewOnly ? " learning-preview-only" : "")}>
          <fieldset className="learning-editor-fields learning-content-fields" disabled={busy} hidden={previewOnly}>
            <Field label="도입 · 학습 안내"><textarea rows={3} value={basic.description} onChange={event => changeBasic("description", event.target.value)} /></Field>
            <div className="learning-content-tabs" role="tablist" aria-label="학습 콘텐츠 유형">{formats.map(item => <button className={format === item.key ? "active" : ""} type="button" role="tab" aria-selected={format === item.key} aria-controls={`lesson-content-${item.key}`} key={item.key} onClick={() => changeFormat(item.key)}><item.icon size={15} />{item.label}</button>)}</div>
            <div id={`lesson-content-${format}`} role="tabpanel" aria-label={formats.find(item => item.key === format)?.label}>
              {format === "text" && <Field label="학습 내용" hint="줄바꿈을 포함한 본문이 학습자 화면에 표시됩니다."><textarea rows={14} value={bodyText} required={contentExists} onChange={event => { setBodyText(event.target.value); setDirty(true); }} placeholder="학습할 내용을 작성해 주세요." /></Field>}
              {format === "vod" && <Field label="영상 URL" hint="공유할 YouTube·Vimeo 또는 동영상 주소를 입력해 주세요."><input type="url" value={videoUrl} required={contentExists} onChange={event => { setVideoUrl(event.target.value); setDirty(true); }} placeholder="https://" /></Field>}
              {format === "material" && <><Field label="자료 이름"><input value={resourceName} onChange={event => { setResourceName(event.target.value); setDirty(true); }} placeholder="다운로드 목록에 표시할 이름" /></Field><div className="upload-box learning-material-upload"><Download aria-hidden="true" /><p>PDF · 문서 · 템플릿 자료 추가</p><UploadField name="learning_resource" value={resourcePath} image={false} disabled={busy} onChange={value => { setResourcePath(value); setDirty(true); }} onStatusChange={setUploadStatus} /><p className="meta">등록한 파일은 수강 권한이 있는 회원에게 제공됩니다.</p></div></>}
              {format === "link" && <Field label="외부 학습 링크"><input type="url" value={externalUrl} required={contentExists} onChange={event => { setExternalUrl(event.target.value); setDirty(true); }} placeholder="https://" /></Field>}
            </div>
          </fieldset>
          <aside className="preview-window" ref={previewRef}>
            <div className="preview-window-top"><b>학습자 화면</b><span>본문 미리보기</span></div>
            <div className="safe-html-preview"><div className="learning-preview-badges"><Badge>DAY {basic.day_number}</Badge>{basic.duration_label && <Badge>{basic.duration_label}</Badge>}</div><h2>{basic.title || "학습 제목"}</h2>{basic.description && <p className="intro-preview">{basic.description}</p>}
              {format === "text" && <div className="reading-copy">{bodyText || "학습 내용을 작성하면 이곳에 표시됩니다."}</div>}
              {format === "vod" && (safeUrl(videoUrl) ? <Video url={videoUrl} /> : <div className="learning-content-placeholder"><VideoIcon /><p>영상 URL을 등록해 주세요.</p></div>)}
              {format === "material" && <div className="learning-resource-preview"><Download size={20} /><div><b>{resourceName || "학습 자료"}</b><p className="meta">{resourcePath ? "자료 파일 등록됨 · 수강 회원에게 제공" : "파일을 등록해 주세요."}</p></div></div>}
              {format === "link" && (safeUrl(externalUrl) ? <a className="btn primary" href={safeUrl(externalUrl)} target="_blank" rel="noreferrer">외부 학습 열기<ExternalLink size={16} /></a> : <div className="learning-content-placeholder"><ExternalLink /><p>외부 학습 주소를 등록해 주세요.</p></div>)}
            </div>
          </aside>
        </div>
      </section>
      <div className="editor-savebar"><span className="dirty-note">{dirty ? "저장하지 않은 변경사항이 있습니다." : "기본 정보와 학습 내용을 함께 저장합니다."}</span><button className="btn" type="button" onClick={close} disabled={busy}><ArrowLeft size={16} />목록으로</button><button className="btn primary" disabled={busy}>{busy ? "저장 중…" : lessonId ? "학습 저장" : "학습 등록"}</button></div>
      {message && <p className="notice mt16" role="status">{message}</p>}
    </form>
    <section className="panel mt24 learning-quiz-panel" hidden={previewOnly}>
      {missions.length > 1 && <div className="section-pad learning-mission-picker"><Field label="퀴즈를 연결할 미션"><select value={mission?.id || ""} onChange={event => setSelectedMissionId(event.target.value)} disabled={busy}>{missions.map(item => <option key={item.id} value={item.id}>{t(item, "title")}</option>)}</select></Field></div>}
      {mission ? <LessonQuiz key={`${mission.id}-${quiz?.revision || "new"}`} mission={mission} current={quiz} pending={busy} send={send} /> : <><div className="panel-head"><h2>확인 퀴즈</h2><Link className="btn small" href="/admin/missions">미션 관리</Link></div><div className="section-pad"><Empty title={lessonId ? "연결된 미션이 없습니다." : "학습 등록 후 퀴즈를 연결할 수 있습니다."}>미션 관리에서 이 학습에 미션을 등록한 뒤 질문·선택지·정답을 설정하세요.</Empty></div></>}
    </section>
  </div>;
}
