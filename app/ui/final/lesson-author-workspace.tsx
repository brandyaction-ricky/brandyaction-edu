"use client";
import { useEffect, useState, type ReactNode } from 'react';
import type { AuthorPayload, AuthorSnapshot } from '@/lib/lesson-author-drafts';

export type AuthorSession = { snapshot: AuthorSnapshot; isNew: boolean; accept: (snapshot: AuthorSnapshot) => void };
export async function authorRequest(body: unknown) {
  const response = await fetch('/api/admin/lesson-author',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result = await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error || '초안을 저장하지 못했습니다.'),{status:response.status});
  return result;
}
export async function readAuthor(lessonId: string, version?: string) {
  const response=await fetch(`/api/admin/lesson-author?lesson=${encodeURIComponent(lessonId)}${version === 'public' ? '&source=public' : version ? `&version=${encodeURIComponent(version)}` : ''}`,{cache:'no-store'});
  const result=await response.json();if(!response.ok)throw new Error(result.error || '초안을 불러오지 못했습니다.');return result;
}
export function LessonAuthorWorkspace({lessonId,initial,children}: {lessonId?:string;initial:AuthorPayload;children:(session:AuthorSession)=>ReactNode}) {
  const [snapshot,setSnapshot]=useState<AuthorSnapshot|null>(()=>lessonId?null:{lessonId:crypto.randomUUID(),revision:null,publishedRevision:null,publishedStamp:null,baseStamp:'',payload:initial,public:{stamp:'',payload:initial,blockRevision:null},history:[]});
  const [error,setError]=useState(''),[retry,setRetry]=useState(0),[isNew,setIsNew]=useState(!lessonId);
  useEffect(()=>{if(!lessonId)return;let active=true;readAuthor(lessonId).then(value=>{if(active)setSnapshot(value);}).catch(cause=>{if(active)setError((cause as Error).message);});return()=>{active=false;};},[lessonId,retry]);
  if(error)return <p role="alert" className="notice warning">{error} <button type="button" className="btn" onClick={()=>{setError('');setRetry(n=>n+1);}}>초안 다시 불러오기</button></p>;
  if(!snapshot)return <p role="status">저장된 초안과 학생 화면을 확인하고 있습니다…</p>;
  return children({snapshot,isNew,accept:next=>{setSnapshot(next);setIsNew(false);}});
}
