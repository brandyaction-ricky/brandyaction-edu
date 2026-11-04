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
 return people.slice(0,count);
}
export function crowdMotion(person,index,seconds){
 const phase=seconds+index*3.71,period=18+(index%5)*3,t=((phase%period)+period)%period;
 if(!person.walker)return {...person,yaw:person.yaw+Math.sin(phase*.17)*.12,moving:false};
 // Walk, pause, and return along a short clear path, each at a different time.
 const distance=1.6,move=3,rest=period/2-move,half=period/2;
 const q=t<half?t:t-half,progress=Math.min(1,q/move),offset=t<half?progress:1-progress;
 return {...person,y:person.y+distance*offset,yaw:t<half?0:Math.PI,moving:q<move&&rest>0};
}
