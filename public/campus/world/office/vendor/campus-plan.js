import {getCampusInterior,getInteriorCollisionRects,getInteriorInteractionTargets} from './interior-layout.js';
/** Shared geometry for the two walkable lunar-campus pods. No browser or renderer dependencies. */
const ROOM_IDS = Object.freeze(['office', 'study']);
const point = (x, y) => ({ x, y });
const copyPoint = p => point(p.x, p.y);
// Keep the entrance fixed while giving the study lounge exactly three times the floor area.
export const STUDY_SCALE = Math.sqrt(3);
export const studyPoint = p => point(15.7+(p.x-15.7)*STUDY_SCALE,11+(p.y-11)*STUDY_SCALE);
export function getStudyDesks(){return [[5.3,7.9],[10.5,7.9],[5.3,13],[10.5,13]].map(([x,y])=>studyPoint({x,y}));}
export function getStudySeats(){return getStudyDesks().flatMap(({x,y},deskIndex)=>[.7,2.1].map((offset,chairIndex)=>({x:x+offset,y:y+1.35,deskIndex,chairIndex})));}
export function getStudyTerrace(plan=DEFAULT_PLAN){return getCampusRoom('study',plan)?.terrace||null;}
export function getStudyBookcase(){return {...studyPoint({x:5.6,y:5.4}),width:6.6};}


function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

function hexRoom(id, name, cx, cy, radiusX, radiusY, arrival) {
  const outline = [[-.5,-1],[.5,-1],[1,0],[.5,1],[-.5,1],[-1,0]]
    .map(([x,y]) => [cx + x * radiusX, cy + y * radiusY]);
  return { id, name, center: point(cx,cy), radiusX, radiusY, outline,
    arrival: copyPoint(arrival || point(cx,cy)),
    bounds: { minX: cx-radiusX, maxX: cx+radiusX, minY: cy-radiusY, maxY: cy+radiusY } };
}

/** Fresh, immutable layout; station indices are stable across every renderer and room visit. */
export function createCampusPlan() {
  const officeArrival=point(27,22.2);
  const rooms=[hexRoom('office','개인 사무실',27,17,8.3,7.6,officeArrival),
    hexRoom('study','공부방',studyPoint({x:9,y:11}).x,11,6.7*STUDY_SCALE,6.2*STUDY_SCALE)];
  const study=rooms[1],indoorOutline=study.outline,edgeY=study.bounds.maxY;
  const terraceBounds={minX:0,maxX:7.8,minY:edgeY,maxY:25.6};
  const terraceOutline=[[0,edgeY],[7.8,edgeY],[7.8,25.6],[0,25.6]];
  study.indoorOutline=indoorOutline;
  study.indoorBounds={...study.bounds};
  study.terrace={bounds:terraceBounds,outline:terraceOutline,
    entrance:{from:point(0,edgeY),to:point(7.8,edgeY),center:point(3.9,edgeY),width:7.8}};
  study.outline=[...indoorOutline.slice(0,4),[7.8,edgeY],[7.8,25.6],[0,25.6],[0,edgeY],...indoorOutline.slice(4)];
  study.bounds={...study.bounds,maxY:25.6};
  study.viewCenter=point(study.center.x,(study.bounds.minY+study.bounds.maxY)/2);
  study.viewRadiusY=(study.bounds.maxY-study.bounds.minY)/2;
  const officeSeats=[];
  for(let index=0;index<8;index++) {
    const row=index%4,wing=index<4?'left':'right',x=wing==='left'?21.8:30.8,y=12.3+row*2.7;
    officeSeats.push({x,y,side:wing==='left'?'n':'s',wing,index,lab:true,
      yaw:wing==='left'?-Math.PI/2:Math.PI/2,
      seat:point(wing==='left'?23.7:30.3,y+.6)});
  }
  const corridors=[
    {from:'office',to:'study',width:1.6,path:[point(18.7,17),point(17.2,17),point(17.2,11),point(15.7,11)]}
  ];
  return freezeTree({W:36,D:28,rooms,corridors,officeSeats,spawn:officeArrival,
    mission:{center:point(27,17),bounds:{minX:25,maxX:29,minY:15,maxY:19}},
    approaches:{study:[officeArrival,point(24.4,22.2),point(24.4,19.5),point(20.4,19.5),point(18.7,17)]}});
}

const DEFAULT_PLAN=createCampusPlan();

export function getCampusRoom(id, plan=DEFAULT_PLAN) {
  return plan?.rooms?.find(room=>room.id===id)||null;
}

