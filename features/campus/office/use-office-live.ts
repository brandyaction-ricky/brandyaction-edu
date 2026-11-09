'use client';
import {useEffect,useRef,useState} from 'react';


// Events invalidate the current query; the authenticated HTTP response remains authoritative.
export function useOfficeLive({enabled,enrollment,refresh,onError,slow}:{enabled:boolean;enrollment:string|null|undefined;refresh:(signal?:AbortSignal)=>Promise<void>;onError:()=>void;slow:boolean}){
 const [connected,setConnected]=useState(false);
 const latest=useRef({refresh,onError,slow}),request=useRef<(()=>void)|null>(null);
 useEffect(()=>{latest.current={refresh,onError,slow};request.current?.();},[refresh,onError,slow]);
 useEffect(()=>{
  if(!enabled||!enrollment){setConnected(false);return;}
  let stop:undefined|(()=>void);
  function visible(){
   stop?.();stop=undefined;request.current=null;setConnected(false);
   if(document.visibilityState!=='visible')return;
   let closed=false,live=false,queued=false;
   let timer:ReturnType<typeof setTimeout>|undefined, pending:AbortController|undefined;
   let unsubscribe:(()=>void)|undefined;
   const schedule=(delay:number)=>{clearTimeout(timer);timer=setTimeout(()=>void read(),delay);};
   async function read(){
    if(closed)return;if(pending){queued=true;return;}
    clearTimeout(timer);const controller=new AbortController();pending=controller;
    try{await latest.current.refresh(controller.signal);}catch{if(!closed&&!controller.signal.aborted)latest.current.onError();}
    finally{pending=undefined;if(!closed){const again=queued;queued=false;schedule(again?80:live||latest.current.slow?60000:15000);}}
   }
   // Keep an in-flight read; one trailing read catches changes committed while it ran.
   const invalidate=()=>{if(!closed){if(pending)queued=true;else schedule(80);}};
   request.current=invalidate;void read();
   if(process.env.NEXT_PUBLIC_APP_ENV==='development' && process.env.NEXT_PUBLIC_SUPABASE_URL==='https://vjmjhaidlqkmascdjocw.supabase.co'){
    void import('@/lib/supabase/client').then(({createClient})=>{
     if(closed)return;const db=createClient();
     const ch=db.channel('office-inbox:'+enrollment+':'+crypto.randomUUID());
     let seen=0;
     ch.on('postgres_changes',{event:'*',schema:'public',table:'edu_campus_office_inbox_signals',filter:'enrollment_id=eq.'+enrollment},msg=>{
      const version=Number((msg.new as {version?:number}).version);
      if(version>seen){seen=version;invalidate();}
     }).subscribe(status=>{
      if(closed)return;
      live=status==='SUBSCRIBED';setConnected(live);
      if(live){seen=0;invalidate();} // also reconcile the gap on (re)join
      else if(!pending)schedule(15000);
     });
     unsubscribe=()=>{void db.removeChannel(ch).catch(()=>{});};
    }).catch(()=>{/* The normal polling fallback remains available. */});
   }
   stop=()=>{closed=true;clearTimeout(timer);pending?.abort();unsubscribe?.();};
  }
  document.addEventListener('visibilitychange',visible);visible();
  return()=>{document.removeEventListener('visibilitychange',visible);stop?.();request.current=null;};
 },[enabled,enrollment]);
 return connected;
}
