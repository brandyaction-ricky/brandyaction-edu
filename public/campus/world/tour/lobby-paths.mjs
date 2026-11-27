// The paint, picking and avatar movement all use these same floor coordinates.
const trunk = [[0,11], [0,9.4], [0,8.3]];
export const doors = {
  study: {label:'공부방', x:-4.10, z:4.26, points:[[-1.80,7.55],[-4.10,5.54],[-4.10,4.26]]},
  library: {label:'자료실', x:4.78, z:-1.46, points:[[2.66,6.92],[4.78,4.97],[4.78,-1.46]]},
  office: {label:'내 AI 사무실', x:8.78, z:3.68, points:[[3.50,7.33],[8.78,5.8],[8.78,3.68]]},
};
function measure(pairs) {
  const path = [];
  let length = 0;
  for (const [x,z] of pairs) {
    const prev = path.at(-1);
    if (prev) {
      const step = Math.hypot(x-prev.x,z-prev.z);
      if (step < .00001) continue;
      length += step;
    }
    path.push({x,z,length});
  }
  return path;
}
function rounded(pairs) {
  const points=[pairs[0]];
  for (let i=1;i<pairs.length-1;i++) {
    const [a,b,c]=pairs.slice(i-1,i+2);
    const enter=b.map((v,j)=>v+.32*(a[j]-v)), exit=b.map((v,j)=>v+.32*(c[j]-v));
    for (let k=0;k<=6;k++) {
      const t=k/6;
      points.push(b.map((v,j)=>(1-t)**2*enter[j]+2*(1-t)*t*v+t*t*exit[j]));
    }
  }
  return [...points,pairs.at(-1)];
}
const approach=rounded(trunk);
const routes=Object.fromEntries(Object.entries(doors).map(([id,door])=>[
  id,measure([...approach,...rounded([trunk.at(-1),...door.points]).slice(1)])
]));
const fork=measure(approach).at(-1).length;
export const entrance = routes.study[0];

export function pointAt(path, distance) {
  if (distance <= 0) return path[0];
  const i = path.findIndex(point => point.length >= distance);
  if (i < 1) return path.at(-1);
  const a=path[i-1], b=path[i], t=(distance-a.length)/(b.length-a.length);
  return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
}
export function nearestPoint(path,x,z) {
  let gap=Infinity, length=0;
  for (let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const error=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(error<gap){gap=error;length=a.length+t*(b.length-a.length);}
  }
  return {gap,length};
}
export function routeFrom(position,destination) {
  const door=doors[destination];
  const aisle=5.65;
  if(position.z<=aisle){
    const start=[position.x,position.z], end=[door.x,door.z];
    if(Math.abs(position.x-door.x)<.01)return measure([start,end]);
    return measure(rounded([start,[position.x,aisle],[door.x,aisle],end]));
  }
  const target=routes[destination];
  const [source,nearest] = Object.keys(routes).map(id=>[id,nearestPoint(routes[id],position.x,position.z)])
    .sort((a,b)=>a[1].gap-b[1].gap)[0];
  const turnBack = source!==destination && nearest.length>fork;
  const back = turnBack ? routes[source].filter(p=>p.length>=fork && p.length<nearest.length).reverse() : [];
  const forward=target.filter(p=>p.length>(turnBack?fork:nearest.length));
  return measure([[position.x,position.z],...[...back,...forward].map(p=>[p.x,p.z])]);
}
