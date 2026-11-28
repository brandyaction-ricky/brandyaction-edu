// Measure the whole press in CSS pixels. A drag that returns to its start is still a drag.
export function createSceneGesture() {
  const contacts = new Map();
  let multi = false;

  function begin(event) {
    contacts.set(event.pointerId, {
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      threshold: event.pointerType === 'touch' ? 9 : 4, dragging: false,
    });
    if (contacts.size > 1) multi = true;
  }

  function move(event) {
    const p = contacts.get(event.pointerId);
    if (!p) return null;
    const dx = event.clientX - p.x, dy = event.clientY - p.y;
    p.x = event.clientX; p.y = event.clientY;
    const travel = Math.hypot(p.x - p.startX, p.y - p.startY);
    if (multi) return {kind: 'multi', dx, dy};
    if (!p.dragging && travel <= p.threshold) return {kind: 'tap', dx: 0, dy: 0};
    if (!p.dragging) {
      p.dragging = true;
      // Crossing the threshold slowly or in one large event should feel the same.
      const beyond = (travel - p.threshold) / travel;
      return {kind: 'drag', dx: (p.x - p.startX) * beyond, dy: (p.y - p.startY) * beyond};
    }
    return {kind: 'drag', dx, dy};
  }

  function end(event) {
    const tap = move(event)?.kind === 'tap';
    contacts.delete(event.pointerId);
    if (!contacts.size) multi = false;
    return tap;
  }

  function cancel(event) {
    if (!contacts.delete(event.pointerId)) return;
    multi = contacts.size > 0;
  }

  return {begin, move, end, cancel, reset() { contacts.clear(); multi = false; }};
}
