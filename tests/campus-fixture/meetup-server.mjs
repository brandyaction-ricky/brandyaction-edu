import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
// Synthetic LAN QA only. Not imported by the application/server routes, no database or persistent log.
export function createPreviewMeetup(){
 const sessions=new Map();let dirty=false;const rooms=new Set(['live','welcome','study','office']);
 const allowed=(role,room)=>room==='live'||['student','admin'].includes(role)||role==='waiting'&&room==='welcome';
 const color=(v,f)=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v)?v:f;
 const appearance=v=>({nickname:typeof v?.nickname==='string'?v.nickname.trim().slice(0,24)||'문샷 동료':'문샷 동료',gender:v?.gender==='female'?'female':'male',model:Number.isInteger(v?.model)&&v.model>=0&&v.model<=5?v.model:0,coat:color(v?.coat,'#386eb4'),hairColor:color(v?.hairColor,'#302825'),skinColor:color(v?.skinColor,'#e8b68b'),pantsColor:color(v?.pantsColor,'#36485d'),heldItem:['coffee','book'].includes(v?.heldItem)?v.heldItem:'none'});
 const publicPeer=p=>({id:p.id,room:p.room,x:p.x,y:p.y,yaw:p.yaw,moving:p.moving,sitting:p.sitting,appearance:p.appearance,message:p.message,messageAt:p.messageAt});
 function snapshot(p){return {self:p.id,room:p.room,peers:p.room==='office'?[]:[...sessions.values()].filter(v=>v.id!==p.id&&v.room===p.room&&v.stream&&!v.stream.destroyed).map(publicPeer)};}
 const timer=setInterval(()=>{const now=Date.now();for(const [id,p]of sessions)if(now-p.at>25000){p.stream?.end();sessions.delete(id);dirty=true;}if(!dirty)return;dirty=false;for(const p of sessions.values())if(p.stream&&!p.stream.destroyed){if(p.stream.writableLength>64000){p.stream.destroy();continue;}p.stream.write('data: '+JSON.stringify(snapshot(p))+'\n\n');}},500);timer.unref();
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function handle(req,res,url){
  if(url.pathname!=='/api/campus/preview-meetup')return false;
  if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!=='http://'+req.headers.host){json(res,403,{error:'same origin only'});return true;}
  if(req.method==='GET'){
   const p=sessions.get(url.searchParams.get('id')),token=url.searchParams.get('ticket');if(!p||!token||!/^([a-f0-9]{48})$/.test(token)||!timingSafeEqual(Buffer.from(token),Buffer.from(p.ticket))){json(res,401,{error:'join required'});return true;}
   p.stream?.end();p.stream=res;p.at=Date.now();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});res.write('data: '+JSON.stringify(snapshot(p))+'\n\n');dirty=true;res.on('close',()=>{if(p.stream===res){sessions.delete(p.id);dirty=true;}});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'method'});return true;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){json(res,413,{error:'too large'});return true;}}
  let data;try{data=JSON.parse(raw);}catch{json(res,400,{error:'json'});return true;}
  if(!data||typeof data!=='object'||Array.isArray(data)){json(res,400,{error:'object required'});return true;}
  if(data.kind==='join'){
   const role=['student','admin','waiting','guest'].includes(data.role)?data.role:'guest',room=rooms.has(data.room)?data.room:'live';if(!allowed(role,room)){json(res,403,{error:'preview role'});return true;}
   if(sessions.size>=64||[...sessions.values()].filter(p=>p.room===room).length>=24){json(res,409,{error:'이 미리보기 공간은 최대 24명까지 함께할 수 있어요.'});return true;}
   const p={id:randomUUID(),ticket:randomBytes(24).toString('hex'),room,role,x:0,y:28,yaw:Math.PI,moving:false,sitting:false,appearance:appearance(data.appearance),at:Date.now(),lastMove:0,lastChat:0,stream:null,message:'',messageAt:0};sessions.set(p.id,p);json(res,200,{id:p.id,ticket:p.ticket});return true;
  }
  const p=sessions.get(data.id);if(!p||typeof data.ticket!=='string'||!/^([a-f0-9]{48})$/.test(data.ticket)||!timingSafeEqual(Buffer.from(data.ticket),Buffer.from(p.ticket))){json(res,401,{error:'session expired'});return true;}
  if(data.kind==='leave'){sessions.delete(p.id);p.stream?.end();dirty=true;json(res,200,{ok:true});return true;}
  if(data.kind!=='update'){json(res,400,{error:'kind'});return true;}
  if(data.room!==undefined&&(!rooms.has(data.room)||!allowed(p.role,data.room))){json(res,403,{error:'preview role'});return true;}
  if(rooms.has(data.room))p.room=data.room;
  if(data.appearance)p.appearance=appearance(data.appearance);p.at=Date.now();
  if(Number.isFinite(data.x)&&Number.isFinite(data.y)&&Math.abs(data.x)<=50&&Math.abs(data.y)<=50&&Date.now()-p.lastMove>=400){p.x=data.x;p.y=data.y;p.yaw=Number.isFinite(data.yaw)?data.yaw:Math.PI;p.moving=data.moving===true;p.sitting=data.sitting===true;p.lastMove=Date.now();}
  if(typeof data.message==='string'&&data.message.trim()&&data.message.length<=120&&Date.now()-p.lastChat>=1500){p.message=data.message.trim();p.messageAt=Date.now();p.lastChat=p.messageAt;}
  dirty=true;json(res,200,{ok:true});return true;
 }
 return {handle,close(){clearInterval(timer);for(const p of sessions.values())p.stream?.end();sessions.clear();}};
}
