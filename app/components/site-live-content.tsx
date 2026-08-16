"use client";
/* eslint-disable @next/next/no-img-element -- administrator-uploaded images may be data URLs */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Pause, Play, Quote, Users } from "lucide-react";
import type { PublicReview, PublicReviewVideo } from "@/lib/education-data";
import type { ClassItem } from "@/app/data";

type BannerData = { image?: string; eyebrow?: string; title?: string; copy?: string; link?: string; linkLabel?: string };
type PixelData = { meta?: string; kakao?: string; google?: string; enabled?: boolean };

export function LandingBanner({banner={}}:{banner?:BannerData}) {
  return <div className={`hero-managed-banner ${banner.image?"has-upload":""}`} style={banner.image?{backgroundImage:`linear-gradient(90deg,rgba(17,17,17,.88),rgba(17,17,17,.2)),url(${banner.image})`}:undefined}>
    <div className="managed-banner-lines" aria-hidden="true"><i/><i/><i/></div>
    <div className="managed-banner-copy">
      <span>{banner.eyebrow || "BRANDYACTION EDU · LIVE"}</span>
      <strong>{banner.title || "배운 것을 실행으로\n바꾸는 실전 클래스"}</strong>
      <p>{banner.copy || "모집 중인 클래스와 일정을 확인하세요."}</p>
      <Link href={banner.link || "/classes"}>{banner.linkLabel || "클래스 자세히 보기"} <ArrowRight/></Link>
    </div>
    {!banner.image&&<div className="managed-banner-mark" aria-hidden="true"><span>01</span><b>LIVE</b></div>}
  </div>;
}

export function LiveClassCarousel({ classes, banner = {} }: { classes: ClassItem[]; banner?: BannerData }) {
  const live = classes.filter((item) => item.status.includes("모집 중"));
  const items = live.length ? live : classes.slice(0, 3);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const count = items.length;
  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = window.setInterval(() => setActive((value) => (value + 1) % count), 5200);
    return () => window.clearInterval(timer);
  }, [count, paused]);
  if (!count) return <section className="live-carousel-shell"><div className="container"><LandingBanner banner={banner}/></div></section>;
  const move = (offset: number) => setActive((active + offset + count) % count);
  return <section className="live-carousel-shell" aria-label="모집 중인 라이브 클래스">
    <div className="live-carousel-heading container"><div><span>LIVE NOW</span><h1>지금 모집 중인 클래스</h1><p>일정과 정원을 비교하고, 지금 필요한 실전 클래스를 선택하세요.</p></div><Link href="/classes">전체 클래스 <ArrowRight/></Link></div>
    <div className="live-carousel-viewport" tabIndex={0} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)} onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }} onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={(event) => { if (touchStart === null) return; const delta = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart; if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1); setTouchStart(null); }}>
      <div className="live-carousel-track" style={{ transform: `translateX(calc(50% - ${(active * 72) + 36}vw))` }}>
        {items.map((item, index) => <article className={`live-class-slide ${index === active ? "active" : ""}`} key={`${item.slug}-${item.cohortId || index}`} aria-hidden={index !== active}>
          <Link href={`/classes/${item.slug}`} className="live-slide-art" style={item.thumbnailUrl ? { backgroundImage: `linear-gradient(90deg,rgba(14,14,14,.88),rgba(14,14,14,.2)),url(${item.thumbnailUrl})` } : undefined} tabIndex={index === active ? 0 : -1}>
            <div className="live-slide-grid" aria-hidden="true"><i/><i/></div>
            <div className="live-slide-copy"><span><b/> {item.status}</span><small>{item.category} · LIVE CLASS</small><h2>{item.title}</h2><p>{item.summary}</p><dl><div><dt><CalendarDays/>개강</dt><dd>{item.startDate}</dd></div><div><dt><Clock3/>일정</dt><dd>{item.schedule}</dd></div><div><dt><Users/>정원</dt><dd>{item.seats}</dd></div></dl><footer><strong>{item.price}</strong><em>클래스 자세히 보기 <ArrowRight/></em></footer></div>
            {!item.thumbnailUrl && <div className="live-slide-mark" aria-hidden="true"><b>{String(index + 1).padStart(2, "0")}</b><span>LIVE</span></div>}
          </Link>
        </article>)}
      </div>
      <div className="live-carousel-controls"><span><b>{String(active + 1).padStart(2, "0")}</b> / {String(count).padStart(2, "0")}</span><button onClick={() => setPaused((value) => !value)} aria-label={paused ? "자동 재생" : "일시 정지"}>{paused ? <Play/> : <Pause/>}</button><button onClick={() => move(-1)} disabled={count <= 1} aria-label="이전 클래스"><ArrowLeft/></button><button onClick={() => move(1)} disabled={count <= 1} aria-label="다음 클래스"><ArrowRight/></button></div>
    </div>
  </section>;
}

