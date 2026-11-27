import {buildStudyWalkSet} from './study-walk-set.mjs';
import {doors, entrance, nearestPoint, pointAt, routeFrom} from './lobby-paths.mjs';
import {resolveAvatarModel, styleAvatarActor} from '../office/vendor/avatar-appearance.js';
import {advanceMovement} from './movement-time.mjs';
import {applyRenderProfile} from './render-profile.mjs';

const canvas = document.querySelector('#walk-scene');
const title = document.querySelector('#title'), hint = document.querySelector('#hint');
const walk = document.querySelector('#next'), picks = [...document.querySelectorAll('[data-room]')];
const track = document.querySelector('.track');
let destination = null, position = entrance, path = [], length = 0, distance = 0;
let goal = null, sent = false, ready = false, failed = false;
const keys = new Set();
let showLine = () => {}, wake = () => {};

function arrive() {
  if (!destination || sent) return;
  sent = true; goal = null; keys.clear();
  hint.textContent = doors[destination].label+'에 들어가고 있어요.';
  window.parent.postMessage({type:'moonshot-lobby-arrived',room:destination},location.origin);
}
function guide() {
  const moving = goal !== null || keys.size > 0;
  walk.textContent = failed ? '공간 열기' : moving ? '멈추기' : '따라 걷기';
  walk.disabled = !ready && !failed;
  walk.hidden = !destination;
  track.hidden = !destination;
  hint.textContent = failed ? '3D 대신 선택한 공간으로 바로 들어갈 수 있어요.' :
    !destination ? '공간을 고르면 바닥에 파란 길이 나타나요.' :
    moving ? '문에 도착하면 공간이 열려요.' : '파란 선을 누르거나 따라 걷기를 선택하세요.';
}
function choose(id) {
  if (sent || !doors[id]) return;
  if (id !== destination) {
    destination=id; path=routeFrom(position,id); length=path.at(-1).length; distance=0;
    goal=null; keys.clear(); showLine(path); canvas.dataset.route=id;
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
  if (failed) {arrive();return;}
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
  const sun=new T.DirectionalLight(0xffedcf,2.15);sun.position.set(6,10,4);scene.add(sun);
  const appearance=Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  appearance.model=Number(appearance.model);
  const avatarModel=resolveAvatarModel(appearance);
  const asset=avatarModel.gender+'-'+'abcdef'[avatarModel.model];
  const [avatar]=await Promise.all([createCampusAssetLoader().loadAsync('/campus/world/office/vendor/assets/kenney/characters/character-'+asset+'.glb'), buildStudyWalkSet(T,scene)]);
  const actor=avatar.scene,bounds=new T.Box3().setFromObject(actor),scale=1.54/(bounds.max.y-bounds.min.y);
  actor.scale.setScalar(scale); scene.add(actor);
  const mixer=new T.AnimationMixer(actor);
  const action=name=>mixer.clipAction(avatar.animations.find(clip=>clip.name===name));
  const idle=action('idle'),walking=action('walk'); let current=idle;idle.play();
  const shadow=new T.Mesh(new T.CircleGeometry(.42,20),new T.MeshBasicMaterial({color:0x413830,transparent:true,opacity:.2,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2; scene.add(shadow);
  const lineMaterial=new T.MeshBasicMaterial({color:0x2852c8});
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
  const camera=new T.PerspectiveCamera(51,1,.08,145),ray=new T.Raycaster(),ndc=new T.Vector2();
  const floor=new T.Plane(new T.Vector3(0,1,0),0),hit=new T.Vector3();
  let previous=0,frame=0,settle=.25, lookOffset=0;
  actor.rotation.y=Math.PI;
  function draw(now){
    frame=0;if(document.hidden||failed||sent)return;
    if(previous&&profile.name==='touch'&&now-previous<1000/30-1.5){frame=requestAnimationFrame(draw);return;}
    const dt=previous?Math.min(.25,(now-previous)/1000):0;previous=now;
    const old=position;
    const direction=Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS'));
    if(destination){
      advanceMovement(dt,step=>{
        if(direction) distance=Math.max(0,Math.min(length,distance+direction*4*step));
        else if(goal!==null){distance+=Math.sign(goal-distance)*Math.min(Math.abs(goal-distance),4*step);if(Math.abs(goal-distance)<.008){distance=goal;goal=null;guide();}}
      });
      position=pointAt(path,distance);
    }
    const dx=position.x-old.x,dz=position.z-old.z,moving=Math.hypot(dx,dz)>.0001;
    if(moving){const theta=Math.atan2(dx,dz)-actor.rotation.y;actor.rotation.y+=Math.atan2(Math.sin(theta),Math.cos(theta))*Math.min(1,dt*14);}
    const next=moving?walking:idle;if(current!==next){current.fadeOut(.13);current=next;current.reset().fadeIn(.13).play();settle=.3;}
    mixer.update(dt);settle-=dt;
    actor.position.set(position.x,-bounds.min.y*scale+.02,position.z);
    shadow.position.set(position.x,.031,position.z);
    const narrow=camera.aspect<.83;
    // Pull back at entry so the concourse reads as one space; follow the walker at each door.
    camera.position.set(position.x+(narrow?.45:1.4),narrow?3.3:2.95,position.z+(narrow?7.2:6.55));
    const targetOffset=destination?(doors[destination].x-position.x)*(narrow?.7:.3):0;
    lookOffset+=(targetOffset-lookOffset)*Math.min(1,dt*8);
    camera.lookAt(position.x-(narrow?.27:1.0)+lookOffset,1.65,position.z-4.7);
    renderer.render(scene,camera);
    canvas.dataset.playerX=position.x.toFixed(2);canvas.dataset.playerZ=position.z.toFixed(2);
    if(destination){document.body.style.setProperty('--progress',String(length?distance/length:1));if(distance>=length-.001){arrive();return;}}
    if(moving||keys.size||goal!==null||settle>0||Math.abs(targetOffset-lookOffset)>.015)frame=requestAnimationFrame(draw);else previous=0;
  }
  wake=()=>{if(!frame&&!sent&&!failed&&!document.hidden){if(!previous)previous=performance.now();frame=requestAnimationFrame(draw);}};
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<.83?71:54;camera.updateProjectionMatrix();wake();}
  function stop(){keys.clear();goal=null;previous=0;settle=.2;guide();wake();}
  document.addEventListener('keydown',e=>{
    if(e.metaKey||e.ctrlKey||e.altKey||!destination||sent)return;
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
    if(!down||e.pointerId!==down.id||Math.hypot(e.clientX-down.x,e.clientY-down.y)>10)return;
    down=null;const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    ray.setFromCamera(ndc,camera);
    for(const [id,door] of Object.entries(doors)){
      if(ray.ray.distanceToPoint(new T.Vector3(door.x,3.05,door.z))<.79){choose(id);goal=length;guide();wake();return;}
    }
    if(!destination||!ray.ray.intersectPlane(floor,hit))return;
    goal=nearestPoint(path,hit.x,hit.z).length;canvas.focus({preventScroll:true});guide();wake();
  });
  window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);fallback();});
  resize();cancelAnimationFrame(frame);previous=0;draw(performance.now());ready=true;guide();document.body.dataset.ready='true';
}
start().catch(error=>{console.error('Campus lobby could not start',error);fallback();});
