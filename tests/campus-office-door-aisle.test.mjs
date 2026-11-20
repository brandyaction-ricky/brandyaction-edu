import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampusPlan,getCampusCollisionRects} from '../public/campus/world/office/vendor/campus-plan.js';

test('the walk from the office arrival to the study doorway is clear of desks, chairs and props', () => {
  const plan = createCampusPlan(), rects = getCampusCollisionRects('office', plan);
  const route = plan.approaches.study, radius = .3;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    for (let t = 0; t <= 1; t += .02) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const hit = rects.find(r => x > r.minX - radius && x < r.maxX + radius && y > r.minY - radius && y < r.maxY + radius);
      assert.equal(hit, undefined, `blocked at ${x.toFixed(2)},${y.toFixed(2)} by ${hit?.id}`);
    }
  }
  assert.equal(plan.officeSeats.length, 10);
});
