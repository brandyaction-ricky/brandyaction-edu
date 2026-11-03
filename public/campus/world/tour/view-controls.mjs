/** Camera/input adapter for all four rooms; original vendor models remain untouched. */
export function attachTourView({office,root,fitMap,wake,onChange,isBlocked}){
 const mapCamera=office.camera,perspective=office.makeStudyCamera(),controls=office.controls;
 let mode='overall',last=null,yaw=Math.PI,pitch=0,drag=null,dragged=false,downCount=0;
 const pointers=new Set();
 const originalRender=office.gl.render,originalLabel=office.drawCampusAvatarLabel;
 function configure(){
  controls.object=office.camera;controls.enabled=mode!=='first'&&!isBlocked();controls.enablePan=mode==='overall';controls.enableRotate=mode!=='first';controls.enableZoom=mode!=='first';controls.enableDamping=true;controls.dampingFactor=.12;controls.zoomToCursor=mode==='overall';controls.minZoom=.55;controls.maxZoom=3;controls.minDistance=2;controls.maxDistance=12;controls.minPolarAngle=.2;controls.maxPolarAngle=1.48;
 }
 function resetFollow(){const a=office.campusAvatar;if(!a)return;last={x:a.x,y:a.y};yaw=Number.isFinite(a.yaw)?a.yaw:Math.PI;pitch=0;perspective.fov=58;perspective.position.set(a.x-Math.sin(yaw)*5,3,a.y-Math.cos(yaw)*5);controls.target.set(a.x,.85,a.y);perspective.lookAt(controls.target);}
 function sync(){
  const a=office.campusAvatar;if(!a)return;
  if(mode!=='overall'){
   perspective.aspect=Math.max(1,office.cw)/Math.max(1,office.ch);perspective.updateProjectionMatrix();
   const h=(a.studyPose==='sit'?.74:1.07)+(a.jumpHeight||0);
   if(mode==='third'){
    if(last){perspective.position.x+=a.x-last.x;perspective.position.z+=a.y-last.y;}
    controls.target.set(a.x,h*.8,a.y);perspective.lookAt(controls.target);
   }else{perspective.position.set(a.x,h,a.y);perspective.lookAt(a.x+Math.sin(yaw)*Math.cos(pitch)*5,h+Math.sin(pitch)*5,a.y+Math.cos(yaw)*Math.cos(pitch)*5);}
   last={x:a.x,y:a.y};perspective.updateMatrixWorld(true);
  }
  if(office.campusAvatarMesh){office.campusAvatarMesh.obj.visible=mode!=='first';if(mode==='first'&&office.campusAvatarMesh.prop)office.campusAvatarMesh.prop.visible=false;}
  root.dataset.cameraMode=mode;root.dataset.cameraZoom=String(mode==='overall'?mapCamera.zoom:perspective.fov);root.dataset.cameraPosition=[office.camera.position.x,office.camera.position.y,office.camera.position.z].map(n=>n.toFixed(3)).join(',');
 }
 office.gl.render=function(...args){sync();return originalRender.apply(this,args);};
 office.drawCampusAvatarLabel=function(...args){if(mode!=='first')return originalLabel?.apply(this,args);};
 function set(next){if(!['overall','first','third'].includes(next))return;mode=next;office.camera=next==='overall'?mapCamera:perspective;configure();if(next==='overall')fitMap();else resetFollow();controls.update();wake();office.draw();onChange(mode);}
 function roomChanged(){office.camera=mapCamera;fitMap();if(mode!=='overall'){office.camera=perspective;resetFollow();}configure();wake();office.draw();onChange(mode);}
 function resize(){if(mode==='overall')fitMap();else{perspective.aspect=Math.max(1,office.cw)/Math.max(1,office.ch);perspective.updateProjectionMatrix();}wake();}
 const listen=(name,fn,options)=>{root.addEventListener(name,fn,options);return()=>root.removeEventListener(name,fn,options);};
 const remove=[
  listen('pointerdown',e=>{if(isBlocked()||e.target.closest('button'))return;pointers.add(e.pointerId);downCount=pointers.size;if(downCount>1)dragged=true;else dragged=false;drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};wake();},true),
  listen('pointermove',e=>{if(!drag||isBlocked()||!pointers.has(e.pointerId))return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)dragged=true;if(mode==='first'&&dragged){yaw-=(e.clientX-drag.lastX)*.006;pitch=Math.max(-1.1,Math.min(1.1,pitch-(e.clientY-drag.lastY)*.006));}drag.lastX=e.clientX;drag.lastY=e.clientY;wake();},true),
  listen('pointerup',e=>{pointers.delete(e.pointerId);if(!pointers.size)drag=null;wake();},true),
  listen('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;dragged=true;},true),
  listen('wheel',e=>{if(isBlocked())return;if(mode==='first'){e.preventDefault();perspective.fov=Math.max(35,Math.min(75,perspective.fov+e.deltaY*.025));perspective.updateProjectionMatrix();}wake();},{passive:false}),
 ];
 // Wake on user input, not derived camera changes: follow-camera updates must not keep GPU awake.
 controls.addEventListener('start',wake);
 configure();
 return {set,roomChanged,resize,refresh(){configure();wake();},isClick(){return !dragged&&downCount===1;},moveVector(x,y){if(mode==='overall')return{x,y};const angle=mode==='first'?yaw:Math.atan2(controls.target.x-perspective.position.x,controls.target.z-perspective.position.z);return{x:Math.sin(angle)*-y+Math.cos(angle)*x,y:Math.cos(angle)*-y-Math.sin(angle)*x};},get mode(){return mode;},destroy(){for(const off of remove)off();controls.removeEventListener('start',wake);office.gl.render=originalRender;office.drawCampusAvatarLabel=originalLabel;}};
}
