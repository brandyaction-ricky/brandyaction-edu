/** Host adapter: keep the original character/scene assets unchanged. Install before study-scene. */
export function attachCameraControls({office,root,onChange}) {
 let scene,mode='overall',room=office.getCampusRoom();
 const rawRender=office.gl.render,rawLabel=office.drawCampusAvatarLabel;
 office.gl.render=function(...args){
  if(mode==='first'&&office.getCampusRoom()==='study'){
   const a=office.campusAvatar,c=office.camera,mesh=office.campusAvatarMesh;
   if(a&&c?.isPerspectiveCamera){
    const yaw=mesh?.yaw||0,height=(a.studyPose==='sit'?.74:1.07)+(a.jumpHeight||0);
    c.position.set(a.x,height,a.y);c.lookAt(a.x+Math.sin(yaw)*5,height,a.y+Math.cos(yaw)*5);c.updateMatrixWorld(true);
    if(mesh){mesh.obj.visible=false;if(mesh.prop)mesh.prop.visible=false;}
   }
  }
  return rawRender.apply(this,args);
 };
 office.drawCampusAvatarLabel=function(...args){if(mode!=='first')return rawLabel?.apply(this,args);};
 function set(next){
  if(!scene)return false;
  if(next!=='overall'&&office.getCampusRoom()!=='study')return false;
  // Reset even when requested mode is unchanged, restoring a panned/zoomed map.
  mode='overall';scene.setCameraMode('overall');office.resetCampusView?.();
  if(next==='overall'){
   // A distinct overview, rather than the same default framing.
   if(office.camera?.isOrthographicCamera){office.camera.zoom=.82;office.camera.updateProjectionMatrix();}
  }else{
   if(!scene.setCameraMode('third'))return false;
   mode=next;
   if(next==='first')office.controls.enabled=false;
  }
  root.dataset.cameraMode=mode;root.dataset.studyCamera=mode;
  onChange(mode);office.draw();return true;
 }
 root.addEventListener('campus-room-change',event=>{if(event.detail.roomId===room)return;room=event.detail.roomId;mode='overall';root.dataset.cameraMode=mode;onChange(mode);});
 return {connect(value){scene=value;root.dataset.cameraMode=mode;},set,get mode(){return mode;}};
}
