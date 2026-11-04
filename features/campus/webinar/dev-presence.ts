import {createClient} from '@supabase/supabase-js';
import {reactionText,REACTION_TTL,REACTION_COOLDOWN} from '../../../public/campus/world/tour/reactions.mjs';

export function sanitizeDevVisitor(value:unknown){
  const p=value as Record<string,unknown>;if(!p||typeof p.id!=='string'||!/^[\da-f-]{36}$/i.test(p.id)||!['x','y','yaw'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k] as number)<100))return null;
  const color=(k:string,fallback:string)=>typeof p[k]==='string'&&/^#[\da-f]{6}$/i.test(p[k] as string)?p[k]:fallback;
  return {nickname:typeof p.nickname==='string'?p.nickname.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||'문샷 방문자':'문샷 방문자',room:p.room==='library'?'library':'live',id:p.id,x:p.x,y:p.y,yaw:p.yaw,moving:p.moving===true,coat:color('coat','#386eb4'),skin:color('skin','#e8b68b'),hair:color('hair','#302825'),pants:color('pants','#36485d'),gender:p.gender==='female'?'female':'male',model:Number.isInteger(p.model)&&Number(p.model)>=0&&Number(p.model)<=5?p.model:0,heldItem:['coffee','book'].includes(String(p.heldItem))?p.heldItem:'none'};
 }

/** DEV-only, public visual presence. No auth cookies, student records, free text or DB writes. Presets expire in memory. */
export function connectDevVisitors(onState:(value:Record<string,unknown>)=>void,eventSlug='dev-office-review'){
 if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(eventSlug))throw Error('행사 주소를 확인해 주세요.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url!=='https://vjmjhaidlqkmascdjocw.supabase.co'||!key)throw Error('DEV 연결 설정을 확인해 주세요.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:2}}});
 const id=crypto.randomUUID(),positions=new Map<string,Record<string,unknown>>();let closed=false,connected=false,last='',lastAt=0;
 const reactions=new Map<string,{code:string;expiresAt:number;acceptedAt:number;room:unknown}>();let lastReactionAt=0;
 const pendingReactions=new Map<string,{code:string;room:unknown;receivedAt:number}>();
 let own:Record<string,unknown>={id,room:'live',nickname:'문샷 방문자',x:0,y:28,yaw:Math.PI,coat:'#386eb4',skin:'#e8b68b',hair:'#302825',moving:false};
 const channel=db.channel('campus-dev-open-review-v1:'+eventSlug,{config:{presence:{key:id},broadcast:{self:false,ack:false}}});

 function publish(){if(closed)return;const members=new Set(Object.keys(channel.presenceState()));for(const [key,r]of pendingReactions){if(Date.now()-r.receivedAt>2500||r.room!==own.room){pendingReactions.delete(key);continue;}if(members.has(key)&&positions.get(key)?.room===r.room){reactions.set(key,{code:r.code,room:r.room,acceptedAt:r.receivedAt,expiresAt:r.receivedAt+REACTION_TTL});pendingReactions.delete(key);}}for(const key of positions.keys())if(!members.has(key))positions.delete(key);for(const [key,r]of reactions)if(!members.has(key)||r.expiresAt<=Date.now())reactions.delete(key);onState({connected,count:members.size,people:[...positions.values()].filter(p=>p.id!==id&&p.room===own.room).slice(0,80).map(p=>({...p,reaction:reactions.get(String(p.id))?.room===p.room?reactions.get(String(p.id)):undefined}))});}
 channel.on('presence',{event:'sync'},()=>{for(const [key,values]of Object.entries(channel.presenceState())){if(positions.has(key)||positions.size>=80)continue;const p=sanitizeDevVisitor(values[0]);if(p&&p.id===key)positions.set(key,p);}last='';publish();})
 .on('broadcast',{event:'move'},({payload})=>{const p=sanitizeDevVisitor(payload);if(!p||p.id===id||!Object.hasOwn(channel.presenceState(),p.id)||positions.size>=80&&!positions.has(p.id))return;positions.set(p.id,p);publish();})
 .on('broadcast',{event:'reaction'},({payload})=>{const p=payload as Record<string,unknown>;if(closed||!p||typeof p.id!=='string'||!/^[\da-f-]{36}$/i.test(p.id)||p.id===id||!reactionText(p.code)||p.room!==own.room)return;const now=Date.now(),previous=reactions.get(p.id),pending=pendingReactions.get(p.id);if(previous&&now-previous.acceptedAt<REACTION_COOLDOWN||pending&&now-pending.receivedAt<REACTION_COOLDOWN)return;if(!positions.has(p.id)||!Object.hasOwn(channel.presenceState(),p.id)){if(pendingReactions.size<80)pendingReactions.set(p.id,{code:String(p.code),room:p.room,receivedAt:now});return;}if(positions.get(p.id)?.room!==p.room)return;reactions.set(p.id,{code:String(p.code),expiresAt:now+REACTION_TTL,acceptedAt:now,room:p.room});publish();})
 .subscribe(async status=>{if(closed)return;connected=status==='SUBSCRIBED';if(connected)await channel.track(own);publish();});
 const timer=setInterval(()=>{if(closed||!connected||document.hidden)return;const signature=JSON.stringify(own);if(signature===last&&Date.now()-lastAt<10000)return;last=signature;lastAt=Date.now();void channel.send({type:'broadcast',event:'move',payload:own}).catch(()=>{});},1000);
 return {react(code:unknown){const now=Date.now();if(closed||!connected||document.hidden||!reactionText(code)||now-lastReactionAt<REACTION_COOLDOWN)return false;lastReactionAt=now;void channel.send({type:'broadcast',event:'reaction',payload:{id,room:own.room,code}}).catch(()=>{});return true;},move(value:unknown){const p=sanitizeDevVisitor({...value as object,id});if(p){const changed=p.room!==own.room;own=p;if(changed){pendingReactions.clear();reactions.clear();publish();}}},close(){closed=true;clearInterval(timer);positions.clear();pendingReactions.clear();reactions.clear();void db.removeChannel(channel);void db.realtime.disconnect();}};
}
