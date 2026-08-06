"use client";
/* eslint-disable @next/next/no-img-element -- administrator-uploaded images may be data URLs */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Quote } from "lucide-react";

const REVIEWS_KEY = "ba-edu-reviews";
const CONTENT_EVENT = "brandyaction:content-updated";

type BannerData = { image?: string; eyebrow?: string; title?: string; copy?: string; link?: string };
type PixelData = { meta?: string; kakao?: string; google?: string; enabled?: boolean };

function readStorage<T>(key:string, fallback:T):T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

export function LandingBanner({banner={}}:{banner?:BannerData}) {
  return <div className={`hero-managed-banner ${banner.image?"has-upload":""}`} style={banner.image?{backgroundImage:`linear-gradient(90deg,rgba(17,17,17,.88),rgba(17,17,17,.2)),url(${banner.image})`}:undefined}>
    <div className="managed-banner-lines" aria-hidden="true"><i/><i/><i/></div>
    <div className="managed-banner-copy">
      <span>{banner.eyebrow || "BRANDYACTION EDU · LIVE"}</span>
      <strong>{banner.title || "감이 아닌 데이터로\n매출 구조를 만드세요."}</strong>
      <p>{banner.copy || "4주 실전 클래스 · 8월 19일 개강"}</p>
      <Link href={banner.link || "/classes/local-marketing"}>클래스 자세히 보기 <ArrowRight/></Link>
    </div>
    {!banner.image&&<div className="managed-banner-mark" aria-hidden="true"><span>01</span><b>LIVE</b></div>}
  </div>;
}

export type ManagedReview={id:string;name:string;email:string;phone:string;className:string;date:string;rating:number;business:string;quote:string;result:string;featured:boolean};
export const defaultReviews:ManagedReview[] = [
  {id:"review-1",name:"김민지",email:"minji@naver.com",phone:"010-7482-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-29",rating:5,business:"카페 운영 · 0기 수료",quote:"막연히 SNS를 열심히 해야 한다고만 생각했는데, 우리 매장이 누구에게 어떤 이유로 선택되는지부터 다시 잡았습니다.",result:"광고 문구 수정 후 문의 증가",featured:true},
  {id:"review-2",name:"박성호",email:"park@kakao.com",phone:"010-5521-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-28",rating:5,business:"외식업 운영 · 0기 수료",quote:"매출이 떨어질 때마다 광고비부터 늘렸습니다. 수업을 통해 재방문 과정이 비어 있었다는 걸 처음 확인했습니다.",result:"재방문 퍼널 완성",featured:true},
  {id:"review-3",name:"이지은",email:"jieun@gmail.com",phone:"010-9251-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-27",rating:4.8,business:"뷰티숍 운영 · 0기 수료",quote:"고객을 넓게 잡는 것이 좋다고 생각했는데, 핵심 고객을 좁히고 나니 상담 문의의 질이 확실히 달라졌어요.",result:"상담 전환율 1.8배",featured:true},
  {id:"review-4",name:"최현우",email:"choi@naver.com",phone:"010-3920-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-26",rating:5,business:"온라인 셀러 · 0기 수료",quote:"해야 할 일이 아니라 하지 않아도 될 일이 정리된 게 가장 좋았습니다. 30일 실행안이 실제 팀 업무표가 됐습니다.",result:"실행 업무 40% 단순화",featured:true},
  {id:"review-5",name:"정수현",email:"soohyun@kakao.com",phone:"010-8841-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-25",rating:4.9,business:"스튜디오 운영 · 0기 수료",quote:"콘텐츠와 광고를 따로 보지 않고 고객 흐름으로 연결하니 숫자를 보는 기준이 생겼습니다.",result:"ROAS 개선 기준 수립",featured:true},
  {id:"review-6",name:"윤서진",email:"yoon@gmail.com",phone:"010-1830-****",className:"자영업 마케팅 실전반 0기",date:"2026-07-24",rating:5,business:"교육업 운영 · 0기 수료",quote:"매주 결과물이 남아 팀과 공유하기 쉬웠고, 회의가 의견이 아니라 데이터 중심으로 바뀌었습니다.",result:"주간 KPI 체계 구축",featured:true},
];

