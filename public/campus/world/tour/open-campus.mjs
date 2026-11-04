/** Public, device-rendered exhibition. No member data, bot execution or live counts. */
export function buildOpenCampus(office,group,box){
 const b=(x,y,z,w,d,h,color,solid=true,glow=false)=>box(group,x,y,z,w,d,h,color,solid,glow);
 const label=(text,x,y,z,w,h)=>{const previous=office.room;office.room=group;office.buildSign({text,x,y,z,w,h,bg:'#10253a',fg:'#e1eeff',font:'system-ui, sans-serif'});office.room=previous;};
 // A single static, faceted lunar surface anchors the architecture. It adds no animation or network work.
 const ground=office.boxMesh(0,0,0,1,1,1,0x354457,{group,rough:1,metal:0,shadow:false});
 const vertices=[],craters=[[-34,18,9],[25,-22,11],[31,35,8],[-30,-25,7]];
 function elevation(x,y){let z=-3.6+Math.sin(x*.24)*Math.cos(y*.17)*.48+Math.sin(x*.81+y*.43)*.14;for(const [cx,cy,r]of craters){const d=Math.hypot(x-cx,y-cy)/r;z+=1.3*Math.exp(-Math.pow((d-1)*5,2))-1.6*Math.exp(-Math.pow(d*1.4,4));}return z;}
 const point=(x,y)=>[x,elevation(x,y),y];
 for(let x=-60;x<60;x+=3)for(let y=-48;y<66;y+=3)vertices.push(...point(x,y),...point(x,y+3),...point(x+3,y+3),...point(x,y),...point(x+3,y+3),...point(x+3,y));
 ground.geometry.setIndex(null);ground.geometry.deleteAttribute('normal');ground.geometry.deleteAttribute('uv');ground.geometry.setAttribute('position',office.createAvatarAttribute(new Float32Array(vertices),3));ground.geometry.computeVertexNormals();ground.geometry.computeBoundingSphere();ground.position.set(0,0,0);ground.material.flatShading=true;ground.receiveShadow=true;
 // A substantial landing deck, structural supports and luminous route make a place, not a floating tile.
 b(-22,-10,-1.4,44,44,1.15,0x0e1e32,false);
 b(-21.6,-9.6,-.3,43.2,43.2,.27,0x294158,false);
 for(const x of[-20,18])for(const y of[-8,29])b(x,y,-3,2,2,2.5,0x172b40,false);
 for(const y of[-9,32])b(-21,y,.02,42,.12,.04,0x6fa9ed,false,true);
 for(const x of[-21,20.8])b(x,-9,.02,.12,41,.04,0x6fa9ed,false,true);
 // Main boulevard and inset deck panels.
 b(-2.6,7,.005,5.2,25,.02,0x132a42,false);
 for(const x of[-2.5,2.45])b(x,7,.03,.06,25,.035,0x368ef0,false,true);
 for(let y=10;y<31;y+=3)b(-.7,y,.04,1.4,.09,.02,0x88b9e6,false);
 for(const x of[-20,-14,8,14])for(let y=-6;y<29;y+=6)b(x,y,.008,5.7,5.7,.012,0x304a62,false);
 // Observation edge: low transparent rails, no enclosing walls.
 for(const x of[-21,20.8])for(let y=-8;y<31;y+=6){b(x,y,0,.16,.16,1.7,0x6f93ad,false);office.boxMesh(x,y,.3,.08,5.8,1.4,0,{group,mat:office.glassMat(),shadow:false});}
 // Ten-times ambition landmark. Realistic tapered surfaces using the existing renderer; no second engine.
 function lathe(x,y,z,rings,color,segments=32){const m=office.boxMesh(0,0,0,1,1,1,color,{group,rough:.4,metal:.5});const positions=[];for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,c=(i+1)/segments*Math.PI*2;const point=(k,t)=>[Math.cos(t)*rings[k][1],rings[k][0],Math.sin(t)*rings[k][1]];positions.push(...point(j,a),...point(j+1,a),...point(j+1,c),...point(j,a),...point(j+1,c),...point(j,c));}const g=m.geometry;g.setIndex(null);g.deleteAttribute('normal');g.deleteAttribute('uv');g.setAttribute('position',office.createAvatarAttribute(new Float32Array(positions),3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();m.position.set(x,z,y);return m;}
 lathe(0,12,-3.5,[[0,33],[1.5,31.8],[1.5,0]],0x27394c,8);
 lathe(0,12,-2.1,[[0,31.8],[.12,31.8],[.12,0]],0x5692c2,8);
 // Tall gantry and restrained brand wall make a clear destination at the end of the arrival walk.
 for(const x of[-10,9.6]){b(x,-7,0,.4,.7,9,0x5f7e98);b(x+.1,-6.28,0,.1,.1,9,0x4b9bed,false,true);}
 b(-10,-7,8.7,20,.7,.4,0x5f7e98);
 b(-9.6,-7.05,3,19.2,.25,5.6,0x0d2135);
 b(-4,-3,0,8,8,.45,0x142b43);
 lathe(0,1,.45,[[0,3.5],[.24,3.5],[.24,0]],0x3c6c92);
 lathe(0,1,.7,[[0,.7],[.7,.86],[6.7,.86],[7.4,.78],[9.4,.04],[9.45,0]],0xd9e6ef);
 lathe(0,1,1,[[0,.88],[.45,.88]],0x246cbd);
 lathe(0,1,6.4,[[0,.88],[.45,.88]],0x246cbd);
 lathe(0,1,.4,[[0,.65],[.45,.5]],0x344554);
 for(const angle of[0,Math.PI/2,Math.PI,Math.PI*1.5]){const fin=b(-.12,.3,.7,.24,2.2,1.4,0x2a69aa,false);fin.position.set(Math.sin(angle)*1.05,1.35,1+Math.cos(angle)*1.05);fin.rotation.y=angle;fin.rotation.x=.22;}
 b(3.2,-2,0,.35,4,7.5,0x4a6478);for(let z=1;z<7;z+=1.3)b(3.25,-2,z,.4,4,.1,0x759bb5,false);b(.7,-1,5.5,3,.3,.22,0x7b9cb1,false);
 label('10×',-5.8,1,3,2.8,2.4);
 label('MOONSHOT',0,-6.7,7.2,14,1.6);
 label('AI MARKETING CAMPUS',0,-6.69,5.7,12,.9);
 label('10%의 개선을 넘어, 10배 다른 가능성에 도전',0,-6.68,4.1,15,.8);
 // Show what people learn through tangible workstations, not decorative chairs.
 function station(x,y,title,subtitle){b(x,y,.04,7,5,.12,0x142d45,false);b(x+.4,y+.5,.16,6.2,.35,2.7,0x10263d);label(title,x+3.5,y+.9,2.2,5.5,1);label(subtitle,x+3.5,y+.92,1.3,5.5,.65);b(x+1,y+2.3,.9,4.5,1.5,.15,0xc4d5e1);for(const dx of[1.2,5])b(x+dx,y+2.5,.16,.18,1.1,.74,0x46637a,false);for(let i=0;i<2;i++){b(x+1.3+i*2.3,y+2.5,1.05,1.5,.16,.9,0x071725,false);b(x+1.38+i*2.3,y+2.67,1.12,1.34,.02,.7,0x2d6f9d,false,true);b(x+1.5+i*2.3,y+3.1,1.06,1,.4,.035,0x65899f,false);b(x+1.7+i*2.3,y+4.1,.2,.8,.8,.5,0x63829e,false);}office.place('pottedPlant',x+5.9,y+3.2,.7,.7,{group});}
 station(-18,8,'01 · 고객 발견','누구의 어떤 문제를 해결할까?');
 station(10,8,'02 · 콘텐츠 제작','아이디어를 광고와 콘텐츠로');
 station(-18,17,'03 · 실험과 개선','고객 반응을 보고 다시 만들기');
 // Sample creative cards, explicitly a process illustration rather than invented results.
 for(let i=0;i<3;i++){b(11+i*1.8,11,.8,1.3,.15,1.1,[0x2f73bb,0x7599bf,0xc7d9e6][i],false);}
 for(let i=0;i<4;i++)b(-16+i*1.1,19,.8,.65,.4,.2+i*.25,0x5a9fe0,false);
 // Keep the arrival path clear: the rocket, workstations and portals carry the story.
 for(const y of[8,16,24])for(const x of[-3.6,3.3]){b(x,y,0,.25,.4,.7,0x476683,false);b(x,y,.7,.25,.4,.12,0x94d1ff,false,true);}
 function portal(x,y,title,sub){b(x,y,0,6,3,.18,0x18334b,false);for(const dx of[0,5.7])b(x+dx,y,.18,.3,.35,3.1,0x5586b1);b(x,y,3.2,6,.35,.3,0x5586b1);label(title,x+3,y+.4,2.65,5,1);label(sub,x+3,y+.41,1.85,5,.6);}
 portal(-16,27,'문샷 공부방','배움이 실행으로 이어지는 곳');portal(10,24,'내 AI 사무실','내 업무를 바꾸는 나만의 자리');
 
}
export const openCampusActions=[
 ['experience','고객 발견 체험','AI 마케팅의 시작',{x:-16,y:10,w:3,d:2,height:2.3}],
 ['offer','문샷에서 배우는 것','아이디어 → 실행 → 개선',{x:11,y:10,w:3,d:2,height:2.3}],
 ['destination:study','문샷 공부방','함께 배우고 실행해요',{x:-14,y:27,w:2,d:1,height:3.4}],
 ['destination:office','내 AI 사무실','내 일에 적용해요',{x:12,y:24,w:2,d:1,height:3.4}],
];
