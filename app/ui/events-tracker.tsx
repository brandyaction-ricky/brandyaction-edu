'use client';
import {syncTestMode} from '@/lib/landing-browser';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export function EventsTracker({enabled}:{enabled:boolean}) {
 const path=usePathname();
 useEffect(()=>{
  if(syncTestMode()||!enabled||!/^\/(?:$|classes(?:\/[a-zA-Z0-9_-]+)?$|articles(?:\/[a-zA-Z0-9_-]+)?$|stories$|checkout$|apply$)/.test(path))return;
  let session='';let metadata:Record<string,string>={};
  try {session=sessionStorage.getItem('edu-visit')||crypto.randomUUID();sessionStorage.setItem('edu-visit',session);const params=new URLSearchParams(location.search);for(const key of ['source','medium','campaign']){const value=params.get('utm_'+key);if(value)metadata[key]=value.slice(0,100);}if(Object.keys(metadata).length)sessionStorage.setItem('edu-utm',JSON.stringify(metadata));else metadata=JSON.parse(sessionStorage.getItem('edu-utm')||'{}');}catch{return;}
  const send=(event:string,target?:string)=>{void fetch('/api/platform/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,path,event,target,metadata}),keepalive:true}).catch(()=>{});};
  send(path.startsWith('/classes/')?'class_view':path.startsWith('/articles/')?'article_view':['/checkout','/apply'].includes(path)?'checkout_view':'page_view');
  const click=(e:MouseEvent)=>{const link=(e.target as Element)?.closest?.('a');if(!link)return;const url=new URL(link.href,location.origin);if(url.origin!==location.origin)return;send(['/checkout','/apply'].includes(url.pathname)?'application_click':url.pathname.startsWith('/articles/')?'article_click':'click',url.pathname);};
  document.addEventListener('click',click);return()=>document.removeEventListener('click',click);
 },[path,enabled]);
 return null;
}
