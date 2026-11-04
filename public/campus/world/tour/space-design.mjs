/** Architectural finishes only. Original avatars, seats, collisions and task coordinates are unchanged. */
function beams(office,group,segments,color,width=.16,emissive=false){
 const mesh=office.boxMesh(0,0,0,1,1,1,color,{group,rough:.55,metal:.2,shadow:false,...emissive?{emissive:color,ei:.4}:{}}),vertices=[];
 // Merge a whole set of structural ribs into one draw call. Coordinates use Three's x/up/z convention.
 for(const [a,b]of segments){
  const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d),u=d.map(v=>v/length),ref=Math.abs(u[1])>.95?[1,0,0]:[0,1,0];
  const cross=(p,q)=>[p[1]*q[2]-p[2]*q[1],p[2]*q[0]-p[0]*q[2],p[0]*q[1]-p[1]*q[0]];
  const v=cross(u,ref),n=Math.hypot(...v),side=v.map(k=>k/n*width/2),up=cross(u,side),points=[];
  for(const end of[a,b])for(const [s,t]of[[-1,-1],[1,-1],[1,1],[-1,1]])points.push(end.map((k,i)=>k+side[i]*s+up[i]*t));
  for(const face of[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])for(const i of[face[0],face[1],face[2],face[0],face[2],face[3]])vertices.push(...points[i]);
 }
 const g=mesh.geometry;g.setIndex(null);g.deleteAttribute('normal');g.deleteAttribute('uv');g.setAttribute('position',office.createAvatarAttribute(new Float32Array(vertices),3));g.computeVertexNormals();g.computeBoundingSphere();mesh.position.set(0,0,0);return mesh;
}
export function buildHabitatShell(office,group){
 group.name='moonshot-lunar-research-habitat';
 const structure=[],lights=[],b=(x,y,z,w,d,h,c)=>office.boxMesh(x,y,z,w,d,h,c,{group,rough:.7,metal:.18,shadow:false});
 const glass=office.glassMat().clone();glass.opacity=.065;glass.color.setHex(0xb5d8e6);
 // Three broad vaulted ribs; open front retains an unobstructed map and mobile view.
 for(const y of[-9,4,17]){
  for(const x of[-22,22])structure.push([[x,0,y],[x,4,y]]);
  for(let i=0;i<24;i++){
   const p=t=>[-22*Math.cos(t),4+9*Math.sin(t),y],a=i/24*Math.PI,c=(i+1)/24*Math.PI;
   structure.push([p(a),p(c)]);
   if(y===-9)lights.push([p(a).map((v,j)=>v-(j===1?.18:0)),p(c).map((v,j)=>v-(j===1?.18:0))]);
  }
 }
 for(const x of[-21.9,21.9]){
  b(x-.16,-9,0,.32,42,.42,0xc5cbc9);
  office.boxMesh(x,-9,.45,.035,39,5.4,0,{group,mat:glass,shadow:false});
  for(const y of[-9,-2,5,12,19,26,30])structure.push([[x,.4,y],[x,5.9,y]]);
  structure.push([[x,5.9,-9],[x,5.9,30]]);lights.push([[x-.12,.5,-9],[x-.12,.5,30]]);
 }
 office.boxMesh(-22,-9,.42,44,.035,7,0,{group,mat:glass,shadow:false});
 for(let x=-22;x<=22;x+=5.5)structure.push([[x,.4,-9],[x,4+9*Math.sqrt(Math.max(0,1-(x/22)**2)),-9]]);
 structure.push([[-22,4,-9],[22,4,-9]]);
 beams(office,group,structure,0xaebac0,.22);beams(office,group,lights,0xffddac,.065,true);
 // Slender, elevated perimeter galleries bring depth without ceilings hiding the player.
 for(const x of[-21,17]){
  b(x,-8,3.9,4,26,.22,0xbfc3bd);b(x,-8,4.12,4,.14,.9,0x536573);
  for(const y of[-6,2,10,17])b(x+1.7,y,0,.23,.23,3.9,0x74818a);
 }
 // Material and planting accents are static and reuse the handoff's existing furniture assets.
 for(const [x,y]of[[-20,1],[18,1],[-20,28],[18,28]]){
  b(x,y,0,1.6,1.6,.6,0x58656b);office.place('pottedPlant',x+.2,y+.2,1.2,1.2,{group,y0:.6,h:2.4});
 }
 for(const x of[-15,13]){const sofa=office.place('loungeSofa',x,-2,4,1.5,{group});sofa?.traverse(n=>{if(n.isMesh&&!Array.isArray(n.material)){n.material=n.material.clone();n.material.color.setHex(0xcac8bb);}});}
}
export function applyWarmStudy(office,plan){
 const group=office.campusRoomGroups.get('study');if(!group)return;
 // Clone room-owned material references: tinting the study must never recolor characters or the private office.
 const wood=office.patternTexture((c,n)=>{c.fillStyle='#d6c3a6';c.fillRect(0,0,n,n);for(let i=0;i<16;i++){c.fillStyle=['#c9b494','#d3bea0','#ddcbb2','#cdb898'][i%4];c.fillRect(i*8,0,7,n);c.fillStyle='#baa387';c.fillRect(i*8,0,.4,n);for(let j=0;j<9;j++){c.fillStyle='rgba(117,90,57,.08)';c.fillRect(i*8+1+(j%5),j*17%128,.35,19);}}});
 const colors=new Map([[0xacc3c6,0xdad6cb],[0x73929b,0xb4b4a8],[0xd4d9cb,0xede7da],[0xd3dfdb,0xeae4d6],[0x647f87,0xb39977],[0x486976,0x374e69],[0x66858b,0x6e7d86]]);
 group.traverse(node=>{
  if(!node.isMesh||Array.isArray(node.material))return;
  const current=node.material.color?.getHex();
  if(node.name==='study-indoor-floor'){
   node.material=node.material.clone();node.material.color.setHex(0xffffff);node.material.map=wood;node.material.roughness=.86;node.material.metalness=.015;
   const p=node.geometry.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push(p.getX(i)/8,p.getZ(i)/5);node.geometry.setAttribute('uv',new p.constructor(new Float32Array(uv),2));node.material.needsUpdate=true;
  }else if(colors.has(current)){node.material=node.material.clone();node.material.color.setHex(colors.get(current));}else if(node.material.color?.r>.35&&node.material.color.r>node.material.color.g*1.35&&node.material.color.g>node.material.color.b*.8){node.material=node.material.clone();node.material.color.setHex(0xc5b594);}
 });
 const accents=new group.constructor();accents.name='moonshot-warm-orbital-studio';group.add(accents);
 const b=(x,y,z,w,d,h,c,glow=false)=>office.boxMesh(x,y,z,w,d,h,c,{group:accents,rough:.8,metal:.05,shadow:false,...glow?{emissive:c,ei:.35}:{}});
 const outline=plan.getCampusRoom('study').indoorOutline,ribs=[],glow=[];
 // Follow the existing rear glazing; do not place furniture or colliders in a walkway.
 for(const [a,c]of [[outline[5],outline[0]],[outline[0],outline[1]]]){
  ribs.push([[a[0],3.3,a[1]],[c[0],3.3,c[1]]]);glow.push([[a[0],3.17,a[1]],[c[0],3.17,c[1]]]);
 }
 beams(office,accents,ribs,0xb3a18a,.28);beams(office,accents,glow,0xffd6a0,.05,true);
 for(const desk of plan.getStudyDesks()){
  // Thin oak top overlays the existing tabletop, so saved seat and interaction coordinates stay valid.
  b(desk.x,desk.y,.762,2.8,1.0,.018,0xc6ad86);
  b(desk.x+.08,desk.y+.03,.78,2.64,.035,.012,0xf0dfbf);
  // Warm desk lighting sits on the existing tabletop; no extra real-time lights.
  b(desk.x+.15,desk.y+.35,1.42,2.5,.18,.07,0x9b8870);b(desk.x+.2,desk.y+.39,1.395,2.4,.1,.025,0xffd7a0,true);
  for(const dx of[.4,2.4])b(desk.x+dx,desk.y+.43,.78,.025,.025,.64,0x676a66);
 }
 const shelf=plan.getStudyBookcase(),oldRoom=office.room;office.room=accents;
 office.buildSign({text:'MOONSHOT STUDY  /  오늘의 작은 실행',x:shelf.x+3.3,y:shelf.y-.05,z:2.6,w:6.6,h:.55,bg:'#34495d',fg:'#f4e9d7',font:'system-ui, sans-serif'});office.room=oldRoom;
}
