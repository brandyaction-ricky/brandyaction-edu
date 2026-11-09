import type {SupabaseClient} from '@supabase/supabase-js';

/** The broadcast is an invalidation only. Re-read the authorized snapshot after a burst. */
export function watchStudyRoster(db:SupabaseClient, cohortId:string, refresh:(signal:AbortSignal)=>Promise<void>) {
 const lifetime=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let reading=false, pending=false;
 function changed(){
  if(lifetime.signal.aborted)return;
  pending=true;
  if(reading||timer!==undefined)return;
  timer=setTimeout(async()=>{
   timer=undefined;
   reading=true;
   pending=false;
   try{await refresh(AbortSignal.any([lifetime.signal,AbortSignal.timeout(5000)]));}
   catch{/* Periodic heartbeats continue independently if this read fails. */}
   finally{reading=false;if(pending)changed();}
  },100);
 }
 const channel=db.channel('campus-roster:'+cohortId,{config:{private:true}});
 channel.on('broadcast',{event:'roster-changed'},changed)
  .subscribe(status=>{if(status==='SUBSCRIBED')changed();});
 return ()=>{
  lifetime.abort();clearTimeout(timer);
  void db.removeChannel(channel).catch(()=>{});
 };
}
