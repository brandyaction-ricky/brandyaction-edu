'use client';
import {useEffect,useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import type {LessonSearchHit} from '../lesson-search';
import {relatedLessons} from './domain';
import {GuidancePanel} from './guidance';
import s from './panel.module.css';
/** 수업 자료 찾기: 상황별 안내 + 수업 제목과 본문 검색. 지원실 기록(직원 답변)과 무관해서 지원 스위치 없이 열린다. */
export function LessonFinder({snapshot,demo,onOpen,onAsk}:{snapshot:CampusSnapshot;demo:boolean;onOpen:(id:string)=>void;onAsk?:(value:{lessonId:string;context:string})=>void}){
 const [query,setQuery]=useState(''),[hits,setHits]=useState<LessonSearchHit[]|null>(null),[error,setError]=useState('');
 const ready=query.trim().length>=2;
 useEffect(()=>{
  if(!ready)return;
  if(demo){const found=relatedLessons(snapshot,query).map(l=>({lessonId:l.id,excerpt:''}));queueMicrotask(()=>{setHits(found);setError('');});return;}
  const controller=new AbortController(),timer=setTimeout(()=>{void fetch('/api/campus/lesson-search?enrollmentId='+snapshot.selectedEnrollmentId+'&q='+encodeURIComponent(query.trim()),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'수업을 찾지 못했습니다.');setHits(d.hits);setError('');}).catch(e=>{if(e.name!=='AbortError'){setHits(null);setError(e.message);}});},350);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query,ready,demo,snapshot]);
 const found=ready&&hits?hits.flatMap(h=>{const lesson=snapshot.lessons.find(l=>l.id===h.lessonId);return lesson?[{lesson,excerpt:h.excerpt}]:[];}):[];
 return <div className={s.root}>
  <section className={s.card}><h3>수업에서 찾기</h3><div className={s.form}><label>찾을 낱말<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="예: 광고, 상세페이지, 옵시디언" maxLength={100}/></label></div>
   <p className={s.muted}>내 기수에 열린 수업의 제목과 본문에서 찾아요. 두 글자 이상 적어 주세요.</p>
   {error&&<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>}
   {ready&&!error&&<div className={s.list} aria-live="polite">{!hits?<p role="status">찾고 있어요…</p>:found.length?found.map(({lesson,excerpt})=><article key={lesson.id} className={s.item}><h4>{lesson.week!==undefined?lesson.week===0?'준비 주차 · ':lesson.week+'주차 · ':''}{lesson.day}일차 · {lesson.title}</h4>{excerpt&&<p>{excerpt}</p>}<button onClick={()=>{try{sessionStorage.setItem('campus:find:'+lesson.id,query.trim());}catch{/* optional */}onOpen(lesson.id);}}>수업 열기</button></article>):<p>이 낱말이 나오는 수업이 없어요. 다른 낱말로 찾아보세요.</p>}</div>}
  </section>
  <GuidancePanel snapshot={snapshot} onOpen={onOpen} onAsk={onAsk}/>
 </div>;
}
