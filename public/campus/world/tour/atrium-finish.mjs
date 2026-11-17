import {architecture} from './architecture.mjs';
/** Atrium-only surface normals and shared materials; original character/study assets are unchanged. */
export function atriumFinish(office,group){
 const base=architecture(office,group),cache=new Map();
 function material(color,kind='stone'){
  const key=color+kind;if(cache.has(key))return cache.get(key);
  const m=base.material(color,kind).clone();m.side=2;
  if(kind==='stone'){m.roughness=.72;m.metalness=.05;m.bumpScale=.018;m.emissive.setHex(color);m.emissiveIntensity=.06;}
  if(kind==='metal'){m.roughness=.32;m.metalness=.48;m.emissive.setHex(color);m.emissiveIntensity=.025;}
  if(kind==='floor'){m.roughness=.38;m.metalness=.12;const t=office.patternTexture((c,n)=>{c.fillStyle='#b8b8b5';c.fillRect(0,0,n,n);for(let i=0;i<2500;i++){const x=(Math.sin(i*127.1)*43758.5453%1+1)%1*n,y=(Math.sin(i*311.7)*29521.873%1+1)%1*n;c.fillStyle=`rgba(70,78,85,${.03+Math.sin(i)*.015})`;c.fillRect(x,y,2,1);}c.strokeStyle='#aaa9a3';c.lineWidth=.28;c.strokeRect(.3,.3,n-.6,n-.6);});m.map=t;m.bumpMap=t;m.bumpScale=.008;}
  if(kind==='glass'){m.map=null;m.bumpMap=null;m.color.setHex(0x9cb2c7);m.transparent=true;m.opacity=.09;m.depthWrite=false;m.roughness=.12;m.metalness=.22;}
  cache.set(key,m);return m;
 }
 function raw(v,idx,color,kind='stone',normals){
  const obj=office.boxMesh(0,0,0,1,1,1,color,{group,mat:material(color,kind),shadow:kind!=='glass'&&kind!=='glow'}),g=obj.geometry;g.setIndex(idx);g.setAttribute('position',office.createAvatarAttribute(new Float32Array(v),3));g.deleteAttribute('normal');g.deleteAttribute('uv');
  if(normals)g.setAttribute('normal',office.createAvatarAttribute(new Float32Array(normals),3));else g.computeVertexNormals();
  const uv=[];for(let i=0;i<v.length;i+=3)uv.push((v[i]+v[i+1]*.5)/3,(v[i+2]+v[i+1]*.5)/3);g.setAttribute('uv',new g.attributes.position.constructor(new Float32Array(uv),2));g.computeBoundingSphere();obj.position.set(0,0,0);return obj;
 }
 function prism(points,z,h,color,kind='stone'){
  points=points.filter((p,i)=>i===0||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-7);if(points.length>2&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-7)points.pop();
  const v=[],idx=[],normals=[],n=points.length;
  for(const [height,ny]of[[z,-1],[z+h,1]])for(const[x,y]of points){v.push(x,height,y);normals.push(0,ny,0);}
  for(let i=1;i<n-1;i++)idx.push(0,i,i+1,n,n+i+1,n+i);
  for(let i=0;i<n;i++){const j=(i+1)%n,[x,y]=points[i],[xx,yy]=points[j],len=Math.hypot(xx-x,yy-y),nx=(yy-y)/len,nz=-(xx-x)/len,k=v.length/3;v.push(x,z,y,x,z+h,y,xx,z+h,yy,xx,z,yy);for(let q=0;q<4;q++)normals.push(nx,0,nz);idx.push(k,k+1,k+2,k,k+2,k+3);}
  return raw(v,idx,color,kind,normals);
 }
 function rounded(x,y,z,w,d,h,r,color,kind='stone'){
  if(r<=.0001)return prism([[x+w,y+d],[x,y+d],[x,y],[x+w,y]],z,h,color,kind);const p=[];r=Math.min(r,w/2,d/2);for(const[cx,cy,a]of[[x+w-r,y+d-r,0],[x+r,y+d-r,Math.PI/2],[x+r,y+r,Math.PI],[x+w-r,y+r,Math.PI*1.5]])for(let i=0;i<=12;i++){const t=a+i/12*Math.PI/2;p.push([cx+Math.cos(t)*r,cy+Math.sin(t)*r]);}return prism(p,z,h,color,kind);
 }
 function cylinder(x,y,z,r,h,color,kind='stone'){return rounded(x-r,y-r,z,2*r,2*r,h,r,color,kind);}
 function surface(points,color,kind='glass'){return raw(points.flat(),[0,1,2,0,2,3],color,kind);}
 function glass(x,y,z,w,d,h){return rounded(x,y,z,w,d,h,0,0x9cb2c7,'glass');}
 function foliage(x,y,z=0,scale=1){
  cylinder(x,y,z,.48*scale,.62*scale,0x6b6d60,'stone');
  // A single mesh of opaque leaf blades avoids hundreds of individual transparent leaf draws.
  const v=[],ix=[];
  for(let branch=0;branch<9;branch++){
   const angle=branch*2.39996,reach=(.55+(branch%3)*.12)*scale,top=(1.1+(branch%4)*.19)*scale;
   for(let leaf=0;leaf<13;leaf++){
    const t=(leaf+1)/14,side=leaf%2?1:-1,cx=x+Math.cos(angle)*reach*t,cy=y+Math.sin(angle)*reach*t,cz=z+.6*scale+top*t;
    const heading=angle+side*.9,length=(.27+.12*(1-t))*scale,width=.105*scale,k=v.length/3;
    for(let q=0;q<8;q++){const th=q/8*Math.PI*2,along=(1+Math.cos(th))*length/2,across=Math.sin(th)*width;v.push(cx+Math.cos(heading)*along-Math.sin(heading)*across,cz+along*.28,cy+Math.sin(heading)*along+Math.cos(heading)*across);}
    for(let q=1;q<7;q++)ix.push(k,k+q,k+q+1);
    const stem=v.length/3;v.push(x-.015*scale,z+.6*scale,y,x+.015*scale,z+.6*scale,y,cx+.01*scale,cz,cy,cx-.01*scale,cz,cy);ix.push(stem,stem+1,stem+2,stem,stem+2,stem+3);
   }
  }raw(v,ix,0x4d6747,'fabric');
 }
 function sofa(x,y,w=5){rounded(x,y,.1,w,1.6,.35,.22,0x363a3f,'metal');for(let i=0;i<3;i++){rounded(x+.15+i*(w-.3)/3,y+.08,.45,(w-.4)/3,1.4,.35,.2,0xc9c6bd,'fabric');rounded(x+.15+i*(w-.3)/3,y+.05,.73,(w-.4)/3,.35,.64,.16,0xc9c6bd,'fabric');}for(const dx of[0,w-.26])rounded(x+dx,y+.1,.45,.26,1.4,.62,.12,0xb3b4b0,'fabric');}
 function glowPool(x,y,z,w,d){const mat=material(0xffd1a1,'glow').clone();const tex=office.patternTexture((c,n)=>{const g=c.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);g.addColorStop(0,'rgba(255,210,150,.22)');g.addColorStop(1,'rgba(255,210,150,0)');c.fillStyle=g;c.fillRect(0,0,n,n);});mat.map=tex;mat.transparent=true;mat.depthWrite=false;mat.emissiveIntensity=.25;const o=surface([[x-w/2,z,y-d/2],[x-w/2,z,y+d/2],[x+w/2,z,y+d/2],[x+w/2,z,y-d/2]],0xffd1a1,'glow');o.material=mat;o.geometry.setAttribute('uv',new o.geometry.attributes.position.constructor(new Float32Array([0,0,0,1,1,1,1,0]),2));o.castShadow=false;}
 return {...base,material,raw,prism,rounded,cylinder,surface,glass,plant:foliage,sofa,glowPool};
}
