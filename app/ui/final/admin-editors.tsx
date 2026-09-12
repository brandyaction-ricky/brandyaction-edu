"use client";
import {
  labels,
  money,
  number as num,
  object,
  sections,
  text as t,
  type Field,
  type Row,
  type Section,
} from "@/lib/platform";
import { localDateTime, recordId } from "@/lib/platform-rules";
import { Check, Download } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BlocksField, UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";
import { AdminHeading } from "./admin-shell";
import { Badge } from "./primitives";
import { ProductDetailHtml } from "./product-detail-html";
import { productMetadataFields, sanitizeProductHtml } from "@/lib/product-metadata";

function fieldValue(s: Section, row: Row | undefined, f: Field) {
  return s.table === "courses" &&
    ["thumbnail_url", "detail_image_url"].includes(f.key)
    ? object(row, "metadata")[f.key] ||
        object(row, "metadata")[
          f.key === "thumbnail_url" ? "thumbnailUrl" : "detailImageUrl"
        ]
    : row?.[f.key];
}
export function FieldControl({
  section,
  row,
  field: f,
  data,
  pending,
}: {
  section: Section;
  row?: Row;
  field: Field;
  data: Data;
  pending: boolean;
}) {
  const value = fieldValue(section, row, f),
    props = { name: f.key, id: "edit-" + f.key, required: f.required };
  if (f.type === "blocks") return <BlocksField name={f.key} value={value} />;
  if (["image", "resource"].includes(f.type || ""))
    return (
      <UploadField
        name={f.key}
        value={String(value || "")}
        image={f.type === "image"}
        disabled={pending}
      />
    );
  if (f.type === "checkbox")
    return <input {...props} type="checkbox" defaultChecked={Boolean(value)} />;
  if (["course", "week", "lesson"].includes(f.type || "")) {
    const table =
      f.type === "course"
        ? "courses"
        : f.type === "week"
          ? "curriculum_weeks"
          : "curriculum_lessons";
    return (
      <select {...props} defaultValue={String(value || "")}>
        <option value="">선택하세요</option>
        {(data[table] || []).map((r) => (
          <option key={r.id} value={r.id}>
            {t(r, "title")}
          </option>
        ))}
      </select>
    );
  }
  if (f.options)
    return (
      <select {...props} defaultValue={String(value || f.options[0])}>
        {f.options.map((v) => (
          <option key={v} value={v}>
            {labels[v] || v}
          </option>
        ))}
      </select>
    );
  if (f.type === "json" || f.type === "textarea")
    return (
      <textarea
        {...props}
        rows={f.type === "json" ? 8 : 5}
        defaultValue={
          f.type === "json"
            ? JSON.stringify(value ?? {}, null, 2)
            : String(value || "")
        }
      />
    );
  return (
    <input
      {...props}
      type={f.type || "text"}
      defaultValue={
        f.type === "datetime-local" && value
          ? localDateTime(value)
          : String(value ?? "")
      }
      min={
        f.type === "number"
          ? ["capacity", "week_number", "day_number", "usage_limit"].includes(
              f.key,
            )
            ? 1
            : 0
          : undefined
      }
    />
  );
}
export function formValues(section: Section, form: FormData) {
  const values: Record<string, unknown> = {};
  for (const f of section.fields) {
    const value = form.get(f.key);
    if (f.type === "checkbox") values[f.key] = value === "on";
    else if (f.type === "json" || f.type === "blocks")
      values[f.key] = value ? JSON.parse(String(value)) : {};
    else if (f.type === "number")
      values[f.key] =
        value === "" ? (f.key === "list_price" ? 0 : null) : Number(value);
    else if (f.type === "datetime-local")
      values[f.key] = value ? new Date(String(value)).toISOString() : null;
    else values[f.key] = value || null;
  }
  return values;
}
function ProductField({ label, children, wide = false, hint, controlId }: { label: string; children: ReactNode; wide?: boolean; hint?: string; controlId?: string }) {
  return <div className={"field " + (wide ? "wide" : "")}><label className="field-label" htmlFor={controlId}>{label}</label>{children}{hint && <small className="field-hint">{hint}</small>}</div>;
}

