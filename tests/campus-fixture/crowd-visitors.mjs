import {crowdLayout,crowdMotion} from './crowd-layout.mjs';
/** Explicit synthetic sessions for LOCAL preview QA, always labelled by the server. */
export async function startCrowdVisitors(base,count=60,{socialGroups=false,animate=false}={}){
 const url=new URL(base);if(!['127.0.0.1','localhost','172.16.41.153'].includes(url.hostname)||url.pathname!=='/')throw Error('Local fixture only');
 const endpoint=url.origin+'/api/campus/preview-meetup',clients=[],layout=crowdLayout(count);let closed=false;
 const post=async data=>{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)throw Error('QA join/update '+r.status);return r.json();};
 try{for(let i=0;i<count;i++){
  const appearance={nickname:'검수 동료 '+(i+1),gender:i%2?'female':'male',model:i%6,coat:['#386eb4','#ad7258','#537f69','#8173aa'][i%4],skinColor:'#e8b68b',hairColor:'#302825'},session=await post({kind:'join',room:'live',role:'guest',synthetic:true,appearance});
  const {x,y,yaw}=layout[i];
  await post({...session,kind:'update',x,y,yaw,moving:false});const abort=new AbortController();
  const read=(async()=>{try{const response=await fetch(endpoint+'?'+new URLSearchParams(session),{signal:abort.signal});const reader=response.body.getReader();while(!closed){if((await reader.read()).done)break;}}catch(e){if(!closed&&e.name!=='AbortError')throw e;}})();read.catch(()=>{});clients.push({session,abort,read,...layout[i]});
 }
 if(socialGroups){const leaders=new Map();for(const c of clients){if(!leaders.has(c.group)){const r=await post({...c.session,kind:'leaveGroup'});c.session.partition=r.partition;leaders.set(c.group,c.session.partition);}else{const r=await post({...c.session,kind:'joinGroup',partition:leaders.get(c.group)});c.session.partition=r.partition;}}}
 }catch(e){closed=true;for(const c of clients){c.abort.abort();await post({...c.session,kind:'leave'}).catch(()=>{});}throw e;}
 const timer=setInterval(()=>{for(const c of clients)void post({...c.session,kind:'resume'}).catch(()=>{});},10000);
 const motionStats={updates:0,errors:0,maxMoving:0,samples:0},signatures=new Map();let motionBusy=false;
 const motion=animate?setInterval(async()=>{
  if(closed||motionBusy)return;motionBusy=true;
  try{
   const states=clients.map((c,i)=>crowdMotion(c,i,Date.now()/1000));motionStats.samples++;motionStats.maxMoving=Math.max(motionStats.maxMoving,states.filter(p=>p.moving).length);
   await Promise.all(clients.map(async(c,i)=>{
    const p=states[i],payload={x:Math.round(p.x*1000)/1000,y:Math.round(p.y*1000)/1000,yaw:p.yaw,moving:p.moving},signature=JSON.stringify(payload);
    if(signatures.get(i)===signature)return;
    try{await post({...c.session,kind:'update',...payload});signatures.set(i,signature);motionStats.updates++;}catch{motionStats.errors++;}
   }));
  }finally{motionBusy=false;}
 },500):null;
 return{clients,post,motionStats,async stop(){closed=true;clearInterval(timer);if(motion)clearInterval(motion);for(const c of clients)c.abort.abort();await Promise.allSettled(clients.map(c=>post({...c.session,kind:'leave'})));await Promise.allSettled(clients.map(c=>c.read));}};
}
