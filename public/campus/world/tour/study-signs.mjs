// All study actions use the same screen-space target, independent of the camera zoom.
const width = 96;
const height = 44;
const gap = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function configureStudySigns(layer) {
  layer.style.setProperty('--study-sign-width', width + 'px');
  layer.style.setProperty('--study-sign-height', height + 'px');
}

function nearestSpace(point, viewport, obstacles, previous) {
  const anchorX = point.x - width / 2;
  const anchorY = point.y - 24 - height;
  // A small camera move should keep the sign on the same side of its furniture.
  const desiredX = previous ? (anchorX + 2 * previous.x) / 3 : anchorX;
  const desiredY = previous ? (anchorY + 2 * previous.y) / 3 : anchorY;
  const left = gap;
  const top = gap;
  const right = Math.max(left, viewport.width - width - gap);
  const bottom = Math.max(top, viewport.height - height - gap);
  const xs = [clamp(desiredX, left, right), left, right];
  const ys = [clamp(desiredY, top, bottom), top, bottom];
  if (previous) {
    xs.push(clamp(previous.x, left, right));
    ys.push(clamp(previous.y, top, bottom));
  }
  for (const box of obstacles) {
    xs.push(clamp(box.x0 - gap - width, left, right), clamp(box.x1 + gap, left, right));
    ys.push(clamp(box.y0 - gap - height, top, bottom), clamp(box.y1 + gap, top, bottom));
  }
  let best;
  let bestOverlap = Infinity;
  let bestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const distance = (x - desiredX) ** 2 + (y - desiredY) ** 2;
      if (bestOverlap === 0 && distance >= bestDistance) continue;
      let overlap = 0;
      for (const box of obstacles) {
        overlap += Math.max(0, Math.min(x + width, box.x1 + gap) - Math.max(x, box.x0 - gap))
          * Math.max(0, Math.min(y + height, box.y1 + gap) - Math.max(y, box.y0 - gap));
      }
      if (!overlap && x === xs[0] && y === ys[0]) {
        return { x0: x, y0: y, x1: x + width, y1: y + height };
      }
      if (overlap < bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
        best = { x0: x, y0: y, x1: x + width, y1: y + height };
        bestOverlap = overlap;
        bestDistance = distance;
      }
    }
  }
  return best;
}

// The stem still points to the furniture when a neighbouring sign moves this label.
function placeSign(button, point, box) {
  const x = clamp(point.x - box.x0, 1, width - 1);
  const y = clamp(point.y - box.y0, 1, height - 1);
  const dx = point.x - box.x0 - x;
  const dy = point.y - box.y0 - y;
  button.style.transform = `translate(${box.x0}px,${box.y0}px)`;
  button.style.setProperty('--stem-x', (x - 1) + 'px');
  button.style.setProperty('--stem-y', (y - 1) + 'px');
  button.style.setProperty('--stem-length', Math.hypot(dx, dy) + 'px');
  button.style.setProperty('--stem-angle', Math.atan2(dy, dx) + 'rad');
}

export function makeStudySignLayout(controls) {
  let controlsChanged = true;
  let controlBoxes = [];
  const observer = new ResizeObserver(() => { controlsChanged = true; });
  for (const control of controls) observer.observe(control);
  let previousHostBoxes;
  let previousMarkers;
  let previousGeometry;
  let lastPlacements = [];
  let lastViewport;
  return (markers, office, nameplate, hostBoxes) => {
    const points = markers.map(({ item }) => office.projectInteriorPoint(item));
    const round = value => Math.round(value);
    const geometry = [office.cw, office.ch, nameplate && [nameplate.x0, nameplate.y0, nameplate.x1, nameplate.y1].map(round),
      ...points.map(p => p && [round(p.x), round(p.y)])].join('|');
    if (markers === previousMarkers && geometry === previousGeometry && !controlsChanged && hostBoxes === previousHostBoxes) return;
    const viewportChanged = lastViewport?.width !== office.cw || lastViewport?.height !== office.ch;
    if (previousMarkers !== markers || viewportChanged || controlsChanged) {
      lastPlacements = [];
      // The scene fills its iframe. Only measure the HUD after a layout change.
      controlBoxes = Array.from(controls, control => control.getBoundingClientRect())
        .filter(rect => rect.width && rect.height)
        .map(rect => ({ x0: rect.left, x1: rect.right, y0: rect.top, y1: rect.bottom }));
      controlsChanged = false;
    }
    previousHostBoxes = hostBoxes;
    previousMarkers = markers;
    previousGeometry = geometry;
    const obstacles = [...controlBoxes, ...hostBoxes];
    if (nameplate) obstacles.push(nameplate);
    const viewport = { width: office.cw, height: office.ch };
    lastViewport = viewport;
    markers.forEach(({ b }, index) => {
      const point = points[index];
      b.hidden = !point;
      if (!point) {
        lastPlacements[index] = null;
        return;
      }
      const last = lastPlacements[index];
      const deltaX = last ? point.x - last.point.x : 0;
      const deltaY = last ? point.y - last.point.y : 0;
      const previous = last && Math.hypot(deltaX, deltaY) < 20
        ? { x: last.box.x0 + deltaX, y: last.box.y0 + deltaY } : null;
      const box = nearestSpace(point, viewport, obstacles, previous);
      lastPlacements[index] = { point, box };
      placeSign(b, point, box);
      obstacles.push(box);
    });
  };
}

// A compact identity label leaves the four rectangular controls visually distinct.
export function drawStudyNameplate(ctx, { x, y, name = '나', level = 0 }) {
  const value = Number.isInteger(level) ? clamp(level, 0, 30) : 0;
  const prefix = `Lv.${value} · `;
  ctx.save();
  ctx.font = '600 11px LocalKR, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = Array.from(name);
  let label = prefix + chars.join('');
  while (ctx.measureText(label).width > 152 && chars.length > 1) {
    chars.pop();
    label = prefix + chars.join('') + '…';
  }
  const pillWidth = Math.ceil(ctx.measureText(label).width) + 16;
  const left = x - pillWidth / 2;
  const top = y - 15;
  ctx.fillStyle = '#d6edfa';
  ctx.beginPath();
  ctx.roundRect(left, top, pillWidth, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#163247';
  ctx.fillText(label, x, y - 5);
  ctx.restore();
  return { x0: left, x1: left + pillWidth, y0: top, y1: top + 20 };
}
