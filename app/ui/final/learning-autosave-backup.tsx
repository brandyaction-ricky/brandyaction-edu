"use client";
import {useRouter} from 'next/navigation';
import {useCallback,useEffect, useImperativeHandle, useRef, useState} from 'react';
import {learningDraftKey,parseLearningEditorDraft,type LearningEditorDraft} from '@/lib/learning-editor-draft';
import type {LearningDraftHandle} from './learning-editor-draft';

type Backup={key:string;raw:string;draft?:LearningEditorDraft};
// Each mounted editor owns its own slot. Neither another tab nor a stale
// browser backup is allowed to block writing or clear another tab's work.
export function LearningAutosaveBackup({actorId,lessonId,dirty,ready,capture,restore,handleRef,onPending,onError,changeKey}:{
 actorId:string;lessonId:string;dirty:boolean;ready:boolean;changeKey:string;
 capture:()=>LearningEditorDraft;restore:(draft:LearningEditorDraft)=>void;
 handleRef:React.RefObject<LearningDraftHandle|null>;onPending:(pending:boolean)=>void;onError:(message:string)=>void;
}){
 const router=useRouter();
 const [archives,setArchives]=useState<Backup[]>([]);
 const [backups,setBackups]=useState<Backup[]>([]),[message,setMessage]=useState(''),[savedAt,setSavedAt]=useState('');
 const current=useRef({capture,restore,dirty,ready});
 const key=useRef(''),attempted=useRef(false),last=useRef('');
 useEffect(()=>{current.current={capture,restore,dirty,ready};});
 const saveNow=useCallback(()=>{
  if(!key.current||!current.current.dirty||!current.current.ready)return;
  try{
   const draft=current.current.capture(),fingerprint=JSON.stringify({...draft,savedAt:''});
   if(fingerprint===last.current)return;
   const raw=JSON.stringify(draft);if(new TextEncoder().encode(raw).byteLength>4_000_000)throw Error('임시저장 크기를 넘었습니다. 편집 내용을 내려받아 주세요.');
   localStorage.setItem(key.current,raw);last.current=fingerprint;setSavedAt(draft.savedAt);setMessage('');onError('');
  }catch{onError('브라우저 보관에 실패했습니다. 서버 자동저장 완료를 확인하거나 저장 기록에서 편집 내용을 내려받아 주세요.');}
 },[onError]);
 function clear(){
  try{if(key.current)localStorage.removeItem(key.current);last.current='';setSavedAt('');}catch{/* Keep the last backup if removing it is unavailable. */}
 }
 useImperativeHandle(handleRef,()=>({saveNow,clear}));
 useEffect(()=>{
  const base=learningDraftKey(actorId,lessonId);key.current=`${base}:tab:${crypto.randomUUID()}`;
  let cancelled=false;
  queueMicrotask(()=>{if(cancelled)return;
  const found:Backup[]=[],archived:Backup[]=[];
  try{
   for(let i=0;i<localStorage.length;i++){
    const name=localStorage.key(i)!;const isArchive=name.startsWith(`${base}:archive:`);if(name!==base&&!name.startsWith(`${base}:tab:`)&&!isArchive)continue;
    const raw=localStorage.getItem(name);if(!raw)continue;
    if(isArchive){archived.push({key:name,raw});continue;}
    try{found.push({key:name,raw,draft:parseLearningEditorDraft(raw,actorId,lessonId)});}catch{found.push({key:name,raw});}
   }
   found.sort((a,b)=>(b.draft?.savedAt||'').localeCompare(a.draft?.savedAt||''));setBackups(found);setArchives(archived);
  }catch{setMessage('브라우저 보관함을 읽지 못했습니다. 서버 자동저장은 계속 시도합니다.');}
  onPending(false);});
  const timer=window.setInterval(saveNow,2000);
  const leave=()=>saveNow(),hide=()=>{if(document.visibilityState==='hidden')saveNow();};
  window.addEventListener('pagehide',leave);window.addEventListener('beforeunload',leave);document.addEventListener('visibilitychange',hide);
  return()=>{saveNow();cancelled=true;clearInterval(timer);window.removeEventListener('pagehide',leave);window.removeEventListener('beforeunload',leave);document.removeEventListener('visibilitychange',hide);};
 // Identity stays stable for this mounted editor, including its first server save.
 },[actorId,lessonId,onPending,saveNow]);
 useEffect(()=>{const timer=window.setTimeout(saveNow,400);return()=>clearTimeout(timer);},[changeKey,dirty,ready,saveNow]);
 function recover(backup:Backup){
  if(!backup.draft)return;
  try{
   // Preserve the original verbatim before removing its legacy active slot.
   const archiveKey=`${learningDraftKey(actorId,lessonId)}:archive:${crypto.randomUUID()}`;
   localStorage.setItem(archiveKey,backup.raw);setArchives(previous=>[...previous,{key:archiveKey,raw:backup.raw}]);
   if(!lessonId&&backup.draft.storedLessonId){
    const existingId=backup.draft.storedLessonId;
    localStorage.setItem(`${learningDraftKey(actorId,existingId)}:tab:${crypto.randomUUID()}`,JSON.stringify({...backup.draft,scopeLessonId:existingId}));
    if(localStorage.getItem(backup.key)===backup.raw)localStorage.removeItem(backup.key);
    router.push('/admin/learning-editor?id='+encodeURIComponent(existingId));return;
   }
   current.current.restore(backup.draft);
   if(localStorage.getItem(backup.key)===backup.raw)localStorage.removeItem(backup.key);
   setBackups(previous=>previous.filter(item=>item.key!==backup.key));setMessage('이전에 작성하던 내용도 불러왔습니다. 자동으로 보관합니다.');
  }catch(error){setMessage(`이전 편집본은 보관되어 있습니다. ${(error as Error).message} 지금 작성하는 내용은 계속 저장할 수 있습니다.`);}
 }
 useEffect(()=>{
  if(!ready||attempted.current||!backups.length)return;attempted.current=true;
  // Never replace typing that began before recovery finished loading.
  if(!dirty&&backups[0].draft&&(lessonId||!backups[0].draft.storedLessonId))queueMicrotask(()=>{if(!current.current.dirty)recover(backups[0]);});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,backups,dirty]);
 function download(raw?:string){
  const blob=new Blob([raw||JSON.stringify(current.current.capture(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='수업-편집내용.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="learning-local-draft notice" aria-label="편집 임시저장">
  <strong>기기 복구 옵션</strong><p>인터넷이 끊길 때를 대비해 이 기기에도 보관합니다. 서버에 직접 저장하려면 위의 ‘지금 저장’을 누르세요.</p>
  {savedAt&&<p role="status">이 기기에 보관됨 · {new Date(savedAt).toLocaleTimeString('ko-KR')}</p>}
  {message&&<p role="status">{message}</p>}
  <button type="button" className="btn small" onClick={saveNow} disabled={!ready}>지금 임시저장</button>{' '}
  <button type="button" className="btn small" onClick={()=>download()} disabled={!ready}>편집 내용 내려받기</button>
  {backups.map((backup,index)=><div key={backup.key} className="learning-draft-actions"><span>이전 편집본 {index+1}{backup.draft?` · ${new Date(backup.draft.savedAt).toLocaleString('ko-KR')}`:''}</span>{backup.draft&&<button type="button" className="btn small" disabled={!ready} onClick={()=>recover(backup)}>{!lessonId&&backup.draft.storedLessonId?'등록된 학습에서 복구하기':'불러와 합치기'}</button>}<button type="button" className="btn small" onClick={()=>download(backup.raw)}>원본 내려받기</button></div>)}
 {archives.length>0&&<details><summary>복구 전 원본 {archives.length}개</summary>{archives.map((backup,index)=><button key={backup.key} type="button" className="btn small" onClick={()=>download(backup.raw)}>원본 {index+1} 내려받기</button>)}</details>}
 </section>;
}
