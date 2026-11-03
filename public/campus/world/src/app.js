// EDU space renderer, isolated from the unchanged Yoonik handoff. Service state belongs to the authenticated host.
(()=>{
const root=document.getElementById('moonshot-workmates'),panel=root.querySelector('#ms-panel'),canvas=root.querySelector('#ms-canvas');
const $=s=>root.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bridgeToken=new URLSearchParams(location.hash.slice(1)).get('bridge');
let bridgeReady=false,lastPosition=0,bridgePeers=[],engine=null;
function emit(type,payload={}){if(bridgeReady&&parent!==window)parent.postMessage({source:'moonshot-world',token:bridgeToken,type,payload},location.origin);}
const state={gender:'male',name:'문샷 동료',coat:'#527086',accessory:'none',panel:'welcome',focused:false,quiet:false,zoom:false,cameraMode:'third',sound:false,volume:25};
const mission={launching:false,type:null,step:0};
const player={x:12,y:8.8,gender:state.gender,coat:state.coat,name:()=>state.name,mine:true,sitting:false};
const mates=[];
let target=null,arrival=null,waveUntil=0,bubbleUntil=0,bubble='';
function status(text){$('#ms-status').textContent=text;}
function icons(){window.lucide?.createIcons({attrs:{width:17,height:17}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',icons,{once:true});else icons();
function update(){$('#ms-me').textContent=(state.verifiedLevel?'레벨 '+state.verifiedLevel+' ':'')+state.name;$('#ms-growth').textContent=state.verifiedXp!==undefined?state.verifiedXp+' 성장 점수':'내 속도로 한 걸음';player.gender=state.gender;player.coat=state.coat;player.accessory=state.accessory;}
function draw(){engine?.render();}function wake(){engine?.wake();}
function pauseFocus(){state.focused=false;}
function open(which){const zone=which==='presentation'?'board':which==='curriculum'?'mission':which;if(state.closedZones?.includes(zone)){status('이 공간은 잠시 쉬고 있어요. 다른 공간을 골라주세요.');return;}if(which==='places'){state.zoom=false;state.rocketInspect=false;which='welcome';}if(!['welcome','sounds'].includes(which)){emit('navigate',{section:which});which='welcome';}state.panel=which;renderPanel();draw();}
function sitAtDesk(){emit('seat');}
function walk(x,y,fn){$('#ms-seat-invite').hidden=true;player.sitting=false;if(state.zoom)engine?.routeCamera(x,y);target={x,y};arrival=fn||null;status('걸어가는 중…');wake();}
function say(text){bubble=text;bubbleUntil=performance.now()+3500;wake();}
function greet(){emit('wave');waveUntil=performance.now()+2200;say('반가워요!');status('손을 흔들었어요.');wake();}
let audioCtx=null,windGain=null;
async function soundOn(on){state.sound=on;if(on){try{if(!audioCtx){audioCtx=new AudioContext();const b=audioCtx.createBuffer(1,audioCtx.sampleRate*3,audioCtx.sampleRate),data=b.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.04-.02)/1.02;data[i]=last*3;}const noise=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter();noise.buffer=b;noise.loop=true;filter.type='lowpass';filter.frequency.value=700;windGain=audioCtx.createGain();noise.connect(filter);filter.connect(windGain);windGain.connect(audioCtx.destination);noise.start();}await audioCtx.resume();windGain.gain.setTargetAtTime(state.volume/350,audioCtx.currentTime,.2);}catch{state.sound=false;status('소리를 재생할 수 없어요.');}}else if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.15);renderPanel();}
function renderPanel(){panel.hidden=state.panel!=='sounds';root.classList.toggle('has-panel',state.panel==='sounds');if(panel.hidden){panel.replaceChildren();return;}panel.innerHTML=`<button class="ms-close" data-action="welcome" aria-label="공간으로 돌아가기">×</button><h2>나만 듣는 바람 소리</h2><p>직접 합성한 환경음이에요. 원하는 때만 켜세요.</p><div class="row"><button data-action="wind">바람 켜기</button><button data-action="mute">소리 끄기</button></div><label>소리 크기<input id="ms-volume" type="range" min="0" max="100" value="${state.volume}"></label>`;}
root.addEventListener('input',e=>{if(e.target.id==='ms-volume'){state.volume=+e.target.value;if(windGain&&state.sound)windGain.gain.setTargetAtTime(state.volume/350,audioCtx.currentTime,.1);}});
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=b.dataset.action;if(b.dataset.space){const z=spacePoints.find(p=>p.id===b.dataset.space);if(z&&!state.closedZones?.includes(z.id)){open('welcome');walk(z.x,z.z,()=>z.id==='desk'?sitAtDesk():z.id==='terrace'?status('문샷 테라스에서 잠깐 쉬어가세요.'):open(z.id==='mission'?'curriculum':z.id));}return;}
 if(a==='places'||a==='overview')open('places');else if(a==='firstperson'||a==='thirdperson'){state.rocketInspect=false;state.cameraMode=a==='firstperson'?'first':'third';state.zoom=true;open('welcome');wake();}
 else if(a==='rocketview'){state.rocketInspect=true;state.zoom=false;open('welcome');wake();}
 else if(a==='exhibit'&&!state.closedZones?.includes('board'))emit('navigate',{section:'exhibit:'+b.dataset.post});else if(a==='presentation')open('presentation');else if(a==='sounds'||a==='welcome')open(a);else if(a==='wind')void soundOn(true);else if(a==='mute')void soundOn(false);else if(a==='wave')greet();else if(a==='desk')emit('seat');else if(a==='profile')emit('navigate',{section:'profile'});else if(a==='achievements'||a==='missionmap')emit('navigate',{section:'missionmap'});
});
const spacePoints=[
{id:'desk',name:'문샷 집중실',sub:'실행과 몰입',x:3.5,z:7.15,px:4.4,pz:3.8,dy:-26},
{id:'mission',name:'문샷 미션실',sub:'일차별 과제',x:8.5,z:10.3,px:5.2,pz:11,dy:10},
{id:'board',name:'문샷 의견 나눔방',sub:'동료의 시선',x:19.6,z:6,px:20,pz:5.2,dy:-12},
{id:'chat',name:'문샷 라운지',sub:'대화와 연결',x:11,z:10.3,px:12,pz:14.7,dy:20},
{id:'terrace',name:'문샷 테라스',sub:'잠깐의 여백',x:20.7,z:17.5,px:20.7,pz:17.5,dy:26},
{id:'launch',name:'문샷 발사대',sub:'완료와 다음 도약',x:15.7,z:9.5,px:36,pz:-14,dy:-112}
];
const keys=new Set();
function movementKey(event){
  const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',ArrowUp:'arrowup',ArrowLeft:'arrowleft',ArrowDown:'arrowdown',ArrowRight:'arrowright'};
  if(physical[event.code])return physical[event.code];
  const typed=String(event.key||'').toLowerCase();
  if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(typed))return typed;
  return null;
}
function typingTarget(el){return !!el?.closest('input,textarea,select,[contenteditable="true"]');}
document.addEventListener('keydown',e=>{
  if(typingTarget(e.target)||e.metaKey||e.ctrlKey||e.altKey||state.panel==='entry'||mission.launching)return;
  const k=movementKey(e);
  if(k){
    e.preventDefault();if(state.focused){status('이동하려면 먼저 쉬기를 눌러주세요.');return;}keys.add(k);open('welcome');$('#ms-seat-invite').hidden=true;state.zoom=true;target=null;arrival=null;player.sitting=false;pauseFocus();wake();
  }
  if(!state.focused&&(e.code==='KeyE'||e.key.toLowerCase()==='e')&&!e.repeat){e.preventDefault();engine?.interact();}
  if(e.key==='Escape'){open('welcome');}
});
document.addEventListener('keyup',e=>{const k=movementKey(e);if(k)keys.delete(k);wake();});
// Never keep walking when focus enters a message field or leaves the preview.
document.addEventListener('focusin',e=>{if(typingTarget(e.target))keys.clear();});
window.addEventListener('blur',()=>keys.clear());
root.querySelectorAll('[data-move]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(state.focused||state.panel==='entry'||mission.launching)return;b.setPointerCapture(e.pointerId);keys.add(b.dataset.move);$('#ms-seat-invite').hidden=true;state.zoom=true;target=null;arrival=null;player.sitting=false;pauseFocus();wake();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>keys.delete(b.dataset.move)));
});
root.querySelector('[data-action="interact"]').addEventListener('click',()=>engine?.interact());
async function boot(){
 const [T,{createRenderQuality}]=await Promise.all([import('../vendor/three.module.js'),import('./render-quality.mjs')]);
 const scene=new T.Scene();scene.background=new T.Color('#050d1c');
 const renderer=new T.WebGLRenderer({canvas,antialias:!matchMedia('(max-width: 700px)').matches,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:false});
 const quality=createRenderQuality(window.devicePixelRatio||1,matchMedia('(max-width: 700px)').matches);let appliedQuality=quality.settings(),shadowPaintAt=-Infinity;
 renderer.setPixelRatio(appliedQuality.pixelRatio);canvas.dataset.renderQuality=appliedQuality.name;canvas.dataset.renderPixelRatio=String(appliedQuality.pixelRatio);renderer.shadowMap.enabled=appliedQuality.shadows;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const camera=new T.PerspectiveCamera(50,1,.1,500);camera.position.set(15,14,19);camera.lookAt(5,.3,5);
 scene.add(new T.HemisphereLight('#d5dfe6','#152231',1.5));
 const sun=new T.DirectionalLight('#eff4fa',3);sun.position.set(-12,15,-18);sun.target.position.set(12,0,10);scene.add(sun.target);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-27,right:27,top:27,bottom:-27,near:.5,far:65});sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
 const fill=new T.DirectionalLight('#b6cde0',1.1);fill.position.set(12,4,18);scene.add(fill);
 const materials=new Map();function mat(color){if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.9,metalness:0}));return materials.get(color);}
 function mesh(geo,color,parent,x=0,y=0,z=0){const m=new T.Mesh(geo,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function cube(parent,x,y,z,w,h,d,color){return mesh(new T.BoxGeometry(w,h,d),color,parent,x,y,z);}
 function sphere(parent,x,y,z,rx,ry,rz,color){const m=mesh(new T.SphereGeometry(1,16,12),color,parent,x,y,z);m.scale.set(rx,ry,rz);return m;}
 function cyl(parent,x,y,z,r,h,color,rt=r){return mesh(new T.CylinderGeometry(rt,r,h,16),color,parent,x,y,z);}
 function capsule(parent,x,y,z,r,len,color){return mesh(new T.CapsuleGeometry(r,len,4,10),color,parent,x,y,z);}
 function beam(parent,a,b,r,color){const from=new T.Vector3(...a),to=new T.Vector3(...b),v=to.clone().sub(from);const m=cyl(parent,0,0,0,r,v.length(),color);m.position.copy(from.add(to).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;}
 const items=[],obstacles=[],seatObjects=[],studyDesks=[];let myDeskIndex=0;
 function obstacle(x,z,w,d){obstacles.push({x:x-w/2-.18,z:z-d/2-.18,w:w+.36,d:d+.36});}
 function textPlane(text,w,h,color='#58654f',bg='#f5f1e7',size=40){const c=document.createElement('canvas');c.width=512;c.height=128;const q=c.getContext('2d');if(bg){q.fillStyle=bg;q.fillRect(0,0,512,128);}q.fillStyle=color;q.font=`600 ${size}px "Apple SD Gothic Neo",system-ui`;q.textAlign='center';q.textBaseline='middle';q.fillText(text,256,64,490);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:!bg,depthWrite:!!bg,side:T.DoubleSide}));return m;}
 function plant(x,z,s=1){const g=new T.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);cyl(g,0,.23,0,.24,.45,'#b8a488',.31);cyl(g,0,.46,0,.27,.03,'#786b4d');beam(g,[0,.44,0],[.01,1.65,0],.024,'#64764d');for(let i=0;i<8;i++){const a=i*2.35,h=.65+i*.12,ex=Math.cos(a)*.28,ez=Math.sin(a)*.28;beam(g,[0,h-.1,0],[ex,h,ez],.014,'#66764d');const leaf=sphere(g,ex,h,ez,.25,.07,.14,i%2?'#7d9467':'#637e50');leaf.rotation.z=Math.cos(a)*.4;leaf.rotation.y=a;}}
 // Open-air Moonshot campus: connected destinations with generous, walkable space.
 function rounded(parent,x,y,z,w,h,d,r,color){
   r=Math.min(r,w/3,h/3,d/3);const sw=w-2*r,sh=h-2*r,cr=Math.min(r,sw/4,sh/4);const q=new T.Shape();
   q.moveTo(-sw/2+cr,-sh/2);q.lineTo(sw/2-cr,-sh/2);q.quadraticCurveTo(sw/2,-sh/2,sw/2,-sh/2+cr);q.lineTo(sw/2,sh/2-cr);q.quadraticCurveTo(sw/2,sh/2,sw/2-cr,sh/2);q.lineTo(-sw/2+cr,sh/2);q.quadraticCurveTo(-sw/2,sh/2,-sw/2,sh/2-cr);q.lineTo(-sw/2,-sh/2+cr);q.quadraticCurveTo(-sw/2,-sh/2,-sw/2+cr,-sh/2);
   const geo=new T.ExtrudeGeometry(q,{depth:d-2*r,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:r,bevelThickness:r,curveSegments:4});geo.translate(0,0,-d/2+r);return mesh(geo,color,parent,x,y,z);
 }
 function plaque(text,x,y,z,w,h,color='#34343a',bg=null,size=36,angle=0){const p=textPlane(text,w,h,color,bg,size);p.position.set(x,y,z);p.rotation.y=angle;scene.add(p);return p;}
 function flatLabel(text,x,z,w,h,color='#a0dcf7'){const p=textPlane(text,w,h,color,null,36);p.rotation.x=-Math.PI/2;p.position.set(x,.092,z);scene.add(p);return p;}
