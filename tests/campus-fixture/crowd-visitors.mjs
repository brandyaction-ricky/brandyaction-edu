import {crowdLayout} from './crowd-layout.mjs';
/** Explicit synthetic sessions for LOCAL preview QA, always labelled by the server. */
export async function startCrowdVisitors(base,count=60,{socialGroups=false}={}){
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
 return{clients,post,async stop(){closed=true;clearInterval(timer);for(const c of clients)c.abort.abort();await Promise.allSettled(clients.map(c=>post({...c.session,kind:'leave'})));await Promise.allSettled(clients.map(c=>c.read));}};
}
