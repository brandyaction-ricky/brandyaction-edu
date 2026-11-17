import test from 'node:test';
import assert from 'node:assert/strict';
import {attachCameraControls} from '../public/campus/world/office/camera-controls.mjs';
function setup(){
 const listeners=new Map(),root={dataset:{},addEventListener:(name,fn)=>listeners.set(name,fn)};
 let room='study',renders=0,labels=0;
 const position={set(x,y,z){Object.assign(this,{x,y,z});}},camera={position,isPerspectiveCamera:true,lookAt(...point){this.target=point;},updateMatrixWorld(){},updateProjectionMatrix(){}};
 const mesh={yaw:Math.PI/2,obj:{visible:true},prop:{visible:true}};
 const office={camera,controls:{enabled:true},campusAvatar:{x:4,y:8},campusAvatarMesh:mesh,getCampusRoom:()=>room,resetCampusView(){},gl:{render(){renders++;}},draw(){this.gl.render();},drawCampusAvatarLabel(){labels++;}};
 const changed=[],adapter=attachCameraControls({office,root,onChange:mode=>changed.push(mode)});
 adapter.connect({setCameraMode(mode){office.controls.enabled=true;mesh.obj.visible=true;mesh.prop.visible=true;return mode==='overall'||mode==='third';}});
 return {office,root,adapter,mesh,changed,counts:()=>({renders,labels}),room(value){room=value;listeners.get('campus-room-change')({detail:{roomId:value}});}};
}
test('first person renders from eye height, hides own avatar and returns to third person',()=>{
 const s=setup();assert.equal(s.adapter.set('first'),true);assert.equal(s.root.dataset.cameraMode,'first');assert.equal(s.office.controls.enabled,false);assert.equal(s.mesh.obj.visible,false);assert.equal(s.mesh.prop.visible,false);assert.deepEqual(s.office.camera.target,[9,1.07,8]);s.office.drawCampusAvatarLabel();assert.equal(s.counts().labels,0);
 s.office.campusAvatar.studyPose='sit';s.office.draw();assert.equal(s.office.camera.position.y,.74);
 s.adapter.set('third');assert.equal(s.mesh.obj.visible,true);assert.equal(s.office.controls.enabled,true);s.office.drawCampusAvatarLabel();assert.equal(s.counts().labels,1);
});
test('movement updates do not reset the selected view; changing rooms does not teleport back',()=>{
 const s=setup();s.adapter.set('third');s.room('study');assert.equal(s.adapter.mode,'third');s.room('office');assert.equal(s.adapter.mode,'overall');assert.equal(s.adapter.set('first'),false);assert.equal(s.office.getCampusRoom(),'office');assert.equal(s.adapter.set('overall'),true);
});
