"use client";

import { object, text as t, type Row } from "@/lib/platform";
import { AdminButton, AdminCheckbox, AdminFormField, AdminIconButton, AdminStatusBadge } from "@/features/admin-ui";
import { ArrowDown, ArrowUp, Grid2X2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { moveOrderedItem, useReorderDrag } from './reorder-drag';

type Send = (body: Record<string, unknown>, success?: string) => Promise<unknown>;
type VideoDraft = { title: string; url: string };
type BannerDraft = { enabled: boolean; articlesEnabled: boolean; eyebrow: string; title: string; description: string; signupNotice: string; signupCTA: string; memberCTA: string; videos: VideoDraft[] };

const defaults: BannerDraft = {
  enabled: true,
  articlesEnabled: true,
  eyebrow: "FREE CLASS · 사업자 무료 3강",
  title: "사업자를 위한 마케팅·AI 매출 진단",
  description: "광고비를 더 쓰기 전에 고객 유입, 콘텐츠, 전환, 재구매 중 어디에서 매출이 막히는지 먼저 확인합니다.",
  signupNotice: "무료 회원가입을 완료하면 사업자용 3강 전체를 바로 볼 수 있습니다. 별도 결제는 필요 없습니다.",
  signupCTA: "무료 회원가입하고 3강 보기",
  memberCTA: "아티클 읽으러 가기",
  videos: [
    { title: "매출을 막는 마케팅 병목 찾기", url: "" },
    { title: "AI로 줄일 일과 사람이 결정할 일", url: "" },
    { title: "7일 안에 실행할 매출 실험 설계", url: "" },
  ],
};

function initialDraft(settings: Row[]): BannerDraft {
  const stored = object(settings.find(row => t(row, "key") === "edu_article_banner"), "value");
  const videos = Array.isArray(stored.videos) ? stored.videos.slice(0, 3).map((item, index) => {
    const video = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { title: String(video.title || defaults.videos[index].title), url: String(video.url || "") };
  }) : [];
  return {
    enabled: stored.enabled !== false,
    articlesEnabled: stored.articlesEnabled !== false,
    eyebrow: String(stored.eyebrow || defaults.eyebrow),
    title: String(stored.title || defaults.title),
    description: String(stored.description || defaults.description),
    signupNotice: String(stored.signupNotice || defaults.signupNotice),
    signupCTA: String(stored.signupCTA || defaults.signupCTA),
    memberCTA: String(stored.memberCTA || defaults.memberCTA),
    videos: videos.concat(defaults.videos.slice(videos.length)).slice(0, 3),
  };
}

export function ArticleBannerEditor({ settings, send, pending }: { settings: Row[]; send: Send; pending: boolean }) {
  const initial = initialDraft(settings);
  const [draft, setDraft] = useState<BannerDraft>(initial);
  const [videoIds, setVideoIds] = useState(['article-video-0', 'article-video-1', 'article-video-2']);
  const update = <K extends keyof BannerDraft>(key: K, value: BannerDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const updateVideo = (index: number, key: keyof VideoDraft, value: string) => update("videos", draft.videos.map((video, position) => position === index ? { ...video, [key]: value } : video));
  const moveVideo = (index: number, target: number) => {
    if (target < 0 || target >= draft.videos.length) return;
    update("videos", moveOrderedItem(draft.videos, index, target));
    setVideoIds(moveOrderedItem(videoIds, index, target));
  };
  const videoDrag = useReorderDrag(videoIds, moveVideo, pending);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send({ action: "article-banner", value: draft }, "무료강의·아티클 노출 설정을 저장했습니다.");
  }
  return (
    <form className="article-settings-main" onSubmit={submit}>
      <section className="panel pad">
        <h2>고객 화면 노출 설정</h2>
        <p>무료강의와 아티클을 각각 켜고 끌 수 있습니다. 둘 다 끄면 상단 메뉴와 마이페이지 바로가기도 숨깁니다.</p>
        <AdminCheckbox label="무료강의 노출" checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} />
        <AdminCheckbox label="아티클 노출" checked={draft.articlesEnabled} onChange={event => update('articlesEnabled', event.target.checked)} />
        <p>주소가 없는 무료강의는 노출하지 않습니다. 저장된 콘텐츠는 삭제되지 않습니다.</p>
      </section>
      <section className="panel mt24">
        <div className="panel-head"><div><h2>회원 무료강의 상단 영역</h2><p>비회원은 가입 안내를, 회원은 3강 목록과 재생 영역을 봅니다.</p></div></div>
        <div className="section-pad">
          <div className="article-setting-location"><Grid2X2 aria-hidden="true" /><span><b>노출 위치</b> · 아티클 목록 최상단</span><AdminStatusBadge status="info" label="무료 회원 전용" tone="info"/></div>
          <div className="form-grid mt24">
            <AdminFormField className="field" label="상단 라벨"><input id="article-eyebrow" value={draft.eyebrow} maxLength={80} onChange={event => update("eyebrow", event.target.value)} /></AdminFormField>
            <AdminFormField className="field" label="메인 제목 *"><textarea id="article-title" value={draft.title} rows={2} maxLength={120} required onChange={event => update("title", event.target.value)} /></AdminFormField>
            <AdminFormField className="field span2" label="설명"><textarea id="article-description" value={draft.description} rows={3} maxLength={240} onChange={event => update("description", event.target.value)} /></AdminFormField>
            <AdminFormField className="field span2" label="회원가입 안내 문구"><textarea id="article-signup-notice" value={draft.signupNotice} rows={2} maxLength={220} onChange={event => update("signupNotice", event.target.value)} /></AdminFormField>
            <AdminFormField className="field" label="비회원 CTA"><input id="article-signup-cta" value={draft.signupCTA} maxLength={45} onChange={event => update("signupCTA", event.target.value)} /></AdminFormField>
            <AdminFormField className="field" label="회원 CTA"><input id="article-member-cta" value={draft.memberCTA} maxLength={45} onChange={event => update("memberCTA", event.target.value)} /></AdminFormField>
          </div>
          <div className="article-access-flow"><span>비회원 · 가입 또는 로그인</span><span>→</span><span>같은 아티클 화면 복귀</span><span>→</span><span>무료 3강 시청</span></div>
        </div>
      </section>
      <section className="panel mt24">
        <div className="panel-head"><div><h2>무료강의 3강 설정</h2><p>강의 제목과 YouTube 주소를 등록하고 노출 순서를 확인합니다.</p></div><AdminStatusBadge status="info" label={`${draft.videos.filter(video => video.url.trim()).length}/3 주소 등록`} tone="info"/></div>
        <div className="article-lessons-editor">
          {draft.videos.map((video, index) => <div className={`article-lesson-editor${videoDrag.overId === videoIds[index] ? ' reorder-item-over' : ''}`} key={videoIds[index]} {...videoDrag.row(videoIds[index])}>
            {videoDrag.handle(videoIds[index], video.title || `${index + 1}강`)}
            <div className="article-lesson-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="article-lesson-fields"><AdminFormField className="field" label="강의 제목 *"><input id={`article-video-title-${index}`} value={video.title} maxLength={120} required onChange={event => updateVideo(index, "title", event.target.value)} /></AdminFormField><AdminFormField className="field" label="YouTube URL"><input id={`article-video-url-${index}`} type="url" value={video.url} placeholder="https://youtu.be/..." onChange={event => updateVideo(index, "url", event.target.value)} /></AdminFormField></div>
            <div className="article-order-buttons"><AdminIconButton label={`${index + 1}강 위로 이동`} disabled={index === 0} onClick={() => moveVideo(index, index - 1)}><ArrowUp size={16}/></AdminIconButton><AdminIconButton label={`${index + 1}강 아래로 이동`} disabled={index === 2} onClick={() => moveVideo(index, index + 1)}><ArrowDown size={16}/></AdminIconButton></div>
          </div>)}
        </div>
        <div className="section-pad article-video-help">제목은 먼저 작성할 수 있습니다. 영상이 준비되면 각 강의의 주소를 등록하세요. 공개 화면은 저장된 순서와 재생 가능한 YouTube 주소를 그대로 사용합니다.</div>
      </section>
      <div className="article-settings-save"><div><b>저장된 설정을 편집 중입니다.</b><p>저장하면 고객 화면에 반영됩니다.</p></div><div className="row"><AdminButton variant="outline" disabled={pending} onClick={() => setDraft(initial)}>변경 취소</AdminButton><AdminButton variant="primary" type="submit" loading={pending}>노출·무료강의 설정 저장</AdminButton></div></div>
    </form>
  );
}