export function ReviewSlider(){
  const [page,setPage]=useState(0);
  const [paused,setPaused]=useState(false);
  const [touchStart,setTouchStart]=useState<number|null>(null);
  const [reviews,setReviews]=useState<ManagedReview[]>(defaultReviews);
  const featured=useMemo(()=>reviews.filter(review=>review.featured),[reviews]);
  const pageCount=Math.max(1,Math.ceil(featured.length/2));
  useEffect(()=>{const refresh=()=>setReviews(readStorage<ManagedReview[]>(REVIEWS_KEY,defaultReviews));refresh();window.addEventListener(CONTENT_EVENT,refresh);return()=>window.removeEventListener(CONTENT_EVENT,refresh)},[]);
  useEffect(()=>{if(paused||pageCount<=1)return;const timer=window.setInterval(()=>setPage(v=>(v+1)%pageCount),6000);return()=>window.clearInterval(timer)},[pageCount,paused]);
  const safePage=Math.min(page,pageCount-1);
  const visible=useMemo(()=>featured.slice(safePage*2,safePage*2+2),[featured,safePage]);
  return <div className="review-slider" tabIndex={0} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)} onBlurCapture={()=>setPaused(false)} onKeyDown={event=>{if(event.key==="ArrowLeft")setPage((page+pageCount-1)%pageCount);if(event.key==="ArrowRight")setPage((page+1)%pageCount)}} onTouchStart={event=>setTouchStart(event.touches[0]?.clientX??null)} onTouchEnd={event=>{if(touchStart===null)return;const distance=(event.changedTouches[0]?.clientX??touchStart)-touchStart;if(Math.abs(distance)>45)setPage(distance<0?(page+1)%pageCount:(page+pageCount-1)%pageCount);setTouchStart(null)}}>
    <div className="review-slider-top"><div><span className="section-kicker">REAL REVIEW</span><h2>먼저 실행한 사람들의<br/>구체적인 변화</h2></div><div className="review-slider-controls"><span><b>{String(safePage+1).padStart(2,"0")}</b> / {String(pageCount).padStart(2,"0")}</span><button aria-label="이전 후기" onClick={()=>setPage((safePage+pageCount-1)%pageCount)}><ArrowLeft/></button><button aria-label="다음 후기" onClick={()=>setPage((safePage+1)%pageCount)}><ArrowRight/></button></div></div>
    <div className="review-slide-track" aria-live="polite" key={`${safePage}-${featured.length}`}>{visible.length?visible.map((review,index)=><article className="review-slide-card" key={review.id}><Quote/><div className="review-result"><Check/> {review.result}</div><p>“{review.quote}”</p><footer><span className="avatar">{review.name[0]}</span><div><strong>{review.name} 수강생</strong><small>{review.business}</small></div><span className="verified"><Check/> 실제 수강생</span></footer><b className="review-number">{String(safePage*2+index+1).padStart(2,"0")}</b></article>):<div className="review-slider-empty"><Quote/><strong>대표 리뷰를 지정해주세요.</strong><span>관리자 리뷰 관리에서 메인에 노출할 후기를 선택할 수 있습니다.</span></div>}</div>
    <div className="review-dots" aria-label="후기 페이지">{Array.from({length:pageCount},(_,i)=><button key={i} aria-label={`${i+1}번째 후기`} className={i===safePage?"active":""} onClick={()=>setPage(i)}/>)}</div>
  </div>
}

export function DetailImageStack({images=[],pixels={},courseTitle="자영업 마케팅 실전반"}:{images?:string[];pixels?:PixelData;courseTitle?:string}){
  useEffect(()=>{
    if(!pixels.enabled) return;
    const trackingWindow=window as typeof window & {dataLayer?:Record<string,unknown>[];fbq?:(...args:unknown[])=>void};
    trackingWindow.dataLayer=trackingWindow.dataLayer||[];
    trackingWindow.dataLayer.push({event:"class_detail_view",product:"local-marketing",google_id:pixels.google||undefined,kakao_id:pixels.kakao||undefined});
    if(pixels.meta&&trackingWindow.fbq) trackingWindow.fbq("track","ViewContent",{content_name:courseTitle});
  },[courseTitle,pixels.enabled,pixels.google,pixels.kakao,pixels.meta]);
  if(images.length) return <section className="registered-detail-images" id="overview" aria-label="클래스 이미지 상세 설명">{images.map((src,index)=><img key={`${src.slice(-24)}-${index}`} src={src} alt={`${courseTitle} 상세 설명 ${index+1}`}/>)}</section>;
  return <section className="default-detail-stack" id="overview" aria-label="기본 이미지형 상세페이지">
    <article className="detail-poster detail-poster-problem"><span>01 · PROBLEM</span><h2>열심히 하는데도<br/>매출이 그대로인 이유</h2><p>콘텐츠·광고·고객관리가 하나의 고객 흐름으로 연결되지 않았기 때문입니다.</p><div><i>유입</i><i>문의</i><i>구매</i><i>재구매</i></div></article>
    <article className="detail-poster detail-poster-system"><span>02 · SYSTEM</span><h2>4주 동안<br/>한 장의 매출 구조를 완성합니다.</h2><div className="poster-axis"><b>고객 발견</b><b>퍼널 설계</b><b>콘텐츠</b><b>광고 최적화</b></div></article>
    <article className="detail-poster detail-poster-result"><span>03 · RESULT</span><p>감각적인 마케팅이 아니라<br/>다음 행동이 명확한 마케팅으로</p><strong>30 DAYS<br/>ACTION PLAN</strong></article>
  </section>;
}

export { CONTENT_EVENT, REVIEWS_KEY };
