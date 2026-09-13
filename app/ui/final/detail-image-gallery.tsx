"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { imagePreviewUrl } from "@/lib/qa-rules";
import type { ProductDetailImage } from "@/lib/product-metadata";

const MAX_IMAGES = 30;
const MAX_BYTES = 20 * 1024 * 1024;

async function validImageHeader(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (extension === "webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (extension === "gif") return ["GIF87a", "GIF89a"].includes(new TextDecoder().decode(bytes.slice(0, 6)));
  return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

export function DetailImageGallery({ initial, disabled, onChange, onStatusChange, allowUpload = true }: {
  allowUpload?: boolean;
  initial: ProductDetailImage[];
  disabled: boolean;
  onChange: () => void;
  onStatusChange: (status: "idle" | "uploading" | "error") => void;
}) {
  const [images, setImages] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const update = (next: ProductDetailImage[]) => { setImages(next); onChange(); };
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const next = [...images], [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    update(next);
  };
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (images.length + files.length > MAX_IMAGES) {
      setError(`상세 이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`);
      onStatusChange("error");
      return;
    }
    setUploading(true); setError(""); onStatusChange("uploading");
    const uploaded: ProductDetailImage[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        if (!file.size || file.size > MAX_BYTES) throw new Error(`${file.name}: 20MB 이하 파일을 선택해 주세요.`);
        if (!(await validImageHeader(file))) throw new Error(`${file.name}: JPG, PNG, WEBP, GIF 이미지를 선택해 주세요.`);
        const response = await fetch("/api/platform/upload", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, kind: "detail-image" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `${file.name} 업로드에 실패했습니다.`);
        const transfer = await createClient().storage.from(result.bucket).uploadToSignedUrl(result.path, result.token, file, { contentType: result.contentType });
        if (transfer.error) throw new Error(`${file.name} 전송에 실패했습니다.`);
        uploaded.push({ path: result.value, name: file.name.normalize("NFC"), alt: "" });
      } catch (cause) {
        errors.push(cause instanceof Error ? cause.message : `${file.name} 업로드에 실패했습니다.`);
      }
    }
    if (uploaded.length) update([...images, ...uploaded]);
    setUploading(false);
    if (errors.length) { setError(errors.join(" ")); onStatusChange("error"); }
    else onStatusChange("idle");
  }
  return <section className="detail-gallery" aria-labelledby="detail-gallery-title">
    <input type="hidden" name="detail_images" value={JSON.stringify(images)} />
    {(allowUpload || images.length > 0) && <div className="between detail-gallery-head">
      <div><h3 id="detail-gallery-title">이미지형 상세페이지</h3><p className="meta">등록한 이미지가 위에서 아래 순서대로 고객 상세페이지에 이어 붙습니다.</p></div>
      <strong>{images.length} / {MAX_IMAGES}장</strong>
    </div>}
    {allowUpload && <div className="detail-gallery-upload">
      <div><ImagePlus aria-hidden="true" /><b>{uploading ? "이미지를 업로드하고 있습니다…" : "상세 이미지를 업로드하세요"}</b><small>여러 장 선택 가능 · JPG · PNG · WEBP · GIF · 파일당 최대 20MB</small></div>
      <label className="btn primary upload-label"><input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif" disabled={disabled || uploading || images.length >= MAX_IMAGES} onChange={event => { void upload(event.target.files); event.currentTarget.value = ""; }} />{uploading ? "업로드 중…" : "이미지 선택"}</label>
    </div>}
    {error && <div className="notice detail-gallery-error" role="alert"><span>{error}</span><button type="button" className="btn small" onClick={() => { setError(""); onStatusChange("idle"); }}>오류 닫기 · 성공 파일 유지</button></div>}
    {images.length > 0 && <div className="detail-gallery-list">
      {images.map((image, index) => {
        const preview = imagePreviewUrl(image.path, process.env.NEXT_PUBLIC_SUPABASE_URL || "");
        return <article className={`detail-gallery-item${dragging === index ? " is-dragging" : ""}`} key={`${image.path}-${index}`} draggable={!disabled && !uploading} onDragStart={event => { setDragging(index); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)} onDragOver={event => { if (dragging !== null && dragging !== index) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => { event.preventDefault(); if (dragging === null || dragging === index) return; const next = [...images], [item] = next.splice(dragging, 1); next.splice(index, 0, item); update(next); setDragging(null); }}>
          <GripVertical className="detail-gallery-grip" aria-hidden="true" />
          {preview ? <img src={preview} alt="" /> : <div className="detail-gallery-missing">미리보기 없음</div>}
          <div className="detail-gallery-copy"><b>상세 이미지 {String(index + 1).padStart(2, "0")}</b><span>{image.name}</span><input aria-label={`${index + 1}번째 이미지 대체 문구`} value={image.alt} maxLength={500} placeholder="이미지 설명 (선택)" disabled={disabled || uploading} onChange={event => update(images.map((entry, position) => position === index ? { ...entry, alt: event.target.value } : entry))} /></div>
          <div className="detail-gallery-actions">
            <button type="button" className="icon-btn" aria-label="위로 이동" disabled={disabled || uploading || index === 0} onClick={() => move(index, -1)}><ArrowUp /></button>
            <button type="button" className="icon-btn" aria-label="아래로 이동" disabled={disabled || uploading || index === images.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button>
            <button type="button" className="icon-btn danger" aria-label="이미지 삭제" disabled={disabled || uploading} onClick={() => update(images.filter((_, position) => position !== index))}><Trash2 /></button>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
