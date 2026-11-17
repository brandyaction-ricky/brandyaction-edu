import { getCampusRoom, getCampusRoute, advanceAlongPath, pointInPolygon, getCampusCollisionRects, resolveCampusMovement, getCampusPortalAt, getCampusRoomPortal } from './campus-plan.js';

const ATTACHED=Symbol('campus-navigation');
const finite=Number.isFinite;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const point=value=>value&&finite(value.x)&&finite(value.y)?{x:value.x,y:value.y}:null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const same=(a,b)=>distance(a,b)<1e-6;
const interpolate=(a,b,t)=>a+(b-a)*t;
const key=p=>p.x.toFixed(5)+','+p.y.toFixed(5);

/** Center the interactive office in the available work area; scenery is decorative. */
export function getCampusViewFrame({visible,height},roomId,exteriorMode){
  if(roomId!=='office'||exteriorMode!=='launch-axis-backdrop')return{left:0,top:0,width:visible,height};
  return{left:12,top:8,width:Math.max(96,visible-24),height:Math.max(96,height-16),panX:0};
}

/** Connect the current position to the existing corridor graph, so changing
 * destinations mid-walk never jumps across space or cuts through a module. */
export function routeFromPosition(position,destination,plan) {
  if(!point(position)||!getCampusRoom(destination,plan))return [];
  const nodes=new Map(),edges=new Map(),segments=[];
  const addNode=p=>{const id=key(p);if(!nodes.has(id)){nodes.set(id,{...p});edges.set(id,new Map());}return id;};
  const connect=(a,b)=>{const ka=addNode(a),kb=addNode(b),cost=distance(a,b);edges.get(ka).set(kb,cost);edges.get(kb).set(ka,cost);};
  let target=null;
  const roomIds=(plan?.rooms||[]).map(room=>room.id);
  for(const from of roomIds)for(const to of roomIds) {
    if(from===to)continue;
    const path=getCampusRoute(from,to,plan).map(point).filter(Boolean);
    if(to===destination&&path.length)target=path.at(-1);
    for(let i=1;i<path.length;i++){connect(path[i-1],path[i]);segments.push([path[i-1],path[i]]);}
  }
  if(!target)return [];
  const start=addNode(position),end=addNode(target);
  if(start===end)return [];
  let bestSegment=null,bestGap=Infinity,bestProjection=null;
  for(const [a,b]of segments){const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)continue;const t=clamp(((position.x-a.x)*dx+(position.y-a.y)*dy)/length,0,1);const projection={x:a.x+dx*t,y:a.y+dy*t};const gap=distance(position,projection);if(gap<bestGap){bestGap=gap;bestSegment=[a,b];bestProjection=projection;}}
  if(bestSegment){connect(position,bestProjection);connect(bestProjection,bestSegment[0]);connect(bestProjection,bestSegment[1]);}
  const costs=new Map([[start,0]]),previous=new Map(),unvisited=new Set(nodes.keys());
  while(unvisited.size){let current=null,best=Infinity;for(const idof of unvisited){const cost=costs.get(idof)??Infinity;if(cost<best){current=idof;best=cost;}}if(current===null||current===end)break;unvisited.delete(current);for(const [neighbor,cost]of edges.get(current)){if(!unvisited.has(neighbor))continue;const next=best+cost;if(next<(costs.get(neighbor)??Infinity)){costs.set(neighbor,next);previous.set(neighbor,current);}}}
  if(!costs.has(end))return [];
  const result=[];for(let current=end;current!==start;current=previous.get(current)){if(!current)return [];result.push(nodes.get(current));}
  return result.reverse().filter((p,index,list)=>index||!same(p,position)).map(p=>({...p}));
}