// A spherical moon and static star field surround the transparent observation deck.
let skySeed=7821;const skyRand=()=>{skySeed=skySeed*16807%2147483647;return(skySeed-1)/2147483646;};
const moonMap=await new T.TextureLoader().loadAsync(new URL('../assets/moon-nasa-lroc-2k.jpg',import.meta.url).href);moonMap.colorSpace=T.SRGBColorSpace;const lunarVista=new T.Group();scene.add(lunarVista);
const moon=new T.Mesh(new T.SphereGeometry(31,96,64),new T.MeshStandardMaterial({map:moonMap,bumpMap:moonMap,bumpScale:.08,roughness:1,metalness:0}));moon.position.set(-18,7,-110);moon.rotation.y=-1.5;lunarVista.add(moon);
const starPoints=[],starColors=[];for(let i=0;i<1500;i++){const theta=skyRand()*Math.PI*2,u=skyRand()*2-1,r=180+skyRand()*100,v=Math.sqrt(1-u*u);starPoints.push(12+Math.cos(theta)*v*r,u*r,10+Math.sin(theta)*v*r);const k=.45+skyRand()*.55;starColors.push(k*.88,k*.95,k);}
const starGeo=new T.BufferGeometry();starGeo.setAttribute('position',new T.Float32BufferAttribute(starPoints,3));starGeo.setAttribute('color',new T.Float32BufferAttribute(starColors,3));const stars=new T.Points(starGeo,new T.PointsMaterial({vertexColors:true,size:.48,sizeAttenuation:true,transparent:true,opacity:.9}));lunarVista.add(stars);
const lunarSurround=new T.Group();scene.add(lunarSurround);

let randSeed=751;const sr=()=>{randSeed=randSeed*16807%2147483647;return(randSeed-1)/2147483646;};
const deckTextureCanvas=document.createElement('canvas');deckTextureCanvas.width=1024;deckTextureCanvas.height=1024;
const dq=deckTextureCanvas.getContext('2d');dq.fillStyle='#343c46';dq.fillRect(0,0,1024,1024);
for(let i=0;i<56000;i++){const v=40+Math.floor(sr()*24);dq.fillStyle=`rgba(${v},${v+6},${v+12},.23)`;dq.fillRect(sr()*1024,sr()*1024,1+sr()*3,1);}
dq.strokeStyle='#1e252d';dq.lineWidth=4;dq.strokeRect(3,3,1018,1018);dq.strokeStyle='#626d76';dq.lineWidth=1;dq.strokeRect(7,7,1010,1010);
for(const x of [30,994])for(const y of [30,994]){dq.fillStyle='#8b969e';dq.beginPath();dq.arc(x,y,6,0,7);dq.fill();dq.fillStyle='#20262d';dq.fillRect(x-3,y-1,6,2);}
const deckTexture=new T.CanvasTexture(deckTextureCanvas);deckTexture.colorSpace=T.SRGBColorSpace;deckTexture.wrapS=deckTexture.wrapT=T.RepeatWrapping;deckTexture.repeat.set(8,7);
const deckMaterial=new T.MeshStandardMaterial({map:deckTexture,bumpMap:deckTexture,bumpScale:.025,roughness:.58,metalness:.48});
const floor=new T.Mesh(new T.BoxGeometry(25,.32,23),deckMaterial);floor.position.set(12,-.2,10.5);floor.receiveShadow=true;scene.add(floor);
rounded(scene,12,-.6,10.5,25.5,.6,23.6,.07,'#1d2834');
const shell=new T.Group(),upperShell=new T.Group();scene.add(shell,upperShell);
const ivory='#b9c1c8',edge='#293847',steel='#617485',dark='#111e2c';
mat(ivory).metalness=.35;mat(ivory).roughness=.48;mat(steel).metalness=.72;mat(steel).roughness=.32;
function strip(parent,x,y,z,w,h,d,color='#b8dfff'){const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial({color}));m.position.set(x,y,z);parent.add(m);return m;}
function bolt(parent,x,y,z){const b=cyl(parent,x,y,z,.035,.024,steel);b.rotation.x=Math.PI/2;}
// Slim pressure ribs and transparent observation panels in every direction.
const glazing=new T.MeshPhysicalMaterial({color:'#aacddd',transparent:true,opacity:.035,roughness:.1,metalness:.05,side:T.DoubleSide,depthWrite:false});
function windowPane(w,h,x,y,z,ry=0,rx=0){const m=new T.Mesh(new T.PlaneGeometry(w,h),glazing);m.position.set(x,y,z);m.rotation.set(rx,ry,0);shell.add(m);}
for(const x of [-.4,24.4]){
 rounded(shell,x,.28,10.6,.25,.5,23,.03,edge);rounded(shell,x,6.35,10.6,.2,.18,23,.025,steel);
 windowPane(22.8,6.0,x,3.3,10.6,Math.PI/2);
 for(const z of [-.5,7.2,14.8,22]){beam(shell,[x,.4,z],[x,6.3,z],.07,steel);strip(shell,x+(x<0?.1:-.1),2.1,z,.018,.12,.07,'#77a4bf');}
 strip(shell,x,.55,10.5,.04,.025,22,'#7bb8db');}
for(const z of [-.4,22.15]){rounded(shell,12,.3,z,25,.5,.25,.03,edge);rounded(shell,12,6.35,z,25,.18,.22,.025,steel);windowPane(24.5,6,12,3.3,z);for(const x of [0,6,18,24])beam(shell,[x,.45,z],[x,6.3,z],.065,steel);}
for(const z of [-.3,7.3,14.8,22.1]){beam(upperShell,[0,6.3,z],[24,6.3,z],.065,steel);for(const x of [2,22])strip(upperShell,x,6.24,z,2,.025,.035,'#abcfe2');}
const roof=new T.Mesh(new T.PlaneGeometry(24.6,22.7),glazing);roof.rotation.x=Math.PI/2;roof.position.set(12,6.4,10.8);upperShell.add(roof);
for(const x of [6,18])beam(upperShell,[x,6.35,-.3],[x,6.35,22.1],.045,steel);
// A narrow freestanding airlock frame keeps the rear view open.
for(const x of [10.7,13.3])beam(shell,[x,.3,22],[x,3.1,22],.06,steel);beam(shell,[10.7,3.1,22],[13.3,3.1,22],.06,steel);

