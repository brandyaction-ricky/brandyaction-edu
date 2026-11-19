import { createWalkMotion, floorDestination, lobbyFloorDestination, hasInteractiveDesk } from './welcome-walk-motion.mjs';

const root = document.querySelector('#walk');
const floor = document.querySelector('#floor');
const marker = document.querySelector('#destination');
const lobbyGuides = [
  ['materials', document.querySelector('#lobby-materials')],
  ['intro', document.querySelector('#lobby-intro')],
];
const label = document.querySelector('#destination-label');
const greeting = document.querySelector('#destination-greeting');
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('bridge');
const avatars = ['female-c', 'female-a', 'male-c', 'male-d'];
const greetings = {
  1: '텔레그램에서 AI 직원에게 일을 맡기는 20초 영상이에요.',
  2: '경쟁사 고객의 후기에서 반복되는 불편을 찾았어요.',
  3: '후기에서 찾은 내용을 광고 영상 자막에 써봤어요.',
  4: '정본은 회사의 업무 기준을 담은 문서예요.',
};
const greetingAnchors = {
  1: [-1.43, 2.12, -3.49],
  2: [-1.03, 2.25, -3.71],
  3: [-1.35, 2.25, -4.03],
  4: [-1.02, 2.43, -3.55],
  7: [0, 2.30, -2.25],
};
const keys = new Set();
let applySync, walkTo, pauseMovement;
let pendingSync;
let ready = false, failed = false;

function send(type, station, guide) {
  if (token && parent !== window)
    parent.postMessage({ source: 'moonshot-walk', token, type, station, guide }, location.origin);
}
window.addEventListener('message', event => {
  const msg = event.data;
  if (!token || event.source !== parent || event.origin !== location.origin ||
      msg?.source !== 'moonshot-walk-host' || msg.token !== token) return;
  if (msg.type === 'sync') {
    pendingSync = msg;
    applySync?.(msg);
  }
  if (msg.type === 'walk' && (msg.station == null || msg.station === pendingSync?.station)) walkTo?.();
  if (msg.type === 'init' && (ready || failed)) send(ready ? 'ready' : 'error');
});

