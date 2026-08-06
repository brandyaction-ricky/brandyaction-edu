"use client";

import Link from "next/link";
import { ArrowRight, FileText, LockKeyhole, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CurriculumWeek, defaultCurriculum } from "../data";

const CURRICULUM_KEY = "ba-edu-curriculum";
const CONTENT_EVENT = "brandyaction:content-updated";

function readCurriculum(){
  try{const stored=JSON.parse(window.localStorage.getItem(CURRICULUM_KEY)||"") as CurriculumWeek[];let day=0;return stored.map(week=>({...week,lessons:week.lessons.filter(lesson=>String(lesson.kind)!=="LIVE").map(lesson=>{day+=1;return {...lesson,day,kind:String(lesson.kind)==="자료"||String(lesson.kind)==="과제"?"자료":"VOD"} as typeof lesson})}))}catch{return defaultCurriculum}
}

export function CurriculumRoadmap(){
  const [weeks,setWeeks]=useState<CurriculumWeek[]>(defaultCurriculum);
  useEffect(()=>{const refresh=()=>setWeeks(readCurriculum());refresh();window.addEventListener(CONTENT_EVENT,refresh);return()=>window.removeEventListener(CONTENT_EVENT,refresh)},[]);
  const lessonCount=useMemo(()=>weeks.reduce((sum,week)=>sum+week.lessons.length,0),[weeks]);
  return <div className="student-curriculum-roadmap">
    <div className="roadmap-overview"><div><span>전체 학습 로드맵</span><strong>{weeks.length}주 · {lessonCount}일 과정</strong></div><div><span>완료한 학습</span><strong>0 / {lessonCount}</strong></div><i><em style={{width:"0%"}}/></i></div>
    {weeks.map((week,weekIndex)=><section className="student-week-group" key={week.id}><header><div><b>{week.label}</b><span>WEEK {String(weekIndex+1).padStart(2,"0")}</span></div><div><h3>{week.title}</h3><p>이번 주 완성: {week.goal}</p></div><strong>0 / {week.lessons.length} 완료</strong></header><div className="student-daily-list">{week.lessons.map((lesson,lessonIndex)=>{const current=weekIndex===0&&lessonIndex===0;return <article key={lesson.id} className={current?"current":"locked"}><span className="student-day-number"><b>{lesson.day}</b><small>DAY</small></span><span className="student-lesson-icon">{current?<Play/>:lesson.kind==="자료"?<FileText/>:<LockKeyhole/>}</span><div><span>{lesson.kind} · {lesson.duration}</span><h4>{lesson.title}</h4><p>{lesson.description}</p></div>{current?<Link href="/my/cohort/session">학습하기 <ArrowRight/></Link>:<span className="student-lock-copy">순서대로 학습 가능</span>}</article>})}</div></section>)}
  </div>;
}
