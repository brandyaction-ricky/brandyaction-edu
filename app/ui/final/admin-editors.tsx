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
import { productInputErrors, type ProductInputError } from "@/lib/product-editor-validation";
import { localDateTime, productSalesStatus } from "@/lib/platform-rules";
import { Check, Code2, Download, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { BlocksField, UploadField, uploadPlatformFile } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";
import { Badge } from "./primitives";
import { productDetailImages, productMetadataFields, productResources, sanitizeProductHtml, type ProductResourceScope } from "@/lib/product-metadata";
import { isProductListed } from "@/lib/product-visibility";
import { DetailImageGallery } from "./detail-image-gallery";
import { productConversion, DEFAULT_CTA_COLOR } from "@/lib/product-conversion";
import { productDocument, validateProductDocument } from "@/lib/product-html-document";
import { ProductDetailHtml } from "./product-detail-html";
import { DigitalContentManager } from "./digital-content-manager";
import { ProductCurriculumWorkspace } from "./product-curriculum-workspace";
import { ProductCohortWorkspace } from "./product-cohort-workspace";
import { LessonBodyEditor } from "./lesson-body-editor";
import { AdminButton, AdminInlineError, AdminInput, AdminSelect, AdminTextarea, PageHeader, PageSection } from "@/features/admin-ui";

function fieldValue(s: Section, row: Row | undefined, f: Field) {
  return s.table === "courses" &&
    ["thumbnail_url", "detail_image_url"].includes(f.key)
    ? object(row, "metadata")[f.key] ||
        object(row, "metadata")[
          f.key === "thumbnail_url" ? "thumbnailUrl" : "detailImageUrl"
        ]
    : row?.[f.key];
}
function LessonBodyField({ value: initial, disabled }: { value: string; disabled: boolean }) {
  const [value, setValue] = useState(initial);
  return <LessonBodyEditor id="edit-body_text" name="body_text" label="학습 본문" showLabel={false} value={value} onChange={setValue} disabled={disabled} />;
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
    props = { name: f.key, id: "edit-" + f.key, required: f.required, maxLength: f.maxLength };
  if (section.table === "lesson_contents" && f.key === "body_text") return <LessonBodyField key={row?.id || "new"} value={String(value || "")} disabled={pending} />;
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
          ? ["capacity", "day_number", "usage_limit"].includes(
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
    // Hidden/removed editor controls must not erase stored values on partial updates.
    if (!form.has(f.key)) continue;
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
function ProductField({ label, children, wide = false, hint, controlId, error }: { label: string; children: ReactNode; wide?: boolean; hint?: string; controlId?: string; error?: string }) {
  return <div className={"field " + (wide ? "wide" : "")}><label className="field-label" htmlFor={controlId}>{label}</label>{children}{error && <small className="product-field-error" id={controlId + "-error"}>{error}</small>}{hint && <small className="field-hint">{hint}</small>}</div>;
}

function kstInput(value: unknown) {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "";
  return new Date(Date.parse(String(value)) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function ProductSaleCheck({ sale, cohort }: { sale: ReturnType<typeof productSalesStatus>; cohort?: Row }) {
  return <section className="product-sale-check" aria-label="판매 가능 여부">
    <div className="setting-line"><b>실제 판매 상태</b><Badge color={sale.label === "판매 중" ? "green" : "amber"}>{sale.label}</Badge></div>
    <p className="meta mt8">연결 기수 상태: {cohort ? `${t(cohort, "name")} · ${labels[t(cohort, "status")] || t(cohort, "status")}` : "미연결"}</p>
    {cohort?.status === "upcoming" && <p className="meta mt8">준비 중 기수도 모집 마감·운영 기간 등 기존 판매 조건을 충족하면 신청할 수 있습니다.</p>}
    {sale.hasCustomCta && <p className="meta mt8">고객 버튼은 기본 결제 대신 설정한 Destination URL로 이동합니다.</p>}
    {sale.issues.length > 0 && <div className="notice warning mt8"><b>신청 전 확인할 항목</b><ul>{sale.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>판매 중으로 저장하려면 위 항목을 입력해 주세요. 저장 버튼을 누르면 입력 위치를 안내합니다.</p></div>}
  </section>;
}

function ProductResources({ row, pending, send }: { row?: Row; pending: boolean; send: WorkflowSend }) {
  const resources = productResources(object(row, "metadata"));
  const [editing, setEditing] = useState<string | null>(null);
  const [resourceName, setResourceName] = useState("");
  const [resourcePath, setResourcePath] = useState("");
  const [accessScope, setAccessScope] = useState<ProductResourceScope>("public");
  const [message, setMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const scopeLabels: Record<ProductResourceScope, string> = { public: "누구나 다운로드", authenticated: "로그인 회원", enrolled: "신청 완료 회원", purchaser: "구매자 전용" };
  async function selectNewFile(file: File | undefined) {
    if (!file || pending) return;
    setMessage(""); setUploadStatus("uploading");
    try {
      if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 파일을 선택해 주세요.");
      const result = await uploadPlatformFile(file, "resource");
      setEditing("new"); setResourceName(result.name); setResourcePath(result.value); setAccessScope("public"); setUploadStatus("idle");
    } catch (cause) {
      setUploadStatus("error"); setMessage(cause instanceof Error ? cause.message : "파일을 업로드하지 못했습니다.");
    }
  }
  function edit(resource?: (typeof resources)[number]) {
    setEditing(resource?.id || "new");
    setResourceName(resource?.name || "");
    setResourcePath(resource?.path || "");
    setAccessScope(resource?.scope || "public");
    setMessage("");
    setUploadStatus("idle");
  }
  async function save() {
    if (pending || uploadStatus !== "idle") { setMessage(uploadStatus === "error" ? "업로드 오류를 해결하거나 업로드를 취소한 뒤 저장해 주세요." : "파일 업로드가 완료된 뒤 저장해 주세요."); return; }
    if (!row?.id || !resourcePath.trim()) { setMessage("상품을 저장하고 업로드할 파일을 선택해 주세요."); return; }
    try {
      await send({ action: "save-product-resource", courseId: row.id, resourceId: editing !== "new" ? editing : undefined, resourceName: resourceName.trim() || resourcePath.split("/").pop(), storagePath: resourcePath, accessScope });
      setMessage("자료를 저장했습니다."); setEditing(null);
    } catch (cause) { setMessage((cause as Error).message); }
  }
  async function remove(resourceId: string) {
    if (!row?.id || pending || !window.confirm("이 자료를 삭제할까요?")) return;
    try { await send({ action: "delete-product-resource", courseId: row.id, resourceId }); setEditing(null); setMessage("자료를 삭제했습니다."); }
    catch (cause) { setMessage((cause as Error).message); }
  }
  return <>
    <h3>과정 공통 자료</h3><p className="meta mt8">교재·템플릿처럼 과정 전체에 제공할 자료입니다. 특정 수업의 자료는 해당 학습의 콘텐츠에서 등록하세요.</p>
    <div className="product-assets mt16">{resources.map(resource => <div className="asset-row" key={resource.id}><span className="file-icon">{resource.name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span><div><b>{resource.name}</b><p>{scopeLabels[resource.scope]}</p></div><button className="btn small" type="button" onClick={() => edit(resource)} disabled={pending || uploadStatus === "uploading"}>설정</button></div>)}</div>
    {editing !== null ? <div className="product-resource-editor">
      <div className="form-grid"><ProductField label="자료 이름"><input value={resourceName} onChange={event => setResourceName(event.target.value)} aria-label="자료 이름" disabled={pending} placeholder="업로드 파일 이름" /></ProductField><ProductField label="다운로드 권한"><select value={accessScope} onChange={event => setAccessScope(event.target.value as ProductResourceScope)} aria-label="다운로드 권한" disabled={pending}>{Object.entries(scopeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></ProductField></div>
      <div className="upload-box product-upload"><Download aria-hidden="true" /><p>업로드할 파일 선택하기</p><UploadField key={editing} name="product_resource_upload" value={resourcePath} image={false} disabled={pending} onChange={setResourcePath} onStatusChange={setUploadStatus} /></div>
      <div className="row mt16">{editing !== "new" && <button className="btn danger" type="button" onClick={() => void remove(editing)} disabled={pending || uploadStatus === "uploading"}>삭제</button>}<span className="spacer"/><button className="btn" type="button" onClick={() => setEditing(null)} disabled={pending || uploadStatus === "uploading"}>취소</button><button className="btn primary" type="button" onClick={() => void save()} disabled={pending || uploadStatus !== "idle" || !resourcePath}>자료 저장</button></div>
    </div> : <div className="upload-box"><Download aria-hidden="true" /><p>{resources.length ? "PDF · 문서 · 템플릿 자료 추가" : "등록된 제공 자료가 없습니다."}</p><label className={`btn upload-label${pending || !row?.id ? " disabled" : ""}`}><input type="file" accept=".pdf,.zip,.txt,.csv,.hwp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" disabled={pending || !row?.id} onChange={event => { const input = event.currentTarget; void selectNewFile(input.files?.[0]).finally(() => { input.value = ""; }); }} />{uploadStatus === "uploading" ? "업로드 중…" : "업로드할 파일 선택하기"}</label><p className="meta">파일별로 공개 범위를 설정할 수 있습니다.</p></div>}
    <div className="notice warning mt16">누구나 다운로드부터 구매자 전용까지 파일별 권한을 설정할 수 있습니다.</div>
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
  const [tab, setCurrentTab] = useState("basic");
  const [curriculumOpened, setCurriculumOpened] = useState(false);
  function setTab(value: string) {
    if (value === "curriculum") setCurriculumOpened(true);
    setCurrentTab(value);
  }
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [cohortDrafts, setCohortDrafts] = useState<Record<string, Record<string, string>>>({});
  const [htmlSource, setHtmlSource] = useState(productDocument(metadata) || String(metadata.detail_html || ""));
  const [detailMode, setDetailMode] = useState<"image" | "html">(productDocument(metadata) || String(metadata.detail_html || "") ? "html" : "image");
  const conversion = productConversion(metadata, (data.landing_configs || []).find(item => item.id === row?.id));
  const [ctaColor, setCtaColor] = useState(conversion.color);
  const [listed, setListed] = useState(isProductListed(row));
  const [showCountdown, setShowCountdown] = useState(metadata.recruitment_countdown_enabled === true);
  const [htmlFilename, setHtmlFilename] = useState("");
  const [detailUploadStatus, setDetailUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [preview, setPreview] = useState({ title: t(row, "title"), summary: t(row, "summary"), price: num(row, "list_price"), regular: Number(metadata.regular_price || 0), status: t(row, "status") || "draft", category: t(row, "category") || "paid_class", slug: t(row, "slug"), seoTitle: String(metadata.seo_title || ""), seoDescription: String(metadata.seo_description || "") });
  const [draftValues, setDraftValues] = useState<Record<string, unknown>>({});
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [nativeErrors, setNativeErrors] = useState<ProductInputError[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const groups = [["basic", "기본·판매"], ["detail", "상세페이지"], ...(preview.category === "digital" ? [["resources", "콘텐츠 구성"]] : [["curriculum", "커리큘럼"], ["cohorts", "기수·회차"]]), ["access", "수강·권한"], ["publish", "공개·검색"]];
  const resourceCount = productResources(metadata).length;
  const previewSalePrice = preview.category === "free" ? 0 : cohort ? num(cohort, "price") : preview.price;
  const statusLabels: Record<string, string> = { draft: "작성 중", published: "판매 중", archived: "판매 종료" };
  const saleCohorts = cohorts.map(linked => {
    const draft = cohortDrafts[linked.id];
    return { ...linked, ...Object.fromEntries(Object.entries(draft || {}).map(([key, value]) => [key, value ? value + ":00+09:00" : null])) };
  });
  const saleCourse = { ...row, ...draftValues, id: row?.id || "new-product", status: preview.status, category: preview.category, metadata: { ...metadata, ...Object.fromEntries(productMetadataFields.filter(key => key in draftValues).map(key => [key, draftValues[key]])), detail_html_document: detailMode === "html" ? htmlSource : "", detail_html: "" } } as Row;
  const sale = productSalesStatus(saleCourse, saleCohorts, checkedAt, Boolean(productConversion(object(saleCourse, "metadata")).url));
  function validationCohorts(course: Row, linked: Row[], values?: FormData): Row[] {
    if (cohort) return linked;
    // The save API creates a default cohort when no cohort is linked.
    const start = values ? String(values.get("recruitment_start_at") || "") : cohortDrafts[""]?.recruitment_start_at || "";
    const end = values ? String(values.get("recruitment_end_at") || "") : cohortDrafts[""]?.recruitment_end_at || "";
    return [...linked, { id: "new-product-cohort", course_id: course.id, status: "recruiting", name: "기본 기수", price: course.list_price, recruitment_start_at: start ? start + ":00+09:00" : null, recruitment_end_at: end ? end + ":00+09:00" : null }];
  }
  const inputErrors = validationAttempted ? [...nativeErrors, ...productInputErrors(saleCourse, validationCohorts(saleCourse, saleCohorts), cohortId, checkedAt)] : [];
  const fieldError = (key: string) => inputErrors.find(item => item.field === key && (!item.cohortId || item.cohortId === cohortId || item.cohortId === "new-product-cohort"))?.message;
  function collectNativeErrors(form: HTMLFormElement): ProductInputError[] {
    return Array.from(form.elements).flatMap(element => {
      if (element.closest("[data-independent-editor]") || !(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name) return [];
      if (element.checkValidity() && (!element.required || element.value.trim())) return [];
      const label = (element.labels?.[0]?.querySelector(".admin-field-label, .field-label") || element.labels?.[0])?.textContent?.replace(" *", "") || section.fields.find(item => item.key === element.name)?.label || "입력값";
      return [{ field: element.name, tab: element.closest("[data-tab]")?.getAttribute("data-tab") || "basic", message: element.validity.valueMissing || !element.value.trim() ? `${label}을 입력해 주세요.` : `${label}의 형식을 확인해 주세요.` }];
    });
  }
  function focusError(issue: ProductInputError) {
    if (issue.cohortId && issue.cohortId !== "new-product-cohort") setCohortId(issue.cohortId);
    setTab(issue.tab);
    requestAnimationFrame(() => {
      const panel = formRef.current?.querySelector<HTMLElement>(`[data-tab="${issue.tab}"]`);
      const target = panel?.querySelector<HTMLElement>(`[name="${issue.field}"], [data-validation-field="${issue.field}"]`);
      const details = target?.closest("details");
      if (details) details.open = true;
      const control = target?.matches("input:not([type=hidden]), select, textarea, button") ? target : target?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button");
      (control || target || panel)?.focus();
      (target || panel)?.scrollIntoView({ block: "center" });
    });
  }
  function field(key: string, label?: string, wide = false, hint?: string) {
    const definition = section.fields.find(item => item.key === key);
    if (!definition) return null;
    const props = { id: "edit-" + key, name: key, label: label || definition.label, "aria-label": label || definition.label, helper: hint, error: fieldError(key), required: definition.required, maxLength: definition.maxLength, disabled: pending };
    const value = fieldValue(section, editorRow, definition);
    let control: ReactNode;
    if (definition.options) control = <AdminSelect {...props} defaultValue={String(value || definition.options[0])}>{definition.options.map(option => <option key={option} value={option}>{labels[option] || option}</option>)}</AdminSelect>;
    else if (definition.type === "textarea" || definition.type === "json") control = <AdminTextarea {...props} rows={definition.type === "json" ? 8 : 5} defaultValue={definition.type === "json" ? JSON.stringify(value ?? {}, null, 2) : String(value || "")} />;
    else if (!definition.type || ["text", "number", "url", "email", "datetime-local"].includes(definition.type)) control = <AdminInput {...props} type={definition.type || "text"} defaultValue={definition.type === "datetime-local" && value ? localDateTime(value) : String(value ?? "")} min={definition.type === "number" ? 0 : undefined} />;
    else control = <ProductField controlId={props.id} label={props.label + (definition.required ? " *" : "")} hint={hint}><FieldControl section={section} row={editorRow} field={definition} data={data} pending={pending} /></ProductField>;
    return <div className={wide ? "wide" : undefined}>{control}</div>;
  }
  function updatePreview() {
    setDirty(true);
    if (!formRef.current) return;
    if (validationAttempted) setNativeErrors(collectNativeErrors(formRef.current));
    const values = new FormData(formRef.current);
    setDraftValues(formValues(section, values));
    setPreview({ title: String(values.get("title") || ""), summary: String(values.get("summary") || ""), price: Number(values.get("list_price") || 0), regular: Number(values.get("regular_price") || 0), status: String(values.get("status") || "draft"), category: String(values.get("category") || "paid_class"), slug: String(values.get("slug") || ""), seoTitle: String(values.get("seo_title") || ""), seoDescription: String(values.get("seo_description") || "") });
  }
  function close() { if (!dirty || window.confirm("저장하지 않은 변경사항이 있습니다. 목록으로 돌아갈까요?")) back(); }
  async function removeProduct() {
    if (!row?.id || pending || !window.confirm(`「${t(row, "title")}」 상품을 삭제할까요? 상품·커리큘럼 선택 목록에서 숨겨집니다. 커리큘럼과 주문·수강 기록, 파일은 보관됩니다. 상품·판매 설정에서 ‘삭제된 상품’을 선택한 뒤 ‘복원’을 누르면 다시 편집할 수 있습니다.`)) return;
    try { await send({ action: "archive", section: "products", ids: [row.id] }, "상품과 커리큘럼을 목록에서 숨겼습니다. 기존 내용과 주문·수강 기록은 보관됩니다."); back(); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (detailUploadStatus !== "idle") { setTab("detail"); setError(detailUploadStatus === "uploading" ? "상세 이미지 업로드가 끝난 뒤 저장해 주세요." : "상세 이미지 업로드 오류를 확인해 주세요."); return; }
    const form = event.currentTarget;
    const submitted = new FormData(form);
    const values = formValues(section, submitted);
    if (values.category === "free") values.list_price = 0;
    const submittedCourse = { ...saleCourse, ...values, metadata: { ...object(saleCourse, "metadata"), ...Object.fromEntries(productMetadataFields.filter(key => key in values).map(key => [key, values[key]])), detail_html: "" } } as Row;
    const submittedCohorts = saleCohorts.map(item => item.id === cohortId ? { ...item, recruitment_start_at: submitted.get("recruitment_start_at") ? String(submitted.get("recruitment_start_at")) + ":00+09:00" : null, recruitment_end_at: submitted.get("recruitment_end_at") ? String(submitted.get("recruitment_end_at")) + ":00+09:00" : null } : item);
    // Recheck deadlines on the submit event, not during render.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const native = collectNativeErrors(form);
    const problems = [...native, ...productInputErrors(submittedCourse, validationCohorts(submittedCourse, submittedCohorts, submitted), cohortId, now)];
    setCheckedAt(now); setValidationAttempted(true); setNativeErrors(native); setDraftValues(values);
    if (problems.length) { focusError(problems[0]); return; }
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
    try {
      await send({
        action: "save",
        section: "products",
        id: row?.id,
        cohortId: cohort?.id,
        recruitmentStartAt: submitted.get("recruitment_start_at") ? new Date(String(submitted.get("recruitment_start_at")) + ":00+09:00").toISOString() : null,
        recruitmentEndAt: submitted.get("recruitment_end_at") ? new Date(String(submitted.get("recruitment_end_at")) + ":00+09:00").toISOString() : null,
        values,
      }, row?.id ? "상품을 저장했습니다. 현재 화면에서 계속 수정할 수 있습니다." : "상품을 등록했습니다.");
      for (const change of cohortChanges.filter(change => change.id !== cohort?.id)) await send({ action: "save", section: "cohorts", id: change.id, values: change.values }, "상품과 기수 모집 일정을 저장했습니다.");
      setCohortDrafts({});
      setDirty(false);
      setValidationAttempted(false); setNativeErrors([]);
      if (!row?.id) back();
    } catch (cause) { setError((cause as Error).message); }
  }
  return <div className={"product-editor" + (tab === "curriculum" ? " curriculum-editing" : "")}>
    <PageHeader title={row ? "상품 수정" : "상품 등록"} description={t(row, "title") || "상품 정보·상세페이지·제공 자료·판매 조건을 입력하세요."} eyebrow="PRODUCT EDITOR" actions={<>{row && <Link className="btn" href="/admin/purchase-onboarding">결제 후 안내 설정</Link>}{Boolean(row?.slug) && <Link className="btn" href={"/classes/" + t(row, "slug")} target="_blank">고객 화면 미리보기</Link>}</>} />
    <form ref={formRef} noValidate onSubmit={submit} onChange={updatePreview}>
      <div className="editor-layout"><div className="editor-main"><section className="panel">
        <div className="tabs" role="tablist" aria-label="상품 편집 영역">{groups.map(([key, label]) => <button key={key} id={"product-tab-" + key} type="button" role="tab" aria-selected={tab === key} aria-controls={"product-panel-" + key} className={"tab " + (tab === key ? "active" : "") + (inputErrors.some(item => item.tab === key) ? " has-error" : "")} onClick={() => setTab(key)}>{label}{inputErrors.some(item => item.tab === key) && <span className="product-error-badge" aria-label="입력 확인 필요">!</span>}</button>)}</div>
        {inputErrors.length > 0 && <div className="product-validation-summary" role="alert"><b>표시된 항목을 입력해야 저장할 수 있습니다.</b><p>작성 중으로 보관하려면 판매 상태를 ‘작성 중’으로 선택해 주세요.</p><ul>{inputErrors.map((issue, index) => <li key={`${issue.field}-${index}`}><button type="button" onClick={() => focusError(issue)}>{issue.message}</button></li>)}</ul></div>}
        <div className="section-pad" id="product-panel-basic" data-tab="basic" role="tabpanel" aria-labelledby="product-tab-basic" hidden={tab !== "basic"}>
          <ProductSaleCheck sale={sale} cohort={cohort} />
          <PageSection title="기본 정보" className="product-basic-section"><div className="form-grid">
            {field("title", "상품명", true)}
            {field("category", "상품 유형")}
            <AdminSelect label="판매 상태" aria-label="판매 상태" name="status" defaultValue={t(row, "status") || "draft"} disabled={pending}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</AdminSelect>
            {field("summary", "상품 한 줄 소개", true)}
            {field("regular_price", "정가 · 원")}
            {field("list_price", "상품 기본 판매가 · 원", false, "무료 클래스는 0원입니다. 기수별 실제 결제 금액은 기수·회차 관리에서 설정합니다.")}
            <AdminInput label="모집 시작 · KST" aria-label="모집 시작 · KST" error={fieldError("recruitment_start_at")} key={cohortId + "-start"} name="recruitment_start_at" type="datetime-local" value={cohortDrafts[cohortId]?.recruitment_start_at ?? kstInput(cohort?.recruitment_start_at)} onChange={event => setCohortDrafts(current => ({ ...current, [cohortId]: { ...current[cohortId], recruitment_start_at: event.target.value } }))} disabled={pending} />
            <AdminInput label="모집 마감 · KST" aria-label="모집 마감 · KST" error={fieldError("recruitment_end_at")} key={cohortId + "-end"} name="recruitment_end_at" type="datetime-local" value={cohortDrafts[cohortId]?.recruitment_end_at ?? kstInput(cohort?.recruitment_end_at)} onChange={event => setCohortDrafts(current => ({ ...current, [cohortId]: { ...current[cohortId], recruitment_end_at: event.target.value } }))} disabled={pending} />
          </div></PageSection>
          <p className="meta product-cohort-hint">{cohort ? `현재 ${t(cohort, "name")}의 모집 일정입니다. 수강·권한 탭에서 기수를 선택할 수 있으며 변경한 기수 일정은 함께 저장됩니다.` : "연결 기수가 없는 무료 클래스는 모집 일정을 비워 두면 기수를 만들지 않습니다. 그 외에는 상품을 저장하면 기본 기수가 생성되고 입력한 모집 일정이 함께 적용됩니다."}</p>
          <h3>상품 썸네일</h3><div className="upload-box product-upload"><Download aria-hidden="true" /><p>썸네일 이미지를 선택하세요.</p><UploadField name="thumbnail_url" value={String(metadata.thumbnail_url || metadata.thumbnailUrl || "")} image disabled={pending} onChange={() => setDirty(true)} /><p className="meta">권장 비율 16:9 · PNG/JPG/WebP</p></div>
          <div className="notice mt16">썸네일과 상세페이지 이미지는 별도로 관리합니다. 디지털 자료도 상품 정보와 제공 자료를 각각 등록해 주세요.</div>
          <details className="product-extra mt24"><summary>추가 상품 정보</summary><div className="form-grid mt16">{field("instructor_name", "강사명")}{field("schedule_label", "일정 안내")}</div></details>
        </div>
        <div className="section-pad" id="product-panel-detail" data-tab="detail" role="tabpanel" aria-labelledby="product-tab-detail" hidden={tab !== "detail"}>
          <h2 className="mb8">상세페이지 등록</h2><p className="meta detail-upload-intro">이미지 묶음 또는 HTML 파일 중 한 가지 방식을 선택해 등록하세요.</p>
          <div data-validation-field="detail_content" tabIndex={-1} aria-invalid={Boolean(fieldError("detail_content"))} aria-describedby={fieldError("detail_content") ? "product-detail-error" : undefined} className={fieldError("detail_content") ? "product-invalid-group" : undefined}>
          {fieldError("detail_content") && <p id="product-detail-error" className="product-field-error">{fieldError("detail_content")}</p>}
          <div className="detail-mode-tabs" role="tablist" aria-label="상세페이지 등록 방식">
            <button type="button" role="tab" aria-selected={detailMode === "image"} className={detailMode === "image" ? "active" : ""} onClick={() => { setDetailMode("image"); setDirty(true); }}><ImageIcon aria-hidden="true" />이미지 상세페이지</button>
            <button type="button" role="tab" aria-selected={detailMode === "html"} className={detailMode === "html" ? "active" : ""} onClick={() => { setDetailMode("html"); setDirty(true); }}><Code2 aria-hidden="true" />HTML 상세페이지</button>
          </div>
          <input type="hidden" name="detail_html_document" value={detailMode === "html" ? htmlSource : ""} />
          <input type="hidden" name="description" value={t(row, "description")} />
          {detailMode === "html" && <>
            <div className={`upload-box html-detail-upload${htmlSource ? " has-file" : ""}`}><Download aria-hidden="true" /><div><b>{htmlSource ? "HTML 파일이 등록되었습니다" : "상세페이지 HTML 파일을 선택하세요"}</b><p className="meta">HTML·HTM · CSS 유지 · 스크립트·폼 실행 차단</p></div><label className="btn upload-label"><input type="file" accept=".html,.htm,text/html" disabled={pending} onChange={async event => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; setError(""); if (!/\.html?$/i.test(file.name)) { setError("HTML 또는 HTM 파일을 선택해 주세요."); input.value = ""; return; } try { if (file.size > 3_000_000) throw new Error("HTML 파일은 3MB 이하로 등록해 주세요."); const source = validateProductDocument(await file.text()); const clean = sanitizeProductHtml(source); if (!clean.trim()) throw new Error("등록 가능한 HTML 본문이 없습니다. 파일 내용을 확인해 주세요."); setHtmlSource(source); setHtmlFilename(file.name.normalize("NFC")); setDirty(true); } catch (cause) { setError((cause as Error).message || "HTML 파일을 읽지 못했습니다. 다시 선택해 주세요."); } finally { input.value = ""; } }} />{htmlSource ? "다른 HTML 파일로 교체" : "HTML 파일 선택"}</label><p className="html-upload-status" role="status">{htmlFilename ? `${htmlFilename} · 불러오기 완료` : htmlSource ? "클릭하여 다른 파일로 교체할 수 있습니다." : "파일을 선택한 뒤 상품을 저장하면 고객 상세페이지에 반영됩니다."}</p>{htmlSource && <button className="btn small" type="button" disabled={pending} onClick={() => { setHtmlSource(""); setHtmlFilename(""); setDirty(true); }}>등록 HTML 삭제</button>}</div>
            {htmlSource && <details className="product-extra mt24"><summary>HTML 디자인 확인</summary><p className="meta mt16">스크립트와 폼 실행은 차단됩니다. CSS가 이미 제거된 기존 파일은 원본 HTML을 다시 선택해 주세요.</p><div className="product-html-preview mt16"><ProductDetailHtml html="" documentSource={htmlSource} /></div></details>}
          </>}
          {detailMode === "image" && <DetailImageGallery key={String(row?.id || "new-product")} initial={productDetailImages(metadata)} disabled={pending} onChange={() => { setDirty(true); requestAnimationFrame(updatePreview); }} onStatusChange={setDetailUploadStatus} />}
          </div>
        </div>
        {preview.category === "digital" && <div className="section-pad" id="product-panel-resources" data-tab="resources" role="tabpanel" aria-labelledby="product-tab-resources" hidden={tab !== "resources"}><DigitalContentManager row={row} pending={pending} send={send} /></div>}
        {preview.category !== "digital" && <div id="product-panel-curriculum" data-independent-editor data-tab="curriculum" role="tabpanel" aria-labelledby="product-tab-curriculum" hidden={tab !== "curriculum"} onChange={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
          {curriculumOpened && <ProductCurriculumWorkspace course={row} pending={pending} send={send} active={tab === "curriculum"} productDirty={dirty} commonResources={<ProductResources row={row} pending={pending} send={send} />} resourceCount={resourceCount} />}
        </div>}
        {preview.category !== "digital" && <div id="product-panel-cohorts" data-independent-editor data-tab="cohorts" role="tabpanel" aria-labelledby="product-tab-cohorts" hidden={tab !== "cohorts"} onChange={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
          {tab === "cohorts" && <ProductCohortWorkspace course={row} cohorts={cohorts} selectedId={cohortId} onSelect={setCohortId} pending={pending} send={send} validationErrors={Object.fromEntries(inputErrors.filter(item => item.tab === "cohorts").map(item => [item.field, item.message]))} />}
        </div>}
        <div className="section-pad" id="product-panel-access" data-tab="access" role="tabpanel" aria-labelledby="product-tab-access" hidden={tab !== "access"}>
          <ProductSaleCheck sale={sale} cohort={cohort} />
          {preview.category === "digital" && inputErrors.filter(item => item.tab === "access" && item.field.startsWith("cohort_")).map(item => <p key={item.field} className="product-field-error" data-validation-field={item.field} tabIndex={-1}>{item.message} <Link href="/admin/cohorts" target="_blank">기수·회차 관리 열기</Link></p>)}
          <h2 className="mb16">수강·기수 연결</h2><ProductField label="연결 기수"><select value={cohortId} onChange={event => setCohortId(event.target.value)} aria-label="연결 기수" disabled={!cohorts.length || pending}>{!cohorts.length && <option value="">미연결</option>}{cohorts.map(item => <option key={item.id} value={item.id}>{t(item, "name")}</option>)}</select></ProductField>
          <div className="form-grid"><ProductField label="수강 시작 기준"><div className="product-value">주문별 수강권의 시작일 기준</div></ProductField><ProductField label="연결 기수 운영 종료"><div className="product-value">{cohort?.operation_end_at ? new Date(String(cohort.operation_end_at)).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "기수에 지정된 종료일 없음"}</div></ProductField>{field("duration_label", "고객에게 보이는 수강 기간", true)}</div>
          <h3 className="mt16">구매 후 제공 항목</h3><ul className="product-entitlements mt16"><li><Check aria-hidden="true" />공개된 학습 콘텐츠·영상·퀴즈</li><li><Check aria-hidden="true" />미션 제출 및 피드백</li><li><Check aria-hidden="true" />등록된 수강생 전용 자료</li></ul>
          <div className="divider" /><div className="notice">수강 권한은 신청·결제 내역과 기수 일정에 따라 부여됩니다. 개별 수강권의 기간·회수 상태는 주문 및 회원 화면에서 확인하세요.</div><div className="row mt16"><Link className="btn" href="/admin/orders">주문·수강 권한 확인</Link><Link className="btn" href="/admin/cohorts">기수·회차 관리</Link></div>
        </div>
        <div className="section-pad" id="product-panel-publish" data-tab="publish" role="tabpanel" aria-labelledby="product-tab-publish" hidden={tab !== "publish"}>
          <section className="product-conversion-card">
            <h2>모집 마감 안내</h2>
            <input type="hidden" name="recruitment_countdown_enabled" value={showCountdown ? 'on' : 'off'} />
            <label className="row"><input type="checkbox" checked={showCountdown} disabled={pending} onChange={event => setShowCountdown(event.target.checked)} />모집 마감 카운트다운 표시</label>
            <p className="meta">기본값은 꺼짐입니다. 고객 상세 소개 영역에 선택한 기수의 모집 마감(한국 시간)을 표시하고, 마감 후에는 ‘모집 마감’으로 바뀝니다. 모집 일정이 없으면 타이머 대신 안내를 표시합니다.</p>
            <p className="meta">HTML 신청 버튼은 <code>{'href="#pp"'}</code> 또는 <code>{'data-cta="apply"'}</code>로 지정하세요. 기존 신청·결제·학습 버튼과 같은 조건으로 연결되며 임의 스크립트·폼은 계속 차단됩니다.</p>
          </section>
          <h2 className="mb16">공개 점검</h2>
          <ProductSaleCheck sale={sale} cohort={cohort} />
          <section className="product-conversion-card"><h2>목록 노출</h2>
            <input type="hidden" name="is_listed" value={listed ? "on" : "off"} />
            <label className="product-visibility-toggle"><input type="checkbox" checked={listed} onChange={event => setListed(event.target.checked)} disabled={pending} aria-describedby="product-visibility-help" />클래스 목록·홈·검색에 노출</label>
            <p id="product-visibility-help" className="meta">끄면 목록·홈·사이트 검색과 sitemap에서 제외됩니다. 판매 상태와 수강 권한은 바뀌지 않으며, 상품 URL과 모집 링크로는 계속 접근할 수 있습니다. 비밀 자료를 보호하는 설정은 아닙니다.</p>
            {!listed && <p className="notice mt16" role="status">목록 비노출 · 링크로만 접근할 수 있습니다.</p>}
          </section>
          <section className="product-conversion-card"><h2>Call to Action</h2><p className="meta">고객이 클릭할 주요 버튼과 이동할 페이지를 설정하세요.</p>
            <ProductField controlId="product-cta-price-label" label="CTA 왼쪽 문구" hint="상세페이지 하단 CTA 왼쪽에 표시됩니다. 비워 두면 ‘무료’로 표시됩니다."><input id="product-cta-price-label" name="cta_price_label" maxLength={40} defaultValue={conversion.priceLabel} placeholder="무료" disabled={pending} /></ProductField>
            <ProductField controlId="product-cta-label" label="Button Label"><input id="product-cta-label" name="cta_label" maxLength={100} defaultValue={conversion.label} placeholder="무료 웨비나 참여하기" disabled={pending} /></ProductField>
            <ProductField controlId="product-cta-url" label="Destination URL" hint="비워 두면 기존 신청·결제·학습 이동 동작을 사용합니다."><input id="product-cta-url" name="cta_url" maxLength={2048} defaultValue={conversion.url} placeholder="https://open.kakao.com/o/..." disabled={pending} /></ProductField>
            <ProductField controlId="product-cta-color" error={fieldError("cta_color")} label="CTA Button Color" hint="색상 선택 또는 #을 포함한 6자리 HEX 코드를 입력하세요."><div className="product-color-control"><input type="color" aria-label="CTA 버튼 색상 선택" value={/^#[0-9a-f]{6}$/i.test(ctaColor) ? ctaColor : DEFAULT_CTA_COLOR} onChange={event => setCtaColor(event.target.value)} disabled={pending} /><input id="product-cta-color" name="cta_color" aria-invalid={Boolean(fieldError("cta_color"))} aria-describedby={fieldError("cta_color") ? "product-cta-color-error" : undefined} value={ctaColor} onChange={event => setCtaColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" maxLength={7} required disabled={pending} /></div></ProductField>
          </section>
          <section className="product-conversion-card"><h2>Tracking integration</h2><p className="meta">상품별 광고 추적을 연결하세요.</p><ProductField controlId="product-pixel-id" error={fieldError("meta_pixel_id")} label="Meta Pixel ID (Optional)" hint="입력한 상품에만 PageView와 CTA 클릭(Lead)을 전송합니다. 구매 완료 이벤트는 결제 처리와 구분됩니다. 비워 두면 사용하지 않습니다."><input id="product-pixel-id" name="meta_pixel_id" aria-invalid={Boolean(fieldError("meta_pixel_id"))} aria-describedby={fieldError("meta_pixel_id") ? "product-pixel-id-error" : undefined} inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} defaultValue={conversion.pixelId} placeholder="Meta Pixel ID" disabled={pending} /></ProductField></section>
        </div>
      </section><div className="editor-savebar">{!["curriculum", "cohorts"].includes(tab) && row?.id && !row.archived_at && <AdminButton variant="danger" type="button" onClick={() => void removeProduct()} disabled={pending || detailUploadStatus === "uploading"}>상품 삭제</AdminButton>}<span className="dirty-note">{tab === "curriculum" ? "학습·미션·공통 자료는 각 항목의 저장 버튼으로 반영됩니다." : tab === "cohorts" ? "기수는 항목별로 저장됩니다." : dirty ? "저장하지 않은 변경사항이 있습니다." : "변경 내용을 저장하면 반영됩니다."}</span><AdminButton variant="outline" type="button" data-leaves-learning-editor onClick={close} disabled={pending || detailUploadStatus === "uploading"}>목록으로</AdminButton>{!["curriculum", "cohorts", "publish"].includes(tab) && <AdminButton variant="secondary" type="button" onClick={() => setTab("publish")} disabled={pending || detailUploadStatus === "uploading"}>공개 전 확인</AdminButton>}{!["curriculum", "cohorts"].includes(tab) && <AdminButton variant="primary" type="submit" loading={pending} disabled={detailUploadStatus !== "idle"}>{pending ? "저장 중…" : detailUploadStatus === "uploading" ? "업로드 중…" : "저장하기"}</AdminButton>}</div>{error && <AdminInlineError>{error}</AdminInlineError>}</div>
      <aside className="editor-aside"><div className="side-preview"><span className="section-code">고객에게 보이는 상품</span><div className="preview-cover mt16"><p>BRANDYACTION EDU</p><h3>{preview.title || "상품명"}</h3><p className="accent">{labels[preview.category] || "유료 클래스"}</p></div><div className="preview-meta"><b>{!previewSalePrice ? "무료" : money(previewSalePrice)}</b>{preview.regular > previewSalePrice && <s>{money(preview.regular)}</s>}</div><p className="meta mt8">{cohort ? t(cohort, "name") + " 기수 판매가" : "상품 기본 판매가"}</p><p className="meta mt8">{preview.summary || "상품 소개를 입력해 주세요."}</p><div className="divider" /><ProductSaleCheck sale={sale} cohort={cohort} /><div className="setting-line"><span>저장할 상품 설정</span><b>{statusLabels[preview.status]}</b></div><div className="setting-line"><span>제공 자료</span><b>{resourceCount}개</b></div><Link className="btn full mt16" href="/admin/cohorts">기수·회차 관리</Link></div></aside></div>
    </form>
  </div>;
}
