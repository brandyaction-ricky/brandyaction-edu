import {REACTIONS,REACTION_TTL,REACTION_COOLDOWN,reactionText} from '../../../public/campus/world/tour/reactions.mjs';
import {sanitizeDevVisitor} from './dev-presence';
type Session={id:string;ticket:string};
type Peer={id:string;x:number;y:number;yaw:number;moving:boolean;appearance?:Record<string,unknown>;message?:string;messageAt?:number};

/** Browser adapter for the private DEV review page. Credentials stay in memory. */
export function connectGatewayVisitors(onState:(value:Record<string,unknown>)=>void,slug='') {
 let stopped=false,epoch=0,source:EventSource|null=null,session:Session|null=null,endpoint='',connected=false;
 let retry:ReturnType<typeof setTimeout>|undefined,attempt=0,nextRenew=0,busy=false,lastSent=0,lastReaction=0;
 let own:Record<string,unknown>={room:'live',nickname:'개발 검수자',x:0,y:28,yaw:Math.PI,moving:false};
 const appearances=new Map<string,Record<string,unknown>>();
 const publishOffline=()=>{connected=false;appearances.clear();onState({connected:false,count:0,people:[]});};
 async function json(url:string,body:unknown,sameOrigin=false){
  const response=await fetch(url,{method:'POST',credentials:sameOrigin?'same-origin':'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Object.assign(Error('gateway request failed'),{status:response.status});
  return response.json();
 }
 const status=(error:unknown)=>(error as {status?:number}).status;
 async function ticket(){return json('/api/campus/realtime-admission',{slug},true);}
 function appearance(){return {nickname:own.nickname,coat:own.coat,skinColor:own.skin,hairColor:own.hair,pantsColor:own.pants,gender:own.gender,model:own.model,heldItem:own.heldItem};}
 function leave(){const previous=session;session=null;if(previous&&endpoint)void json(endpoint,{...previous,kind:'leave'}).catch(()=>{});}
 function pause(){epoch++;source?.close();source=null;clearTimeout(retry);leave();publishOffline();}
 function fail(error:unknown){
  source?.close();source=null;publishOffline();
  if(stopped||document.hidden)return;
  if([401,403,404].includes(status(error)||0)){stopped=true;leave();return;}
  if(attempt>=5){leave();return;}
  const delay=Math.min(15000,500*2**attempt++)+Math.random()*300;
  clearTimeout(retry);retry=setTimeout(()=>void connect(),delay);
 }
 async function connect(){
  if(stopped||document.hidden)return;const generation=++epoch;
  try {
   const admission=await ticket();if(stopped||generation!==epoch)return;
   const url=new URL(admission.endpoint);
   if(url.protocol!=='https:'&&!(location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname)&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Object.assign(Error('endpoint'),{status:403});
   if(endpoint&&endpoint!==url.href)leave();endpoint=url.href;
   if(session){try{await json(endpoint,{...session,kind:'renew',joinToken:admission.joinToken});}catch(error){if(status(error)!==401)throw error;session=null;}}
   if(stopped||generation!==epoch)return;
   if(!session){const joined=await json(endpoint,{kind:'join',joinToken:admission.joinToken,room:own.room,appearance:appearance()});
    if(stopped||generation!==epoch){void json(endpoint,{...joined,kind:'leave'}).catch(()=>{});return;}session={id:joined.id,ticket:joined.ticket};}
   nextRenew=Date.now()+60000;
   source?.close();const stream=new EventSource(endpoint+'?'+new URLSearchParams(session));source=stream;
   stream.onmessage=event=>{if(stopped||generation!==epoch)return;try{
    const packet=JSON.parse(event.data);if(!Array.isArray(packet.peers)||packet.self!==session?.id)return;
    connected=true;attempt=0;
    const ids=new Set(packet.peers.map((p:Peer)=>p.id));for(const id of appearances.keys())if(!ids.has(id))appearances.delete(id);
    const people=packet.peers.slice(0,24).map((p:Peer)=>{
     if(p.appearance)appearances.set(p.id,p.appearance);const a=appearances.get(p.id)||{};
     const person=sanitizeDevVisitor({...a,id:p.id,room:packet.room,x:p.x,y:p.y,yaw:p.yaw,moving:p.moving,hair:a.hairColor,skin:a.skinColor,pants:a.pantsColor});
     const reaction=REACTIONS.find(r=>r.text===p.message);
     return person?{...person,...reaction&&typeof p.messageAt==='number'&&Date.now()-p.messageAt<REACTION_TTL?{reaction:{code:reaction.id,room:packet.room,expiresAt:p.messageAt+REACTION_TTL,acceptedAt:p.messageAt}}:{}}:null;
    }).filter(Boolean);
    onState({connected:true,count:packet.totalCount,people:packet.room===own.room?people:[]});
   }catch{/* Ignore malformed stream packets without exposing credentials. */}};
   stream.onerror=()=>{if(generation===epoch)fail(Error('stream disconnected'));};
  }catch(error){if(generation===epoch)fail(error);}
 }
 const timer=setInterval(()=>{if(stopped||!connected||busy||document.hidden)return;busy=true;const generation=epoch;
  void (async()=>{
   if(Date.now()>=nextRenew){const admission=await ticket();if(generation!==epoch)return;if(admission.endpoint!==endpoint)throw Object.assign(Error('endpoint changed'),{status:403});await json(endpoint,{...session,kind:'renew',joinToken:admission.joinToken});nextRenew=Date.now()+60000;}
   if(generation!==epoch||!session)return;
   await json(endpoint,{...session,kind:'update',...own,appearance:appearance()});lastSent=Date.now();
  })().catch(error=>{if(generation===epoch){if(status(error)===401){session=null;fail(Error('lease expired'));}else fail(error);}}).finally(()=>{busy=false;});
 },1000);
 function visibility(){if(document.hidden)pause();else{attempt=0;void connect();}}
 document.addEventListener('visibilitychange',visibility);void connect();
 return {
  move(value:unknown){const p=sanitizeDevVisitor({...value as object,id:'00000000-0000-4000-8000-000000000001'});if(p){const {id:_,...position}=p;void _;own=position;}},
  react(code:unknown){if(stopped||!connected||!session||document.hidden||Date.now()-lastReaction<REACTION_COOLDOWN||!reactionText(code)||Date.now()-lastSent>10000)return false;lastReaction=Date.now();void json(endpoint,{...session,kind:'update',message:reactionText(code)}).catch(()=>{});return true;},
  close(){stopped=true;pause();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);}
 };
}