// Brushed floor inlays lead from the airlock to the observation bridge.
for(const x of [9.1,15.9]){strip(scene,x,.002,10.7,.025,.012,21,'#5c95b3');for(let z=2;z<20;z+=2.5)cube(scene,x,.008,z,.18,.01,.02,'#b7c3c9');}
for(const z of [5,10,15,20])flatLabel(String(z).padStart(2,'0')+' / DECK',15.45,z,1.1,.24,'#7f98ac');
// Reading/work stations: functional chairs, quiet dark glass screens and fabric backs.
function chair(x,z,own=false){const g=new T.Group();g.position.set(x,0,z);scene.add(g);cyl(g,0,.24,0,.06,.48,steel);for(let i=0;i<5;i++){const a=i*Math.PI*.4;beam(g,[0,.07,0],[Math.sin(a)*.3,.04,Math.cos(a)*.3],.028,edge);}rounded(g,0,.51,0,.64,.16,.62,.05,'#394955');rounded(g,0,.91,.25,.66,.76,.14,.05,own?'#355a77':'#4e5d68');for(const x of [-.35,.35]){beam(g,[x,.5,0],[x,.75,0],.025,steel);rounded(g,x,.77,-.04,.1,.07,.43,.02,edge);}if(own)seatObjects.push(g);return g;}
function desk(cx,cz,own=false){const g=new T.Group();g.position.set(cx,0,cz);scene.add(g);
 const surface=rounded(g,0,.92,0,2.2,.13,1.25,.05,'#bcc7cf');for(const x of [-.86,.86])rounded(g,x,.45,0,.13,.84,.72,.015,steel);
 const screen=rounded(g,0,1.28,-.36,.9,.5,.06,.02,dark);screen.rotation.x=-.16;
 const img=textPlane(own?'MOONSHOT / MY MISSION':'FOCUS / IN PROGRESS',.78,.34,'#8bb6d2','#0b1c2a',23);img.position.set(0,1.28,-.32);img.rotation.x=-.16;g.add(img);
 rounded(g,0,1.005,.18,.66,.022,.24,.006,edge);for(let i=0;i<8;i++)cube(g,-.28+i*.08,1.019,.18,.045,.005,.17,'#657582');
 const mug=cyl(g,.8,1.08,.22,.065,.18,'#899baa');const notebook=rounded(g,-.76,1.01,.06,.35,.02,.43,.005,'#c9cdd0');const decor=new T.Group();decor.position.set(.78,1.01,-.37);g.add(decor);cyl(decor,0,.10,0,.09,.20,'#58798a');const sprout=new T.Group();decor.add(sprout);beam(sprout,[0,.2,0],[0,.45,0],.01,'#658c67');for(const a of [-1,1]){const leaf=sphere(sprout,a*.07,.35,0,.09,.025,.04,'#7fae81');leaf.rotation.z=a*.5;}const orbit=new T.Mesh(new T.TorusGeometry(.13,.012,5,16),mat('#9cc9ec'));orbit.position.y=.34;orbit.rotation.x=.6;decor.add(orbit);const lamp=sphere(decor,0,.30,0,.10,.10,.10,'#e3c8a1');decor.visible=false;studyDesks.push({surface,mug,notebook,decor,sprout,orbit,lamp});
 strip(g,0,.85,.51,1.95,.018,.02,'#88b7d6');obstacle(cx,cz,2.2,1.25);chair(cx,cz+1.15,own);}
desk(3.1,2.1);desk(7.5,1.9);desk(3.5,6,true);
function personalizeDesk(){const theme=['orbital','night','garden'].includes(state.deskTheme)?state.deskTheme:'orbital',palette={orbital:['#839eaf','#6a9bc0','#d3e0e8'],night:['#39485c','#a89abb','#b9b4c9'],garden:['#80988b','#789b80','#c7d9b9']}[theme];studyDesks.forEach((d,i)=>{const own=i===[2,1,0][myDeskIndex];d.surface.material=mat(own?palette[0]:'#bcc7cf');d.mug.material=mat(own?palette[1]:'#899baa');d.notebook.material=mat(own?palette[2]:'#c9cdd0');d.decor.visible=own;d.sprout.visible=theme==='garden';d.orbit.visible=theme==='orbital';d.lamp.visible=theme==='night';});canvas.dataset.deskTheme=theme;canvas.dataset.deskIndex=String(myDeskIndex);}
personalizeDesk();
// Side wall cabinets with latches reinforce the inhabited spacecraft scale.
for(let z=2.4;z<11;z+=2.4){rounded(scene,.5,1.1,z,.7,2.2,1.95,.05,'#70808e');rounded(scene,.87,1.1,z,.035,2.0,1.7,.008,'#acb6bd');cube(scene,.92,1.1,z+.58,.06,.4,.06,edge);obstacle(.5,z,.8,2);}
const resourceRack=new T.Group();resourceRack.position.set(8.5,0,9.3);scene.add(resourceRack);
rounded(resourceRack,0,.48,0,1.5,.95,.7,.06,edge);const missionDisplay=rounded(resourceRack,0,1.17,-.16,1.6,.8,.07,.025,dark);missionDisplay.rotation.x=-.3;
const missionName=textPlane('MOONSHOT / MISSION',1.34,.38,'#89bddb','#0b1c2a',30);missionName.position.set(0,1.22,-.10);missionName.rotation.x=-.3;resourceRack.add(missionName);strip(resourceRack,0,.78,.37,1.2,.025,.025);obstacle(8.5,9.3,1.6,.8);
// Low lounge seating leaves a continuous view through the observation glass.
function sofa(x,z,w){const g=new T.Group();g.position.set(x,0,z);scene.add(g);rounded(g,0,.3,0,w,.45,1.02,.06,'#263643');rounded(g,0,.72,.4,w,.76,.16,.06,'#596670');for(let i=0;i<3;i++)rounded(g,(i-1)*w/3,.57,0,w/3-.04,.15,.87,.04,'#74818a');obstacle(x,z,w,1.05);}
sofa(12.2,13.9,3.3);sofa(18.8,18.7,2.6);
const coffee=rounded(scene,12,.46,11.7,1.6,.09,.9,.06,'#80909b');for(const x of [11.5,12.5])cube(scene,x,.24,11.7,.05,.4,.5,edge);obstacle(12,11.7,1.6,.9);
for(const x of [9.5,14.7]){chair(x,11.7);obstacle(x,11.7,.7,.6);}
// Peer review wall: large, restrained projection rather than a toy bulletin board.
const boardGroup=new T.Group();boardGroup.position.set(19.6,0,4.5);scene.add(boardGroup);
rounded(boardGroup,0,1.8,0,3.4,2.25,.16,.045,steel);rounded(boardGroup,0,1.8,.1,3.22,2.07,.04,.01,dark);
for(const x of [-1.35,1.35])cube(boardGroup,x,.62,0,.08,1.2,.13,edge);
const bt=textPlane('MOONSHOT / PEER REVIEW',2.8,.35,'#a8c7da','#0d2030',30);bt.position.set(0,2.47,.13);boardGroup.add(bt);
for(let i=0;i<3;i++){rounded(boardGroup,-1+i,1.66,.14,.84,.9,.025,.01,'#203e53');for(let j=0;j<4;j++)cube(boardGroup,-1+i,1.9-j*.14,.163,j===3?.36:.63,.018,.008,j===0?'#91bad4':'#51778c');}
strip(boardGroup,0,.71,.13,2.9,.025,.02);obstacle(19.6,4.5,3.4,.35);
const presentationCanvas=document.createElement('canvas');presentationCanvas.width=1024;presentationCanvas.height=512;
const presentationTexture=new T.CanvasTexture(presentationCanvas);presentationTexture.colorSpace=T.SRGBColorSpace;
const presentationScreen=new T.Mesh(new T.PlaneGeometry(2.96,1.48),new T.MeshBasicMaterial({map:presentationTexture}));presentationScreen.position.set(0,1.65,.2);boardGroup.add(presentationScreen);
function paintPresentation(session){const q=presentationCanvas.getContext('2d');q.fillStyle='#0b2235';q.fillRect(0,0,1024,512);q.fillStyle=session?'#9ff1cf':'#95bbd1';q.font='600 38px system-ui';q.fillText(session?'LIVE / 문샷 결과물 발표회':'문샷 의견 나눔방',54,82);q.fillStyle='#f2f7fc';q.font='600 44px system-ui';const text=String(session?.title||'동료의 결과를 함께 살펴요').slice(0,120);let line='',y=180;for(const c of text){if(q.measureText(line+c).width>900){q.fillText(line,54,y);line='';y+=64;if(y>330)break;}line+=c;}if(y<=330)q.fillText(line,54,y);q.font='30px system-ui';q.fillStyle='#a8c9df';q.fillText(session?'다가가서 발표 화면 열기':'결과물과 피드백 화면 열기',54,450);if(!session&&state.exhibition?.length){q.fillStyle='#0b2235';q.fillRect(0,0,1024,512);q.fillStyle='#9bc5de';q.font='600 34px system-ui';q.fillText(state.exhibitionDemo?'체험 / 동료의 작품':'MOONSHOT / 동료의 작품',54,65);state.exhibition.slice(0,3).forEach((p,i)=>{q.font='600 38px system-ui';q.fillStyle='#eef8ff';q.fillText(p.title,54,145+i*114,910);q.font='27px system-ui';q.fillStyle='#9bbbd0';q.fillText(p.alias,54,185+i*114,910);});}presentationTexture.needsUpdate=true;const button=$('#ms-live-demo');button.hidden=!session;button.textContent=session?'발표 중 · '+text:'';}
paintPresentation(null);
const focusHalo=new T.Mesh(new T.RingGeometry(.7,1.15,40),new T.MeshBasicMaterial({color:'#a7f3d0',transparent:true,opacity:.45,side:T.DoubleSide,depthWrite:false}));focusHalo.rotation.x=-Math.PI/2;focusHalo.visible=false;scene.add(focusHalo);

