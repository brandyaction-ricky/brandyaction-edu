import { configureStudySigns, drawStudyNameplate, makeStudySignLayout } from './study-signs.mjs';
import {attachAmbientMixer} from '../office/vendor/ambient-mixer.js';
import {attachInteriorInteractions} from '../office/vendor/interior-interactions.js';
import {attachEnvironmentControls} from '../office/environment-controls.mjs';
import {libraryPortal} from './library-wayfinding.mjs';
import {paintLibrarySign} from './library-signs.mjs';
import {BotOfficeModel} from '../office/bot-profile.mjs';
import {useDeskPreviewMaterials as applyDeskPreviewMaterials} from './desk-preview-materials.mjs';
import {makeDeskMarkers,positionDeskMarkers} from './office-desk-markers.mjs';
import {toBotOfficeSessions} from '../office/office-view-adapter.mjs';
import {applyRenderProfile} from './render-profile.mjs';
import {attachSceneTouchGuard} from './touch-guard.mjs';
import {buildLibrary} from './library-scene.mjs';
import {advanceMovement} from './movement-time.mjs';
import {attachVisitorExperience} from './visitor-experience.mjs';
import {previewFrameMetrics} from './frame-metrics.mjs';
import {batchAtriumBoxes} from './static-batches.mjs';
import {atriumHeightAt,canWalkAtrium,intersectAtriumRay} from './atrium-layout.mjs';
import {attachPreviewMeetup} from './preview-meetup.mjs';
import {applyWarmStudy} from './space-design.mjs';
import {buildLunarAtrium as buildOpenCampus,atriumActions as openCampusActions} from './lunar-atrium.mjs';
import {introSeatIndex, introEntrance, introBalloonPosition, hitsIntroDesk, pickDesk} from './intro-desk.mjs';
import {attachTourView} from './view-controls.mjs';
import {attachAppearanceEditor} from '../office/appearance-editor.mjs';
import {appearance} from '../office/contract.mjs';
import * as Plan from '../office/vendor/campus-plan.js';
import * as Interior from '../office/vendor/interior-layout.js';
import {attachOfficeEnvironment} from '../office/vendor/office-environment.js';
import {attachAvatarAppearance} from '../office/vendor/avatar-appearance.js';
import {drawAvatarNameplate} from '../office/vendor/avatar-nameplate.js';
import {createFrameBudget} from '../office/frame-budget.mjs';
// Synthetic preview host only. Only an explicitly enabled local fixture can connect preview peers; no real membership or bot commands.
const root=document.getElementById('office'),layer=document.getElementById('hotspots'),status=document.getElementById('status');
const token=new URLSearchParams(location.hash.slice(1)).get('bridge')||'';
const names={library:'문샷 자료실',live:'문샷 라이브홀',welcome:'문샷 개강 준비실',study:'문샷 공부방',office:'내 AI 사무실'};
let started=false,publicVisitor=false,devPresence=false,qaCrowd=false,ambientCount=0,operatorReview=false,guidedPreview=false;
let meetup,sceneBatch,meetupWanted=false,environment,mixer,interiors;
let officeIntro=false;
let guidedDemoPhase='result',guidedDemoTitle='내 AI에게 맡길 첫 업무',guidedTransition;
let office,view,editor,editing=false,room='live',ready=false,blocked=false,previous=0,target=null,markers=[],currentRole='guest';
const detachTouchGuard=attachSceneTouchGuard(document);
window.addEventListener('pagehide',detachTouchGuard,{once:true});
document.querySelector('#appearance-close').onclick=()=>document.querySelector('#appearance-cancel').click();
const keys=new Set(),groups=new Map(),positions=new Map(),obstacles={live:[],welcome:[],library:[]};
const budget=createFrameBudget({activeWindow:1200,activeInterval:matchMedia('(pointer:coarse)').matches?1000/30:1000/60});
const send=(type,payload={})=>{if(token.length>=32)parent.postMessage({source:'moonshot-tour',token,type,payload},location.origin);};
// Input inside this iframe keeps visible-session activity accurate without logging movement.
let lastActivityPulse=-5000;
const activityPulse=()=>{const now=performance.now();if(now-lastActivityPulse>=5000){lastActivityPulse=now;send('activity');}};
for(const event of ['pointerdown','pointermove','keydown','touchstart'])window.addEventListener(event,activityPulse,{passive:true});
const allowed=id=>guidedPreview?['welcome','office','live'].includes(id):id==='live'||id==='library'||(['study','office'].includes(id)&&['student','admin'].includes(currentRole));
const info={library:{cx:0,cy:10,w:24,d:26,spawn:{x:0,y:19}},live:{cx:0,cy:12,w:44,d:44,spawn:{x:0,y:28}},welcome:{cx:1,cy:12,w:24,d:26,spawn:{x:1,y:21}},study:{cx:4,cy:13,w:27,d:28,spawn:{x:4,y:15}},office:{cx:27,cy:17,w:20,d:20,spawn:{x:27,y:22}}};
function fit(){if(!office?.camera?.isOrthographicCamera)return;const f=info[room],c=office.camera,aim={x:f.cx,y:1,z:f.cy};c.position.set(f.cx+24,30,f.cy+32);office.controls.target.set(aim.x,aim.y,aim.z);c.lookAt(office.controls.target);const bounds=room==='study'||room==='office'?Plan.getCampusRoom(room).bounds:{minX:f.cx-f.w/2,maxX:f.cx+f.w/2,minY:f.cy-f.d/2,maxY:f.cy+f.d/2};const h=40,l=Math.hypot(40,29),points=[];for(const x of[bounds.minX,bounds.maxX])for(const z of[bounds.minY,bounds.maxY])for(const y of[0,5]){const dx=x-aim.x,dy=y-aim.y,dz=z-aim.z;points.push({x:dx*.8-dz*.6,y:dx*(-29*24/(h*l))+dy*h/l+dz*(-29*32/(h*l))});}const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y)),aspect=Math.max(.3,office.cw/office.ch),dock=guidedPreview&&office.cw>700?Math.min(office.cw<=1000?500:560,office.cw*.65):0,available=1-dock/office.cw;
 const studyFit = room === 'study' && document.body.dataset.studyControls === 'true';
 const span = Math.max((maxY-minY) / (studyFit ? 0.85 : 0.8), (maxX-minX) / aspect / ((studyFit ? 1.04 : 0.9) * available));
 const cx=(minX+maxX)/2-span*aspect*(1-available)/2,cy=(minY+maxY)/2;c.left=cx-span*aspect/2;c.right=cx+span*aspect/2;c.top=cy+span/2;c.bottom=cy-span/2;c.zoom=1;c.updateProjectionMatrix();c.updateMatrixWorld();}
