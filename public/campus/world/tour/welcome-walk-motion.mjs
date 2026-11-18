const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const arrivalRadius = 0.68;
const walkingSpeed = 4.7;

/** The current stop bounds how far a visitor may walk. Arrival is re-armed by intent, not by a render. */
export function createWalkMotion(stations) {
  const entry = { x: stations[0].x - 3.6, z: stations[0].z };
  const state = { ...entry, station: 1, paused: false, moving: false, facing: Math.PI / 2 };
  let goal = null;
  let arrivalSent = false;
  let synced = false;
  const current = () => stations[state.station - 1];
  const stop = () => { goal = null; state.moving = false; };

  function sync(station, paused, reset = false) {
    if (!Number.isInteger(station) || station < 1 || station > stations.length) return;
    if (!synced || reset) {
      // Reopening a personal exercise or the live schedule means the visitor already arrived.
      const start = paused && station >= 6 ? stations[station - 1] : station === 1 ? entry : stations[station - 2];
      state.x = start.x; state.z = start.z; state.facing = Math.PI / 2;
      arrivalSent = false;
      stop();
    }
    if (state.station !== station || (state.paused && !paused)) {
      arrivalSent = false;
      stop();
    }
    if (paused) stop();
    state.station = station;
    state.paused = paused;
    synced = true;
  }

  function walk(x = current().x, z = current().z) {
    if (!synced || state.paused || arrivalSent) return false;
    goal = { x: clamp(x, entry.x - 0.6, current().x + 0.45), z: clamp(z, -1.25, 2.35) };
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
      const nextX = clamp(state.x + distance * dx / length, entry.x - 0.6, current().x + 0.45);
      const nextZ = clamp(state.z + distance * dz / length, -1.25, 2.35);
      state.moving = Math.hypot(nextX - state.x, nextZ - state.z) > 0.0001;
      if (state.moving) state.facing = Math.atan2(dx, dz);
      state.x = nextX; state.z = nextZ;
    }
    if (Math.hypot(current().x - state.x, current().z - state.z) <= arrivalRadius) {
      stop(); state.facing = Math.PI;
      arrivalSent = true;
      return true;
    }
    if (goal && Math.hypot(goal.x - state.x, goal.z - state.z) < 0.02) stop();
    return false;
  }
  return { state, sync, walk, update, stop };
}
