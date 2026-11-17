'use client';
import {useEffect,useState,useRef} from 'react';
import type {summarizeHttpMetrics} from './http-metrics';
import s from './panel.module.css';
type State={from:string;asOf:string;summary:ReturnType<typeof summarizeHttpMetrics>};
export function SpaceHttpMetrics({cohortId,demo=false}:{cohortId:string;demo?:boolean}){
 const [result,setResult]=useState<{cohort:string;data:State|null;error:string}|null>(null),[refresh,setRefresh]=useState(0);const generation=useRef(0);const data=result?.cohort===cohortId?result.data:null,error=result?.cohort===cohortId?result.error:'';
 useEffect(()=>{const ticket=++generation.current;if(demo)return;const c=new AbortController();fetch('/api/campus/space/metrics?cohortId='+cohortId,{cache:'no-store',signal:c.signal}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);if(!c.signal.aborted&&ticket===generation.current)setResult({cohort:cohortId,data:v,error:''});}).catch(e=>{if(e.name!=='AbortError'&&!c.signal.aborted&&ticket===generation.current)setResult({cohort:cohortId,data:null,error:e.message});});return()=>c.abort();},[cohortId,demo,refresh]);
 return <section className={s.content}><h3>공간 서버 요청 관측</h3><p className={s.caption}>최근 24시간 동안 기록된 공간 상태·좌석·채팅 API 요청입니다. 5분 단위로 합산하며, 이동 프레임이나 대화 원문은 저장하지 않습니다.</p>{error&&<p role="alert">{error}</p>}{data?<><p>기록된 요청 <strong>{data.summary.requests.toLocaleString()}건</strong> · 서버 오류 {data.summary.serverErrors}건 · 요청 거절 {data.summary.clientErrors}건</p><p>평균 {data.summary.averageMs===null?'기록 없음':Math.round(data.summary.averageMs)+'ms'} · 최대 {data.summary.maxMs}ms · 3초 이상 {data.summary.slow}건</p><small>{new Date(data.asOf).toLocaleString('ko-KR')} 조회</small></>:<p>{demo?'예시 화면에서는 서버 요청 수를 만들지 않습니다.':'기록을 확인하고 있어요.'}</p>}<button onClick={()=>{setResult(null);setRefresh(v=>v+1);}}>서버 요청 기록 새로고침</button><p className={s.caption}>인증 전 거절·관측 저장 실패·Supabase WebSocket 내부 처리는 이 수치에 포함되지 않습니다. 전체 트래픽이나 청구 금액을 뜻하지 않습니다.</p></section>;
}
