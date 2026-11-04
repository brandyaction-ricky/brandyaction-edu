/** Limit periodic ambient work only. Direct input-triggered draws remain immediate. */
export function createFrameBudget({idleInterval=1000,activeWindow=3000,activeInterval=0}={}){
 let activeUntil=0,last=-Infinity;
 return {
  wake(now){activeUntil=Math.max(activeUntil,now+activeWindow);},
  shouldDraw(now,{moving=false,hidden=false}={}){
   if(hidden)return false;
   if(now-last<activeInterval)return false;
   if(!moving&&now>=activeUntil&&now-last<idleInterval)return false;
   last=now;return true;
  },
 };
}