function kstInput(value: unknown) {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "";
  return new Date(Date.parse(String(value)) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function ProductResources({ data, row, pending, send }: { data: Data; row?: Row; pending: boolean; send: WorkflowSend }) {
  const weekIds = new Set((data.curriculum_weeks || []).filter(week => week.course_id === row?.id).map(week => week.id));
  const lessons = (data.curriculum_lessons || []).filter(lesson => weekIds.has(String(lesson.week_id)));
  const lessonIds = new Set(lessons.map(lesson => lesson.id));
  const resources = (data.lesson_contents || []).filter(content => lessonIds.has(String(content.lesson_id)) && content.resource_storage_path);
  const materialLessons = lessons.filter(lesson => lesson.content_type === "material");
  const [editing, setEditing] = useState<string | null>(null);
  const [resourceName, setResourceName] = useState("");
  const [resourcePath, setResourcePath] = useState("");
  const [message, setMessage] = useState("");
  const [selectedLesson, setSelectedLesson] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  function edit(content?: Row) {
    const lessonId = content ? String(content.lesson_id) : "";
    setEditing(content ? lessonId : "new");
    setSelectedLesson(lessonId);
    setResourceName(t(content, "resource_name"));
    setResourcePath(t(content, "resource_storage_path"));
    setMessage("");
    setUploadStatus("idle");
  }
  async function save() {
    if (pending || uploadStatus !== "idle") { setMessage(uploadStatus === "error" ? "업로드 오류를 해결하거나 업로드를 취소한 뒤 저장해 주세요." : "파일 업로드가 완료된 뒤 저장해 주세요."); return; }
    if (!selectedLesson || !resourcePath.trim()) { setMessage("자료를 연결할 학습과 파일을 선택해 주세요."); return; }
    const previous = (data.lesson_contents || []).find(content => content.lesson_id === selectedLesson);
    if (previous && !previous.resource_storage_path && (previous.vod_url || previous.body_text || previous.external_url)) {
      setMessage("이미 본문 또는 영상이 등록된 학습입니다. 자료 유형의 학습을 선택해 주세요."); return;
    }
    try {
      await send({ action: "save", section: "contents", id: previous ? recordId(previous) : undefined, values: { lesson_id: selectedLesson, resource_name: resourceName.trim() || resourcePath.split("/").pop(), resource_storage_path: resourcePath, vod_url: null, body_text: null, external_url: null } });
      setMessage("자료를 저장했습니다."); setEditing(null);
    } catch (cause) { setMessage((cause as Error).message); }
  }
  return <>
    <h2>제공 자료</h2><p className="meta mt8">다운로드 파일과 연결된 학습을 관리합니다.</p>
    <div className="product-assets mt16">{resources.map(content => <div className="asset-row" key={String(content.lesson_id)}><span className="file-icon">{String(content.resource_name || content.resource_storage_path).split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span><div><b>{t(content, "resource_name") || "학습 자료"}</b><p>{t(lessons.find(lesson => lesson.id === content.lesson_id), "title")} · 수강 권한 보유 회원</p></div><button className="btn small" type="button" onClick={() => edit(content)} disabled={pending || uploadStatus === "uploading"}>설정</button></div>)}</div>
    {editing !== null ? <div className="product-resource-editor">
      <div className="form-grid"><ProductField label="자료를 연결할 학습" wide><select value={selectedLesson} onChange={event => setSelectedLesson(event.target.value)} aria-label="자료를 연결할 학습" disabled={editing !== "new" || pending || uploadStatus === "uploading"}><option value="">학습 선택</option>{(editing === "new" ? materialLessons : lessons).map(lesson => <option value={lesson.id} key={lesson.id}>{t(lesson, "title")}</option>)}</select></ProductField><ProductField label="자료 이름" wide><input value={resourceName} onChange={event => setResourceName(event.target.value)} aria-label="자료 이름" disabled={pending} /></ProductField></div>
      <div className="upload-box product-upload"><Download aria-hidden="true" /><p>PDF · 문서 · 템플릿 자료 추가</p><UploadField key={editing} name="product_resource_upload" value={resourcePath} image={false} disabled={pending} onChange={setResourcePath} onStatusChange={setUploadStatus} /></div>
      <div className="row mt16"><button className="btn" type="button" onClick={() => setEditing(null)} disabled={pending || uploadStatus === "uploading"}>취소</button><button className="btn primary" type="button" onClick={() => void save()} disabled={pending || uploadStatus !== "idle" || !resourcePath || !selectedLesson}>자료 저장</button></div>
    </div> : <div className="upload-box"><Download aria-hidden="true" /><p>{resources.length ? "PDF · 문서 · 템플릿 자료 추가" : "등록된 제공 자료가 없습니다."}</p>{materialLessons.length ? <button className="btn" type="button" onClick={() => edit()} disabled={pending}>파일 등록</button> : <Link className="btn" href="/admin/learning">자료를 연결할 학습 만들기</Link>}<p className="meta">자료는 상품에 연결된 학습 단위로 저장됩니다.</p></div>}
    <ProductField label="기본 다운로드 권한" hint="자료 다운로드 시 로그인 및 유효한 수강 권한을 확인합니다."><div className="product-value">신청·구매 후 수강 권한 보유 회원</div></ProductField>
    <div className="notice warning mt16">신청 또는 구매로 부여된 수강 권한이 있어야 자료를 다운로드할 수 있습니다. 환불·권한 회수 후에는 다운로드가 제한됩니다.</div>
    {message && <p className="notice mt16" role="status">{message}</p>}
  </>;
}

export function ProductEditor({ data, row, pending, send, back }: { data: Data; row?: Row; pending: boolean; send: WorkflowSend; back: () => void }) {
  const section = sections.find(s => s.key === "products")!;
  const metadata = object(row, "metadata");
  const editorRow = { ...row, ...Object.fromEntries(productMetadataFields.map(key => [key, metadata[key]])) } as Row;
  const cohorts = (data.cohorts || []).filter(cohort => cohort.course_id === row?.id);
  const [cohortId, setCohortId] = useState(cohorts.find(cohort => cohort.status === "recruiting")?.id || cohorts[0]?.id || "");
  const cohort = cohorts.find(item => item.id === cohortId);
  const [tab, setTab] = useState("basic");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState("");
  const [cohortDrafts, setCohortDrafts] = useState<Record<string, Record<string, string>>>({});
  const [htmlSource, setHtmlSource] = useState(String(metadata.detail_html || ""));
  const [htmlFilename, setHtmlFilename] = useState("");
  const [preview, setPreview] = useState({ title: t(row, "title"), summary: t(row, "summary"), price: num(row, "list_price"), regular: Number(metadata.regular_price || 0), status: t(row, "status") || "draft", category: t(row, "category") || "paid_class", slug: t(row, "slug"), seoTitle: String(metadata.seo_title || ""), seoDescription: String(metadata.seo_description || "") });
  const formRef = useRef<HTMLFormElement>(null);
  const groups = [["basic", "기본·판매"], ["detail", "상세페이지"], ["resources", "제공 자료"], ["access", "수강·권한"], ["publish", "공개·검색"]] as const;
  const weekIds = new Set((data.curriculum_weeks || []).filter(week => week.course_id === row?.id).map(week => week.id));
  const lessonIds = new Set((data.curriculum_lessons || []).filter(lesson => weekIds.has(String(lesson.week_id))).map(lesson => lesson.id));
  const resourceCount = (data.lesson_contents || []).filter(content => lessonIds.has(String(content.lesson_id)) && content.resource_storage_path).length;
  const previewSalePrice = preview.category === "free" ? 0 : cohort ? num(cohort, "price") : preview.price;
  const statusLabels: Record<string, string> = { draft: "작성 중", published: "판매 중", archived: "판매 종료" };
  function field(key: string, label?: string, wide = false, hint?: string) {
    const definition = section.fields.find(item => item.key === key);
    if (!definition) return null;
    return <ProductField controlId={"edit-" + key} label={(label || definition.label) + (definition.required ? " *" : "")} wide={wide} hint={hint}><FieldControl section={section} row={editorRow} field={definition} data={data} pending={pending} /></ProductField>;
  }
  function updatePreview() {
    setDirty(true);
    if (!formRef.current) return;
    const values = new FormData(formRef.current);
    setPreview({ title: String(values.get("title") || ""), summary: String(values.get("summary") || ""), price: Number(values.get("list_price") || 0), regular: Number(values.get("regular_price") || 0), status: String(values.get("status") || "draft"), category: String(values.get("category") || "paid_class"), slug: String(values.get("slug") || ""), seoTitle: String(values.get("seo_title") || ""), seoDescription: String(values.get("seo_description") || "") });
  }
  function close() { if (!dirty || window.confirm("저장하지 않은 변경사항이 있습니다. 목록으로 돌아갈까요?")) back(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const invalid = Array.from(form.elements).find(element => "checkValidity" in element && !(element as HTMLInputElement).checkValidity()) as HTMLInputElement | undefined;
    if (invalid) { const panel = invalid.closest("[data-tab]"); if (panel) setTab(panel.getAttribute("data-tab")!); const details = invalid.closest("details"); if (details) details.open = true; requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); }); return; }
    const submitted = new FormData(form);
    const values = formValues(section, submitted);
    if (values.category === "free") values.list_price = 0;
    const cohortChanges: { id: string; values: Record<string, unknown> }[] = [];
    for (const linked of cohorts) {
      const draft = cohortDrafts[linked.id];
      if (!draft) continue;
      const changed: Record<string, unknown> = {};
      for (const key of ["recruitment_start_at", "recruitment_end_at"]) {
        const current = draft[key];
        if (current !== undefined && current !== kstInput(linked[key])) changed[key] = current ? new Date(current + ":00+09:00").toISOString() : null;
      }
      if (!Object.keys(changed).length) continue;
      const start = changed.recruitment_start_at !== undefined ? changed.recruitment_start_at : linked.recruitment_start_at;
      const end = changed.recruitment_end_at !== undefined ? changed.recruitment_end_at : linked.recruitment_end_at;
      if (start && end && Date.parse(String(start)) >= Date.parse(String(end))) { setCohortId(linked.id); setTab("basic"); setError(t(linked, "name") + "의 모집 마감은 모집 시작 이후로 설정해 주세요."); return; }
      cohortChanges.push({ id: linked.id, values: changed });
    }
    let productSaved = false;
    try {
      await send({ action: "save", section: "products", id: row?.id, values });
      productSaved = true;
      for (const change of cohortChanges) await send({ action: "save", section: "cohorts", id: change.id, values: change.values }, "상품과 기수 모집 일정을 저장했습니다.");
      setDirty(false); back();
    } catch (cause) { setError((productSaved ? "상품은 저장했지만 기수 모집 일정은 저장하지 못했습니다. 일정을 확인하고 다시 저장해 주세요. " : "") + (cause as Error).message); }
  }
  return <div className="product-editor">
    <AdminHeading title={row ? "상품 수정" : "상품 등록"} description={t(row, "title") || "상품 정보·상세페이지·제공 자료·판매 조건을 입력하세요."} eyebrow="PRODUCT EDITOR">{Boolean(row?.slug) && <Link className="btn" href={"/classes/" + t(row, "slug")} target="_blank">고객 화면 미리보기</Link>}</AdminHeading>
    <form ref={formRef} noValidate onSubmit={submit} onChange={updatePreview}>
      <div className="editor-layout"><div className="editor-main"><section className="panel">
        <div className="tabs" role="tablist" aria-label="상품 편집 영역">{groups.map(([key, label]) => <button key={key} id={"product-tab-" + key} type="button" role="tab" aria-selected={tab === key} aria-controls={"product-panel-" + key} className={"tab " + (tab === key ? "active" : "")} onClick={() => setTab(key)}>{label}</button>)}</div>
        <div className="section-pad" id="product-panel-basic" data-tab="basic" role="tabpanel" aria-labelledby="product-tab-basic" hidden={tab !== "basic"}>
          <h2 className="mb16">기본 정보</h2><div className="form-grid">
            {field("title", "상품명", true)}
            {field("category", "상품 유형")}
            <ProductField label="판매 상태"><select name="status" aria-label="판매 상태" defaultValue={t(row, "status") || "draft"} disabled={pending}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></ProductField>
            {field("summary", "상품 한 줄 소개", true)}
            {field("regular_price", "정가 · 원")}
            {field("list_price", "상품 기본 판매가 · 원", false, "무료 클래스는 0원입니다. 기수별 실제 결제 금액은 기수·회차 관리에서 설정합니다.")}
            <ProductField label="모집 시작 · KST"><input key={cohortId + "-start"} name="recruitment_start_at" aria-label="모집 시작 · KST" type="datetime-local" value={cohortDrafts[cohortId]?.recruitment_start_at ?? kstInput(cohort?.recruitment_start_at)} onChange={event => setCohortDrafts(current => ({ ...current, [cohortId]: { ...current[cohortId], recruitment_start_at: event.target.value } }))} disabled={!cohort || pending} /></ProductField>
            <ProductField label="모집 마감 · KST"><input key={cohortId + "-end"} name="recruitment_end_at" aria-label="모집 마감 · KST" type="datetime-local" value={cohortDrafts[cohortId]?.recruitment_end_at ?? kstInput(cohort?.recruitment_end_at)} onChange={event => setCohortDrafts(current => ({ ...current, [cohortId]: { ...current[cohortId], recruitment_end_at: event.target.value } }))} disabled={!cohort || pending} /></ProductField>
          </div>
          <p className="meta product-cohort-hint">{cohort ? `현재 ${t(cohort, "name")}의 모집 일정입니다. 수강·권한 탭에서 기수를 선택할 수 있으며 변경한 기수 일정은 함께 저장됩니다.` : "상품을 저장하고 기수를 연결하면 모집 일정을 설정할 수 있습니다."}</p>
          <h3>상품 썸네일</h3><div className="upload-box product-upload"><Download aria-hidden="true" /><p>썸네일 이미지를 선택하세요.</p><UploadField name="thumbnail_url" value={String(metadata.thumbnail_url || metadata.thumbnailUrl || "")} image disabled={pending} onChange={() => setDirty(true)} /><p className="meta">권장 비율 16:9 · PNG/JPG/WebP</p></div>
          <div className="notice mt16">썸네일과 상세페이지 이미지는 별도로 관리합니다. 디지털 자료도 상품 정보와 제공 자료를 각각 등록해 주세요.</div>
          <details className="product-extra mt24"><summary>추가 상품 정보</summary><div className="form-grid mt16">{field("instructor_name", "강사명")}{field("schedule_label", "일정 안내")}</div></details>
        </div>
        <div className="section-pad" id="product-panel-detail" data-tab="detail" role="tabpanel" aria-labelledby="product-tab-detail" hidden={tab !== "detail"}>
          <h2 className="mb16">상세페이지 업로드</h2><p className="meta">HTML 파일을 불러오거나 아래 본문을 편집합니다. 긴 이미지형 상세페이지도 등록할 수 있습니다.</p>
          <div className="upload-box"><Download aria-hidden="true" /><p>상세페이지 HTML 파일 선택</p><label className="btn upload-label"><input type="file" accept=".html,.htm,text/html" disabled={pending} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) { setError("HTML 파일은 1MB 이하로 선택해 주세요."); return; } try { const source = await file.text(); sanitizeProductHtml(source); setHtmlSource(source); setHtmlFilename(file.name); setDirty(true); } catch (cause) { setError((cause as Error).message || "HTML 파일을 읽지 못했습니다. 다시 선택해 주세요."); } }} />파일 선택</label><p className="meta">{htmlFilename || "파일을 불러온 후 저장하면 상세페이지 본문에 반영됩니다."}</p></div>
          <ProductField label="상세 본문 · HTML" hint="외부 스크립트와 폼 없이 본문을 등록해 주세요."><textarea className="code-editor" name="detail_html" aria-label="상세 본문 · HTML" rows={9} value={htmlSource} onChange={event => setHtmlSource(event.target.value)} disabled={pending} /></ProductField>
          <div className="row"><button className="btn small" type="button" onClick={() => { if (showPreview) { setShowPreview(false); return; } try { setHtmlPreview(sanitizeProductHtml(htmlSource)); setShowPreview(true); } catch (cause) { setError((cause as Error).message); } }}>{showPreview ? "미리보기 닫기" : "본문 미리보기"}</button><span className="meta">저장 전 본문과 줄바꿈을 확인하세요.</span></div>
          {showPreview && <ProductDetailHtml html={htmlPreview} className="product-detail-html safe-html-preview product-html-preview mt16" />}
          <div className="upload-box product-upload mt16"><Download aria-hidden="true" /><p>이미지형 상세페이지 선택</p><UploadField name="detail_image_url" value={String(metadata.detail_image_url || metadata.detailImageUrl || "")} image disabled={pending} onChange={() => setDirty(true)} /><p className="meta">긴 이미지는 원본 비율로 표시됩니다.</p></div>
          <details className="product-extra mt24"><summary>텍스트 상세 설명</summary><div className="mt16">{field("description", "텍스트 상세 설명", true, "HTML 본문이 없는 경우 표시할 상품 설명입니다.")}</div></details>
          {row && <><div className="divider" /><h3>저장 정보</h3><div className="setting-line"><div><b>현재 상품</b><p>{row.updated_at ? new Date(String(row.updated_at)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "등록된 상품 정보를 편집하고 있습니다."}</p></div><Badge color={preview.status === "published" ? "green" : ""}>{statusLabels[preview.status]}</Badge></div></>}
          {row && preview.category === "free" && <div className="notice mt24"><p>무료 라이브의 CTA와 랜딩 이미지는 라이브 관리에서 함께 발행할 수 있습니다.</p><Link className="btn mt16" href={"/admin/landing?course=" + row.id}>무료 라이브 CTA·이미지 관리</Link></div>}
        </div>
        <div className="section-pad" id="product-panel-resources" data-tab="resources" role="tabpanel" aria-labelledby="product-tab-resources" hidden={tab !== "resources"}><ProductResources data={data} row={row} pending={pending} send={send} /></div>
        <div className="section-pad" id="product-panel-access" data-tab="access" role="tabpanel" aria-labelledby="product-tab-access" hidden={tab !== "access"}>
          <h2 className="mb16">수강·기수 연결</h2><ProductField label="연결 기수"><select value={cohortId} onChange={event => setCohortId(event.target.value)} aria-label="연결 기수" disabled={!cohorts.length || pending}>{!cohorts.length && <option value="">미연결</option>}{cohorts.map(item => <option key={item.id} value={item.id}>{t(item, "name")}</option>)}</select></ProductField>
          <div className="form-grid"><ProductField label="수강 시작 기준"><div className="product-value">주문별 수강권의 시작일 기준</div></ProductField><ProductField label="연결 기수 운영 종료"><div className="product-value">{cohort?.operation_end_at ? new Date(String(cohort.operation_end_at)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "기수에 지정된 종료일 없음"}</div></ProductField>{field("duration_label", "고객에게 보이는 수강 기간", true)}</div>
          <h3 className="mt16">구매 후 제공 항목</h3><ul className="product-entitlements mt16"><li><Check aria-hidden="true" />공개된 학습 콘텐츠·영상·퀴즈</li><li><Check aria-hidden="true" />미션 제출 및 피드백</li><li><Check aria-hidden="true" />등록된 수강생 전용 자료</li></ul>
          <div className="divider" /><div className="notice">수강 권한은 신청·결제 내역과 기수 일정에 따라 부여됩니다. 개별 수강권의 기간·회수 상태는 주문 및 회원 화면에서 확인하세요.</div><div className="row mt16"><Link className="btn" href="/admin/orders">주문·수강 권한 확인</Link><Link className="btn" href="/admin/cohorts">기수·회차 관리</Link></div>
        </div>
        <div className="section-pad" id="product-panel-publish" data-tab="publish" role="tabpanel" aria-labelledby="product-tab-publish" hidden={tab !== "publish"}>
          <h2 className="mb16">공개·검색 설정</h2>{field("slug", "상품 주소 (slug)", true, "영문 소문자·숫자·하이픈을 사용하세요. 기존 주소를 바꾸면 공유한 링크도 변경됩니다.")}{field("course_code", "상품 코드", true)}{field("seo_title", "검색 제목", true)}{field("seo_description", "검색 설명", true)}
          <div className="snippet"><div className="snippet-url">brandyaction-edu.com › classes › {preview.slug || "상품 주소"}</div><h3>{preview.seoTitle || preview.title || "상품명"}</h3><p>{preview.seoDescription || preview.summary || "검색 결과에 표시할 설명을 작성해 주세요."}</p></div><div className="divider" /><h3>공개 전 점검</h3><div className="checkbox-stack mt16">{["상품명·가격·모집 기간 확인", "상세페이지 PC·모바일 확인", "자료 다운로드 권한 확인", "기수·수강 기간 확인"].map(label => <label key={label}><input type="checkbox" />{label}</label>)}</div>
        </div>
      </section><div className="editor-savebar"><span className="dirty-note">{dirty ? "저장하지 않은 변경사항이 있습니다." : "변경 내용을 저장하면 반영됩니다."}</span><button className="btn" type="button" onClick={close} disabled={pending}>목록으로</button>{tab !== "publish" && <button className="btn" type="button" onClick={() => setTab("publish")} disabled={pending}>공개 전 확인</button>}<button className="btn primary" type="submit" disabled={pending}>{pending ? "저장 중…" : "저장하기"}</button></div>{error && <p className="notice mt16" role="alert">{error}</p>}</div>
      <aside className="editor-aside"><div className="side-preview"><span className="section-code">고객에게 보이는 상품</span><div className="preview-cover mt16"><p>BRANDYACTION EDU</p><h3>{preview.title || "상품명"}</h3><p className="accent">{labels[preview.category] || "유료 클래스"}</p></div><div className="preview-meta"><b>{!previewSalePrice ? "무료" : money(previewSalePrice)}</b>{preview.regular > previewSalePrice && <s>{money(preview.regular)}</s>}</div><p className="meta mt8">{cohort ? t(cohort, "name") + " 기수 판매가" : "상품 기본 판매가"}</p><p className="meta mt8">{preview.summary || "상품 소개를 입력해 주세요."}</p><div className="divider" /><div className="setting-line"><span>상품 상태</span><Badge color={preview.status === "published" ? "green" : ""}>{statusLabels[preview.status]}</Badge></div><div className="setting-line"><span>연결 기수</span><b>{t(cohort, "name") || "미연결"}</b></div><div className="setting-line"><span>제공 자료</span><b>{resourceCount}개</b></div><Link className="btn full mt16" href="/admin/cohorts">기수·회차 관리</Link></div></aside></div>
    </form>
  </div>;
}
