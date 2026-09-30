"use client";
import { useEffect,useRef,useState } from 'react';
import { ongoingLabels,type OngoingCadence } from '@/lib/ongoing-lessons';
export function OngoingLessonSettings({lessonId,disabled}:{lessonId:string;disabled:boolean}){
 const [open,setOpen]=useState(false);
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>지속 챌린지 반복 설정</summary>{open&&<Settings key={lessonId} lessonId={lessonId} disabled={disabled}/>}</details>;
}
function Settings({lessonId,disabled}:{lessonId:string;disabled:boolean}){
 const [cadence,setCadence]=useState<OngoingCadence>('daily'),[loaded,setLoaded]=useState(false),[fixed,setFixed]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const flight=useRef(false),requestId=useRef<string|null>(null);
 useEffect(()=>{const abort=new AbortController();void fetch(`/api/platform/ongoing-lessons?action=settings&lesson=${lessonId}`,{cache:'no-store',signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);return d.settings;}).then(settings=>{if(abort.signal.aborted)return;if(settings){setCadence(settings.cadence);setFixed(true);}setError('');setLoaded(true);}).catch(e=>{if(!abort.signal.aborted)setError(e.message||'설정을 불러오지 못했습니다.');});return()=>abort.abort();},[lessonId,reload]);
 async function save(){if(flight.current||disabled||!loaded||fixed)return;flight.current=true;setBusy(true);setError('');requestId.current??=crypto.randomUUID();try{const r=await fetch('/api/platform/ongoing-lessons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'configure',lessonId,cadence,requestId:requestId.current})});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status});if(data.lesson_id!==lessonId||data.cadence!==cadence)throw new Error('저장 결과를 확인하지 못했습니다.');setFixed(true);setUncertain(false);}catch(e){const failure=e as {status?:number};setUncertain(!failure.status||failure.status>=500);setError((e as Error).message||'설정을 저장하지 못했습니다.');}finally{flight.current=false;setBusy(false);}}
 return <div className="lb-session-notice"><p>28일차 데일리 미션을 승인받은 회원이 반복해서 참여하는 학습입니다. 자체 완료 방식의 본문을 먼저 저장하세요. 학생 기록이 있는 일반 학습은 변경할 수 없습니다.</p>
 <label>반복 주기<select value={cadence} disabled={disabled||busy||fixed||!loaded||uncertain} onChange={e=>{setCadence(e.target.value as OngoingCadence);requestId.current=null;}}>{Object.entries(ongoingLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <p>한국 시간 기준이며 주간은 일요일에 시작합니다. 저장한 반복 주기는 변경할 수 없습니다. 공개 여부는 학습 기본 정보에서 설정합니다.</p>
 {fixed?<p role="status">{ongoingLabels[cadence]} 지속 챌린지로 설정되었습니다.</p>:<button className="btn" type="button" disabled={disabled||busy||!loaded} onClick={()=>void save()}>{busy?'저장 중…':uncertain?'같은 설정으로 저장 결과 확인':'지속 챌린지로 설정'}</button>}
 {!loaded&&!error&&<p role="status">설정을 확인하고 있습니다.</p>}{error&&<p role="alert">{error} {!loaded&&<button className="btn" type="button" onClick={()=>setReload(value=>value+1)}>다시 확인</button>}</p>}
 </div>;
}
