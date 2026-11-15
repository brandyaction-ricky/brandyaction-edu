import type {SupabaseClient} from '@supabase/supabase-js';

/**
 * The broadcast is an invalidation only. Re-read the authorized snapshot after a burst.
 * When a class starts, every arrival invalidates every open browser. Waiting 3-5 s (jittered) folds a burst of arrivals into
 * one read per browser instead of one per arrival; the 15 s heartbeat refreshes the list in any case.
 */
export function watchStudyRoster(db:SupabaseClient, cohortId:string, refresh:(signal:AbortSignal)=>Promise<void>, chatVisible:()=>boolean) {
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
  },3000+Math.random()*2000);
 }
 const channel=db.channel('campus-roster:'+cohortId,{config:{private:true}});
 channel.on('broadcast',{event:'roster-changed'},changed)
  .on('broadcast',{event:'chat-changed'},()=>{if(chatVisible())changed();})
  .subscribe(status=>{if(status==='SUBSCRIBED')changed();});
 return {refresh:changed,close(){
  lifetime.abort();clearTimeout(timer);
  void db.removeChannel(channel).catch(()=>{});
 }};
}
