"use client";

import { object, text as t, type Row } from "@/lib/platform";
import { useState, type FormEvent } from "react";

type Send = (body: Record<string, unknown>, success?: string) => Promise<unknown>;

const defaults = {
  enabled: true,
  eyebrow: "MEMBERS ONLY / FREE CLASS",
  title: "배우고, 내 일에 바로 적용해 보세요.",
  description: "회원에게 공개된 무료강의를 확인하세요.",
  videos: [
    { title: "무료 강의 01", url: "" },
    { title: "무료 강의 02", url: "" },
    { title: "무료 강의 03", url: "" },
  ],
};

export function ArticleBannerEditor({ settings, send, pending }: { settings: Row[]; send: Send; pending: boolean }) {
  const stored = object(settings.find((row) => t(row, "key") === "edu_article_banner"), "value");
  const initial = { ...defaults, ...stored, videos: Array.isArray(stored.videos) ? stored.videos : defaults.videos } as typeof defaults;
  const [enabled, setEnabled] = useState(initial.enabled !== false);
  const [videos, setVideos] = useState(initial.videos.slice(0, 3).concat(defaults.videos).slice(0, 3));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({
      action: "article-banner",
      value: {
        enabled,
        eyebrow: form.get("eyebrow"),
        title: form.get("title"),
        description: form.get("description"),
        videos,
      },
    }, "아티클 무료강의 배너를 저장했습니다.");
  }

  return (
    <details className="panel article-banner-admin" open>
      <summary>상단 무료강의 영상 배너</summary>
      <form onSubmit={submit}>
        <label className="check-row"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> 배너 사용</label>
        <div className="form-grid">
          <label>상단 문구<input name="eyebrow" defaultValue={initial.eyebrow} maxLength={80} /></label>
          <label>제목<input name="title" defaultValue={initial.title} maxLength={120} required /></label>
          <label className="span2">설명<input name="description" defaultValue={initial.description} maxLength={200} /></label>
          {videos.map((video, index) => (
            <div className="article-video-field span2" key={index}>
              <b>무료 영상 {index + 1}</b>
              <input aria-label={`무료 영상 ${index + 1} 제목`} value={String(video.title || "")} placeholder="영상 제목" onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} />
              <input aria-label={`무료 영상 ${index + 1} URL`} value={String(video.url || "")} placeholder="https://www.youtube.com/watch?v=..." onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} />
            </div>
          ))}
        </div>
        <button className="btn primary" disabled={pending}>배너 설정 저장</button>
      </form>
    </details>
  );
}