/** Collision-safe approach to a room's own door, including from a manually moved position. */
export function findInRoomPath(start,end,roomId,plan) {
  const room=getCampusRoom(roomId,plan);if(!room||!point(start)||!point(end))return [];
  const radius=.22,rects=getCampusCollisionRects(roomId,plan),outline=room.outline;
  const walkable=p=>{
    if(!pointInPolygon(p,outline))return false;
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      const t=length?clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/length,0,1):0;
      if(Math.hypot(p.x-a[0]-dx*t,p.y-a[1]-dy*t)<radius-1e-5)return false;
    }
    return !rects.some(r=>p.x>r.minX-radius&&p.x<r.maxX+radius&&p.y>r.minY-radius&&p.y<r.maxY+radius);
  };
  const clear=(a,b)=>{const count=Math.max(1,Math.ceil(distance(a,b)/.1));for(let i=1;i<=count;i++)if(!walkable({x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count}))return false;return true;};
  if(!walkable(end))return [];
  if(same(start,end))return [];
  if(clear(start,end))return [{...end}];
  const step=.35,toPoint=([x,y])=>({x:x*step,y:y*step}),toKey=([x,y])=>x+','+y;
  const sx=Math.round(start.x/step),sy=Math.round(start.y/step),open=[],cost=new Map(),previous=new Map(),positions=new Map(),closed=new Set();
  const push=(id,priority)=>{open.push([id,priority]);let i=open.length-1;while(i>0){const parent=(i-1)>>1;if(open[parent][1]<=priority)break;[open[parent],open[i]]=[open[i],open[parent]];i=parent;}};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){open[0]=last;let i=0;for(;;){const left=i*2+1,right=left+1;let smallest=i;if(left<open.length&&open[left][1]<open[smallest][1])smallest=left;if(right<open.length&&open[right][1]<open[smallest][1])smallest=right;if(smallest===i)break;[open[i],open[smallest]]=[open[smallest],open[i]];i=smallest;}}return first?.[0];};
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
    const grid=[sx+dx,sy+dy],p=toPoint(grid),id=toKey(grid);if(!walkable(p)||!clear(start,p))continue;
    const g=distance(start,p);cost.set(id,g);positions.set(id,p);push(id,g+distance(p,end));
  }
  const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  let terminal=null,expanded=0;
  while(open.length&&expanded++<10000){
    const id=pop();if(closed.has(id))continue;closed.add(id);const current=positions.get(id);
    if(clear(current,end)){terminal=id;break;}
    const [gx,gy]=id.split(',').map(Number);
    for(const [dx,dy]of directions){const grid=[gx+dx,gy+dy],next=toPoint(grid),nextId=toKey(grid);if(closed.has(nextId)||!walkable(next)||!clear(current,next))continue;const nextCost=cost.get(id)+distance(current,next);if(nextCost>=(cost.get(nextId)??Infinity))continue;cost.set(nextId,nextCost);positions.set(nextId,next);previous.set(nextId,id);push(nextId,nextCost+distance(next,end));}
  }
  if(terminal===null)return [];
  const raw=[{...end}];for(let id=terminal;id!==undefined;id=previous.get(id))raw.push(positions.get(id));raw.reverse();
  const smooth=[];let current=start,index=0;
  while(index<raw.length){let furthest=index;for(let j=index+1;j<raw.length;j++)if(clear(current,raw[j]))furthest=j;smooth.push({...raw[furthest]});current=raw[furthest];index=furthest+1;}
  return smooth;
}