// Observation lounge maintains its established location in the mission map.
chair(20.7,16.7);chair(22,16.7);rounded(scene,21.35,.64,15.5,1.5,.1,.7,.05,'#9ba8b0');for(const x of [20.8,21.9])cube(scene,x,.32,15.5,.05,.6,.45,steel);obstacle(21.35,15.5,1.5,.7);
const terraceWindow=new T.Mesh(new T.PlaneGeometry(.01,.01),new T.MeshBasicMaterial());terraceWindow.visible=false;
// Main bridge console looks through the front window toward the launch site.
const missionConsole=new T.Group();missionConsole.position.set(15.7,0,8.4);scene.add(missionConsole);
rounded(missionConsole,0,.5,0,1.5,1,.8,.07,edge);
const ctl=rounded(missionConsole,0,1.21,-.16,1.7,.7,.12,.03,dark);ctl.rotation.x=-.4;
const controlText=textPlane('MOONSHOT / LAUNCH',1.4,.34,'#a8cee3','#0c2232',30);controlText.position.set(0,1.23,-.08);controlText.rotation.x=-.4;missionConsole.add(controlText);obstacle(15.7,8.4,1.5,.8);
strip(missionConsole,0,.82,.41,1.25,.026,.02,'#84b8d4');
// Continuous station chassis, connecting decks and external service modules.
const stationStructure=new T.Group();scene.add(stationStructure);
const hull='#738593',rim='#263e52',rail='#8ea8ba';
mat(hull).metalness=.65;mat(hull).roughness=.4;
// Deep layered hull replaces the thin floating-board silhouette.
rounded(stationStructure,12,-1.6,10.5,26.8,2.1,24.1,.32,hull);
rounded(stationStructure,12,-2.65,10.5,23.9,1.2,21.6,.3,'#253949');
for(const x of [-1.4,25.4]){strip(stationStructure,x,-.42,10.5,.1,.08,23.6,'#80c9ef');for(let z=0;z<23;z+=2.3){cube(stationStructure,x,-1.3,z,.14,1.2,1.65,'#344e64');}}
for(const z of [-1.55,22.55]){strip(stationStructure,12,-.42,z,26.3,.07,.08,'#8abbd7');for(let x=0;x<25;x+=2.4)cube(stationStructure,x,-1.3,z,1.8,1.1,.12,'#344e64');}
// Circular orbital superstructure: twin rings with regular cross-bracing.
for(const y of [-2.9,-4.4]){const ringHull=new T.Mesh(new T.TorusGeometry(29,.32,8,128),mat('#536c80'));ringHull.rotation.x=Math.PI/2;ringHull.position.set(12,y,7);stationStructure.add(ringHull);}
for(let i=0;i<48;i++){const a=i*Math.PI/24,b=a+Math.PI/24;beam(stationStructure,[12+Math.cos(a)*29,-2.9,7+Math.sin(a)*29],[12+Math.cos(b)*29,-4.4,7+Math.sin(b)*29],.075,rail);if(i%3===0){beam(stationStructure,[12+Math.cos(a)*29,-2.9,7+Math.sin(a)*29],[12+Math.cos(a)*29,-4.4,7+Math.sin(a)*29],.09,rail);const beacon=new T.Mesh(new T.SphereGeometry(.11,8,6),new T.MeshBasicMaterial({color:'#7bd1ff'}));beacon.position.set(12+Math.cos(a)*29,-2.5,7+Math.sin(a)*29);stationStructure.add(beacon);}}
for(const [x,z]of [[-16,7],[40,7],[12,-21],[12,35]]){beam(stationStructure,[12,-2.7,10],[x,-3.5,z],.38,rim);beam(stationStructure,[12,-4,10],[x,-4.4,z],.22,rail);}
function habitat(x,z,angle,label){const g=new T.Group();g.position.set(x,-1.3,z);g.rotation.y=angle;stationStructure.add(g);
 rounded(g,0,0,0,9,3.6,6,.65,hull);rounded(g,0,.5,0,8.4,3.4,5.5,.55,'#a4b1bb');
 for(const side of [-1,1]){rounded(g,side*4.2,.6,0,.12,1.35,4.2,.05,'#132638');strip(g,side*4.29,-.45,0,.03,.045,4.3,'#8ed5f2');}
 for(let i=-3;i<=3;i+=1.5)cube(g,i,2.23,0,.11,.13,5.3,rim);
 const name=textPlane(label,6.3,.47,'#92bcd2',null,32);name.rotation.x=-Math.PI/2;name.position.set(0,2.33,0);g.add(name);
 for(const a of [-1,1]){rounded(g,a*2.5,-2,0,1.1,1.7,4,.14,'#344b60');}
}
habitat(-12,6,0,'MOONSHOT / RESEARCH');habitat(37,11,0,'MOONSHOT / HABITAT');habitat(11,31,Math.PI/2,'MOONSHOT / ARRIVAL');
// Pressurised connection bridges, with an illuminated axial line.
for(const [x,z,w,d]of [[-5,6,12,3],[30,11,12,3],[11,26,3,10],[26,-7,20,3]]){rounded(stationStructure,x,-.8,z,w,.8,d,.12,'#455d72');strip(stationStructure,x,-.34,z,w>.1?w-.5:w,.025,.05,'#9bddff');for(const side of [-1,1]){if(w>d){beam(stationStructure,[x-w/2,.45,z+side*d/2],[x+w/2,.45,z+side*d/2],.045,rail);}else beam(stationStructure,[x+side*w/2,.45,z-d/2],[x+side*w/2,.45,z+d/2],.045,rail);}}
// Solar fields provide a readable human-to-station scale without extra lights.
function solar(x,z){const g=new T.Group();g.position.set(x,-3.5,z);stationStructure.add(g);beam(g,[-11,0,0],[11,0,0],.16,rail);for(const side of [-1,1])for(let i=0;i<4;i++){const xx=side*(3+i*2.7);cube(g,xx,.06,0,2.5,.12,8.6,'#284a6a');for(let k=-4;k<=4;k++)cube(g,xx,.13,k,2.4,.015,.027,'#5a7896');for(let k=-1;k<=1;k++)cube(g,xx+k*.75,.13,0,.018,.015,8.5,'#3a6489');}g.rotation.z=.16;}
solar(-10,-14);solar(34,30);
// Communication mast and dish on the rear module.
beam(stationStructure,[11,1,31],[11,8,31],.14,rail);const dish=mesh(new T.SphereGeometry(1.65,24,12,0,Math.PI*2,0,.55),hull,stationStructure,11,7.4,31);dish.rotation.z=.7;beam(stationStructure,[11,7.4,31],[12.2,9.1,31],.035,rail);
// Multi-stage vehicle with service tower, engine bells and dock infrastructure.
const launchCourt=new T.Group();launchCourt.position.set(36,-.2,-14);scene.add(launchCourt);
const launchSteel='#8294a3',vehicleWhite='#d5dce0',carbon='#182a38';
mat(vehicleWhite).metalness=.38;mat(vehicleWhite).roughness=.34;
rounded(launchCourt,0,-.8,0,14,1.7,13,.35,'#586c7d');rounded(launchCourt,0,.13,0,13.5,.22,12.5,.15,'#24394c');
for(let i=-5;i<=5;i++)for(const z of [-4.5,4.5])cube(launchCourt,i,.26,z,.05,.018,2,'#9bb0bf');
const launchRing=new T.Mesh(new T.TorusGeometry(3.5,.055,8,80),new T.MeshBasicMaterial({color:'#90c8e6'}));launchRing.rotation.x=Math.PI/2;launchRing.position.y=.27;launchCourt.add(launchRing);
const rocket=new T.Group();rocket.position.y=.37;launchCourt.add(rocket);
const cohortLights=[];for(let i=0;i<10;i++){const lamp=new T.Mesh(new T.BoxGeometry(.84,.06,.18),new T.MeshBasicMaterial({color:'#294457'}));lamp.position.set(-4.5+i, .28,5.6);launchCourt.add(lamp);cohortLights.push(lamp);}
function setCohortProgress(payload){const count=payload.cohortLaunches,goal=payload.cohortGoal,valid=Number.isSafeInteger(count)&&count>=0&&Number.isSafeInteger(goal)&&goal>0;state.verifiedCohortGoal=valid&&count>=goal;const lit=valid?Math.min(10,Math.floor(count/goal*10)):0;cohortLights.forEach((lamp,i)=>lamp.material.color.set(i<lit?'#8bdbff':'#294457'));const label=$('#ms-cohort-progress');label.hidden=!valid;label.textContent=valid?(payload.demo?'체험 · ':'')+'기수 발사 '+count+'/'+goal:'';}