function box(group,x,y,z,w,d,h,color,solid=true,glow=false){const mesh=office.boxMesh(x,y,z,w,d,h,color,{group,rough:.55,metal:.15,...glow?{emissive:color,ei:.5}: {}});if(solid&&room in obstacles)obstacles[room].push({x,y,w,d});return mesh;}
function sign(group,text,x,y,z,w,h,design){const previousRoom=office.room;office.room=group;office.buildSign({text:design?'':text,x,y,z,w,h,bg:'#0e2444',fg:'#ddecff',border:design?undefined:'#3f8de9',glow:true,font:'system-ui, sans-serif'});if(design){const mesh=group.children[group.children.length-1],texture=mesh.material.map;texture.image.width=1024;texture.image.height=Math.round(1024*h/w);paintLibrarySign(texture.image,design);texture.needsUpdate=true;}office.room=previousRoom;}
function createScene(id){room=id;const group=new office.room.constructor();groups.set(id,group);office.scene.add(group);const f=info[id];
 if(id==='library'){buildLibrary(office,group,box,sign);group.visible=false;return;}
 if(id==='live'){buildOpenCampus(office,group,box,{guidedPreview});group.visible=false;return;}
 box(group,f.cx-f.w/2,f.cy-f.d/2,-.25,f.w,f.d,.25,id==='live'?0x22334e:0x718b9d,false);
 for(let i=0;i<4;i++)box(group,f.cx-f.w/2+.2+i*.09,f.cy-f.d/2,.02,.025,f.d,.025,0x489fff,false,true);
 for(const x of[f.cx-f.w/2,f.cx+f.w/2-.15]){box(group,x,f.cy-f.d/2,0,.15,f.d,1.8,0x466982,false);box(group,x,f.cy-f.d/2,1.8,.16,f.d,.04,0x8bd4ff,false,true);}
 if(id==='live'){
  box(group,-9,-1,0,18,5,.65,0x12223c);box(group,-7,-.6,.65,14,.35,4.8,0x07101e);sign(group,publicVisitor?'MOONSHOT CAMPUS\n내 다음 도약을 만나는 곳':'MOONSHOT LIVE\n작은 실행이 만드는 큰 변화',0,-.2,3.1,13,3.4);
  box(group,-1,2,.65,2,1.1,1.2,0x2761ac);box(group,-9,4,.03,18,.15,.07,0x368dff,false,true);
  for(let row=0;row<4;row++)for(const x of[-7,-4,3,6]){const y=7+row*2.6;box(group,x,y,.18,1.4,1.2,.4,0x425d80);box(group,x,y+1,.45,1.4,.2,.8,0x6389b6);}
  box(group,10,10,0,1.5,3,1.1,0x2e65a3);sign(group,'문샷 안내',10.75,10,2.1,2,1);
 }else{
  box(group,-6,1,0,14,3,.3,0x35546e);box(group,-4.8,1.1,.3,11.5,.3,3.8,0x142e4c);sign(group,'',1,1.45,2.6,10.5,2.7,{eyebrow:guidedPreview?'MOONSHOT · WELCOME':names.welcome,title:guidedPreview?'AI와 일하는 나의 첫 장면':'라이브 다시보기',subtitle:guidedPreview?'한 가지를 맡겨보면 달라져요':'함께 배우는 첫걸음',play:!guidedPreview});
  for(const x of[-6,4]){box(group,x,11,0,3,2.2,.9,0x385b7e);box(group,x+.5,11.3,.9,2,.2,1.1,0x162b45);box(group,x+.6,11.51,1.2,1.8,.02,.65,0x409fff,false,true);}
  office.place('loungeSofa',-3,6,2.8,1,{group});office.place('loungeSofa',1,6,2.8,1,{group});
  for(const [x,y]of[[-8,5],[9,5],[-8,18],[9,18]])office.place('pottedPlant',x,y,1,1,{group});
  box(group,-2,18,0,6,1.4,.85,0xb2ced9);sign(group,'',1,18.8,1.8,5,1,{eyebrow:guidedPreview?'YOUR FIRST STEP':'NOTICE',title:guidedPreview?'내 AI에게 맡길 첫 업무':'공지사항',subtitle:guidedPreview?'설치 없이, 작은 결과 하나부터':'수업 준비를 확인해요'});
 }
 group.visible=false;
}
const furniture=id=>Interior.getCampusInterior('study').find(i=>i.id===id);
// The study↔office doorway already exists in the plan; give it a marker footprint.
function doorSpot(id){const p=Plan.getCampusRoomPortal(id)?.position;return p?{x:p.x-.5,y:p.y-.5,w:1,d:1,height:2.2}:{x:0,y:0,w:0,d:0,height:0};}
// Walking into a door or a destination sign does what clicking it does (staff QA 2026-11-17).
const walkIds=id=>id.startsWith('destination:')||(room==='live'&&id==='experience');
function walkZone(a){for(const [id,,,item] of actions()){if(!walkIds(id)||!item?.w)continue;const cx=item.x+item.w/2,cy=item.y+item.d/2;if(Math.hypot(a.x-cx,a.y-cy)<=Math.max(item.w,item.d)/2+.7)return id;}return null;}
let zoneRoom=null,lastZone=null;
function checkZone(a){const zone=walkZone(a);if(zoneRoom!==room){zoneRoom=room;lastZone=zone;return;}if(zone===lastZone)return;lastZone=zone;if(!zone)return;keys.clear();target=null;a.moving=false;if(zone.startsWith('destination:'))send('destination',{id:zone.split(':')[1]});else send('action',{id:zone});}
function actions(){if(guidedPreview)return [];if(room==='library')return [['library:files','무료 자료 받기','눌러서 파일 다운로드',{x:-7,y:8,w:4,d:1,height:.7}],['library:replay','다시보기 선택','눌러서 영상 목록 보기',{x:3,y:6,w:5,d:1,height:.65}],['destination:live','오픈 캠퍼스로','동료들과 다시 만나기',{x:-1,y:20,w:2,d:1,height:1}]];if(room==='live')return publicVisitor?[...openCampusActions,['destination:library','문샷 자료실','무료 자료 · 다시보기',libraryPortal]]:[...openCampusActions,['destination:library','문샷 자료실','무료 자료 · 다시보기',libraryPortal],['live-video','라이브 보기','영상 안내',{x:-4,y:-5,w:4,d:1,height:4}]];const desk=Plan.getStudyDesks()[0],books=Plan.getStudyBookcase();return {
 live:[['live-video','라이브 보기','무대 스크린',{x:-2,y:2,w:4,d:1,height:3}],['experience','AI 체험하기','작은 요청부터',{x:-5,y:13,w:2,d:1,height:1}],['offer','교육·상담 안내','내 다음 도약',{x:10,y:10,w:1.5,d:3,height:2}],['destination:study','문샷 공부방','어떤 곳일까요?',{x:-10,y:19,w:2,d:2,height:2}],['destination:office','내 AI 사무실','어떤 곳일까요?',{x:5,y:17,w:2,d:2,height:2}]],
 welcome:[['video','라이브 다시보기','놓친 내용 다시 보기',{x:-2,y:3,w:5,d:1,height:3}],['quiz','OX 퀴즈','02 · 안전한 AI 활용',{x:-6,y:11,w:3,d:2,height:2}],['level','AI 수준 확인','03 · 나에게 맞는 시작',{x:4,y:11,w:3,d:2,height:2}],['notices','공지사항','일정 · 수업 준비',{x:-2,y:18,w:6,d:1,height:1}],['basics','AI 기초 지식','쉬운 예시로 시작하기',{x:8,y:16,w:2,d:2,height:2}]],
 study:[['learning','수업','오늘의 실행',{x:books.x,y:books.y,w:books.width,d:.6,height:2}],['destination:office','내 AI 사무실','문으로 나가기',doorSpot('study')],['focus','앉아서 집중','타이머 열기',{...desk,w:2.8,d:1,height:1}],['feedback','동료 피드백','함께 더 나은 결과',furniture('study-low-shelf')]],
 office:[['office','업무 관리','요청 · 초안 · 검토',{x:25,y:16,w:4,d:2,height:1.2}],['destination:study','문샷 공부방','문으로 나가기',doorSpot('office')],['bots','내 AI 직원','연결 상태 확인',{x:21.8,y:12.3,w:1.6,d:1.4,height:1.5}]],
 }[room].filter(([id])=>!publicVisitor||id!=='live-video');}
