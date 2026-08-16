"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export function HomeExperience({title,status,price,schedule,href}:{title?:string;status?:string;price?:string;schedule?:string;href?:string}){
  const [heroPassed,setHeroPassed]=useState(false);
  const [finalVisible,setFinalVisible]=useState(false);

  useEffect(()=>{
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems=Array.from(document.querySelectorAll<HTMLElement>("[data-home-reveal]"));
    if(reduceMotion)revealItems.forEach(item=>item.classList.add("is-visible"));
    const revealObserver=reduceMotion?null:new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");revealObserver?.unobserve(entry.target)}}),{threshold:.13,rootMargin:"0px 0px -7%"});
    revealItems.forEach(item=>revealObserver?.observe(item));

    const hero=document.querySelector(".home-primary-banner");
    const finalCta=document.querySelector(".final-cta");
    const heroObserver=hero?new IntersectionObserver(([entry])=>setHeroPassed(!entry.isIntersecting),{threshold:0,rootMargin:"-78px 0px 0px"}):null;
    const finalObserver=finalCta?new IntersectionObserver(([entry])=>setFinalVisible(entry.isIntersecting),{threshold:.08}):null;
    if(hero&&heroObserver)heroObserver.observe(hero);
    if(finalCta&&finalObserver)finalObserver.observe(finalCta);
    return()=>{revealObserver?.disconnect();heroObserver?.disconnect();finalObserver?.disconnect()};
  },[]);

  if(!title||!href)return null;
  const isVisible=heroPassed&&!finalVisible;
  return <aside className={`sticky-apply-bar ${isVisible?"show":""}`} aria-hidden={!isVisible}>
    <div><span>{status||"모집 중"}{price?` · ${price}`:""}</span><strong>{title}</strong></div>
    <p>{schedule||"모집 일정과 커리큘럼을 확인하세요."}</p>
    <Link href={href} tabIndex={isVisible?0:-1}>클래스 자세히 보기 <ArrowRight/></Link>
  </aside>;
}