// Engine cluster with open tapered bells, metallic rims and dark throats.
for(let i=0;i<7;i++){const a=i*Math.PI/3,rr=i===6?0:.54,x=Math.cos(a)*rr,z=Math.sin(a)*rr;const bell=new T.Mesh(new T.CylinderGeometry(.12,.24,.55,20,1,true),mat('#52616b'));bell.position.set(x,.30,z);bell.material.side=T.DoubleSide;rocket.add(bell);const lip=new T.Mesh(new T.TorusGeometry(.24,.025,6,20),mat('#96a0a6'));lip.rotation.x=Math.PI/2;lip.position.set(x,.025,z);rocket.add(lip);cyl(rocket,x,.57,z,.11,.12,carbon);}
cyl(rocket,0,1.0,0,.98,.8,carbon);
cyl(rocket,0,6.15,0,.90,9.5,vehicleWhite);cyl(rocket,0,11.15,0,.91,.48,carbon);
cyl(rocket,0,13.3,0,.90,3.9,vehicleWhite);
// Rounded payload fairing follows a smooth profile rather than a toy cone.
const fairingProfile=[[.90,15.2],[.98,15.5],[1.01,16.0],[.95,16.7],[.76,17.5],[.47,18.2],[.15,18.75],[.025,18.95]].map(a=>new T.Vector2(a[0],a[1]));const fairing=new T.Mesh(new T.LatheGeometry(fairingProfile,48),mat(vehicleWhite));fairing.castShadow=true;rocket.add(fairing);
for(const y of [1.45,3.4,5.8,8.2,10.8,11.42,13.6,15.22]){cyl(rocket,0,y,0,.906,.035,'#748795');}
for(let i=0;i<16;i++){const a=i*Math.PI/8;beam(rocket,[Math.sin(a)*.907,1.6,Math.cos(a)*.907],[Math.sin(a)*.907,10.7,Math.cos(a)*.907],.006,'#b8c4cc');}
for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const f=new T.Group();f.rotation.y=angle;rocket.add(f);beam(f,[.82,2.8,0],[1.3,.8,0],.055,launchSteel);rounded(f,1.05,1.7,0,.09,1.5,.19,.015,carbon);const grid=rounded(f,.96,10.2,0,.13,.7,.55,.025,carbon);for(let j=-2;j<=2;j++)cube(f,1.04,10.2,j*.10,.025,.58,.025,'#667c8f');}
const rocketLogo=textPlane('M O O N S H O T',1.4,.24,'#244f73',null,35);rocketLogo.position.set(0,8.0,.914);rocket.add(rocketLogo);
const rocketNumber=textPlane('MS–01',.70,.28,'#244f73',null,43);rocketNumber.position.set(0,12.8,.915);rocket.add(rocketNumber);
cyl(rocket,0,9.4,0,.908,.32,'#244f73');
// Full-height truss service tower and articulated access arms.
for(const x of [3.2,5.5])for(const z of [-1.4,1.4])cube(launchCourt,x,9.4,z,.18,18.8,.18,launchSteel);
for(let y=.5;y<19;y+=2.1){for(const z of [-1.4,1.4]){beam(launchCourt,[3.2,y,z],[5.5,Math.min(19,y+2.1),z],.06,'#a8b6bf');cube(launchCourt,4.35,y,z,2.6,.12,.22,carbon);}for(const x of [3.2,5.5])beam(launchCourt,[x,y,-1.4],[x,Math.min(19,y+2.1),1.4],.06,launchSteel);}
for(const y of [6.4,11.3,16]){rounded(launchCourt,4.35,y,0,2.9,.18,3.3,.03,launchSteel);beam(launchCourt,[3.2,y,0],[1.1,y,0],.16,'#657f94');beam(launchCourt,[3.2,y+1,0],[1.1,y,0],.06,rail);}
for(const x of [-5.1,-3.8]){cyl(launchCourt,x,1.7,-3,.48,2.8,'#b0bfc8');sphere(launchCourt,x,3.1,-3,.48,.35,.48,'#b0bfc8');beam(launchCourt,[x,.6,-3],[x,.6,1.1],.09,'#718795');}
for(const x of [-6,6])for(const z of [-5,5]){beam(launchCourt,[x,0,z],[x,2.2,z],.045,launchSteel);strip(launchCourt,x,2.2,z,.6,.12,.08,'#c2e9ff');}
const missionBeacon=new T.Mesh(new T.RingGeometry(.48,.51,36),new T.MeshBasicMaterial({color:'#8ebbd2',transparent:true,opacity:.7}));missionBeacon.rotation.x=-Math.PI/2;scene.add(missionBeacon);
const pinsLayer=document.createElement('div');pinsLayer.className='space-pins';root.querySelector('.ms-world').append(pinsLayer);
const mapLeaders=document.createElementNS('http://www.w3.org/2000/svg','svg');mapLeaders.classList.add('map-leaders');root.querySelector('.ms-world').append(mapLeaders);const leaderLines=spacePoints.map(()=>{const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.setAttribute('stroke','#9ac6df');l.setAttribute('stroke-opacity','.55');l.setAttribute('stroke-width','1');mapLeaders.append(l);return l;});const pins=spacePoints.map(p=>{const b=document.createElement('button');b.className='space-pin';b.dataset.space=p.id;b.innerHTML=`<strong>${p.name}</strong><small>${p.sub}</small>`;pinsLayer.append(b);return{...p,el:b};});
const routeLine=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#a0cde3',dashSize:.2,gapSize:.14,transparent:true,opacity:.7}));scene.add(routeLine);
// Two broad practical lights, neither casting another shadow map.
for(const [x,z]of [[5,7],[19,13]]){const l=new T.PointLight('#d5e5ee',38,18,2);l.position.set(x,5.8,z);scene.add(l);}

 const ray=new T.Raycaster(),mouse=new T.Vector2(),ground=new T.Plane(new T.Vector3(0,1,0),0);
 // Adult-proportioned crew: articulated flight suits, woven fabric and restrained facial detail.
 const fabricCanvas=document.createElement('canvas');fabricCanvas.width=fabricCanvas.height=128;const fq=fabricCanvas.getContext('2d');fq.fillStyle='#999';fq.fillRect(0,0,128,128);for(let y=0;y<128;y+=2){fq.fillStyle=y%4?'#898989':'#aaa';fq.fillRect(0,y,128,1);}for(let x=0;x<128;x+=3){fq.fillStyle='#777';fq.fillRect(x,0,1,128);}const fabricTex=new T.CanvasTexture(fabricCanvas);fabricTex.wrapS=fabricTex.wrapT=T.RepeatWrapping;fabricTex.repeat.set(4,4);
 const clothCache=new Map();function cloth(c){if(!clothCache.has(c))clothCache.set(c,new T.MeshStandardMaterial({color:c,roughness:.83,metalness:.04,bumpMap:fabricTex,bumpScale:.0025}));return clothCache.get(c);}
 function makeHuman(p){
 const g=new T.Group();scene.add(g);const skin='#c7a48e',navy='#253445',trim='#a9b7c2',hairColor='#282629';
 const skinMat=new T.MeshStandardMaterial({color:skin,roughness:.66});
 function ell(parent,x,y,z,rx,ry,rz,color){const m=sphere(parent,x,y,z,rx,ry,rz,color);if(color===skin)m.material=skinMat;return m;}
 function tailored(parent,points,zscale,color){const m=new T.Mesh(new T.LatheGeometry(points.map(a=>new T.Vector2(a[0],a[1])),24),cloth(color));m.scale.z=zscale;m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
 const hips=new T.Group();hips.position.y=.88;g.add(hips);ell(hips,0,-.02,0,.18,.14,.115,navy);const legs=[];
 for(const side of [-1,1]){const hip=new T.Group();hip.position.x=side*.105;hips.add(hip);
 const upper=tailored(hip,[[.065,-.02],[.09,-.07],[.085,-.22],[.062,-.40]],.95,navy);
 const knee=new T.Group();knee.position.y=-.40;hip.add(knee);
 tailored(knee,[[.062,0],[.063,-.08],[.055,-.27],[.045,-.35]],.96,navy);
 rounded(knee,0,-.035,.052,.10,.11,.025,.015,'#4a5d6d');
 const boot=rounded(knee,0,-.405,.045,.135,.13,.265,.025,'#18222d');rounded(knee,0,-.464,.045,.14,.025,.275,.008,'#465260');
 cube(hip,side*.075,-.19,.012,.014,.17,.09,'#526575');legs.push({hip,knee});}
 const torso=tailored(g,[[.17,.86],[.17,.95],[.18,1.12],[.235,1.34],[.19,1.43],[.08,1.48]],.65,p.coat);
 // Technical shoulder yoke, zip, chest patch, belt and seams.
 for(const side of [-1,1]){const yoke=ell(g,side*.17,1.365,.014,.08,.032,.115,trim);cube(g,side*.13,1.20,.122,.105,.115,.018,'#354b5e');cube(g,side*.13,1.25,.137,.085,.009,.005,'#b0c3ce');beam(g,[side*.17,1.02,.11],[side*.205,1.31,.13],.004,'#98aebb');}
 cube(g,0,1.18,.135,.012,.43,.012,'#91a7b7');cube(g,0,1.335,.15,.025,.045,.012,'#d2dce1');
 const belt=cyl(g,0,.92,0,.175,.065,'#1b2937');belt.scale.z=.67;rounded(g,0,.925,.123,.065,.045,.025,.006,'#9aabb5');
 const badge=textPlane('MOONSHOT',.16,.037,'#dcebf4','#274f71',39);badge.position.set(-.115,1.32,.143);g.add(badge);
 const back=textPlane('MOONSHOT  /  CREW',.32,.052,'#afc3cf',null,34);back.position.set(0,1.30,-.148);back.rotation.y=Math.PI;g.add(back);
 cyl(g,0,1.48,0,.064,.11,skin);const collar=cyl(g,0,1.46,0,.084,.05,'#23384b');collar.scale.z=.85;
 const head=new T.Group();head.position.y=1.665;g.add(head);
 ell(head,0,.008,0,.126,.164,.115,skin);ell(head,0,-.10,.026,.085,.07,.079,skin);
 for(const side of [-1,1]){ell(head,side*.125,-.015,0,.022,.043,.019,skin);ell(head,side*.045,.011,.107,.026,.009,.008,'#c8c9c4');ell(head,side*.045,.012,.114,.009,.009,.004,'#39464a');ell(head,side*.045,.012,.118,.0045,.006,.002,'#151d25');const brow=ell(head,side*.047,.041,.106,.03,.005,.008,hairColor);brow.rotation.z=-side*.09;}
 ell(head,0,-.015,.116,.019,.04,.024,skin);ell(head,0,-.04,.135,.021,.013,.013,skin);
 ell(head,0,-.077,.106,.031,.004,.006,'#936e62');ell(head,0,-.085,.102,.025,.004,.004,'#b48a7b');
 const cap=mesh(new T.SphereGeometry(.132,28,18,0,Math.PI*2,0,Math.PI*.49),hairColor,head);cap.position.y=.03;cap.scale.set(1,1.09,.94);
 for(let i=0;i<7;i++){const lock=ell(head,-.09+i*.027,.122+Math.sin(i*.4)*.022,.068,.032,.04,.065,hairColor);lock.rotation.z=-.25;}
 const longHair=new T.Group();head.add(longHair);ell(longHair,0,.015,-.081,.125,.13,.064,hairColor);ell(longHair,0,-.10,-.145,.06,.13,.055,hairColor);ell(longHair,0,-.25,-.16,.048,.08,.045,hairColor);cyl(longHair,0,-.035,-.15,.055,.018,'#536d7b');longHair.visible=p.gender==='female';
 const glasses=new T.Group();head.add(glasses);for(const side of [-1,1]){const rim=new T.Mesh(new T.TorusGeometry(.035,.005,6,16),new T.MeshStandardMaterial({color:'#293f58',metalness:.6,roughness:.3}));rim.position.set(side*.045,.012,.129);glasses.add(rim);}cube(glasses,0,.015,.13,.03,.006,.006,'#293f58');
 const headset=new T.Group();head.add(headset);for(const side of [-1,1])ell(headset,side*.135,.015,0,.022,.055,.045,'#29445b');const band=new T.Mesh(new T.TorusGeometry(.15,.012,6,20,Math.PI),new T.MeshStandardMaterial({color:'#68859a'}));band.position.y=.04;headset.add(band);beam(headset,[.14,-.015,.02],[.10,-.07,.14],.008,'#29445b');
 const arms=[];for(const side of [-1,1]){const shoulder=new T.Group();shoulder.position.set(side*.235,1.37,0);g.add(shoulder);const sleeve=tailored(shoulder,[[.06,.015],[.073,-.06],[.057,-.20],[.052,-.29]],1,p.coat);ell(shoulder,side*.015,-.035,0,.064,.028,.068,trim);
 const elbow=new T.Group();elbow.position.y=-.29;shoulder.add(elbow);tailored(elbow,[[.052,0],[.055,-.055],[.043,-.22],[.038,-.27]],.94,p.coat);cyl(elbow,0,-.25,0,.043,.055,navy);ell(elbow,0,-.326,.009,.038,.068,.028,skin);for(let j=0;j<3;j++)ell(elbow,(j-1)*.019,-.372,.014,.009,.026,.011,skin);ell(elbow,-side*.037,-.315,.02,.014,.038,.016,skin);if(side===-1)rounded(elbow,0,-.22,.043,.063,.065,.018,.008,'#52798c');arms.push({shoulder,elbow,sleeve});}
 const book=new T.Group();book.position.set(0,.72,.37);g.add(book);rounded(book,0,0,0,.28,.018,.20,.008,'#253b4d');cube(book,0,.012,0,.245,.005,.165,'#8ba9b8');book.visible=false;
 const tag=document.createElement('div');tag.className='ms-3d-tag'+(p.mine?' mine':'');root.querySelector('#ms-labels').append(tag);const sayEl=document.createElement('div');sayEl.className='ms-3d-bubble';sayEl.hidden=true;root.querySelector('#ms-labels').append(sayEl);
 return {g,head,hips,legs,arms,torso,longHair,book,tag,sayEl,glasses,headset,coat:p.coat};}

 const humans=[...mates,player].map(p=>({p,rig:makeHuman(p)}));const me=humans.at(-1).rig;me.g.rotation.y=Math.PI;
 let captureAllowed=null;let liftStarted=0,liftCallback=null;const flame=new T.Mesh(new T.ConeGeometry(.9,4.5,24),new T.MeshBasicMaterial({color:'#b2ecff',transparent:true,opacity:.85}));flame.rotation.z=Math.PI;flame.position.set(0,-2,0);flame.visible=false;rocket.add(flame);
 function launch(done){if(liftStarted)return;canvas.dataset.launchAnimation='active';rocket.position.y=.37;liftStarted=performance.now();liftCallback=done;state.zoom=false;orbit.yaw=0;orbit.pitch=-.08;flame.visible=true;schedule();}

 const ring=new T.Mesh(new T.RingGeometry(.31,.335,36),new T.MeshBasicMaterial({color:'#0283bf',side:T.DoubleSide,transparent:true,opacity:.7}));ring.rotation.x=-Math.PI/2;ring.position.y=.045;scene.add(ring);
 const destination=new T.Mesh(new T.RingGeometry(.13,.16,24),new T.MeshBasicMaterial({color:'#0283bf',side:T.DoubleSide,transparent:true,opacity:.7}));destination.rotation.x=-Math.PI/2;destination.position.y=.05;destination.visible=false;scene.add(destination);
 let anim=0,last=0,dirty=true,inView=true,closeBy=null,previousNear='',lastUI=0;
 function blocked(x,z){return x<.05||x>24||z<.05||z>21.8||obstacles.some(b=>x>b.x&&x<b.x+b.w&&z>b.z&&z<b.z+b.d);}
 function move(dx,dz){let moved=false;if(!blocked(player.x+dx,player.y)){player.x+=dx;moved=true;}if(!blocked(player.x,player.y+dz)){player.y+=dz;moved=true;}if(moved&&Math.abs(dx)+Math.abs(dz)>.001)me.g.rotation.y=Math.atan2(dx,dz);return moved;}
 // Short grid paths keep click-to-move and landmark buttons out of furniture.
 let path=[],pathFor=null;
 function findPath(tx,tz){const size=.45,N=55,toCell=v=>Math.max(0,Math.min(N-1,Math.round(v/size))),start=[toCell(player.x),toCell(player.y)],goal=[toCell(tx),toCell(tz)],key=(x,z)=>z*N+x;const queue=[start],prev=new Map([[key(...start),null]]);let end=null;
 for(let i=0;i<queue.length&&i<3200;i++){const [x,z]=queue[i];if(x===goal[0]&&z===goal[1]){end=[x,z];break;}for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(nx<0||nz<0||nx>=N||nz>=N||prev.has(k)||blocked(nx*size,nz*size))continue;if(dx&&dz&&(blocked(x*size,nz*size)||blocked(nx*size,z*size)))continue;prev.set(k,[x,z]);queue.push([nx,nz]);}}
 if(!end)return[];const result=[];while(end){result.push({x:end[0]*size,y:end[1]*size});end=prev.get(key(...end));}result.reverse();result.shift();result.push({x:tx,y:tz});return result;
 }
 function nearest(){const candidates=[{id:'launch',x:15.7,z:9.5,r:1.25,label:'E · 발사 미션 살펴보기',action:()=>open('launch')},{id:'terrace',x:20.7,z:17.0,r:1.2,label:player.sitting?'E · 테라스에서 일어나기':'E · 테라스에 앉기',action:()=>{player.sitting=!player.sitting;if(player.sitting){player.x=20.7;player.y=16.7;me.g.rotation.y=Math.PI;}status(player.sitting?'잠시 쉬어가도 괜찮아요. E로 일어날 수 있어요.':'다시 자유롭게 둘러보세요.');}},{id:'desk',x:3.5,z:7.15,r:1.5,label:player.sitting?'E · 자리에서 일어나기':'E · 내 자리에 앉기',action:()=>{if(player.sitting){player.sitting=false;pauseFocus();walk(4.7,7.6);open('welcome');}else{sitAtDesk();}}},{id:'resources',x:8.5,z:10.3,r:1.2,label:'E · 미션 자료 꺼내기',action:()=>open('resources')},{id:'board',x:19.6,z:6.0,r:1.9,label:state.presentation?'E · 문샷 발표 보기':'E · 피드백 게시판 보기',action:()=>open(state.presentation?'presentation':'board')}];humans.filter(h=>!h.p.mine).forEach(({p:m},i)=>candidates.push({id:'mate'+i,x:m.x,z:m.y,r:1.2,label:`E · ${m.name()}님과 이야기하기`,action:()=>{open('chat');greet();}}));return candidates.map(c=>({...c,dist:Math.hypot(player.x-c.x,player.y-c.z)})).filter(c=>c.dist<c.r&&!state.closedZones?.includes(c.id==='resources'?'mission':c.id)).sort((a,b)=>a.dist-b.dist)[0]||null;}
 function interact(){if(closeBy){closeBy.action();schedule();}else status('책상, 동료, 게시판 가까이에서 E를 눌러보세요.');}
 const orbit={yaw:0,pitch:.025,distance:7.8};
 const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const cameraTarget=new T.Vector3(player.x,1.8,player.y),cameraGoal=new T.Vector3();
 let cameraInitialized=false,cameraSettling=false,lastPaint=0,seatView=false;
