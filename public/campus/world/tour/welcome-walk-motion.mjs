import {atriumHeightAt, canWalkAtrium, intersectAtriumRay} from './atrium-layout.mjs';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const arrivalRadius = 0.68;
const walkingSpeed = 4.7;
const hallScale = 2 / 3;

// The campus atrium is mounted facing the corridor. Its local spawn is (0, 28).
function atriumPoint(last, x, z) {
  return {x: (z - last.z) / hallScale, y: 28 - (x - last.x) / hallScale};
}
export function hallHeight(last, x, z) {
  const point = atriumPoint(last, x, z);
  return atriumHeightAt(point.x, point.y) * hallScale;
}
export function hallFloorFromRay(last, near, far) {
  function localRayPoint(point) {
    const local = atriumPoint(last, point.x, point.z);
    return {x: local.x, y: point.y / hallScale, z: local.y};
  }
  const hit = intersectAtriumRay(localRayPoint(near), localRayPoint(far));
  if (!hit || hit.x < -21.5 || hit.x > 21.5 || hit.y < -9 || hit.y > 33) return null;
  return {x: last.x + (28 - hit.y) * hallScale, z: last.z + hit.x * hallScale};
}

// Taps near the painted floor stripe should approach the desk, including its visible threshold.
export function floorDestination(point, stations, station) {
  const current = stations[station - 1];
  if (!current || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  if (point.x < stations[0].x - 8.65 || point.x > stations.at(-1).x + 6 ||
      point.z < -8.6 || point.z > 3.65) return null;
  if (point.x > current.x + 0.45 || (Math.abs(point.x - current.x) <= 1.85 && point.z < -0.65)) return current;
  return {x: clamp(point.x, stations[0].x - 4.2, current.x + 0.45), z: clamp(point.z, -1.25, 2.35)};
}

/** The current stop bounds how far a visitor may walk. Arrival is re-armed by intent, not by a render. */
export function createWalkMotion(stations, isHallBlocked = () => false) {
  const entry = { x: stations[0].x - 3.6, z: stations[0].z };
  const last = stations.at(-1);
  const hallBounds = {minX: last.x - 3.1, maxX: last.x + 24.2, minZ: last.z - 13.8, maxZ: last.z + 13.8};
  const state = { ...entry, station: 1, freeRoam: false, paused: false, moving: false, facing: Math.PI / 2 };
  let goal = null;
  let arrivalSent = false;
  let synced = false;
  const current = () => stations[state.station - 1];
  const atDesk = () => !state.freeRoam && Math.hypot(current().x - state.x, current().z - state.z) <= arrivalRadius;
  const stop = () => { goal = null; state.moving = false; };

  function sync(station, paused, reset = false, freeRoam = false) {
    if (!Number.isInteger(station) || station < 1 || station > stations.length) return;
    const explore = freeRoam === true && station === stations.length && !paused;
    if (!synced || reset || (paused && station < state.station)) {
      // Reopening a personal exercise or the live schedule means the visitor already arrived.
      const start = explore || (paused && station >= 6) ? stations[station - 1] : station === 1 ? entry : stations[station - 2];
      state.x = start.x; state.z = start.z; state.facing = Math.PI / 2;
      arrivalSent = false;
      stop();
    }
    if (state.station !== station || state.freeRoam !== explore || (state.paused && !paused)) {
      arrivalSent = false;
      stop();
    }
    if (paused) stop();
    state.freeRoam = explore;
    state.station = station;
    state.paused = paused;
    synced = true;
  }

  function bounded(x, z) {
    if (state.freeRoam) return {x: clamp(x, hallBounds.minX, hallBounds.maxX), z: clamp(z, hallBounds.minZ, hallBounds.maxZ)};
    return {x: clamp(x, entry.x - 0.6, current().x + 0.45), z: clamp(z, -1.25, 2.35)};
  }
  function canStep(from, x, z) {
    const to = atriumPoint(last, x, z);
    return !isHallBlocked(to.x, to.y) && canWalkAtrium(from, to);
  }

  function walk(x = current().x, z = current().z) {
    if (!synced || state.paused || arrivalSent) return false;
    goal = bounded(x, z);
    return true;
  }

  function update(seconds, keyX, keyZ) {
    if (!synced || state.paused || arrivalSent) return false;
    let dx = keyX, dz = keyZ;
    if (dx || dz) goal = null;
    else if (goal) { dx = goal.x - state.x; dz = goal.z - state.z; }
    else { state.moving = false; return false; }
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      const distance = Math.min(walkingSpeed * Math.min(seconds, 0.075), goal ? length : Infinity);
      const next = bounded(state.x + distance * dx / length, state.z + distance * dz / length);
      let nextX = next.x, nextZ = next.z;
      if (state.freeRoam) {
        const from = atriumPoint(last, state.x, state.z);
        if (!canStep(from, nextX, nextZ)) {
          if (canStep(from, nextX, state.z)) nextZ = state.z;
          else if (canStep(from, state.x, nextZ)) nextX = state.x;
          else { stop(); return false; }
        }
      }
      state.moving = Math.hypot(nextX - state.x, nextZ - state.z) > 0.0001;
      if (state.moving) state.facing = Math.atan2(nextX - state.x, nextZ - state.z);
      else if (goal) stop();
      state.x = nextX; state.z = nextZ;
    }
    if (atDesk()) {
      stop(); state.facing = Math.PI;
      arrivalSent = true;
      return true;
    }
    if (goal && Math.hypot(goal.x - state.x, goal.z - state.z) < 0.02) stop();
    return false;
  }
  return { state, sync, walk, update, stop, atDesk };
}
