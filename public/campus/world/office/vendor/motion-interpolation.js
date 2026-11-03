/** A small timestamped snapshot buffer shared by the 3D and 2D visitor renderers. */
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
const mix=(a,b,t)=>a+(b-a)*t;
const defaultClock=()=>globalThis.performance?.now?.()??Date.now();
const sequence=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const pose=value=>['sit','wave','walk'].includes(value)?value:'stand';

export function createRemoteMotion({clock=defaultClock,delayMs=120,maxExtrapolationMs=120,staleMs=2000,teleportDistance=4,maxSpeed=6}={}){
  const tracks=new Map();
  function push(id,source,receivedAt=clock()){
    if(typeof id!=='string'||!id||!source||!Number.isFinite(source.x)||!Number.isFinite(source.y)||!Number.isFinite(receivedAt))return false;
    const seq=sequence(source.seq),updatedAt=Number.isFinite(source.updatedAt)?source.updatedAt:null,sessionId=typeof source.sessionId==='string'?source.sessionId:'';
    let track=tracks.get(id),last=track?.frames.at(-1),newSession=!!track&&sessionId!==track.sessionId;
    const higherSequence=!!track&&!newSession&&seq!==null&&track.seq!==null&&seq>track.seq;
    if(track){
      if(newSession){
        // A late packet from a retired room entry cannot revive the previous stream.
        if(track.retired.has(sessionId)||(track.sessionId&&!sessionId)||(updatedAt!==null&&track.updatedAt!==null&&updatedAt<track.updatedAt))return false;
      }else{
        if(seq!==null&&track.seq!==null&&seq<=track.seq)return false;
        if((track.seq!==null||track.updatedAt!==null)&&seq===null&&updatedAt===null)return false;
        if(updatedAt!==null&&track.updatedAt!==null&&updatedAt<track.updatedAt&&!higherSequence)return false;
        if(seq===null&&updatedAt!==null&&updatedAt===track.updatedAt)return false;
        if(seq===null&&updatedAt===null&&last&&['x','y','yaw','moving','jumpHeight','pose'].every(key=>(source[key]??null)===(track.source[key]??null)))return false;
      }
    }
    const jumped=last&&Math.hypot(source.x-last.x,source.y-last.y)>teleportDistance;
    if(!track||newSession){
      const retired=track?.retired||new Set();if(track)retired.add(track.sessionId);
      track={frames:[],retired,sessionId,seq:null,updatedAt:null,offset:null,lastReceived:receivedAt,source:{}};tracks.set(id,track);last=null;
    }
    const previous=track.frames.at(-1);
    const remoteTime=higherSequence&&previous?Math.max(updatedAt??receivedAt,previous.time+1):updatedAt??receivedAt;
    // Mapping remote clock to this browser uses the fastest received packet, never its wall clock.
    const offset=receivedAt-remoteTime;track.offset=track.offset===null?offset:Math.min(track.offset,offset);
    const motionPose=pose(source.pose),distance=previous?Math.hypot(source.x-previous.x,source.y-previous.y):0;
    const yaw=Number.isFinite(source.yaw)?angle(source.yaw):distance>.001?Math.atan2(source.x-previous.x,source.y-previous.y):previous?.yaw??Math.PI;
    const moving=typeof source.moving==='boolean'?source.moving:motionPose==='walk'||distance>.025;
    const frame={x:source.x,y:source.y,yaw,moving,jumpHeight:clamp(Number.isFinite(source.jumpHeight)?source.jumpHeight:0,0,3),pose:moving?'walk':motionPose==='walk'?'stand':motionPose,time:remoteTime,seq,updatedAt,sessionId};
    const stopped=previous&&previous.moving&&!moving;
    if(jumped||newSession||stopped||previous&&remoteTime-previous.time>staleMs)track.frames.length=0;
    track.frames.push(frame);if(track.frames.length>12)track.frames.shift();
    track.seq=seq??track.seq;track.updatedAt=updatedAt===null?track.updatedAt:Math.max(track.updatedAt??updatedAt,updatedAt);track.lastReceived=receivedAt;track.source={...source};
    return true;
  }
  function sample(id,now=clock()){
    const track=tracks.get(id);if(!track||!Number.isFinite(now))return null;
    const frames=track.frames,last=frames.at(-1);if(!last)return null;
    const stale=now-track.lastReceived>staleMs,target=now-delayMs-track.offset;
    let result={...last,stale};
    if(target<frames[0].time)return{...frames[0],stale:false};
    for(let i=1;i<frames.length;i++){
      const a=frames[i-1],b=frames[i];if(target>b.time)continue;
      const t=clamp((target-a.time)/Math.max(1,b.time-a.time),0,1),discrete=t>=1?b:a;
      return{...discrete,x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),yaw:angle(a.yaw+angle(b.yaw-a.yaw)*t),jumpHeight:mix(a.jumpHeight,b.jumpHeight,t),moving:discrete.moving||Math.hypot(b.x-a.x,b.y-a.y)>.025,stale:false};
    }
    // Briefly bridge one missing packet, then stop predicting rather than walking through the room.
    const previous=frames.at(-2),ahead=target-last.time;
    if(last.moving&&previous&&ahead>0){
      const elapsed=Math.max(1,last.time-previous.time),vx=(last.x-previous.x)/elapsed,vy=(last.y-previous.y)/elapsed,speed=Math.hypot(vx,vy),factor=speed>maxSpeed/1000?maxSpeed/1000/speed:1,predict=Math.min(ahead,maxExtrapolationMs);
      result.x+=vx*factor*predict;result.y+=vy*factor*predict;
    }
    if(ahead>maxExtrapolationMs){result.moving=false;if(result.pose==='walk')result.pose='stand';}
    if(stale){result.moving=false;result.pose=last.pose==='sit'?'sit':'stand';result.jumpHeight=0;}
    return result;
  }
  function retain(ids){const keep=new Set(ids);for(const id of tracks.keys())if(!keep.has(id))tracks.delete(id);}
  return{push,sample,retain,clear:()=>tracks.clear()};
}
