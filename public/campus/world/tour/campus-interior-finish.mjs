// Shared joinery on both sides of a campus doorway. Static parts are submitted by material family.
const finish = {
  wall:0x263347, trim:0x384859, timber:0xab7952, oak:0xd3a777, paper:0xe7dac7,
  brass:0xc79860, lamp:0xffe4b6, shadow:0x1a2230, leaf:0x4b654c,
};
export const roomTrim = {study:0xc2482e, library:0xb88c52, office:0x476b7c};
let sceneryImage;
function interiorView(T,parent,id,x,y,z,width,height,redraw,crop) {
  if(!sceneryImage){
    const img=new Image();img.src='/campus/world/assets/lunar-interiors.webp';
    sceneryImage=img.decode().then(()=>{const tex=new T.CanvasTexture(img);tex.colorSpace=T.SRGBColorSpace;return tex;});
  }
  const row={study:0,library:1,office:2}[id];
  return sceneryImage.then(map=>{
    const geometry=new T.PlaneGeometry(width,height),uv=geometry.attributes.uv;
    const ratio=(map.image.width/(map.image.height/3))/(width/height);
    const uSpan=Math.min(1,1/ratio),vSpan=Math.min(1,ratio)*(.33333-.006);
    for(let i=0;i<uv.count;i++){
      const u=uv.getX(i),v=uv.getY(i);
      if(crop){const [left,top,right,bottom]=crop;uv.setXY(i,left+u*(right-left),1-(row+bottom-v*(bottom-top))/3);}
      else uv.setXY(i,.5+(u-.5)*uSpan,1-(row+.5)/3+(v-.5)*vSpan);
    }
    const image=new T.Mesh(geometry,new T.MeshBasicMaterial({map}));
    image.position.set(x,y,z);parent.add(image);redraw?.();
  }).catch(()=>{}); // The furnished geometry is usable before, or without, its scenic glazing.
}
export {interiorView};
export function joinery(T,parent) {
  const cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(1,1,1,20);
  const temp=new T.Object3D(), color=new T.Color(), batches=new Map();
  function piece(geometry,tone,x,y,z,w,h,d,rz=0,ry=0) {
    let parts=batches.get(geometry);
    if(!parts){parts=[];batches.set(geometry,parts);}
    temp.position.set(x,y,z);temp.scale.set(w,h,d);temp.rotation.set(0,ry,rz,'YXZ');temp.updateMatrix();
    parts.push([temp.matrix.clone(),tone]);
  }
  const box=(...args)=>piece(cube,...args);
  const round=(...args)=>piece(cylinder,...args);
  function beam(x1,y1,x2,y2,z,w,d,tone) {
    box(tone,(x1+x2)/2,(y1+y2)/2,z,w,Math.hypot(x2-x1,y2-y1)+.014,d,-Math.atan2(x2-x1,y2-y1));
  }
  function portal(x,z,width,height,tone,depth=.46) {
    const r=.42,t=.24,side=width/2,cap=height-r;
    for(const s of [-1,1]){
      box(tone,x+s*side,cap/2,z,t,cap,depth);
      for(let i=0;i<8;i++){
        const pt=j=>{const a=j*Math.PI/16;return [x+s*(side-r+r*Math.cos(a)),cap+r*Math.sin(a)];};
        beam(...pt(i),...pt(i+1),z,t,depth,tone);
      }
    }
    box(tone,x,height,z,width-2*r+.02,t,depth);
  }
  function shelves(x,y,z,w,h,bays=3) {
    box(finish.timber,x,y+h/2,z-.17,w,h,.15);
    for(let b=0;b<=bays;b++)box(finish.oak,x-w/2+b*w/bays,y+h/2,z,.055,h,.34);
    const colors=[finish.paper,finish.trim,0xc88967,0x778c82,0x725a4f];
    for(let r=0;r<3;r++){
      const base=y+r*h/3;
      box(finish.oak,x,base,z+.02,w,.055,.4);
      for(let b=0;b<bays;b++)for(let k=0;k<4;k++){
        const bw=w/bays*.115,bh=h*(.15+.028*((r+b+k)%4));
        box(colors[(2*r+b+k)%colors.length],x-w/2+w/bays*(b+.16+k*.15),base+bh/2+.035,z+.01,bw,bh,.19,k===3?-.12:0);
      }
    }
    box(finish.oak,x,y+h,z,w,.065,.37);
  }
  function desk(x,z,width=2.45) {
    box(finish.oak,x,.79,z,width,.105,.85);
    for(const dx of [-1,1])box(finish.trim,x+dx*width*.40,.39,z,.11,.77,.63);
    box(finish.wall,x,.47,z+.56,.56,.13,.56);
    box(finish.trim,x,.71,z+.78,.56,.5,.10);
    for(const dx of [-.19,.19])box(finish.trim,x+dx,.23,z+.62,.062,.43,.36);
  }
  function plant(x,z,size=1) {
    round(finish.paper,x,.31*size,z,.34*size,.62*size,.34*size);
    for(let i=0;i<7;i++){
      const a=i*2.40,h=(.75+(i%3)*.13)*size;
      box(finish.leaf,x+Math.cos(a)*.15*size,.61*size+h*.43,z+Math.sin(a)*.15*size,.14*size,h,.075*size,(i%2?.4:-.42),a);
    }
  }
  function build() {
    // A common falloff on the panel faces softens the contact at the joinery edges.
    const grain=document.createElement('canvas');grain.width=grain.height=128;
    const g=grain.getContext('2d');const wash=g.createLinearGradient(0,0,23,128);
    wash.addColorStop(0,'#fffdf7');wash.addColorStop(.74,'#f2f3f2');wash.addColorStop(1,'#d0cdcc');
    g.fillStyle=wash;g.fillRect(0,0,128,128);
    for(let i=0;i<450;i++){g.fillStyle=i%2?'#44323809':'#fffbf111';g.fillRect(i*83%127,i*51%127,1,i%8+1);}
    const map=new T.CanvasTexture(grain);map.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshStandardMaterial({color:0xffffff,map,roughness:.74,metalness:.025});
    for(const [geometry,parts] of batches){
      const m=new T.InstancedMesh(geometry,material,parts.length);
      parts.forEach(([matrix,tone],i)=>{m.setMatrixAt(i,matrix);m.setColorAt(i,color.setHex(tone));});
      parent.add(m);
    }
  }
  return {box,round,beam,portal,shelves,desk,plant,build};
}
export {finish};