export function ReviewSlider({reviews,videos=[]}:{reviews:PublicReview[];videos?:PublicReviewVideo[]}){
  const [page,setPage]=useState(0);
  const [paused,setPaused]=useState(false);
  const [touchStart,setTouchStart]=useState<number|null>(null);
  const [playing,setPlaying]=useState<string|null>(null);
  const featured=reviews;
  const videoMode=videos.length>0;
  const pageCount=Math.max(1,videoMode?videos.length:Math.ceil(featured.length/2));
  useEffect(()=>{if(paused||pageCount<=1)return;const timer=window.setInterval(()=>setPage(v=>(v+1)%pageCount),6000);return()=>window.clearInterval(timer)},[pageCount,paused]);
  const safePage=Math.min(page,pageCount-1);
  const visible=useMemo(()=>featured.slice(safePage*2,safePage*2+2),[featured,safePage]);
  const video=videoMode?videos[safePage]:null;
  const videoPreviews=useMemo(()=>videoMode?Array.from({length:Math.min(3,Math.max(0,videos.length-1))},(_,index)=>videos[(safePage+index+1)%videos.length]):[],[videoMode,videos,safePage]);
  const move=(next:number)=>{setPlaying(null);setPage(next)};
  return <div className="review-slider" tabIndex={0} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={()=>setPaused(false)} onKeyDown={event=>{if(event.key==="ArrowLeft")move((page+pageCount-1)%pageCount);if(event.key==="ArrowRight")move((page+1)%pageCount)}} onTouchStart={event=>setTouchStart(event.touches[0]?.clientX??null)} onTouchEnd={event=>{if(touchStart===null)return;const distance=(event.changedTouches[0]?.clientX??touchStart)-touchStart;if(Math.abs(distance)>45)move(distance<0?(page+1)%pageCount:(page+pageCount-1)%pageCount);setTouchStart(null)}}>
    <div className="review-slider-top"><div><span className="section-kicker">REAL REVIEW</span><h2>먼저 실행한 사람들의<br/>구체적인 변화</h2></div><div className="review-slider-controls"><span><b>{String(safePage+1).padStart(2,"0")}</b> / {String(pageCount).padStart(2,"0")}</span><button aria-label="이전 후기" onClick={()=>setPage((safePage+pageCount-1)%pageCount)}><ArrowLeft/></button><button aria-label="다음 후기" onClick={()=>setPage((safePage+1)%pageCount)}><ArrowRight/></button></div></div>
    {video?<div className="review-video-stage" key={video.id}><article className="review-video-card"><div className="review-video-frame">{playing===video.id?<iframe src={`${video.embedUrl}?autoplay=1`} title={video.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>:<button type="button" onClick={()=>{setPlaying(video.id);setPaused(true)}} style={video.thumbnailUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.42)),url(${video.thumbnailUrl})`}:undefined} aria-label={`${video.title} 영상 재생`}><span><Play fill="currentColor"/></span><small>영상 후기 재생</small></button>}</div><div className="review-video-copy"><span>VIDEO TESTIMONIAL · {String(safePage+1).padStart(2,"0")}</span><h3>{video.title}</h3>{video.description&&<p>{video.description}</p>}<footer><strong>{video.reviewerName}</strong><small>{video.reviewerRole}</small><em><Check/> 실제 후기</em></footer></div></article>{videoPreviews.length>0&&<aside className="review-video-rail"><header><strong>다음 실제 후기</strong><span>{videos.length}개의 변화</span></header>{videoPreviews.map((item,index)=><button key={item.id} onClick={()=>move((safePage+index+1)%videos.length)}><span className="review-preview-thumb" style={item.thumbnailUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.08),rgba(0,0,0,.3)),url(${item.thumbnailUrl})`}:undefined}><Play fill="currentColor"/></span><span><small>{String((safePage+index+1)%videos.length+1).padStart(2,"0")} · {item.reviewerRole}</small><strong>{item.title}</strong><em>{item.reviewerName}</em></span><ArrowRight/></button>)}</aside>}</div>:<div className="review-slide-track" aria-live="polite" key={`${safePage}-${featured.length}`}>{visible.length?visible.map((review,index)=><article className="review-slide-card" key={review.id}><Quote/><div className="review-result"><Check/> 평점 {review.rating.toFixed(1)}</div><p>“{review.quote}”</p><footer><span className="avatar">{review.name[0]}</span><div><strong>{review.name} 수강생</strong><small>{review.className} · {review.cohortName}</small></div><span className="verified"><Check/> 실제 수강생</span></footer><b className="review-number">{String(safePage*2+index+1).padStart(2,"0")}</b></article>):<div className="review-slider-empty"><Quote/><strong>아직 공개된 후기가 없습니다.</strong><span>수강생 후기 또는 영상 후기가 등록되면 이곳에 표시됩니다.</span></div>}</div>}
    <div className="review-dots" aria-label="후기 페이지">{Array.from({length:pageCount},(_,i)=><button key={i} aria-label={`${i+1}번째 후기`} className={i===safePage?"active":""} onClick={()=>move(i)}/>)}</div>
  </div>
}

