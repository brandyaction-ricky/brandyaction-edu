"use client";
/* eslint-disable @next/next/no-img-element -- administrator-selected local image previews use blob URLs */

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronUp, Eye, GripVertical, ImagePlus, Link2, Pencil, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import type { CurriculumLesson, CurriculumWeek } from "@/app/data";
import { useAdminUnsavedChanges } from "./use-admin-unsaved-changes";
import {
  createEmptyProduct,
  loadAdminProduct,
  loadAdminProducts,
  ProductEditorData,
  ProductImage,
  ProductSummary,
  deleteAdminProduct,
  saveAdminProduct,
} from "@/lib/product-admin";

function normalizeCurriculum(weeks: CurriculumWeek[]) {
  let day = 0;
  return weeks.map((week, weekIndex) => ({
    ...week,
    label: `${weekIndex + 1}주차`,
    lessons: week.lessons.map((lesson) => ({ ...lesson, day: ++day })),
  }));
}

function move<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

const statusLabel = { published: "판매 중", draft: "판매 중지", archived: "보관" } as const;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const editorSignature = (value: ProductEditorData | null) => value ? JSON.stringify({ draft: value.draft, thumbnail: value.thumbnail, images: value.images, pixels: value.pixels, curriculum: value.curriculum }) : "";

