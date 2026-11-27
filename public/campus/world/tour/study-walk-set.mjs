import {doors} from './lobby-paths.mjs';
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
  const floorReady=floorImage.decode().then(()=>{
    const paving=new T.CanvasTexture(floorImage);paving.colorSpace=T.SRGBColorSpace;
    const tile=new T.Mesh(new T.PlaneGeometry(30,47),new T.MeshBasicMaterial({map:paving}));
    tile.rotation.x=-Math.PI/2;tile.position.set(0,.008,11.5);scene.add(tile);
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
  // The study opens from the navy identity wall; the archive is a separate gallery beyond the stage.
  const study=doors.study,library=doors.library,office=doors.office;
  const sf=study.z-.7,lf=library.z-.7,of=office.z-.7;
  function alcove(x,z,w,d,h) {
    box(timber,x,h*.50,z-d,w,h,.14);
    box(oak,x,.055,z-d/2,w,.09,d);
    box(wall,x,h+.07,z-d/2,w+.30,.23,d+.30);
    for(const s of [-1,1])box(wall,x+s*w/2,h*.5,z-d/2,.19,h,d);
    box(lamp,x,h-.045,z-d*.43,w*.76,.045,.07);
  }
  alcove(study.x,sf,3.45,3.35,3.45);
  interiorView(T,scene,'study',study.x,1.80,sf-3.23,3.31,3.0,redraw);desk(study.x,sf-1.66,2.21);
  portal(study.x,sf+.11,3.28,3.30,roomTrim.study,.40);
  sign('공부방',study.x,3.80,sf+.19,2.18,.37,'#fff0d7');
  // Gallery and clerestory form one offset mass, shading the seating niche on the left.
  const wing=-8.24;
  box(wall,wing,1.90,sf-1.25,5.18,3.80,2.66);
  box(wall,-6.64,3.94,sf-1.32,8.41,.75,2.79);
  box(shadow,-6.65,4.34,sf-1.27,8.51,.095,2.80);
  box(oak,-6.93,4.49,sf-1.57,8.56,.18,3.0);
  box(timber,-6.93,5.03,sf-2.72,8.54,1.04,.24);
  for(let k=0;k<7;k++){
    const x=-10.57+k*1.22;
    box(k===1||k===4?paper:oak,x,4.98,sf-2.55,1.13,.92,.08);
    box(trim,x-.61,5.06,sf-.44,.065,1.14,.11);
    if(k%2===0)box(lamp,x,5.40,sf-1.66,.68,.04,.13);
  }
  interiorView(T,scene,'study',-6.95,5.035,sf-2.38,8.51,1.04,redraw);
  box(wall,-6.95,5.72,sf-1.62,8.88,.23,3.18);
  box(lamp,-6.94,5.57,sf-.13,8.70,.046,.06);
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

  // The archive reads as an oak reading gallery with visible books, clear of the study wing.
  alcove(library.x,lf,4.15,3.05,3.40);
  interiorView(T,scene,'library',library.x,1.78,lf-2.92,3.99,3.02,redraw);
  shelves(library.x-1.38,.19,lf-1.73,.80,1.73,1);
  portal(library.x,lf+.08,3.94,3.25,roomTrim.library,.31);
  box(wall,library.x,3.75,lf-.95,4.63,.68,2.58);
  sign('자료실',library.x,3.73,lf+.36,2.28,.44,'#fff1d7');
  box(lamp,library.x,3.42,lf+.28,4.06,.040,.08);
  for(const side of [-1,1])for(let k=0;k<4;k++)box(oak,library.x+side*(1.86-k*.105),1.45,lf-.24,.050,2.84,.13);

  // A glazed office wing takes the near right edge. Its long side gives the hall a third axis.
  alcove(office.x,of,3.72,3.84,3.38);
  interiorView(T,scene,'office',office.x,1.76,of-3.72,3.57,3.13,redraw);
  desk(office.x,of-1.9,2.72);
  box(trim,office.x,1.17,of-1.95,1.27,.65,.12);
  box(0xacc8c8,office.x,1.18,of-1.875,1.13,.50,.025);
  portal(office.x,of+.10,3.54,3.23,roomTrim.office,.32);
  box(wall,office.x,3.76,of-1.42,4.17,.65,3.36);
  sign('내 AI 사무실',office.x,3.76,of+.29,3.36,.43,'#fff1d7');
  box(lamp,office.x,3.44,of+.19,3.73,.043,.09);
  plant(office.x+1.48,of-.64,.76);
  for(let i=0;i<7;i++)box(timber,office.x+2.17+i*.17,1.55,of-.07,.085,3.12,.23);
  // Narrow seats and downlights sit outside the travelling line.
  for(const x of [-1.88,.33]){box(oak,x,.46,-2.90,1.92,.12,.59);for(const dx of [-.7,.7])box(trim,x+dx,.23,-2.90,.09,.43,.40);}
  build();
  // One matte backdrop is shared by the atrium and the study windows.
  const panorama=new Image();
  panorama.src='/campus/world/assets/study-lunar-horizon.webp';
  const backdropReady=panorama.decode().then(()=>{
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
  });
  return Promise.all([floorReady,backdropReady]);
}
