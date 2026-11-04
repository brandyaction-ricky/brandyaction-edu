import {createClient} from '@supabase/supabase-js';

export function sanitizeDevVisitor(value:unknown){
  const p=value as Record<string,unknown>;if(!p||typeof p.id!=='string'||!/^[\da-f-]{36}$/i.test(p.id)||!['x','y','yaw'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k] as number)<100))return null;
  const color=(k:string,fallback:string)=>typeof p[k]==='string'&&/^#[\da-f]{6}$/i.test(p[k] as string)?p[k]:fallback;
  return {nickname:typeof p.nickname==='string'?p.nickname.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,24)||'문샷 방문자':'문샷 방문자',room:p.room==='library'?'library':'live',id:p.id,x:p.x,y:p.y,yaw:p.yaw,moving:p.moving===true,coat:color('coat','#386eb4'),skin:color('skin','#e8b68b'),hair:color('hair','#302825'),pants:color('pants','#36485d'),gender:p.gender==='female'?'female':'male',model:Number.isInteger(p.model)&&Number(p.model)>=0&&Number(p.model)<=5?p.model:0,heldItem:['coffee','book'].includes(String(p.heldItem))?p.heldItem:'none'};
 }

/** DEV-only, public visual presence. No auth cookies, student records, chat or DB writes. */
export function connectDevVisitors(onState:(value:Record<string,unknown>)=>void,eventSlug='dev-office-review'){
 if(!/^[a-z0-9][a-z0-9-]{2,59}$/.test(eventSlug))throw Error('행사 주소를 확인해 주세요.');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url!=='https://vjmjhaidlqkmascdjocw.supabase.co'||!key)throw Error('DEV 연결 설정을 확인해 주세요.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},realtime:{params:{eventsPerSecond:2}}});
 const id=crypto.randomUUID(),positions=new Map<string,Record<string,unknown>>();let closed=false,connected=false,last='',lastAt=0;
 let own:Record<string,unknown>={id,room:'live',nickname:'문샷 방문자',x:0,y:28,yaw:Math.PI,coat:'#386eb4',skin:'#e8b68b',hair:'#302825',moving:false};
 const channel=db.channel('campus-dev-open-review-v1:'+eventSlug,{config:{presence:{key:id},broadcast:{self:false,ack:false}}});

 function publish(){if(closed)return;const members=new Set(Object.keys(channel.presenceState()));for(const key of positions.keys())if(!members.has(key))positions.delete(key);onState({connected,count:members.size,people:[...positions.values()].filter(p=>p.id!==id&&p.room===own.room).slice(0,80)});}
 channel.on('presence',{event:'sync'},()=>{for(const [key,values]of Object.entries(channel.presenceState())){if(positions.has(key)||positions.size>=80)continue;const p=sanitizeDevVisitor(values[0]);if(p&&p.id===key)positions.set(key,p);}last='';publish();})
 .on('broadcast',{event:'move'},({payload})=>{const p=sanitizeDevVisitor(payload);if(!p||p.id===id||!Object.hasOwn(channel.presenceState(),p.id)||positions.size>=80&&!positions.has(p.id))return;positions.set(p.id,p);publish();})
 .subscribe(async status=>{if(closed)return;connected=status==='SUBSCRIBED';if(connected)await channel.track(own);publish();});
 const timer=setInterval(()=>{if(closed||!connected||document.hidden)return;const signature=JSON.stringify(own);if(signature===last&&Date.now()-lastAt<10000)return;last=signature;lastAt=Date.now();void channel.send({type:'broadcast',event:'move',payload:own}).catch(()=>{});},1000);
 return {move(value:unknown){const p=sanitizeDevVisitor({...value as object,id});if(p){const changed=p.room!==own.room;own=p;if(changed)publish();}},close(){closed=true;clearInterval(timer);positions.clear();void db.removeChannel(channel);void db.realtime.disconnect();}};
}
