import test from 'node:test';
import assert from 'node:assert/strict';
import {doors, entrance, nearestPoint, pointAt, routeFrom} from '../public/campus/world/tour/lobby-paths.mjs';

test('changing the destination mid-walk starts at the current position and reaches the selected door', () => {
  for (const from of Object.keys(doors)) {
    const original = routeFrom(entrance, from);
    for (const to of Object.keys(doors)) {
      for (const progress of [0, .15, .6, .95]) {
        const position = pointAt(original, original.at(-1).length * progress);
        const redirected = routeFrom(position, to);
        assert.equal(redirected[0].x, position.x);
        assert.equal(redirected[0].z, position.z);
        assert.equal(redirected.at(-1).x, doors[to].x);
        assert.equal(redirected.at(-1).z, doors[to].z);
        for (const point of redirected) {
          assert.ok(Math.abs(nearestPoint(redirected, point.x, point.z).length - point.length) < .00001);
        }
      }
    }
  }
});
