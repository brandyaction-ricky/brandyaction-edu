"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Check, Eye, Save, Upload, X } from "lucide-react";
import { BannerData, loadAdminBanner, saveAdminBanner } from "@/lib/admin-content";
import { useAdminUnsavedChanges } from "./use-admin-unsaved-changes";

const emptyBanner: BannerData = {
  eyebrow: "BRANDYACTION EDU · LIVE",
  title: "배운 것을 실행으로\n바꾸는 실전 클래스",
  copy: "모집 중인 클래스와 일정을 확인하세요.",
  link: "/classes",
  linkLabel: "클래스 자세히 보기",
};

function signature(banner: BannerData) {
  return JSON.stringify({ ...banner, imageFile: undefined });
}

export function AdminBannerManager() {
  const [banner, setBanner] = useState<BannerData>(emptyBanner);
  const [savedSignature, setSavedSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const dirty = useMemo(() => Boolean(savedSignature) && signature(banner) !== savedSignature, [banner, savedSignature]);
  useAdminUnsavedChanges(dirty && !saving);

  useEffect(() => {
    let active = true;
    loadAdminBanner().then((data) => {
      if (!active) return;
      setBanner(data);
      setSavedSignature(signature(data));
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "배너를 불러오지 못했습니다.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const uploadBanner = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("배너는 JPG, PNG, WEBP 파일만 등록할 수 있습니다.");
    if (file.size > 5_000_000) return setError("배너 이미지는 5MB 이하만 등록할 수 있습니다.");
    setError("");
    setBanner((current) => ({ ...current, image: URL.createObjectURL(file), imageFile: file }));
  };

  const save = async () => {
    if (saving) return;
    if (!banner.title.trim()) return setError("메인 배너 문구를 입력해 주세요.");
    if (!banner.link.trim()) return setError("배너 클릭 연결 URL을 입력해 주세요.");
    setSaving(true);
    setError("");
    try {
      await saveAdminBanner(banner);
      const next = await loadAdminBanner();
      setBanner(next);
      setSavedSignature(signature(next));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "배너를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="admin-panel admin-loading-state"><strong>배너 정보를 불러오는 중입니다.</strong></section>;

  return <div className="admin-editor-wrap">
    <section className="admin-panel banner-editor">
      <div className="form-card-head"><div><h2>메인 랜딩 배너</h2><p>대표 이미지와 문구, 클릭 링크를 저장하면 고객 홈에 즉시 반영됩니다.</p></div><span className="status-label success">고객 화면 연동</span></div>
      <div className={`banner-admin-preview ${banner.image ? "has-upload" : ""}`} style={banner.image ? { backgroundImage: `linear-gradient(90deg,rgba(17,17,17,.88),rgba(17,17,17,.15)),url(${banner.image})` } : undefined}><div><span>{banner.eyebrow}</span><strong>{banner.title}</strong><small>{banner.copy}</small></div>{!banner.image && <b>01</b>}</div>
      <div className="banner-form-grid">
        <label className="banner-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadBanner}/><Upload/><strong>{banner.image ? "배너 이미지 변경" : "배너 이미지 업로드"}</strong><span>가로형 JPG, PNG, WEBP · 5MB 이하</span></label>
        <div className="admin-field-grid"><label>상단 문구<input value={banner.eyebrow} onChange={(event) => setBanner({ ...banner, eyebrow: event.target.value })}/></label><label>보조 문구<input value={banner.copy} onChange={(event) => setBanner({ ...banner, copy: event.target.value })}/></label><label className="field-full">메인 문구<textarea value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })}/></label><label>버튼 문구<input value={banner.linkLabel} onChange={(event) => setBanner({ ...banner, linkLabel: event.target.value })} placeholder="클래스 자세히 보기"/></label><label>클릭 연결 URL<input value={banner.link} onChange={(event) => setBanner({ ...banner, link: event.target.value })} placeholder="/classes 또는 https://..."/></label></div>
      </div>
      <div className="banner-actions">{banner.image && <button className="admin-outline" onClick={() => setBanner({ ...banner, image: undefined, imageFile: undefined })}><X/> 이미지 삭제</button>}<Link className="admin-outline" href="/"><Eye/> 고객 화면 보기</Link><button className="admin-primary" onClick={save} disabled={saving}><Save/> {saving ? "저장 중..." : "배너 저장"}</button></div>
      {error && <p className="admin-save-error" role="alert">{error}</p>}
    </section>
    <div className={`admin-toast ${saved ? "show" : ""}`} role="status" aria-live="polite"><Check/> 배너가 고객 화면에 반영되었습니다.</div>
  </div>;
}
