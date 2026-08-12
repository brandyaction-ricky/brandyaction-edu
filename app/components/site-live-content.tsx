"use client";
/* eslint-disable @next/next/no-img-element -- administrator-uploaded images may be data URLs */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Play, Quote } from "lucide-react";
import type { PublicReview, PublicReviewVideo } from "@/lib/education-data";

type BannerData = { image?: string; eyebrow?: string; title?: string; copy?: string; link?: string };
type PixelData = { meta?: string; kakao?: string; google?: string; enabled?: boolean };

export function LandingBanner({banner={}}:{banner?:BannerData}) {
  return <div className={`hero-managed-banner ${banner.image?"has-upload":""}`} style={banner.image?{backgroundImage:`linear-gradient(90deg,rgba(17,17,17,.88),rgba(17,17,17,.2)),url(${banner.image})`}:undefined}>
    <div className="managed-banner-lines" aria-hidden="true"><i/><i/><i/></div>
    <div className="managed-banner-copy">
      <span>{banner.eyebrow || "BRANDYACTION EDU · LIVE"}</span>
      <strong>{banner.title || "배운 것을 실행으로\n바꾸는 실전 클래스"}</strong>
      <p>{banner.copy || "모집 중인 클래스와 일정을 확인하세요."}</p>
      <Link href={banner.link || "/classes"}>클래스 자세히 보기 <ArrowRight/></Link>
    </div>
    {!banner.image&&<div className="managed-banner-mark" aria-hidden="true"><span>01</span><b>LIVE</b></div>}
  </div>;
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
  const move=(next:number)=>{setPlaying(null);setPage(next)};
  return <div className="review-slider" tabIndex={0} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={()=>setPaused(false)} onKeyDown={event=>{if(event.key==="ArrowLeft")move((page+pageCount-1)%pageCount);if(event.key==="ArrowRight")move((page+1)%pageCount)}} onTouchStart={event=>setTouchStart(event.touches[0]?.clientX??null)} onTouchEnd={event=>{if(touchStart===null)return;const distance=(event.changedTouches[0]?.clientX??touchStart)-touchStart;if(Math.abs(distance)>45)move(distance<0?(page+1)%pageCount:(page+pageCount-1)%pageCount);setTouchStart(null)}}>
    <div className="review-slider-top"><div><span className="section-kicker">REAL REVIEW</span><h2>먼저 실행한 사람들의<br/>구체적인 변화</h2></div><div className="review-slider-controls"><span><b>{String(safePage+1).padStart(2,"0")}</b> / {String(pageCount).padStart(2,"0")}</span><button aria-label="이전 후기" onClick={()=>setPage((safePage+pageCount-1)%pageCount)}><ArrowLeft/></button><button aria-label="다음 후기" onClick={()=>setPage((safePage+1)%pageCount)}><ArrowRight/></button></div></div>
    {video?<article className="review-video-card" key={video.id}><div className="review-video-frame">{playing===video.id?<iframe src={`${video.embedUrl}?autoplay=1`} title={video.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>:<button type="button" onClick={()=>{setPlaying(video.id);setPaused(true)}} style={video.thumbnailUrl?{backgroundImage:`linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.42)),url(${video.thumbnailUrl})`}:undefined} aria-label={`${video.title} 영상 재생`}><span><Play fill="currentColor"/></span><small>영상 후기 재생</small></button>}</div><div className="review-video-copy"><span>VIDEO TESTIMONIAL · {String(safePage+1).padStart(2,"0")}</span><h3>{video.title}</h3>{video.description&&<p>{video.description}</p>}<footer><strong>{video.reviewerName}</strong><small>{video.reviewerRole}</small><em><Check/> 실제 후기</em></footer></div></article>:<div className="review-slide-track" aria-live="polite" key={`${safePage}-${featured.length}`}>{visible.length?visible.map((review,index)=><article className="review-slide-card" key={review.id}><Quote/><div className="review-result"><Check/> 평점 {review.rating.toFixed(1)}</div><p>“{review.quote}”</p><footer><span className="avatar">{review.name[0]}</span><div><strong>{review.name} 수강생</strong><small>{review.className} · {review.cohortName}</small></div><span className="verified"><Check/> 실제 수강생</span></footer><b className="review-number">{String(safePage*2+index+1).padStart(2,"0")}</b></article>):<div className="review-slider-empty"><Quote/><strong>아직 공개된 후기가 없습니다.</strong><span>수강생 후기 또는 영상 후기가 등록되면 이곳에 표시됩니다.</span></div>}</div>}
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