function cameraPose(t){
 const aspect=canvas.clientWidth/canvas.clientHeight, third=state.cameraMode==='third';
 const eye=player.sitting?1.24:1.72;
 let look,desired;
 if(!state.zoom){look=new T.Vector3(12,1,5);desired=look.clone().add(new T.Vector3(34,28,46).multiplyScalar(Math.max(1,.9/aspect)));}
 else if(third){const d=aspect<.7?5.8:5.0;look=new T.Vector3(player.x-Math.sin(orbit.yaw)*.8,player.sitting?.85:1.15,player.y-Math.cos(orbit.yaw)*.8);desired=new T.Vector3(player.x+Math.sin(orbit.yaw)*d,eye+.95+Math.sin(orbit.pitch)*d,player.y+Math.cos(orbit.yaw)*d);desired.x=Math.max(.35,Math.min(23.65,desired.x));desired.z=Math.max(.35,Math.min(21.5,desired.z));desired.y=Math.max(1.0,Math.min(5.8,desired.y));}
 else {look=new T.Vector3(player.x-Math.sin(orbit.yaw)*8,eye-Math.sin(orbit.pitch)*8,player.y-Math.cos(orbit.yaw)*8);desired=new T.Vector3(player.x,eye,player.y);}
 if(state.rocketInspect){look=new T.Vector3(36,9,-14);desired=new T.Vector3(51,11,9);if(aspect<.8)desired=new T.Vector3(57,14,18); }
 if(liftStarted){look=new T.Vector3(36,10+rocket.position.y*.35,-14);desired=new T.Vector3(58,17,17);}
 const a=reduceMotion?1:Math.min(1,1-Math.exp(-Math.min((t-lastPaint)||33,80)/135));lastPaint=t;
 if(!cameraInitialized){cameraTarget.copy(look);camera.position.copy(desired);}else{cameraTarget.lerp(look,a);camera.position.lerp(desired,a);}
 cameraGoal.copy(desired);camera.lookAt(cameraTarget);cameraInitialized=true;
 const nextFov=state.zoom?(third?57:64):50;if(camera.fov!==nextFov){camera.fov=nextFov;camera.updateProjectionMatrix();}
 shell.visible=true;upperShell.visible=state.zoom;lunarVista.visible=true;
 root.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(state.zoom&&state.cameraMode===b.dataset.camera)));
 cameraSettling=camera.position.distanceToSquared(desired)>.0001||cameraTarget.distanceToSquared(look)>.0001;
}
function seatCamera(){orbit.yaw=0;orbit.pitch=.04;state.zoom=true;seatView=true;schedule();}
function resetCamera(){orbit.yaw=0;orbit.pitch=.025;state.zoom=true;seatView=false;schedule();}
function routeCamera(x,z){if(state.cameraMode!=='third')orbit.yaw=Math.atan2(player.x-x,player.y-z);orbit.pitch=.04;schedule();}

 let renderW=0,renderH=0;function size(){const w=canvas.clientWidth,h=canvas.clientHeight;if(w!==renderW||h!==renderH){renderer.setSize(w,h,false);renderW=w;renderH=h;camera.aspect=w/h;camera.updateProjectionMatrix();}}
 function project(pos){const v=pos.clone().project(camera);return {x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2,visible:v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.15};}
 function paint(t=performance.now(),moving=false,continuousGap=0){
 const measuredStart=performance.now(),nextQuality=quality.settings();
 if(nextQuality.name!==appliedQuality.name){appliedQuality=nextQuality;renderer.setPixelRatio(nextQuality.pixelRatio);renderer.shadowMap.enabled=nextQuality.shadows;renderer.shadowMap.autoUpdate=nextQuality.shadowInterval===0;renderer.shadowMap.needsUpdate=true;canvas.dataset.renderQuality=nextQuality.name;canvas.dataset.renderPixelRatio=String(nextQuality.pixelRatio);}
 if(appliedQuality.shadowInterval&&(t-shadowPaintAt>=appliedQuality.shadowInterval||captureAllowed!==null)){renderer.shadowMap.needsUpdate=true;shadowPaintAt=t;}
 root.classList.toggle('overview',!state.zoom);root.classList.toggle('rocket-inspect',!!state.rocketInspect);
 size();const aspect=canvas.clientWidth/canvas.clientHeight;focusHalo.visible=!!state.focusDone;focusHalo.position.set(player.x,.065,player.y);
 cameraPose(t);
 if(liftStarted){const p=reduceMotion?1:Math.min(1,(t-liftStarted)/4200);rocket.position.y=.37+(reduceMotion?25:p*p*32);flame.visible=p<1;flame.scale.y=1+Math.sin(t*.018)*.1;if(p>=1){liftStarted=0;canvas.dataset.launchAnimation='complete';const done=liftCallback;liftCallback=null;if(done)done();}}
 const mp=mission.step===2?[19.6,6]:mission.step===4?[15.7,9.5]:[3.5,7.15];missionBeacon.visible=mission.type!==null&&mission.step<5;missionBeacon.position.set(mp[0],.23,mp[1]);
 for(const {p,rig:r}of humans){if(!p.mine){p.x+=(p.tx-p.x)*.22;p.y+=(p.ty-p.y)*.22;}r.g.visible=!(p.mine&&state.zoom&&state.cameraMode==='first')&&(!captureAllowed||p.mine||captureAllowed.has(p.id));r.g.position.set(p.x,p.sitting?-.18:0,p.y);r.longHair.visible=p.gender==='female';r.glasses.visible=p.accessory==='glasses';r.headset.visible=p.accessory==='headset';if(r.coat!==p.coat){r.coat=p.coat;r.torso.material=cloth(p.coat);r.arms.forEach(a=>{a.sleeve.material=cloth(p.coat);a.elbow.children[0].material=cloth(p.coat);});}r.book.visible=p.sitting;r.legs.forEach((leg,i)=>{leg.hip.rotation.x=p.sitting?-Math.PI/2:(p.mine&&moving?Math.sin(t*.009+i*Math.PI)*.35:0);leg.knee.rotation.x=p.sitting?Math.PI/2:0;});r.arms.forEach((a,i)=>{a.shoulder.rotation.set(p.sitting?-.8:(p.mine&&moving?Math.sin(t*.009+i*Math.PI)*-.25:0),0,0);a.elbow.rotation.x=p.sitting?-.4:0;});if((p.mine&&t<waveUntil)||(!p.mine&&t<(p.waveUntil||0))){r.arms[1].shoulder.rotation.z=-2.3+Math.sin(t*.015)*.18;r.arms[1].elbow.rotation.x=-.35;}if(p.mine&&p.sitting)r.g.rotation.y=Math.PI;else if(!p.mine)r.g.rotation.y=p.sitting?Math.PI:-.3;r.head.rotation.z=p.mine&&t<waveUntil?-.07:0;
 const position=project(new T.Vector3(p.x,1.95+(p.sitting?-.18:0),p.y));r.tag.hidden=!position.visible||(p.mine&&state.zoom&&state.cameraMode==='first');r.tag.style.left=position.x+'px';r.tag.style.top=position.y+'px';r.tag.textContent=(p.mine&&state.verifiedLevel?'레벨 '+state.verifiedLevel+' ':'')+p.name()+(p.mine?' · 나':'')+(p.sitting?' · 앉아 있음':'');
 r.sayEl.hidden=!(p.mine?t<bubbleUntil:t<(p.speechUntil||0));if(!r.sayEl.hidden){r.sayEl.style.left=position.x+'px';r.sayEl.style.top=(position.y-30)+'px';r.sayEl.textContent=p.mine?bubble:p.speech;}
 }
 ring.visible=!state.zoom;ring.position.set(player.x,.05,player.y);destination.visible=!!target;if(target)destination.position.set(target.x,.052,target.y);
 const placements={desk:[.29,.35],mission:[.22,.57],board:[.66,.42],chat:[.40,.76],terrace:[.70,.74],launch:[.83,.21]};for(const [i,p]of pins.entries()){const v=project(new T.Vector3(p.px,.4,p.pz)),xy=placements[p.id],lx=canvas.clientWidth*xy[0],ly=canvas.clientHeight*xy[1];p.el.hidden=false;p.el.style.left=lx+'px';p.el.style.top=ly+'px';const l=leaderLines[i];l.setAttribute('x1',v.x);l.setAttribute('y1',v.y);l.setAttribute('x2',lx);l.setAttribute('y2',ly);}
 routeLine.visible=!!target;
 renderer.render(scene,camera);
 // Apply a downgrade on the next render, so the current photo can never capture a resized blank buffer.
 quality.record(performance.now()-measuredStart,continuousGap);
 {closeBy=nearest();const btn=root.querySelector('[data-action="interact"]');btn.disabled=!closeBy;btn.textContent=closeBy?closeBy.label:'가까이 다가가 상호작용';if(previousNear!==closeBy?.id){previousNear=closeBy?.id||'';btn.classList.toggle('ready',!!closeBy);}lastUI=t;}
 }
 let continuousRender=false;
 function schedule(){dirty=true;if(!anim&&!document.hidden&&inView)anim=requestAnimationFrame(frame);}
 function frame(t){anim=0;if(t-last<32){schedule();return;}const gap=continuousRender?t-last:0;continuousRender=false;const dt=Math.min((t-last)/1000||.033,.06);last=t;let moving=false;const kx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),kz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
 if(kx||kz){target=null;path=[];pathFor=null;const len=Math.hypot(kx,kz),speed=2.8*dt;moving=move((kx*Math.cos(state.zoom?orbit.yaw:.087)+kz*Math.sin(state.zoom?orbit.yaw:.087))/len*speed,(-kx*Math.sin(state.zoom?orbit.yaw:.087)+kz*Math.cos(state.zoom?orbit.yaw:.087))/len*speed);}
 else if(target){const key=target.x+':'+target.y;if(pathFor!==key){pathFor=key;path=findPath(target.x,target.y);routeLine.geometry.dispose();routeLine.geometry=new T.BufferGeometry().setFromPoints([new T.Vector3(player.x,.23,player.y),...path.map(p=>new T.Vector3(p.x,.23,p.y))]);routeLine.computeLineDistances();if(!path.length){target=null;arrival=null;status('가구가 있는 위치예요. 빈 바닥이나 장소 버튼을 눌러주세요.');}}
 if(target&&path.length){const next=path[0],dx=next.x-player.x,dz=next.y-player.y,d=Math.hypot(dx,dz),s=2.8*dt;if(d<s){player.x=next.x;player.y=next.y;path.shift();}else moving=move(dx/d*s,dz/d*s);if(!path.length){target=null;pathFor=null;const fn=arrival;arrival=null;status('도착했어요. 가까운 대상에 E로 상호작용할 수 있어요.');if(fn)fn();}}
 }
 paint(t,moving,gap);if(t-lastPosition>500){lastPosition=t;emit('position',{x:player.x,y:player.y,sitting:player.sitting});}dirty=false;if((target||keys.size||cameraSettling||liftStarted||t<waveUntil||t<bubbleUntil||humans.some(h=>!h.p.mine&&(Math.abs(h.p.tx-h.p.x)>.02||Math.abs(h.p.ty-h.p.y)>.02||t<(h.p.waveUntil||0)||t<(h.p.speechUntil||0))))&&!anim){continuousRender=true;anim=requestAnimationFrame(frame);}
 }
 function tapWorld(e){
 if(state.panel==='entry'||mission.launching)return;
 if(state.focused){status('집중을 잠시 쉬려면 아래의 쉬기 버튼을 눌러주세요.');return;}
 open('welcome');const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);ray.setFromCamera(mouse,camera);
 if(ray.intersectObject(launchCourt,true).length||ray.intersectObject(missionConsole,true).length){walk(15.7,9.5,()=>open('launch'));return;}
 if(ray.intersectObject(boardGroup,true).length){walk(19.6,6,()=>open(state.presentation?'presentation':'board'));return;}
 if(ray.intersectObject(resourceRack,true).length){walk(8.5,10.3,()=>open('curriculum'));return;}
 const seatHits=ray.intersectObjects(seatObjects,true);if(seatHits.length){walk(3.5,7.15,sitAtDesk);return;}
 for(const {p,rig:r}of humans){if(p.mine)continue;if(ray.intersectObject(r.g,true).length){walk(p.x-.55,p.y+.75,()=>{open('chat');greet();});return;}}
 const pt=new T.Vector3();if(ray.ray.intersectPlane(ground,pt)&&!blocked(pt.x,pt.z))walk(pt.x,pt.z);else status('빈 바닥을 누르거나 WASD·방향키로 움직여 주세요.');
 }
 const pointers=new Map();let gesture=null,pinchDistance=0;
 function pinchGap(){const p=[...pointers.values()];return p.length===2?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
 canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size===1)gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,dragged:false};
   else{if(gesture)gesture.dragged=true;pinchDistance=pinchGap();}
 });
 canvas.addEventListener('pointermove',e=>{
   if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size===2){const gap=pinchGap();if(pinchDistance)orbit.distance=Math.max(4.5,Math.min(13,orbit.distance*pinchDistance/gap));pinchDistance=gap;state.zoom=true;schedule();return;}
   if(!gesture||gesture.id!==e.pointerId)return;
   if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>7)gesture.dragged=true;
   if(gesture.dragged){state.zoom=true;orbit.yaw-=(e.clientX-gesture.lastX)*.006;orbit.pitch=Math.max(-.65,Math.min(.65,orbit.pitch+(e.clientY-gesture.lastY)*.004));schedule();}
   gesture.lastX=e.clientX;gesture.lastY=e.clientY;
 });
 function releasePointer(e){const tap=e.type==='pointerup'&&gesture?.id===e.pointerId&&!gesture.dragged&&pointers.size===1;pointers.delete(e.pointerId);if(pointers.size===0){gesture=null;pinchDistance=0;}if(tap)tapWorld(e);}
 ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,releasePointer));
 canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=true;orbit.pitch=Math.max(-.65,Math.min(.65,orbit.pitch+Math.sign(e.deltaY)*.035));schedule();},{passive:false});

 new ResizeObserver(schedule).observe(canvas);new IntersectionObserver(es=>{inView=es[0].isIntersecting;if(inView)schedule();else if(anim){cancelAnimationFrame(anim);anim=0;continuousRender=false;}}).observe(canvas);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(anim)cancelAnimationFrame(anim);anim=0;continuousRender=false;}else{last=performance.now();schedule();}});
 function syncPeers(items){
 items=items.slice(0,matchMedia('(max-width: 700px)').matches?4:8);const ids=new Set(items.map(p=>p.id));for(let i=humans.length-1;i>=0;i--){const h=humans[i];if(!h.p.mine&&!ids.has(h.p.id)){scene.remove(h.rig.g);h.rig.tag.remove();h.rig.sayEl.remove();h.rig.g.traverse(o=>{if(o.geometry)o.geometry.dispose();});humans.splice(i,1);}}
 for(const item of items.slice(0,matchMedia('(max-width: 700px)').matches?4:8)){let h=humans.find(h=>h.p.id===item.id);if(!h){const p={id:item.id,x:item.x,y:item.y,tx:item.x,ty:item.y,gender:item.gender,coat:item.coat,name:()=>p.label,level:()=>0,mine:false,sitting:false,label:item.name};h={p,rig:makeHuman(p)};humans.push(h);}Object.assign(h.p,{label:item.name,gender:item.gender,coat:item.coat,accessory:item.accessory,tx:item.x,ty:item.y,sitting:item.sitting});if(item.wave)h.p.waveUntil=performance.now()+1800;}schedule();
 }
 function command(data){
 if(data.type==='progress'){setCohortProgress(data.payload);state.verifiedLevel=Number.isSafeInteger(data.payload.level)&&data.payload.level>0?data.payload.level:undefined;state.verifiedXp=Number.isSafeInteger(data.payload.xp)&&data.payload.xp>=0?data.payload.xp:undefined;state.verifiedLaunch=data.payload.launched===true;update();}
 if(data.type==='cohort-launch'&&state.verifiedCohortGoal&&!state.closedZones?.includes('launch')){launch(()=>status('확인된 공동 목표 달성 기념 연출입니다. 새 기록이나 성장 점수는 적립하지 않습니다.'));}
 if(data.type==='launch'&&state.verifiedLaunch&&!state.closedZones?.includes('launch')){launch(()=>status('서버에 기록된 발사를 다시 보았어요. 보상은 중복 적립되지 않습니다.'));}
 if(data.type==='controls'){state.closedZones=Array.isArray(data.payload.closedZones)?data.payload.closedZones.filter(z=>spacePoints.some(p=>p.id===z)):[];for(const p of pins){p.el.disabled=state.closedZones.includes(p.id);p.el.setAttribute('aria-disabled',String(p.el.disabled));}$('#ms-live-demo').disabled=state.closedZones.includes('board');for(const b of $('#ms-exhibition').querySelectorAll('button'))b.disabled=state.closedZones.includes('board');}
 if(data.type==='exhibition'){state.exhibitionDemo=data.payload.demo===true;state.exhibition=Array.isArray(data.payload.items)?data.payload.items.filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&typeof p.alias==='string').slice(0,3).map(p=>({id:p.id.slice(0,40),title:p.title.slice(0,120),alias:p.alias.slice(0,24)})):[];const list=$('#ms-exhibition');list.replaceChildren();for(const p of state.exhibition){const button=document.createElement('button');button.dataset.action='exhibit';button.dataset.post=p.id;button.textContent='작품 · '+p.title;button.disabled=state.closedZones?.includes('board')||false;list.append(button);}list.hidden=!state.exhibition.length;paintPresentation(state.presentation);}
 if(data.type==='presentation'){state.presentation=data.payload.session&&typeof data.payload.session.title==='string'?{title:data.payload.session.title.slice(0,120)}:null;paintPresentation(state.presentation);}
 if(data.type==='focus-status'){state.focusDone=data.payload.done===true;$('#ms-focus-finish').hidden=!state.focusDone;}
 if(data.type==='speech'){const text=String(data.payload.text||'').slice(0,120);if(data.payload.id==='self')say(text);else{const h=humans.find(h=>h.p.id===data.payload.id);if(h){h.p.speech=text;h.p.speechUntil=performance.now()+3500;}}}
 if(data.type==='profile'){state.deskTheme=['orbital','night','garden'].includes(data.payload.deskTheme)?data.payload.deskTheme:'orbital';personalizeDesk();state.name=String(data.payload.name||'문샷 동료').slice(0,24);state.gender=data.payload.gender==='female'?'female':'male';state.accessory=['glasses','headset'].includes(data.payload.accessory)?data.payload.accessory:'none';state.coat=/^#[0-9a-f]{6}$/i.test(data.payload.coat)?data.payload.coat:'#527086';update();}
 if(data.type==='peers')syncPeers(data.payload.items||[]);
 if(data.type==='zone'){const p=spacePoints.find(p=>p.id===data.payload.id);if(p&&!state.closedZones?.includes(p.id))walk(p.x,p.z,()=>{if(p.id==='desk')emit('seat');else if(p.id!=='terrace')emit('navigate',{section:p.id});});}
 if(data.type==='desk-seat'){myDeskIndex=Math.max(0,Math.min(2,Number(data.payload.index)||0));personalizeDesk();}
 if(data.type==='seat'){myDeskIndex=Math.max(0,Math.min(2,Number(data.payload.index)||0));personalizeDesk();const seats=[[3.5,7.15],[7.5,3.05],[3.1,3.25]];const point=seats[Math.max(0,Math.min(2,Number(data.payload.index)||0))];walk(point[0],point[1],()=>{player.sitting=true;seatCamera();emit('position',{x:player.x,y:player.y,sitting:true});});}
 if(data.type==='stand'){player.sitting=false;walk(4.7,7.6);}
 if(data.type==='camera'){state.zoom=data.payload.mode!=='map';state.cameraMode=data.payload.mode==='first'?'first':'third';}
 if(data.type==='wave')greet();
 if(data.type==='photo'){captureAllowed=new Set(Array.isArray(data.payload.allowedIds)?data.payload.allowedIds:[]);paint();try{const url=canvas.toDataURL('image/png');emit('photo',{url});}catch{emit('error',{message:'사진을 저장하지 못했습니다.'});}captureAllowed=null;shadowPaintAt=-Infinity;paint();}
 schedule();
 }
 engine={command,syncPeers,render:schedule,wake:schedule,interact,seatCamera,resetCamera,routeCamera,launch};emit('ready');if(bridgePeers.length)syncPeers(bridgePeers);root.querySelector('#ms-loading').hidden=true;schedule();status('문샷 궤도 정거장 · 공간을 선택하면 내부에서 이동합니다.');
}
window.addEventListener('message',e=>{const d=e.data;if(e.source!==parent||e.origin!==location.origin||!d||d.source!=='moonshot-host'||d.token!==bridgeToken||typeof bridgeToken!=='string'||bridgeToken.length<32)return;if(d.type==='init'){bridgeReady=true;if(engine)emit('ready');return;}if(!bridgeReady||!d.payload||typeof d.payload!=='object')return;if(d.type==='peers')bridgePeers=(d.payload.items||[]).slice(0,24);engine?.command(d);});
const readyPoll=setInterval(()=>{if(parent!==window&&bridgeToken)parent.postMessage({source:'moonshot-world',token:bridgeToken,type:'boot',payload:{}},location.origin);if(bridgeReady)clearInterval(readyPoll);},500);
window.addEventListener('pagehide',()=>{clearInterval(readyPoll);audioCtx?.close();},{once:true});
boot().catch(err=>{root.querySelector('#ms-loading').textContent='3D 공간을 불러오지 못했어요. 페이지를 새로고침해 주세요.';emit('error',{message:'3D를 표시할 수 없어 가벼운 공간 메뉴를 사용해 주세요.'});});
update();renderPanel();
})();
