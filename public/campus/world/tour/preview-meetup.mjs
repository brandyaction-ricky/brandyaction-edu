import {attachCrowdRenderer} from './crowd-renderer.mjs';
import {retryDelay,nearbyPeers} from './meetup-policy.mjs';
/** Explicit synthetic-LAN adapter. Production does not enable this or host its endpoint. */
export function attachPreviewMeetup({office,root,getRoom,getRole,wake,CampusInstancedMesh,CampusSphereGeometry}){
 if(!new URLSearchParams(location.search).has('previewMeetup'))return null;
 let session=null,stream=null,joining=false,pendingRole=false,closed=false,last=0,lastSignature='',lastHeartbeat=0,peers=[],lastChat=0;
 let retryTimer=null,retries=0,busy=false,generation=0,roomCount=1,totalCount=1,partition='',allPeers=[];let publicPeople=[],syntheticCount=0,nearGroup=null,groupBusy=false,groupCheck=0;const crowd=attachCrowdRenderer(office,root,CampusInstancedMesh,CampusSphereGeometry);const appearances=new Map(),history=new Map(),motions=new Map();
 const panel=document.createElement('section');panel.className='meetup';panel.setAttribute('aria-label','미리보기 동료');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='meetup-toggle';toggle.textContent='동료 연결 준비';toggle.setAttribute('aria-expanded','false');
 const population=document.createElement('p');population.className='meetup-population';
 const joinButton=document.createElement('button');joinButton.type='button';joinButton.className='meetup-join';joinButton.hidden=true;joinButton.textContent='가까운 그룹과 대화하기';
 const body=document.createElement('div');body.className='meetup-body';body.hidden=true;
 const note=document.createElement('p');note.textContent='접속한 동료끼리 최대 25명씩 공간을 나눠요. 실제 수강생 수가 아닌 미리보기 접속 수입니다.';
 const list=document.createElement('div');list.className='meetup-messages';list.setAttribute('aria-live','polite');
 const form=document.createElement('form'),input=document.createElement('input'),submit=document.createElement('button');input.placeholder='동료에게 한마디';input.setAttribute('aria-label','동료에게 한마디');input.maxLength=120;submit.textContent='보내기';submit.type='button';form.append(input,submit);
 const leaveButton=document.createElement('button');leaveButton.type='button';leaveButton.textContent='대화 나가기';leaveButton.hidden=true;
 const wave=document.createElement('button');wave.type='button';wave.textContent='👋 안녕하세요';body.append(note,list,wave,form,leaveButton);panel.append(population,toggle,joinButton,body);document.body.append(panel);panel.hidden=true;
 const profile=()=>({...office.campusIdentity,nickname:String(office.campusIdentity?.displayId||'문샷 동료').replace(/ · 미리보기$/,'').slice(0,24)});
 function clear(){publicPeople=[];crowd.clear();nearGroup=null;joinButton.hidden=true;peers=[];appearances.clear();motions.clear();history.clear();office.studyCompanions=[];list.replaceChildren();root.dataset.peerCount='0';wake();}
 function display(){population.textContent=syntheticCount?`실제 접속 ${Math.max(0,totalCount-syntheticCount)}명 · 가상 검수 ${syntheticCount}명`:`현재 접속 ${totalCount}명`;population.hidden=!session||getRoom()!=='live';toggle.textContent=session?(getRoom()==='office'?'나만의 사무실 · 비공개':`내 그룹 ${roomCount}명 · 대화`):'동료 다시 연결';leaveButton.hidden=getRoom()!=='live'||roomCount<=1;root.dataset.peerCount=String(peers.length);root.dataset.partition=partition;root.dataset.totalCount=String(totalCount);root.dataset.roomCount=String(roomCount);if(session)note.textContent=`내 대화 그룹 ${roomCount}명 · 다른 그룹의 대화는 합류 후 볼 수 있어요. 인원은 현재 연결 기준입니다.`;}
 async function request(body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch('/api/campus/preview-meetup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});const result=await response.json();if(!response.ok){const e=new Error(result.error||'동료 연결을 확인해 주세요.');e.status=response.status;e.retryAfterMs=result.retryAfterMs;throw e;}return result;}finally{clearTimeout(timeout);}
 }
 function receive(data){if(data.room!==getRoom())return;const now=performance.now();if(data.partition&&partition&&data.partition!==partition){history.clear();appearances.clear();motions.clear();body.hidden=false;}if(Array.isArray(data.crowd))publicPeople=data.crowd.slice(0,80).filter(p=>p&&typeof p.id==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y));if(Number.isSafeInteger(data.syntheticCount))syntheticCount=data.syntheticCount;partition=String(data.partition||partition);roomCount=Number.isSafeInteger(data.roomCount)?Math.max(1,data.roomCount):roomCount;totalCount=Number.isSafeInteger(data.totalCount)?Math.max(1,data.totalCount):totalCount;allPeers=Array.isArray(data.peers)?data.peers.slice(0,24).filter(p=>p&&typeof p.id==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y)):[];for(const p of allPeers){if(p.appearance)appearances.set(p.id,p.appearance);else p.appearance=appearances.get(p.id); }for(const id of appearances.keys())if(!allPeers.some(p=>p.id===id))appearances.delete(id);const self={...office.campusAvatar,id:data.self||session?.id};peers=nearbyPeers(allPeers,self,innerWidth<=600?12:24,peers.map(p=>p.id));
  office.studyCompanions=peers.map(p=>{const old=motions.get(p.id),from=old?sample(old,now):{x:p.x,y:p.y};motions.set(p.id,{from,to:{x:p.x,y:p.y},at:now});if(p.message&&Date.now()-p.messageAt<20000&&!history.has(p.id+':'+p.messageAt)){history.set(p.id+':'+p.messageAt,{name:p.appearance?.nickname||'동료',text:p.message});}return {...p.appearance,id:p.id,label:String(p.appearance?.nickname||'동료').slice(0,24),x:p.x,y:p.y,yaw:p.yaw,pose:p.sitting?'sit':'stand',moving:p.moving};});
  const nearIds=new Set(peers.map(p=>p.id));const distant=[...publicPeople,...allPeers.filter(p=>!nearIds.has(p.id)).map(p=>({...p,coat:p.appearance?.coat,skin:p.appearance?.skinColor,hair:p.appearance?.hairColor}))].filter(p=>p.id!==self.id&&!nearIds.has(p.id));crowd.set(getRoom()==='live'?distant:[]);
  for(const id of motions.keys())if(!peers.some(p=>p.id===id))motions.delete(id);while(history.size>12)history.delete(history.keys().next().value);list.replaceChildren();for(const m of history.values()){const line=document.createElement('p'),name=document.createElement('strong');name.textContent=m.name+' ';line.append(name,document.createTextNode(m.text));list.append(line);}display();wake();
 }
 function sample(m,now){const t=Math.min(1,(now-m.at)/480);return{x:m.from.x+(m.to.x-m.from.x)*t,y:m.from.y+(m.to.y-m.from.y)*t};}
 const priorSample=office.sampleStudyCompanion;office.sampleStudyCompanion=p=>{const m=motions.get(p.id);const pos=m?sample(m,performance.now()):p;return{...p,...pos,jumpHeight:office.campusHeightAt?.(pos.x,pos.y)||0};};
 function reconnect(error){
  if(closed||retryTimer)return;stream?.close();stream=null;clear();
  if(retries>=5){toggle.textContent='연결 재시도 · 혼자 둘러보기 가능';return;}
  const delay=Math.max(error?.retryAfterMs||0,retryDelay(retries++));toggle.textContent='동료 연결 대기 · 둘러보기 가능';
  retryTimer=setTimeout(()=>{retryTimer=null;void join();},delay);
 }
 async function join(){
  if(stream||joining||closed)return;joining=true;panel.hidden=false;toggle.textContent='동료 연결 중…';const epoch=generation;
  try{
   if(session){try{await request({...session,kind:'resume'});}catch(e){if(e.status===401)session=null;else throw e;}}
   if(!session){const value=await request({kind:'join',room:getRoom(),role:getRole(),appearance:profile()});if(closed||epoch!==generation){void request({...value,kind:'leave'}).catch(()=>{});return;}session=value;}
   if(closed||epoch!==generation)return;
   const connection=new EventSource('/api/campus/preview-meetup?id='+encodeURIComponent(session.id)+'&ticket='+encodeURIComponent(session.ticket));stream=connection;
   connection.onmessage=e=>{if(stream!==connection||closed)return;try{const value=JSON.parse(e.data);retries=0;receive(value);}catch(e){console.warn('Campus peer render failed',e);}};
   connection.onerror=()=>{if(stream===connection)reconnect();};lastSignature='';last=0;display();
  }catch(e){reconnect(e);}finally{joining=false;if(pendingRole){pendingRole=false;roleChanged();}}
 }
 function send(message){if(!session||!stream||getRoom()==='office'||Date.now()-lastChat<1500)return;lastChat=Date.now();const own={name:profile().nickname,text:message};history.set('self:'+lastChat,own);void request({...session,kind:'update',room:getRoom(),message}).then(()=>{input.value='';receive({room:getRoom(),peers:allPeers});}).catch(()=>{toggle.textContent='메시지를 보내지 못했어요';});}
 toggle.onclick=()=>{if(!stream){clearTimeout(retryTimer);retryTimer=null;retries=0;void join();return;}body.hidden=!body.hidden;toggle.setAttribute('aria-expanded',String(!body.hidden));};wave.onclick=()=>send('👋 안녕하세요!');const submitMessage=()=>{const text=input.value.trim();if(text)send(text);};submit.onclick=submitMessage;form.onsubmit=e=>{e.preventDefault();submitMessage();};
 const heartbeat=setInterval(()=>tick(performance.now()),1000);
 function tick(now){crowd.tick(now);if(now-groupCheck>250){groupCheck=now;const a=office.campusAvatar;nearGroup=getRoom()==='live'&&a?publicPeople.filter(p=>p.partition!==partition&&Math.hypot(p.x-a.x,p.y-a.y,(office.campusHeightAt?.(p.x,p.y)||0)-(office.campusHeightAt?.(a.x,a.y)||0))<=3.5).sort((p,q)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(q.x-a.x,q.y-a.y)||p.id.localeCompare(q.id))[0]:null;joinButton.hidden=!nearGroup||!stream;joinButton.disabled=groupBusy;}if(!session||!stream||closed||busy||now-last<500)return;last=now;const a=office.campusAvatar;if(!a)return;const payload={room:getRoom(),x:Math.round(a.x*100)/100,y:Math.round(a.y*100)/100,yaw:a.yaw,moving:a.moving,sitting:a.studyPose==='sit',appearance:profile()},signature=JSON.stringify(payload);if(signature===lastSignature&&now-lastHeartbeat<10000)return;lastSignature=signature;lastHeartbeat=now;busy=true;const epoch=generation;void request({...session,kind:'update',...payload}).catch(e=>{if(epoch===generation){if(e.status===401)session=null;reconnect(e);}}).finally(()=>{busy=false;});}
 leaveButton.onclick=async()=>{if(!session||groupBusy)return;groupBusy=true;leaveButton.disabled=true;try{const result=await request({...session,kind:'leaveGroup'});partition=result.partition;clear();body.hidden=true;root.dataset.groupJoined='';}catch(e){note.textContent=e.message;}finally{groupBusy=false;leaveButton.disabled=false;}};
 joinButton.onclick=async()=>{if(!nearGroup||groupBusy||!session)return;groupBusy=true;joinButton.disabled=true;const target=nearGroup.partition;try{await request({...session,kind:'update',room:getRoom(),x:office.campusAvatar.x,y:office.campusAvatar.y});const result=await request({...session,kind:'joinGroup',partition:target});partition=result.partition;clear();body.hidden=false;toggle.setAttribute('aria-expanded','true');note.textContent='그룹에 합류했어요. 인사를 나눠보세요.';root.dataset.groupJoined=target;}catch(e){note.textContent=e.message;body.hidden=false;}finally{groupBusy=false;}};
 function roomChanged(){clear();body.hidden=true;form.hidden=getRoom()==='office';wave.hidden=getRoom()==='office';lastSignature='';last=0;tick(performance.now());display();}
 function roleChanged(){if(joining){pendingRole=true;return;}if(!session)return;generation++;clearTimeout(retryTimer);retryTimer=null;const prior=session;session=null;stream?.close();stream=null;void request({...prior,kind:'leave'}).catch(()=>{});clear();void join();}
 function destroy(){closed=true;generation++;clearTimeout(retryTimer);clearInterval(heartbeat);stream?.close();if(session)void fetch('/api/campus/preview-meetup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session,kind:'leave'}),keepalive:true}).catch(()=>{});office.sampleStudyCompanion=priorSample;crowd.destroy();panel.remove();}
 return {join,tick,roomChanged,roleChanged,destroy,moving:()=>peers.some(p=>p.moving)||crowd.moving()};
}
