'use client';
import {useEffect,useRef} from 'react';
import {actionLabels,type Activity,type AnalyticsRoom,type CampusAction} from './domain';
export function campusActivity(action:CampusAction,target?:string){window.dispatchEvent(new CustomEvent('campus:activity',{detail:{action,target}}));}
// The transport is deliberately detached from UI state: no spinner, no await on movement.
export function useCampusAnalytics(scope:string|undefined,room:AnalyticsRoom){
 const current=useRef(room);useEffect(()=>{current.current=room;},[room]);
 const send=useRef<(event:Activity)=>void>(()=>{});
 useEffect(()=>{
  if(!scope)return;let session:string;try{session=sessionStorage.getItem('edu-campus-session')||crypto.randomUUID();sessionStorage.setItem('edu-campus-session',session);}catch{return;}
  const events:Activity[]=[];let dwell:Partial<Record<AnalyticsRoom,number>>={},last=performance.now(),active=last,stopped=false,inflight=false;
  const activity=()=>{active=performance.now();};
  const tick=()=>{const now=performance.now(),elapsed=Math.min(2,Math.max(0,(now-last)/1000));last=now;if(document.visibilityState==='visible'&&now-active<60000){const r=current.current;dwell[r]=Math.min(35,(dwell[r]||0)+elapsed);}};
  const flush=(beacon=false)=>{tick();if(stopped||inflight&&!beacon)return;let remaining=35;const seconds=Object.fromEntries(Object.entries(dwell).map(([k,v])=>{const n=Math.min(remaining,Math.floor(v));remaining-=n;return[k,n];}).filter(([,v])=>Number(v)>0));if(!events.length&&!Object.keys(seconds).length)return;
   const payload={id:crypto.randomUUID(),session,scope,events:events.splice(0,32),dwell:seconds};dwell={};const body=JSON.stringify(payload);
   if(beacon){navigator.sendBeacon('/api/campus/analytics',new Blob([body],{type:'application/json'}));return;}
   inflight=true;void fetch('/api/campus/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).then(r=>{if(r.status===403||r.status===404)stopped=true;}).catch(()=>{}).finally(()=>{inflight=false;});
  };
  send.current=e=>{activity();if(!stopped&&events.length<32)events.push(e);};
  const custom=(event:Event)=>{const d=(event as CustomEvent).detail;if(d&&Object.hasOwn(actionLabels,d.action)&&(!d.target||typeof d.target==='string'&&/^[a-zA-Z0-9:_-]{1,80}$/.test(d.target)))send.current({room:current.current,action:d.action,...(d.target?{target:d.target}:{})});};window.addEventListener('campus:activity',custom);
  const hidden=()=>{if(document.visibilityState==='hidden')flush(true);else{last=performance.now();active=last;}};const exit=()=>flush(true);
  const timer=setInterval(tick,1000),transport=setInterval(()=>flush(),30000+Math.random()*2000);
  for(const name of ['pointerdown','pointermove','keydown','touchstart'])window.addEventListener(name,activity,{passive:true});document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',exit);
  return()=>{flush(true);send.current=()=>{};window.removeEventListener('campus:activity',custom);clearInterval(timer);clearInterval(transport);for(const name of ['pointerdown','pointermove','keydown','touchstart'])window.removeEventListener(name,activity);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',exit);};
 },[scope]);
 useEffect(()=>{if(scope)send.current({room,action:'room_enter'});},[scope,room]);
 return (action:CampusAction,target?:string,location:AnalyticsRoom=current.current)=>send.current({room:location,action,...(target?{target}: {})});
}
