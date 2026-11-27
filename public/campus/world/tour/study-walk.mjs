import {buildStudyWalkSet, end, pointAt, projectedDistance, seat} from './study-walk-set.mjs';
import {advanceMovement} from './movement-time.mjs';
import {applyRenderProfile} from './render-profile.mjs';

const canvas=document.querySelector('#walk-scene'), button=document.querySelector('#next');
const title=document.querySelector('#title'), hint=document.querySelector('#hint'), place=document.querySelector('#place');
const restart=document.querySelector('#restart');

async function start(){
  await import('../office/vendor/office.js');
  const {CampusWalkThree:T,createCampusAssetLoader}=await import('../office/vendor/office3d.js');
  const avatarPromise=createCampusAssetLoader().loadAsync('/campus/world/office/vendor/assets/kenney/characters/character-female-c.glb');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  const profile=applyRenderProfile(renderer,canvas);
  renderer.shadowMap.enabled=false;
  renderer.outputColorSpace=T.SRGBColorSpace;
  const scene=new T.Scene();
  scene.background=new T.Color(0x050d20);
  scene.add(new T.HemisphereLight(0xfff5df,0x83939e,1.9));
  const sun=new T.DirectionalLight(0xffedcf,2.15);sun.position.set(6,10,4);scene.add(sun);
  const [avatar]=await Promise.all([avatarPromise,buildStudyWalkSet(T,scene)]);
  const actor=avatar.scene;
  const bounds=new T.Box3().setFromObject(actor);
  const scale=1.54/(bounds.max.y-bounds.min.y);
  actor.scale.setScalar(scale);scene.add(actor);
  const mixer=new T.AnimationMixer(actor);
  const actions=Object.fromEntries(['idle','walk','sit'].map(name=>[name,mixer.clipAction(avatar.animations.find(c=>c.name===name))]));
  let action=actions.idle;action.play();
  const shadow=new T.Mesh(new T.CircleGeometry(.43,20),new T.MeshBasicMaterial({color:0x413830,transparent:true,opacity:.2,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const camera=new T.PerspectiveCamera(49,1,.08,145), look=new T.Vector3(), desired=new T.Vector3(), eye=new T.Vector3();
  const ray=new T.Raycaster(), ndc=new T.Vector2(), floor=new T.Plane(new T.Vector3(0,1,0),0), hit=new T.Vector3();
  const keys=new Set(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let distance=0, goal=null, seated=false, settle=0, viewBlend=0, previous=0, frame=0, phase='', first=true, lost=false;
  const insideAt=projectedDistance(-1.6,-.45);
  function stage(){return seated?'seated':distance>=end-.003&&goal===null?'seat':distance>=insideAt?'study':'entry';}
  function keyDirection(){return Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS'));}
  function syncUI(){
    const state=stage(), moving=goal!==null||keyDirection()!==0;
    const tag=state+':'+moving;
    if(phase===tag)return;phase=tag;
    const content={
      entry:['달 풍경 입구','공부방으로 가는 길','파란 선을 따라 공부방 문으로 걸어가세요.','공부방으로 걷기'],
      study:['문샷 공부방','창가에 내 자리가 있어요','펼쳐 둔 노트 앞, 붉은 등받이가 내 자리예요.','내 자리로 걷기'],
      seat:['문샷 공부방','내 자리에 도착했어요','의자를 누르거나 아래 버튼으로 앉으세요.','내 자리에 앉기'],
      seated:['문샷 공부방','내 자리에 앉았어요','다시 걷고 싶다면 자리에서 일어나세요.','일어나기'],
    }[state];
    place.textContent=content[0];title.textContent=content[1];hint.textContent=content[2];
    button.textContent=moving&&state!=='seated'?'멈추기':content[3];button.disabled=false;
    restart.hidden=state==='entry'&&!moving&&distance===0;
    canvas.dataset.stage=state;
  }
  function changeAction(next){if(action===next)return;action.fadeOut(.14);action=next;next.reset().fadeIn(.14).play();settle=.45;}
  function draw(now){
    frame=0;if(lost||document.hidden)return;
    const interval=profile.name==='touch'?1000/30:0;
    if(previous&&now-previous<interval-1.5){frame=requestAnimationFrame(draw);return;}
    const dt=previous?Math.max(0,Math.min(.25,(now-previous)/1000)):0;
    previous=now;
    const direction=keyDirection(), old=distance;
    if(!seated){
      advanceMovement(dt,step=>{
        if(direction)distance=Math.max(0,Math.min(end,distance+direction*4*step));
        else if(goal!==null){
          const delta=goal-distance;
          distance+=Math.sign(delta)*Math.min(Math.abs(delta),4*step);
          if(Math.abs(goal-distance)<.015){distance=goal;goal=null;}
        }
      });
    }
    const moving=Math.abs(old-distance)>.0001, p=pointAt(distance);
    const ahead=pointAt(Math.min(end,distance+.12)), back=pointAt(Math.max(0,distance-.12));
    let heading=Math.atan2(ahead.x-back.x,ahead.z-back.z);
    if(moving&&old>distance)heading+=Math.PI;
    if(seated)heading=Math.PI;
    if(moving||seated||first)actor.rotation.y+=Math.atan2(Math.sin(heading-actor.rotation.y),Math.cos(heading-actor.rotation.y))*(first?1:Math.min(1,dt*13));
    changeAction(seated?actions.sit:moving?actions.walk:actions.idle);
    mixer.update(dt);settle=Math.max(0,settle-dt);
    viewBlend+=(Number(seated)-viewBlend)*(reduced.matches?1:Math.min(1,dt*7));
    const x=p.x+(seat.x-p.x)*viewBlend,z=p.z+(seat.z-p.z)*viewBlend;
    actor.position.set(x,-bounds.min.y*scale+.02+.49*viewBlend,z);
    shadow.position.set(x,.035,z);shadow.visible=!seated;
    const portrait=camera.aspect<.83;
    const inside=Math.max(0,Math.min(1,(2.6-p.z)/5));
    // Centre the path as the camera crosses the actual doorway; no room swap or loading screen.
    eye.set(x+(portrait?.2:1.55)*(1-inside)+viewBlend*3.6,2.45+.2*inside+.18*viewBlend,z+(portrait?6.2:5.65)-2.1*viewBlend);
    desired.set(x-(portrait?.92:1.45)*(1-inside)-.12*viewBlend,1.85-.35*inside-.58*viewBlend,z-(portrait?4:5.3)+2.95*viewBlend);
    camera.position.copy(eye);look.copy(desired);camera.lookAt(look);
    renderer.render(scene,camera);
    canvas.dataset.playerX=x.toFixed(2);canvas.dataset.playerZ=z.toFixed(2);
    canvas.dataset.pose=seated?'sit':moving?'walk':'stand';
    canvas.dataset.drawCalls=String(renderer.info.render.calls);
    document.body.style.setProperty('--progress',(distance/end).toFixed(3));
    syncUI();first=false;
    if(moving||goal!==null||direction||settle>0||Math.abs(Number(seated)-viewBlend)>.001)frame=requestAnimationFrame(draw);
    else previous=0;
  }
  function wake(){if(!frame&&!document.hidden&&!lost){if(!previous)previous=performance.now();frame=requestAnimationFrame(draw);}}
  function reset(){distance=0;goal=null;seated=false;viewBlend=0;keys.clear();first=true;settle=.3;phase='';syncUI();wake();}
  function advance(){
    if(goal!==null||keyDirection()){goal=null;keys.clear();}
    else if(seated){seated=false;settle=.5;}
    else if(distance>=end-.015){seated=true;settle=.7;}
    else goal=distance<insideAt-.02?Math.min(end,insideAt+.05):end;
    syncUI();wake();
  }
  button.onclick=advance;restart.onclick=reset;
  document.addEventListener('keydown',e=>{
    if(e.altKey||e.metaKey||e.ctrlKey)return;
    if(['ArrowUp','ArrowDown','KeyW','KeyS'].includes(e.code)){
      e.preventDefault();if(seated)return;keys.add(e.code);goal=null;syncUI();wake();
    }else if((e.code==='Space'||e.code==='Enter')&&e.target===canvas){e.preventDefault();if(!e.repeat)advance();}
  });
  document.addEventListener('keyup',e=>{if(keys.delete(e.code)){syncUI();wake();}});
  function stop(){goal=null;keys.clear();previous=0;settle=.24;syncUI();wake();}
  window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;stop();}else wake();});
  let down;
  canvas.addEventListener('pointerdown',e=>{down={id:e.pointerId,x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointercancel',()=>{down=null;});
  canvas.addEventListener('pointerup',e=>{
    if(!down||down.id!==e.pointerId||Math.hypot(e.clientX-down.x,e.clientY-down.y)>10)return;
    down=null;if(seated)return;
    const r=canvas.getBoundingClientRect();
    ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
    ray.setFromCamera(ndc,camera);
    const seatHit=ray.ray.distanceToPoint(new T.Vector3(seat.x,.65,seat.z))<.85;
    if(seatHit&&distance>=end-.015){advance();return;}
    if(!ray.ray.intersectPlane(floor,hit))return;
    goal=seatHit?end:projectedDistance(hit.x,hit.z);
    if(Math.abs(distance-goal)<.05)goal=null;
    canvas.focus({preventScroll:true});syncUI();wake();
  });
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
    camera.fov=camera.aspect<.83?68:51;camera.updateProjectionMatrix();wake();
  }
  window.addEventListener('resize',resize);resize();
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(frame);failure();});
  syncUI();cancelAnimationFrame(frame);previous=0;draw(performance.now());document.body.dataset.ready='true';
}
function failure(){
  document.body.dataset.ready='false';title.textContent='공간을 다시 열어주세요';hint.textContent='3D 화면을 준비하지 못했어요.';
  button.disabled=false;button.textContent='다시 열기';button.onclick=()=>location.reload();
}
start().catch(error=>{console.error('Study walk could not start',error);failure();});
