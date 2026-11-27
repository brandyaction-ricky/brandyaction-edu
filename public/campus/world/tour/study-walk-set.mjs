import {doors} from './lobby-paths.mjs';

export function buildStudyWalkSet(T,scene) {
  const ink=0x263a48, graphite=0x31404c, ivory=0xe3dac7, stone=0xccbeaa;
  const wood=0xbe9267, edge=0xe4c49a, navy=0x294359, steel=0x52606a;
  const cube=new T.BoxGeometry(1,1,1);
  const batches=new Map(), temp=new T.Object3D();
  function part(geo,color,x,y,z,w,h,d,rz=0,ry=0) {
    const key=geo.uuid+color;
    if(!batches.has(key))batches.set(key,{geo,color,matrices:[]});
    temp.position.set(x,y,z);temp.rotation.set(0,ry,rz,'YXZ');temp.scale.set(w,h,d);temp.updateMatrix();
    batches.get(key).matrices.push(temp.matrix.clone());
  }
  const box=(...args)=>part(cube,...args);
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
  // The audience faces the stage from the entrance. Both side aisles stay clear to the doors.
  box(stone,0,-.16,14,25,.3,44);
  box(ivory,0,-.015,14,17,.035,42);
  // Daylight is painted once. The floor needs no realtime lights or shadow passes.
  const finish=document.createElement('canvas');finish.width=768;finish.height=640;
  const brush=finish.getContext('2d');
  const daylight=brush.createLinearGradient(0,640,768,0);
  daylight.addColorStop(0,'#b7b1a4');daylight.addColorStop(.54,'#e3daca');daylight.addColorStop(1,'#bab9b1');
  brush.fillStyle=daylight;brush.fillRect(0,0,768,640);
  brush.save();brush.transform(1,.15,-.55,1,65,0);
  for(let i=0;i<6;i++){brush.fillStyle='#fff5de36';brush.fillRect(i*150,-150,139,1050);brush.fillStyle='#34415116';brush.fillRect(i*150+139,-150,4,1050);}
  brush.restore();
  brush.strokeStyle='#665c4e2e';brush.lineWidth=1;
  for(let i=0;i<9;i++){brush.beginPath();brush.moveTo(i*96,0);brush.lineTo(i*96,640);brush.stroke();}
  for(let i=0;i<8;i++){brush.beginPath();brush.moveTo(0,i*90);brush.lineTo(768,i*90);brush.stroke();}
  const paving=new T.CanvasTexture(finish);paving.colorSpace=T.SRGBColorSpace;
  const tile=new T.Mesh(new T.PlaneGeometry(25,44),new T.MeshBasicMaterial({map:paving}));
  tile.rotation.x=-Math.PI/2;tile.position.set(0,.008,14);scene.add(tile);
  for(const x of [-8.4,8.4])box(edge,x,.009,4,.055,.012,22);
  for(const z of [-5,-1,3,7,11,15])box(stone,0,.005,z,16.8,.012,.022);
  for(const z of [-8,1,12]){
    for(const x of [-12.2,12.2])box(steel,x,2.35,z,.13,4.7,.13);
    for(let i=0;i<16;i++){
      const at=j=>[12.2*Math.cos(j*Math.PI/16),4.7+4.2*Math.sin(j*Math.PI/16)];
      rib(...at(i),...at(i+1),z,.105);
    }
  }
  for(const x of [-12.2,12.2]){
    box(ivory,x,.32,3,.24,.64,24);
    box(steel,x,1.1,3,.085,.09,24);
  }

  box(graphite,0,.14,-2.8,9.15,.28,3.4);
  box(wood,0,.30,-2.8,9.15,.055,3.4);
  box(edge,0,.19,-1.084,9.0,.034,.024);
  box(navy,0,2.1,-3.94,7.7,3.72,.23);
  const art=document.createElement('canvas');art.width=896;art.height=400;
  const g=art.getContext('2d');
  const backdrop=g.createLinearGradient(0,400,880,0);
  backdrop.addColorStop(0,'#152841');backdrop.addColorStop(.7,'#385b80');backdrop.addColorStop(1,'#547793');
  g.fillStyle=backdrop;g.fillRect(0,0,896,400);
  g.save();g.beginPath();g.arc(752,290,231,0,Math.PI*2);g.clip();
  const moon=g.createLinearGradient(565,100,895,390);moon.addColorStop(0,'#ffebbc');moon.addColorStop(.58,'#cbbda5');moon.addColorStop(1,'#758297');
  g.fillStyle=moon;g.fillRect(510,40,386,360);
  for(let i=0;i<45;i++){
    const x=540+(i*83)%365,y=55+(i*59)%360,r=3+(i*13)%25;
    g.fillStyle='rgba(99,106,118,.13)';g.beginPath();g.ellipse(x,y,r,r*.59,-.42,0,Math.PI*2);g.fill();
  }
  g.restore();
  g.fillStyle='#f4d596';g.fillRect(130,91,48,4);
  g.fillStyle='#ebeff1';g.font='600 23px system-ui';g.fillText('MOONSHOT  /  CAMPUS',130,148);
  g.fillStyle='#fff6e5';g.font='bold 67px system-ui';g.fillText('라이브 무대',125,244);
  const map=new T.CanvasTexture(art);map.colorSpace=T.SRGBColorSpace;
  const screen=new T.Mesh(new T.PlaneGeometry(7.35,3.30),new T.MeshBasicMaterial({map}));
  screen.position.set(0,2.1,-3.803);screen.name='live-stage-screen';scene.add(screen);
  for(const x of [-4.15,4.15]){
    box(ink,x,.86,-3.3,.42,1.0,.48);
    box(steel,x,.47,-3.3,.66,.18,.61);
  }
  for(const x of [-1.38,1.38]) {
    box(wood,x,.46,.35,2.05,.12,.6);
    for(const leg of [-.7,.7])box(ink,x+leg,.22,.35,.12,.44,.46);
  }
  // The two learning doors share a brass lintel; the office has a darker oak surround.
  for(const [id,door] of Object.entries(doors)){
    const {x,z,label}=door, color=id==='office'?navy:graphite;
    const face=z-.8;
    const side=id==='office'?1:-1;
    // A roof, return wall and furnished window make each entry read as a room.
    box(color,x,1.57,face-1.12,2.76,3.14,1.9);
    if(id!=='study'){
      box(steel,x+side*1.72,3.25,face-1.2,6.5,.20,2.9);
      box(color,x+side*3.1,1.53,face-1.34,3.6,3.08,2.05);
      box(edge,x+side*3.08,2.68,face-.26,3.40,.07,.09);
      box(ink,x+side*3.08,1.70,face-.25,3.24,1.8,.13);
      for(const dx of [-1.05,0,1.05]){
        const wx=x+side*3.08+dx;
        box(id==='library'?wood:0x859da2,wx,1.70,face-.168,.94,1.62,.03);
        if(id==='library')for(const h of [1.3,1.95]){
          box(edge,wx,h-.22,face-.10,.94,.055,.12);
          for(let j=0;j<4;j++)box([navy,stone,graphite,ivory][j],wx-.32+j*.18,h,face-.11,.12,.27+j*.05,.09);
        }
        if(id==='office')box(navy,wx,1.51,face-.10,.66,.41,.08);
      }
      box(stone,x+side*3.08,.54,face-.16,3.4,.12,.38);
    }else{
      box(steel,x,3.25,face-.9,3.3,.20,2.3);
    }
    box(color,x,1.56,face-.28,2.76,3.12,.20);
    box(wood,x+.28,1.27,face-.16,1.48,2.51,.13);
    for(const dx of [-1.34,1.34]) box(color,x+dx,1.56,face,.17,3.12,.50);
    box(color,x,2.98,face,2.84,.45,.50);
    box(edge,x,2.73,face+.24,2.69,.05,.08);
    box(edge,x+.76,1.24,face-.04,.055,.43,.10);
    sign(label,x,2.98,face+.27,2.46,.37,'#fff2d7');
    box(steel,x,.017,z-.36,2.58,.024,.68);
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
  for(const batch of batches.values()){
    const mesh=new T.InstancedMesh(batch.geo,new T.MeshStandardMaterial({color:batch.color,roughness:.88}),batch.matrices.length);
    batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));scene.add(mesh);
  }
  return backdropReady;
}
