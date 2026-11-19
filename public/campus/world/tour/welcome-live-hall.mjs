import {Office3D} from '../office/vendor/office3d.js';
import {buildLunarAtrium, WELCOME_AGENDA_DISPLAY} from './lunar-atrium.mjs';
import {batchAtriumBoxes} from './static-batches.mjs';

/** Mount the member campus live room in the walk's existing renderer. */
export function mountWelcomeLiveHall(THREE, parent) {
  const room = new THREE.Group();
  const scale = 2 / 3;
  // The atrium's front edge is z=34. Its normal visitor spawn (0,28) lands
  // exactly at the seventh station, four metres inside the shared entrance.
  room.position.x = 28 * scale;
  room.rotation.y = -Math.PI / 2;
  room.scale.setScalar(scale);
  parent.add(room);
  room.updateWorldMatrix(true, false);

  const resources = new Set();
  function own(value) { resources.add(value); return value; }
  function ownMesh(mesh) {
    if (!mesh.isMesh) return;
    own(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      own(material);
      for (const value of Object.values(material)) if (value?.isTexture) own(value);
    }
  }
  // The original builder uses these mesh, sign and texture methods. It needs
  // neither a second Office instance/WebGL context nor the member session.
  const kit = Office3D.prototype;
  const office = {
    room,
    dead: false,
    draw() {}, // The walk render loop paints the NASA image when it arrives.
    createAvatarAttribute: kit.createAvatarAttribute,
    buildSign: kit.buildSign,
    patternTexture(draw) { return own(kit.patternTexture.call(this, draw)); },
    boxMesh(...args) {
      const mesh = kit.boxMesh.apply(this, args);
      ownMesh(mesh);
      return mesh;
    },
  };
  const obstacles = [];
  function obstacleBox(group, x, y, z, w, d, h, color, solid = true) {
    if (solid) obstacles.push({left: x, right: x+w, front: y, back: y+d});
    return office.boxMesh(x, y, z, w, d, h, color, {group, shadow: false});
  }
  buildLunarAtrium(office, room, obstacleBox, {guidedPreview: true});
  room.traverse(ownMesh);
  const batches = batchAtriumBoxes(room);
  // Merging replaces the original individual shapes. Keep only geometry that
  // is still displayed; a phone needn't retain both copies of the whole hall.
  const visibleGeometry = new Set();
  room.traverse(node => { if (node.isMesh) visibleGeometry.add(node.geometry); });
  for (const resource of resources) {
    if (resource.isBufferGeometry && !visibleGeometry.has(resource)) {
      resource.dispose();
      resources.delete(resource);
    }
  }
  return {
    room,
    agendaWorldPoint(out) {
      const [left, front] = WELCOME_AGENDA_DISPLAY;
      return room.localToWorld(out.set(left + 3, 2.7, front + .32));
    },
    blockedAt(x, y, radius = .28) {
      return obstacles.some(rect => x > rect.left - radius && x < rect.right + radius &&
        y > rect.front - radius && y < rect.back + radius);
    },
    dispose() {
      office.dead = true;
      batches.dispose();
      room.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
