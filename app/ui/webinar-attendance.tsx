'use client';
import { useEffect, useRef, useState } from 'react';
import { liveLabel, type AttendanceReport, type LiveSession } from '@/lib/webinar-attendance';
export function WebinarAttendance({code}:{code:string}) {
 const [report,setReport]=useState<AttendanceReport|null>(null),[message,setMessage]=useState(''),[pending,setPending]=useState(true),[refresh,setRefresh]=useState(0);
 const busy=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/webinar/attendance?code=${encodeURIComponent(code)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setReport(data);
  }).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[code,refresh]);
 const checkin=async(session:LiveSession)=>{
  if(busy.current)return;busy.current=true;setPending(true);setMessage('');
  try{
   const response=await fetch('/api/webinar/attendance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,phase:session.phase,expected:session.revision})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);setReport(data);
  }catch(e){setMessage((e as Error).message);}finally{busy.current=false;setPending(false);}
 };
 return <section aria-label="라이브 출석 확인">
  <h2>라이브 출석 확인</h2><p>방송 중 안내에 따라 출석을 확인해 주세요. 직접 누른 출석 확인 기록이며, 시청 시간을 측정하지 않습니다.</p>
  {(['first','encore'] as const).map(phase=>{
   const s=report?.sessions.find(row=>row.phase===phase);
   return <section key={phase} aria-label={liveLabel(phase)} style={{borderTop:'1px solid #ddd',padding:'16px 0'}}>
    <h3>{liveLabel(phase)}</h3>
    {s?.url&&<a href={s.url} target="_blank" rel="noopener noreferrer">{liveLabel(phase)} YouTube 열기</a>}
    {s?.checked?<p role="status">{liveLabel(phase)} 출석 확인 완료</p>:s?.open?<button disabled={pending} onClick={()=>void checkin(s)}>{liveLabel(phase)} 출석 확인</button>:<p>{report?(s?'출석 접수 전 또는 마감 상태입니다.':'라이브 안내 준비 중입니다.'):'출석 정보를 불러오는 중입니다.'}</p>}
   </section>;
  })}
  <button disabled={pending} onClick={()=>{setPending(true);setReport(null);setMessage('');setRefresh(n=>n+1);}}>출석 상태 새로고침</button>
  {message&&<p role="alert">{message}</p>}
 </section>;
}
