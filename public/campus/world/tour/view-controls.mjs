import {createSceneGesture} from './scene-gesture.mjs';
/** Camera/input adapter for all four rooms; original vendor models remain untouched. */
export function attachTourView({office,root,lunarCampus=false,fitMap,wake,onChange,isBlocked}){
 const mapCamera=office.camera,perspective=office.makeStudyCamera(),controls=office.controls;
 let mode='overall',last=null,yaw=Math.PI,pitch=0,lastTap=false;
 const gesture=createSceneGesture();
 const originalRender=office.gl.render,originalLabel=office.drawCampusAvatarLabel;
 function configure(){
  controls.object=office.camera;controls.enabled=mode!=='first'&&!isBlocked();controls.enablePan=mode==='overall';controls.enableRotate=mode!=='first';controls.enableZoom=mode!=='first';controls.enableDamping=true;controls.dampingFactor=lunarCampus ? .18 : .12;
  if(lunarCampus){controls.rotateSpeed=.76;controls.zoomSpeed=.82;}
  controls.zoomToCursor=mode==='overall';controls.minZoom=.55;controls.maxZoom=3;controls.minDistance=mode==='overall'?8:2;controls.maxDistance=mode==='overall'?200:12;controls.minPolarAngle=.2;controls.maxPolarAngle=1.48;
 }
 function resetFollow(){const a=office.campusAvatar;if(!a)return;last={x:a.x,y:a.y,h:a.jumpHeight||0};yaw=Number.isFinite(a.yaw)?a.yaw:Math.PI;pitch=0;const arrival=root.ownerDocument.body.dataset.room==='live';perspective.fov=arrival?(office.cw<=600?75:70):58;perspective.updateProjectionMatrix();perspective.position.set(a.x-Math.sin(yaw)*5,(arrival?2.65:2.15)+(a.jumpHeight||0),a.y-Math.cos(yaw)*5);controls.target.set(a.x,(arrival?1.45:1.23)+(a.jumpHeight||0),a.y);perspective.lookAt(controls.target);}
 function sync(){
  const a=office.campusAvatar;if(!a)return;
  if(mode!=='overall'){
   const aspect=Math.max(1,office.cw)/Math.max(1,office.ch);if(perspective.aspect!==aspect){perspective.aspect=aspect;perspective.updateProjectionMatrix();}
   const h=(a.studyPose==='sit'?.74:1.07)+(a.jumpHeight||0);
   if(mode==='third'){
    if(last){perspective.position.x+=a.x-last.x;perspective.position.z+=a.y-last.y;perspective.position.y+=(a.jumpHeight||0)-last.h;}
    controls.target.set(a.x,(h-(a.jumpHeight||0))*(root.ownerDocument.body.dataset.room==='live'?1.35:1.15)+(a.jumpHeight||0),a.y);perspective.lookAt(controls.target);
   }else{perspective.position.set(a.x,h,a.y);perspective.lookAt(a.x+Math.sin(yaw)*Math.cos(pitch)*5,h+Math.sin(pitch)*5,a.y+Math.cos(yaw)*Math.cos(pitch)*5);}
   last={x:a.x,y:a.y,h:a.jumpHeight||0};perspective.updateMatrixWorld(true);
  }
  if(office.campusAvatarMesh){office.campusAvatarMesh.obj.visible=mode!=='first';if(mode==='first'&&office.campusAvatarMesh.prop)office.campusAvatarMesh.prop.visible=false;}
  root.dataset.cameraMode=mode;root.dataset.cameraZoom=String(mode==='overall'?mapCamera.zoom:perspective.fov);root.dataset.cameraPosition=[office.camera.position.x,office.camera.position.y,office.camera.position.z].map(n=>n.toFixed(3)).join(',');
 }
 office.gl.render=function(...args){sync();return originalRender.apply(this,args);};
 office.drawCampusAvatarLabel=function(...args){if(mode!=='first')return originalLabel?.apply(this,args);};
 function set(next){if(!['overall','first','third'].includes(next))return;mode=next;office.camera=next==='overall'?mapCamera:perspective;configure();if(next==='overall')fitMap();else resetFollow();controls.update();wake();office.draw();onChange(mode);}
 function roomChanged(){office.camera=mapCamera;fitMap();if(mode!=='overall'){office.camera=perspective;resetFollow();}configure();wake();office.draw();onChange(mode);}
 function resize(){if(mode==='overall')fitMap();else{const aspect=Math.max(1,office.cw)/Math.max(1,office.ch);if(perspective.aspect!==aspect){perspective.aspect=aspect;perspective.updateProjectionMatrix();}}wake();}
 const listen=(name,fn,options)=>{root.addEventListener(name,fn,options);return()=>root.removeEventListener(name,fn,options);};
 const remove=[
  listen('pointerdown',e=>{
   lastTap=false;
   if(isBlocked()||e.target.closest('button'))return;
   gesture.begin(e);
   if(mode==='first')root.setPointerCapture(e.pointerId);
   wake();
  },true),
  listen('pointermove',e=>{
   if(isBlocked())return;
   const motion=gesture.move(e);
   if(!motion)return;
   if(motion.kind==='tap'&&lunarCampus&&e.buttons===1){
    // OrbitControls listens on the document. Leave the camera still during a tap.
    e.stopPropagation();
    return;
   }
   if(motion.kind==='drag'&&mode==='first'){
    const radians=lunarCampus?Math.PI/Math.max(500,Math.min(900,office.ch)):.006;
    yaw-=motion.dx*radians;
    pitch=Math.max(-1.1,Math.min(1.1,pitch-motion.dy*radians));
   }
   wake();
  },true),
  listen('pointerup',e=>{lastTap=gesture.end(e);wake();},true),
  listen('pointercancel',e=>{gesture.cancel(e);lastTap=false;},true),
  listen('lostpointercapture',e=>gesture.cancel(e),true),
  listen('wheel',e=>{if(isBlocked())return;if(mode==='first'){e.preventDefault();perspective.fov=Math.max(35,Math.min(75,perspective.fov+e.deltaY*.025));perspective.updateProjectionMatrix();}wake();},{passive:false}),
 ];
 const resetInput=()=>{gesture.reset();lastTap=false;};
 window.addEventListener('blur',resetInput);
 // Wake on user input, not derived camera changes: follow-camera updates must not keep GPU awake.
 controls.addEventListener('start',wake);
 configure();
 return {set,roomChanged,resize,refresh(){configure();wake();},isClick(){return lastTap;},moveVector(x,y){const camera=office.camera;const angle=mode==='first'?yaw:Math.atan2(controls.target.x-camera.position.x,controls.target.z-camera.position.z);/* Camera right is forward × world-up, for both perspective and map views. */return{x:Math.sin(angle)*-y-Math.cos(angle)*x,y:Math.cos(angle)*-y+Math.sin(angle)*x};},get mode(){return mode;},destroy(){window.removeEventListener('blur',resetInput);for(const off of remove)off();controls.removeEventListener('start',wake);office.gl.render=originalRender;office.drawCampusAvatarLabel=originalLabel;}};
}
