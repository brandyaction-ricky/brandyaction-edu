import {attachAppearanceEditor} from './appearance-editor.mjs';
import * as CampusPlan from './vendor/campus-plan.js';
import * as CampusInterior from './vendor/interior-layout.js';
import {attachCampusNavigation} from './vendor/campus-navigation.js';
import {attachOfficeEnvironment} from './vendor/office-environment.js';
import {attachAvatarAppearance} from './vendor/avatar-appearance.js';
import {attachStudyScene,STUDY_ACTIVITY_TARGETS} from './vendor/study-scene.js';
import {drawAvatarNameplate} from './vendor/avatar-nameplate.js';
import {drawAvatarSpeech} from './vendor/avatar-chat.js';
import {acceptsHost,toWire,visiblePeers,appearance} from './contract.mjs';
import {createRenderQuality} from '../src/render-quality.mjs';

const token=new URLSearchParams(location.hash.slice(1)).get('bridge')||'';
const root=document.getElementById('office'),status=document.getElementById('status');
let office,scene,editor,ready=false,started=false,timer,restorePerformance,closed=new Set(),lastPosition='',lastSent=0;
const speech=new Map(),pending=new Map();
const send=(type,payload={})=>{if(token.length>=32&&parent!==window)parent.postMessage({source:'moonshot-world',token,type,payload},location.origin);};
const say=text=>{status.textContent=text;};
const sections={focus:'desk',mission:'mission',feedback:'board',lounge:'chat',launch:'launch'};
function interact(activity){const section=sections[activity]||activity;if(closed.has(section))return;say('에듀에서 이어서 확인하세요.');send(section==='desk'?'seat':'navigate',{section});}
function moveZone(id){
  if(closed.has(id))return;
  const key=Object.keys(sections).find(k=>sections[k]===id);
  const target=id==='terrace'?{x:3.9,y:23.5}:STUDY_ACTIVITY_TARGETS[key];
  if(!target)return;
  const arrived=()=>id==='terrace'?say('문샷 테라스 · 잠시 쉬어가세요.'):interact(key);
  if(!office.walkCampusTo(target,{onArrive:arrived})){say('이동 경로를 찾지 못했어요. 선택한 기능을 엽니다.');arrived();}
  root.focus({preventScroll:true});
}
function handle(type,p={}){
  if(type==='profile'){
    office.campusIdentity={...office.campusIdentity,...appearance(p),displayId:String(p.name||'문샷 동료').slice(0,24),gender:p.gender==='female'?'female':'male',coat:/^#[0-9a-f]{6}$/i.test(p.coat)?p.coat:'#527086'};
    office.draw();
  }else if(type==='appearance-open')editor?.open();
  else if(type==='appearance-result')editor?.result(p);
  else if(type==='progress'){
    office.campusIdentity={...office.campusIdentity,level:Number.isSafeInteger(p.level)?Math.max(0,p.level):0};office.draw();
  }else if(type==='peers')scene.setParticipants(visiblePeers(p.items));
  else if(type==='camera'){scene.setCameraMode(p.mode==='third'?'third':'overall');root.focus({preventScroll:true});}
  else if(type==='zone')moveZone(p.id);
  else if(type==='controls')closed=new Set(Array.isArray(p.closedZones)?p.closedZones:[]);
  else if(type==='seat'){
    // Only the EDU host's successful seat reservation may trigger sitting.
    const seat=CampusPlan.getStudySeats()[[0,2,4][p.index]];
    if(seat&&scene.setPose('sit')){Object.assign(office.campusAvatar,{x:seat.x,y:seat.y});office.draw();say('자리에 앉았어요. 에듀 집중 타이머를 시작해 보세요.');}
  }else if(type==='stand')scene.setPose('stand');
  else if(type==='wave'){scene.setPose('wave');send('wave');}
  else if(type==='speech'&&typeof p.text==='string'&&typeof p.id==='string'){
    speech.set(p.id,{text:p.text.slice(0,120),until:Date.now()+12000});
  }else if(type==='focus-status'&&p.done)say('집중을 마쳤어요. 에듀에서 오늘의 기록을 확인하세요.');
  else if(type==='launch'||type==='cohort-launch')say('발사 기록과 기념 연출은 기존 우주선 공간에서 확인할 수 있어요.');
}
async function start(){
  if(started)return;started=true;
  try{
    window.CampusPlan=CampusPlan;window.CampusInterior=CampusInterior;
    await import('./vendor/office.js');
    const {Office3D}=await import('./vendor/office3d.js');
    office=new Office3D(root,{showAgent:false,deskCapacity:8,label:s=>s.fullName||s.project});
    office.campusInteriorItems=CampusInterior.getCampusInterior;
    office.avatarNameplate=drawAvatarNameplate;
    office.avatarSpeech=(ctx,options)=>{const value=speech.get(options.participantId);drawAvatarSpeech(ctx,{...options,text:value&&value.until>Date.now()?value.text:''});};
    office.update([]);
    if(!await office.ready)throw Error('3D 공간을 불러오지 못했습니다.');
    office.gl.setPixelRatio(Math.min(1.5,devicePixelRatio||1));
    office.sun.shadow.mapSize.set(1024,1024);
    attachOfficeEnvironment(office,root);
    attachAvatarAppearance(office);
    attachCampusNavigation(office,root,{initialRoom:'study',reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
    scene=attachStudyScene({office,root,onInteract:interact});scene.setRoom('study');editor=attachAppearanceEditor(office,send);document.getElementById('appearance-open').disabled=false;
    // Reuse the EDU measured-quality policy, and do no GPU work in hidden tabs.
    const quality=createRenderQuality(devicePixelRatio,innerWidth<600),render=office.gl.render;
    let tier='',previous=0;
    const visible=()=>{office.setVisible(!document.hidden);if(document.hidden)office.pauseCampusInput();else office.resumeCampusInput();previous=0;};
    office.gl.render=function(...args){
      if(document.hidden)return;
      const before=performance.now(),gap=previous?before-previous:0;previous=before;
      const result=render.apply(this,args),settings=quality.record(performance.now()-before,gap<1000?gap:0);
      if(tier!==settings.name){tier=settings.name;office.gl.setPixelRatio(settings.pixelRatio);office.gl.shadowMap.enabled=settings.shadows;}
      root.dataset.renderQuality=settings.name;return result;
    };
    document.addEventListener('visibilitychange',visible);visible();
    restorePerformance=()=>{document.removeEventListener('visibilitychange',visible);office.gl.render=render;};
    office.campusIdentity={displayId:'문샷 동료',level:0};
    root.addEventListener('campus-room-change',event=>{root.dataset.room=event.detail.roomId;if(event.detail.roomId==='office')say('나만의 사무공간 · 실제 AI 직원 연결은 준비 중이에요.');});
    ready=true;root.dataset.ready='true';
    for(const[type,payload]of pending)handle(type,payload);pending.clear();
    say('WASD · 방향키 · 바닥 클릭 이동 / E 가까운 공간 열기');send('ready');
    timer=setInterval(()=>{
      for(const[id,value]of speech)if(value.until<Date.now())speech.delete(id);
      if(document.hidden||office.getCampusRoom()!=='study')return;
      const p=toWire(office.campusAvatar);if(!p)return;
      p.x=Math.round(p.x*100)/100;p.y=Math.round(p.y*100)/100;
      const value=JSON.stringify(p);if(value===lastPosition||Date.now()-lastSent<500)return;
      lastPosition=value;lastSent=Date.now();send('position',p);
    },100);
  }catch{say('3D 공간을 열지 못했어요. 가벼운 공간 메뉴로 계속할 수 있습니다.');send('error');office?.destroy?.();}
}
window.addEventListener('message',event=>{
  if(!acceptsHost(event,location.origin,parent,token))return;
  const {type,payload}=event.data;
  if(type==='init'){if(ready)send('ready');else void start();return;}
  if(ready)handle(type,payload&&typeof payload==='object'?payload:{});
  else pending.set(type,payload&&typeof payload==='object'?payload:{});
});
document.getElementById('appearance-open').onclick=()=>editor?.open();
document.getElementById('study').onclick=()=>{office?.setCampusRoom('study');scene?.setCameraMode('overall');root.focus();};
document.getElementById('private-room').onclick=()=>{office?.setCampusRoom('office');root.focus();};
document.getElementById('office-link').onclick=()=>send('navigate',{section:'office'});
document.getElementById('interact').onclick=()=>scene?.interact();
for(const button of document.querySelectorAll('[data-direction]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);office?.setCampusDirection(button.dataset.direction,true);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>office?.setCampusDirection(button.dataset.direction,false));
}
window.addEventListener('pagehide',()=>{clearInterval(timer);restorePerformance?.();editor?.destroy();office?.destroy?.();speech.clear();pending.clear();});
if(parent===window||token.length<32)say('에듀 캠퍼스 화면에서 이 공간을 열어 주세요.');else send('boot');
