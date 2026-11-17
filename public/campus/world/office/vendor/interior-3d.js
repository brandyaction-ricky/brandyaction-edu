import { getCampusInterior } from './interior-layout.js';

// Small, room-owned fixtures and props. Three's existing renderer supplies constructors.
export function buildCampusInterior(office,T){
  office.disposeCampusInterior?.();
  const {Group,Mesh,BoxGeometry,CylinderGeometry,SphereGeometry,ConeGeometry,RingGeometry,MeshStandardMaterial,MeshBasicMaterial,PointLight,CanvasTexture,DoubleSide,SRGBColorSpace}=T;
  const owned=new Set(),roots=[],actors=new Map(),lights=[];
  const reduceMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  const own=value=>(owned.add(value),value);
  const mat=(color,extra={})=>own(new MeshStandardMaterial({color,roughness:.78,...extra}));
  const colors={cream:0xe7dfc9,ink:0x294354,wood:0xb39371,leaf:0x658d6e,soft:0x9bafa2,blue:0x8bcff4};
  const mesh=(geometry,material,group,x=0,y=0,z=0)=>{const m=new Mesh(own(geometry),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;};
  const box=(g,w,h,d,color,x=0,y=h/2,z=0,extra={})=>mesh(new BoxGeometry(w,h,d),mat(color,extra),g,x,y,z);
  const cyl=(g,r1,r2,h,color,x=0,y=h/2,z=0,extra={})=>mesh(new CylinderGeometry(r1,r2,h,12),mat(color,extra),g,x,y,z);
  const sphere=(g,r,color,x=0,y=0,z=0,extra={})=>mesh(new SphereGeometry(r,12,8),mat(color,extra),g,x,y,z);
  const group=(parent,x=0,y=0,z=0)=>{const g=new Group();g.position.set(x,y,z);parent.add(g);return g;};
  function bulb(g,w,h,d,color,x,y,z){return box(g,w,h,d,color,x,y,z,{emissive:color,emissiveIntensity:.5,roughness:.35});}
  function practical(parent,roomId,kind,x,y,z,bulbs,color=0xffe1aa,distance=7,tone=null){
    const light=new PointLight(color,1,distance,2);light.position.set(x,y,z);light.castShadow=false;parent.add(light);
    lights.push({light,bulbs,kind,roomId,...(tone?{tone}:{})});return light;
  }
  function place(model,parent,w,d,h=null,x=0,y=0,z=0,rotation=0){
    return office.place(model,x-w/2,z-d/2,w,d,{group:parent,y0:y,h,rot:rotation});
  }
  function plant(g,item){
    const h=item.height||item.h||1.3,w=Math.min(item.w,item.d),stem=group(g);
    const model=place(item.variant==='small'?'plantSmall1':'pottedPlant',stem,w,w,h);
    let leaves;
    if(!model){
      cyl(stem,w*.29,w*.23,h*.26,0xb6b8a1,0,h*.13,0);
      cyl(stem,w*.25,w*.25,.025,0x4c4736,0,h*.27,0);
      cyl(stem,.025,.04,h*.48,0x61765b,0,h*.48,0);
      leaves=group(stem,0,h*.57,0);
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7,l=sphere(leaves,w*.24,[0x54876b,0x719d70,0x8ba977][i%3],Math.cos(a)*w*.16,(i%3)*h*.09,Math.sin(a)*w*.16);l.scale.set(1,.5,1.6);l.rotation.set(.35,a,.3);}
    }else leaves=model;
    const drops=Array.from({length:4},(_,i)=>sphere(g,.035,0x8bcff4,Math.sin(i*2)*w*.3,h+.2,Math.cos(i*2)*w*.3,{emissive:0x478aaf,emissiveIntensity:.2}));drops.forEach(m=>m.visible=false);
    return{moving:leaves||stem,drops,dropTop:h+.35};
  }
  function sofa(g,item){
    const w=item.w,d=item.d,h=item.height||.9;
    if(place('loungeSofa',g,w,d,h))return {};
    box(g,w,.26,d,colors.ink,0,.2,0);box(g,w-.16,.26,d-.12,colors.soft,0,.46,.02);
    box(g,w,.58,.20,colors.soft,0,.65,-d/2+.1);for(const sign of[-1,1])box(g,.18,.48,d,colors.soft,sign*(w/2-.09),.54,0);
    return{};
  }
  function coffee(g,item){
    const w=item.w,d=item.d,base=.85;
    box(g,w,base,d,colors.ink);box(g,w+.06,.08,d+.06,colors.wood,0,base+.04,0);
    for(const s of[-1,1])box(g,.035,.035,.08,0xc5c9c5,s*w*.25,.57,d/2+.015);
    const machine=place('kitchenCoffeeMachine',g,.6,.48,.58,-w*.16,base+.08,0);
    if(!machine){box(g,.45,.55,.42,0xcbd3ca,-w*.16,base+.35,0);box(g,.3,.2,.02,0x243e4c,-w*.16,base+.37,.22);}
    const mug=cyl(g,.09,.085,.15,0xf0e8d4,w*.25,base+.16,.12);cyl(g,.075,.075,.01,0x614834,w*.25,base+.24,.12);
    const steam=Array.from({length:4},(_,i)=>sphere(g,.06+i*.01,0xeaf2f4,w*.25,base+.35,.12,{transparent:true,opacity:.36,depthWrite:false}));steam.forEach(m=>m.visible=false);
    return{steam,mug,steamX:w*.25,steamBase:base+.28};
  }
  function coffeeTable(g,item){
    const h=item.height||.48;
    if(!place('tableCoffee',g,item.w,item.d,h)){
      box(g,item.w,.08,item.d,colors.wood,0,h,0);for(const x of[-1,1])for(const z of[-1,1])box(g,.06,h-.03,.06,colors.ink,x*(item.w/2-.13),h/2,z*(item.d/2-.13));
    }
    box(g,.35,.055,.24,0x8daab8,-item.w*.22,h+.07,0);box(g,.31,.045,.22,0xc9ba9d,-item.w*.20,h+.12,.02);
    cyl(g,.075,.065,.14,0xd6e4df,item.w*.2,h+.12,.02);return{};
  }
  function telescope(g,item){
    const moving=group(g,0,1.05,0);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,leg=cyl(g,.025,.035,1.08,colors.ink,Math.sin(a)*.17,.52,Math.cos(a)*.17);leg.rotation.z=Math.sin(a)*.32;leg.rotation.x=Math.cos(a)*.32;}
    const body=cyl(moving,.12,.15,.78,0xd6dcca,0,0,0);body.rotation.z=Math.PI/2;moving.rotation.set(.2,0,-.25);
    const lens=cyl(moving,.115,.115,.03,0x83d0ec,.405,0,0,{emissive:0x6dbbdf,emissiveIntensity:.25,metalness:.3});lens.rotation.z=Math.PI/2;
    const rim=cyl(moving,.16,.16,.09,colors.ink,.36,0,0);rim.rotation.z=Math.PI/2;
    return{moving,lens};
  }
  function rocket(g,item){
    cyl(g,.35,.42,.34,colors.ink,0,.17,0);const moving=group(g,0,.36,0);
    cyl(moving,.13,.15,.72,0xe5e9de,0,.39,0);mesh(new ConeGeometry(.13,.25,12),mat(0x8bcff4),moving,0,.87,0);
    for(let i=0;i<3;i++){const fin=box(moving,.08,.28,.25,0xa0bec7,0,.18,.15);fin.rotation.y=i*Math.PI*2/3;fin.position.x=Math.sin(fin.rotation.y)*.14;fin.position.z=Math.cos(fin.rotation.y)*.14;}
    sphere(moving,.065,0x2d617b,0,.57,.12,{emissive:0x326a86,emissiveIntensity:.4});
    const flame=mesh(new ConeGeometry(.09,.45,8),mat(0xf1bd6d,{emissive:0xffb94f,emissiveIntensity:1}),moving,0,-.15,0);flame.rotation.z=Math.PI;flame.visible=false;
    return{moving,baseY:.36,flame};
  }
  function arcade(g,item){
    const w=item.w,d=item.d;box(g,w,.7,d,0x284252,0,.35,0);box(g,w,.7,d*.55,0x385b6b,0,1.05,-d*.15);
    box(g,w*.9,.25,.10,0x90b8ca,0,1.55,-d*.15);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const texture=own(new CanvasTexture(canvas));texture.colorSpace=SRGBColorSpace;
    const screen=box(g,w*.73,.55,.025,0xffffff,0,1.13,d*.14,{map:texture,emissive:0xffffff,emissiveMap:texture,emissiveIntensity:.55,roughness:.4});
    const control=box(g,w*.95,.10,d*.5,0x1c3547,0,.78,d*.22);control.rotation.x=.15;
    for(const[x,color]of[[-.16,0x8bcff4],[.12,0xe8be85]])cyl(g,.045,.045,.04,color,x,.88,d*.30);
    const drawScreen=(phase=0)=>{const c=canvas.getContext('2d');c.fillStyle='#102838';c.fillRect(0,0,128,128);c.fillStyle='#c3e8f6';for(let i=0;i<15;i++)c.fillRect((i*37+11)%126,(i*53+phase*4)%112,2,2);c.fillStyle='#8bcff4';c.fillRect(58,50,12,34);c.fillRect(54,60,20,20);c.fillStyle='#d4edf6';c.fillRect(61,45,6,8);c.fillStyle='#dcaf73';c.fillRect(61,85,6,8+phase%5);texture.needsUpdate=true;};drawScreen();
    return{screen,drawScreen,lastScreen:-1};
  }
  function globe(g,item){
    cyl(g,.30,.32,.11,colors.ink,0,.055,0);cyl(g,.035,.045,.38,colors.wood,0,.27,0);
    const moving=group(g,0,.69,0);sphere(moving,.34,0x568aa1);
    for(let i=0;i<7;i++){const angle=i*2.399,patch=sphere(moving,.10,[0x86a58c,0x668b74,0xa2b29c][i%3],Math.cos(angle)*.24,Math.sin(i*1.4)*.17,Math.sin(angle)*.24);patch.scale.set(1.1,.6,.6);}
    const ring=mesh(new RingGeometry(.375,.395,40),mat(0xc6b27e,{side:DoubleSide}),g,0,.69,0);ring.rotation.x=.25;ring.rotation.y=.4;
    return{moving,spin:true};
  }
  function shelf(g,item){
    const h=item.height||1.25,w=item.w,d=item.d;box(g,w,h,d,0x647f87,0,h/2,0);
    for(let j=0;j<2;j++)for(let i=0;i<Math.floor(w/.2);i++)box(g,.12,.27,.12,[0xb9c5bb,0x8ab6c9,0xc8ae87,0x96a897][i%4],-w/2+.13+i*.2,.21+j*.48,d/2+.025);
    return{};
  }
  function lamp(g,item){
    cyl(g,.2,.22,.06,colors.ink);cyl(g,.025,.025,1.3,colors.ink,0,.68,0);
    const shade=cyl(g,.13,.28,.3,0xdad6bf,0,1.4,0);const lit=bulb(g,.19,.03,.19,0xffdfab,0,1.25,0);return{bulbs:[lit],shade};
  }
  const builders={plant,plantTall:plant,plantSmall:plant,sofa,rug(g,item){box(g,item.w,.012,item.d,0x486976,0,.014,0);box(g,item.w-.15,.006,item.d-.15,0x66858b,0,.023,0);return{};},coffee,'coffee-machine':coffee,'coffee-table':coffeeTable,table:coffeeTable,telescope,rocket,arcade,globe,shelf,bookcase:shelf,lamp,'floor-lamp':lamp,books(g,item){box(g,item.w,.09,item.d,0xb9aa8b,0,.05,0);box(g,item.w*.9,.06,item.d*.95,0x8fb4c1,.025,.13,0);return{};}};
  for(const[roomId,pod]of office.campusRoomGroups||[]){
    const root=group(pod);root.name='campus-interior-'+roomId;roots.push(root);
    for(const item of getCampusInterior(roomId)){
      const g=group(root,item.x+item.w/2,item.y0||0,item.y+item.d/2);g.rotation.y=(item.rotation||0);
      const builder=builders[item.type]||builders[item.kind];if(!builder)continue;
      const actor={id:item.id,roomId,type:item.type,kind:item.interactive||item.type,group:g,...builder(g,item),triggerAt:-Infinity};actors.set(item.id,actor);
    }
    // Desk bulbs remain physical objects in every mode. Light pools are shared per desk cluster.
    const deskBulbs=[],deskPoints=[];const desks=roomId==='office'?office.plan.desks:window.CampusPlan.getStudyDesks();
    for(const desk of desks){
      const w=roomId==='office'?1.4:2.8,x=desk.x+w-.22,z=desk.y+.18,y=.88;
      const g=group(root,x,y,z);box(g,.18,.04,.16,0x395565,0,.02,0);cyl(g,.012,.018,.32,0xb7bfae,0,.19,0);
      const shade=cyl(g,.09,.14,.13,0xc9cbb4,0,.37,0);const lit=bulb(g,.11,.02,.10,0xffd99b,0,.30,0);deskBulbs.push(lit);deskPoints.push({x,z,y:y+.3,bulb:lit});
      if(roomId==='study'){box(g,.17,.035,.22,0x8eb4c1,-.28,-.025,.15);cyl(g,.06,.055,.12,0xe0dfcd,-.4,.03,.28);}
    }
    const room=office.plan.campus.rooms.find(r=>r.id===roomId),cx=room.center.x,cz=room.center.y;
    if(roomId==='office'){
      // Keep the existing office arrangement while opening the study lounge.
      for(const[x,z]of [[cx-2.8,cz-1],[cx+2.8,cz+1]]){
        const fixture=group(root,x,3.05,z);box(fixture,2.05,.055,.25,0x476273,0,.06,0);const lit=bulb(fixture,1.88,.028,.18,0xd9edf4,0,.018,0);practical(root,roomId,'ceiling',x,2.75,z,[lit],0xe3f1f6,13);
      }
      [[23.3,14.5],[23.3,20],[31,17]].forEach(([x,z],index)=>practical(root,roomId,'task',x,1.28,z,deskBulbs.filter((_,i)=>i%3===index),0xffd99d,6));
      const strip=bulb(root,3.4,.035,.06,0xffdfaa,cx,2.7,room.bounds.minY+.18);
      practical(root,roomId,'accent',cx,2.4,room.bounds.minY+.8,[strip],0xffdfa8,7);
    }else{
      const outline=room.indoorOutline||room.outline,left=outline[5],back=outline[0],distance=Math.hypot(back[0]-left[0],back[1]-left[1]);
      const shortened=[left[0]+(back[0]-left[0])/distance*1.2,left[1]+(back[1]-left[1])/distance*1.2];
      // These lights are fixed to real window-frame posts, with no ceiling objects above the room.
      for(const[a,b,t]of [[shortened,back,.5],[outline[0],outline[1],.75]]){
        const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,dx=cx-x,dz=cz-z,n=Math.hypot(dx,dz),nx=dx/n,nz=dz/n;
        const fixture=group(root,x+nx*.09,2.36,z+nz*.09);fixture.name='study-wall-sconce';fixture.rotation.y=Math.atan2(nx,nz);
        box(fixture,.23,.38,.09,0x587b88,0,0,-.055);box(fixture,.19,.31,.055,0xc4d6cf,0,0,.012);
        const lit=bulb(fixture,.12,.23,.023,0xe4f1ff,0,0,.052);
        practical(root,roomId,'ceiling',x+nx*.23,2.35,z+nz*.23,[lit],0xe3f1f6,15);
      }
      // A real floor stand and three desk lamps supply task pools, within the existing light budget.
      const reading=actors.get('study-reading-light');
      if(reading?.bulbs)practical(root,roomId,'task',reading.group.position.x,1.27,reading.group.position.z,reading.bulbs,0xffd99d,6);
      for(const index of[0,1,3]){const p=deskPoints[index];if(p)practical(root,roomId,'task',p.x,p.y+.035,p.z,[p.bulb,...deskBulbs.filter((_,i)=>i===2&&index===3)],0xffd99d,7);}
      const terrace=room.terrace,terraceLamp=actors.get('study-terrace-lamp');
      if(terraceLamp?.bulbs)practical(root,roomId,'accent',terraceLamp.group.position.x,1.27,terraceLamp.group.position.z,terraceLamp.bulbs,0xffdfab,6,'warm');
      if(terrace?.bounds){
        const {maxX,maxY}=terrace.bounds,x=maxX-.12,z=maxY-.12;
        const fixture=group(root,x,0,z);fixture.name='study-terrace-bollard';
        box(fixture,.13,.59,.13,0x557980);box(fixture,.18,.045,.18,0xadc6c5,0,.62,0);
        const lit=bulb(fixture,.14,.10,.14,0xffdfab,0,.54,0);
        practical(root,roomId,'accent',x,.65,z,[lit],0xffdfab,5,'warm');
      }
    }
  }
  office.campusPracticalLights=lights;office.campusInteriorActors=actors;
  office.triggerInteriorEffect=id=>{const actor=actors.get(id);if(!actor)return false;actor.triggerAt=performance.now()/1000;return true;};
  office.updateCampusInterior=()=>{
    const time=performance.now()/1000,visible=office.visibleCampusRoom?.()||'office';
    for(const actor of actors.values()){
      if(actor.roomId!==visible)continue;
      const elapsed=time-actor.triggerAt,active=elapsed<5;
      if(!reduceMotion&&actor.spin&&actor.moving)actor.moving.rotation.y=time*.16+(active?elapsed*2:0);
      if(actor.type==='telescope'&&actor.moving)actor.moving.rotation.y=active&&!reduceMotion?Math.sin(elapsed*1.7)*.5:0;
      if(actor.flame){actor.flame.visible=active;actor.moving.position.y=actor.baseY+(active&&!reduceMotion?Math.sin(Math.PI*Math.min(1,elapsed/5))*2.7:0);if(active)actor.flame.scale.y=.8+Math.sin(time*16)*.2;}
      if(actor.drops){actor.drops.forEach((m,i)=>{m.visible=active;if(active)m.position.y=actor.dropTop-((elapsed*.8+i*.18)%1)*.6;});if(actor.moving)actor.moving.rotation.z=active?Math.sin(time*6)*.03:0;}
      if(actor.steam)actor.steam.forEach((m,i)=>{m.visible=active;if(active){const p=(elapsed*.6+i*.25)%1;m.position.set(actor.steamX+Math.sin(time+i)*.04,actor.steamBase+p*.6,.12);m.material.opacity=(1-p)*.3;m.scale.setScalar(.8+p);}});
      if(actor.drawScreen){const frame=(reduceMotion?(active?1:0):Math.floor(time*(active?8:1)));if(frame!==actor.lastScreen){actor.drawScreen(frame%6);actor.lastScreen=frame;}}
    }
  };
  office.disposeCampusInterior=()=>{
    for(const root of roots)root.removeFromParent();
    for(const resource of owned)resource.dispose?.();owned.clear();actors.clear();
    office.campusPracticalLights=[];office.campusInteriorActors=new Map();
  };
}