export function AdminProductsManager() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [editor, setEditor] = useState<ProductEditorData | null>(null);
  const [tab, setTab] = useState("basic");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [dragImage, setDragImage] = useState<number | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<string[]>([]);
  const [resourceFiles, setResourceFiles] = useState<Map<string, File>>(new Map());
  const [savedSignature, setSavedSignature] = useState("");
  const hasUnsavedChanges = Boolean(editor) && (editorSignature(editor) !== savedSignature || resourceFiles.size > 0);
  useAdminUnsavedChanges(hasUnsavedChanges && !saving);

  const refresh = async () => {
    const rows = await loadAdminProducts();
    setProducts(rows);
    return rows;
  };

  useEffect(() => {
    let active = true;
    loadAdminProducts().then((rows) => { if (active) setProducts(rows); }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "상품 목록을 불러오지 못했습니다.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? products.filter((product) => [product.title, product.instructorName, product.slug].some((value) => value.toLowerCase().includes(keyword))) : products;
  }, [products, query]);

  const openProduct = async (id: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await loadAdminProduct(id);
      data.curriculum = normalizeCurriculum(data.curriculum);
      setEditor(data);
      setSavedSignature(editorSignature(data));
      setExpandedWeeks(data.curriculum.map((week) => week.id));
      setResourceFiles(new Map());
      setTab("basic");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상품을 열지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    const data = createEmptyProduct();
    setEditor(data);
    setSavedSignature(editorSignature(data));
    setExpandedWeeks([]);
    setResourceFiles(new Map());
    setTab("basic");
    setError("");
  };

  const save = async () => {
    if (!editor || saving) return;
    const title = editor.draft.title.trim();
    const slug = editor.draft.slug.trim();
    const courseCode = editor.draft.courseCode.trim();
    const paidPrice = Number(editor.draft.listPrice.replace(/[^0-9]/g, ""));
    if (!title || !slug || !courseCode) {
      setTab("basic");
      setError("상품명·상품 URL·상품 코드는 필수입니다. 입력하지 않은 항목을 확인해 주세요.");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>(!title ? '[data-product-field="title"]' : !slug ? '[data-product-field="slug"]' : '[data-product-field="courseCode"]')?.focus());
      return;
    }
    if (editor.draft.programType === "paid" && (!Number.isFinite(paidPrice) || paidPrice <= 0)) {
      setTab("basic");
      setError("유료 클래스의 기본 정가는 1원 이상으로 입력해 주세요.");
      window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-product-field="listPrice"]')?.focus());
      return;
    }
    const recruitmentStart = editor.draft.recruitmentStartAt ? new Date(editor.draft.recruitmentStartAt).getTime() : null;
    const recruitmentEnd = editor.draft.recruitmentEndAt ? new Date(editor.draft.recruitmentEndAt).getTime() : null;
    if (editor.draft.recruitmentStatus === "recruiting" && recruitmentEnd && recruitmentEnd <= Date.now()) {
      setTab("basic");
      setError("모집 진행 상태의 모집 마감일은 현재 시각 이후여야 합니다.");
      return;
    }
    if (recruitmentStart && recruitmentEnd && recruitmentStart >= recruitmentEnd) {
      setTab("basic");
      setError("모집 마감일은 모집 시작일보다 뒤여야 합니다.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const courseId = await saveAdminProduct({ course: editor.draft, thumbnail: editor.thumbnail, images: editor.images, pixels: editor.pixels, curriculum: normalizeCurriculum(editor.curriculum), resourceFiles });
      await refresh();
      const reloaded = await loadAdminProduct(courseId);
      reloaded.curriculum = normalizeCurriculum(reloaded.curriculum);
      setEditor(reloaded);
      setSavedSignature(editorSignature(reloaded));
      setExpandedWeeks(reloaded.curriculum.map((week) => week.id));
      setResourceFiles(new Map());
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상품을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const backToList = () => {
    if (hasUnsavedChanges && !window.confirm("저장하지 않은 상품 변경사항을 버리고 목록으로 이동할까요?")) return;
    setEditor(null);
    setSavedSignature("");
    setResourceFiles(new Map());
  };

  const removeProduct = async () => {
    if (!editor?.draft.id || deleting) return;
    if (!window.confirm("이 상품을 삭제할까요? 주문·수강권·후기가 연결된 상품은 삭제되지 않습니다.")) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAdminProduct(editor.draft.id);
      await refresh();
      setEditor(null);
      setSavedSignature("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상품을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const removeListedProduct = async (product: ProductSummary) => {
    if (deleting) return;
    if (!window.confirm(`‘${product.title}’ 상품을 삭제할까요?\n\n주문·수강권·후기가 연결된 상품은 삭제되지 않으며, 이 경우 판매 상태를 ‘보관’으로 변경해야 합니다.`)) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAdminProduct(product.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상품을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !editor && !products.length) return <section className="admin-panel admin-loading-state"><strong>상품 정보를 불러오는 중입니다.</strong></section>;

  if (!editor) return <>
    <div className="summary-chips">
      <span>전체 상품 <strong>{products.length}</strong></span>
      <span>무료 클래스 <strong>{products.filter((product) => product.programType === "free").length}</strong></span>
      <span>유료 클래스 <strong>{products.filter((product) => product.programType === "paid").length}</strong></span>
      <span>판매 중 <strong>{products.filter((product) => product.status === "published").length}</strong></span>
      <span>상세 이미지 <strong>{products.reduce((sum, product) => sum + product.imageCount, 0)}</strong></span>
      <span>전체 커리큘럼 <strong>{products.reduce((sum, product) => sum + product.lessonCount, 0)}개</strong></span>
    </div>
    <section className="admin-panel product-overview-panel">
      <div className="admin-toolbar product-toolbar product-list-actions">
        <div><strong>등록 상품</strong><span>상품을 추가하면 클래스 목록에, 결제·수강권 발급 후에는 고객의 내 클래스에 반영됩니다.</span></div>
        <div className="product-list-buttons"><label className="search-box"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="상품명·강사·URL 검색"/></label><button className="admin-primary" onClick={startNew}><Plus/> 새 상품 추가</button></div>
      </div>
      <div className="product-management-list">
        {visible.map((product, index) => <div className="product-management-row" key={product.id}>
          <span className="product-name">{product.thumbnailUrl ? <img className="product-thumb product-thumb-image" src={product.thumbnailUrl} alt=""/> : <b className={`product-thumb thumb-${index % 3}`}>{String(index + 1).padStart(2, "0")}</b>}<span><em className={`program-type-badge ${product.programType}`}>{product.programType === "free" ? "무료" : "유료"}</em><strong>{product.title}</strong><small>{product.instructorName} · /classes/{product.slug}</small></span></span>
          <div><small>판매 상태</small><span className={`status-label ${product.status === "published" ? "success" : "planned"}`}>{statusLabel[product.status]}</span></div>
          <div><small>가격</small><strong>{product.listPrice.toLocaleString()}원</strong></div>
          <div><small>상세페이지</small><strong>이미지 {product.imageCount}장</strong></div>
          <div><small>커리큘럼</small><strong>{product.weekCount}주 · {product.lessonCount}개</strong></div>
          <div className="product-row-actions">
            <button className="manage-button" onClick={() => void openProduct(product.id)} disabled={deleting}><Pencil/> 수정</button>
            <button className="manage-button danger" onClick={() => void removeListedProduct(product)} disabled={deleting}><Trash2/> 삭제</button>
          </div>
        </div>)}
        {!visible.length && <div className="product-empty-state"><strong>{products.length ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}</strong><p>새 상품 추가 버튼으로 첫 클래스를 등록해 주세요.</p></div>}
      </div>
      {error && <p className="admin-save-error" role="alert">{error}</p>}
    </section>
  </>;

  const { draft, thumbnail, images, curriculum, pixels } = editor;
  const lessonCount = curriculum.reduce((sum, week) => sum + week.lessons.length, 0);
  const setDraft = (patch: Partial<typeof draft>) => setEditor({ ...editor, draft: { ...draft, ...patch } });
  const setThumbnail = (next: ProductImage | null) => setEditor({ ...editor, thumbnail: next });
  const setImages = (next: ProductImage[]) => setEditor({ ...editor, images: next });
  const setCurriculum = (next: CurriculumWeek[]) => setEditor({ ...editor, curriculum: normalizeCurriculum(next) });

  const uploadThumbnail = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setError("썸네일은 JPG, PNG, WEBP 파일만 등록할 수 있습니다.");
      return;
    }
    if (file.size > 5_000_000) {
      setError("썸네일은 5MB 이하로 등록해 주세요.");
      return;
    }
    if (thumbnail?.file && thumbnail.url.startsWith("blob:")) URL.revokeObjectURL(thumbnail.url);
    setError("");
    setThumbnail({ file, url: URL.createObjectURL(file) });
  };
  const removeThumbnail = () => {
    if (thumbnail?.file && thumbnail.url.startsWith("blob:")) URL.revokeObjectURL(thumbnail.url);
    setThumbnail(null);
  };

  const uploadImages = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    const invalidType = selected.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
    const oversized = selected.some((file) => file.size > 5_000_000);
    if (invalidType || oversized) {
      setError(invalidType ? "상세 이미지는 JPG, PNG, WEBP 파일만 등록할 수 있습니다." : "상세 이미지는 파일당 5MB 이하로 등록해 주세요.");
    }
    const files = selected.filter((file) => ALLOWED_IMAGE_TYPES.has(file.type) && file.size <= 5_000_000).slice(0, 20 - images.length);
    setImages([...images, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 20));
    event.target.value = "";
  };
  const dropImage = (event: DragEvent, target: number) => {
    event.preventDefault();
    if (dragImage === null) return;
    setImages(move(images, dragImage, target));
    setDragImage(null);
  };
  const moveImage = (index: number, direction: -1 | 1) => setImages(move(images, index, index + direction));

  const updateWeek = (weekId: string, patch: Partial<CurriculumWeek>) => setCurriculum(curriculum.map((week) => week.id === weekId ? { ...week, ...patch } : week));
  const addWeek = () => {
    const id = `new-week-${Date.now()}`;
    setCurriculum([...curriculum, { id, label: "", title: "새 주차", goal: "이번 주 완성 목표", lessons: [] }]);
    setExpandedWeeks([...expandedWeeks, id]);
  };
  const addLesson = (weekId: string) => {
    const id = `new-lesson-${Date.now()}`;
    setCurriculum(curriculum.map((week) => week.id === weekId ? { ...week, lessons: [...week.lessons, { id, day: 0, title: "새 강의", description: "학습 내용을 입력하세요.", kind: "VOD", duration: "20분", contentUrl: "" }] } : week));
  };
  const updateLesson = (weekId: string, lessonId: string, patch: Partial<CurriculumLesson>) => setCurriculum(curriculum.map((week) => week.id === weekId ? { ...week, lessons: week.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...patch } : lesson) } : week));
  const uploadResource = (weekId: string, lessonId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateLesson(weekId, lessonId, { resourceName: file.name, resourcePath: undefined });
    setResourceFiles((current) => { const next = new Map(current); next.set(lessonId, file); return next; });
    event.target.value = "";
  };

  return <div className="admin-editor-wrap">
    <div className="editor-head">
      <button onClick={backToList}><ArrowLeft/> 상품 목록</button>
      <div><strong>{draft.title || "새 상품"}</strong><span className={`status-label ${draft.status === "published" ? "success" : "planned"}`}>{draft.id ? statusLabel[draft.status] : "신규 등록"}</span></div>
      <div>{draft.id && <button className="admin-outline product-delete-button" onClick={() => void removeProduct()} disabled={deleting || saving}><Trash2/> {deleting ? "삭제 중..." : "상품 삭제"}</button>}{draft.id && <Link className="admin-outline" href={`/admin/cohorts?course=${encodeURIComponent(draft.id)}`}>기수·회차 관리</Link>}{draft.id && <Link className="admin-outline" href={`/classes/${draft.slug}`}><Eye/> 미리보기</Link>}<button className="admin-primary" onClick={save} disabled={saving || deleting}><Save/> {saving ? "저장 중..." : draft.id ? "변경 저장" : "상품 등록"}</button></div>
    </div>
    <div className="editor-tabs">{[["basic", "기본 정보"], ["detail", "이미지 상세페이지"], ["curriculum", "커리큘럼"], ["pixel", "픽셀·전환 추적"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "detail" && <em>{images.length}</em>}</button>)}</div>

    {tab === "basic" && <div className="editor-grid"><section className="admin-panel admin-form-card"><div className="form-card-head"><div><h2>상품 기본 정보</h2><p>판매 중으로 저장하면 클래스 목록과 상품 상세페이지에 즉시 반영됩니다.</p></div><span className="completion-chip"><Check/> DB 연결</span></div><div className="admin-field-grid">
      <div className="field-full product-thumbnail-field"><span>상품 썸네일</span><div className="product-thumbnail-editor"><div className={`product-thumbnail-preview ${thumbnail ? "has-image" : ""}`}>{thumbnail ? <img src={thumbnail.url} alt="상품 썸네일 미리보기"/> : <><ImagePlus/><small>썸네일 미등록</small></>}</div><div className="product-thumbnail-actions"><strong>목록 카드와 상품 상세 상단에 노출됩니다.</strong><p>가로형 4:3 또는 16:9 비율 권장 · JPG, PNG, WEBP · 5MB 이하</p><span><label className="admin-outline thumbnail-upload-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadThumbnail}/><ImagePlus/> {thumbnail ? "이미지 교체" : "이미지 등록"}</label>{thumbnail && <button type="button" className="admin-outline thumbnail-remove-button" onClick={removeThumbnail}><Trash2/> 삭제</button>}</span></div></div></div>
      <label className="field-full">상품명<input data-product-field="title" value={draft.title} onChange={(event) => setDraft({ title: event.target.value })}/></label>
      <label>강사명<input value={draft.instructorName} onChange={(event) => setDraft({ instructorName: event.target.value })}/></label>
      <label>클래스 유형<select value={draft.programType} onChange={(event) => setDraft({ programType: event.target.value as typeof draft.programType, ...(event.target.value === "free" ? { listPrice: "0" } : {}) })}><option value="free">무료 클래스</option><option value="paid">유료 클래스</option></select></label>
      <label>기본 정가<input data-product-field="listPrice" inputMode="numeric" value={draft.programType === "free" ? "0" : draft.listPrice} disabled={draft.programType === "free"} onChange={(event) => setDraft({ listPrice: event.target.value })}/>{draft.programType === "free" && <small>무료 클래스는 0원으로 자동 저장됩니다.</small>}</label>
      <label>카테고리<input value={draft.category} onChange={(event) => setDraft({ category: event.target.value })}/></label>
      <label>수강기간 표기<input value={draft.durationLabel} onChange={(event) => setDraft({ durationLabel: event.target.value })}/></label>
      <label className="field-full">한 줄 소개<textarea value={draft.summary} onChange={(event) => setDraft({ summary: event.target.value })}/></label>
      <label>상품 URL<input data-product-field="slug" value={draft.slug} onChange={(event) => setDraft({ slug: event.target.value.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase() })}/></label>
      <label>상품 코드<input data-product-field="courseCode" value={draft.courseCode} onChange={(event) => setDraft({ courseCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "_") })}/></label>
      <label>일정 표기<input value={draft.scheduleLabel} onChange={(event) => setDraft({ scheduleLabel: event.target.value })}/></label>
      <label>판매 상태<select value={draft.status} onChange={(event) => setDraft({ status: event.target.value as typeof draft.status })}><option value="draft">판매 중지</option><option value="published">판매 중</option><option value="archived">보관</option></select></label>
      <label>모집 상태<select value={draft.recruitmentStatus} onChange={(event) => {
        const recruitmentStatus = event.target.value as typeof draft.recruitmentStatus;
        setDraft({ recruitmentStatus, ...(recruitmentStatus === "recruiting" ? { status: "published" as const } : {}) });
      }}><option value="preparing">모집 준비</option><option value="recruiting">모집 진행 · 신청 버튼 활성</option><option value="closed">모집 마감</option></select><small>{draft.hasLinkedCohort ? "연결된 최신 기수에 저장됩니다." : "상품 등록 시 1기 운영 정보가 자동 생성되어 바로 연결됩니다."}</small></label>
      <label>모집 시작<input type="datetime-local" value={draft.recruitmentStartAt} onChange={(event) => setDraft({ recruitmentStartAt: event.target.value })}/><small>미래 일시를 지정하면 해당 시각부터 신청할 수 있습니다.</small></label>
      <label>모집 마감<input type="datetime-local" value={draft.recruitmentEndAt} onChange={(event) => setDraft({ recruitmentEndAt: event.target.value })}/><small>비워 두면 마감 제한 없이 모집합니다.</small></label>
      <div className="field-full recruitment-connection-note"><strong>신청 버튼 연동 기준</strong><span>판매 중 + 모집 진행 + 현재 시각이 모집 기간 안일 때 고객 화면에서 수강 신청이 활성화됩니다.</span>{draft.id ? <Link href={`/admin/cohorts?course=${encodeURIComponent(draft.id)}`}>기수 상세 설정</Link> : <span>등록 후 기수·회차에서 정원과 운영 일정을 추가할 수 있습니다.</span>}</div>
    </div></section><aside className="admin-panel product-side-card"><span>노출 경로</span><div className={`mini-product-preview ${thumbnail ? "has-thumbnail" : ""}`} style={thumbnail ? { backgroundImage: `url(${thumbnail.url})` } : undefined}><b>URL</b><small>고객 상세페이지</small><strong>/classes/{draft.slug}</strong><em>{statusLabel[draft.status]}</em></div><p>‘내 클래스’에는 결제 또는 관리자가 발급한 활성 수강권이 있는 고객에게만 노출됩니다.</p></aside></div>}

    {tab === "detail" && <section className="admin-panel detail-image-editor"><div className="form-card-head"><div><h2>이미지형 상세페이지</h2><p>드래그하거나 위·아래 버튼을 눌러 고객 화면의 노출 순서를 바꿀 수 있습니다.</p></div><span className="image-count">{images.length} / 20장</span></div><div className="detail-editor-grid"><label className="detail-dropzone"><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={uploadImages}/><ImagePlus/><strong>상세 이미지를 업로드하세요</strong><span>JPG, PNG, WEBP · 장당 5MB 이하</span><b>이미지 선택</b></label><div className="detail-image-guide"><strong>순서 변경 방법</strong><p>PC에서는 항목을 잡아 드래그하고, 모바일에서는 위·아래 버튼을 사용하세요. 저장하면 이 순서가 고객 상세페이지에 그대로 반영됩니다.</p></div></div>
      <div className="uploaded-image-list sortable-image-list">{images.map((image, index) => <article key={`${image.id || image.url}-${index}`} draggable onDragStart={() => setDragImage(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropImage(event, index)} className={dragImage === index ? "is-dragging" : ""}>
        <GripVertical/><img src={image.url} alt={`상세 이미지 ${index + 1}`}/><div><strong>{String(index + 1).padStart(2, "0")} · 상세 이미지</strong><small>고객 페이지 노출 순서 {index + 1}</small></div><span className="image-order-actions"><button onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="위로 이동"><ArrowUp/></button><button onClick={() => moveImage(index, 1)} disabled={index === images.length - 1} aria-label="아래로 이동"><ArrowDown/></button><button onClick={() => setImages(images.filter((_, itemIndex) => itemIndex !== index))} aria-label="이미지 삭제"><Trash2/></button></span>
      </article>)}{!images.length && <div className="empty-image-state"><strong>등록된 상세 이미지가 없습니다.</strong><p>이미지를 추가하면 기본 상세 화면을 대체합니다.</p></div>}</div>
    </section>}

    {tab === "curriculum" && <section className="admin-panel curriculum-editor weekly-curriculum-editor"><div className="form-card-head"><div><h2>주차·강의 커리큘럼</h2><p>기존 강의 ID를 유지해 수정하므로 수강생 진도 기록이 보존됩니다.</p></div><button className="admin-primary" onClick={addWeek}><Plus/> 주차 추가</button></div><div className="curriculum-summary-bar"><div><span>전체 구성</span><strong>{curriculum.length}주 · {lessonCount}개</strong></div><div><span>콘텐츠</span><strong>VOD · 자료</strong></div><p>수강 진도가 기록된 강의는 삭제할 수 없도록 저장 단계에서 차단합니다.</p></div><div className="curriculum-week-list">{curriculum.map((week, weekIndex) => {
      const expanded = expandedWeeks.includes(week.id);
      return <article className="curriculum-week-card" key={week.id}><header><span className="week-drag"><GripVertical/></span><b>WEEK {String(weekIndex + 1).padStart(2, "0")}</b><div><input value={week.title} onChange={(event) => updateWeek(week.id, { title: event.target.value })}/><span>{week.lessons.length}개 강의</span></div><input className="week-goal-input" value={week.goal} onChange={(event) => updateWeek(week.id, { goal: event.target.value })}/><button className="week-delete" onClick={() => setCurriculum(curriculum.filter((item) => item.id !== week.id))}><Trash2/></button><button className="week-toggle" onClick={() => setExpandedWeeks(expanded ? expandedWeeks.filter((id) => id !== week.id) : [...expandedWeeks, week.id])}>{expanded ? <ChevronUp/> : <ChevronDown/>}</button></header>
        {expanded && <div className="week-lessons"><div className="lesson-editor-head"><span>일자</span><span>강의 정보</span><span>형식</span><span>콘텐츠</span><span>분량</span><span/></div>{week.lessons.map((lesson) => <div className="daily-curriculum-row" key={lesson.id}><span className="day-sequence"><GripVertical/><b>Day {lesson.day}</b></span><div className="daily-copy-fields"><input value={lesson.title} onChange={(event) => updateLesson(week.id, lesson.id, { title: event.target.value })}/><input value={lesson.description} onChange={(event) => updateLesson(week.id, lesson.id, { description: event.target.value })}/></div><select value={lesson.kind} onChange={(event) => updateLesson(week.id, lesson.id, { kind: event.target.value as CurriculumLesson["kind"] })}><option>VOD</option><option>자료</option></select>{lesson.kind === "VOD" ? <label className="lesson-link-field"><Link2/><input type="url" placeholder="YouTube·Vimeo URL" value={lesson.contentUrl || ""} onChange={(event) => updateLesson(week.id, lesson.id, { contentUrl: event.target.value })}/></label> : <label className={`lesson-file-field ${lesson.resourceName ? "has-file" : ""}`}><input type="file" onChange={(event) => uploadResource(week.id, lesson.id, event)}/><Upload/><span>{lesson.resourceName || "자료 업로드"}</span></label>}<input value={lesson.duration} onChange={(event) => updateLesson(week.id, lesson.id, { duration: event.target.value })}/><button onClick={() => updateWeek(week.id, { lessons: week.lessons.filter((item) => item.id !== lesson.id) })}><Trash2/></button></div>)}<button className="add-daily-row" onClick={() => addLesson(week.id)}><Plus/> 이 주차에 강의 추가</button></div>}
      </article>;
    })}</div></section>}

    {tab === "pixel" && <section className="admin-panel admin-form-card"><div className="form-card-head"><div><h2>픽셀·전환 추적</h2><p>상품별 상세 조회와 결제 전환에 사용할 ID를 저장합니다.</p></div><label className="toggle-row"><input type="checkbox" checked={pixels.enabled} onChange={(event) => setEditor({ ...editor, pixels: { ...pixels, enabled: event.target.checked } })}/><span/></label></div><div className="pixel-fields"><label><span><strong>Meta Pixel</strong></span><input value={pixels.meta} onChange={(event) => setEditor({ ...editor, pixels: { ...pixels, meta: event.target.value } })}/></label><label><span><strong>카카오 픽셀</strong></span><input value={pixels.kakao} onChange={(event) => setEditor({ ...editor, pixels: { ...pixels, kakao: event.target.value } })}/></label><label><span><strong>Google Analytics</strong></span><input value={pixels.google} onChange={(event) => setEditor({ ...editor, pixels: { ...pixels, google: event.target.value } })}/></label></div></section>}

    {error && <p className="admin-save-error" role="alert">{error}</p>}
    <div className={`admin-toast ${saved ? "show" : ""}`}><Check/> 상품과 상세페이지가 저장되었습니다.</div>
  </div>;
}
