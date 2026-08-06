"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export function HomeExperience(){
  const [heroPassed,setHeroPassed]=useState(false);
  const [finalVisible,setFinalVisible]=useState(false);

  useEffect(()=>{
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems=Array.from(document.querySelectorAll<HTMLElement>("[data-home-reveal]"));
    if(reduceMotion)revealItems.forEach(item=>item.classList.add("is-visible"));
    const revealObserver=reduceMotion?null:new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");revealObserver?.unobserve(entry.target)}}),{threshold:.13,rootMargin:"0px 0px -7%"});
    revealItems.forEach(item=>revealObserver?.observe(item));

    const hero=document.querySelector(".hero-shell");
    const finalCta=document.querySelector(".final-cta");
    const heroObserver=hero?new IntersectionObserver(([entry])=>setHeroPassed(!entry.isIntersecting),{threshold:0,rootMargin:"-78px 0px 0px"}):null;
    const finalObserver=finalCta?new IntersectionObserver(([entry])=>setFinalVisible(entry.isIntersecting),{threshold:.08}):null;
    if(hero&&heroObserver)heroObserver.observe(hero);
    if(finalCta&&finalObserver)finalObserver.observe(finalCta);
    return()=>{revealObserver?.disconnect();heroObserver?.disconnect();finalObserver?.disconnect()};
  },[]);

  return <aside className={`sticky-apply-bar ${heroPassed&&!finalVisible?"show":""}`} aria-hidden={!heroPassed||finalVisible}>
    <div><span>1기 모집 중 · 잔여 7석</span><strong>매출을 만드는 자영업 마케팅 실전반</strong></div>
    <p>8월 19일 개강 · 매주 수요일 20:00</p>
    <Link href="/classes/local-marketing">자세히 보기 <ArrowRight/></Link>
  </aside>;
}
