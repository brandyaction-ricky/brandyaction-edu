import {atriumFinish} from './atrium-finish.mjs';
import {atriumHeightAt} from './atrium-layout.mjs';
export {atriumHeightAt} from './atrium-layout.mjs';
/** Arrival hall: real geometry, transparent envelope and a walkable upper gallery. */
export function buildLunarAtrium(office,group,box){
 const a=atriumFinish(office,group),cream=0xd8d2c6,ink=0x555a5d,blue=0x315bea,warm=0xffd6a0;
 const collision=(x,y,w,d)=>{const m=box(group,x,y,-.2,w,d,.02,ink,true);m.visible=false;};
 a.rounded(-22,-10,-.75,44,44,.7,3,0x303944);
 a.rounded(-21.8,-9.8,-.05,43.6,43.6,.05,2.8,0xb8b8b4,'floor');
 // The blue floor guide curves around the staircase, leaving a clear central arrival axis.
 const route=[];for(let i=0;i<=40;i++){const t=i/40;route.push([4+Math.sin(t*Math.PI)*3,.018,33-t*29]);}
 for(let i=1;i<route.length;i++)a.beam(route[i-1],route[i],.035,blue,'glow');
 // Real glass panels span a generous barrel vault, with slender steel mullions.
 const arch=t=>[-22*Math.cos(t),5+10*Math.sin(t)];
 for(const y of[-9,3,15,30])for(let i=0;i<20;i++){const p=arch(i/20*Math.PI),q=arch((i+1)/20*Math.PI);a.beam([p[0],p[1],y],[q[0],q[1],y],.15,0x6f7b83);}
 for(let i=0;i<20;i++){
  const p=arch(i/20*Math.PI),q=arch((i+1)/20*Math.PI);
  a.surface([[p[0],p[1],-9],[p[0],p[1],30],[q[0],q[1],30],[q[0],q[1],-9]],0x9cb2c7);
  if(i%2===0)a.beam([p[0],p[1],-9],[p[0],p[1],30],.1,0x64717b);
 }
 for(const x of[-22,22]){
  a.glass(x,-9,.4,.025,39,4.6);a.rounded(x-.1,-9,0,.2,39,.32,.08,cream);
  for(const y of[-9,3,15,30])a.beam([x,0,y],[x,5,y],.17,0x6f7b83);
  a.beam([x,2.8,-9],[x,2.8,30],.08,0x6f7b83);
 }
 for(let i=0;i<12;i++){
  const x=-22+i*44/12,xx=x+44/12,z=5+10*Math.sqrt(Math.max(0,1-(x/22)**2)),zz=5+10*Math.sqrt(Math.max(0,1-(xx/22)**2));
  a.surface([[x,.4,-9],[xx,.4,-9],[xx,zz,-9],[x,z,-9]],0x9cb2c7);a.beam([x,0,-9],[x,z,-9],.12,0x6f7b83);
 }
 // Graphite identity tower: sharp facade normals, subtle panel joints, luminous cornice.
 a.rounded(-21,-7,0,14,22,10,2.8,ink);collision(-21,-7,14,22);
 a.rounded(-21.3,-7.3,9.9,14.6,22.6,.28,3.1,cream);
 for(const z of[.15,9.83]){
  a.arc(-9.8,12.2,z,2.86,2.81,0,Math.PI/2,.045,warm,'glow',24);
  a.beam([-18.2,z,15.04],[-9.8,z,15.04],.045,warm,'glow');a.beam([-6.96,z,-4.2],[-6.96,z,12.2],.045,warm,'glow');
 }
 for(const z of[3.35,6.7]){a.beam([-18.2,z,15.02],[-9.8,z,15.02],.014,0x414649);a.beam([-6.98,z,-4.2],[-6.98,z,12.2],.014,0x414649);}
 for(const x of[-18,-14,-10])a.beam([x,.3,15.025],[x,9.65,15.025],.012,0x414649);
 a.label('MOONSHOT',-14,15.1,8.2,10,1.15);
 a.label('AI',-14,15.11,6.25,8,1.1);a.label('MARKETING',-14,15.12,4.95,10,1.1);
 a.label('10×',-13.8,15.13,2.45,6,2.7,{color:'#4267ed'});
 a.glowPool(-14,16,.022,13,3);
 // Central staircase rises to the actual upper gallery, with fine metal/glass balustrades.
 const steps=24,run=14.3/steps;
 for(let i=0;i<steps;i++){
  const y=18.3-(i+1)*run,h=(i+1)*4.2/steps;
  a.rounded(-3.5,y,0,7,run+.02,h,.025,0x8b8d8b);
  a.rounded(-3.5,y,h-.025,7,run,.025,.02,0xc3c1b9);
  a.beam([-3.4,h-.05,y+run],[3.4,h-.05,y+run],.018,warm,'glow');
 }
 for(const x of[-3.6,3.6]){
  a.surface([[x,.15,18.3],[x,4.35,4],[x,5.25,4],[x,1.05,18.3]],0x9cb2c7);
  a.beam([x,1.06,18.3],[x,5.26,4],.055,0x959d9f);
  for(let i=0;i<=6;i++){const y=18.3-i*14.3/6,z=atriumHeightAt(Math.sign(x)*3.4,y);a.beam([x,z,y],[x,z+1.05,y],.035,0x9ca3a5);}
 }
 a.rounded(-6.8,-1,3.93,24.8,5, .27,.3,cream);a.rounded(-6.8,-1,4.2,24.8,5,.025,.3,0xb8b8b4,'floor');
 // Front gallery rail leaves the stair opening clear. Back rail prevents an invisible ledge.
 for(const [x,w]of[[-6.8,3.2],[3.6,14.4]]){a.glass(x,4,4.2,w,.025,1.05);a.beam([x,5.27,4],[x+w,5.27,4],.05,0x969fa2);a.beam([x,4.02,4.05],[x+w,4.02,4.05],.035,warm,'glow');}
 a.glass(-6.8,-1,4.2,24.8,.025,1.05);a.beam([-6.8,5.27,-1],[18,5.27,-1],.05,0x969fa2);
 for(const x of[-6,5,17])a.cylinder(x,1,0,.13,3.95,0x9b9c95,'metal');
 // Hollow glass-fronted rooms: furnished interiors are visible from the arrival route.
 function pavilion(x,y,title,sub){
  const w=9,d=8;
  a.rounded(x,y,0,w,d,.12,.8,0xbab6aa,'floor');
  a.rounded(x,y,.12,w,.25,3.8,.1,cream);collision(x,y,w,.4);
  for(const dx of[0,w-.3]){a.glass(x+dx,y,.12,.025,d,3.8);for(const dy of[0,d/2,d-.2])a.rounded(x+dx,y+dy,.12,.2,.2,3.8,.03,0x8d9496,'metal');collision(x+dx,y,.3,d);}
  a.rounded(x-.25,y-.25,3.9,w+.5,d+.5,.65,.95,cream);
  a.beam([x+.3,3.86,y+d+.02],[x+w-.3,3.86,y+d+.02],.04,warm,'glow');
  for(const dx of[0,w-2.4]){a.glass(x+dx,y+d,.2,2.4,.025,3.65);collision(x+dx,y+d,2.4,.06);}
  a.label(title,x+w/2,y+d+.3,4.25,w-.8,.5,{color:'#24394f'});
  a.label(sub,x+w/2,y+.3,2.7,w-1,.5,{color:'#304456'});
  // Work table, chairs, screens and warm ceiling panels, rather than a solid painted cube.
  a.rounded(x+2,y+3,.78,5,1.4,.12,.15,0x9f8363);collision(x+2,y+3,5,1.4);
  for(const dx of[2.2,6.6])a.rounded(x+dx,y+3.2,0,.12,1,.78,.03,0x55606a,'metal');
  for(const dx of[2.5,4.5]){
   a.rounded(x+dx,y+3.4,.9,1.2,.08,.8,.03,0x182b3c,'metal');
   a.label('MOONSHOT',x+dx+.6,y+3.49,1.3,1.05,.18,{color:'#8cb6ed'});
   a.rounded(x+dx+.1,y+4.7,.1,.8,.8,.42,.12,0x45576a,'fabric');a.rounded(x+dx+.1,y+5.25,.5,.8,.17,.65,.08,0x45576a,'fabric');
  }
  a.rounded(x+1,y+1,3.85,7,4,.035,.7,warm,'glow');a.glowPool(x+4.5,y+4,.023,8,7);
  a.plant(x+.75,y+7.2,0,.85);
 }
 pavilion(10,-6,'MOONSHOT STUDIO','배운 것을 나의 결과로');
 pavilion(10,12,'내 AI 사무실','내 AI 동료들과 일하는 곳');
 a.label('문샷 공부방',14.5,4.36,5.7,7,.65,{color:'#f2ede0'});
 a.sofa(-19,18,6);collision(-19,18,6,1.65);
 a.cylinder(-15.8,21,.03,2.1,.02,0x7d858a,'fabric');a.cylinder(-15.8,21,.05,.92,.55,0x777f87,'metal');a.cylinder(-15.8,21,.6,.97,.06,0xb0b4b4,'metal');
 for(const [x,y]of[[-20,16],[-7,17],[20,25],[7,-6],[-20,29]])a.plant(x,y,0,1.25);
 // Low display islands retain existing experiential entry points without obstructing the entrance.
 for(const [x,y,title,sub]of[[-18,25,'01  고객 발견','AI로 고객의 문제를 찾아요'],[8,27,'02  콘텐츠와 실험','만들고, 반응을 확인해요']]){
  a.rounded(x,y,0,6,1.4,.9,.25,cream);collision(x,y,6,1.4);
  a.rounded(x+.2,y+.15,.9,5.6,.15,1.4,.1,0x253c52,'metal');
  a.label(title,x+3,y+.32,1.9,5,.4);a.label(sub,x+3,y+.33,1.3,5,.28,{color:'#b9ccdf'});
  a.beam([x+.2,.1,y+1.41],[x+5.8,.1,y+1.41],.025,warm,'glow');
 }
 // Two non-shadow-casting practical lights; exterior and character lighting pipeline stays intact.
 const Light=office.campusPracticalLights?.[0]?.light?.constructor;
 if(Light)for(const [x,y,z,power]of[[-10,18,5,45],[11,12,5,30]]){const l=new Light(warm,power,19,2);l.position.set(x,z,y);l.castShadow=false;group.add(l);}
 // Grounded lunar exterior, with smooth normals and a distant landing vehicle.
 const v=[],ix=[],N=52;for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const x=-100+i*4,y=-100+j*4;let z=-2.2+Math.sin(x*.08)*Math.cos(y*.09)*.7;if(y<-25)z+=Math.min(1,(-y-25)/25)*(2.5+Math.sin(x*.075)*2+Math.sin(x*.22)*.65);for(const[cx,cy,r]of[[-36,20,12],[32,-29,15],[45,42,10]]){const q=Math.hypot(x-cx,y-cy)/r;z+=1.4*Math.exp(-(((q-1)*5)**2))-2*Math.exp(-((q*1.4)**4));}v.push(x,z,y);}
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const n=j*(N+1)+i;ix.push(n,n+N+1,n+1,n+1,n+N+1,n+N+2);}const terrain=a.raw(v,ix,0x8a8b88);const texture=office.patternTexture((c,n)=>{c.fillStyle='#b2b3ae';c.fillRect(0,0,n,n);});const lunar=new Image();lunar.onload=()=>{if(office.dead)return;texture.image=lunar;texture.needsUpdate=true;terrain.material.map=texture;terrain.material.bumpMap=texture;terrain.material.bumpScale=.12;office.draw();};lunar.src='../assets/moon-nasa-lroc-2k.jpg';const uv=[];for(let i=0;i<v.length;i+=3)uv.push(v[i]/55,v[i+2]/55);terrain.geometry.setAttribute('uv',new terrain.geometry.attributes.position.constructor(new Float32Array(uv),2));
 // Launch hardware proportions and engine clusters, beyond the protected walkway.
 a.cylinder(10,-26,-1.7,5,.45,0x4d5965);a.cylinder(10,-26,-1.25,1.05,13,0xe0e3e1,'metal');a.cylinder(10,-26,8.8,1.06,.6,0x2f4b83,'metal');
 const nose=[],idx=[];for(let j=0;j<=12;j++){const t=j/12,r=1.05*Math.cos(t*Math.PI/2);for(let i=0;i<32;i++){const th=i/32*Math.PI*2;nose.push(10+r*Math.cos(th),11.75+t*3.4,-26+r*Math.sin(th));}}
 for(let j=0;j<12;j++)for(let i=0;i<32;i++){const n=j*32+i,k=j*32+(i+1)%32;idx.push(n,n+32,k+32,n,k+32,k);}a.mesh(nose,idx,0xe0e3e1,'metal');
 for(const x of[13,14.2])a.beam([x,-1,-28],[x,13,-28],.2,0x677888);for(let z=0;z<13;z+=1.6)a.beam([13,z,-28],[14.2,z+1.6,-28],.1,0x8795a0);
 group.name='moonshot-lunar-atrium';
}
export const atriumActions=[
 ['experience','고객 발견 체험','AI 마케팅의 첫 단계',{x:-17,y:27,w:3,d:1,height:2.6}],
 ['offer','문샷에서 배우는 것','콘텐츠 · 실행 · 개선',{x:9,y:29,w:3,d:1,height:2.6}],
 ['destination:study','문샷 공부방','동료와 함께 실행하기',{x:12,y:3.5,w:3,d:1,height:6.5}],
 ['destination:office','내 AI 사무실','나만의 AI 동료 만나기',{x:13,y:20,w:3,d:1,height:4.9}],
];
