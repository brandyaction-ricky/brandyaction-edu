import {atriumHeightAt} from '../../public/campus/world/tour/atrium-layout.mjs';
/** Local QA choreography only. Real visitors' positions are never rewritten. */
const clusters=[
 [5.8,29,4],[-7.8,23,4],[-15.5,29.5,4],[17.3,23.7,4],
 [-10,18.7,3],[6.3,9,4],[14.5,8,4],[18.4,30.7,3],
 [-19.4,22.7,3],[-5.3,10,3],[7.6,1.6,4],[.3,1.6,4],
 [-7,30.5,4],[1,21.8,3],[5.8,18.8,3],[-3,31.9,2],
];
export function crowdLayout(count=60){
 const people=[];
 clusters.forEach(([cx,cy,size],group)=>{
  for(let j=0;j<size;j++){
   const angle=j/size*Math.PI*2+group*.67,radius=1.05+(group%3)*.13,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;
   people.push({x,y,yaw:Math.atan2(cx-x,cy-y),group,walker:false});
  }
 });
 // An isolated passer-by near the arrival area makes approach/join QA repeatable.
 people[0]={x:3.8,y:28,yaw:.9,group:0,walker:false};
 for(const [x,y]of[[-3.8,25],[2.1,25.5],[-10.8,29],[6.2,12.5]])people.push({x,y,yaw:Math.PI,group:people.length,walker:true});
 // Reserve non-intersecting short paths so paused groups keep their personal space.
 const segments=[];
 for(const [i,p]of people.entries()){
  let end={x:p.x,y:p.y};
  if(i!==0)for(let attempt=0;attempt<24;attempt++){
   const angle=p.yaw+Math.PI+attempt*2.3999632297,distance=.8+random(i*37+attempt)*.6;
   const candidate={x:p.x+Math.sin(angle)*distance,y:p.y+Math.cos(angle)*distance};
   const samples=Array.from({length:13},(_,j)=>({x:p.x+(candidate.x-p.x)*j/12,y:p.y+(candidate.y-p.y)*j/12}));
   if(samples.some(q=>atriumHeightAt(q.x,q.y)!==atriumHeightAt(p.x,p.y)))continue;
   if(samples.some(q=>people.some((other,k)=>k!==i&&Math.hypot(q.x-other.x,q.y-other.y)<.9)))continue;
   if(samples.some(q=>segments.some(path=>path.some(r=>Math.hypot(q.x-r.x,q.y-r.y)<.9))))continue;
   end=candidate;break;
  }
  p.route=end;p.walker=i!==0&&Math.hypot(end.x-p.x,end.y-p.y)>.1;
  segments.push(Array.from({length:13},(_,j)=>({x:p.x+(end.x-p.x)*j/12,y:p.y+(end.y-p.y)*j/12})));
 }
 return people.slice(0,count);
}
function random(seed){const n=Math.sin(seed*12.9898+78.233)*43758.5453;return n-Math.floor(n);}
export function crowdMotion(person,index,seconds){
 if(!person.walker)return {...person,moving:false};
 // Fifteen independent lanes, four visitors per lane: never over 15 / 60 walking.
 // Each round has different start, pace and pause; no server-side navigation or fake real-user motion.
 const lane=index%15,local=seconds+random(lane+501)*10,cycle=Math.floor(local/10),t=((local%10)+10)%10;
 const member=((cycle%4)+4)%4;
 if(Math.floor(index/15)!==member)return {...person,moving:false};
 const seed=cycle*97+lane*31,start=.1+random(seed+3)*.5,out=3.2+random(seed+4)*.6,rest=.4+random(seed+5)*.7,back=3.2+random(seed+6)*.6;
 const q=t-start;
 const forward=q>=0&&q<out,returning=q>=out+rest&&q<out+rest+back;
 const progress=q<0?0:q<out?q/out:q<out+rest?1:q<out+rest+back?1-(q-out-rest)/back:0;
 const dx=person.route.x-person.x,dy=person.route.y-person.y;
 return {...person,x:person.x+dx*progress,y:person.y+dy*progress,yaw:forward?Math.atan2(dx,dy):returning?Math.atan2(-dx,-dy):person.yaw,moving:forward||returning};
}
