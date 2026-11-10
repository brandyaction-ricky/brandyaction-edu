import {watchStudyRoster} from './roster-channel';
import {avatarAppearance, createMotionQueue, makeLimiter, position, publicPeer, initialMetrics, isNearby, nearText, type NearbyMessage, type SpaceChat, type SpacePeer, type SpaceProfile, type SpaceSeat, type SpaceState } from './domain';
import type { SpaceCommand } from './server';
export type SpaceTransport = { command:(command:Partial<SpaceCommand>&{kind:string})=>Promise<SpaceState>; move:(value:unknown)=>void; setFocusDeadline?:(end:number|null)=>void; setChatVisible?:(visible:boolean)=>void; close:()=>void };
export async function createLiveTransport(cohortId:string,userId:string,sessionId:string,onState:(s:SpaceState)=>void,onError:(message:string)=>void,overrides?:{client?:ReturnType<typeof import('@/lib/supabase/client').createClient>;request?:typeof fetch}):Promise<SpaceTransport>{
 const db=overrides?.client??(await import('@/lib/supabase/client')).createClient(),request=overrides?.request??fetch,channels=new Map<string,ReturnType<typeof db.channel>>(),receivers=new Map<string,ReturnType<typeof makeLimiter>>();
 let closed=false,lastState:SpaceState|null=null,sequence=0,localStatus='quiet';const metrics=initialMetrics(),nearby:NearbyMessage[]=[],canNear=makeLimiter(3000);
 let roster:ReturnType<typeof watchStudyRoster>|undefined;
 let chatVisible=false;
 const closeRoster=()=>{roster?.close();roster=undefined;};
 // Focus transitions travel on the same authorized actor topic as movement. The heartbeat
 // persists the timer and supplies the fallback when a client misses a broadcast.
 let ownFocus:number|null=null;
 let focusChanged=false;
 let persistedFocus:number|null=null;
 const focusSignals=new Map<string,{sessionId:string;seq:number;end:number|null;received:number}>();
 function broadcastFocus(){
  const channel=channels.get(userId);
  if(closed||lastState?.controls?.paused||channel?.state!=='joined'||!focusChanged)return;
  void channel.send({type:'broadcast',event:'focus',payload:{sessionId,seq:sequence++,end:ownFocus}}).catch(()=>{});
 }
 const publish=()=>{
  if(!lastState||closed)return;
  const now=Date.now();
  const peers=lastState.peers.map(peer=>{
   const signal=focusSignals.get(peer.userId);
   if(!signal||signal.sessionId!==peer.sessionId||now-signal.received>30000)return peer;
   return {...peer,focusUntil:signal.end===null?null:new Date(signal.end).toISOString()};
  });
  onState({...lastState,peers,nearby:nearby.filter(m=>now-m.at<12000).slice(-30),metrics:{...metrics}});
 };
 const disconnect=()=>{for(const ch of channels.values())void db.removeChannel(ch);channels.clear();receivers.clear();};const lastSequence=new Map<string,number>();
 async function sync(state:SpaceState){
  if(closed||(lastState&&state.serverNow<lastState.serverNow))return;
  state.peers=state.peers.map(p=>{const previous=lastState?.peers.find(v=>v.userId===p.userId);if(previous&&previous.sessionId!==p.sessionId)lastSequence.delete(p.userId);const old=previous?.sessionId===p.sessionId?previous:null;return old?{...p,x:old.x,y:old.y,sitting:old.sitting}:p;});lastState=state;if(state.controls?.paused){closeRoster();focusSignals.clear();state.peers=[];state.seats=[];nearby.length=0;disconnect();metrics.status='closed';publish();return;}publish();
  const ids=new Set(state.peers.map(p=>p.userId));
  for(const [id,ch] of channels)if(!ids.has(id)){void db.removeChannel(ch);channels.delete(id);focusSignals.delete(id);receivers.delete(id);lastSequence.delete(id);}
  for(const peer of state.peers){
   if(channels.has(peer.userId))continue;
   const limiter=makeLimiter(400),nearLimiter=makeLimiter(1000);receivers.set(peer.userId,limiter);
   const channel=db.channel(`campus-space:${cohortId}:${peer.userId}`,{config:{private:true,broadcast:{self:false,ack:false}}});
   channel.on('broadcast',{event:'move'},({payload})=>{
    const p=lastState?.peers.find(v=>v.userId===peer.userId); // Actor comes from authorized topic, NEVER payload.userId.
    if(closed||!p||p.sessionId!==payload?.sessionId||!Number.isSafeInteger(payload?.seq)||payload.seq<0||!limiter())return;
    const v=position(payload);if(!v||payload.seq<=(lastSequence.get(peer.userId)??-1))return;
    lastSequence.set(peer.userId,payload.seq);Object.assign(p,v);metrics.received++;publish();
   }).on('broadcast',{event:'focus'},({payload})=>{
    const sender=lastState?.peers.find(p=>p.userId===peer.userId),now=Date.now();
    if(closed||!sender||sender.userId===userId||Date.parse(sender.expiresAt)<=now||sender.sessionId!==payload?.sessionId)return;
    const {seq,end}=payload;
    if(!Number.isSafeInteger(seq)||seq<0||(end!==null&&(!Number.isSafeInteger(end)||end<=0||end>now+3001000)))return;
    const previous=focusSignals.get(sender.userId);
    if(previous?.sessionId===sender.sessionId&&seq<=previous.seq)return;
    focusSignals.set(sender.userId,{sessionId:sender.sessionId,seq,end,received:now});publish();
   }).on('broadcast',{event:'nearby'},({payload})=>{const sender=lastState?.peers.find(p=>p.userId===peer.userId),mine=lastState?.peers.find(p=>p.userId===userId),text=nearText(payload?.text);if(closed||!sender||!mine||localStatus==='quiet'||sender.sessionId!==payload?.sessionId||typeof payload?.id!=='string'||!text||!isNearby(sender,mine)||!nearLimiter())return;if(nearby.some(m=>m.id===payload.id))return;nearby.push({id:payload.id,userId:sender.userId,nickname:sender.nickname,text,kind:payload.kind==='emote'?'emote':'text',at:Date.now()});if(nearby.length>30)nearby.shift();metrics.received++;publish();}).subscribe(status=>{if(closed)return;if(status==='SUBSCRIBED'){if(peer.userId===userId)broadcastFocus();if(metrics.status==='reconnecting')metrics.reconnects++;metrics.status='connected';publish();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){metrics.errors++;metrics.status='reconnecting';publish();onError('실시간 연결을 다시 확인하고 있어요. 연결 상태에서 재입장할 수 있습니다.');}});
   channels.set(peer.userId,channel);
  }
 }
 async function refreshRoster(signal:AbortSignal){
  const response=await request('/api/campus/space?cohortId='+encodeURIComponent(cohortId),{credentials:'same-origin',cache:'no-store',signal});
  if(signal.aborted||closed||!lastState)return;
  if(response.status===401||response.status===403){
   lastState={...lastState,peers:[],messages:[],seats:[]};nearby.length=0;disconnect();closeRoster();publish();return;
  }
  if(response.ok){
   const latest:SpaceState=await response.json();
   if(!signal.aborted)await sync(latest);
  }
 }
 async function command(cmd:Partial<SpaceCommand>&{kind:string}){
  if(closed)throw new Error('공간 연결이 끝났어요. 다시 입장해 주세요.');
  if(cmd.kind==='nearby'||cmd.kind==='emote'){const text=nearText(cmd.text),mine=lastState?.peers.find(p=>p.userId===userId),ch=channels.get(userId);if(!text||!mine||lastState?.controls?.paused||localStatus==='quiet'||!canNear()||ch?.state!=='joined')throw new Error('가까운 대화는 함께 참여 중일 때 잠깐 간격을 두고 보낼 수 있어요.');const kind=cmd.kind==='emote'?'emote':'text',id=crypto.randomUUID();metrics.sent++;const outcome=await ch.send({type:'broadcast',event:'nearby',payload:{id,text,kind,sessionId}});if(outcome!=='ok'){metrics.errors++;publish();throw Error('한마디를 보내지 못했어요. 연결을 확인해 주세요.');}nearby.push({id,userId,nickname:mine.nickname,text,kind,at:Date.now()});if(nearby.length>30)nearby.shift();publish();return lastState!;}
  const body={...cmd,cohortId,sessionId};const started=performance.now();metrics.apiCalls++;
  let response:Response;try{response=await request('/api/campus/space',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store'});}catch(e){metrics.errors++;metrics.status='reconnecting';publish();throw e;}metrics.lastRttMs=Math.round(performance.now()-started);
  const data=await response.json();if(!response.ok){metrics.errors++;if([401,403].includes(response.status)){nearby.length=0;disconnect();closeRoster();metrics.status='closed';if(lastState){lastState={...lastState,peers:[],messages:[],seats:[]};publish();}closed=true;motion.close();clearInterval(renew);}else publish();throw new Error(data.error||'공간을 연결하지 못했습니다.');}if(cmd.profile)localStatus=cmd.profile.status;await sync(data);
  if(cmd.kind==='leave')closeRoster();
  else if(!closed&&!roster&&!data.controls?.paused&&(cmd.kind==='join'||cmd.kind==='heartbeat')){
   roster=watchStudyRoster(db,cohortId,refreshRoster,()=>chatVisible);
  }
  if(cmd.kind==='heartbeat'){
   const end=cmd.focusUntil?Date.parse(cmd.focusUntil):null;
   // Repeat once after persistence in case a peer subscribed during the transition.
   if(end!==persistedFocus&&end===ownFocus)broadcastFocus();
   persistedFocus=end;
  }
  if(cmd.kind==='heartbeat'){const own=lastState?.peers.find(p=>p.userId===userId);if(own)motion.push({x:own.x,y:own.y,sitting:own.sitting});}return data as SpaceState;
 }
 // Renew authorization periodically; disconnect if membership/profile check fails in API heartbeat.
 const motion=createMotionQueue(v=>{const own=lastState?.peers.find(p=>p.userId===userId);if(own)Object.assign(own,v);const ch=channels.get(userId);if(!closed&&!lastState?.controls?.paused&&ch&&ch.state==='joined'){metrics.sent++;void ch.send({type:'broadcast',event:'move',payload:{...v,sessionId,seq:sequence++}}).then(outcome=>{if(outcome!=='ok'){metrics.errors++;publish();}}).catch(()=>{metrics.errors++;publish();});publish();}});
 const renew=setInterval(()=>{if(closed)return;disconnect();lastSequence.clear();metrics.status='reconnecting';if(lastState)void sync(lastState);},60000);
 return {command,setFocusDeadline(end){
  if(end===ownFocus)return;
  ownFocus=end;focusChanged=true;broadcastFocus();
 },setChatVisible(visible){
  if(chatVisible===visible)return;
  chatVisible=visible;
  if(visible)roster?.refresh();
 },move(value){if(!closed)motion.push(value);},close(){closed=true;closeRoster();metrics.status='closed';motion.close();clearInterval(renew);disconnect();}};
}

export function createDemoTransport(cohortId:string,userId:string,sessionId:string,initial:SpaceProfile,onState:(s:SpaceState)=>void):SpaceTransport{
 const channel=new BroadcastChannel(`moonshot-space-demo:${cohortId}`),peerId=sessionId,peers=new Map<string,SpacePeer>(),messages:SpaceChat[]=[];
 const storeKey=`moonshot-space-demo-seats:${cohortId}`,canChat=makeLimiter(3000);
 let current=initial,closed=false,joined=false,seats:SpaceSeat[]=[];const metrics=initialMetrics(),nearby:NearbyMessage[]=[],canNear=makeLimiter(3000);metrics.status='connected';
 function readSeats(){try{const raw=JSON.parse(localStorage.getItem(storeKey)||'[]');return Array.isArray(raw)?raw.filter(s=>s&&['desk-1','desk-2','desk-3'].includes(s.id)&&typeof s.expiresAt==='string'&&Date.parse(s.expiresAt)>Date.now()).slice(0,3):[];}catch{return [];}}
 function state():SpaceState{const now=Date.now();for(const [id,p]of peers)if(Date.parse(p.expiresAt)<=now)peers.delete(id);seats=readSeats();return {profile:current,peers:[...peers.values()].slice(0,24),messages:messages.slice(-60),seats,serverNow:new Date(now).toISOString(),nearby:nearby.filter(m=>now-m.at<12000).slice(-30),metrics:{...metrics}};}
 function publish(){const s=state();if(!closed)onState(s);return s;}
 function announce(){const mine=peers.get(peerId);if(joined&&mine){mine.expiresAt=new Date(Date.now()+75000).toISOString();channel.postMessage({type:'peer',peer:mine});}}
 channel.onmessage=({data})=>{
  if(closed||!data||typeof data!=='object')return;metrics.received++;
  if(data.type==='hello'){announce();return;}
  if(data.type==='peer'&&data.peer&&typeof data.peer.userId==='string'&&data.peer.userId===data.peer.sessionId&&data.peer.userId!==peerId){const v=position(data.peer);if(!v||peers.size>=24&&!peers.has(data.peer.userId))return;const p=publicPeer(data.peer.userId,data.peer.sessionId,current);p.nickname=String(data.peer.nickname||'체험 동료').slice(0,24)+' · 체험';p.gender=data.peer.gender==='female'?'female':'male';p.coat=/^#[0-9a-f]{6}$/i.test(data.peer.coat)?data.peer.coat:'#527086';p.status=['quiet','joinable','help','working'].includes(data.peer.status)?data.peer.status:'joinable';p.photoOptIn=data.peer.photoOptIn===true;p.accessory=['glasses','headset'].includes(data.peer.accessory)?data.peer.accessory:'none';p.focusUntil=typeof data.peer.focusUntil==='string'?data.peer.focusUntil:null;p.focusMode=[0,3,5,25,50].includes(data.peer.focusMode)?data.peer.focusMode:0;Object.assign(p,avatarAppearance(data.peer),v);peers.set(p.userId,p);}
  if(data.type==='nearby'){const sender=peers.get(data.userId),mine=peers.get(peerId),text=nearText(data.text);if(sender&&mine&&text&&mine.status!=='quiet'&&isNearby(sender,mine)&&typeof data.id==='string'&&!nearby.some(m=>m.id===data.id)){nearby.push({id:data.id,userId:sender.userId,nickname:sender.nickname,text,kind:data.kind==='emote'?'emote':'text',at:Date.now()});if(nearby.length>30)nearby.shift();}}
  if(data.type==='left'&&typeof data.id==='string')peers.delete(data.id);
  if(data.type==='chat'&&data.message&&peers.has(data.message.userId)&&typeof data.message.id==='string'&&typeof data.message.text==='string'&&data.message.text.length<=300&&!messages.some(m=>m.id===data.message.id)){messages.push({...data.message,nickname:peers.get(data.message.userId)!.nickname});if(messages.length>60)messages.shift();}
  if(data.type==='delete'&&typeof data.id==='string'){const i=messages.findIndex(m=>m.id===data.id&&m.userId===data.userId);if(i>=0)messages.splice(i,1);}
  publish();
 };
 async function seatWrite(mutator:(s:SpaceSeat[])=>SpaceSeat[]){
  if(!navigator.locks)throw new Error('이 브라우저에서는 좌석 예약을 지원하지 않아요. 공간 이동은 사용할 수 있습니다.');
  await navigator.locks.request(storeKey,async()=>{const next=mutator(readSeats());localStorage.setItem(storeKey,JSON.stringify(next));seats=next;});channel.postMessage({type:'seats'});
 }
 const motion=createMotionQueue(v=>{const p=peers.get(peerId);if(p&&joined&&!closed){Object.assign(p,v);metrics.sent++;announce();publish();}});
 const transport:SpaceTransport={
  async command(cmd){
   if(closed)throw new Error('공간에서 나왔습니다.');
   if(cmd.profile)current=cmd.profile;
   if(cmd.kind==='nearby'||cmd.kind==='emote'){const text=nearText(cmd.text),mine=peers.get(peerId);if(!text||!joined||mine?.status==='quiet'||!canNear())throw new Error('가까운 대화는 함께 참여 중일 때 잠깐 간격을 두고 보낼 수 있어요.');const message={id:crypto.randomUUID(),userId:peerId,nickname:current.nickname,text,kind:cmd.kind==='emote'?'emote' as const:'text' as const,at:Date.now()};nearby.push(message);if(nearby.length>30)nearby.shift();metrics.sent++;channel.postMessage({...message,type:'nearby'});}
   if(cmd.kind==='join'||cmd.kind==='heartbeat'){
    joined=true;const old=peers.get(peerId);const mine=publicPeer(peerId,sessionId,current);if(old)Object.assign(mine,{x:old.x,y:old.y,sitting:old.sitting});mine.focusUntil=cmd.focusUntil||null;mine.focusMode=cmd.focusMode||0;peers.set(peerId,mine);announce();if(cmd.kind==='join')channel.postMessage({type:'hello'});
    if(seats.some(s=>s.sessionId===sessionId))await seatWrite(s=>s.map(v=>v.sessionId===sessionId?{...v,expiresAt:new Date(Date.now()+75000).toISOString()}:v));
   }
   if(cmd.kind==='profile'){localStorage.setItem(`moonshot-space-demo-profile:${userId}`,JSON.stringify(current));if(peers.has(peerId)){Object.assign(peers.get(peerId)!,{...avatarAppearance(current),nickname:current.nickname,gender:current.gender,coat:current.coat,status:current.status,photoOptIn:current.photoOptIn,accessory:current.accessory});announce();}}
   if(cmd.kind==='seat'){if(!joined)throw new Error('먼저 입장해 주세요.');await seatWrite(s=>{const existing=s.find(v=>v.id===cmd.seatId);if(existing&&existing.sessionId!==sessionId)throw new Error('동료가 먼저 앉은 자리예요.');return [...s.filter(v=>v.sessionId!==sessionId),{id:cmd.seatId!,userId:peerId,sessionId,expiresAt:new Date(Date.now()+75000).toISOString()}];});}
   if(cmd.kind==='stand'||cmd.kind==='leave'){await seatWrite(s=>s.filter(v=>v.sessionId!==sessionId));if(cmd.kind==='leave'){joined=false;peers.delete(peerId);channel.postMessage({type:'left',id:peerId});}}
   if(cmd.kind==='chat'){if(!joined||!canChat()||!cmd.text?.trim()||cmd.text.length>300)throw new Error('잠깐 쉬었다가 메시지를 보내 주세요.');const message={id:cmd.messageId!,userId:peerId,nickname:current.nickname+' · 체험',text:cmd.text.trim(),createdAt:new Date().toISOString()};messages.push(message);if(messages.length>60)messages.shift();channel.postMessage({type:'chat',message});}
   if(cmd.kind==='delete-chat'){const i=messages.findIndex(m=>m.id===cmd.messageId&&m.userId===peerId);if(i>=0){messages.splice(i,1);channel.postMessage({type:'delete',id:cmd.messageId,userId:peerId});}}
   return publish();
  },move(value){if(joined&&!closed)motion.push(value);},close(){if(closed)return;closed=true;motion.close();channel.postMessage({type:'left',id:peerId});channel.close();void navigator.locks?.request(storeKey,async()=>{localStorage.setItem(storeKey,JSON.stringify(readSeats().filter(v=>v.sessionId!==sessionId)));});}
 };
 return transport;
}