/** Inclusive, edge-safe polygon membership for both [x,y] and point objects. */
export function pointInPolygon(p, outline) {
  const x=Array.isArray(p)?p[0]:p?.x,y=Array.isArray(p)?p[1]:p?.y;
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Array.isArray(outline)||outline.length<3)return false;
  let inside=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const a=outline[j],b=outline[i],dx=b[0]-a[0],dy=b[1]-a[1];
    const cross=(x-a[0])*dy-(y-a[1])*dx;
    if(Math.abs(cross)<1e-8&&x>=Math.min(a[0],b[0])-1e-8&&x<=Math.max(a[0],b[0])+1e-8&&y>=Math.min(a[1],b[1])-1e-8&&y<=Math.max(a[1],b[1])+1e-8)return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}

export function findCampusRoomAt(x,y,plan=DEFAULT_PLAN) {
  return plan?.rooms?.find(room=>pointInPolygon(point(x,y),room.outline))?.id||null;
}

function compactPath(path) {
  return path.filter((p,index)=>index===0||Math.hypot(p.x-path[index-1].x,p.y-path[index-1].y)>1e-9).map(copyPoint);
}

function routeFromOffice(destination,plan) {
  const corridor=plan.corridors.find(c=>c.from==='office'&&c.to===destination);
  const room=getCampusRoom(destination,plan);
  if(!corridor||!room||!plan.approaches?.[destination])return [];
  return compactPath([...plan.approaches[destination],...corridor.path,room.arrival]);
}

/** Routes contain the arrival point at each end, all doorway nodes, and the actual corridor elbows. */
export function getCampusRoute(fromId,toId,plan=DEFAULT_PLAN) {
  if(!ROOM_IDS.includes(fromId)||!ROOM_IDS.includes(toId)||!getCampusRoom(fromId,plan)||!getCampusRoom(toId,plan))return [];
  if(fromId===toId)return [copyPoint(getCampusRoom(fromId,plan).arrival)];
  if(fromId==='office')return routeFromOffice(toId,plan);
  if(toId==='office')return routeFromOffice(fromId,plan).reverse();
  return [];
}

/** Advance at most distance units along a polyline without mutating the route or skipping an elbow. */
export function advanceAlongPath(current,path,distance) {
  if(!Number.isFinite(current?.x)||!Number.isFinite(current?.y))throw new TypeError('A finite campus position is required.');
  if(!Array.isArray(path))throw new TypeError('A campus waypoint array is required.');
  const remaining=path.map(p=>{
    if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))throw new TypeError('Campus waypoints must be finite.');
    return copyPoint(p);
  });
  const position=copyPoint(current);
  let budget=Number.isFinite(distance)?Math.max(0,distance):0;
  while(remaining.length) {
    const next=remaining[0],dx=next.x-position.x,dy=next.y-position.y,length=Math.hypot(dx,dy);
    if(length<=1e-9){position.x=next.x;position.y=next.y;remaining.shift();continue;}
    if(budget<=0)break;
    if(length<=budget+1e-9){position.x=next.x;position.y=next.y;budget=Math.max(0,budget-length);remaining.shift();}
    else{position.x+=dx/length*budget;position.y+=dy/length*budget;budget=0;break;}
  }
  return {position,path:remaining,arrived:remaining.length===0};
}

/** Solid furniture footprints shared with both renderers. Chairs are real geometry, not simulated occupants. */
export function getCampusCollisionRects(roomId,plan=DEFAULT_PLAN) {
  if(!getCampusRoom(roomId,plan))return [];
  const rect=(id,x,y,w,d)=>({id,minX:x,maxX:x+w,minY:y,maxY:y+d});
  if(roomId==='office') {
    const result=[];
    for(const desk of plan.officeSeats||[]) {
      result.push(rect('station-'+desk.index,desk.x-.12,desk.y-.12,1.64,1.44));
      result.push(rect('station-chair-'+desk.index,desk.seat.x-.33,desk.seat.y-.33,.66,.66));
    }
    const mission=plan.mission;
    if(mission?.bounds)result.push({id:'mission-table',
      minX:Math.min(mission.bounds.minX,mission.center.x-2.28),maxX:Math.max(mission.bounds.maxX,mission.center.x+2.28),
      minY:Math.min(mission.bounds.minY,mission.center.y-1.95),maxY:Math.max(mission.bounds.maxY,mission.center.y+1.95)});
    result.push(rect('oxygen-module',21.9,22.2,1.25,.95),rect('specimen-storage',31,22.1,1.1,.7));
    return [...result,...getInteriorCollisionRects(roomId)];
  }
  if(roomId==='study') {
    const result=[];
    for(const [index,{x,y}]of getStudyDesks().entries()) {
      result.push(rect('study-table-'+index,x-.07,y-.06,2.94,1.32));
      for(const [chair,offset]of[.7,2.1].entries())result.push(rect('study-chair-'+index+'-'+chair,x+offset-.23,y+1.35,.46,.46));
    }
    const bookcase=getStudyBookcase();result.push(rect('study-bookcase',bookcase.x,bookcase.y,bookcase.width,.45));
    return [...result,...getInteriorCollisionRects(roomId)];
  }
  return [];
}

function distanceToSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],lengthSquared=dx*dx+dy*dy;
  const t=lengthSquared>0?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/lengthSquared)):0;
  return Math.hypot(p.x-a[0]-dx*t,p.y-a[1]-dy*t);
}

function circleInRoom(p,radius,room) {
  if(!pointInPolygon(p,room.outline))return false;
  if(radius<=0)return true;
  return room.outline.every((a,index)=>distanceToSegment(p,a,room.outline[(index+1)%room.outline.length])>=radius-1e-8);
}

function circleHitsRect(p,radius,rect) {
  if(p.x>rect.minX&&p.x<rect.maxX&&p.y>rect.minY&&p.y<rect.maxY)return true;
  const x=Math.max(rect.minX,Math.min(rect.maxX,p.x)),y=Math.max(rect.minY,Math.min(rect.maxY,p.y));
  return (p.x-x)**2+(p.y-y)**2<radius*radius-1e-10;
}

/** Collision-safe manual movement: bounded frame steps and axis sliding retain the reachable component. */
export function resolveCampusMovement(position,delta,roomId,plan=DEFAULT_PLAN,{radius=.22}={}) {
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))throw new TypeError('A finite campus position is required.');
  const result=copyPoint(position),room=getCampusRoom(roomId,plan);
  if(!room||!Number.isFinite(delta?.x)||!Number.isFinite(delta?.y))return {position:result,collided:true};
  const safeRadius=Number.isFinite(radius)?Math.max(0,Math.min(2,radius)):.22;
  const obstacles=getCampusCollisionRects(roomId,plan);
  const free=p=>circleInRoom(p,safeRadius,room)&&!obstacles.some(rect=>circleHitsRect(p,safeRadius,rect));
  const requested=Math.hypot(delta.x,delta.y);
  if(requested<=1e-10)return {position:result,collided:!free(result)};
  // Normal input is a fraction of a world unit per frame. Bound arbitrary input while preserving substeps.
  const distance=Math.min(64,requested),factor=distance/requested;
  const count=Math.max(1,Math.ceil(distance/.1)),dx=delta.x*factor/count,dy=delta.y*factor/count;
  let collided=distance<requested;
  for(let index=0;index<count;index++) {
    const candidate=point(result.x+dx,result.y+dy);
    if(free(candidate)){result.x=candidate.x;result.y=candidate.y;continue;}
    collided=true;
    const xOnly=point(result.x+dx,result.y);if(free(xOnly)){result.x=xOnly.x;}
    const yOnly=point(result.x,result.y+dy);if(free(yOnly)){result.y=yOnly.y;}
  }
  return {position:result,collided};
}

/** Interaction thresholds sit inside the hull so the player never has to cross a collision wall. */
export function getCampusRoomPortal(roomId,plan=DEFAULT_PLAN) {
  const office=getCampusRoom('office',plan),study=getCampusRoom('study',plan);
  if(!office||!study)return null;
  if(roomId==='office')return {position:point(office.bounds.minX+.65,office.center.y),targetRoomId:'study',
    landing:point(study.bounds.maxX-1.3,study.center.y),triggerRadius:.45};
  if(roomId==='study')return {position:point(study.bounds.maxX-.6,study.center.y),targetRoomId:'office',
    landing:point(office.bounds.minX+1.4,office.center.y),triggerRadius:.45};
  return null;
}

export function getCampusPortalAt(position,roomId,plan=DEFAULT_PLAN) {
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))return null;
  const portal=getCampusRoomPortal(roomId,plan);
  return portal&&Math.hypot(position.x-portal.position.x,position.y-portal.position.y)<=portal.triggerRadius?portal:null;
}

export const CAMPUS_ROOM_IDS=ROOM_IDS;
const API={getCampusInterior,getInteriorCollisionRects,getInteriorInteractionTargets,STUDY_SCALE,studyPoint,getStudyDesks,getStudySeats,getStudyBookcase,getStudyTerrace,createCampusPlan,getCampusRoom,getCampusRoute,advanceAlongPath,findCampusRoomAt,pointInPolygon,getCampusCollisionRects,resolveCampusMovement,getCampusRoomPortal,getCampusPortalAt,CAMPUS_ROOM_IDS};
if(typeof window!=='undefined')window.CampusPlan=Object.freeze(API);