// Far-wall fixtures face the incoming student. Keep the original seats, aisle and activity anchors.
export function finishCampusRoom(T,group,id,redraw) {
  if(!group||!roomTrim[id])return;
  const a=joinery(T,group), f=finish;
  function windows(x,front,back,height,spacing) {
    const length=back-front,mid=(front+back)/2;
    a.box(f.timber,x,.24,mid,.24,.48,length);
    a.box(f.paper,x,height,mid,.30,.15,length);
    a.box(f.trim,x,height*.64,mid,.085,.074,length);
    for(let z=front;z<=back;z+=spacing)a.box(f.trim,x,height/2,z,.14,height,.12);
  }
  if(id==='study'){
    for(const x of [-4.9,12.9])windows(x,3.85,18.1,4.45,2.85);
    for(const z of [3.85,8.12,12.4]){
      a.box(f.timber,4.0,4.58,z,17.85,.22,.25);
      a.box(f.lamp,4.0,4.46,z,6.25,.027,.085);
    }
    a.box(f.wall,4.1,2.48,.55,10.9,4.9,.17);
    a.box(f.oak,4.1,.33,.67,10.9,.60,.10);
    interiorView(T,group,'study',5.75,2.50,.68,5.9,2.72,redraw);
    a.box(f.oak,5.75,1.11,.77,6.04,.095,.28);
    a.portal(1.45,.94,2.75,3.39,roomTrim.study,.25);
    for(const x of [-.80,9.05])a.box(f.lamp,x,2.8,.72,.065,2.25,.085);
  }else if(id==='library'){
    for(const x of [-11.85,11.8])windows(x,-2.9,22.1,4.84,5);
    for(const z of [-2.9,2.1,7.1,12.1]){
      a.box(f.timber,0,4.87,z,23.7,.22,.26);
      a.box(f.lamp,0,4.75,z,8.25,.028,.095);
    }
    interiorView(T,group,'library',3.4,2.39,-2.64,11.65,3.62,redraw);
    a.shelves(-8.15,.53,-2.52,6,3.2,5);
    a.box(f.brass,-.15,4.43,-2.75,23.4,.07,.15);
    for(const x of [-10.6,-.45,10.6])a.box(f.lamp,x,2.65,-2.56,.085,2.5,.10);
    a.portal(-5.95,6.68,4.5,3.15,roomTrim.library,.25);
  }else{
    // Retain the working central office monitor and every desk's line of sight.
    interiorView(T,group,'office',23.82,2.02,9.72,1.92,1.94,redraw);
    for(const x of [22.77,24.87]){
      a.box(roomTrim.office,x,2.02,9.74,.10,2.12,.15);
      a.box(f.lamp,x,3.11,9.76,.13,.055,.19);
    }
    a.box(f.oak,23.82,1.02,9.79,2.14,.095,.24);
  }
  a.build();
}
