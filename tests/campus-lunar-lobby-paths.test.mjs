import test from 'node:test';
import assert from 'node:assert/strict';
import {doors, entrance, nearestPoint, pointAt, routeFrom, studySeat, walkRoute} from '../public/campus/world/tour/lobby-paths.mjs';

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

test('each room exit is a walkable point with a route to the other doors', () => {
  assert.deepEqual(Object.keys(doors).sort(), ['office','study']);
  for (const [source, door] of Object.entries(doors)) {
    for (const target of Object.keys(doors)) {
      const path = routeFrom(door, target);
      assert.deepEqual([path[0].x,path[0].z],[door.x,door.z]);
      assert.deepEqual([path.at(-1).x,path.at(-1).z],[doors[target].x,doors[target].z]);
      assert.equal(path.at(-1).length === 0, source === target);
    }
  }
});


test('the student path crosses the study threshold and reaches the chair; a visitor stops outside', () => {
  const path=walkRoute(entrance,'study',true), doorway=doors.study;
  const crossing=path.find(p=>p.x===doorway.x && p.z===doorway.z);
  assert.ok(crossing && crossing.length<path.at(-1).length);
  assert.deepEqual([path.at(-1).x,path.at(-1).z],[studySeat.x,studySeat.z]);
  assert.deepEqual(walkRoute(entrance,'study',false).at(-1),routeFrom(entrance,'study').at(-1));
  const inRoom=pointAt(path,path.at(-1).length-.8);
  const redirected=walkRoute(inRoom,'office',true);
  const exit=redirected.findIndex(p=>p.x===doorway.x && p.z===doorway.z);
  assert.ok(exit>0);
  assert.deepEqual([redirected.at(-1).x,redirected.at(-1).z],[doors.office.x,doors.office.z]);
});