function fail() {
  if (failed) return;
  failed = true; ready = false;
  root.dataset.ready = 'false'; root.dataset.error = 'true'; marker.hidden = true;
  for (const [, button] of lobbyGuides) button.hidden = true;
  pauseMovement?.();
  send('error');
}
floor.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(); });
window.addEventListener('blur', () => { keys.clear(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });

async function start() {
  // This bundle registers the base Office class used by the shared campus renderer.
  await import('../office/vendor/office.js');
  const [{ CampusWalkThree: THREE, createCampusAssetLoader }, { buildWelcomeWalkSet }] = await Promise.all([
    import('../office/vendor/office3d.js'), import('./welcome-walk-set.mjs')
  ]);
  const renderer = new THREE.WebGLRenderer({ canvas: floor, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8eff1);
  scene.fog = new THREE.Fog(0xe8eff1, 31, 69);
  scene.add(new THREE.HemisphereLight(0xfffbef, 0x9aaeb0, 2.15));
  const key = new THREE.DirectionalLight(0xffedcf, 1.95);
  key.position.set(-5, 10, 6);
  scene.add(key);
  const loader = createCampusAssetLoader();
  const set = buildWelcomeWalkSet(THREE, scene, { loader });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const { stations } = set;
  const motion = createWalkMotion(stations, set.isLobbyBlocked);
  const { state } = motion;
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  const figure = new THREE.Group();
  scene.add(figure);
  let actor, mixer, idle, walking, activeAction, requestedAvatar;
  const avatarModels = new Map();
  async function chooseAvatar(option) {
    const id = avatars.includes(option) ? option : avatars[0];
    if (requestedAvatar === id) return;
    requestedAvatar = id;
    if (!avatarModels.has(id)) {
      const model = loader.loadAsync('../office/vendor/assets/kenney/characters/character-' + id + '.glb').then(avatar => {
        const box = new THREE.Box3().setFromObject(avatar.scene);
        const scale = 1.63 / (box.max.y - box.min.y);
        avatar.scene.scale.setScalar(scale);
        avatar.scene.position.y = -box.min.y * scale;
        return avatar;
      });
      avatarModels.set(id, model);
    }
    let avatar;
    try {
      avatar = await avatarModels.get(id);
    } catch (error) {
      avatarModels.delete(id);
      if (requestedAvatar === id) requestedAvatar = undefined;
      if (!actor && id !== avatars[0]) return chooseAvatar(avatars[0]);
      if (!actor) throw error;
      return;
    }
    if (id !== requestedAvatar) return;
    const previous = actor;
    mixer?.stopAllAction();
    mixer?.uncacheRoot(previous);
    if (previous) figure.remove(previous);
    actor = avatar.scene;
    actor.rotation.y = previous?.rotation.y ?? state.facing;
    figure.add(actor);
    mixer = new THREE.AnimationMixer(actor);
    const action = name => {
      const clip = avatar.animations.find(clip => clip.name === name);
      return clip ? mixer.clipAction(clip) : null;
    };
    idle = action('idle'); walking = action('walk');
    activeAction = state.moving ? walking : idle;
    activeAction?.play();
    root.dataset.avatar = id;
  }
  await chooseAvatar(params.get('avatar'));
  // This contact shadow keeps the moving visitor readable without shadow maps on a phone.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.47, 24), new THREE.MeshBasicMaterial({color: 0x4c554d, opacity: 0.18, transparent: true, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.032;
  shadow.scale.set(1, 0.72, 1);
  figure.add(shadow);
  const aim = new THREE.Vector3(), projected = new THREE.Vector3(), guidePoint = new THREE.Vector3(), signPoint = new THREE.Vector3();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();
  const footprint = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.235, 28), new THREE.MeshBasicMaterial({
    color: 0x286ba2, depthWrite: false, transparent: true, opacity: 0.8
  }));
  footprint.rotation.x = -Math.PI / 2;
  footprint.visible = false;
  scene.add(footprint);
  let footprintUntil = 0;
  let width, height, trackingX, trackingScale, trackingZ = 0, roamCamera = 0, raf = 0, last = 0, arranged = false;
  let markerWidth = 110, markerHeight = 44, arrived = 0;
  let pendingFloorPick;
  let shownIndex, shownStation, synced = false;
  let openOnArrival = false;
  function resize() {
    width = Math.max(1, root.clientWidth); height = Math.max(1, root.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    sizeMarker();
  }
  new ResizeObserver(resize).observe(root);
  resize();
  function sizeMarker() {
    if (marker.hidden) return;
    markerWidth = marker.offsetWidth; markerHeight = marker.offsetHeight;
  }
  const officeSky = new THREE.Color(0xe8eff1), lobbySky = new THREE.Color(0xd9e6ed);
  function placeCamera(dt) {
    const gap = Math.max(0, stations[state.station - 1].x - state.x);
    const narrow = width < 680;
    const lead = Math.min(narrow ? 3.4 : 1.7, gap * .42);
    const focus = state.x + lead;
    const follow = 1 - Math.exp(-7 * dt);
    trackingX = trackingX == null ? focus : trackingX + (focus - trackingX) * follow;
    // On narrow screens, frame the visitor and next desk together while there is still an aisle between them.
    const desiredScale = narrow ? Math.max(1.24, gap / (5.8 * Math.max(.4, camera.aspect))) : 1;
    trackingScale = trackingScale == null ? desiredScale : trackingScale + (desiredScale - trackingScale) * follow;
    // Keep the camera turn gradual as the corridor opens into the welcome lounge.
    const hallEntrance = stations.at(-1).x - 6;
    const progress = state.station === stations.length ? Math.max(0, Math.min(1, (state.x - hallEntrance) / 5.4)) : 0;
    const hall = progress * progress * (3 - 2 * progress);
    const blend = (from, to) => from + (to - from) * hall;
    camera.position.set(trackingX - blend(1.65 * trackingScale, narrow ? 5.6 : 4.4),
      blend(1.27 + 2.98 * trackingScale, narrow ? 5.8 : 5.0),
      blend(-1.1 + 8.8 * trackingScale, narrow ? 8.8 : 8.3));
    aim.set(trackingX + 2.28 * hall, 1.27 + .44 * hall, blend(-1.1, -1.48));
    roamCamera += (Number(state.freeRoam) - roamCamera) * follow;
    trackingZ += (state.z - trackingZ) * follow;
    if (roamCamera > 0.001) {
      const towards = (from, to) => from + (to - from) * roamCamera;
      camera.position.z = towards(camera.position.z, trackingZ + (narrow ? 8.8 : 8.3));
      aim.z = towards(aim.z, trackingZ - 1.48);
    }
    const fov = blend(43, narrow ? 49 : 43);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    scene.background.copy(officeSky).lerp(lobbySky, hall);
    scene.fog.color.copy(scene.background);
    camera.lookAt(aim); camera.updateMatrixWorld();
  }
  function signEdge(station, top = false) {
    // Project both corners to keep the full sign clear at a slanted camera angle.
    const lobby = station === stations.length;
    const center = stations[station - 1].x + (lobby ? .85 : 0);
    const halfWidth = lobby ? 2.76 : 2.37;
    const y = top ? 3.11 : lobby ? 2.3 : 2.45;
    const z = lobby ? -5.01 : -6.35;
    const left = signPoint.set(center - halfWidth, y, z).project(camera).y;
    const right = signPoint.set(center + halfWidth, y, z).project(camera).y;
    return (1 - (top ? Math.max(left, right) : Math.min(left, right))) * height / 2;
  }
  function placeMarker() {
    if (marker.hidden) return;
    const station = stations[state.station - 1];
    const [dx, y, z] = greetingAnchors[state.station] ?? greetingAnchors[7];
    projected.set(station.x + dx, y, station.z + z).project(camera);
    const x = (projected.x + 1) * width / 2;
    const anchorY = (1 - projected.y) * height / 2;
    const maxLeft = width - markerWidth - 10;
    const spaceRight = x + 22 <= maxLeft;
    const spaceLeft = x - 22 - markerWidth >= 10;
    const side = spaceRight ? 'left' : spaceLeft ? 'right' : '';
    const sideLeft = spaceRight ? x + 22 : x - 22 - markerWidth;
    const left = Math.max(10, Math.min(maxLeft, side ? sideLeft : x - markerWidth / 2));
    // On narrow screens, leave the canon robot's face open for a direct tap.
    const aboveSign = state.station === 4 && !side ? signEdge(state.station, true) - markerHeight - 10 : 0;
    const top = aboveSign >= 10 ? aboveSign : Math.max(72, Math.min(height - markerHeight - 96,
      Math.max(signEdge(state.station) + 8, anchorY - (side ? markerHeight / 2 : markerHeight) - 8)));
    marker.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
    marker.dataset.edge = side || (x > left + markerWidth + 6 ? 'right' : x < left - 6 ? 'left' : '');
  }
  function placeLobbyGuides() {
    const active = state.freeRoam && !state.paused;
    const minTop = active ? Math.max(76, signEdge(state.station) + 8) : 0;
    const safeBottom = height - Math.min(height * .46, width <= 700 ? 264 : 218);
    let previous;
    for (const [id, button] of lobbyGuides) {
      if (!active || !set.lobbyGuidePoint(id, guidePoint)) {
        button.hidden = true;
        continue;
      }
      guidePoint.project(camera);
      const x = (guidePoint.x + 1) * width / 2;
      const y = (1 - guidePoint.y) * height / 2;
      button.hidden = guidePoint.z < -1 || guidePoint.z > 1 || x < -28 || x > width + 28 || y > height - 82;
      if (button.hidden) continue;
      const w = button.offsetWidth, h = button.offsetHeight;
      const left = Math.max(8, Math.min(width - w - 8, x - w / 2));
      const maxTop = safeBottom - h;
      let top = Math.min(maxTop, Math.max(minTop, y - h));
      if (previous && left < previous.right + 6 && left + w > previous.left - 6 && top + h > previous.top - 6 && top < previous.bottom + 6) {
        top = previous.bottom + 8 <= maxTop ? previous.bottom + 8 : Math.max(8, previous.top - h - 8);
      }
      button.dataset.primary = String(id === 'materials' && Math.abs(state.x - stations.at(-1).x) < 2.6);
      button.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
      previous = {left, right:left + w, top, bottom:top + h};
    }
  }
  let deskLabel = '';
  const needsDeskClick = () => hasInteractiveDesk(state.station);
  function markDestination() {
    const near = needsDeskClick() && motion.atDesk();
    root.dataset.nearDesk = String(near);
    label.textContent = deskLabel + ' 열기';
    marker.setAttribute('aria-label', deskLabel + ' 열기');
    sizeMarker();
  }
  function openNearbyDesk() {
    if (!state.paused && needsDeskClick() && motion.atDesk()) {
      send('arrive', state.station);
      return true;
    }
    return false;
  }
  function sync(msg) {
    if (!Number.isInteger(msg.station) || !stations[msg.station-1]) return;
    if (avatars.includes(msg.avatar)) void chooseAvatar(msg.avatar);
    const returningToDesk = msg.station < state.station;
    const wasRoaming = state.freeRoam;
    if (msg.reset || msg.station !== state.station) {pendingFloorPick = undefined; keys.clear();}
    if (msg.paused || msg.freeRoam || msg.reset || msg.station !== state.station) openOnArrival = false;
    motion.sync(msg.station, msg.paused === true, msg.reset === true, msg.freeRoam === true);
    if (state.freeRoam && !wasRoaming) floor.focus({preventScroll: true});
    if (!synced || msg.reset || returningToDesk) {
      trackingX = undefined;
      trackingScale = undefined;
      trackingZ = state.z;
      roamCamera = Number(state.freeRoam);
      keys.clear();
    }
    synced = true;
    if (state.paused) keys.clear();
    deskLabel = typeof msg.label === 'string' && msg.label.trim() ? msg.label.trim().slice(0, 42) : stations[state.station - 1].title;
    const guide = greetings[state.station];
    marker.toggleAttribute('data-greeting', Boolean(guide));
    label.hidden = state.station === 1;
    greeting.hidden = !guide;
    greeting.textContent = guide ?? '';
    if (guide) marker.setAttribute('aria-describedby', greeting.id);
    else marker.removeAttribute('aria-describedby');
    marker.hidden = state.paused || state.freeRoam;
    const active = marker.hidden ? -1 : state.station - 1;
    if (shownIndex !== active || shownStation !== state.station) set.setNext(active, state.station - 1);
    shownIndex = active; shownStation = state.station;
    markDestination();
    root.dataset.station = String(state.station); root.dataset.paused = String(state.paused);
    root.dataset.arrivals = String(arrived);
    root.dataset.freeRoam = String(state.freeRoam);
    if (msg.focus) floor.focus({preventScroll: true});
    placeCamera(0); placeMarker(); placeLobbyGuides();
    if (!state.paused && pendingFloorPick) {
      const {x, y} = pendingFloorPick;
      pendingFloorPick = undefined;
      pick(x, y);
    }
  }
  function moveTo(x, z, open = false) {
    if (!ready || state.paused || !motion.walk(x, z)) return false;
    keys.clear();
    openOnArrival = open;
    return true;
  }
  function openCurrentStation() {
    if (!openNearbyDesk()) moveTo(undefined, undefined, true);
  }
  function tick(now) {
    if (failed) return;
    raf = requestAnimationFrame(tick);
    // The parent restores the visitor's stop before the canvas draws its first frame.
    if (!synced || document.hidden || (last && now - last < 1000/40)) return;
    const dt = last ? Math.min((now - last) / 1000, 0.075) : 1/60;
    last = now;
    const down = (a, b) => Number(keys.has(a) || keys.has(b));
    let dx = down('ArrowRight','d') - down('ArrowLeft','a'), dz = down('ArrowDown','s') - down('ArrowUp','w');
    if (state.freeRoam && (dx || dz)) {
      // Map up/forward and right to the current camera view while exploring.
      const fx = aim.x - camera.position.x, fz = aim.z - camera.position.z;
      const len = Math.hypot(fx, fz) || 1;
      [dx, dz] = [(-fz * dx - fx * dz) / len, (fx * dx - fz * dz) / len];
    }
    if (dx || dz) openOnArrival = false;
    const progressed = motion.update(dt, dx, dz);
    if (progressed) {
      if (!state.moving) keys.clear();
      arrived++; root.dataset.arrivals = String(arrived);
      markDestination();
      // The marker or desk itself is a request to open. Floor taps and direction keys only approach.
      send(needsDeskClick() && !openOnArrival ? 'approach' : 'arrive', state.station);
      openOnArrival = false;
    } else if (needsDeskClick() && root.dataset.nearDesk === 'true' && !motion.atDesk()) {
      markDestination();
      send('depart', state.station);
    }
    figure.position.set(state.x, 0.035, state.z);
    const targetAngle = state.facing;
    const diff = Math.atan2(Math.sin(targetAngle - actor.rotation.y), Math.cos(targetAngle - actor.rotation.y));
    actor.rotation.y = arranged ? actor.rotation.y + diff * Math.min(1, dt * 13) : targetAngle;
    arranged = true;
    const next = state.moving ? walking : idle;
    if (next && next !== activeAction) {
      activeAction?.fadeOut(0.13);
      next.reset().fadeIn(0.13).play();
      activeAction = next;
    }
    footprint.visible = !state.paused && now < footprintUntil;
    set.updateGuide(now, reducedMotion.matches);
    mixer.update(dt);
    placeCamera(dt); placeMarker(); placeLobbyGuides(); renderer.render(scene, camera);
    root.dataset.playerX = state.x.toFixed(2); root.dataset.playerZ = state.z.toFixed(2);
    root.dataset.moving = String(state.moving);
  }
  floor.addEventListener('keydown', event => {
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (k === 'Enter' || k === ' ') {
      event.preventDefault();
      if (!state.paused && !event.repeat && !openNearbyDesk()) moveTo();
      return;
    }
    if (!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','w','a','s','d'].includes(k)) return;
    event.preventDefault(); keys.add(k);
  });
  window.addEventListener('keyup', event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  floor.addEventListener('blur', () => keys.clear());
  function visibleSurface(hit) {
    for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
    return true;
  }

  function pick(clientX, clientY) {
    if (!ready) return;
    if (state.paused) {
      // The dialog can close a frame before the pause message reaches this canvas.
      pendingFloorPick = {x: clientX, y: clientY};
      return;
    }
    const rect = floor.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(scene.children, true).find(visibleSurface);
    if (state.freeRoam) {
      const lastStop = stations.at(-1);
      for (let node = hit?.object; node; node = node.parent) {
        if (!node.userData.onboardingGuide) continue;
        send('open-guide', state.station, node.userData.onboardingGuide);
        return;
      }
      const target = ray.ray.intersectPlane(ground, groundHit) && lobbyFloorDestination(groundHit, lastStop);
      if (target && moveTo(target.x, target.z)) {
        footprint.position.set(target.x, 0.045, target.z);
        footprintUntil = performance.now() + 850;
      }
      return;
    }
    let target;
    // Keep future staff locked. The ground in front of any bay remains navigable.
    if (hit && hit.point.y > 0.12) {
      for (let node = hit.object; node; node = node.parent) {
        if (!Number.isInteger(node.userData.welcomeStation)) continue;
        if (node.userData.welcomeStation !== state.station - 1) break;
        if (openNearbyDesk()) return;
        target = stations[state.station - 1];
        break;
      }
    }
    const open = Boolean(target);
    if (!target && ray.ray.intersectPlane(ground, groundHit)) target = floorDestination(groundHit, stations, state.station);
    if (!target || !moveTo(target.x, target.z, open)) return;
    footprint.position.set(target.x, 0.045, target.z);
    footprintUntil = performance.now() + 850;
  }

  // Handle native touch directly. Some embedded browsers omit the pointer-up or
  // compatibility click after a tap in an iframe. Prevent its duplicate click.
  let finger;
  floor.addEventListener('touchstart', event => {
    const touch = event.touches[0];
    finger = event.touches.length === 1 ? {id: touch.identifier, x: touch.clientX, y: touch.clientY} : undefined;
  }, {passive: true});
  floor.addEventListener('touchcancel', () => { finger = undefined; });
  floor.addEventListener('touchend', event => {
    if (event.cancelable) event.preventDefault();
    const start = finger;
    finger = undefined;
    if (!start || event.touches.length) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === start.id);
    if (!touch || Math.hypot(start.x - touch.clientX, start.y - touch.clientY) > 28) return;
    pick(touch.clientX, touch.clientY);
  }, {passive: false});

  let mouseDown;
  floor.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0 || state.paused) return;
    mouseDown = {x: event.clientX, y: event.clientY};
    floor.focus({preventScroll: true});
  });
  floor.addEventListener('click', event => {
    if (event.button !== 0) return;
    const start = mouseDown;
    mouseDown = undefined;
    if (start && Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12) return;
    pick(event.clientX, event.clientY);
  });
  marker.addEventListener('click', openCurrentStation);
  for (const [id, button] of lobbyGuides) button.addEventListener('click', () => {
    if (state.freeRoam && !state.paused) send('open-guide', state.station, id);
  });
  applySync = sync; walkTo = () => moveTo(); pauseMovement = () => { keys.clear(); motion.stop(); };
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    cancelAnimationFrame(raf); set.dispose?.(); renderer.dispose();
  }, { once: true });
  ready = true; root.dataset.ready = 'true';
  if (pendingSync) sync(pendingSync);
  else if (parent === window) sync({station: 1, paused: false});
  tick(performance.now()); send('ready');
}
start().catch(error => { console.error('Welcome walk failed to start', error); fail(); });
