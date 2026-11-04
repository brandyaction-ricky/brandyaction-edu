import {buildHabitatShell} from './space-design.mjs';
/** Public, device-rendered exhibition. No member data, bot execution or live counts. */
export function buildOpenCampus(office,group,box){
 buildHabitatShell(office,group);
 const b=(x,y,z,w,d,h,color,solid=true,glow=false)=>box(group,x,y,z,w,d,h,color,solid,glow);
 const label=(text,x,y,z,w,h)=>{const previous=office.room;office.room=group;office.buildSign({text,x,y,z,w,h,bg:'#10253a',fg:'#e1eeff',glow:true,font:'system-ui, sans-serif'});office.room=previous;};
 // A single static, faceted lunar surface anchors the architecture. It adds no animation or network work.
 const ground=office.boxMesh(0,0,0,1,1,1,0x68717b,{group,rough:1,metal:0,shadow:false});
 const vertices=[],craters=[[-34,18,9],[25,-22,11],[31,35,8],[-30,-25,7]];
 function elevation(x,y){let z=-1.7+Math.sin(x*.24)*Math.cos(y*.17)*.48+Math.sin(x*.81+y*.43)*.14;for(const [cx,cy,r]of craters){const d=Math.hypot(x-cx,y-cy)/r;z+=1.3*Math.exp(-Math.pow((d-1)*5,2))-1.6*Math.exp(-Math.pow(d*1.4,4));}return z;}
 const point=(x,y)=>[x,elevation(x,y),y];
 for(let x=-60;x<60;x+=3)for(let y=-48;y<66;y+=3)vertices.push(...point(x,y),...point(x,y+3),...point(x+3,y+3),...point(x,y),...point(x+3,y+3),...point(x+3,y));
 ground.geometry.setIndex(null);ground.geometry.deleteAttribute('normal');ground.geometry.deleteAttribute('uv');ground.geometry.setAttribute('position',office.createAvatarAttribute(new Float32Array(vertices),3));ground.geometry.computeVertexNormals();ground.geometry.computeBoundingSphere();ground.position.set(0,0,0);ground.material.flatShading=false;ground.receiveShadow=true;
 const unique=[],indices=[],lookup=new Map();for(let i=0;i<vertices.length;i+=3){const key=vertices.slice(i,i+3).join(',');if(!lookup.has(key)){lookup.set(key,unique.length/3);unique.push(...vertices.slice(i,i+3));}indices.push(lookup.get(key));}
 ground.geometry.setAttribute('position',office.createAvatarAttribute(new Float32Array(unique),3));ground.geometry.setIndex(indices);ground.geometry.computeVertexNormals();
 const texture=office.patternTexture((c,n)=>{for(let x=0;x<n;x++)for(let y=0;y<n;y++){const k=100+Math.floor((Math.sin(x*73.1+y*91.7)*43758.5%1+1)*15);c.fillStyle=`rgb(${k},${k},${k})`;c.fillRect(x,y,1,1);}});
 const uv=[];for(let i=0;i<unique.length;i+=3)uv.push(unique[i]/12,unique[i+2]/12);ground.geometry.setAttribute('uv',new ground.geometry.attributes.position.constructor(new Float32Array(uv),2));ground.material.map=texture;ground.material.color.setHex(0xa7a9af);ground.material.needsUpdate=true;
 // Flush, pale mineral floor; cobalt is a wayfinding accent rather than a toy-like tiled base.
 b(-22,-10,-.65,44,44,.6,0x36404a,false);
 const floor=b(-21.8,-9.8,-.05,43.6,43.6,.04,0xd7d7d2,false);floor.material.roughness=.72;
 const mineral=office.patternTexture((c,n)=>{c.fillStyle='#dfdfd9';c.fillRect(0,0,n,n);for(let i=0;i<1800;i++){c.fillStyle=i%2?'#d8dad4':'#e6e5df';c.fillRect(i*37%n,i*61%n,1,1);}});mineral.repeat.set(10,10);floor.material.map=mineral;floor.material.needsUpdate=true;
 b(-2.6,6,.005,5.2,26,.02,0x89959e,false);
 for(const x of[-2.5,2.45])b(x,6,.03,.06,26,.025,0x3864da,false,true);
 for(let y=-8;y<34;y+=5.5)b(-21.8,y,.002,43.6,.022,.006,0xa3abae,false);
 for(let x=-20;x<22;x+=5.5)b(x,-9.8,.002,.022,43.6,.006,0xa3abae,false);
 // Ten-times ambition landmark. Realistic tapered surfaces using the existing renderer; no second engine.
 function lathe(x,y,z,rings,color,segments=32){const m=office.boxMesh(0,0,0,1,1,1,color,{group,rough:.4,metal:.5});const positions=[];for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,c=(i+1)/segments*Math.PI*2;const point=(k,t)=>[Math.cos(t)*rings[k][1],rings[k][0],Math.sin(t)*rings[k][1]];positions.push(...point(j,a),...point(j+1,a),...point(j+1,c),...point(j,a),...point(j+1,c),...point(j,c));}const g=m.geometry;g.setIndex(null);g.deleteAttribute('normal');g.deleteAttribute('uv');g.setAttribute('position',office.createAvatarAttribute(new Float32Array(positions),3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();m.position.set(x,z,y);return m;}

 // Exterior launch vehicle is a distant landmark beyond the glass, not an indoor toy.
 lathe(8,-22,-1.5,[[0,5],[.4,5],[.4,0]],0x4d555d);
 lathe(8,-22,-1.1,[[0,1],[1,1.2],[11,1.2],[12,1.1],[15.2,.05],[15.3,0]],0xe6e8e5);
 for(const z of[.4,9.5])lathe(8,-22,z,[[0,1.22],[.5,1.22]],0x3455ad);
 b(11,-24,-1.2,.35,4,13,0x6c7479,false);for(let z=1;z<12;z+=2)b(11,-24,z,.4,4,.14,0x9badae,false);
 b(8.9,-23,9,2.5,.3,.25,0x9badae,false);
 // A human-scale architectural wall introduces the learning promise.
 b(-9,-7,0,14,.7,7.8,0x263542);
 b(-9,-6.28,.14,14,.07,.055,0xf6d6a6,false,true);
 label('MOONSHOT',-2,-6.25,6.7,11,1.2);
 label('AI MARKETING',-2,-6.24,5.2,11,1.1);
 label('10×',-2,-6.23,3.5,4,2.1);
 label('10%의 개선을 넘어, 10배 다른 가능성에 도전',-2,-6.22,1.4,12,.6);
 // Show what people learn through tangible workstations, not decorative chairs.
 function station(x,y,title,subtitle){b(x,y,.04,7,5,.12,0xb5b9b7,false);b(x+.4,y+.5,.16,6.2,.35,2.7,0x2c3e4d);label(title,x+3.5,y+.9,2.2,5.5,1);label(subtitle,x+3.5,y+.92,1.3,5.5,.65);b(x+1,y+2.3,.9,4.5,1.5,.15,0xe8e5dd);for(const dx of[1.2,5])b(x+dx,y+2.5,.16,.18,1.1,.74,0x46637a,false);for(let i=0;i<2;i++){b(x+1.3+i*2.3,y+2.5,1.05,1.5,.16,.9,0x071725,false);b(x+1.38+i*2.3,y+2.67,1.12,1.34,.02,.7,0x2d6f9d,false,true);b(x+1.5+i*2.3,y+3.1,1.06,1,.4,.035,0x65899f,false);b(x+1.7+i*2.3,y+4.1,.2,.8,.8,.5,0x324c6d,false);}office.place('pottedPlant',x+5.9,y+3.2,.7,.7,{group});}
 station(-18,8,'01 · 고객 발견','누구의 어떤 문제를 해결할까?');
 station(10,8,'02 · 콘텐츠 제작','아이디어를 광고와 콘텐츠로');
 station(-18,17,'03 · 실험과 개선','고객 반응을 보고 다시 만들기');
 // Sample creative cards, explicitly a process illustration rather than invented results.
 for(let i=0;i<3;i++){b(11+i*1.8,11,.8,1.3,.15,1.1,[0x2f73bb,0x7599bf,0xc7d9e6][i],false);}
 for(let i=0;i<4;i++)b(-16+i*1.1,19,.8,.65,.4,.2+i*.25,0x5a9fe0,false);
 // Keep the arrival path clear: the rocket, workstations and portals carry the story.
 for(const y of[8,16,24])for(const x of[-3.6,3.3]){b(x,y,0,.25,.4,.7,0x476683,false);b(x,y,.7,.25,.4,.12,0x94d1ff,false,true);}
 function portal(x,y,title,sub){b(x,y,0,6,3,.18,0xc8c6bd,false);for(const dx of[0,5.7])b(x+dx,y,.18,.3,.35,3.1,0xd1d6d4);b(x,y,3.2,6,.35,.3,0xd1d6d4);label(title,x+3,y+.4,2.65,5,1);label(sub,x+3,y+.41,1.85,5,.6);}
 portal(-16,27,'문샷 공부방','배움이 실행으로 이어지는 곳');portal(10,24,'내 AI 사무실','내 업무를 바꾸는 나만의 자리');
 
}
export const openCampusActions=[
 ['experience','고객 발견 체험','AI 마케팅의 시작',{x:-16,y:10,w:3,d:2,height:2.3}],
 ['offer','문샷에서 배우는 것','아이디어 → 실행 → 개선',{x:11,y:10,w:3,d:2,height:2.3}],
 ['destination:study','문샷 공부방','함께 배우고 실행해요',{x:-14,y:27,w:2,d:1,height:3.4}],
 ['destination:office','내 AI 사무실','내 일에 적용해요',{x:12,y:24,w:2,d:1,height:3.4}],
];
