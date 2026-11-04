import {architecture} from './architecture.mjs';
/** Walkable arrival atrium. Upper galleries are architectural scenery; all destinations are at ground level. */
export function buildLunarAtrium(office,group,box){
 const a=architecture(office,group),cream=0xd5d0c4,ink=0x48535e,blue=0x315bea,warm=0xffd6a0;
 const collision=(x,y,w,d)=>{const m=box(group,x,y,-.2,w,d,.02,ink,true);m.visible=false;};
 // A continuous architectural plinth with a broad, unbroken circulation route.
 a.rounded(-22,-10,-.75,44,44,.7,3,0x303944);
 a.rounded(-21.8,-9.8,-.05,43.6,43.6,.05,2.8,0xb2b4b3);
 // Mineral floor slabs retain quiet variation rather than bright game-grid tiles.
 for(let x=-20;x<21;x+=4.2)for(let y=-8;y<33;y+=4.2)a.rounded(x,y,.002,4.16,4.16,.008,.04,((Math.round(x+y)%3+3)%3===0)?0xa9adae:0xb7bab9);
 const route=[];for(let i=0;i<=60;i++){const t=i/60;route.push([Math.sin(t*Math.PI)*3.2,.035,30-t*35]);}
 for(let i=1;i<route.length;i++)a.beam(route[i-1],route[i],.055,blue,'glow');
 // Vaulted greenhouse-like envelope. Front remains open for readable overall views.
 for(const y of[-9,5,20]){
  for(const x of[-22,22])a.beam([x,0,y],[x,5,y],.3,0x76818a);
  for(let i=0;i<20;i++){const p=t=>[-22*Math.cos(t),5+9*Math.sin(t),y];a.beam(p(i/20*Math.PI),p((i+1)/20*Math.PI),.24,0x94a0a6);}
 }
 for(const x of[-21.9,21.9]){
  a.glass(x,-9,.5,.035,40,8.5);a.rounded(x-.15,-9,0,.3,40,.48,.1,cream);
  for(const y of[-9,-1,7,15,23,31])a.beam([x,.4,y],[x,9,y],.15,0x849399);
  for(const z of[4.8,9])a.beam([x,z,-9],[x,z,31],.12,0x849399);
 }
 a.glass(-22,-9,.4,44,.035,10);for(let x=-22;x<=22;x+=5.5)a.beam([x,0,-9],[x,5+9*Math.sqrt(Math.max(0,1-(x/22)**2)),-9],.16,0x849399);
 // The rounded, two-storey left wing gives scale, depth and an immediate Moonshot identity.
 a.rounded(-21,-7,0,14,22,7.4,2.8,ink);collision(-21,-7,14,22);
 a.rounded(-21.3,-7.3,4.15,14.6,22.6,.32,3,cream);
 a.rounded(-21.35,-7.35,7.4,14.7,22.7,.34,3.1,cream);
 // Cove lighting follows the curving facade, not floating strips.
 for(const z of[.15,4.1,7.35]){
  a.arc(-9.8,12.2,z,2.86,2.81,0,Math.PI/2,.045,warm,'glow',16);
  a.beam([-18.2,z,15.04],[-9.8,z,15.04],.05,warm,'glow');a.beam([-6.96,z,-4.2],[-6.96,z,12.2],.05,warm,'glow');
 }
 // Brushed vertical fins and two tall light wells accent the graphite facade.
 for(let x=-19;x<-9;x+=.28)a.rounded(x,15.025,.45,.035,.035,3.35,.01,0x3c4750,'metal');
 a.label('MOONSHOT',-14,15.12,6.5,10,1.15);a.label('AI MARKETING',-14,15.13,5.35,9,.8);
 a.label('10×',-13.6,15.14,2.5,6,2.3,{color:'#5478ff'});a.label('작은 개선을 넘어, 새로운 가능성으로',-14,15.15,.65,10,.45);
 // The roof garden is visible from the entrance and the overall map.
 for(const [x,y]of[[-18,-4],[-10,-4],[-18,11],[-10,11]])a.plant(x,y,7.74,1.15);
 for(const x of[-20.6,-7.5])a.glass(x,-5,7.75,.03,17,1.1);
 // Ground-level arched portals: their panels remain reachable without entering a decorative upper floor.
 function pavilion(x,y,title,sub,destination){
  a.rounded(x,y,0,9,8,.22,.9,cream);a.rounded(x,y,.22,9,8,3.8,.9,0xe2ddd1);collision(x,y,9,6.3);
  a.rounded(x+.45,y+.45,4.02,8.1,7.1,.18,.7,0x666d72,'metal');
  // Inset dark opening and soft arch border, all on the visible front.
  a.rounded(x+1.1,y+7.98,.45,6.8,.15,2.9,.85,ink);
  a.label(title,x+4.5,y+8.16,2.7,6.6,.65);a.label(sub,x+4.5,y+8.17,1.8,6.4,.4,{color:'#c5d4e6'});
  a.beam([x+1.5,.42,y+8.2],[x+7.5,.42,y+8.2],.045,blue,'glow');
  a.plant(x+.5,y+8.6,0,.65);a.plant(x+8.3,y+8.6,0,.65);
  group.userData ||= {};group.userData[destination]=true;
 }
 pavilion(9,-7,'문샷 공부방','배운 것을 나의 결과로','study');
 pavilion(10,11,'내 AI 사무실','내 AI 동료들과 일하는 곳','office');
 // A gallery of real learning steps replaces freestanding rectangular kiosks.
 for(const [x,y,title,sub]of[[-18,22,'01  고객 발견','고객의 문제를 발견해요'],[7,27,'02  콘텐츠와 실험','만들고, 반응을 확인해요']]){
  a.rounded(x,y,0,7,3.4,.12,.65,0x475259);a.rounded(x+.25,y+.2,.12,6.5,.24,2.6,.12,0x35424e);collision(x,y,7,2.2);
  a.label(title,x+3.5,y+.47,2.15,5.8,.55);a.label(sub,x+3.5,y+.48,1.5,5.7,.38,{color:'#b7c5d4'});
  a.rounded(x+.4,y+1.1,.84,6.2,1.3,.12,.22,cream);for(const dx of[1,5.5])a.rounded(x+dx,y+1.2,.12,.1,1,.72,.04,0x424b52,'metal');
  for(const dx of[1.2,3.7]){a.rounded(x+dx,y+1.25,.96,1.7,.12,.95,.06,0x121b24,'metal');a.label('IDEA  →  ACTION',x+dx+.85,y+1.39,1.43,1.5,.35,{color:'#83b8ff'});}
 }
 // Soft furniture, tables, lamps and planting provide a believable human scale.
 a.sofa(-19,17,5);collision(-19,17,5,1.65);a.cylinder(-15.8,20,.05,1,.08,0x344757,'fabric');a.cylinder(-15.8,20,.13,.72,.52,0x747e85,'metal');
 for(const [x,y]of[[19,24],[6,-5],[-5,15],[-20,31]])a.plant(x,y,0,1.15);
 // Grounded lunar exterior, with smooth normals and a distant landing vehicle.
 const v=[],ix=[],N=52;for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const x=-100+i*4,y=-100+j*4;let z=-2.2+Math.sin(x*.08)*Math.cos(y*.09)*.7;for(const[cx,cy,r]of[[-36,20,12],[32,-29,15],[45,42,10]]){const q=Math.hypot(x-cx,y-cy)/r;z+=1.4*Math.exp(-(((q-1)*5)**2))-2*Math.exp(-((q*1.4)**4));}v.push(x,z,y);}
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const n=j*(N+1)+i;ix.push(n,n+N+1,n+1,n+1,n+N+1,n+N+2);}a.mesh(v,ix,0x79818b);
 // Launch hardware proportions and engine clusters, beyond the protected walkway.
 a.cylinder(10,-26,-1.7,5,.45,0x4d5965);a.cylinder(10,-26,-1.25,1.05,13,0xe0e3e1,'metal');a.cylinder(10,-26,8.8,1.06,.6,0x2f4b83,'metal');
 const nose=[],idx=[];for(let j=0;j<=12;j++){const t=j/12,r=1.05*Math.cos(t*Math.PI/2);for(let i=0;i<32;i++){const th=i/32*Math.PI*2;nose.push(10+r*Math.cos(th),11.75+t*3.4,-26+r*Math.sin(th));}}
 for(let j=0;j<12;j++)for(let i=0;i<32;i++){const n=j*32+i,k=j*32+(i+1)%32;idx.push(n,n+32,k+32,n,k+32,k);}a.mesh(nose,idx,0xe0e3e1,'metal');
 for(const x of[13,14.2])a.beam([x,-1,-28],[x,13,-28],.2,0x677888);for(let z=0;z<13;z+=1.6)a.beam([13,z,-28],[14.2,z+1.6,-28],.1,0x8795a0);
 group.name='moonshot-lunar-atrium';
}
export const atriumActions=[
 ['experience','고객 발견 체험','AI 마케팅의 첫 단계',{x:-17,y:23,w:3,d:1,height:2.8}],
 ['offer','문샷에서 배우는 것','콘텐츠 · 실행 · 개선',{x:8,y:28,w:3,d:1,height:2.8}],
 ['destination:study','문샷 공부방','동료와 함께 실행하기',{x:12,y:1,w:3,d:1,height:3.6}],
 ['destination:office','내 AI 사무실','나만의 AI 동료 만나기',{x:13,y:19,w:3,d:1,height:3.6}],
];
