import {doors,studySeat} from './lobby-paths.mjs';
import {joinery,finish,roomTrim,interiorView} from './campus-interior-finish.mjs';

export function buildStudyWalkSet(T,scene,redraw) {
  const {box,round,beam,portal,shelves,desk,plant,build}=joinery(T,scene);
  const {wall,trim,timber,oak,paper,brass,lamp,shadow}=finish;
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
  // Static stone veining and shadows are baked once, outside of the visitor's render loop.
  const floorImage=new Image();floorImage.src='/campus/world/assets/lunar-concourse-floor.webp';
  void floorImage.decode().then(()=>{
    const paving=new T.CanvasTexture(floorImage);paving.colorSpace=T.SRGBColorSpace;
    const tile=new T.Mesh(new T.PlaneGeometry(30,47),new T.MeshBasicMaterial({map:paving}));
    tile.rotation.x=-Math.PI/2;tile.position.set(0,.008,11.5);scene.add(tile);redraw();
  }).catch(()=>{}); // The solid base remains usable if the decorative texture is unavailable.
  box(paper,0,-.17,11.5,30,.31,47);

  // The barrel vault wraps over the wings. A single translucent skin spans its metal lattice.
  const arch=(i)=>{const a=Math.PI*i/20;return [14.65*Math.cos(a),3.9+5.5*Math.sin(a)];};
  const panes=[],indices=[];
  for(let k=0;k<20;k++){
    const [x,y]=arch(k),[xx,yy]=arch(k+1),n=4*k;
    panes.push(x,y,-10,xx,yy,-10,xx,yy,22,x,y,22);indices.push(n,n+1,n+2,n,n+2,n+3);
    if(k%2===0)box(trim,x,y,6,.095,.105,32);
    for(const z of [-9.5,-3,4.5,13,21.5])beam(x,y,xx,yy,z,.14,.24,trim);
  }
  const glass=new T.PlaneGeometry();glass.setAttribute('position',new T.BufferAttribute(new Float32Array(panes),3));glass.setIndex(indices);
  glass.deleteAttribute('normal');glass.deleteAttribute('uv');glass.computeBoundingSphere();
  scene.add(new T.Mesh(glass,new T.MeshBasicMaterial({color:0xb2c9dd,transparent:true,opacity:.085,depthWrite:false,side:T.DoubleSide})));
  for(const side of [-1,1]){
    box(trim,side*14.65,2,5.5,.13,.10,32);
    for(const z of [-9.5,-3,4.5,13,21.5])box(trim,side*14.65,1.96,z,.20,3.92,.25);
  }

  // Rear glass is framed in perspective; the galleries sit inside the envelope.
  for(const x of [-13.1,-9.4,-5.7,-2,1.7,5.4,9.1,12.8]){
    const h=3.9+5.5*Math.sqrt(1-(x/14.65)**2);
    box(trim,x,h/2,-9.6,.092,h,.13);
  }
  box(trim,0,4.83,-9.6,28.72,.075,.13);
  box(paper,0,.34,-9.6,29.3,.68,.36);
  // Wide dark stage, oak steps and an uninterrupted view of the lunar horizon above them.
  box(wall,.10,.16,-6.05,7.10,.31,3.25);
  box(oak,.10,.34,-6.05,7.12,.07,3.25);
  box(timber,.10,.10,-4.22,6.86,.19,.45);
  box(brass,.10,.19,-4.05,6.87,.042,.07);
  box(wall,.10,2.16,-7.22,6.9,3.9,.38);
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
  const screen=new T.Mesh(new T.PlaneGeometry(6.59,3.53),new T.MeshBasicMaterial({map}));
  screen.position.set(.10,2.18,-7.0);screen.name='live-stage-screen';scene.add(screen);
  for(const x of [-3.7,3.90]){
    box(trim,x,1.05,-6.87,.26,1.75,.30);
    for(const y of [.63,1.13,1.63])round(shadow,x,y,-6.68,.07,.10,.07);
  }
  // The study opens from the navy identity wall; the office faces it across the concourse.
  const study=doors.study,office=doors.office;
  const sf=study.z-.7,of=office.z-.7;
  function alcove(x,z,w,d,h) {
    box(timber,x,h*.50,z-d,w,h,.14);
    box(oak,x,.055,z-d/2,w,.09,d);
    box(wall,x,h+.07,z-d/2,w+.30,.23,d+.30);
    for(const s of [-1,1])box(wall,x+s*w/2,h*.5,z-d/2,.19,h,d);
    box(lamp,x,h-.045,z-d*.43,w*.76,.045,.07);
  }
  // The threshold is an open passage. The chair, not a backdrop or a room swap, ends the blue line.
  const front=sf+.11, rear=-4.19, left=-10.67, right=-2.19, middle=(left+right)/2;
  const width=right-left, depth=front-rear, centerZ=(front+rear)/2;
  const floorTone=0xd9c3a1, slate=0x283746, seam=0x6e6457, terra=0xb53d29;
  box(floorTone,middle,.009,centerZ,width,.034,depth);
  const finishFloor=document.createElement('canvas');finishFloor.width=768;finishFloor.height=640;
  const wood=finishFloor.getContext('2d');
  wood.fillStyle='#b79b79';wood.fillRect(0,0,768,640);
  for(let r=0;r<26;r++){
    const y=r*25;
    wood.fillStyle=['#bfaa8d','#c0a689','#bea487','#c7ac8e'][r%4];wood.fillRect(0,y,768,24);
    for(let x=(r*91)%173;x<768;x+=213){wood.fillStyle='#a68a6b';wood.fillRect(x,y,1,24);}
    for(let k=0;k<9;k++){wood.fillStyle=k%2?'#ffedd60e':'#6846250a';wood.fillRect((91*r+73*k)%768,y+3+(k*11)%19,75+(k*18)%113,.8);}
  }
  // Roof mullions split this patch of sunlight into panes. The texture stays completely static.
  wood.save();wood.transform(1,-.21,.37,1,-83,145);
  wood.shadowColor='rgba(255,229,179,.65)';wood.shadowBlur=8;
  for(let r=0;r<4;r++)for(let c=0;c<5;c++){
    wood.fillStyle='rgba(255,240,202,'+(r===3?.25:.48)+')';wood.fillRect(c*142,r*110,134,99);
  }
  wood.restore();
  function furnitureShadow(x,z,w,d,alpha){
    wood.save();wood.translate((x-left)*768/width,(z-rear)*640/depth);
    wood.scale(w*768/width,d*640/depth);
    const contact=wood.createRadialGradient(0,0,.08,0,0,1);
    contact.addColorStop(0,'rgba(47,38,37,'+alpha+')');contact.addColorStop(1,'rgba(47,38,37,0)');
    wood.fillStyle=contact;wood.fillRect(-1,-1,2,2);wood.restore();
  }
  furnitureShadow(studySeat.x+.14,studySeat.z-.76,1.53,.86,.46);
  furnitureShadow(studySeat.x,studySeat.z,.50,.50,.38);
  furnitureShadow(left+2.15,rear+.42,2.52,.65,.42);
  for(const z of [rear+1.1,rear+3.4])furnitureShadow(left+1.65,z,1.32,.83,.38);
  const floorMap=new T.CanvasTexture(finishFloor);floorMap.colorSpace=T.SRGBColorSpace;
  const finishMesh=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshBasicMaterial({map:floorMap}));
  finishMesh.rotation.x=-Math.PI/2;finishMesh.position.set(middle,.028,centerZ);scene.add(finishMesh);
  box(slate,right,1.96,centerZ,.15,3.9,depth);
  box(timber,right-.10,.57,centerZ,.075,1.12,depth);
  // A glazed reading bay opens onto the lunar horizon above a low bookcase.
  box(slate,middle,.65,rear,width,1.30,.19);
  box(oak,middle,1.34,rear+.09,width,.13,.32);
  shelves(left+2.07,.13,rear+.35,3.85,1.16,4);
  for(let x=left;x<=right+.01;x+=width/5){
    box(slate,x,2.87,rear,.105,3.12,.14);
  }
  box(slate,middle,3.98,rear,width,.10,.15);
  box(oak,left,1.65,centerZ,.20,3.30,depth);
  for(const z of [rear+1.1,rear+3.4]){desk(left+1.65,z,2.06);}
  shelves(left+2.08,.12,front-3.66,2.05,1.28,3);
  plant(left+1.0,rear+.95,.88);
  // The east end is a recessed book wall. Its side cheek masks the back of the live stage.
  const bookX=-3.89, bookW=3.41;
  box(timber,bookX,2.01,rear+.04,bookW,4.0,.26);
  const bookBay=new T.Group();bookBay.position.set(bookX,0,rear+.20);scene.add(bookBay);
  for(let row=0;row<3;row++){
    const y=1.53+row*.83, u=.25+.05*row;
    interiorView(T,bookBay,'study',0,y,0,bookW-.22,.80,redraw,[u,.12,u+.47,.52]);
    box(oak,bookX,y-.40,rear+.28,bookW,.067,.35);
  }
  for(const x of [bookX-bookW/2,bookX+bookW/2])box(oak,x,2.0,rear+.30,.12,4.01,.42);
  box(oak,bookX,3.72,rear+.29,bookW,.19,.41);
  box(lamp,bookX,3.60,rear+.37,bookW-.19,.026,.072);
  box(oak,bookX,1.09,rear+.29,bookW,.12,.43);
  for(let i=0;i<5;i++)box(i%2?0xa67a56:0xae835e,bookX-bookW*.4+i*bookW*.2,.59,rear+.25,bookW*.19,.9,.26);
  const frameX=right-.09;
  for(let i=0;i<15;i++)box(timber,frameX,2.44,rear+.24+i*.17,.083,2.55,.068);
  box(oak,frameX,2.55,.6,.12,1.42,2.19);
  box(0xd9c8ad,frameX-.075,2.55,.6,.065,1.24,2.01);
  for(const [z,y,h] of [[.1,2.60,.61],[.62,2.56,.74],[1.1,2.63,.46]]){
    box(paper,frameX-.12,y,z,.027,h,.37,0,.04);
    box(brass,frameX-.14,y+h/2-.03,z,.036,.042,.08);
  }
  // Raised north lights fold toward the rear glazing, legible above the arch on approach.
  const eave=3.93,ridge=5.75,peak=left+width*.60;
  const skin=[],tri=[],tints=[];
  for(const [a,h1,b,h2] of [[left,eave,peak,ridge],[peak,ridge,right,eave]]){
    const n=skin.length/3;
    skin.push(a,h1,rear,b,h2,rear,b,h2,front,a,h1,front);
    for(const col of [0xb3d3da,0xf8e1b1,0xe6ddc2,0xa6cbd1]){
      const c=new T.Color(col);tints.push(c.r,c.g,c.b);
    }
    tri.push(n,n+1,n+2,n,n+2,n+3);
    for(const z of [rear,rear+1.94,rear+3.88,rear+5.82,front]){
      beam(a,h1,b,h2,z,.15,.17,timber);
      beam(a,h1-.09,b,h2-.09,z,.053,.19,slate);
    }
    for(let k=1;k<=3;k++)box(slate,a+(b-a)*k/3,h1+(h2-h1)*k/3,centerZ,.063,.072,depth);
  }
  const roof=new T.PlaneGeometry();roof.setAttribute('position',new T.BufferAttribute(new Float32Array(skin),3));
  roof.setAttribute('color',new T.BufferAttribute(new Float32Array(tints),3));roof.setIndex(tri);roof.deleteAttribute('normal');roof.deleteAttribute('uv');roof.computeBoundingSphere();
  scene.add(new T.Mesh(roof,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.33,depthWrite:false})));
  box(slate,peak,ridge,centerZ,.13,.12,depth+.18);
  for(const x of [left+.12,right-.12]){
    box(timber,x,eave-.13,centerZ,.18,.29,depth);
    box(lamp,x,eave-.28,centerZ,.08,.025,depth-.18);
  }
  // Lacquered arch, recessed reveal and inner brass edge give the opening a readable thickness.
  portal(study.x,front-.36,3.24,3.30,0x703429,.65);
  portal(study.x,front+.05,3.36,3.40,terra,.26);
  portal(study.x,front-.68,3.16,3.22,0xcf9165,.085);
  box(slate,study.x,3.75,front-.025,3.68,.49,.35);
  sign('공부방',study.x,3.76,front+.16,1.55,.29,'#fff0d7');
  const sx=studySeat.x, sz=studySeat.z, tableZ=sz-.83;
  box(oak,sx,.84,tableZ,2.20,.108,1.0);
  for(const dx of [-.90,.90])box(slate,sx+dx,.40,tableZ,.078,.8,.76);
  box(seam,sx,.40,tableZ-.36,1.82,.14,.09);
  // The open-sided chair allows the walker to approach from its right side.
  box(0x476569,sx,studySeat.cushionTop-.05,sz,.59,.10,.57);
  for(const dx of [-.235,.235])for(const dz of [-.19,.19])box(timber,sx+dx,.15,sz+dz,.047,.30,.048);
  for(const dx of [-.25,.25])box(timber,sx+dx,.53,sz+.28,.04,.43,.045);
  box(0x476569,sx,.72,sz+.28,.57,.20,.065);
  box(paper,sx-.18,.907,tableZ+.10,.50,.033,.33,0,-.12);
  box(terra,sx-.30,.932,tableZ+.12,.031,.014,.25,0,-.12);
  round(slate,sx-.75,.908,tableZ-.16,.14,.034,.14);
  box(brass,sx-.75,1.13,tableZ-.16,.035,.45,.035);
  round(0x668079,sx-.75,1.39,tableZ-.16,.205,.102,.205);
  round(lamp,sx-.75,1.335,tableZ-.16,.195,.012,.195);
  box(slate,sx+.68,1.03,tableZ+.13,.50,.23,.075);
  sign('내 자리',sx+.68,1.035,tableZ+.17,.43,.13,'#fff8e3');
  // Gallery and clerestory form one offset mass, shading the seating niche on the left.
  const wing=-8.24;
  box(wall,wing,1.90,sf-1.25,5.18,3.80,2.66);
  // The mezzanine sits over the foyer wall, leaving the study's roof open to the sky.
  const canopy=-8.22,span=5.32;
  box(wall,canopy,3.94,sf-1.32,span,.75,2.79);
  box(shadow,canopy,4.34,sf-1.27,span+.15,.095,2.80);
  box(oak,canopy,4.49,sf-1.57,span+.16,.18,3.0);
  box(timber,canopy,5.03,sf-2.72,span,1.04,.24);
  for(let k=0;k<5;k++){
    const x=canopy-span/2+.11+k*1.28;
    box(trim,x,5.06,sf-.44,.065,1.14,.11);
    if(k%2===0)box(lamp,x,5.40,sf-1.66,.68,.04,.13);
  }
  interiorView(T,scene,'study',canopy,5.035,sf-2.38,span,1.04,redraw);
  box(wall,canopy,5.72,sf-1.62,span+.24,.23,3.18);
  box(lamp,canopy,5.57,sf-.13,span,.046,.06);
  sign('MOONSHOT',wing,2.33,sf+.105,4.65,.83,'#fff3da',null,800);
  box(roomTrim.study,wing-2.38,2.34,sf+.10,.13,.55,.075,-.32);
  box(oak,wing,.55,sf+.40,3.52,.14,.68);
  for(const x of [wing-1.43,wing+1.43])box(shadow,x,.27,sf+.39,.14,.52,.48);
  plant(-10.55,sf+.68,.91);
  for(let k=0;k<4;k++)box(trim,wing-2.13+k*1.48,1.9,sf+.088,.012,3.75,.009);
  box(trim,wing,1.27,sf+.088,5.1,.012,.009);
  // The west stair and glazed landing give the two-storey wing a visible section.
  for(let k=0;k<17;k++){
    const h=(k+1)*.26,z=5.40-k*.46;
    box(trim,-12.19,h/2,z,2.50,h,.47);
    box(paper,-12.19,h+.012,z,2.52,.047,.47);
    box(brass,-12.19,h-.035,z+.236,2.50,.034,.026);
    if(k%4===0)for(const side of [-1,1])box(trim,-12.19+side*1.27,h+.45,z,.065,.90,.065);
  }
  for(const side of [-1,1]){
    const hand=new T.Mesh(new T.BoxGeometry(.076,.075,Math.hypot(7.36,4.16)),new T.MeshStandardMaterial({color:trim}));
    hand.rotation.x=Math.atan2(4.16,7.36);hand.position.set(-12.19+side*1.27,3.25,1.72);scene.add(hand);
  }
  box(oak,-11.44,4.45,-2.67,4.05,.19,1.35);

  // A deep work bay faces the reading pavilion across the open sightline to the stage.
  const ox=office.x, officeWidth=6.4, back=of-4.68;
  alcove(ox,of,officeWidth,4.83,3.82);
  interiorView(T,scene,'office',ox,2.08,back,officeWidth-.24,3.18,redraw);
  box(wall,ox,4.02,of-2.12,officeWidth+.46,.52,5.06);
  box(oak,ox,3.77,of-.10,officeWidth+.40,.08,1.10);
  box(lamp,ox,3.71,of+.31,officeWidth-.18,.035,.06);
  portal(ox,of-.38,3.54,3.38,0x30484e,.57);
  portal(ox,of+.12,3.68,3.48,0x51746f,.27);
  sign('내 AI 사무실',ox,4.02,of+.42,3.12,.40,'#fff1d7');
  // Sidelights share one material, with a clear opening through the middle.
  const glazing=new T.MeshBasicMaterial({color:0xaacbcc,transparent:true,opacity:.19,side:T.DoubleSide,depthWrite:false});
  const paneGeometry=new T.PlaneGeometry(1.14,3.03);
  for(const side of [-1,1]){
    const x=ox+side*2.55;
    const pane=new T.Mesh(paneGeometry,glazing);pane.position.set(x,1.88,of+.02);scene.add(pane);
    box(trim,x,.34,of,1.21,.58,.16);
    box(trim,x,1.47,of,1.21,.046,.08);
    box(trim,x+side*.57,1.86,of,.065,3.2,.12);
  }
  desk(ox+.11,of-2.38,3.18);
  for(const dx of [-.65,.69]){
    box(trim,ox+dx,1.03,of-2.37,.065,.35,.08);
    box(wall,ox+dx,1.39,of-2.40,1.27,.72,.096);
    box(0xa2c7c0,ox+dx,1.39,of-2.341,1.15,.59,.025);
    for(let row=0;row<3;row++)box(row===0?0x385763:0x6c9396,ox+dx-.17,1.54-row*.12,of-2.322,.62-row*.11,.029,.012);
  }
  for(let i=0;i<9;i++)box(timber,ox+2.88,1.96,back+.24+i*.35,.17,3.56,.085);
  plant(ox-2.35,of-1.15,.93);
  // Narrow seats and downlights sit outside the travelling line.
  for(const x of [-.90,1.31]){box(oak,x,.46,-2.90,1.92,.12,.59);for(const dx of [-.7,.7])box(trim,x+dx,.23,-2.90,.09,.43,.40);}
  build();
  // One matte backdrop is shared by the atrium and the study windows.
  const panorama=new Image();
  panorama.src='/campus/world/assets/study-lunar-horizon.webp';
  void panorama.decode().then(()=>{
    const map=new T.CanvasTexture(panorama);map.colorSpace=T.SRGBColorSpace;
    const view=new T.Mesh(new T.PlaneGeometry(115,38.33),new T.MeshBasicMaterial({map}));
    view.position.set(12,7,-37);scene.add(view);
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
    redraw();
  }).catch(()=>{}); // The horizon can arrive after the first walkable frame.
}