/** The current physical room, its local visitor, collision and keyboard controls. */
export function attachCampusNavigation(office,root,{reduceMotion=false,initialRoom='office',inputScope=globalThis,clock}={}) {
  if(!office||!root||!office.plan?.campus)return ()=>{};
  if(office[ATTACHED])return office[ATTACHED].cleanup;
  const plan=office.plan.campus,spawn=point(getCampusRoom(initialRoom,plan)?.arrival)||point(plan.spawn)||{x:27,y:22.2};
  const now=typeof clock==='function'?clock:()=>inputScope.performance?.now?.()??Date.now();
  const doc=inputScope.document||null;
  const requestFrame=typeof inputScope.requestAnimationFrame==='function'?inputScope.requestAnimationFrame.bind(inputScope):null;
  const cancelFrame=typeof inputScope.cancelAnimationFrame==='function'?inputScope.cancelAnimationFrame.bind(inputScope):null;
  const is3D=Boolean(office.gl&&office.camera&&office.controls);
  const originalDraw=office.draw,originalFit=office.fitCamera,originalRender=office.gl?.render,originalDestroy=office.destroy;
  let destroyed=false,physicalRoom=getCampusRoom(initialRoom,plan)?.id||'office',cameraEnabled=true,route=[],zoom=1,lastTick=now(),paused=false,raf=null,portalLock=0,localArrival=null;
  let flatCurrent=null,viewCurrent=null,lastWrittenZoom=office.camera?.zoom??1;
  const held=new Set(),listeners=[];
  const avatar={...spawn,moving:false,yaw:0,roomId:physicalRoom,targetRoomId:physicalRoom,jumpHeight:0,vy:0,motionTime:0};
  const inputState={paused:false,keys:[],jumping:false};
  office.campusAvatar=avatar;office.campusInputState=inputState;

  function emit(type,detail){
    if(typeof root.dispatchEvent!=='function')return;
    const EventClass=inputScope.CustomEvent||globalThis.CustomEvent;
    if(typeof EventClass==='function')root.dispatchEvent(new EventClass(type,{detail}));
  }
  function syncInputState(){inputState.paused=paused;inputState.keys=[...held];inputState.jumping=avatar.jumpHeight>0||avatar.vy!==0;}
  function notify(){
    if(root.dataset){root.dataset.room=physicalRoom;root.dataset.campusTravelling=String(route.length>0);}
    emit('campus-room-change',{roomId:physicalRoom,travelling:route.length>0,avatarRoomId:physicalRoom,targetRoomId:avatar.targetRoomId,paused});
  }
  function width(){
    const actual=Math.max(1,Number(office.cw)||root.clientWidth||1),inset=typeof office.inset==='function'?office.inset():0;
    return{actual,visible:Math.max(120,actual-(finite(inset)?inset:0)),height:Math.max(1,Number(office.ch)||root.clientHeight||1)};
  }
  function positionBackdrop(frame){
    const host=root.closest?.('.workspace');if(!host?.style||office.campusExterior?.mode!=='launch-axis-backdrop')return;
    const value=(frame.panX||0).toFixed(2)+'px';if(host.style.getPropertyValue('--campus-pan-x')!==value)host.style.setProperty('--campus-pan-x',value);
  }
  function ownsCamera(){return cameraEnabled&&!destroyed&&!root.dataset?.employeeFocus&&!root.dataset?.studyCamera;}
  function viewPoints(){const room=getCampusRoom(physicalRoom,plan);return room?room.outline.map(p=>Array.isArray(p)?{x:p[0],y:p[1]}:p):[];}
  function scenePoints(){return [
    ...viewPoints().flatMap(p=>[0,3.5].map(y=>({x:p.x,y,z:p.y}))),
    ...(physicalRoom==='office'&&Array.isArray(office.campusExterior?.viewPoints)?office.campusExterior.viewPoints:[]),
  ];}
  function target(){const room=getCampusRoom(physicalRoom,plan);return{x:room.center.x,y:1.1,z:room.center.y};}
  function easing(){return reduceMotion?1:.16;}
  function applyFlat(){
    if(!ownsCamera()||typeof office.iso!=='function')return;
    const corners=scenePoints().map(p=>office.iso(p.x,p.z,p.y)).filter(p=>finite(p.x)&&finite(p.y));if(!corners.length)return;
    const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
    const surface=width(),frame=getCampusViewFrame(surface,physicalRoom,office.campusExterior?.mode);
    positionBackdrop(frame);
    const selected=office.campusExterior?.mode==='launch-axis-backdrop'&&physicalRoom==='office';
    const scale=clamp(Math.min((frame.width-(selected?0:65))/(maxX-minX+(selected?20:50)),(frame.height-(selected?0:45))/(maxY-minY+(selected?20:40)))*zoom,.12,4.5);
    const desired={zoom:scale,ox:frame.left+frame.width/2-(minX+maxX)*scale/2,oy:frame.top+frame.height/2-(minY+maxY)*scale/2};
    if(!flatCurrent)flatCurrent=office.cam&&['zoom','ox','oy'].every(k=>finite(office.cam[k]))?{...office.cam}:{...desired};
    for(const field of ['zoom','ox','oy'])flatCurrent[field]=interpolate(flatCurrent[field],desired[field],easing());
    office.cam={...flatCurrent};
  }
  function apply3D(){
    if(!ownsCamera())return;
    const camera=office.camera,controls=office.controls;if(!camera?.position||!controls?.target||!['left','right','top','bottom'].every(k=>finite(camera[k])))return;
    if(finite(camera.zoom)&&Math.abs(camera.zoom-lastWrittenZoom)>.0001)zoom=clamp(camera.zoom,.45,4);
    const offset={x:camera.position.x-controls.target.x,y:camera.position.y-controls.target.y,z:camera.position.z-controls.target.z};
    if(![offset.x,offset.y,offset.z].every(finite))return;
    const horizontal=Math.hypot(offset.x,offset.z)||1,length=Math.hypot(offset.x,offset.y,offset.z)||1;
    const right={x:offset.z/horizontal,y:0,z:-offset.x/horizontal},up={x:-offset.y*offset.x/(horizontal*length),y:horizontal/length,z:-offset.y*offset.z/(horizontal*length)};
    const aim=target(),projected=scenePoints().map(p=>{const d={x:p.x-aim.x,y:p.y-aim.y,z:p.z-aim.z};return{x:d.x*right.x+d.z*right.z,y:d.x*up.x+d.y*up.y+d.z*up.z};});if(!projected.length)return;
    const surface=width(),frame=getCampusViewFrame(surface,physicalRoom,office.campusExterior?.mode);
    positionBackdrop(frame);
    let w=(Math.max(...projected.map(p=>p.x))-Math.min(...projected.map(p=>p.x)))*1.06+1,h=(Math.max(...projected.map(p=>p.y))-Math.min(...projected.map(p=>p.y)))*1.06+.7;
    const cx=(Math.min(...projected.map(p=>p.x))+Math.max(...projected.map(p=>p.x)))/2,cy=(Math.min(...projected.map(p=>p.y))+Math.max(...projected.map(p=>p.y)))/2;
    const unit=Math.max(w/frame.width,h/frame.height),centerX=frame.left+frame.width/2,centerY=frame.top+frame.height/2;
    const viewX=cx+(surface.actual/2-centerX)*unit/zoom,viewY=cy+(centerY-surface.height/2)*unit/zoom;
    const desired={target:aim,position:{x:aim.x+offset.x,y:aim.y+offset.y,z:aim.z+offset.z},left:viewX-surface.actual*unit/2,right:viewX+surface.actual*unit/2,top:viewY+surface.height*unit/2,bottom:viewY-surface.height*unit/2};
    if(!viewCurrent)viewCurrent={target:{x:controls.target.x,y:controls.target.y,z:controls.target.z},position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom};
    const amount=easing();for(const type of ['target','position'])for(const axis of ['x','y','z'])viewCurrent[type][axis]=interpolate(viewCurrent[type][axis],desired[type][axis],amount);
    for(const field of ['left','right','top','bottom'])viewCurrent[field]=interpolate(viewCurrent[field],desired[field],amount);
    for(const axis of ['x','y','z']){camera.position[axis]=viewCurrent.position[axis];controls.target[axis]=viewCurrent.target[axis];}
    for(const field of ['left','right','top','bottom'])camera[field]=viewCurrent[field];camera.zoom=zoom;lastWrittenZoom=zoom;
    camera.lookAt?.(controls.target);camera.updateProjectionMatrix?.();camera.updateMatrixWorld?.(true);
  }
  function blocked(event){
    if(root.inert||doc?.hidden||office.campusStudyLocked)return true;
    const active=event?.target||doc?.activeElement;
    if(active?.isContentEditable)return true;
    if(/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(active?.tagName||''))return true;
    if(active?.closest?.('[contenteditable="true"],[contenteditable=""],[role="textbox"],input,textarea,select'))return true;
    return Boolean(doc?.querySelector?.('[role="dialog"][aria-modal="true"]:not([hidden])'));
  }
  function drawOnce(){if(!destroyed&&office.visible!==false&&typeof office.draw==='function')office.draw();}
  function clearHeld(){held.clear();syncInputState();}
  function needsInputFrame(){return !destroyed&&!paused&&!blocked()&&(held.size>0||avatar.jumpHeight>0||avatar.vy!==0);}
  function scheduleInputFrame(){
    if(raf!==null||!requestFrame||!needsInputFrame())return;
    raf=requestFrame(()=>{raf=null;if(destroyed)return;const elapsed=now()-lastTick;if(elapsed>8)drawOnce();if(needsInputFrame())scheduleInputFrame();});
  }
  function settleJump(){avatar.jumpHeight=0;avatar.vy=0;syncInputState();}
  function pauseCampusInput(){paused=true;clearHeld();avatar.moving=false;lastTick=now();if(raf!==null){cancelFrame?.(raf);raf=null;}notify();}
  function resumeCampusInput(){if(destroyed||blocked())return false;paused=false;lastTick=now();avatar.moving=route.length>0;syncInputState();notify();scheduleInputFrame();return true;}
  function resetCamera(){zoom=1;flatCurrent=null;viewCurrent=null;if(is3D){office.camera.zoom=1;lastWrittenZoom=1;}}
  function enterRoom(id,landing){
    physicalRoom=id;avatar.roomId=id;avatar.targetRoomId=id;avatar.x=landing.x;avatar.y=landing.y;avatar.moving=false;route=[];localArrival=null;portalLock=now()+500;
    settleJump();resetCamera();notify();
  }
  function checkPortal(){
    if(now()<portalLock)return false;
    const portal=getCampusPortalAt(avatar,physicalRoom,plan);if(!portal)return false;
    if(route.length&&avatar.targetRoomId!==portal.targetRoomId)return false;
    enterRoom(portal.targetRoomId,portal.landing);return true;
  }
  function inputDirection(){
    const horizontal=(held.has('ArrowRight')?1:0)-(held.has('ArrowLeft')?1:0),vertical=(held.has('ArrowDown')?1:0)-(held.has('ArrowUp')?1:0);
    if(!horizontal&&!vertical)return null;
    let right={x:Math.SQRT1_2,y:-Math.SQRT1_2},down={x:Math.SQRT1_2,y:Math.SQRT1_2};
    if(is3D){const dx=office.camera.position.x-office.controls.target.x,dy=office.camera.position.z-office.controls.target.z,length=Math.hypot(dx,dy);if(length>.0001){right={x:dy/length,y:-dx/length};down={x:dx/length,y:dy/length};}}
    const x=right.x*horizontal+down.x*vertical,y=right.y*horizontal+down.y*vertical,length=Math.hypot(x,y);
    return{x:x/length,y:y/length};
  }
  function advance(){
    const time=now(),delta=clamp((time-lastTick)/1000,0,.06);lastTick=time;
    if(destroyed)return;
    if(paused||blocked()){clearHeld();avatar.moving=false;return;}
    if(!delta)return;
    avatar.motionTime+=delta*1000;
    const direction=inputDirection(),before={x:avatar.x,y:avatar.y};
    if(direction){
      if(route.length){route=[];localArrival=null;avatar.targetRoomId=physicalRoom;notify();}
      const moved=resolveCampusMovement(avatar,{x:direction.x*delta*3.6,y:direction.y*delta*3.6},physicalRoom,plan);avatar.x=moved.position.x;avatar.y=moved.position.y;
    }else if(route.length){
      const moved=advanceAlongPath(avatar,route,delta*4.8);route=moved.path;avatar.x=moved.position.x;avatar.y=moved.position.y;
    }
    const dx=avatar.x-before.x,dy=avatar.y-before.y;avatar.moving=Math.hypot(dx,dy)>.00001;
    if(avatar.moving)avatar.yaw=Math.atan2(dx,dy);
    if(avatar.vy!==0||avatar.jumpHeight>0){avatar.jumpHeight+=avatar.vy*delta;avatar.vy-=14*delta;if(avatar.jumpHeight<=0){avatar.jumpHeight=0;avatar.vy=0;}}
    if(avatar.moving&&checkPortal()){syncInputState();return;}
    if(!route.length&&avatar.targetRoomId!==physicalRoom){
      const portal=getCampusRoomPortal(physicalRoom,plan);if(portal&&distance(avatar,portal.position)<=portal.triggerRadius+.001)enterRoom(portal.targetRoomId,portal.landing);
      else {avatar.targetRoomId=physicalRoom;notify();}
    }
    syncInputState();
    if(!route.length&&localArrival){const arrived=localArrival;localArrival=null;arrived();}
  }
  const wrappedDraw=function(...args){advance();return originalDraw.apply(this,args);};office.draw=wrappedDraw;
  const wrappedFit=!is3D&&typeof originalFit==='function'?function(...args){const result=originalFit.apply(this,args);applyFlat();return result;}:null;
  if(wrappedFit)office.fitCamera=wrappedFit;
  const wrappedRender=is3D&&typeof originalRender==='function'?function(...args){apply3D();return originalRender.apply(this,args);}:null;
  if(wrappedRender)office.gl.render=wrappedRender;
  const setCampusRoom=(id,{focus=true}={})=>{
    if(destroyed||typeof id!=='string'||!getCampusRoom(id,plan))return false;
    localArrival=null;
    cameraEnabled=focus!==false;if(cameraEnabled)office.resetEmployeeFocus?.({restore:false});resetCamera();
    if(id===physicalRoom){route=[];avatar.targetRoomId=physicalRoom;avatar.moving=false;notify();drawOnce();return true;}
    const portal=getCampusRoomPortal(physicalRoom,plan);if(!portal||portal.targetRoomId!==id)return false;
    avatar.targetRoomId=id;
    if(reduceMotion){enterRoom(id,portal.landing);drawOnce();return true;}
    route=findInRoomPath(avatar,portal.position,physicalRoom,plan);
    if(!route.length){if(distance(avatar,portal.position)<=portal.triggerRadius)enterRoom(id,portal.landing);else{avatar.targetRoomId=physicalRoom;notify();return false;}}
    else avatar.moving=true;
    lastTick=now();notify();drawOnce();return true;
  };
  const getRoom=()=>physicalRoom;
  const zoomCampus=factor=>{if(!finite(factor)||factor<=0||destroyed)return false;zoom=clamp(zoom*factor,.45,4);if(is3D){office.camera.zoom=zoom;lastWrittenZoom=zoom;}drawOnce();return true;};
  const resetCampusView=()=>{cameraEnabled=true;resetCamera();drawOnce();return true;};
  const walkCampusTo=(destination,{onArrive}={})=>{
    if(destroyed||paused||blocked({target:root})||physicalRoom!=='study'||!point(destination))return false;
    office.standCampusAvatar?.();
    const next=findInRoomPath(avatar,destination,physicalRoom,plan);
    if(!next.length){if(distance(avatar,destination)<.05){onArrive?.();return true;}return false;}
    if(reduceMotion){avatar.x=destination.x;avatar.y=destination.y;avatar.targetRoomId=physicalRoom;onArrive?.();drawOnce();return true;}
    route=next;localArrival=typeof onArrive==='function'?onArrive:null;avatar.targetRoomId=physicalRoom;avatar.moving=true;lastTick=now();notify();drawOnce();return true;
  };
  const setCampusDirection=(direction,active)=>{
    const code={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[direction];if(!code||destroyed)return false;
    if(!active){held.delete(code);syncInputState();drawOnce();return true;}
    if(physicalRoom!=='study'||paused||blocked({target:root}))return false;
    office.standCampusAvatar?.();root.focus?.({preventScroll:true});held.add(code);route=[];localArrival=null;avatar.targetRoomId=physicalRoom;
    emit('campus-player-control',{roomId:physicalRoom,key:code});syncInputState();drawOnce();scheduleInputFrame();return true;
  };
  const listen=(target,type,handler,options)=>{if(typeof target?.addEventListener!=='function')return;target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener?.(type,handler,options));};
  const gameKey=event=>event.code==='Space'||event.key===' '||event.key==='Spacebar'?'Space':['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)?event.code:['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)?event.key:physicalRoom==='study'?({KeyW:'ArrowUp',KeyA:'ArrowLeft',KeyS:'ArrowDown',KeyD:'ArrowRight'}[event.code]||{w:'ArrowUp',a:'ArrowLeft',s:'ArrowDown',d:'ArrowRight'}[event.key?.toLowerCase()]||null):null;
  const keyDown=event=>{
    if(physicalRoom==='study'&&(event.code==='KeyE'||event.key?.toLowerCase()==='e')&&!destroyed&&!paused&&!blocked(event)&&!event.repeat){event.preventDefault?.();emit('campus-interact',{roomId:physicalRoom});return;}
    const code=gameKey(event);if(!code||destroyed||blocked(event))return;
    event.preventDefault?.();if(paused)resumeCampusInput();
    if(physicalRoom==='study')office.standCampusAvatar?.();
    const first=!held.has(code);held.add(code);
    if(first){emit('campus-player-control',{roomId:physicalRoom,key:code});cameraEnabled=true;office.resetEmployeeFocus?.({restore:false});}
    if(code==='Space'&&first&&!event.repeat&&avatar.jumpHeight<=.00001&&avatar.vy===0)avatar.vy=5.8;
    if(code!=='Space'&&route.length){route=[];localArrival=null;avatar.targetRoomId=physicalRoom;avatar.moving=false;notify();}
    syncInputState();drawOnce();scheduleInputFrame();
  };
  const keyUp=event=>{const code=gameKey(event)||{KeyW:'ArrowUp',KeyA:'ArrowLeft',KeyS:'ArrowDown',KeyD:'ArrowRight'}[event.code];if(!code)return;const had=held.delete(code);if(had&&(code==='Space'||!blocked(event)))event.preventDefault?.();syncInputState();if(!held.size&&avatar.jumpHeight===0&&avatar.vy===0)drawOnce();};
  listen(doc||root,'keydown',keyDown);listen(doc||root,'keyup',keyUp);
  listen(inputScope,'blur',pauseCampusInput);listen(inputScope,'focus',resumeCampusInput);
  listen(root,'focus',resumeCampusInput);listen(doc,'visibilitychange',()=>{if(doc.hidden)pauseCampusInput();else resumeCampusInput();});
  Object.assign(office,{setCampusRoom,getCampusRoom:getRoom,getCampusVisibleRoom:getRoom,zoomCampus,resetCampusView,pauseCampusInput,resumeCampusInput,walkCampusTo,setCampusDirection});
  function cleanup(){
    if(destroyed)return;destroyed=true;clearHeld();avatar.moving=false;route=[];if(raf!==null){cancelFrame?.(raf);raf=null;}listeners.forEach(remove=>remove());
    if(office.draw===wrappedDraw)office.draw=originalDraw;if(wrappedFit&&office.fitCamera===wrappedFit)office.fitCamera=originalFit;if(wrappedRender&&office.gl.render===wrappedRender)office.gl.render=originalRender;
    for(const[name,fn]of Object.entries({setCampusRoom,getCampusRoom:getRoom,getCampusVisibleRoom:getRoom,zoomCampus,resetCampusView,pauseCampusInput,resumeCampusInput,walkCampusTo,setCampusDirection}))if(office[name]===fn)delete office[name];
    if(office.campusAvatar===avatar)delete office.campusAvatar;if(office.campusInputState===inputState)delete office.campusInputState;delete office[ATTACHED];
  }
  office.destroy=function(...args){cleanup();return originalDestroy?.apply(this,args);};office[ATTACHED]={cleanup};notify();return cleanup;
}
