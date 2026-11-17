/** Local geometry/material toolkit; reuses the existing renderer and character asset pipeline. */
export function architecture(office,group){
 const textures=new Map(),materials=new Map();
 const noise=(name,base,grain)=>{if(textures.has(name))return textures.get(name);const t=office.patternTexture((c,n)=>{c.fillStyle=base;c.fillRect(0,0,n,n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;c.fillStyle=`rgba(${grain},${Math.abs(k)*.07})`;c.fillRect(x,y,1,1);}});textures.set(name,t);return t;};
 const material=(color,kind='stone')=>{const key=color+kind;if(materials.has(key))return materials.get(key);const sample=office.boxMesh(0,0,0,1,1,1,color,{group,rough:kind==='metal'?.3:.72,metal:kind==='metal'?.65:.06,shadow:false});group.remove(sample);sample.geometry.dispose();const mat=sample.material;mat.side=2;if(kind==='glow'){mat.emissive.setHex(color);mat.emissiveIntensity=.8;}if(kind==='stone'||kind==='fabric'){mat.map=noise(kind,'#eeeeeb','80,87,96');mat.bumpMap=mat.map;mat.bumpScale=kind==='fabric'?.025:.012;}materials.set(key,mat);return mat;};
 function mesh(vertices,indices,color,kind='stone'){
  const m=office.boxMesh(0,0,0,1,1,1,color,{group,mat:material(color,kind)}),g=m.geometry;for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];g.setIndex(indices);g.deleteAttribute('normal');g.deleteAttribute('uv');g.setAttribute('position',office.createAvatarAttribute(new Float32Array(vertices),3));g.computeVertexNormals();const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]+vertices[i+1]*.2)/4,(vertices[i+2]+vertices[i+1]*.2)/4);g.setAttribute('uv',new g.attributes.position.constructor(new Float32Array(uv),2));g.computeBoundingSphere();m.position.set(0,0,0);return m;
 }
 function prism(points,z,h,color,kind='stone'){
  const v=[],ix=[],n=points.length;for(const height of[z,z+h])for(const p of points)v.push(p[0],height,p[1]);
  for(let i=1;i<n-1;i++){ix.push(0,i+1,i,n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;ix.push(i,j,n+j,i,n+j,n+i);}return mesh(v,ix,color,kind);
 }
 function rounded(x,y,z,w,d,h,r,color,kind='stone'){
  const p=[];r=Math.min(r,w/2,d/2);for(const[cx,cy,a]of[[x+w-r,y+d-r,0],[x+r,y+d-r,Math.PI/2],[x+r,y+r,Math.PI],[x+w-r,y+r,Math.PI*1.5]])for(let i=0;i<=6;i++){const t=a+i/6*Math.PI/2;p.push([cx+Math.cos(t)*r,cy+Math.sin(t)*r]);}return prism(p,z,h,color,kind);
 }
 function arc(cx,cy,z,outer,inner,start,end,h,color,kind='stone',segments=48){
  // Separate quads avoid triangulating a concave ring as a fan.
  const v=[],ix=[];for(let i=0;i<=segments;i++){const a=start+(end-start)*i/segments;for(const height of[z,z+h])for(const r of[outer,inner])v.push(cx+Math.cos(a)*r,height,cy+Math.sin(a)*r);}
  for(let i=0;i<segments;i++){const a=i*4,b=a+4;for(const q of[[a,b,b+2,a+2],[a+1,a+3,b+3,b+1],[a+2,b+2,b+3,a+3],[a,a+1,b+1,b]])ix.push(q[0],q[1],q[2],q[0],q[2],q[3]);}for(const a of[0,segments*4])ix.push(a,a+2,a+3,a,a+3,a+1);return mesh(v,ix,color,kind);
 }
 function cylinder(x,y,z,r,h,color,kind='stone'){return rounded(x-r,y-r,z,r*2,r*2,h,r,color,kind);}
 function beam(a,b,width,color,kind='metal'){
  const m=office.boxMesh(0,0,0,width,width,Math.hypot(...b.map((v,i)=>v-a[i])),color,{group,mat:material(color,kind),shadow:false});m.position.set(...a.map((v,i)=>(v+b[i])/2));const direction=m.position.clone().set(...b.map((v,i)=>v-a[i])).normalize();m.quaternion.setFromUnitVectors(direction.clone().set(0,1,0),direction);return m;
 }
 function label(text,x,y,z,w,h,{color='#f6f2e8',background='transparent',face}={}){
  const before=office.room;office.room=group;office.buildSign({text,x,y,z,w,h,bg:background,fg:color,glow:true,font:'system-ui, sans-serif',face});office.room=before;
  const m=group.children.at(-1),canvas=m.material.map.image,ratio=canvas.height/canvas.width;canvas.width=1536;canvas.height=Math.max(64,Math.round(1536*ratio));const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);if(background!=='transparent'){c.fillStyle=background;c.fillRect(0,0,canvas.width,canvas.height);}c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;const lines=text.split('\n'),size=Math.min(canvas.height/(lines.length+.5),canvas.width*1.6/Math.max(...lines.map(l=>l.length),1));c.font=`600 ${size}px system-ui,sans-serif`;lines.forEach((line,i)=>c.fillText(line,canvas.width/2,canvas.height*(i+.65)/(lines.length+.3)));m.material.map.needsUpdate=true;m.material.transparent=true;m.material.alphaTest=.01;return m;
 }
 function glass(x,y,z,w,d,h){const mat=office.glassMat().clone();mat.opacity=.07;mat.color.setHex(0xb3cad7);return office.boxMesh(x,y,z,w,d,h,0,{group,mat,shadow:false});}
 function plant(x,y,z=0,scale=1){cylinder(x,y,z,.55*scale,.65*scale,0x4e5758);office.place('pottedPlant',x-.42*scale,y-.42*scale,.84*scale,.84*scale,{group,y0:z+.6*scale,h:1.65*scale});}
 function sofa(x,y,w=4){rounded(x,y,.15,w,1.65,.32,.35,0x25384a,'metal');rounded(x+.05,y+.08,.46,w-.1,1.5,.4,.3,0xd2c7b1,'fabric');rounded(x+.08,y+.05,.72,w-.16,.37,.65,.18,0xd2c7b1,'fabric');for(const dx of[0,w-.3])rounded(x+dx,y+.1,.5,.3,1.45,.58,.14,0xc1b79f,'fabric');for(let i=1;i<w;i++)rounded(x+i,y+.42,.88,.65,.32,.44,.12,0x273f62,'fabric');}
 return {mesh,prism,rounded,arc,cylinder,beam,label,glass,plant,sofa,material};
}
