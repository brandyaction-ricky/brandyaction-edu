'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminButton, AdminInput, AdminSection } from '@/features/admin-ui';
import { liveLabel, type AttendanceReport, type LivePhase, type LiveSession } from '@/lib/webinar-attendance';
function SessionEditor({code,phase,session,saved}:{code:string;phase:LivePhase;session?:LiveSession;saved:()=>void}) {
 const [url,setUrl]=useState(session?.url??''),[open,setOpen]=useState(session?.open??false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 const save=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/conversion/webinar-attendance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,phase,url,open,expected:session?.revision??0})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);saved();
  }catch(e){setMessage((e as Error).message);}finally{lock.current=false;setBusy(false);}
 };
 return <fieldset disabled={busy}>
  <legend>{liveLabel(phase)}</legend>
  <AdminInput label={`${liveLabel(phase)} YouTube 주소`} value={url} onChange={e=>setUrl(e.target.value)} readOnly={(session?.count??0)>0}/>
  <label><input type="checkbox" checked={open} onChange={e=>setOpen(e.target.checked)}/> {liveLabel(phase)} 출석 접수 열기</label>
  <p>{session?`저장 상태: ${session.open?'접수 열림':'접수 닫힘'} · 버전 ${session.revision} · 본인 출석 확인 ${session.count??0}명`:'미설정 · 출석 확인 집계 전'}</p>
  <AdminButton disabled={busy||(open&&!url.trim())} onClick={()=>void save()}>{liveLabel(phase)} 설정 저장</AdminButton>
  {message&&<p role="alert">{message} 최신 설정을 다시 불러와 주세요.</p>}
 </fieldset>;
}
export function WebinarAttendanceManagement({code}:{code:string}) {
 const [report,setReport]=useState<AttendanceReport|null>(null),[pending,setPending]=useState(true),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/conversion/webinar-attendance?code=${encodeURIComponent(code)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setReport(data);
  }).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[code,refresh]);
 const reload=()=>{setReport(null);setPending(true);setMessage('');setRefresh(n=>n+1);};
 return <AdminSection title="첫·앵콜 라이브 출석 설정" description="일정이 정해지면 YouTube 주소를 저장하고, 방송 중 출석 접수를 열어 주세요." bordered>
  <p>무료 신청을 완료한 회원이 신청 페이지에서 직접 출석을 확인합니다. 영상 열기만으로 출석 처리하지 않습니다. 출석이 생긴 영상 주소는 변경할 수 없으며, 접수를 닫아도 기록은 유지됩니다. 신청 링크가 중지되면 출석 접수도 차단됩니다.</p>
  {report&&(['first','encore'] as const).map(phase=><SessionEditor key={`${phase}:${refresh}`} code={code} phase={phase} session={report.sessions.find(s=>s.phase===phase)} saved={reload}/>)}
  {report&&<p>{report.sessions.length?`본인 출석 확인 고유 인원 ${report.unique??0}명 · 첫·앵콜 모두 확인 ${report.both??0}명`:'라이브 미설정 · 출석 확인 집계 전'} · 실제 시청 시간은 미확인입니다.</p>}
  <AdminButton disabled={pending} onClick={reload}>라이브 설정·출석 새로고침</AdminButton>
  {message&&<p role="alert">{message}</p>}
 </AdminSection>;
}
