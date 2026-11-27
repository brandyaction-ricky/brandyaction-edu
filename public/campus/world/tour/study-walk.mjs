import {buildStudyWalkSet} from './study-walk-set.mjs';
import {doors, entrance, nearestPoint, pointAt, walkRoute, studySeat} from './lobby-paths.mjs';
import {resolveAvatarModel, styleAvatarActor} from '../office/vendor/avatar-appearance.js';
import {advanceMovement} from './movement-time.mjs';
import {applyRenderProfile} from './render-profile.mjs';

const canvas = document.querySelector('#walk-scene');
const title = document.querySelector('#title'), hint = document.querySelector('#hint');
const walk = document.querySelector('#next'), picks = [...document.querySelectorAll('[data-room]')];
const track = document.querySelector('.track');
const params = new URLSearchParams(location.hash.slice(1));
const from = params.get('from');
const studyAccess=params.get('study')==='open';
let seating=false,seated=false;
const returnDoor = Object.hasOwn(doors, from) ? doors[from] : null;
let destination = null, position = returnDoor ?? entrance, path = [], length = 0, distance = 0;
let goal = null, sent = false, ready = false, failed = false;
const keys = new Set();
let showLine = () => {}, wake = () => {};

const watch = document.querySelector('#watch');
function openStage() {
  goal=null; keys.clear(); guide();
  window.parent.postMessage({type:'moonshot-watch-stage'}, location.origin);
}
watch.onclick=openStage;
function arrive() {
  if (!destination || sent) return;
  sent = true; goal = null; keys.clear();
  hint.textContent = doors[destination].label+'에 들어가고 있어요.';
  window.parent.postMessage({type:'moonshot-lobby-arrived',room:destination,seated:destination==='study'&&seated},location.origin);
}
function guide() {
  const moving = goal !== null || keys.size > 0;
  walk.textContent = failed ? '공간 열기' : moving ? '멈추기' : '따라 걷기';
  if(seated)walk.textContent='공부 시작하기';
  walk.disabled = (!ready && !failed) || seating;
  document.querySelector('#destinations').hidden=seated||seating;
  watch.hidden=seated||seating;
  walk.hidden = !destination;
  track.hidden = !destination || seated || seating;
  hint.textContent = failed ? '3D 대신 선택한 공간으로 바로 들어갈 수 있어요.' :
    !destination ? (returnDoor ? returnDoor.label+' 문 앞이에요. 다음 공간을 골라주세요.' : '갈 곳을 고르면 문 앞까지 파란 길이 이어져요.') :
    seated ? '내 자리에 앉았어요.' : seating ? '자리에 앉고 있어요.' :
    destination==='study' && studyAccess ? (moving?'붉은 아치를 지나 내 자리로 가고 있어요.':'파란 길이 공부방 안 내 자리까지 이어져요.') :
    moving ? '문에 도착하면 공간이 열려요.' : '파란 선을 누르거나 따라 걷기를 선택하세요.';
}
function choose(id) {
  if (sent || seated || seating || !doors[id]) return;
  if (id !== destination) {
    destination=id; path=walkRoute(position,id,studyAccess); length=path.at(-1).length; distance=0;
    goal=null; keys.clear(); showLine(path); canvas.dataset.route=id;document.body.dataset.guiding='true';
    document.body.style.setProperty('--progress','0');
    for (const button of picks) button.setAttribute('aria-pressed',String(button.dataset.room===id));
    title.textContent=doors[id].label+' 가는 길'; guide(); wake();
  }
}
for (const button of picks) {
  button.setAttribute('aria-pressed','false');
  button.onclick=()=>choose(button.dataset.room);
}
walk.onclick=()=>{
  if (!destination || sent) return;
  if (seated || failed) {arrive();return;}
  if(seating)return;
  if (goal !== null || keys.size) {goal=null;keys.clear();}
  else goal=length;
  guide();wake();
};
function fallback() { failed=true; guide(); }

