"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, FileText, GripVertical, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { object, type Row } from "@/lib/platform";
import { productDigitalSections, type DigitalContentItem, type DigitalContentSection } from "@/lib/product-metadata";
import type { WorkflowSend } from "../learning-workflows";
import { UploadField } from "../editor-fields";

const emptyItem = (): DigitalContentItem => ({ id: crypto.randomUUID(), title: "", type: "file", resourceId: "", videoUrl: "", body: "", durationLabel: "" });

export function DigitalContentManager({ row, pending, send }: { row?: Row; pending: boolean; send: WorkflowSend }) {
  const [sections, setSections] = useState(() => productDigitalSections(object(row, "metadata")));
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState<{ sectionId: string; item: DigitalContentItem } | null>(null);
  const [filePath, setFilePath] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawer && !dialog.open) dialog.showModal();
    if (!drawer && dialog.open) dialog.close();
  }, [drawer]);
  async function persist(next: DigitalContentSection[], success: string) {
    if (!row?.id) { setMessage("상품 기본 정보를 먼저 저장한 뒤 콘텐츠를 구성해 주세요."); return false; }
    try {
      await send({ action: "save-digital-content", courseId: row.id, sections: next }, success);
      setSections(next); setMessage(success); return true;
    } catch (error) { setMessage((error as Error).message); return false; }
  }
  async function addSection() {
    const number = sections.length + 1;
    await persist([...sections, { id: crypto.randomUUID(), title: `새 섹션 ${number}`, items: [] }], "콘텐츠 섹션을 추가했습니다.");
  }
  async function renameSection(sectionId: string, title: string) {
    const clean = title.trim();
    if (!clean) { setMessage("섹션 이름을 입력해 주세요."); return; }
    await persist(sections.map(section => section.id === sectionId ? { ...section, title: clean } : section), "섹션 이름을 저장했습니다.");
  }
  async function moveSection(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections]; [next[index], next[target]] = [next[target], next[index]];
    await persist(next, "섹션 순서를 변경했습니다.");
  }
  async function removeSection(section: DigitalContentSection) {
    if (!window.confirm(`「${section.title}」 섹션과 포함된 콘텐츠를 삭제할까요?`)) return;
    const next = sections.filter(item => item.id !== section.id);
    if (!await persist(next, "섹션을 삭제했습니다.")) return;
    for (const resourceId of section.items.filter(item => item.type === "file").map(item => item.resourceId)) {
      try { await send({ action: "delete-product-resource", courseId: row!.id, resourceId }, "연결 파일을 정리했습니다."); } catch {}
    }
  }
  function openItem(sectionId: string, item?: DigitalContentItem) {
    setFilePath(""); setUploadStatus("idle"); setMessage("");
    setDrawer({ sectionId, item: item ? { ...item } : emptyItem() });
  }
  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drawer || !row?.id || uploadStatus !== "idle") return;
    const form = new FormData(event.currentTarget);
    const item = { ...drawer.item, title: String(form.get("title") || "").trim(), type: String(form.get("type") || "file") as "file" | "video", videoUrl: String(form.get("videoUrl") || "").trim(), body: String(form.get("body") || "").trim(), durationLabel: String(form.get("durationLabel") || "").trim() };
    if (!item.title) { setMessage("콘텐츠 제목을 입력해 주세요."); return; }
    if (item.type === "file") {
      if (!item.resourceId && !filePath) { setMessage("업로드할 파일을 선택해 주세요."); return; }
      if (filePath) {
        try {
          const saved = await send({ action: "save-product-resource", courseId: row.id, resourceId: item.resourceId || undefined, resourceName: String(form.get("fileName") || item.title), storagePath: filePath, accessScope: "purchaser" }, "구매자 전용 파일을 저장했습니다.");
          item.resourceId = String((saved.resource as { id?: string } | undefined)?.id || item.resourceId);
        } catch (error) { setMessage((error as Error).message); return; }
      }
      item.videoUrl = "";
    } else {
      if (!/^https:\/\//.test(item.videoUrl)) { setMessage("YouTube 또는 Vimeo https 주소를 입력해 주세요."); return; }
      item.resourceId = "";
    }
    const next = sections.map(section => section.id !== drawer.sectionId ? section : { ...section, items: section.items.some(value => value.id === item.id) ? section.items.map(value => value.id === item.id ? item : value) : [...section.items, item] });
    if (await persist(next, "디지털 콘텐츠를 저장했습니다.")) setDrawer(null);
  }
  async function removeItem(sectionId: string, item: DigitalContentItem) {
    if (!window.confirm(`「${item.title}」 콘텐츠를 삭제할까요?`)) return;
    const next = sections.map(section => section.id === sectionId ? { ...section, items: section.items.filter(value => value.id !== item.id) } : section);
    if (!await persist(next, "콘텐츠를 삭제했습니다.")) return;
    if (item.type === "file" && item.resourceId) try { await send({ action: "delete-product-resource", courseId: row!.id, resourceId: item.resourceId }, "연결 파일을 정리했습니다."); } catch {}
  }
  async function moveItem(sectionId: string, index: number, offset: -1 | 1) {
    const next = sections.map(section => {
      if (section.id !== sectionId) return section;
      const items = [...section.items], target = index + offset;
      if (target < 0 || target >= items.length) return section;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...section, items };
    });
    await persist(next, "콘텐츠 순서를 변경했습니다.");
  }
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  return <>
    <div className="between digital-content-heading"><div><h2>콘텐츠 리스트</h2><p className="meta mt8">자료를 섹션별로 구성하고 고객에게 보일 순서를 관리합니다.</p></div><span className="badge">{sections.length}개 섹션 · {total}개 콘텐츠</span></div>
    {!row?.id && <p className="notice mt16">상품 기본 정보를 저장한 뒤 파일과 콘텐츠 섹션을 등록할 수 있습니다.</p>}
    <div className="digital-section-list mt24">{sections.map((section, sectionIndex) => <section className="digital-section-card" key={section.id}>
      <header><GripVertical aria-hidden="true" /><input aria-label="섹션 이름" defaultValue={section.title} maxLength={80} onBlur={event => { if (event.target.value.trim() !== section.title) void renameSection(section.id, event.target.value); }} disabled={pending} /><div className="row"><button className="icon-btn" type="button" aria-label="섹션 위로" onClick={() => void moveSection(sectionIndex, -1)} disabled={pending || sectionIndex === 0}><ChevronUp /></button><button className="icon-btn" type="button" aria-label="섹션 아래로" onClick={() => void moveSection(sectionIndex, 1)} disabled={pending || sectionIndex === sections.length - 1}><ChevronDown /></button><button className="icon-btn" type="button" aria-label="콘텐츠 추가" onClick={() => openItem(section.id)} disabled={pending}><Plus /></button><button className="icon-btn danger" type="button" aria-label="섹션 삭제" onClick={() => void removeSection(section)} disabled={pending}><Trash2 /></button></div></header>
      {section.items.length ? <div className="digital-item-list">{section.items.map((item, itemIndex) => <div className="digital-item-row" key={item.id}>{item.type === "video" ? <Play aria-hidden="true" /> : <FileText aria-hidden="true" />}<div><b>{item.title}</b>{item.body && <p>{item.body}</p>}</div><span className="spacer"/><small>{item.durationLabel}</small><div className="row"><button className="icon-btn" type="button" aria-label="콘텐츠 위로" onClick={() => void moveItem(section.id, itemIndex, -1)} disabled={pending || itemIndex === 0}><ChevronUp /></button><button className="icon-btn" type="button" aria-label="콘텐츠 아래로" onClick={() => void moveItem(section.id, itemIndex, 1)} disabled={pending || itemIndex === section.items.length - 1}><ChevronDown /></button><button className="icon-btn" type="button" aria-label="콘텐츠 수정" onClick={() => openItem(section.id, item)} disabled={pending}><Pencil /></button><button className="icon-btn danger" type="button" aria-label="콘텐츠 삭제" onClick={() => void removeItem(section.id, item)} disabled={pending}><Trash2 /></button></div></div>)}</div> : <p className="digital-empty">콘텐츠가 없습니다. 콘텐츠를 추가해 주세요.</p>}
    </section>)}</div>
    <div className="row digital-content-actions"><button className="btn" type="button" onClick={() => void addSection()} disabled={pending || !row?.id || sections.length >= 30}>섹션 추가</button>{sections.length > 0 && <button className="btn primary" type="button" onClick={() => openItem(sections[0].id)} disabled={pending}>콘텐츠 추가</button>}</div>
    {message && <p className="notice mt16" role="status">{message}</p>}
    <dialog className="drawer digital-content-drawer" ref={dialogRef} onCancel={event => { event.preventDefault(); setDrawer(null); }}><form className="order-detail-shell" onSubmit={saveItem}><header className="dialog-head"><h2>{drawer && sections.some(section => section.items.some(item => item.id === drawer.item.id)) ? "콘텐츠 수정" : "콘텐츠 추가"}</h2><button className="icon-btn" type="button" aria-label="콘텐츠 창 닫기" onClick={() => setDrawer(null)}><X /></button></header>{drawer && <div className="dialog-body digital-content-form"><label className="field"><span className="field-label">제목 *</span><input name="title" required maxLength={200} defaultValue={drawer.item.title} placeholder="디지털 상품 제목을 입력해 주세요" /></label><div className="grid2"><label className="field"><span className="field-label">콘텐츠 유형</span><select name="type" value={drawer.item.type} onChange={event => setDrawer(current => current ? { ...current, item: { ...current.item, type: event.target.value as "file" | "video" } } : current)}><option value="file">디지털 자료</option><option value="video">동영상</option></select></label><label className="field"><span className="field-label">재생 시간</span><input name="durationLabel" maxLength={40} defaultValue={drawer.item.durationLabel} placeholder="예: 00:22:23" /></label></div>{drawer.item.type === "file" ? <><label className="field"><span className="field-label">파일 표시 이름 *</span><input name="fileName" maxLength={240} defaultValue={drawer.item.title} /></label><div className="digital-file-upload"><UploadField name="digital_content_file" value="" image={false} disabled={pending} dropzone onChange={setFilePath} onStatusChange={setUploadStatus} />{drawer.item.resourceId && !filePath && <p className="meta">현재 등록 파일을 유지합니다. 새 파일을 선택하면 교체됩니다.</p>}</div></> : <label className="field"><span className="field-label">영상 URL *</span><input name="videoUrl" type="url" required defaultValue={drawer.item.videoUrl} placeholder="https://youtube.com/..." /></label>}<label className="field"><span className="field-label">내용</span><textarea name="body" rows={10} maxLength={5000} defaultValue={drawer.item.body} placeholder="콘텐츠 설명과 이용 안내를 입력해 주세요." /></label></div>}<footer className="dialog-foot"><button className="btn" type="button" onClick={() => setDrawer(null)}>취소</button><button className="btn primary" disabled={pending || uploadStatus === "uploading"}>{pending ? "저장 중…" : "콘텐츠 저장"}</button></footer></form></dialog>
  </>;
}
