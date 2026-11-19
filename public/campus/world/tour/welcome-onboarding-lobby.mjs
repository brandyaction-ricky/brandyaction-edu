/** The guide robots face the open aisle in both stations. */
export function buildWelcomeGuideRobot(part, rounded, { white, navy, face, accent }) {
  rounded(white, 0, 1.04, -.50, .76, .84, .53);
  rounded(white, 0, 1.71, -.48, 1.08, .86, .73);
  rounded(navy, 0, 1.71, -.16, .81, .50, .19);
  for (const side of [-1, 1]) {
    rounded(face, side * .17, 1.73, -.07, .10, .15, .026);
    rounded(accent, side * .51, 1.70, -.42, .21, .32, .30);
    rounded(white, side * .40, 1.05, -.19, .27, .30, .42);
  }
  part(accent, .05, 2.14, -.48, .055, .18, .055);
  rounded(face, .05, 2.24, -.48, .15, .15, .15);
}

/** A compact arrival lounge at the end of the welcome corridor. */
export function mountWelcomeOnboardingLobby(THREE, parent) {
  const room = new THREE.Group();
  room.name = 'Moonshot welcome lounge';
  parent.add(room);

  const palette = {
    floor: 0xc5d9e5, tile: 0xb1cad6, frost: 0xe6eeef, trim: 0xa7bfc9,
    navy: 0x263f56, sky: 0x9bc3d2, white: 0xf4f4ed,
    green: 0x658576, leaf: 0x80a590, light: 0xffe0aa,
    guideBlue: 0x406e9a, guideGreen: 0x477c70, face: 0xc3edf0,
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const panel = new THREE.PlaneGeometry(1, 1);
  const pot = new THREE.CylinderGeometry(.5, .38, 1, 16);
  const leaf = new THREE.SphereGeometry(.5, 8, 8);
  const resources = [cube, panel, pot, leaf];
  const batches = new Map();
  const guides = new Map();
  const obstacles = [];
  const sample = new THREE.Object3D();

  function shape(geometry, color, x, y, z, width, height, depth, group = room) {
    const key = `${group.id}:${geometry.id}:${color}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry, color, group, matrices: [] };
      batches.set(key, batch);
    }
    sample.position.set(x, y, z);
    sample.scale.set(width, height, depth);
    sample.updateMatrix();
    batch.matrices.push(sample.matrix.clone());
  }

  function box(color, x, y, z, width, height, depth, solid = false, group = room) {
    shape(cube, color, x, y, z, width, height, depth, group);
    if (solid) obstacles.push({ x: x + group.position.x, z: z + group.position.z, halfWidth: width / 2, halfDepth: depth / 2 });
  }

  function sign(text, x, y, z, width, height, background, group = room) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = Math.round(768 * height / width);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(canvas.height * .54)}px Pretendard, -apple-system, sans-serif`;
    ctx.fillText(text, canvas.width / 2, canvas.height * .51, canvas.width - 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    resources.push(texture, material);
    const face = new THREE.Mesh(panel, material);
    face.position.set(x, y, z);
    face.scale.set(width, height, 1);
    group.add(face);
  }

  function plant(x, z) {
    shape(pot, palette.white, x, .31, z, .68, .62, .68);
    obstacles.push({ x, z, halfWidth: .34, halfDepth: .34 });
    shape(leaf, palette.green, x, 1.05, z, .38, 1.08, .44);
    shape(leaf, palette.leaf, x - .19, .87, z + .07, .41, .71, .37);
    shape(leaf, palette.leaf, x + .18, .93, z - .10, .26, .85, .37);
  }

  function bench(x, z) {
    box(palette.navy, x, .26, z, 2.22, .52, .79, true);
    box(palette.trim, x, .55, z, 2.31, .18, .9);
    box(palette.trim, x, .84, z - .40, 2.31, .53, .10);
  }

  function guide(id, name, x, z, accent, signColor) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.onboardingGuide = id;
    room.add(group);
    guides.set(id, group);

    const part = (color, x, y, z, w, h, d, solid = false) => box(color, x, y, z, w, h, d, solid, group);
    const rounded = (color, x, y, z, w, h, d) => shape(leaf, color, x, y, z, w, h, d, group);
    part(accent, 0, .44, 0, 2.72, .88, .88, true);
    part(palette.white, 0, .91, 0, 2.90, .12, 1.01);
    sign(name, 0, .51, .453, 2.40, .51, signColor, group);
    buildWelcomeGuideRobot(part, rounded, {...palette, accent});
  }

  // The same floor height carries the character from the corridor into the room.
  box(palette.navy, 3.5, -.34, 0, 15, .62, 11.20);
  box(palette.floor, 3.5, -.047, 0, 15, .085, 11.14);
  for (const x of [-2.50, -.50, 1.50, 3.50, 5.50, 7.50, 9.50]) {
    box(palette.tile, x, -.002, .62, .022, .009, 9.86);
  }
  box(palette.tile, 3.5, -.002, 2.48, 14.99, .009, .026);

  // An open foreground makes the avatar and the guides readable on phones.
  box(palette.frost, 3.52, 1.84, -5.32, 14.96, 3.68, .24, true);
  box(palette.frost, 10.83, 1.84, -.94, .22, 3.68, 8.78, true);
  box(palette.navy, 3.50, 3.62, -5.10, 14.90, .22, .55);
  box(palette.light, 3.50, 3.47, -4.89, 14.22, .035, .12);
  box(palette.trim, 3.50, .12, -5.12, 14.86, .24, .24);

  box(palette.navy, .85, 2.79, -5.14, 5.68, 1.10, .22);
  sign('웰컴 라운지', .85, 2.79, -5.01, 5.52, .98, '#263f56');
  for (const x of [4.29, 6.56, 8.83]) {
    box(palette.trim, x, 2.13, -5.13, 2.18, 2.03, .16);
    box(palette.sky, x, 2.13, -5.02, 1.97, 1.79, .05);
    box(palette.frost, x, 2.12, -4.97, .044, 1.84, .04);
    box(palette.frost, x, 1.92, -4.97, 1.99, .052, .04);
  }

  guide('materials', '자료 안내', 1.02, -2.65, palette.guideGreen, '#3a665d');
  guide('intro', '퇴사선배 윤익', 4.85, -2.65, palette.guideBlue, '#355b7b');
  bench(8.18, -4.22);
  plant(-2.35, -4.30);
  plant(9.74, -3.38);

  const meshes = [];
  for (const { geometry, color, group, matrices } of batches.values()) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .85 });
    resources.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    for (const [index, matrix] of matrices.entries()) mesh.setMatrixAt(index, matrix);
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }

  return {
    room,
    guideWorldPoint(id, out) { return guides.get(id)?.localToWorld(out.set(0, 2.58, .56)); },
    blockedAt(x, z, radius = .28) {
      return obstacles.some(box => Math.abs(x - box.x) < box.halfWidth + radius &&
        Math.abs(z - box.z) < box.halfDepth + radius);
    },
    dispose() {
      room.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const resource of resources) resource.dispose();
    },
  };
}
