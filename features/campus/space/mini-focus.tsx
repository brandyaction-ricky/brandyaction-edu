'use client';
import {useEffect,useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import {clockText,elapsed,pauseClock,resumeClock,type FocusClock} from './domain';
import styles from './panel.module.css';
export const SPACE_CLOCK_EVENT='moonshot-space-clock-change';
export function spaceClockKey(snapshot:CampusSnapshot,demo:boolean){const scope=snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId);return `moonshot-space-clock:${demo?'demo':'live'}:${snapshot.viewer.id}:${scope?.cohortId}`;}
export function readSpaceClock(key:string):FocusClock|null{try{const raw=JSON.parse(sessionStorage.getItem(key)||'null');return raw&&['focus','break'].includes(raw.phase)&&Number.isInteger(raw.duration)&&raw.duration>=0&&raw.duration<=3000&&Number.isFinite(raw.elapsed)&&raw.elapsed>=0&&(raw.runningSince===null||Number.isFinite(raw.runningSince))?raw:null;}catch{return null;}}
export function MiniFocus({snapshot,demo=false,onReturn}:{snapshot:CampusSnapshot;demo?:boolean;onReturn:()=>void}){
 const key=spaceClockKey(snapshot,demo),[clock,setClock]=useState<FocusClock|null>(null),[now,setNow]=useState(Date.now),[peerStatus,setPeerStatus]=useState<string|null>(null);
 const cohortId=snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId)?.cohortId,hasClock=!!clock;
 useEffect(()=>{const read=()=>setClock(readSpaceClock(key));read();const tick=setInterval(()=>setNow(Date.now()),1000);const update=(e:Event)=>{if((e as CustomEvent).detail?.key===key)read();};window.addEventListener(SPACE_CLOCK_EVENT,update);return()=>{clearInterval(tick);window.removeEventListener(SPACE_CLOCK_EVENT,update);};},[key]);
 useEffect(()=>{if(demo||!cohortId||!hasClock)return;const controller=new AbortController();let stopped=false,inflight=false;
 const refresh=async()=>{if(stopped||inflight||document.hidden)return;inflight=true;try{const r=await fetch('/api/campus/space?cohortId='+encodeURIComponent(cohortId),{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!r.ok){if(!stopped)setPeerStatus(null);return;}const value=await r.json();if(!Array.isArray(value.peers))return;const now=Date.now(),peers=value.peers.filter((p:{userId?:string;expiresAt?:string})=>p.userId!==snapshot.viewer.id&&typeof p.expiresAt==='string'&&Date.parse(p.expiresAt)>now).slice(0,24);const focused=peers.filter((p:{focusUntil?:string})=>typeof p.focusUntil==='string'&&Date.parse(p.focusUntil)>now).length,help=peers.filter((p:{status?:string})=>p.status==='help').length;if(!stopped)setPeerStatus(value.controls?.paused?'공간 정리 중':`공간 동료 ${peers.length}명${focused?' · 집중 '+focused+'명':''}${help?' · 도움 필요 '+help+'명':''}`);}catch{if(!stopped)setPeerStatus(null);}finally{inflight=false;}};
 void refresh();const interval=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{stopped=true;controller.abort();clearInterval(interval);document.removeEventListener('visibilitychange',refresh);};
 },[demo,cohortId,hasClock,snapshot.viewer.id]);
 if(!clock)return null;
 const done=clock.duration>0&&elapsed(clock,now)>=clock.duration;
 function toggle(){if(!clock)return;const next=clock.runningSince===null?resumeClock(clock):pauseClock(clock);try{sessionStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new CustomEvent(SPACE_CLOCK_EVENT,{detail:{key}}));}catch{/* Timer state remains local. */}setClock(next);}
 return <aside className={styles.mini} aria-label="이어서 하는 문샷 집중"><div><span>{done?'집중 시간이 끝났어요':clock.phase==='break'?'잠깐 쉬는 중':'나의 집중은 이어지고 있어요'}</span><strong>{clockText(clock,now)}</strong></div>{peerStatus&&<span className={styles.miniPeers} aria-label="공간 동료 상태" title="30초 간격으로 확인합니다">{peerStatus}</span>}{!done&&<button onClick={toggle}>{clock.runningSince===null?'이어 하기':'잠시 멈추기'}</button>}<button onClick={onReturn}>{done?'마무리 메모 남기기':'집중실로 돌아가기'}</button></aside>;
}
