// Staging for the recruitment demo. Moving this employee moves the entrance,
// their speech balloon and the clickable chair/desk together.
export const introSeatIndex = 0;

export function introEntrance(desk) {
  const direction = desk.wing === 'left' ? 1 : -1;
  const x = desk.seat.x + 2.4 * direction;
  const y = desk.seat.y - .6;
  // Look slightly past the employee so the visitor's own head doesn't cover them.
  const yaw = Math.atan2(desk.seat.x - x, desk.seat.y - y) - .32 * direction;
  return {x, y, yaw};
}

export function introBalloonPosition(office, desk) {
  const point = office.projectInteriorPoint({x: desk.seat.x, y: desk.seat.y, w: 0, d: 0, height: 2.9});
  if (!point) return null;
  const width = 144, height = 44, margin = 8;
  return {
    x: Math.max(margin, Math.min(office.cw - width - margin, point.x - width / 2)),
    y: Math.max(margin, Math.min(office.ch - height - margin, point.y - height)),
  };
}

// Intersect the camera ray with the bounds of the rendered workstation and seated actor.
// Using world coordinates keeps the hit areas on the furniture when the user orbits or walks.
function boxEntry(near, far, min, max) {
  let first = 0, last = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = far[axis] - near[axis];
    if (Math.abs(delta) < 1e-8) {
      if (near[axis] < min[axis] || near[axis] > max[axis]) return Infinity;
      continue;
    }
    const a = (min[axis] - near[axis]) / delta, b = (max[axis] - near[axis]) / delta;
    first = Math.max(first, Math.min(a, b));
    last = Math.min(last, Math.max(a, b));
    if (first > last) return Infinity;
  }
  return first;
}

export function hitsIntroDesk(near, far, desks) {
  let closest = Infinity, picked;
  for (const desk of desks) {
    const {x, y, seat} = desk;
    const table = boxEntry(near, far, {x: x - .12, y: .05, z: y - .12}, {x: x + 1.52, y: 1.52, z: y + 1.32});
    const chair = boxEntry(near, far, {x: seat.x - .38, y: .1, z: seat.y - .38},
      {x: seat.x + .38, y: desk.index === introSeatIndex ? 1.65 : .98, z: seat.y + .38});
    const t = Math.min(table, chair);
    if (t < closest) {closest = t; picked = desk.index;}
  }
  return picked === introSeatIndex;
}
