import { createRemoteMotion } from './motion-interpolation.js';
import { getCampusRoom, pointInPolygon, getCampusCollisionRects, studyPoint, getStudySeats } from './campus-plan.js';

export const STUDY_ACTIVITY_TARGETS=Object.freeze(Object.fromEntries(Object.entries({
  focus:{x:7.4,y:10.15},mission:{x:9,y:6.5},feedback:{x:12.4,y:10.3},
  lounge:{x:9,y:15.8},launch:{x:13.4,y:11},
}).map(([key,point])=>[key,Object.freeze(studyPoint(point))])));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=Number.isFinite;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Study controls share the existing avatar, renderer, collision graph and scene. */
export function attachStudyScene({office,root,onInteract=()=>{},scope=globalThis,clock=()=>Date.now()}={}){
  if(!office||!root)throw new Error('공부방 화면을 찾지 못했습니다.');
  const listeners=[],gl=office.gl,controls=office.controls,originalCamera=office.camera;
  const originalDraw=office.draw,originalRender=gl?.render,originalDestroy=office.destroy,originalStand=office.standCampusAvatar;
  const originalCompanions=office.studyCompanions,originalSample=office.sampleStudyCompanion;
  const remoteMotion=createRemoteMotion({clock:()=>scope.performance?.now?.()??clock()});
  office.sampleStudyCompanion=companion=>{
    const motion=remoteMotion.sample(companion.id);if(!motion)return companion;
    const area=getCampusRoom('study',office.plan.campus);
    if(area&&!pointInPolygon(motion,area.outline))return{...motion,x:companion.x,y:companion.y,moving:false,pose:motion.pose==='walk'?'stand':motion.pose};
    return motion;
  };
  office.studyCompanions=[];
  let room=office.getCampusVisibleRoom?.()||office.visibleCampusRoom?.()||'office',mode='overall',destroyed=false,viewCamera=null,controlState=null;
  let lastAvatar=null,drag=null,draggedUntil=0,waveUntil=0,standingPoint=null;
  const cameraModes=gl&&controls&&typeof office.makeStudyCamera==='function'?['overall','third']:['overall'];
  const isStudy=()=>room==='study';
  const listen=(target,type,fn,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener?.(type,fn,options));};
  const draw=()=>{if(!destroyed&&office.visible!==false)office.draw?.();};
  const coordinate=value=>value&&finite(value.x)&&finite(value.y)?{x:value.x,y:value.y}:null;
  const walkable=p=>{
    const area=getCampusRoom('study',office.plan.campus);if(!area||!pointInPolygon(p,area.outline))return false;
    return !getCampusCollisionRects('study',office.plan.campus).some(r=>p.x>r.minX-.24&&p.x<r.maxX+.24&&p.y>r.minY-.24&&p.y<r.maxY+.24);
  };
  function setPose(pose){
    if(!['stand','sit','wave'].includes(pose)||destroyed)return false;
    const avatar=office.campusAvatar;if(!avatar||(!isStudy()&&pose!=='stand'))return false;
    if(pose==='sit'){
      if(avatar.studyPose!=='sit')standingPoint=coordinate(avatar);
      const seats=getStudySeats().filter(seat=>!office.studyCompanions.some(person=>distance(person,seat)<.55));if(!seats.length)return false;
      seats.sort((a,b)=>distance(a,avatar)-distance(b,avatar));
      office.setCampusRoom?.('study',{focus:false});avatar.x=seats[0].x;avatar.y=seats[0].y;avatar.yaw=Math.PI;avatar.moving=false;avatar.jumpHeight=0;avatar.vy=0;
    }else if(avatar.studyPose==='sit'&&isStudy()&&standingPoint&&walkable(standingPoint)){
      avatar.x=standingPoint.x;avatar.y=standingPoint.y;standingPoint=null;
    }
    avatar.studyPose=pose;waveUntil=pose==='wave'?clock()+2200:0;draw();return true;
  }
  office.standCampusAvatar=()=>setPose('stand');
  function getCompanions(){return office.studyCompanions.map(person=>({...person}));}
  function setParticipants(people){
    if(destroyed)return;
    const area=getCampusRoom('study',office.plan.campus),seen=new Set();
    office.studyCompanions=(Array.isArray(people)?people:[]).filter(person=>{
      if(!person||typeof person.id!=='string'||seen.has(person.id)||!finite(person.x)||!finite(person.y))return false;
      if(!area||!pointInPolygon(person,area.outline))return false;
      seen.add(person.id);return true;
    }).map(person=>{remoteMotion.push(person.id,person);return{...person,label:String(person.name||'방문자').slice(0,24),sample:false};});
    remoteMotion.retain(seen);
    // The 3D renderer reconciles membership; discard only departed 2D cached actors.
    for(const id of office.studyCompanionPeople?.keys?.()||[])if(!seen.has(id))office.studyCompanionPeople.delete(id);draw();
  }
  function greetCompanion(id){return isStudy()&&office.studyCompanions.some(person=>person.id===id)?setPose('wave'):false;}
  function sitNearCompanion(id){
    const person=office.studyCompanions.find(person=>person.id===id);if(!isStudy()||!person)return false;
    const seats=getStudySeats().filter(seat=>!office.studyCompanions.some(other=>distance(other,seat)<.55));
    seats.sort((a,b)=>distance(a,person)-distance(b,person));if(!seats.length||!setPose('sit'))return false;
    const avatar=office.campusAvatar;avatar.x=seats[0].x;avatar.y=seats[0].y;draw();return true;
  }
  function restoreControls(){
    if(!controls||!controlState)return;
    controls.object=controlState.object;
    for(const key of['enabled','enablePan','enableRotate','enableZoom','minDistance','maxDistance','minPolarAngle','maxPolarAngle'])if(controlState[key]!==undefined)controls[key]=controlState[key];
    controls.target.set?.(controlState.target.x,controlState.target.y,controlState.target.z);
    controlState=null;
  }
  function setCameraMode(next){
    if(destroyed||!cameraModes.includes(next)||(next!=='overall'&&!isStudy()))return false;
    if(next===mode)return true;
    if(next==='overall'){
      mode=next;office.camera=originalCamera;restoreControls();delete root.dataset.studyCamera;
      if(office.campusAvatarMesh)office.campusAvatarMesh.obj.visible=true;
      office.resetCampusView?.();lastAvatar=null;drag=null;draw();return true;
    }
    const avatar=office.campusAvatar;if(!avatar)return false;
    if(!controlState){
      controlState={object:controls.object,target:{x:controls.target.x,y:controls.target.y,z:controls.target.z}};
      for(const key of['enabled','enablePan','enableRotate','enableZoom','minDistance','maxDistance','minPolarAngle','maxPolarAngle'])controlState[key]=controls[key];
    }
    viewCamera ||= office.makeStudyCamera();office.camera=viewCamera;controls.object=viewCamera;mode=next;root.dataset.studyCamera=next;
    controls.enablePan=false;controls.enableRotate=next==='third';controls.enableZoom=next==='third';controls.enabled=next==='third';controls.minDistance=2.4;controls.maxDistance=7;controls.minPolarAngle=.25;controls.maxPolarAngle=1.48;
    const bodyY=avatar.studyPose==='sit'?.7:1;
    controls.target.set?.(avatar.x,bodyY,avatar.y);
    if(next==='third'){viewCamera.position.set(avatar.x+3,2.5,avatar.y+3);viewCamera.lookAt(controls.target);}else viewCamera.position.set(avatar.x,bodyY,avatar.y);
    lastAvatar={x:avatar.x,y:avatar.y};viewCamera.updateProjectionMatrix?.();draw();return true;
  }
  function syncPose(){
    const avatar=office.campusAvatar;if(!avatar)return;
    if(avatar.studyPose==='wave'&&clock()>=waveUntil)avatar.studyPose='stand';
    if(avatar.moving&&avatar.studyPose!=='sit')avatar.studyPose='stand';
  }
  function syncCamera(){
    if(!isStudy()||mode==='overall'||!viewCamera)return;
    const avatar=office.campusAvatar;if(!avatar)return;
    viewCamera.aspect=Math.max(1,office.cw)/Math.max(1,office.ch);viewCamera.updateProjectionMatrix?.();
    const height=(avatar.studyPose==='sit'?.74:1.07)+Math.max(0,avatar.jumpHeight||0);
    if(lastAvatar){viewCamera.position.x+=avatar.x-lastAvatar.x;viewCamera.position.z+=avatar.y-lastAvatar.y;}
    controls.target.set?.(avatar.x,height*.7,avatar.y);viewCamera.lookAt(controls.target);if(office.campusAvatarMesh)office.campusAvatarMesh.obj.visible=true;
    lastAvatar={x:avatar.x,y:avatar.y};viewCamera.updateMatrixWorld?.(true);
  }
  function setRoom(next){
    if(destroyed)return;room=next;
    if(!isStudy()){
      remoteMotion.clear();office.studyCompanions=[];office.studyCompanionPeople?.clear?.();
      setCameraMode('overall');standingPoint=null;waveUntil=0;if(office.campusAvatar)office.campusAvatar.studyPose='stand';
    }
  }
  function interact(){
    if(destroyed||!isStudy()||root.inert||scope.document?.hidden||office.campusInputState?.paused)return false;
    const avatar=office.campusAvatar;if(!avatar)return false;
    const nearest=Object.entries(STUDY_ACTIVITY_TARGETS).sort((a,b)=>distance(a[1],avatar)-distance(b[1],avatar))[0];
    if(!nearest||distance(nearest[1],avatar)>2.7)return false;onInteract(nearest[0]);return true;
  }
  function floorAt(mx,my){
    if(gl)return office.campusFloorAt?.(mx,my)||null;
    const cam=office.cam;if(!cam||!finite(cam.zoom)||cam.zoom<=0)return null;
    const zero=office.iso(0,0,0),a=office.iso(1,0,0),b=office.iso(0,1,0),u=(mx-cam.ox)/cam.zoom-zero.x,v=(my-cam.oy)/cam.zoom-zero.y;
    const ax=a.x-zero.x,ay=a.y-zero.y,bx=b.x-zero.x,by=b.y-zero.y,det=ax*by-bx*ay;if(Math.abs(det)<1e-9)return null;
    return{x:(u*by-v*bx)/det,y:(ax*v-ay*u)/det};
  }
  const wrappedDraw=function(...args){syncPose();return originalDraw.apply(this,args);};office.draw=wrappedDraw;
  const wrappedRender=originalRender?function(...args){syncCamera();return originalRender.apply(this,args);}:null;if(wrappedRender)gl.render=wrappedRender;
  listen(root,'campus-room-change',event=>setRoom(event.detail?.roomId));
  listen(root,'campus-interact',interact);
  listen(root,'pointerdown',event=>{if(!isStudy()||event.button!==0||root.inert)return;drag={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};});
  listen(root,'pointermove',event=>{if(!drag||!isStudy())return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>5)draggedUntil=clock()+250;});
  listen(scope,'pointerup',()=>{drag=null;});listen(scope,'blur',()=>{drag=null;});
  listen(scope,'pointercancel',()=>{drag=null;});
  listen(scope.document,'visibilitychange',()=>{if(scope.document.hidden)drag=null;});
  listen(root,'click',event=>{
    if(!isStudy()||destroyed||root.inert||scope.document?.hidden||clock()<draggedUntil||office.campusInputState?.paused)return;
    if(event.target?.closest?.('button,a,input,textarea,select,[contenteditable]'))return;
    const bounds=office.canvas?.getBoundingClientRect?.();if(!bounds?.width||!bounds.height)return;
    const mx=(event.clientX-bounds.left)*office.cw/bounds.width,my=(event.clientY-bounds.top)*office.ch/bounds.height;
    const hits=[office.campusAvatarHit,...(office.campusRoomHits||[])].filter(Boolean);if(hits.some(hit=>mx>=hit.x0&&mx<=hit.x1&&my>=hit.y0&&my<=hit.y1))return;
    const p=floorAt(mx,my);if(p&&walkable(p))office.walkCampusTo?.(p);
  });
  function cleanup(){
    if(destroyed)return;setCameraMode('overall');destroyed=true;for(const remove of listeners)remove();
    if(office.draw===wrappedDraw)office.draw=originalDraw;if(wrappedRender&&gl.render===wrappedRender)gl.render=originalRender;
    if(office.standCampusAvatar!==originalStand){if(originalStand===undefined)delete office.standCampusAvatar;else office.standCampusAvatar=originalStand;}
    if(office.campusAvatar)office.campusAvatar.studyPose='stand';delete root.dataset.studyCamera;
    remoteMotion.clear();
    if(originalSample===undefined)delete office.sampleStudyCompanion;else office.sampleStudyCompanion=originalSample;
    office.disposeStudyCompanions?.();office.studyCompanionPeople?.clear?.();
    if(originalCompanions===undefined)delete office.studyCompanions;else office.studyCompanions=originalCompanions;
    if(office.destroy===wrappedDestroy)office.destroy=originalDestroy;
  }
  const wrappedDestroy=function(...args){cleanup();return originalDestroy.apply(this,args);};office.destroy=wrappedDestroy;
  return{setRoom,setCameraMode,setPose,interact,getCompanions,setParticipants,greetCompanion,sitNearCompanion,destroy:cleanup,getCapabilities:()=>({cameraModes:[...cameraModes],cameraMode:mode})};
}