export function DetailImageStack({images=[],pixels={},courseTitle="자영업 마케팅 실전반"}:{images?:string[];pixels?:PixelData;courseTitle?:string}){
  useEffect(()=>{
    if(!pixels.enabled) return;
    const trackingWindow=window as typeof window & {dataLayer?:Record<string,unknown>[];fbq?:(...args:unknown[])=>void};
    trackingWindow.dataLayer=trackingWindow.dataLayer||[];
    trackingWindow.dataLayer.push({event:"class_detail_view",product:courseTitle,google_id:pixels.google||undefined,kakao_id:pixels.kakao||undefined});
    if(pixels.meta&&trackingWindow.fbq) trackingWindow.fbq("track","ViewContent",{content_name:courseTitle});
  },[courseTitle,pixels.enabled,pixels.google,pixels.kakao,pixels.meta]);
  if(images.length) return <section className="registered-detail-images" id="overview" aria-label="클래스 이미지 상세 설명">{images.map((src,index)=><img key={`${src.slice(-24)}-${index}`} src={src} alt={`${courseTitle} 상세 설명 ${index+1}`}/>)}</section>;
  return <section className="default-detail-stack" id="overview" aria-label="기본 이미지형 상세페이지">
    <article className="detail-poster detail-poster-problem"><span>01 · LEARN</span><h2>{courseTitle}</h2><p>커리큘럼과 기수 일정을 확인하고 현장에서 바로 적용할 학습을 시작하세요.</p><div><i>학습</i><i>실습</i><i>피드백</i><i>완주</i></div></article>
    <article className="detail-poster detail-poster-system"><span>02 · APPLY</span><h2>VOD와 라이브를<br/>하나의 실행 과정으로</h2><div className="poster-axis"><b>VOD</b><b>자료</b><b>LIVE</b><b>다시보기</b></div></article>
    <article className="detail-poster detail-poster-result"><span>03 · GROW</span><p>배우고 끝나지 않고<br/>구체적인 결과물까지</p><strong>ACTION<br/>RESULT</strong></article>
  </section>;
}
