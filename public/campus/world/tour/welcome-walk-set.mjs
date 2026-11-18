/** Six offices line one corridor, ending at the entrance to a separate live hall. */
const TITLES = ['팀장 봇', '조사 직원', '기획 · 제작 직원', '고객 응대 직원', '회사 기준', '내 AI 체험', '라이브 홀'];
const PALETTE = {
  navy: 0x213951, deep: 0x142d45, steel: 0x678298, frost: 0xdfeaf0,
  pearl: 0xf0f2ee, floor: 0xc5d9e5, edge: 0x92abba, ink: 0x334950,
  wood: 0xc8a176, blue: 0x456c9e, sand: 0xdfc8a6, green: 0x638879, red: 0xb93846,
};
const CHARACTERS = ['male-a','female-d','male-b','female-f',null,'male-e'];
const KENNEY = '/campus/world/office/vendor/assets/kenney/';

export function buildWelcomeWalkSet(THREE, scene, {loader} = {}) {
  const root = new THREE.Group();
  root.name = 'Moonshot campus walkway';
  scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 20);
  const orb = new THREE.SphereGeometry(.5, 12, 10);
  const plane = new THREE.PlaneGeometry(1, 1);
  const materials = new Map(), textures = new Set(), models = new Set(), batches = new Map();
  const scratch = new THREE.Object3D();
  const {navy, deep, steel, frost, pearl, floor, edge, ink, wood, blue, sand, green, red} = PALETTE;
  const indicators = [];
  let disposed = false;

  function material(color, kind = 'matte') {
    const key = color + ':' + kind;
    if (!materials.has(key)) {
      const result = kind === 'light' ? new THREE.MeshBasicMaterial({color})
        : new THREE.MeshStandardMaterial({
          color, roughness: kind === 'metal' ? .48 : .82, metalness: kind === 'metal' ? .35 : 0,
          ...(kind === 'glass' ? {transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide} : {}),
        });
      materials.set(key, result);
    }
    return materials.get(key);
  }

  // Batch the repeating parts by bay. Ray hits still identify the correct desk.
  function shape(group, geometry, x, y, z, width, height, depth, color, kind, turn = 0) {
    const mat = material(color, kind);
    const key = group.uuid + geometry.uuid + mat.uuid;
    let batch = batches.get(key);
    if (!batch) {
      batch = {group, geometry, mat, matrices: []};
      batches.set(key, batch);
    }
    scratch.position.set(x, y, z);
    scratch.rotation.set(0, turn, 0);
    scratch.scale.set(width, height, depth);
    scratch.updateMatrix();
    batch.matrices.push(scratch.matrix.clone());
  }
  const box = (g,x,y,z,w,h,d,c,k,r) => shape(g,cube,x,y,z,w,h,d,c,k,r);
  const round = (g,x,y,z,w,h,d,c,k) => shape(g,cylinder,x,y,z,w,h,d,c,k);
  const ball = (g,x,y,z,w,h,d,c) => shape(g,orb,x,y,z,w,h,d,c);
  const groupAt = (g,x,y,z) => {
    const group = new THREE.Group();
    group.position.set(x,y,z);
    group.userData.welcomeStation = g.userData.welcomeStation;
    g.add(group);
    return group;
  };

  function label(g, text, x, y, z, width, height, background, foreground) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = Math.round(canvas.width * height / width);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = foreground;
    ctx.font = '650 ' + Math.floor(canvas.height * .53) + 'px Pretendard, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 40);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({map: texture, toneMapped: false});
    materials.set('text:' + mat.uuid, mat);
    const sign = new THREE.Mesh(plane, mat);
    sign.position.set(x,y,z);
    sign.scale.set(width,height,1);
    sign.userData.welcomeStation = g.userData.welcomeStation;
    g.add(sign);
  }

  // Place existing campus assets without delaying movement while a model downloads.
  // The synchronous furniture/actor remains usable if WebGL model decoding fails.
  function asset(g, path, x, y, z, height, rotation, fallback, animation) {
    if (!loader) return;
    loader.loadAsync(KENNEY + path + '.glb').then(gltf => {
      const model = gltf.scene;
      if (disposed) { releaseModel(model); return; }
      models.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      const originalHeight = bounds.max.y - bounds.min.y;
      if (!Number.isFinite(originalHeight) || originalHeight < .001) return;
      const scale = height / originalHeight;
      const rig = groupAt(g,x,y,z);
      rig.rotation.y = rotation;
      model.scale.multiplyScalar(scale);
      model.position.set(-(bounds.min.x + bounds.max.x)*scale/2, -bounds.min.y*scale, -(bounds.min.z + bounds.max.z)*scale/2);
      rig.add(model);
      if (animation) {
        const clip = gltf.animations?.find(item => item.name === animation);
        if (clip) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(clip).play();
          mixer.setTime(clip.duration * .8);
        }
      }
      model.traverse(item => { item.userData.welcomeStation = g.userData.welcomeStation; });
      if (fallback) fallback.visible = false;
    }).catch(() => { /* Keep the visible fallback. */ });
  }

  function plant(g, x, z, size = 1) {
    round(g, x, .24*size, z, .69*size, .48*size, .69*size, pearl);
    round(g, x, .48*size, z, .57*size, .035*size, .57*size, ink);
    for (const [dx,dy,dz,w,h] of [[0,1.05,0,.35,1.14],[.17,.86,.02,.34,.8],[-.19,.8,.08,.32,.71],[.03,.76,-.18,.3,.6]]) {
      ball(g,x+dx*size,dy*size,z+dz*size,w*size,h*size,w*size,dy>.9?0x527b69:0x769b80);
    }
  }
  function screen(g,x,y,z,width,style='document') {
    const h = width * .57;
    box(g,x,y,z,width+.12,h+.12,.1,deep,'metal');
    box(g,x,y,z+.06,width,h,.025,style==='dark'?0x15384f:0xd9e5e8);
    const colors = style==='dark' ? [0x91cadb,0x70a1c2] : [blue,steel];
    for (let i=0;i<3;i++) {
      const w=width*[.55,.75,.4][i];
      box(g,x-width*.38+w*.5,y+h*.20-i*h*.19,z+.08,w,h*.075,.012,colors[i?1:0],'light');
    }
  }
  function chair(g,x,z) {
    round(g,x,.08,z,.87,.08,.87,steel,'metal');
    round(g,x,.39,z,.13,.65,.13,steel,'metal');
    box(g,x,.74,z,1.27,.14,.94,blue);
    box(g,x,1.15,z-.41,1.25,.85,.15,navy);
    for (const dx of [-.62,.62]) {
      box(g,x+dx,.87,z,.07,.3,.11,steel,'metal');
      box(g,x+dx,1.03,z,.13,.09,.51,blue);
    }
  }
  function person(g,x,z,seated=false) {
    const f = groupAt(g,x,0,z);
    const hip=seated ? .7:.92;
    ball(f,0,hip+.31,0,.61,.70,.42,seated?blue:navy);
    ball(f,0,hip+.89,0,.45,.49,.42,0xe7b995);
    ball(f,0,hip+1.04,-.025,.47,.25,.45,0x453e37);
    for(const sign of [-1,1]) {
      const dx=sign*.155;
      if(seated) box(f,dx,.71,.18,.23,.2,.49,navy);
      box(f,dx,seated ? .38:.49,seated ? .35:0,.22,seated ? .57:.9,.2,navy);
      box(f,dx,.1,seated ? .4:.07,.23,.15,.34,deep);
      ball(f,sign*.30,hip+.28,.08,.17,.5,.20,seated?blue:navy);
    }
    asset(g,'characters/character-'+CHARACTERS[g.userData.welcomeStation],x,seated ? .72 : 0,z,2.01,.08,f,seated?'sit':'idle');
  }
  function desk(g,x,z,width=2.8) {
    box(g,x,.96,z,width,.14,1.15,wood);
    box(g,x,.7,z+.49,width-.18,.39,.10,frost);
    for (const dx of [-width*.39,width*.39]) box(g,x+dx,.47,z,.12,.91,.97,navy,'metal');
  }
  function desktop(g,x,z) {
    box(g,x,1.06,z,.48,.06,.3,steel,'metal');
    box(g,x,1.27,z,.09,.42,.10,steel,'metal');
    screen(g,x,1.64,z,1.24);
    box(g,x,1.05,z+.32,.68,.035,.20,navy);
  }
  function shelf(g,x,z) {
    const f = groupAt(g,x,0,z);
    box(f,0,1.0,0,2.22,2.0,.12,navy);
    for(const dx of [-1.1,1.1]) box(f,dx,1.05,.17,.09,2.1,.57,wood);
    for(const y of [.13,.76,1.39,2.03]) box(f,0,y,.17,2.28,.09,.6,wood);
    const spines=[blue,pearl,green,sand,red,navy];
    for(let row=0;row<3;row++) for(let i=0;i<8-row;i++){
      const h=.30+((i+row)%3)*.07;
      box(f,-.89+i*.235,.20+row*.63+h/2,.23,.16,h,.38,spines[(i+row)%spines.length]);
    }
  }

  const stations = TITLES.map((title,index) => ({x: index*8, z: 0, title}));
  // An open near edge leaves the path and avatar legible at a small screen width.
  box(root,19.75,-.37,-1.9,50,.66,10.4,navy);
  box(root,19.75,-.045,.70,50,.085,5.2,floor);
  box(root,19.75,-.047,-4.50,50,.08,5.2,0xdee7e8);
  box(root,19.75,-.013,3.24,50,.025,.09,steel);
  box(root,19.75,-.013,-1.71,50,.023,.13,edge);
  box(root,19.75,-.33,3.31,50,.045,.045,0xa7c4d7);
  for(let x=-4;x<=44;x+=2) box(root,x,-.001,.77,.022,.009,4.96,0xb0c7d6);
  // The entrance has its own short vestibule, visible before the visitor takes a step.
  box(root,-6.9,-.37,-1.90,3.35,.66,10.4,navy);
  box(root,-6.9,-.045,.70,3.35,.085,5.2,floor);
  box(root,-6.9,-.047,-4.50,3.35,.08,5.2,0xdee7e8);
  box(root,-6.30,1.74,-6.61,4.60,3.48,.18,frost);
  box(root,-6.30,3.46,-6.43,4.60,.21,.61,navy,'metal');
  box(root,-8.52,1.72,-4.83,.21,3.45,3.61,frost);
  for(let i=0;i<9;i++) box(root,-8.05+i*.16,1.58,-6.44,.08,2.77,.11,wood);
  box(root,-5.68,2.14,-6.44,2.2,.55,.09,deep);
  label(root,'문샷 캠퍼스',-5.68,2.14,-6.37,2.16,.49,'#263f56','#ffffff');
  plant(root,-7.10,-3.72,1.23);
  // Glass doors identify the arrival end of the hall.
  box(root,-3.8,1.48,-3.97,2.18,3.0,.24,navy,'metal');
  for(const x of [-4.27,-3.33]) {
    box(root,x,1.4,-3.81,.82,2.63,.06,0x98b8c9,'metal');
    box(root,x,1.9,-3.77,.71,1.45,.025,0xb6d4dc);
    box(root,x+(x < -4 ? .28:-.28),1.16,-3.72,.045,.40,.07,steel,'metal');
  }

  for(let index=0;index<TITLES.length;index++){
    const g=groupAt(root,stations[index].x,0,0);
    g.userData.welcomeStation=index;
    // Shared glazing and blade signs mark the six offices. The hall beyond the
    // threshold has a deeper auditorium floor and its own stage backdrop.
    const hall = index === TITLES.length - 1;
    const back = hall ? -8.45 : -6.62;
    const width = hall ? 9.75 : 7.98;
    box(g,0,1.78,back,width,3.56,.18,hall ? navy : frost);
    box(g,0,3.46,back+.19,width,.21,.61,navy,'metal');
    box(g,0,.14,back+.18,width-.10,.25,.22,edge);
    box(g,0,3.31,back+.43,width-.95,.045,.09,0xffdfa9,'light');
    if (!hall) {
      // A felt panel, skirting and a small working rug give the bays depth on mobile.
      box(g,-2.76,1.55,back+.14,1.03,2.73,.06,0xb6c9cd);
      for (const dx of [-.36,-.12,.12,.36]) box(g,-2.76+dx,1.55,back+.18,.027,2.69,.02,0x9bb4b9);
      box(g,.10,.003,-3.93,5.16,.012,2.55,0xc6d4d3);
      box(g,-3.52,1.2,-4.85,.055,2.36,2.9,0x97bbcb,'glass');
      for (const z of [-6.25,-3.43]) box(g,-3.52,1.18,z,.08,2.34,.08,steel,'metal');
      box(g,-3.52,2.34,-4.83,.09,.075,2.91,steel,'metal');
      box(g,-3.52,.45,-4.83,.08,.045,2.91,pearl);
    }
    box(g,0,2.78,back+.18,4.8,.71,.15,navy);
    label(g,TITLES[index],0,2.78,back+.27,4.74,.66,'#263f56','#ffffff');
    const cue = new THREE.Mesh(cube,material(red,'light'));
    cue.position.set(0,.019,-1.47);
    cue.scale.set(3.38,.035,.14);
    cue.visible=false;
    cue.userData.welcomeStation=index;
    g.add(cue); indicators.push(cue);

    if(index===0){
      const f=groupAt(g,.76,0,-3.37);
      f.rotation.y=-.08;
      box(f,0,.6,0,3.06,1.18,.85,navy);
      box(f,0,1.23,0,3.21,.13,1.05,wood);
      for(let i=0;i<10;i++) box(f,-1.28+i*.28,.57,.44,.038,.87,.025,steel);
      person(g,-1.43,-3.49);
      box(g,1.3,1.4,-3.27,.47,.29,.07,deep);
      plant(g,2.57,-4.2,.87);
    }else if(index===1){
      // Place the screen to the side so the seated employee is visible from the walkway.
      chair(g,-1.03,-3.71);
      person(g,-1.03,-3.71,true);
      desk(g,.52,-3.08,2.53);
      desktop(g,.87,-3.11);
      // Research samples and a chart occupy the analyst's end of the desk.
      for(let i=0;i<3;i++) box(g,-.15,1.045+i*.017,-3.02,.49,.014,.45,[sand,pearl,frost][i],null,i*.07);
      box(g,-1.89,1.61,-6.38,1.40,1.05,.07,pearl);
      for (let i=0;i<4;i++) {
        const h=[.21,.4,.31,.61][i];
        box(g,-2.33+i*.28,1.24+h/2,-6.33,.17,h,.024,[steel,blue,green,red][i]);
      }
      plant(g,2.12,-4.48,.76);
    }else if(index===2){
      desk(g,.60,-3.22,3.2);
      for(const x of [-.17,1.36]) {
        box(g,x,1.28,-3.42,.11,.5,.11,steel,'metal');
        screen(g,x,1.82,-3.42,1.37,x>0?'dark':'document');
      }
      chair(g,-1.35,-4.03);
      person(g,-1.35,-4.03,true);
      // Mounted colour samples make this the production studio.
      for(let i=0;i<4;i++) box(g,-2.20+i*.4,1.54,-6.46,.34,.53,.035,[sand,red,green,blue][i]);
      round(g,1.4,1.1,-2.93,.25,.12,.25,red);
    }else if(index===3){
      // A service counter with a chat display, a seated rep and desk phone.
      desk(g,.75,-3.19,3.15);
      chair(g,-1.12,-3.90);
      person(g,-1.12,-3.90,true);
      desktop(g,.73,-3.20);
      box(g,-.40,1.08,-2.99,.47,.09,.32,deep);
      box(g,-.40,1.17,-3.05,.52,.10,.12,blue);
      box(g,1.54,1.86,-6.40,2.14,1.09,.065,navy);
      for(const [x,y,w,c] of [[1.36,2.06,1.1,frost],[1.72,1.74,.93,0x85bdcd]]) {
        box(g,x,y,-6.34,w,.18,.025,c,'light');
      }
      plant(g,-2.40,-4.8,.72);
    }else if(index===4){
      shelf(g,-1.42,-5.46);
      shelf(g,1.10,-5.46);
      box(g,-.22,.68,-3.07,2.42,.12,.82,wood);
      for(const x of [-1.14,.70]) box(g,x,.33,-3.07,.12,.65,.67,steel,'metal');
      // Open source binder and upright original-materials sign on the reading table.
      box(g,-.49,.77,-3.02,.91,.055,.52,blue,'matte',-.06);
      for (const x of [-.71,-.28]) box(g,x,.808,-3.01,.42,.018,.48,pearl);
      for (let row=0;row<3;row++) box(g,-.69,.822,-3.12+row*.072,.25,.012,.017,steel);
      box(g,.55,.98,-3.17,.84,.53,.06,navy);
      label(g,'원본 자료',.55,.98,-3.129,.78,.45,'#263f56','#ffffff');
    }else if(index===5){
      // An accessible one-person workstation with an advisor and visitor chair.
      box(g,0,1.59,-5.38,3.63,1.83,.16,deep);
      box(g,0,1.59,-5.28,3.46,1.65,.035,blue);
      // Screen graphic for choosing one's own AI work trial.
      for(const [x,scale] of [[-.72,1],[.18,.68],[.85,.68]]) {
        ball(g,x,1.78,-5.22,.43*scale,.47*scale,.07,sand);
        ball(g,x,1.26,-5.22,.83*scale,.58*scale,.07,pearl);
      }
      desk(g,-.28,-3.12,2.48);
      desktop(g,-.45,-3.20);
      chair(g,-.80,-2.17);
      person(g,1.50,-3.79);
      plant(g,2.61,-4.76,.96);
    }else{
      box(g,.80,-.36,-2.59,10.6,.65,11.70,deep);
      box(g,.80,-.041,-2.61,10.6,.08,11.75,0x8298ad);
      // Passage at 44 m: leave the opening and the near sightline clear.
      for(const z of [-1.48,1.61]){
        box(g,-4.13,1.56,z,.22,3.14,.20,navy,'metal');
        box(g,-4.01,1.56,z,.035,2.88,.061,0xffdaa1,'light');
      }
      box(g,-4.13,3.16,.07,.25,.18,3.30,navy,'metal');
      box(g,-4.13,1.46,-5.08,.12,2.92,6.8,0x849db1,'glass');
      for(const dx of [-3.6,3.5]) {
        for(let i=0;i<4;i++) box(g,dx+i*.12,1.86,-7.93,.085,3.21,.18,[navy,blue,steel,navy][i]);
      }
      box(g,.13,.21,-4.23,6.2,.4,3.33,navy);
      box(g,.13,.43,-4.23,6.22,.055,3.36,wood);
      box(g,.13,.11,-2.22,3.7,.20,.71,edge);
      box(g,.4,1.55,-5.83,3.9,1.6,.11,deep);
      label(g,'MOONSHOT LIVE',.4,1.55,-5.75,3.77,1.47,'#172f46','#f4e6c5');
      for(const dx of [-2.4,2.6]) {
        box(g,dx,1.0,-4.78,.49,1.1,.5,deep);
        for(const y of [.77,1.17]) ball(g,dx,y,-4.5,.30,.30,.08,steel);
      }
      round(g,-1.66,1.03,-3.73,.13,1.14,.13,steel);
      box(g,-1.66,1.65,-3.73,.83,.11,.56,pearl);
    }
  }

  for(const {group,geometry,mat,matrices} of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,mat,matrices.length);
    matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
    mesh.userData.welcomeStation=group.userData.welcomeStation;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  batches.clear();

  function releaseModel(model) {
    const resources=new Set();
    model.traverse(node=>{
      if (node.geometry) resources.add(node.geometry);
      for(const mat of Array.isArray(node.material)?node.material:[node.material]) {
        if(!mat) continue;
        resources.add(mat);
        for(const val of Object.values(mat)) if(val?.isTexture) resources.add(val);
      }
    });
    for(const resource of resources) resource.dispose?.();
  }
  return {
    stations,
    setNext(index) { indicators.forEach((cue,i)=>{cue.visible=i===index;}); },
    dispose() {
      if(disposed) return;
      disposed=true;
      root.removeFromParent();
      root.traverse(node=>{ if(node.isInstancedMesh) node.dispose(); });
      for(const geometry of [cube,cylinder,orb,plane]) geometry.dispose();
      for(const mat of materials.values()) mat.dispose();
      for(const texture of textures) texture.dispose();
      for(const model of models) releaseModel(model);
    },
  };
}
