const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const arrivalRadius = 0.68;
const walkingSpeed = 4.7;
const lobbyBounds = {minX: -3.1, maxX: 10.55, minZ: -5.24, maxZ: 5.24};
export const hasInteractiveDesk = station => (station >= 2 && station <= 4) || station === 7;

export function lobbyFloorDestination(point, last) {
  const x = point.x - last.x, z = point.z - last.z;
  if (x < lobbyBounds.minX || x > lobbyBounds.maxX || z < lobbyBounds.minZ || z > lobbyBounds.maxZ) return null;
  return {x: point.x, z: point.z};
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
export function createWalkMotion(stations, isLobbyBlocked = () => false) {
  const entry = { x: stations[0].x - 3.6, z: stations[0].z };
  const last = stations.at(-1);
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
      // Reopening a personal exercise or the welcome lounge means the visitor already arrived.
      const start = explore || (paused && station >= 6) ? stations[station - 1]
        : station === 1 ? entry : station === 7 ? stations[3] : stations[station - 2];
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
    if (state.freeRoam) return {x: clamp(x, last.x + lobbyBounds.minX, last.x + lobbyBounds.maxX), z: clamp(z, last.z + lobbyBounds.minZ, last.z + lobbyBounds.maxZ)};
    return {x: clamp(x, entry.x - 0.6, current().x + 0.45), z: clamp(z, -1.25, 2.35)};
  }
  const canStep = (x, z) => !isLobbyBlocked(x - last.x, z - last.z);

  function walk(x = current().x, z = current().z) {
    if (!synced || state.paused || (arrivalSent && !hasInteractiveDesk(state.station))) return false;
    goal = bounded(x, z);
    return true;
  }

  function update(seconds, keyX, keyZ) {
    const interactive = hasInteractiveDesk(state.station);
    if (!synced || state.paused || (arrivalSent && !interactive)) return false;
    let dx = keyX, dz = keyZ;
    if (dx || dz) goal = null;
    else if (goal) { dx = goal.x - state.x; dz = goal.z - state.z; }
    else { state.moving = false; return false; }
    const length = Math.hypot(dx, dz);
    if (length > 0.001) {
      const distance = Math.min(walkingSpeed * Math.min(seconds, 0.075), goal ? length : Infinity);
      const next = bounded(state.x + distance * dx / length, state.z + distance * dz / length);
      let nextX = next.x, nextZ = next.z;
      if (state.freeRoam && !canStep(nextX, nextZ)) {
        if (canStep(nextX, state.z)) nextZ = state.z;
        else if (canStep(state.x, nextZ)) nextX = state.x;
        else { stop(); return false; }
      }
      state.moving = Math.hypot(nextX - state.x, nextZ - state.z) > 0.0001;
      if (state.moving) state.facing = Math.atan2(nextX - state.x, nextZ - state.z);
      else if (goal) stop();
      state.x = nextX; state.z = nextZ;
    }
    const near = atDesk();
    if (near && !arrivalSent) {
      arrivalSent = true;
      // Stop an intentional walk to the desk. Manual walking stays available.
      if (!interactive || (goal && goal.x === current().x && goal.z === current().z)) {
        stop(); state.facing = Math.PI;
      }
      return true;
    }
    if (!near && interactive) arrivalSent = false;
    if (goal && Math.hypot(goal.x - state.x, goal.z - state.z) < 0.02) stop();
    return false;
  }
  return { state, sync, walk, update, stop, atDesk };
}