async function start() {
  await import('../office/vendor/office.js');
  const {CampusWalkThree:T,createCampusAssetLoader}=await import('../office/vendor/office3d.js');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  const profile=applyRenderProfile(renderer,canvas);
  renderer.shadowMap.enabled=false;
  const scene=new T.Scene();scene.background=new T.Color(0x050d20);
  scene.add(new T.HemisphereLight(0xfff5df,0x83939e,1.9));
  const sun=new T.DirectionalLight(0xffedcf,2.36);sun.position.set(9,8,5);scene.add(sun);
  const appearance=Object.fromEntries(params);
  appearance.model=Number(appearance.model);
  const avatarModel=resolveAvatarModel(appearance);
  const asset=avatarModel.gender+'-'+'abcdef'[avatarModel.model];
  const [avatar]=await Promise.all([createCampusAssetLoader().loadAsync('/campus/world/office/vendor/assets/kenney/characters/character-'+asset+'.glb'), buildStudyWalkSet(T,scene,()=>wake())]);
  const actor=avatar.scene,bounds=new T.Box3().setFromObject(actor),scale=1.54/(bounds.max.y-bounds.min.y);
  actor.scale.setScalar(scale); scene.add(actor);
  const mixer=new T.AnimationMixer(actor);
  const hips=actor.getObjectByName('torso'),hipWorld=new T.Vector3();
  const action=name=>mixer.clipAction(avatar.animations.find(clip=>clip.name===name));
  const idle=action('idle'),walking=action('walk'),sitting=action('sit'); let current=idle;idle.play();
  const shadow=new T.Mesh(new T.CircleGeometry(.42,20),new T.MeshBasicMaterial({color:0x413830,transparent:true,opacity:.2,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2; scene.add(shadow);
  const lineMaterial=new T.MeshBasicMaterial({color:0x3155e7});
  const segmentGeometry = new T.BoxGeometry(1,1,1);
  styleAvatarActor({obj:actor},appearance,(values,size)=>new T.BufferAttribute(values,size));
  const segment = new T.Object3D();
  let stripe;
  showLine = points => {
    if (stripe) {scene.remove(stripe); stripe.dispose();}
    stripe = new T.InstancedMesh(segmentGeometry,lineMaterial,Math.max(0,points.length-1));
    for (let i=1;i<points.length;i++) {
      const a=points[i-1], b=points[i], dx=b.x-a.x, dz=b.z-a.z;
      segment.position.set((a.x+b.x)/2,.039,(a.z+b.z)/2);
      segment.rotation.y=Math.atan2(dx,dz);
      segment.scale.set(.2,.014,Math.hypot(dx,dz)+.045);
      segment.updateMatrix();stripe.setMatrixAt(i-1,segment.matrix);
    }
    scene.add(stripe);
  };
  if(destination)showLine(path);
  const screen=scene.getObjectByName('live-stage-screen');
  const camera=new T.PerspectiveCamera(51,1,.08,145),ray=new T.Raycaster(),ndc=new T.Vector2();
  const floor=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();
  let seatTime=0;
  const smooth=v=>{const n=Math.min(1,Math.max(0,v));return n*n*(3-2*n);};
  let previous=0,frame=0,settle=.25, lookOffset=0;
  actor.rotation.y=Math.PI;
  function draw(now){
    frame=0;if(document.hidden||failed||sent)return;
    if(previous&&profile.name==='touch'&&now-previous<1000/30-1.5){frame=requestAnimationFrame(draw);return;}
    const dt=previous?Math.min(.25,(now-previous)/1000):0;previous=now;
    const old=position;
    const direction=Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS'));
    if(destination && !seating && !seated){
      advanceMovement(dt,step=>{
        if(direction) distance=Math.max(0,Math.min(length,distance+direction*4*step));
        else if(goal!==null){distance+=Math.sign(goal-distance)*Math.min(Math.abs(goal-distance),4*step);if(Math.abs(goal-distance)<.008){distance=goal;goal=null;guide();}}
      });
      position=pointAt(path,distance);
    }
    const dx=position.x-old.x,dz=position.z-old.z,moving=Math.hypot(dx,dz)>.0001;
    if(moving){const theta=Math.atan2(dx,dz)-actor.rotation.y;actor.rotation.y+=Math.atan2(Math.sin(theta),Math.cos(theta))*Math.min(1,dt*14);}
    if(destination==='study' && studyAccess && distance>=length-.001 && !seating && !seated){
      seating=true;goal=null;keys.clear();title.textContent='공부방 · 내 자리';guide();
    }
    if(seating){
      seatTime+=dt;
      const turn=Math.PI-actor.rotation.y;
      actor.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*Math.min(1,dt*9);
      if(seatTime>=.78){seated=true;seating=false;canvas.dataset.pose='sit';if(stripe)stripe.visible=false;guide();}
    }
    const next=seated||seating?sitting:moving?walking:idle;
    if(current!==next){const fade=next===sitting?.48:.13;current.fadeOut(fade);current=next;current.reset().fadeIn(fade).play();settle=fade+.15;}
    mixer.update(dt);settle-=dt;
    actor.position.set(position.x,-bounds.min.y*scale+.02,position.z);
    if(hips && (seating || seated)){
      // The Kenney sit clip is authored for the ground. Anchor its hips to this chair during the crossfade.
      const hipY=hips.getWorldPosition(hipWorld).y;
      actor.position.y+=(studySeat.cushionTop+.046-hipY)*smooth(seatTime/.48);
    }
    shadow.position.set(position.x,.031,position.z);
    const narrow=camera.aspect<.83;
    // Pull back at entry so the concourse reads as one space; follow the walker at each door.
    const entryView=narrow?Math.max(0,Math.min(1,(position.z-5.8)/5.2)):0;
    const studyWing=smooth((6.1-position.z)/3.1)*smooth((2.0-Math.abs(position.x-doors.study.x))/1.1);
    const inside=smooth((3.55-position.z)/4.5)*studyWing;
    const blend=(a,b,t)=>a+(b-a)*t;
    const cy=blend(narrow?3.35+entryView*.85:2.92,2.14+inside*.42,studyWing);
    const cz=blend(narrow?8+8.2*entryView:6.35,narrow?5.05-inside*1.60:4.85-inside*1.73,studyWing);
    const cameraZ=position.z+cz;
    // The character crosses the opening several paces before the camera. Keep the lens in
    // the aisle until it clears the inner red jamb, then reveal the chair from the side.
    const clearOfArch=smooth((2.70-cameraZ)/1.12);
    const cx=blend(position.x*.88+(narrow?.12:1.72),position.x-.11+inside*clearOfArch*(narrow?1.48:1.86),studyWing);
    camera.position.set(cx,cy,cameraZ);
    const targetOffset=destination?(doors[destination].x-position.x)*(narrow?.7:.3):0;
    lookOffset+=(targetOffset-lookOffset)*Math.min(1,dt*8);
    camera.lookAt(blend(position.x*.84+lookOffset+entryView*1.39,studySeat.x-.04-inside*.5,studyWing),
      blend(narrow?1.25+entryView*.58:1.96,2.05-inside*.75,studyWing),
      position.z-blend(6.3,2.55-inside*1.80,studyWing));
    renderer.render(scene,camera);
    canvas.dataset.playerX=position.x.toFixed(2);canvas.dataset.playerZ=position.z.toFixed(2);
    if(destination){document.body.style.setProperty('--progress',String(length?distance/length:1));if(distance>=length-.001 && !seating && !seated){arrive();return;}}
    if(seating||moving||keys.size||goal!==null||settle>0||Math.abs(targetOffset-lookOffset)>.015)frame=requestAnimationFrame(draw);else previous=0;
  }
  wake=()=>{if(!frame&&!sent&&!failed&&!document.hidden){if(!previous)previous=performance.now();frame=requestAnimationFrame(draw);}};
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<.83?71:54;camera.updateProjectionMatrix();wake();}
  function stop(){keys.clear();goal=null;previous=0;settle=.2;guide();wake();}
  document.addEventListener('keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||!destination||sent||seated||seating)return;
    if(['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code)){e.preventDefault();keys.add(e.code);goal=null;guide();wake();}
    if(e.target===canvas&&['Enter','Space'].includes(e.code)&&!e.repeat){e.preventDefault();walk.click();}
  });
  document.addEventListener('keyup',e=>{if(keys.delete(e.code)){guide();wake();}});
  window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;stop();}else wake();});
  let down=null;
  canvas.addEventListener('pointerdown',e=>{down={id:e.pointerId,x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointercancel',()=>{down=null;});
  canvas.addEventListener('pointerup',e=>{
    if(seated||seating||sent||!down||e.pointerId!==down.id||Math.hypot(e.clientX-down.x,e.clientY-down.y)>10)return;
    down=null;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    ray.setFromCamera(ndc,camera);
    for(const [id,door] of Object.entries(doors)){
      if(ray.ray.distanceToPoint(new T.Vector3(door.x,2.15,door.z-.6))<1.42){choose(id);goal=length;guide();wake();return;}
    }
    if(screen && ray.intersectObject(screen).length){openStage();return;}
    if(!destination||!ray.ray.intersectPlane(floor,hit))return;
    goal=nearestPoint(path,hit.x,hit.z).length;canvas.focus({preventScroll:true});guide();wake();
  });
  window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fallback();});
  resize();cancelAnimationFrame(frame);previous=0;draw(performance.now());ready=true;guide();document.body.dataset.ready='true';
}
start().catch(error=>{console.error('Campus lobby could not start',error);fallback();});