let contentTasks=null;
let studyNameplate = null;
let studyHostBoxes = [];
const layoutStudySigns = makeStudySignLayout(document.querySelectorAll('.tour-pad, #environment-open, #status'));
configureStudySigns(layer);
function positionRoomMarkers() {
  if (room === 'study') {
    layoutStudySigns(markers, office, studyNameplate, studyHostBoxes);
    return;
  }
  for (const { b, item } of markers) {
    const point = office.projectInteriorPoint(item);
    b.hidden = !point;
    if (point) b.style.transform = `translate(${point.x}px,${point.y-24}px) translate(-50%,-100%)`;
  }
}
let deskProfiles=[],deskJobs=[],deskMarkers=[],deskLive=false;
const officeSeats=Plan.createCampusPlan().officeSeats;
let officeFirst=false, pendingOffice=null, initialRoomSync=false;
let firstDeskFrame=null;
let finishDeskCheck;
function checkFirstDeskData(){
 return new Promise(resolve=>{
  const timer=setTimeout(complete,1800);
  function complete(){clearTimeout(timer);finishDeskCheck=undefined;resolve();}
  finishDeskCheck=complete;
  send('office-desk-check');
 });
}

// Render the original desk meshes with the final camera. Character and prop downloads
// can finish later without replacing the desks, their seat coordinates or the canvas.
function showFirstDeskFrame(){
 let labelsVisible=false;
 const projectJobs=()=>{
  layer.replaceChildren();
  const profiles=pendingOffice?.document?.profiles;
  const jobs=pendingOffice?.desks;
  const markers=room==='office'&&!blocked&&Array.isArray(profiles)&&Array.isArray(jobs)
   ? makeDeskMarkers(layer,officeSeats,profiles,jobs,jobId=>send('office-desk-job',{jobId})) : [];
  positionDeskMarkers(office,markers);
  const visible=markers.length>0&&markers.length===jobs.length&&markers.every(({b})=>!b.hidden);
  if(visible!==labelsVisible){
   labelsVisible=visible;
   send('office-desks-visible',{visible});
  }
 };
 const paint=()=>{
  if(room!=='office'||blocked)return;
  fit();
  office.gl.render(office.scene,office.camera);
  root.dataset.officeStage='desks';
  projectJobs();
 };
 paint();
 // The observer delivers an initial notification even without a size change.
 let width=office.cw,height=office.ch;
 const observer=new ResizeObserver(()=>{
  if(width===office.cw&&height===office.ch)return;
  width=office.cw;height=office.ch;paint();
 });
 observer.observe(root);
 return {projectJobs,finish(){observer.disconnect();layer.replaceChildren();delete root.dataset.officeStage;}};
}
let atriumMeshType;
const preparedRooms=new Set(['office']);
function prepareRoom(id){
 if(preparedRooms.has(id))return;
 if(id==='study')applyWarmStudy(office,Plan);
 else {
  createScene(id);
  if(id==='live')sceneBatch=batchAtriumBoxes(groups.get(id),atriumMeshType);
 }
 preparedRooms.add(id);
}

