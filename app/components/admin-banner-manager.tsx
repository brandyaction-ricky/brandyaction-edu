"use client";
/* eslint-disable @next/next/no-img-element -- administrator-uploaded banner previews use blob and storage URLs */

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { Check, Eye, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { useAdminUnsavedChanges } from "./use-admin-unsaved-changes";

type BannerRow = { id: string; link_url: string | null; image_path: string | null; image_url: string | null; display_order: number };
type CourseOption = { id: string; title: string; slug: string; status: "draft" | "published" };
type BannerDraft = { id: string; courseId: string; link: string; imagePath: string; imageUrl: string; file?: File };
const emptyDraft = (): BannerDraft => ({ id: "", courseId: "", link: "/classes", imagePath: "", imageUrl: "" });

async function bannerRequest<T>(input = "/api/admin/banner", init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "배너 요청을 처리하지 못했습니다.");
  return result;
}

export function AdminBannerManager() {
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [draft, setDraft] = useState<BannerDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = Boolean(draft?.file) || Boolean(draft && !draft.id);
  useAdminUnsavedChanges(dirty && !saving);

  const load = async () => {
    const result = await bannerRequest<{ banners: BannerRow[]; courses: CourseOption[] }>();
    setBanners(result.banners);
    setCourses(result.courses);
  };
  useEffect(() => {
    let active = true;
    bannerRequest<{ banners: BannerRow[]; courses: CourseOption[] }>().then((result) => { if (active) { setBanners(result.banners); setCourses(result.courses); } }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "배너를 불러오지 못했습니다.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const open = (banner?: BannerRow) => {
    const link = banner?.link_url || "/classes";
    const linkedCourse = courses.find((course) => `/classes/${course.slug}` === link);
    setDraft(banner ? { id: banner.id, courseId: linkedCourse?.id || "", link, imagePath: banner.image_path || "", imageUrl: banner.image_url || "" } : emptyDraft());
  };
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !draft) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("배너는 JPG, PNG, WEBP 파일만 등록할 수 있습니다.");
    if (file.size > 5_000_000) return setError("배너 이미지는 5MB 이하만 등록할 수 있습니다.");
    setError("");
    setDraft({ ...draft, file, imageUrl: URL.createObjectURL(file) });
  };
  const save = async () => {
    if (!draft || saving) return;
    if (!draft.id && !draft.file) return setError("배너 이미지를 업로드해 주세요.");
    if (!draft.link.trim()) return setError("배너 클릭 시 이동할 클래스를 선택해 주세요.");
    setSaving(true); setError("");
    try {
      const form = new FormData();
      form.append("id", draft.id); form.append("link", draft.link); form.append("imagePath", draft.imagePath);
      if (draft.file) form.append("image", draft.file);
      await bannerRequest("/api/admin/banner", { method: "POST", body: form });
      await load(); setDraft(null); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "배너를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const remove = async (banner: BannerRow) => {
    if (!window.confirm("이 배너를 삭제할까요? 고객 랜딩 슬라이드에서 즉시 제거됩니다.")) return;
    try { await bannerRequest(`/api/admin/banner?id=${encodeURIComponent(banner.id)}`, { method: "DELETE" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "배너를 삭제하지 못했습니다."); }
  };

  if (loading) return <section className="admin-panel admin-loading-state"><strong>배너 정보를 불러오는 중입니다.</strong></section>;
  return <div className="admin-editor-wrap">
    <section className="admin-panel banner-library">
      <div className="form-card-head"><div><h2>랜딩 이미지 배너 <small className="banner-count">{banners.length}개</small></h2><p>배너를 개수 제한 없이 추가할 수 있으며, 등록한 순서대로 고객 화면에서 자동 슬라이드됩니다.</p></div><button className="admin-primary" onClick={() => open()}><Plus/> 배너 추가</button></div>
      <div className="banner-library-grid">{banners.map((banner, index) => <article key={banner.id}><button className="banner-library-image" onClick={() => open(banner)}>{banner.image_url ? <img src={banner.image_url} alt={`${index + 1}번째 배너`}/> : <span>이미지 없음</span>}<b>{String(index + 1).padStart(2, "0")}</b></button><div><span title={banner.link_url || "/classes"}>{banner.link_url || "/classes"}</span><button onClick={() => open(banner)}>수정</button><button onClick={() => remove(banner)} aria-label={`${index + 1}번째 배너 삭제`}><Trash2/></button></div></article>)}<button className="banner-library-add" onClick={() => open()}><Plus/><strong>배너 추가</strong><span>이미지와 연결 URL 등록</span></button></div>
    </section>
    {draft && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}><section className="admin-modal banner-image-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "배너 수정" : "새 배너 등록"}><header><div><span>BANNER</span><h2>{draft.id ? "배너 수정" : "새 배너 등록"}</h2></div><button onClick={() => setDraft(null)} aria-label="닫기"><X/></button></header><div className="banner-image-only-form"><label className={`banner-image-drop ${draft.imageUrl ? "has-image" : ""}`} style={draft.imageUrl ? { backgroundImage: `url(${draft.imageUrl})` } : undefined}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/>{!draft.imageUrl && <><ImagePlus/><strong>배너 이미지 업로드</strong><span>가로형 JPG, PNG, WEBP · 5MB 이하</span></>}</label><label>클릭 시 이동할 클래스<select value={draft.courseId} onChange={(event)=>{const course=courses.find((item)=>item.id===event.target.value);setDraft({...draft,courseId:event.target.value,link:course?`/classes/${course.slug}`:"/classes"});}}><option value="">전체 클래스 목록</option>{courses.map((course)=><option key={course.id} value={course.id}>{course.title}{course.status==="draft"?" · 판매 중지":""}</option>)}</select><small>선택한 클래스의 상세페이지 주소가 자동으로 연결됩니다.</small></label><p>권장 비율 16:6 · 이미지 전체가 링크로 작동합니다.</p></div>{error && <p className="admin-save-error" role="alert">{error}</p>}<footer><Link className="admin-outline" href="/"><Eye/> 고객 화면 보기</Link><button className="admin-primary" onClick={save} disabled={saving}><Save/> {saving ? "저장 중..." : "배너 저장"}</button></footer></section></div>}
    {error && !draft && <p className="admin-save-error" role="alert">{error}</p>}
    <div className={`admin-toast ${saved ? "show" : ""}`} role="status" aria-live="polite"><Check/> 배너 슬라이드가 저장되었습니다.</div>
  </div>;
}
