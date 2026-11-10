'use client';
import {useEffect,useState} from 'react';
import type {BotProfile} from '@/public/campus/world/office/bot-profile.mjs';

export function useDirectory(enrollment:string|null,enabled:boolean,refreshKey:number){
 const [pages,setPages]=useState<string[]>(['']),[data,setData]=useState<{employees:BotProfile[];next:string|null}|null>(null),[error,setError]=useState('');
 const after=pages[pages.length-1];
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear the previous directory result when synchronizing with a new external request.
 useEffect(()=>{if(!enabled||!enrollment)return;const c=new AbortController();setError('');setData(null);
  const params=new URLSearchParams({enrollmentId:enrollment,directory:'1',after});
  void fetch('/api/campus/office/agents?'+params,{signal:c.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'직원 목록을 읽지 못했어요.');if(!c.signal.aborted)setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
  return()=>c.abort();
 },[after,enrollment,enabled,refreshKey]);
 return {data,error,page:pages.length,first:()=>setPages(['']),prev:()=>setPages(p=>p.length>1?p.slice(0,-1):p),next:()=>{if(data?.next)setPages([...pages,data.next]);}};
}
