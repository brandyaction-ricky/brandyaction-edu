"use client";
import { useEffect,useRef,useState } from 'react';
import { LessonBlockAutosave,type AutosaveState } from '@/lib/lesson-block-autosave';
import { missingBlockRequirements,type LessonBlockAnswers } from '@/lib/lesson-blocks';
import { ongoingLabels,ongoingPeriodLabel,type OngoingSnapshot,type OngoingCompletion,type OngoingHistoryItem } from '@/lib/ongoing-lessons';
import { LessonBlockView,canRenderLessonBlocks,type BlockGrade } from './lesson-block-view';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
const endpoint='/api/platform/ongoing-lessons';
async function request<T>(url:string,body?:unknown,signal?:AbortSignal):Promise<T>{const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});let data;try{data=await r.json();}catch{throw new Error('저장 응답을 확인하지 못했습니다. 다시 시도해 주세요.');}if(!r.ok)throw Object.assign(new Error(data.error||'학습 기록을 확인하지 못했습니다.'),{status:r.status});return data;}
const saveLabels:Record<AutosaveState['phase'],string>={saved:'답변 저장됨',dirty:'답변 저장 대기 중',saving:'답변 저장 중…',error:'답변 저장 실패',conflict:'저장 결과 확인 필요'};
export function OngoingLessonSession({lessonId,enrollmentId,readOnly=false}:{lessonId:string;enrollmentId:string;readOnly?:boolean}){
 const [selection,setSelection]=useState({period:null as string|null,reload:0}),[loaded,setLoaded]=useState<{key:string;snapshot?:OngoingSnapshot;error?:string}>();
 const key=`${lessonId}:${enrollmentId}:${selection.period}:${selection.reload}`;
 useEffect(()=>{const abort=new AbortController(),query=new URLSearchParams({lesson:lessonId,enrollment:enrollmentId});if(selection.period)query.set('period',selection.period);
 void request<OngoingSnapshot>(`${endpoint}?${query}`,undefined,abort.signal).then(snapshot=>{if(!abort.signal.aborted)setLoaded({key,snapshot});}).catch(error=>{if(!abort.signal.aborted)setLoaded({key,error:error.message});});return()=>abort.abort();},[key,lessonId,enrollmentId,selection.period]);
 const select=(period:string|null)=>setSelection(previous=>({period,reload:previous.reload+1}));
 if(loaded?.key!==key)return <p role="status">지속 챌린지와 내 답변을 불러오고 있습니다.</p>;
 if(loaded.error||!loaded.snapshot)return <div role="alert"><p>{loaded.error||'학습을 찾지 못했습니다.'}</p><button className="btn" onClick={()=>select(selection.period)}>다시 불러오기</button></div>;
 if(!canRenderLessonBlocks(loaded.snapshot.document))return <p role="alert">이 학습 도구를 준비하고 있습니다.</p>;
 return <PeriodSession key={key} snapshot={loaded.snapshot} lessonId={lessonId} enrollmentId={enrollmentId} select={select} readOnly={readOnly}/>;
}
function PeriodSession({snapshot,lessonId,enrollmentId,select,readOnly}:{snapshot:OngoingSnapshot;lessonId:string;enrollmentId:string;select:(period:string|null)=>void;readOnly:boolean}){
 const [values,setValues]=useState<LessonBlockAnswers>(snapshot.draft?.values||{blocks:{},checklist:[]}),valuesRef=useRef(values),saver=useRef<LessonBlockAutosave|null>(null);
 const [status,setStatus]=useState<AutosaveState>({phase:'saved',message:'',updatedAt:snapshot.draft?.updatedAt||null});
 const [completion,setCompletion]=useState(snapshot.completion),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const flight=useRef(false),completionRequest=useRef<{requestId:string;writeId:string}|null>(null),uploads=useRef(new Set<string>()),[uploading,setUploading]=useState(false);
 const historical=Date.parse(snapshot.periodStart)!==Date.parse(snapshot.currentPeriodStart);
 const [history,setHistory]=useState(snapshot.history),[historyBefore,setHistoryBefore]=useState<string|null>(snapshot.history.length===100?snapshot.history.at(-1)!.periodStart:null),[historyBusy,setHistoryBusy]=useState(false);
 const currentHistory = status.updatedAt ? {periodStart:snapshot.periodStart,periodEnd:snapshot.periodEnd,updatedAt:status.updatedAt,completed:Boolean(completion)} : null;
 const visibleHistory = currentHistory ? [currentHistory,...history.filter(item=>Date.parse(item.periodStart)!==Date.parse(snapshot.periodStart))].sort((a,b)=>Date.parse(b.periodStart)-Date.parse(a.periodStart)) : history;
 const completedCount=snapshot.stats.completed+(completion&&!snapshot.completion?1:0);
 const context={lessonId,enrollmentId,revision:snapshot.revision,periodStart:snapshot.periodStart};
 useUnsavedLearningChanges(!readOnly&&(status.phase!=='saved'||uploading||busy||uncertain));
 useEffect(()=>{if(historical||readOnly)return;const autosave=new LessonBlockAutosave(snapshot.draft?.values||{blocks:{},checklist:[]},snapshot.draft?.writeId||null,write=>request(endpoint,{action:'draft',lessonId,enrollmentId,revision:snapshot.revision,periodStart:snapshot.periodStart,...write}));saver.current=autosave;const off=autosave.subscribe(()=>setStatus(autosave.getSnapshot()));return()=>{off();autosave.dispose();saver.current=null;};},[snapshot,lessonId,enrollmentId,historical,readOnly]);
 function change(next:LessonBlockAnswers){valuesRef.current=next;setValues(next);saver.current?.change(next);}
 function move(period:string|null){if((saver.current?.hasUnsaved()||uploading||uncertain)&&!window.confirm('현재 입력이나 저장 결과를 아직 확인하지 못했습니다. 답변을 내려받은 뒤 이동해 주세요. 그래도 이동할까요?'))return;select(period);}
 function download(){const url=URL.createObjectURL(new Blob([JSON.stringify({...context,values:valuesRef.current},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='내-지속-챌린지-답변.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function complete(){if(flight.current||historical||completion||uploading||!saver.current)return;const missing=missingBlockRequirements(snapshot.document,valuesRef.current);if(missing.length){setError('필수 질문과 체크리스트를 완료해 주세요.');return;}flight.current=true;setBusy(true);setError('');try{
  const writeId=await saver.current.finish();if(!completionRequest.current||completionRequest.current.writeId!==writeId)completionRequest.current={requestId:crypto.randomUUID(),writeId};
  const receipt=await request<OngoingCompletion>(endpoint,{action:'complete',...context,...completionRequest.current});if(receipt.writeId!==writeId||receipt.revision!==snapshot.revision||!receipt.id)throw new Error('완료 결과를 확인하지 못했습니다.');setCompletion({...receipt,values:structuredClone(valuesRef.current)});setUncertain(false);
 }catch(e){const failure=e as {status?:number;message:string};setUncertain(Boolean(completionRequest.current)&&(!failure.status||failure.status>=500));setError(failure.message);}finally{flight.current=false;setBusy(false);}}
 async function grade(blockId:string){const r=await request<{result:BlockGrade}>(endpoint,{action:'grade',...context,blockId,values:valuesRef.current});return r.result;}
 async function more(){if(!historyBefore||historyBusy)return;setHistoryBusy(true);setError('');try{const q=new URLSearchParams({action:'history',lesson:lessonId,enrollment:enrollmentId,before:historyBefore});const page=await request<{items:OngoingHistoryItem[];nextBefore:string|null}>(`${endpoint}?${q}`);setHistory(old=>[...old,...page.items.filter(item=>!old.some(x=>x.periodStart===item.periodStart))]);setHistoryBefore(page.nextBefore);}catch(e){setError((e as Error).message);}finally{setHistoryBusy(false);}}
 return <section className="lesson-block-session" aria-label="지속 챌린지">
  <h2>{ongoingLabels[snapshot.cadence]} 챌린지</h2><p>{ongoingPeriodLabel(snapshot.periodStart,snapshot.periodEnd)} · 한국 시간</p>
  <p>{snapshot.stats.opportunities}회 중 {completedCount}회 완료 · {Math.round(completedCount*100/Math.max(1,snapshot.stats.opportunities))}% 달성</p>
  {readOnly?<div className="lb-session-notice">졸업생 열람 모드 · 이전에 작성한 기간별 기록을 볼 수 있습니다.</div>:historical?<div className="lb-session-notice">이전 기간의 기록입니다. 읽기만 할 수 있습니다. <button className="btn" onClick={()=>move(null)}>이번 기간으로</button></div>:<p role="status">{saveLabels[status.phase]}</p>}
  {completion&&<p role="status">이번 기간 완료 · {new Date(completion.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>}
  {(error||status.message)&&<div role="alert"><p>{error||status.message}</p><p>현재 입력은 이 화면에 남아 있습니다.</p><button className="btn" onClick={download}>현재 답변 내려받기</button>{status.phase==='error'&&<button className="btn" onClick={()=>void saver.current?.flush()}>저장 다시 시도</button>}<button className="btn" onClick={()=>move(null)}>이번 기간 다시 확인</button></div>}
  <LessonBlockView floatingAudio document={snapshot.document} values={values} onChange={change} livePrompts fileContext={context} readOnly={readOnly||historical||busy||uncertain} grade={readOnly||historical?undefined:grade} onAnswerChange={(id,value)=>change({...valuesRef.current,blocks:{...valuesRef.current.blocks,[id]:value}})} onFilePending={(id,pending)=>{if(pending)uploads.current.add(id);else uploads.current.delete(id);setUploading(uploads.current.size>0);}}/>
  {!readOnly&&!historical&&!completion&&<button className="btn primary" disabled={busy||uploading||status.phase==='conflict'} onClick={()=>void complete()}>{busy?'저장·완료 중…':uncertain?'같은 답변으로 완료 결과 확인':'이번 기간 챌린지 완료'}</button>}
  {!readOnly&&!historical&&completion&&<p>완료 후에도 이번 기간의 메모를 수정할 수 있습니다. 완료 당시 답변은 따로 보관됩니다.</p>}
  {completion?.values&&<details><summary>완료 당시 답변 보기</summary><LessonBlockView document={snapshot.document} values={completion.values} onChange={()=>{}} readOnly livePrompts fileContext={context}/></details>}
  <details className="mt24"><summary>기간별 내 기록</summary>{visibleHistory.length?visibleHistory.map(item=><p key={item.periodStart}><button className="btn small" disabled={busy} onClick={()=>move(item.periodStart)}>{ongoingPeriodLabel(item.periodStart,item.periodEnd)} · {item.completed?'완료':'작성 중'}</button></p>):<p>아직 저장한 이전 기록이 없습니다.</p>}{historyBefore&&<button className="btn" disabled={historyBusy} onClick={()=>void more()}>이전 기록 더 보기</button>}</details>
 </section>;
}
