import {attachCrowdRenderer} from './crowd-renderer.mjs';
/** Curated educational examples, never attributed to real visitors. No chat transport. */
export function attachVisitorExperience({office,root,send,wake,getRoom,CampusInstancedMesh,CampusSphereGeometry,devPresence=false,qaCrowd=false}){
 const crowd=devPresence?attachCrowdRenderer(office,root,CampusInstancedMesh,CampusSphereGeometry):null;
 const panel=document.createElement('section');panel.className='visitor-stories';panel.setAttribute('aria-label','문샷 체험 안내');panel.hidden=true;
 const count=document.createElement('p');count.className='visitor-count';count.textContent=devPresence?'DEV 동료 연결 중…':'문샷에서 나눌 이야기';
 const hint=document.createElement('p');hint.className='visitor-story-hint';hint.textContent='수업 속 대화 예시 · 자유 채팅은 사용하지 않아요.';
 const button=document.createElement('button');button.type='button';button.className='visitor-story-open';
 const topics=[{id:'study',x:-7,y:24,line:'“내가 만든 광고, 동료 의견을 받을 수 있나요?”'},{id:'office',x:8,y:23,line:'“AI가 만든 결과를 한곳에서 확인하고 싶어요.”'},{id:'welcome',x:0,y:29,line:'“AI를 처음 써도 시작할 수 있나요?”'}];
 let active=false,last=0,people=[],status=null,simulation=null,closed=false;
 if(qaCrowd)void import('./qa-crowd-layout.mjs').then(m=>{if(!closed)simulation={people:m.crowdLayout(),motion:m.crowdMotion};});
 button.onclick=()=>{if(status)send('visitor-story',{id:status.id});};panel.append(count,hint,button);document.body.append(panel);
 function tick(now){if(!active)return;crowd?.tick(now);if(now-last<500)return;last=now;const a=office.campusAvatar;if(!a)return;
  if(simulation&&getRoom()==='live')crowd.set([...people,...simulation.people.map((p,i)=>({...simulation.motion(p,i,Date.now()/1000),id:'qa-example-'+i,nickname:'검수 동료 '+(i+1),gender:i%2?'female':'male',model:i%6,coat:['#386eb4','#ad7258','#537f69','#8173aa'][i%4],skin:'#e8b68b',hair:'#302825'}))]);
  const topic=[...topics].sort((p,q)=>Math.hypot(p.x-a.x,p.y-a.y)-Math.hypot(q.x-a.x,q.y-a.y))[0];status=topic;
  button.replaceChildren();const quote=document.createElement('span'),action=document.createElement('strong');quote.textContent=topic.line;action.textContent='체험 대화에 합류하기 →';button.append(quote,action);
  if(devPresence)send('dev-visitor-move',{room:getRoom(),nickname:office.campusIdentity?.displayId,x:a.x,y:a.y,yaw:a.yaw,moving:a.moving,coat:office.campusIdentity?.coat,skin:office.campusIdentity?.skinColor,hair:office.campusIdentity?.hairColor,pants:office.campusIdentity?.pantsColor,gender:office.campusIdentity?.gender,model:office.campusIdentity?.model,heldItem:office.campusIdentity?.heldItem});
 }
 return {join(){active=true;panel.hidden=false;wake();},tick,moving:()=>crowd?.moving()||false,receive(data){if(!devPresence)return;people=Array.isArray(data.people)?data.people.slice(0,80):[];if(!qaCrowd||getRoom()!=='live')crowd.set(people);root.dataset.devPeerCount=String(people.length);count.textContent=data.connected?`실제 접속 ${Number(data.count)||1}명${qaCrowd?' / 가상 검수 60명':''}`:'동료 연결 대기 · 혼자 둘러볼 수 있어요';wake();},labels:()=>crowd?.labels(),roomChanged(){crowd?.clear();panel.hidden=getRoom()!=='live';last=0;tick(performance.now());},roleChanged(){},destroy(){closed=true;crowd?.destroy();panel.remove();}};
}
