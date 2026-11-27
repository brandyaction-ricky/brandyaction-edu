import {doors} from './lobby-paths.mjs';

export function buildStudyWalkSet(T,scene) {
  const seat={x:-2,z:-6.49};
  const ink=0x263a48, graphite=0x31404c, ivory=0xe3dac7, stone=0xccbeaa;
  const blue=0x2653bd, wood=0xbe9267, edge=0xe4c49a, navy=0x294359, steel=0x52606a;
  const cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(.5,.5,1,14);
  const batches=new Map(), temp=new T.Object3D();
  function part(geo,color,x,y,z,w,h,d,rz=0,ry=0) {
    const key=geo.uuid+color;
    if(!batches.has(key))batches.set(key,{geo,color,matrices:[]});
    temp.position.set(x,y,z);temp.rotation.set(0,ry,rz,'YXZ');temp.scale.set(w,h,d);temp.updateMatrix();
    batches.get(key).matrices.push(temp.matrix.clone());
  }
  const box=(...args)=>part(cube,...args);
  const round=(...args)=>part(cylinder,...args);
  function rib(x1,y1,x2,y2,z,width) {
    box(steel,(x1+x2)/2,(y1+y2)/2,z,width,Math.hypot(x2-x1,y2-y1),.16,-Math.atan2(x2-x1,y2-y1));
  }
  function sign(str,x,y,z,w,h,fg,bg,weight=700){
    const c=document.createElement('canvas');c.width=Math.min(1024,Math.max(256,Math.ceil(w*110)));c.height=Math.round(c.width*h/w);
    const ctx=c.getContext('2d');
    if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);}
    ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=weight+' '+Math.floor(c.height*.82)+'px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(str,c.width/2,c.height*.53,c.width*.96);
    const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
    const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map,transparent:!bg,alphaTest:.15}));
    mesh.position.set(x,y,z);scene.add(mesh);
  }
  function panel(w,h,paint) {
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    paint(canvas.getContext('2d'),w,h);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
  }
  function finishFloor(x,z,width,depth,study) {
    const map=panel(1024,768,(ctx,w,h)=>{
      const grad=ctx.createLinearGradient(0,0,w,h);
      grad.addColorStop(0,study?'#9f7954':'#aaa9a3');grad.addColorStop(.5,study?'#d9bb92':'#ddd4c2');grad.addColorStop(1,study?'#b79267':'#bcb8ad');
      ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
      let seed=3141;
      const random=()=>((seed=Math.imul(1664525,seed)+1013904223|0)>>>0)/4294967296;
      for(let i=0;i<(study?5000:12000);i++){
        ctx.fillStyle=i%2?'rgba(255,250,225,.09)':'rgba(61,50,42,.065)';
        ctx.fillRect(random()*w,random()*h,study?8+random()*70:1+random()*2,1);
      }
      ctx.strokeStyle='rgba(67,60,54,.24)';ctx.lineWidth=1;
      const rows=study?24:6;
      for(let row=0;row<rows;row++){
        const y=row*h/rows;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);
        const units=study?4:9;
        for(let col=0;col<units;col++){const at=(col+(study?(row%3)*.33:0))*w/units;ctx.moveTo(at,y);ctx.lineTo(at,y+h/rows);}
        ctx.stroke();
      }
      // Daylight and broad window-frame shadows are baked into this single diffuse map.
      ctx.save();ctx.transform(1,.26,-.55,1,w*.18,0);
      for(let i=0;i<4;i++){
        ctx.fillStyle='rgba(255,245,213,.35)';ctx.fillRect(i*w*.235,-h*.6,w*.217,h*1.45);
        ctx.fillStyle='rgba(56,66,78,.13)';ctx.fillRect(i*w*.235+w*.217,-h*.6,w*.016,h*1.45);
      }
      ctx.restore();
      if(study)for(const u of[.26,.66]){
        const shadow=ctx.createRadialGradient(u*w,h*.4,0,u*w,h*.4,w*.23);
        shadow.addColorStop(0,'rgba(61,43,33,.28)');shadow.addColorStop(1,'rgba(61,43,33,0)');
        ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);
      }
    });
    const m=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshBasicMaterial({map}));
    m.rotation.x=-Math.PI/2;m.position.set(x,.011,z);scene.add(m);
  }
  // A continuous threshold: the study and atrium share one floor, camera and renderer.
  box(stone,0,-.12,7,27,.24,18);
  box(0xc7ad8e,-3,-.1,-6,15,.2,14);
  finishFloor(0,7,27,18,false);finishFloor(-3,-6.3,15,13,true);
  // Graphite identity wall uses a real opening, so the camera can pass through it.
  box(graphite,-8.15,3,0,8.1,6,.42);
  box(graphite,1.05,3,0,.9,6,.42);
  box(graphite,-1.75,4.88,0,4.7,2.24,.42);
  for(const x of[-10.7,-6.4])box(0x373f47,x,3,.215,.018,5.85,.015);
  box(steel,-5.35,6.02,0,13.7,.11,.52);
  box(0xa2a195,-5.35,5.94,.235,13.7,.035,.06);
  box(ink,-8.1,.12,.24,8.05,.22,.06);
  for(const x of[-9.8,-7.2,-4.55])box(0x263540,x,2.9,.217,.019,5.6,.015);
  for(const z of[-1.4,-4.7,-8.0,-11.6])box(navy,4.32,2.05,z,.11,3.98,.11);
  box(navy,2.97,.12,0,2.9,.23,.17);box(navy,3.0,2.42,0,3,.08,.1);
  box(navy,4.36,1.98,0,.13,4,.13);
  box(blue,-4.02,1.89,.14,.22,3.78,.62);box(blue,.51,1.89,.14,.22,3.78,.62);
  box(blue,-1.75,3.67,.14,4.76,.24,.62);
  sign('MOONSHOT',-2.3,4.85,.265,6.1,1.16,'#fff2df');
  box(0xd85737,-5.03,4.96,.26,.14,.57,.06,-.35);
  sign('공부방',-1.75,3.17,.49,2.45,.48,'#1f3343','#e9dec4');
  box(wood,-7.8,.47,.81,4.2,.19,.94);for(const x of[-9.55,-6.05])box(ink,x,.22,.78,.22,.44,.78);
  // Three freestanding entrances and the existing reading-room door face the same concourse.
  const portalColors = {office:0x344a4d, live:0x634438, library:0x4c5260};
  for (const [id,color] of Object.entries(portalColors)) {
    const {x,z,label}=doors[id];
    for (const dx of [-1.36,1.36]) box(color,x+dx,1.53,z-.26,.21,3.06,.46);
    box(color,x,3.04,z-.26,2.94,.56,.46);
    box(0xd6b98b,x,2.78,z-.02,2.54,.048,.08);
    sign(label,x,3.05,z+.005,2.42,.38,'#fff6e5');
    box(0xd0c6b0,x,.017,z,2.56,.024,.82);
  }
  // Arches frame the moon. An open span between ribs gives the entrance its sight line.
  for(const z of[-10,-3,4,11,17]){
    for(const x of[-13,13])box(steel,x,2.35,z,.16,4.7,.16);
    for(let i=0;i<12;i++){
      const at=j=>[13*Math.cos(j*Math.PI/12),4.7+4.5*Math.sin(j*Math.PI/12)];
      const a=at(i),b=at(i+1);rib(...a,...b,z,.16);
    }
  }
  for(const x of[-13,13]){
    box(ivory,x,.47,3,.24,.94,29);
    for(const y of[1.07,3.3,4.7])box(steel,x,y,3,.1,.09,29);
  }
  for(let i=0;i<15;i++){
    const h=(i+1)*.22;box(0xabb0ae,7.5,h/2,1.45-i*.43,4.8,h,.45);
    box(0xdfc082,7.5,h+.006,1.63-i*.43,4.65,.018,.055);
  }
  box(0x869391,8,3.15,-7.25,6,.3,5.4);
  for(const x of[5.05,9.95]){
    for(let i=0;i<6;i++)round(steel,x,.76+i*.59,1.5-i*1.23,.065,1.08,.065);
    const rail=new T.Mesh(cylinder,new T.MeshStandardMaterial({color:steel}));
    const a=new T.Vector3(x,1.23,1.7),b=new T.Vector3(x,4.3,-5);
    rail.position.copy(a).add(b).multiplyScalar(.5);rail.scale.set(.075,a.distanceTo(b),.075);
    rail.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());scene.add(rail);
  }
  // One matte backdrop is shared by the atrium and the study windows.
  const panorama=new Image();
  panorama.src='/campus/world/assets/study-lunar-horizon.webp';
  const backdropReady=panorama.decode().then(()=>{
    const map=new T.CanvasTexture(panorama);map.colorSpace=T.SRGBColorSpace;
    const view=new T.Mesh(new T.PlaneGeometry(115,38.33),new T.MeshBasicMaterial({map}));
    view.position.set(2,7,-37);scene.add(view);
    // Wrap the ridgelines around the windows while keeping Earth in the front view only.
    function sideWindow(x, rotation, start, width) {
      const geometry = view.geometry.clone();
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, start + uv.getX(i) * width);
      const window = new T.Mesh(geometry, view.material);
      window.rotation.y = rotation;
      window.position.set(x, 7, -30);
      scene.add(window);
    }
    sideWindow(24, -Math.PI / 2, .63, .37);
    sideWindow(-27, Math.PI / 2, 0, .45);
  });
  // A clerestory, a pale soffit and warm pinboard complete the reading room.
  box(edge,-3,4.12,-6,15,.19,12.65);
  box(0xddd7c5,-3,3.995,-6,14.85,.06,12.55);
  for(const z of[-2.7,-6.1,-9.5])box(0xf8daa0,-3,3.949,z,9,.026,.08);
  // Reading studio, with the active notebook framed by the open doorway.
  box(ivory,-1,2.3,-12.6,10.9,4.6,.28);
  box(ivory,-8.5,.47,-12.6,4.1,.94,.3);box(ivory,-8.5,3.85,-12.6,4.1,.53,.3);
  for(const x of[-10.45,-8.47,-6.5])box(navy,x,2.23,-12.54,.075,2.65,.16);
  box(edge,-8.48,.94,-12.32,4.1,.1,.63);
  box(wood,-8.4,.51,-11.75,3.75,.15,.75);for(const x of[-9.9,-6.9])box(navy,x,.24,-11.75,.15,.48,.6);

  box(0xe1d3ba,-10.45,2,-6.2,.2,4,12.5);
  for(const z of[-2,-6,-10])box(navy,4.36,2.1,z,.12,4.2,.12);
  box(wood,4.36,1.04,-6,.15,.14,12.6);
  for(const x of[-4.4,-.6,3.0]){
    box(0x896b52,x,1.5,-12.27,3.7,3,.18);
    for(const dx of[-1.82,1.82])box(wood,x+dx,1.55,-11.96,.12,3.1,.65);
    for(let row=0;row<3;row++){
      box(edge,x,.25+row*.83,-11.96,3.7,.1,.65);
      for(let j=0;j<9;j++){
        const h=.43+.055*((row+j)%4);box([navy,0xced0bd,0xd9c5a4,0x9d5740][(Math.floor(j/3)+row)%4],x-1.56+j*.32,.32+row*.83+h/2,-11.89,.19+(j%3)*.045,h,.35);
      }
    }
  }
  function chair(x,z,mine){
    box(navy,x,.45,z,.77,.11,.76);box(mine?0xa9563d:navy,x,.75,z+.32,.76,.36,.09);
    for(const dx of[-.28,.28])for(const dz of[-.24,.24])box(steel,x+dx,.21,z+dz,.06,.42,.06);
  }
  function table(x,z){
    box(wood,x,.89,z,4.9,.16,1.45);
    for(const dx of[-2.03,2.03])for(const dz of[-.48,.48])box(steel,x+dx,.42,z+dz,.105,.84,.105);
    box(navy,x,1,z-.18,.48,.06,.34);box(navy,x,1.36,z-.18,.06,.72,.06);
    box(navy,x,1.73,z-.16,1.8,.095,.16);box(0xffe6b3,x,1.675,z-.16,1.74,.024,.135);
    for(const dx of[-1.22,1.22]){
      box(0x475764,x+dx,.986,z+.18,.99,.024,.62);
      box(0xf3e6cd,x+dx-.015,1.01,z+.18,.77,.026,.48);box(wood,x+dx,1.029,z+.18,.017,.012,.47);
      for(let j=0;j<3;j++)box(0xa09785,x+dx+.19,1.03,z+.03+j*.08,.23,.009,.009);
      chair(x+dx,z+1.12,Math.abs(x+dx-seat.x)<.01 && Math.abs(z+1.12-seat.z)<.01);
    }
  }
  table(-.78,-7.61);table(-6.7,-7.61);
  sign('내 자리',seat.x,1.17,-7.64,.56,.16,'#f8f1dc','#294359');
  const oakMap=panel(384,128,(c,w,h)=>{
    c.fillStyle='#fff0d9';c.fillRect(0,0,w,h);
    for(let i=0;i<135;i++){
      c.strokeStyle=i%4?'rgba(128,81,46,.065)':'rgba(155,106,67,.18)';c.lineWidth=.7;
      const y=i*h/135;c.beginPath();c.moveTo(0,y);c.bezierCurveTo(w*.32,y+3*Math.sin(i),w*.6,y-2,w,y+.5);c.stroke();
    }
  });
  for(const batch of batches.values()){
    const mesh=new T.InstancedMesh(batch.geo,new T.MeshStandardMaterial({color:batch.color,roughness:.88,...(batch.color===wood?{map:oakMap}:{})}),batch.matrices.length);
    batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));scene.add(mesh);
  }
  return backdropReady;
}
