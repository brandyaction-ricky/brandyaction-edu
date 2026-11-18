import { createWalkMotion } from './welcome-walk-motion.mjs';

const root = document.querySelector('#walk');
const floor = document.querySelector('#floor');
const marker = document.querySelector('#destination');
const label = document.querySelector('#destination-label');
const token = new URLSearchParams(location.hash.slice(1)).get('bridge');
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
  const motion = createWalkMotion(stations);
  const { state } = motion;
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  const figure = new THREE.Group();
  scene.add(figure);
  const avatar = await loader.loadAsync('../office/vendor/assets/kenney/characters/character-female-c.glb');
  const actor = avatar.scene;
  const box = new THREE.Box3().setFromObject(actor);
  const scale = 1.63 / (box.max.y - box.min.y);
  actor.scale.setScalar(scale);
  actor.position.y = -box.min.y * scale;
  figure.add(actor);
  const mixer = new THREE.AnimationMixer(actor);
  const action = name => {
    const clip = avatar.animations.find(clip => clip.name === name);
    return clip ? mixer.clipAction(clip) : null;
  };
  const idle = action('idle'), walking = action('walk');
  let activeAction = idle;
  idle?.play();
  // This contact shadow keeps the moving visitor readable without shadow maps on a phone.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.47, 24), new THREE.MeshBasicMaterial({color: 0x4c554d, opacity: 0.18, transparent: true, depthWrite: false}));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.032;
  shadow.scale.set(1, 0.72, 1);
  figure.add(shadow);
  const aim = new THREE.Vector3(), projected = new THREE.Vector3();
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3();
  let width, height, trackingX, raf = 0, last = 0, arranged = false;
  let markerWidth = 110, markerHeight = 44, arrived = 0;
  let shownIndex = -1, synced = false;
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
  function placeCamera(dt) {
    const lead = Math.min(1.7, Math.max(0, (stations[state.station-1].x - state.x) * 0.42));
    const focus = state.x + lead;
    trackingX = trackingX == null ? focus : trackingX + (focus - trackingX) * (1 - Math.exp(-7 * dt));
    // Camera bearing is fixed for the whole corridor, including turns and new stops.
    // A narrow viewport also needs room for the visitor in the foreground.
    const cameraScale = width < 600 ? 1.24 : 1;
    camera.position.set(trackingX - 1.65 * cameraScale, 1.27 + 2.98 * cameraScale, -1.1 + 8.8 * cameraScale);
    aim.set(trackingX, 1.27, -1.1);
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
    motion.sync(msg.station, msg.paused === true, msg.reset === true);
    if (!synced || msg.reset) { trackingX = undefined; keys.clear(); }
    synced = true;
    if (state.paused) keys.clear();
    const currentLabel = typeof msg.label === 'string' && msg.label.trim() ? msg.label.trim().slice(0, 36) : stations[state.station - 1].title;
    label.textContent = currentLabel;
    marker.setAttribute('aria-label', currentLabel + ' 쪽으로 걷기');
    marker.hidden = state.paused;
    const active = state.paused ? -1 : state.station - 1;
    if (shownIndex !== active) set.setNext(active);
    shownIndex = active;
    sizeMarker();
    root.dataset.station = String(state.station); root.dataset.paused = String(state.paused);
    root.dataset.arrivals = String(arrived);
    placeCamera(0); placeMarker();
  }
  function moveTo(x, z) {
    if (!ready || state.paused) return;
    keys.clear(); motion.walk(x, z);
  }
  function tick(now) {
    if (failed) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden || (last && now - last < 1000/40)) return;
    const dt = last ? Math.min((now - last) / 1000, 0.075) : 1/60;
    last = now;
    const down = (a, b) => Number(keys.has(a) || keys.has(b));
    const progressed = motion.update(dt, down('ArrowRight','d') - down('ArrowLeft','a'), down('ArrowDown','s') - down('ArrowUp','w'));
    if (progressed) {
      keys.clear(); arrived++; root.dataset.arrivals = String(arrived);
      send('arrive', state.station);
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
  let press;
  floor.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || state.paused) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    floor.focus({ preventScroll: true });
  });
  floor.addEventListener('pointercancel', () => { press = null; });
  floor.addEventListener('pointerup', event => {
    const start = press; press = null;
    if (state.paused || !start || start.id !== event.pointerId ||
        Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12) return;
    const rect = floor.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(scene.children, true)[0];
    for (let node = hit?.object; node; node = node.parent) {
      if (!Number.isInteger(node.userData.welcomeStation)) continue;
      if (node.userData.welcomeStation === state.station - 1) moveTo();
      return;
    }
    if (ray.ray.intersectPlane(ground, groundHit) && groundHit.z >= -1.35 && groundHit.z <= 2.6 &&
        groundHit.x >= stations[0].x - 4.25 && groundHit.x <= stations[state.station-1].x + 0.55)
      moveTo(groundHit.x, groundHit.z);
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