let lastDocument='';
function applyPersonalOffice(payload){
 if(guidedPreview)return;
 if(!payload || publicVisitor || !['student','admin'].includes(currentRole))return;
 try{
  const key=JSON.stringify(payload.document);
  const changed=key!==lastDocument;
  if(changed){
   const document=new BotOfficeModel().restore(payload.document);
   office.update(toBotOfficeSessions(document));
   deskProfiles=document.profiles;
   lastDocument=key;
  }
  deskJobs=Array.isArray(payload.desks)?payload.desks:[];deskLive=true;
  return changed;
 }catch{return;}
}
// Guided previews show a prepared example only when the host has revealed it.
// This never updates the real office model, job API or member permissions.
function setGuidedDemoPhase(phase,title){
 if(!guidedPreview||!['brief','result'].includes(phase))return;
 guidedDemoPhase=phase;
 if(typeof title==='string'&&title.trim())guidedDemoTitle=title.trim().slice(0,160);
 deskJobs=phase==='result'?[{employeeId:'demo-writer',jobId:'demo-copy',status:'review'}]:[];
 if(ready){refreshDeskLabels();budget.wake(performance.now());office.draw();}
}
function transitionGuidedRoom(){
 guidedTransition?.cancel();
 if(!guidedPreview||matchMedia('(prefers-reduced-motion: reduce)').matches||!root.animate)return;
 // The room and its action are ready immediately; this is visual polish, never a navigation gate.
 guidedTransition=root.animate([{opacity:.35},{opacity:1}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'});
}
function renderDeskMarkers(){
 deskMarkers=room==='office'&&currentRole==='student'
   ? makeDeskMarkers(layer,officeSeats,deskProfiles,deskJobs,jobId=>guidedPreview?send('action',{id:'office:demo'}):send('office-desk-job',{jobId}),deskLive?employeeId=>send('office-desk-employee',{employeeId}):undefined) : [];
 if(guidedPreview)for(const {b} of deskMarkers){
  b.classList.add('guided-example-action');
  const label=officeIntro?guidedDemoTitle:'예시 결과 보기';
  if(officeIntro){
   const caption=document.createElement('span');caption.textContent=label;
   b.replaceChildren(caption);
  }else b.replaceChildren(label);
  b.title=guidedDemoTitle+' · 미리 준비한 예시';
  b.setAttribute('aria-label',label);
  b.setAttribute('aria-description',guidedDemoTitle+' · 미리 준비한 예시');
 }
}
function positionCurrentDeskMarkers(){
 if(!guidedPreview){positionDeskMarkers(office,deskMarkers);return;}
 if(officeIntro){
  const position=introBalloonPosition(office,officeSeats[introSeatIndex]);
  for(const {b} of deskMarkers){
   b.hidden=!position;
   if(position)b.style.transform=`translate(${position.x}px,${position.y}px)`;
  }
  return;
 }
 // The short mobile scene has a route at the top and its name at the bottom.
 // Keep one 44px action in a dedicated left lane, away from the host's top-right world control.
 const width=144,height=44,mobile=office.cw<=700;
 const reserve=mobile?0:Math.min(office.cw<=1000?500:560,office.cw*.65);
 for(const {b,item} of deskMarkers){
  const point=office.projectInteriorPoint(item);
  b.hidden=!point;
  if(!point)continue;
  const x=mobile?12:Math.max(reserve+12,Math.min(office.cw-width-12,point.x-width-16));
  const top=mobile?44:112,bottom=Math.max(top,office.ch-height-(mobile?32:28));
  const y=Math.max(top,Math.min(bottom,point.y-height/2));
  b.style.transform=`translate(${x}px,${y}px)`;
 }
}
function configureGuidedLabels(){
 if(!guidedPreview)return;
 // These are anonymous example figures, not signed-in members or live employees.
 // Their duplicate canvas labels add no information beside the single example action.
 office.bubble=()=>{};
 office.drawCampusAvatarLabel=()=>{};
}
function setOfficeIntro(enabled){
 if(!guidedPreview||officeIntro===enabled)return;
 officeIntro=enabled;
 document.body.dataset.officeIntro=String(enabled);
 if(!ready)return;
 if(enabled&&room==='office'){
  Object.assign(office.campusAvatar,introEntrance(officeSeats[introSeatIndex]),{moving:false});
  target=null;keys.clear();view.set('third');
 }else view.set('overall');
 refreshDeskLabels();
}

function refreshDeskLabels(){
 for(const {b} of deskMarkers)b.remove();
 renderDeskMarkers();
 positionCurrentDeskMarkers();
}
function setMarkers() {
  layer.replaceChildren();
  const waitingForStudyConfig = room === 'study' && document.body.dataset.studyControls === 'true' && !contentTasks;
  const visible = actions().filter(([id]) => id.startsWith('destination:')
    || (contentTasks ? contentTasks.some(task => task.id === id) : !waitingForStudyConfig));
  markers = visible.map(([id, label, hint, item]) => {
    const custom = contentTasks?.find(task => task.id === id && task.custom);
    const b = document.createElement('button');
    const title = document.createElement('strong');
    const sub = document.createElement('small');
    title.textContent = custom?.title ?? label;
    sub.textContent = custom?.description ?? hint;
    b.className = 'tour-hotspot';
    b.append(title, sub);
    b.setAttribute('aria-label', title.textContent);
    if (room === 'study') {
      b.title = [title.textContent, sub.textContent].filter(Boolean).join(' · ');
      if (sub.textContent) b.setAttribute('aria-description', sub.textContent);
    }
    b.onclick = event => {
      event.stopPropagation();
      keys.clear();
      target = null;
      office.campusAvatar.moving = false;
      if (id.startsWith('destination:')) send('destination', { id: id.split(':')[1] });
      else send('action', { id });
    };
    layer.append(b);
    return { b, item };
  });
  renderDeskMarkers();
}
function showRoom(id){if(!names[id]||!allowed(id))return;const previousRoom=room;prepareRoom(id);positions.set(guidedPreview?previousRoom:room,{x:office.campusAvatar?.x,y:office.campusAvatar?.y});room=id;if(guidedPreview&&ready&&previousRoom!==id)transitionGuidedRoom();document.body.dataset.room=id;if(!guidedPreview&&['study','office'].includes(id)){interiors??=attachInteriorInteractions({office,root,getRoom:()=>room,onMessage:text=>{keys.clear();target=null;budget.wake(performance.now()+4000);status.textContent=text;}});}else{interiors?.destroy();interiors=null;}mixer?.setRoom(id);document.getElementById('environment-open').hidden=guidedPreview||!['study','office'].includes(id);office.setEnvironment({lighting:guidedPreview?'bright':['study','office'].includes(id)?document.getElementById('lighting-select').value:'bright'});keys.clear();target=null;const p=positions.get(id);office.campusAvatar={...(Number.isFinite(p?.x)?p:info[id].spawn),roomId:id==='office'?'office':'study',moving:false,yaw:id==='live'?Math.PI+.12:Math.PI,studyPose:null};if(officeIntro&&id==='office')Object.assign(office.campusAvatar,introEntrance(officeSeats[introSeatIndex]));office.campusAvatar.jumpHeight=room==='live'?atriumHeightAt(office.campusAvatar.x,office.campusAvatar.y):0;setMarkers();view?.roomChanged();meetup?.roomChanged();if(ready||!officeFirst)budget.wake(performance.now());office.draw();showStatusHint();status.textContent=guidedPreview?'바닥을 눌러 이동 · 드래그로 둘러보기':matchMedia('(pointer:coarse), (max-width:650px)').matches?'바닥 터치 · 이동\n드래그 · 둘러보기\n두 손가락 · 확대':(publicVisitor&&id==='live'?'문샷 오픈 캠퍼스':names[id])+' · WASD 이동 · 클릭 이동 · 드래그 시점 · 스크롤 확대' ;send('room',{id});}
// The control hint shows when a room opens, then fades so it never covers the room's bottom buttons (staff QA 11-17).
let hintTimer=0;function showStatusHint(){status.classList.remove('faded');clearTimeout(hintTimer);hintTimer=setTimeout(()=>status.classList.add('faded'),6000);}
function free(p){if(room==='study'||room==='office'){const a=office.campusAvatar;return Plan.resolveCampusMovement(a,{x:p.x-a.x,y:p.y-a.y},room).position;}if(room==='live'&&!canWalkAtrium(office.campusAvatar,p))return null;const f=info[room],r=.25;return p.x>f.cx-f.w/2+r&&p.x<f.cx+f.w/2-r&&p.y>f.cy-f.d/2+r&&p.y<f.cy+f.d/2-r&&!obstacles[room].some(o=>p.x>o.x-r&&p.x<o.x+o.w+r&&p.y>o.y-r&&p.y<o.y+o.d+r)?p:null;}
function move(dt){if(blocked||editing||document.hidden)return;const a=office.campusAvatar;let x=Number(keys.has('right'))-Number(keys.has('left')),y=Number(keys.has('down'))-Number(keys.has('up'));if(x||y){target=null;const length=Math.hypot(x,y);x/=length;y/=length;const v=view.moveVector(x,y);x=v.x;y=v.y;}else if(target){const dx=target.x-a.x,dy=target.y-a.y,d=Math.hypot(dx,dy);if(d<.15)target=null;else{x=dx/d;y=dy/d;}}a.moving=!!(x||y);if(!a.moving)return;a.studyPose=null;const before={x:a.x,y:a.y},step=dt*4;const px=free({x:a.x+x*step,y:a.y});if(px)Object.assign(a,px);const py=free({x:a.x,y:a.y+y*step});if(py)Object.assign(a,py);if(Math.hypot(a.x-before.x,a.y-before.y)<.001)target=null;a.jumpHeight=room==='live'?atriumHeightAt(a.x,a.y):0;a.yaw=Math.atan2(x,y);checkZone(a);}
async function start(){if(started)return;started=true;try{/* campus-plan.js installs the renderer API, including its non-exported picking helpers. */window.CampusInterior=Interior;await import('../office/vendor/office.js');const {Office3D,CampusInstancedMesh,CampusSphereGeometry,CampusBasicMaterial}=await import('../office/vendor/office3d.js');office=new Office3D(root,{showAgent:false,deskCapacity:8,deferModels:officeFirst,...guidedPreview?{compact:true}:{}});if(office.gl)applyRenderProfile(office.gl,root);office.update([]);
 let configuringOffice=officeFirst;
 if(officeFirst){
  if(!office.gl)throw Error('renderer');
  // Configure the destination, camera and roster before paying for the first draw.
  const draw=office.draw.bind(office);
  office.draw=(...args)=>configuringOffice?false:draw(...args);
  office.getCampusVisibleRoom=()=>room==='office'?'office':'study';
  office.prepareRoomGeometry();
  // Only the stationary lab architecture is present here. Furnishings, lights and
  // animated actors are installed afterwards and keep their individual meshes.
  for(const screen of office.screens.values())screen.userData.campusDynamicMaterial=true;
  const batch=batchAtriumBoxes(office.campusRoomGroups.get('office'));
  const dispose=office.disposeCampusArchitecture;
  office.disposeCampusArchitecture=()=>{batch.dispose();dispose?.();};
  const touchDesk=matchMedia('(pointer: coarse), (max-width: 600px)').matches;
  const restoreMaterials=touchDesk?applyDeskPreviewMaterials(office.campusRoomGroups.get('office'),CampusBasicMaterial):null;
  try {
   // Process queued reports before submitting the first draw, and present the
   // interactive desks before decoding character models.
   if(touchDesk)await new Promise(resolve=>requestAnimationFrame(resolve));
   firstDeskFrame=showFirstDeskFrame();
   // Reconcile the initial snapshot through the existing session while loading assets.
   const checked=touchDesk?checkFirstDeskData():undefined;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(!await office.loadModels())throw Error('renderer');
   if(checked){
    await checked;
    // Present the reconciled marker before entering the full lighting/actor pass.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   }
  } finally {
   restoreMaterials?.();
  }
  firstDeskFrame.finish();firstDeskFrame=null;
  office.installCampusInterior();
 }else if(!await office.ready)throw Error('renderer');
 office.avatarNameplate = (ctx, options) => {
  const bounds = room === 'study' ? drawStudyNameplate(ctx, options) : drawAvatarNameplate(ctx, options);
  if (room === 'study' && options.self) studyNameplate = bounds;
  return bounds;
 };attachOfficeEnvironment(office,root);attachAvatarAppearance(office);office.campusIdentity={displayId:'나 · 미리보기',gender:'male',coat:'#386eb4',hairColor:'#302825',skinColor:'#e8b68b',pantsColor:'#36485d',model:0};
 configureGuidedLabels();office.campusHeightAt=(x,y)=>room==='live'?atriumHeightAt(x,y):0;atriumMeshType=CampusInstancedMesh;const arrivalRoom=room;if(!officeFirst)for(const id of (guidedPreview?['welcome','live']:['study','library','live']))prepareRoom(id);if(guidedPreview){room=arrivalRoom;deskProfiles=[{employeeId:'demo-writer',seatIndex:introSeatIndex,name:'체험용 AI 직원'}];setGuidedDemoPhase(guidedDemoPhase);office.update([{key:'guided-demo-writer',employeeId:'demo-writer',name:'체험용 AI 직원',fullName:'체험용 AI 직원',project:'미리 준비한 예시',role:'체험 직원',agent:'present',status:'present',activity:null,title:guidedDemoTitle,appearanceSeed:210,seatIndex:introSeatIndex,startedAt:0,lastEventAt:0,subagent:false}]);}office.getCampusVisibleRoom=()=>room==='office'?'office':'study';office.drawCampusRoomLabels=()=>{};office.updateCampusVisibility=()=>{for(const [id,g]of office.campusRoomGroups)g.visible=id===room;for(const [id,g]of groups)g.visible=id===room;office.plan.observationWindows=[];};office.fitCamera3D=fit;office.pauseCampusInput=()=>{editing=true;keys.clear();target=null;view?.refresh();};office.resumeCampusInput=()=>{editing=false;view?.refresh();budget.wake(performance.now());};
 mixer=attachAmbientMixer(document.getElementById('ambient-host'));mixer.setRoom(room);environment=attachEnvironmentControls({office,root,isBlocked:()=>blocked,wake:()=>budget.wake(performance.now()),onOpenChange:open=>send('editor',{open})});
 view=attachTourView({office,root,fitMap:fit,wake:()=>budget.wake(performance.now()),onChange:mode=>send('camera',{mode}),isBlocked:()=>blocked||editing||document.hidden});
 editor=attachAppearanceEditor(office,(type,payload)=>{if(type==='appearance-cancel'){send('editor',{open:false});view.refresh();}if(type==='appearance-save')send(type,payload);});
 meetup=guidedPreview?null:((publicVisitor||devPresence)&&!new URLSearchParams(location.search).has('qaChat')?attachVisitorExperience:attachPreviewMeetup)({send,devPresence,qaCrowd,ambientCount,operatorReview,showStories:publicVisitor,office,root,CampusInstancedMesh,CampusSphereGeometry,getRoom:()=>room,getRole:()=>currentRole,wake:()=>budget.wake(performance.now())});
 const recordFrame=previewFrameMetrics(root,office.gl,new URLSearchParams(location.search).has('previewMeetup'));const drawScene=office.draw.bind(office);const paintScene=()=>{if(!ready||blocked||(editing&&!environment?.isOpen())||document.hidden)return;const frameStart=performance.now();studyNameplate=null;drawScene();meetup?.labels?.();root.dataset.playerX=office.campusAvatar?.x?.toFixed(2);recordFrame(frameStart,performance.now(),office.campusAvatar?.moving);root.dataset.playerY=office.campusAvatar?.y?.toFixed(2);root.dataset.playerHeight=String(office.campusAvatar?.jumpHeight||0);root.dataset.room=room;if(deskMarkers.length)positionCurrentDeskMarkers();positionRoomMarkers();};
 // Host state (role, camera, avatar and panel visibility) arrives in a burst.
 // Project labels immediately, but submit at most one office render per frame.
 let paintRequest=0;
 office.draw=()=>{
  if(!ready)return;
  if(room!=='office'){if(paintRequest)cancelAnimationFrame(paintRequest);paintRequest=0;paintScene();return;}
  if(!paintRequest)paintRequest=requestAnimationFrame(()=>{paintRequest=0;paintScene();});
 };
 const frame=office.frame.bind(office);office.frame=now=>{const elapsed=(now-previous)/1000||.016;previous=now;advanceMovement(elapsed,move);meetup?.tick(now);if(budget.shouldDraw(now,{moving:!!office.campusAvatar?.moving||!!meetup?.moving(),hidden:blocked||editing||document.hidden}))frame(now);};
 if(officeFirst)applyPersonalOffice(pendingOffice);
 pendingOffice=null;
 // showRoom also configures lighting and camera; paint once after both are set.
 showRoom(room);if(officeIntro&&room==='office')view.set('third');configuringOffice=false;ready=true;paintScene();initialRoomSync=true;send('ready');}catch{firstDeskFrame?.finish();firstDeskFrame=null;
  // The renderer paints its own English failure text on the canvas; the host shows the Korean guidance instead.
  if(office?.loadError){office.loadError='';try{office.draw();}catch{}}
  status.textContent='3D 공간을 열지 못했어요. 상단 공간 이동과 활동 메뉴로 계속할 수 있어요.';send('error');}}
window.addEventListener('message',e=>{const m=e.data;if(e.origin!==location.origin||e.source!==parent||m?.source!=='moonshot-tour-host'||m.token!==token||token.length<32)return;const p=m.payload||{};if (m.type === 'study-map-controls' && Array.isArray(p.boxes)) {
  studyHostBoxes = p.boxes.slice(0, 4).filter(box => box && [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite));
  if (ready && room === 'study') office.draw();
  return;
 }
 if(m.type==='init'){if(!started){document.body.dataset.studyControls=String(p.studyControls===true);guidedPreview=p.guidedPreview===true;document.body.dataset.guidedPreview=String(guidedPreview);if(guidedPreview){setOfficeIntro(p.officeIntro===true);currentRole='student';room=['welcome','office','live'].includes(p.initialRoom)?p.initialRoom:'welcome';guidedDemoPhase=p.demoPhase==='brief'?'brief':'result';if(typeof p.demoTitle==='string'&&p.demoTitle.trim())guidedDemoTitle=p.demoTitle.trim().slice(0,160);}publicVisitor=!guidedPreview&&p.visitor===true;operatorReview=p.operatorReview===true;devPresence=!guidedPreview&&p.devPresence===true;qaCrowd=devPresence&&p.qaCrowd===true;ambientCount=!guidedPreview&&[0,20,40,60].includes(p.ambientCount)?p.ambientCount:0;document.body.dataset.visitor=String(publicVisitor);if(publicVisitor&&devPresence){const seed=crypto.getRandomValues(new Uint32Array(1))[0];info.live={cx:0,cy:12,w:44,d:44,spawn:{x:(seed%9-4)*.9,y:27+((seed>>>8)%4)*.8}}};officeFirst=!guidedPreview&&p.studentOffice===true&&!publicVisitor&&!operatorReview;
 if(officeFirst){room='office';currentRole='student';pendingOffice=p.personalOffice;}
 void start();}else if(ready)send('ready');return;}if(m.type==='guided-office-intro'){setOfficeIntro(p.enabled===true);return;}if(m.type==='guided-demo'){setGuidedDemoPhase(p.phase,p.title);return;}if(m.type==='meetup-start'){meetupWanted=true;void meetup?.join();return;}if(!ready){
 if(m.type==='office-desk-check-done')finishDeskCheck?.();
 if(officeFirst && m.type==='personal-office')pendingOffice=p;
 if(officeFirst && m.type==='office-desks-clear')pendingOffice=null;
 if(officeFirst && m.type==='room' && names[p.id] && allowed(p.id))room=p.id;
 if(officeFirst && m.type==='blocked')blocked=!!p.value;
 if(['personal-office','office-desks-clear','room','blocked'].includes(m.type))firstDeskFrame?.projectJobs();
 return;
}if(m.type==='dev-visitor-state')meetup?.receive?.(p);if(m.type==='personal-office'){
 const seatsChanged=applyPersonalOffice(p);refreshDeskLabels();if(seatsChanged)office.draw();
}if(m.type==='office-desks-clear'){deskJobs=[];deskLive=false;refreshDeskLabels();}if(m.type==='content-config'&&Array.isArray(p.tasks)){contentTasks=p.tasks.filter(t=>typeof t.id==='string'&&typeof t.title==='string'&&typeof t.description==='string');setMarkers();}if(m.type==='room'){if(!initialRoomSync||p.id!==room)showRoom(p.id);initialRoomSync=false;}if(m.type==='role'){currentRole=['guest','waiting','student','admin','expired'].includes(p.role)?p.role:'guest';if(!allowed(room))showRoom('live');meetup?.roleChanged();}if(m.type==='environment-open'&&['study','office'].includes(room))environment?.open();if(m.type==='blocked'){blocked=!!p.value;root.inert=blocked||environment?.isOpen()===true;layer.hidden=blocked;view.refresh();keys.clear();target=null;if(!blocked){budget.wake(performance.now());office.draw();if(!editing)root.focus({preventScroll:true});}}if(m.type==='sit'&&room==='study'){const p=Plan.getStudySeats()[0];Object.assign(office.campusAvatar,p,{studyPose:'sit',moving:false});target=null;keys.clear();office.draw();}if(m.type==='appearance'){office.campusIdentity={...office.campusIdentity,...appearance(p),displayId:String(p.nickname||'나 · 미리보기').slice(0,24)};office.draw();if(meetupWanted)void meetup?.join();}if(m.type==='progress'){office.campusIdentity={...office.campusIdentity,level:Number.isSafeInteger(p.level)?Math.max(0,Math.min(30,p.level)):0};root.dataset.level=String(office.campusIdentity.level);office.draw();}if(m.type==='camera'){view.set(p.mode);if(!guidedPreview)root.focus({preventScroll:true});}if(m.type==='appearance-open'&&!blocked){editor.open();send('editor',{open:true});}if(m.type==='appearance-result'){editor.result(p);if(p.ok){send('editor',{open:false});view.refresh();budget.wake(performance.now());office.draw();}}});
const direction=e=>({KeyW:'up',KeyA:'left',KeyS:'down',KeyD:'right',ArrowUp:'up',ArrowLeft:'left',ArrowDown:'down',ArrowRight:'right'}[e.code]);
document.addEventListener('keydown',e=>{const d=direction(e);if(!d||blocked||editing||!ready||e.target.closest('button,input,textarea,select'))return;e.preventDefault();keys.add(d);budget.wake(performance.now());});document.addEventListener('keyup',e=>{keys.delete(direction(e));});window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();target=null;});
root.addEventListener('pointerup',e=>{if(!ready||blocked||editing||!view.isClick()||e.button!==0)return;const rect=root.getBoundingClientRect();const mx=e.clientX-rect.left,my=e.clientY-rect.top,near=office.camera.position.clone().set(mx/office.cw*2-1,1-my/office.ch*2,-1).unproject(office.camera),far=office.camera.position.clone().set(mx/office.cw*2-1,1-my/office.ch*2,1).unproject(office.camera);if(officeIntro&&room==='office'&&guidedDemoPhase==='result'&&hitsIntroDesk(near,far,officeSeats)){
 target=null;keys.clear();office.campusAvatar.moving=false;
 send('action',{id:'office:demo'});return;
}if(room==='office'&&currentRole==='student'&&deskLive&&!guidedPreview){const seat=pickDesk(near,far,officeSeats,index=>deskProfiles.some(p=>p?.seatIndex===index)),person=deskProfiles.find(p=>p?.seatIndex===seat);if(person){target=null;keys.clear();office.campusAvatar.moving=false;send('office-desk-employee',{employeeId:person.employeeId});return;}}const p=room==='live'?intersectAtriumRay(near,far):office.campusFloorAt(mx,my);if(p){target=p;root.focus();budget.wake(performance.now());}});
for(const b of document.querySelectorAll('[data-direction]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.direction);budget.wake(performance.now());});for(const name of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,()=>keys.delete(b.dataset.direction));}
window.addEventListener('resize',()=>{if(ready){if(guidedPreview)office.resize();applyRenderProfile(office.gl,root);view.resize();budget.wake(performance.now());office.draw();}});window.addEventListener('pagehide',()=>{guidedTransition?.cancel();environment?.destroy();mixer?.destroy();interiors?.destroy();meetup?.destroy();sceneBatch?.dispose();editor?.destroy();view?.destroy();office?.destroy();});
