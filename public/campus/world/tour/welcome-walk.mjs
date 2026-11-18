import { createWalkMotion, floorDestination, hallFloorFromRay, hallHeight } from './welcome-walk-motion.mjs';

const root = document.querySelector('#walk');
const floor = document.querySelector('#floor');
const marker = document.querySelector('#destination');
const label = document.querySelector('#destination-label');
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('bridge');
const avatars = ['female-c', 'female-a', 'male-c', 'male-d'];
const keys = new Set();
let applySync, walkTo, pauseMovement;
let pendingSync;
let ready = false, failed = false;

function send(type, station) {
  if (token && parent !== window)
    parent.postMessage({ source: 'moonshot-walk', token, type, station }, location.origin);
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
  const { stations } = set;
  const motion = createWalkMotion(stations, set.isHallBlocked);
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
  const aim = new THREE.Vector3(), projected = new THREE.Vector3();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();
  const footprint = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.235, 28), new THREE.MeshBasicMaterial({
    color: 0x286ba2, depthWrite: false, transparent: true, opacity: 0.8
  }));
  footprint.rotation.x = -Math.PI / 2;
  footprint.visible = false;
  scene.add(footprint);
  let footprintUntil = 0;
  let width, height, trackingX, trackingZ = 0, roamCamera = 0, raf = 0, last = 0, arranged = false;
  const rayEnd = new THREE.Vector3();
  let markerWidth = 110, markerHeight = 44, arrived = 0;
  let shownIndex, shownStation, synced = false;
  function resize() {
    width = Math.max(1, root.clientWidth); height = Math.max(1, root.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(root);
  resize();
  function sizeMarker() {
    if (marker.hidden) return;
    markerWidth = marker.offsetWidth; markerHeight = marker.offsetHeight;
  }
  const officeSky = new THREE.Color(0xe8eff1), hallSky = new THREE.Color(0x102740);
  function placeCamera(dt) {
    const lead = Math.min(1.7, Math.max(0, (stations[state.station-1].x - state.x) * 0.42));
    const focus = state.x + lead;
    trackingX = trackingX == null ? focus : trackingX + (focus - trackingX) * (1 - Math.exp(-7 * dt));
    // The bearing stays fixed in the offices. Crossing the auditorium threshold reveals the original stage.
    // A narrow viewport also needs room for the visitor in the foreground.
    const cameraScale = width < 600 ? 1.24 : 1;
    const hallEntrance = stations.at(-1).x - 6;
    const progress = state.station === stations.length ? Math.max(0, Math.min(1, (state.x - hallEntrance) / 5.4)) : 0;
    const hall = progress * progress * (3 - 2 * progress);
    const narrow = width < 600;
    const blend = (from, to) => from + (to - from) * hall;
    camera.position.set(trackingX - blend(1.65 * cameraScale, narrow ? 15.5 : 6.55),
      blend(1.27 + 2.98 * cameraScale, narrow ? 9.1 : 4.69),
      blend(-1.1 + 8.8 * cameraScale, narrow ? 8.4 : 4.45));
    aim.set(trackingX + (narrow ? 8.4 : 5.2) * hall, 1.27 + 1.25 * hall, blend(-1.1, narrow ? -6.0 : -1.1));
    const follow = 1 - Math.exp(-7 * dt);
    roamCamera += (Number(state.freeRoam) - roamCamera) * follow;
    trackingZ += (state.z - trackingZ) * follow;
    if (roamCamera > 0.001) {
      const altitude = hallHeight(stations.at(-1), state.x, state.z);
      const towards = (from, to) => from + (to - from) * roamCamera;
      camera.position.set(towards(camera.position.x, trackingX - 6.1),
        towards(camera.position.y, 5.2 + altitude), towards(camera.position.z, trackingZ + 6.3));
      aim.set(towards(aim.x, trackingX + 0.7), towards(aim.y, 1.2 + altitude), towards(aim.z, trackingZ - 0.7));
    }
    const fov = blend(43, narrow ? 49 : 43);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    scene.background.copy(officeSky).lerp(hallSky, hall);
    scene.fog.color.copy(scene.background);
    camera.lookAt(aim); camera.updateMatrixWorld();
  }
  function placeMarker() {
    if (marker.hidden) return;
    const station = stations[state.station - 1];
    projected.set(station.x, 2.65, station.z - 2.25).project(camera);
    const x = (projected.x + 1) * width / 2 - markerWidth / 2;
    const y = (1 - projected.y) * height / 2 - markerHeight;
    const left = Math.max(10, Math.min(width - markerWidth - 10, x));
    const top = Math.max(12, Math.min(height - markerHeight - 14, y));
    marker.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    marker.dataset.edge = x > left + 6 ? 'right' : x < left - 6 ? 'left' : '';
  }
  function sync(msg) {
    if (!Number.isInteger(msg.station) || !stations[msg.station-1]) return;
    if (avatars.includes(msg.avatar)) void chooseAvatar(msg.avatar);
    const returningToDesk = msg.paused && msg.station < state.station;
    const wasRoaming = state.freeRoam;
    motion.sync(msg.station, msg.paused === true, msg.reset === true, msg.freeRoam === true);
    if (state.freeRoam && !wasRoaming) floor.focus({preventScroll: true});
    if (!synced || msg.reset || returningToDesk) { trackingX = undefined; keys.clear(); }
    synced = true;
    if (state.paused) keys.clear();
    const currentLabel = typeof msg.label === 'string' && msg.label.trim() ? msg.label.trim().slice(0, 42) : stations[state.station - 1].title;
    label.textContent = currentLabel;
    marker.setAttribute('aria-label', currentLabel + ' 쪽으로 걷기');
    marker.hidden = state.paused || state.freeRoam;
    const active = marker.hidden ? -1 : state.station - 1;
    if (shownIndex !== active || shownStation !== state.station) set.setNext(active, state.station - 1);
    shownIndex = active; shownStation = state.station;
    sizeMarker();
    root.dataset.station = String(state.station); root.dataset.paused = String(state.paused);
    root.dataset.arrivals = String(arrived);
    root.dataset.freeRoam = String(state.freeRoam);
    placeCamera(0); placeMarker();
  }
  function moveTo(x, z) {
    if (!ready || state.paused) return false;
    keys.clear(); return motion.walk(x, z);
  }
  function tick(now) {
    if (failed) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden || (last && now - last < 1000/40)) return;
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
    const progressed = motion.update(dt, dx, dz);
    if (progressed) {
      keys.clear(); arrived++; root.dataset.arrivals = String(arrived);
      send('arrive', state.station);
    }
    const elevation = state.station === stations.length ? hallHeight(stations.at(-1), state.x, state.z) : 0;
    figure.position.set(state.x, elevation + 0.035, state.z);
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
    mixer.update(dt);
    placeCamera(dt); placeMarker(); renderer.render(scene, camera);
    root.dataset.playerX = state.x.toFixed(2); root.dataset.playerZ = state.z.toFixed(2);
    root.dataset.moving = String(state.moving);
  }
  floor.addEventListener('keydown', event => {
    if (state.paused || event.metaKey || event.altKey || event.ctrlKey) return;
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (k === 'Enter' || k === ' ') { event.preventDefault(); if (!event.repeat) moveTo(); return; }
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
    if (!ready || state.paused) return;
    const rect = floor.getBoundingClientRect();
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    if (state.freeRoam) {
      const lastStop = stations.at(-1);
      const target = hallFloorFromRay(lastStop, ray.ray.origin, ray.ray.at(camera.far, rayEnd));
      if (target && moveTo(target.x, target.z)) {
        footprint.position.set(target.x, hallHeight(lastStop, target.x, target.z) + 0.045, target.z);
        footprintUntil = performance.now() + 850;
      }
      return;
    }
    const hit = ray.intersectObjects(scene.children, true).find(visibleSurface);
    let target;
    // Keep future staff locked. The ground in front of any bay remains navigable.
    if (hit && hit.point.y > 0.12) {
      for (let node = hit.object; node; node = node.parent) {
        if (!Number.isInteger(node.userData.welcomeStation)) continue;
        if (node.userData.welcomeStation !== state.station - 1) return;
        target = stations[state.station - 1];
        break;
      }
    }
    if (!target && ray.ray.intersectPlane(ground, groundHit)) target = floorDestination(groundHit, stations, state.station);
    if (!target || !moveTo(target.x, target.z)) return;
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
  marker.addEventListener('click', () => moveTo());
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
