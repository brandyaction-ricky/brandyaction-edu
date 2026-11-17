import {atriumHeightAt} from '../../public/campus/world/tour/atrium-layout.mjs';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
/** Framework-independent, bounded room service. authenticateJoin MUST use server-trusted claims. */
export function createCampusHub({authenticateJoin,maxSessions=1600,roomSize=25,tickMs=500,ttlMs=35000,disconnectGraceMs=15000,allowedOrigins=[],path='/api/campus/realtime',now=Date.now}={}){
 if(typeof authenticateJoin!=='function')throw Error('Server-side join authorization required');
 if(!Number.isInteger(maxSessions)||maxSessions<1||maxSessions>10000||!Number.isInteger(roomSize)||roomSize<2||roomSize>25)throw Error('Invalid capacity');
 const sessions=new Map(),partitions=new Map(),dirty=new Set(),rooms=new Set(['live','welcome','study','office']);let serial=0,stopped=false,admissions=0,lastCountPush=0,crowdAt=-Infinity,crowdVersion=0;let crowdIndex=[],qaCount=0;const crowdByPartition=new Map();const usedNonces=new Map();
 const metrics={joined:0,rejected:0,updates:0,packets:0,bytes:0,slowClients:0,rateLimited:0};
 const allowed=(role,room)=>room==='live'||['student','admin'].includes(role)||role==='waiting'&&room==='welcome';
 const color=(v,f)=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v:f;
 const profile=v=>({nickname:typeof v?.nickname==='string'?v.nickname.trim().slice(0,24)||'문샷 동료':'문샷 동료',gender:v?.gender==='female'?'female':'male',model:Number.isInteger(v?.model)&&v.model>=0&&v.model<=5?v.model:0,coat:color(v?.coat,'#386eb4'),hairColor:color(v?.hairColor,'#302825'),skinColor:color(v?.skinColor,'#e8b68b'),pantsColor:color(v?.pantsColor,'#36485d'),heldItem:['coffee','book'].includes(v?.heldItem)?v.heldItem:'none'});
 function assign(p,room,target,solo=false){p.known?.clear();p.message='';p.messageAt=0;p.crowdVersion=-1;crowdAt=-Infinity;
  if(p.partition){const old=partitions.get(p.partition);old?.members.delete(p.id);dirty.add(p.partition);if(!old?.members.size)partitions.delete(p.partition);}
  let part=target||(!solo&&room!=='office'?[...partitions.values()].find(v=>v.room===room&&v.members.size<Math.min(20,roomSize)):null);
  if(!part){part={id:String(++serial),room,members:new Set()};partitions.set(part.id,part);}part.members.add(p.id);p.room=room;p.partition=part.id;dirty.add(part.id);
 }
 function remove(p){if(sessions.get(p.id)!==p)return;sessions.delete(p.id);crowdAt=-Infinity;const part=partitions.get(p.partition);part?.members.delete(p.id);dirty.add(p.partition);if(!part?.members.size)partitions.delete(p.partition);const s=p.stream;p.stream=null;s?.end();}
 const connected=p=>!!p.stream&&!p.stream.destroyed;
 const peer=(p,viewer)=>{const fresh=viewer.known.get(p.id)!==p.appearanceVersion;viewer.known.set(p.id,p.appearanceVersion);return{id:p.id,x:p.x,y:p.y,yaw:p.yaw,moving:p.moving,sitting:p.sitting,...fresh?{appearance:p.appearance}:{},...p.message&&now()-p.messageAt<20000?{message:p.message,messageAt:p.messageAt}:{}};};
 function refreshCrowd(){
  if(now()-crowdAt<2000)return;crowdAt=now();crowdVersion++;crowdByPartition.clear();
  const active=[...sessions.values()].filter(connected);qaCount=active.filter(p=>p.synthetic).length;
  crowdIndex=active.filter(p=>p.room==='live').map(p=>({id:p.id,partition:p.partition,x:Math.round(p.x*4)/4,y:Math.round(p.y*4)/4,yaw:Math.round(p.yaw*10)/10,coat:p.appearance.coat,skin:p.appearance.skinColor,hair:p.appearance.hairColor,gender:p.appearance.gender,model:p.appearance.model,pants:p.appearance.pantsColor,heldItem:p.appearance.heldItem}));
 }
 function publicCrowd(p){
  refreshCrowd();if(p.room!=='live'||p.crowdVersion===crowdVersion)return {};
  p.crowdVersion=crowdVersion;
  if(!crowdByPartition.has(p.partition)){
   const eligible=crowdIndex.filter(v=>v.partition!==p.partition),limit=80;
   // Stable bounded sample: every visible figure corresponds to one connected session.
   const selected=eligible.length<=limit?eligible:Array.from({length:limit},(_,i)=>eligible[Math.floor(i*eligible.length/limit)]);
   crowdByPartition.set(p.partition,selected);
  }
  return {crowd:crowdByPartition.get(p.partition),crowdAt:now()};
 }
 function snapshot(p,total){refreshCrowd();const part=partitions.get(p.partition),members=[...(part?.members||[])].map(id=>sessions.get(id)).filter(v=>v&&connected(v));for(const id of p.known.keys())if(!members.some(member=>member.id===id))p.known.delete(id);return {self:p.id,room:p.room,partition:p.partition,totalCount:total,syntheticCount:qaCount,...publicCrowd(p),roomCount:members.length,sentAt:now(),peers:p.room==='office'?[]:members.filter(v=>v.id!==p.id).map(v=>peer(v,p))};}
 function push(p,total){if(!connected(p))return;if(p.stream.writableLength>64000){metrics.slowClients++;p.stream.destroy();return;}const data='data: '+JSON.stringify(snapshot(p,total))+'\n\n';metrics.packets++;metrics.bytes+=Buffer.byteLength(data);p.stream.write(data);}
 function flush(){if(stopped)return;const time=now();for(const [nonce,expires]of usedNonces)if(time>=expires)usedNonces.delete(nonce);for(const p of sessions.values())if(time-p.bornAt>15*60*1000||time-p.at>ttlMs||p.disconnectedAt&&time-p.disconnectedAt>disconnectGraceMs)remove(p);
  const total=[...sessions.values()].filter(connected).length,countDue=time-lastCountPush>=2000;if(countDue)lastCountPush=time;
  for(const part of partitions.values())if(countDue||dirty.has(part.id))for(const id of part.members){const p=sessions.get(id);if(p)push(p,total);}dirty.clear();
 }
 const timer=setInterval(flush,tickMs);timer.unref();
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(status===503?{'Retry-After':'5'}:{})});res.end(JSON.stringify(data));}
 function credential(data){const p=sessions.get(data.id);return p&&typeof data.ticket==='string'&&/^[a-f0-9]{48}$/.test(data.ticket)&&timingSafeEqual(Buffer.from(p.ticket),Buffer.from(data.ticket))?p:null;}
 async function handle(req,res,url){
  if(url.pathname!==path)return false;
  const origin=req.headers.origin,sameOrigin=origin==='http://'+req.headers.host||origin==='https://'+req.headers.host;
  if(req.headers['sec-fetch-site']==='cross-site'&&!allowedOrigins.includes(origin)||origin&&!sameOrigin&&!allowedOrigins.includes(origin)){json(res,403,{error:'origin'});return true;}
  if(origin&&allowedOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}).end();return true;}
  if(req.method==='GET'){
   const p=credential(Object.fromEntries(url.searchParams));if(!p){json(res,401,{error:'join required'});return true;}
   const old=p.stream;p.known.clear();p.crowdVersion=-1;crowdAt=-Infinity;p.stream=res;p.at=now();p.disconnectedAt=0;old?.end();
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});push(p,[...sessions.values()].filter(connected).length);dirty.add(p.partition);
   res.on('close',()=>{if(p.stream===res){p.stream=null;p.disconnectedAt=now();crowdAt=-Infinity;dirty.add(p.partition);}});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'method'});return true;}
  let raw='';try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096){json(res,413,{error:'too large'});return true;}}}catch{return true;}
  let data;try{data=JSON.parse(raw);}catch{json(res,400,{error:'json'});return true;}
  if(!data||typeof data!=='object'||Array.isArray(data)){json(res,400,{error:'object required'});return true;}
  if(data.kind==='join'){
   // Reserve before awaiting authorization to prevent concurrent joins overshooting capacity.
   if(stopped||sessions.size+admissions>=maxSessions){metrics.rejected++;json(res,503,{error:'혼잡해 동료 연결을 잠시 기다리고 있어요. 공간은 계속 둘러볼 수 있어요.',retryAfterMs:5000});return true;}
   admissions++;let claims;try{claims=await authenticateJoin(req,data);}catch{}finally{admissions--;}
   const role=claims?.role,room=rooms.has(data.room)?data.room:'live';if(!claims||!['guest','waiting','student','admin'].includes(role)||!allowed(role,room)){json(res,403,{error:'access denied'});return true;}
   if(stopped||sessions.size>=maxSessions){metrics.rejected++;json(res,503,{error:'capacity',retryAfterMs:5000});return true;}
   if(claims.nonce){if(usedNonces.has(claims.nonce)){json(res,409,{error:'ticket already used'});return true;}usedNonces.set(claims.nonce,claims.exp*1000);}
   const p={id:randomUUID(),ticket:randomBytes(24).toString('hex'),room,role,synthetic:claims.synthetic===true,lastGroup:-Infinity,crowdVersion:-1,x:0,y:28,yaw:Math.PI,moving:false,sitting:false,appearance:profile(data.appearance),appearanceVersion:0,known:new Map(),bornAt:now(),at:now(),lastMove:0,lastChat:0,stream:null,disconnectedAt:0,message:'',messageAt:0,bucket:10,bucketAt:now()};
   sessions.set(p.id,p);assign(p,room);metrics.joined++;json(res,200,{id:p.id,ticket:p.ticket,partition:p.partition});return true;
  }
  const p=credential(data);if(!p){json(res,401,{error:'session expired'});return true;}
  if(data.kind==='leave'){remove(p);json(res,200,{ok:true});return true;}
  const time=now();p.bucket=Math.min(10,p.bucket+(time-p.bucketAt)*.004);p.bucketAt=time;if(p.bucket<1){metrics.rateLimited++;json(res,429,{error:'slow down',retryAfterMs:1000});return true;}p.bucket--;
  if(data.kind==='resume'){p.at=time;json(res,200,{ok:true});return true;}
  if(data.kind==='leaveGroup'){if(p.room!=='live'){json(res,403,{error:'access denied'});return true;}assign(p,'live',null,true);p.at=time;json(res,200,{ok:true,partition:p.partition});return true;}
  if(data.kind==='joinGroup'){
   const group=partitions.get(data.partition);
   if(p.room!=='live'||group?.room!=='live'){json(res,403,{error:'이 공간에서는 합류할 수 없어요.'});return true;}
   if(group.id===p.partition){json(res,200,{ok:true,partition:p.partition});return true;}
   if(group.members.size>=roomSize){json(res,409,{error:'그룹이 가득 찼어요. 다른 동료에게 다가가 주세요.'});return true;}
   if(time-p.lastGroup<3000){json(res,429,{error:'잠시 뒤 다시 합류해 주세요.'});return true;}
   const near=[...group.members].some(id=>{const other=sessions.get(id);return other&&connected(other)&&Math.hypot(other.x-p.x,other.y-p.y,atriumHeightAt(other.x,other.y)-atriumHeightAt(p.x,p.y))<=4;});
   if(!near){json(res,409,{error:'동료에게 조금 더 가까이 가 주세요.'});return true;}
   assign(p,'live',group);p.lastGroup=time;p.at=time;json(res,200,{ok:true,partition:p.partition});return true;
  }
  if(data.kind!=='update'){json(res,400,{error:'kind'});return true;}
  if(data.room!==undefined&&(!rooms.has(data.room)||!allowed(p.role,data.room))){json(res,403,{error:'access denied'});return true;}
  let changed=false;if(data.room&&data.room!==p.room){assign(p,data.room);changed=true;}
  if(data.appearance){const next=profile(data.appearance);if(JSON.stringify(next)!==JSON.stringify(p.appearance)){p.appearance=next;p.appearanceVersion++;changed=true;}}p.at=time;
  if(Number.isFinite(data.x)&&Number.isFinite(data.y)&&Math.abs(data.x)<=50&&Math.abs(data.y)<=50&&time-p.lastMove>=400){const yaw=Number.isFinite(data.yaw)?data.yaw:Math.PI;changed ||= p.x!==data.x||p.y!==data.y||p.yaw!==yaw||p.moving!==(data.moving===true)||p.sitting!==(data.sitting===true);Object.assign(p,{x:data.x,y:data.y,yaw,moving:data.moving===true,sitting:data.sitting===true,lastMove:time});}
  if(typeof data.message==='string'&&data.message.trim()&&data.message.length<=120&&time-p.lastChat>=1500&&p.room!=='office'){p.message=data.message.trim();p.messageAt=time;p.lastChat=time;changed=true;}
  if(changed){dirty.add(p.partition);metrics.updates++;}json(res,200,{ok:true,partition:p.partition});return true;
 }
 return {handle,flush,stats:()=>({...metrics,sessions:sessions.size,connected:[...sessions.values()].filter(connected).length,partitions:partitions.size,maxRoomOccupancy:Math.max(0,...[...partitions.values()].map(p=>p.members.size))}),close(){stopped=true;clearInterval(timer);for(const p of [...sessions.values()])remove(p);}};
}
