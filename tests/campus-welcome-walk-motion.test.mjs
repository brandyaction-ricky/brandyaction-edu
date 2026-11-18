import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalkMotion, floorDestination, lobbyFloorDestination, hasInteractiveDesk} from '../public/campus/world/tour/welcome-walk-motion.mjs';

const stations = Array.from({length: 7}, (_, i) => ({x: i*8, z: 0}));
function advance(motion, seconds = 4, dx = 0, dz = 0) {
  let arrivals = 0;
  for (let frame = 0; frame < seconds * 60; frame++) if (motion.update(1/60, dx, dz)) arrivals++;
  return arrivals;
}

test('only the active stop opens once; walking to each new stop continues from the current position', () => {
  const m = createWalkMotion(stations);
  m.sync(1, false);
  for (let id=1; id <= stations.length; id++) {
    const x = m.state.x;
    m.sync(id, false);
    assert.equal(m.state.x, x);
    m.walk();
    assert.equal(advance(m), 1);
    assert.ok(Math.abs(m.state.x - stations[id-1].x) < .7);
    assert.equal(m.walk(), hasInteractiveDesk(id));
    assert.equal(advance(m), 0);
    m.sync(id, true);
    assert.equal(m.walk(), false);
  }
});

test('closing a monitor re-arms it for deliberate input without immediately opening it', () => {
  const m = createWalkMotion(stations);
  m.sync(1,false);m.walk();
  assert.equal(advance(m),1);
  m.sync(1,true);m.sync(1,false);
  assert.equal(advance(m),0);
  m.walk();assert.equal(advance(m),1);
});

test('approaching an interactive desk allows leaving and returning by key or floor click', () => {
  const m = createWalkMotion(stations);
  for (const id of [2, 3, 4, 7]) {
    m.sync(id, false);
    assert.equal(m.walk(), true);
    assert.equal(advance(m, 6), 1);
    assert.equal(m.atDesk(), true);
    m.sync(id, true);
    m.sync(id, false);
    const deskX = m.state.x;
    assert.equal(advance(m, .4, -1, 0), 0);
    assert.ok(m.state.x < deskX - 1);
    assert.equal(m.atDesk(), false);
    m.walk();
    assert.equal(advance(m, 6), 1);
    assert.equal(m.walk(deskX - 2, 0), true);
    assert.equal(advance(m), 0);
    assert.equal(m.atDesk(), false);
  }
});

test('manual movement is bounded and works when walking back toward the station', () => {
  const m = createWalkMotion(stations);
  m.sync(2,false);
  advance(m,4,0,1);assert.equal(m.state.z,2.35);
  advance(m,5,1,0);assert.equal(m.state.x,8.45);
  assert.equal(advance(m,1,0,-1),1);
  assert.equal(m.state.station,2);
});

test('restoring a later visit starts at the previous stop, pausing stops movement, reset restores the entrance', () => {
  const m = createWalkMotion(stations);
  m.sync(7,false);assert.equal(m.state.x,stations[3].x);
  m.walk();advance(m,.5);const x=m.state.x;
  m.sync(7,true);assert.equal(advance(m),0);assert.equal(m.state.x,x);
  m.sync(1,false,true);assert.equal(m.state.x,-3.6);
  m.sync(8,false);assert.equal(m.state.station,1);
});

test('reloading an open exercise starts at its own desk before walking into the hall', () => {
  const m = createWalkMotion(stations);
  m.sync(6, true);
  assert.equal(m.state.x, stations[5].x);
  m.sync(7, false);
  assert.equal(m.state.x, stations[5].x);
  m.walk();
  assert.equal(advance(m), 1);
});

test('stepping back from the live schedule restores the personal exercise at its own desk', () => {
  const m = createWalkMotion(stations);
  m.sync(7, true);
  m.sync(6, true);
  assert.deepEqual([m.state.x, m.state.z], [40, 0]);
  m.sync(7, false);
  assert.deepEqual([m.state.x, m.state.z], [40, 0]);
});

test('floor taps at the rendered threshold enter the current desk and near-edge taps stay on the path', () => {
  assert.equal(floorDestination({x:0.25,z:-2.08}, stations, 1), stations[0]);
  assert.equal(floorDestination({x:8.8,z:-1.5}, stations, 2), stations[1]);
  assert.deepEqual(floorDestination({x:-2.5,z:3.13}, stations, 1), {x:-2.5,z:2.35});
  assert.equal(floorDestination({x:10,z:.5}, stations, 1), stations[0]);
  assert.equal(floorDestination({x:0,z:-25},stations,1), null);
});

test('free roam is limited to the welcome lounge and never replays arrival near its entrance', () => {
  const m = createWalkMotion(stations);
  m.sync(1, false, false, true);assert.equal(m.state.freeRoam, false);
  m.sync(7, true, true);m.sync(7, false, false, true);
  assert.equal(m.state.freeRoam, true);
  assert.equal(advance(m, .2, 1, 0), 0);
  assert.ok(m.state.x > 48.45);
  assert.equal(advance(m, .4, 1, 0), 0);
  m.walk(m.state.x, 4);advance(m, 2);
  assert.ok(m.state.z > 2.35);
  assert.equal(advance(m, 25, -1, 0), 0);
  assert.equal(m.state.x, 44.9);
  m.sync(7, true, false, true);
  assert.equal(m.state.freeRoam, false);assert.equal(m.walk(50, 0),false);
  m.sync(6, true, false, true);
  assert.equal(m.state.freeRoam, false);assert.equal(m.state.x,40);
});

test('free roaming stops at the welcome lounge obstacles', () => {
  const m = createWalkMotion(stations, x => x > 2);
  m.sync(7, false, true, true);
  advance(m, 2, 1, 0);
  assert.ok(m.state.x > 49.8 && m.state.x <= 50);
});

test('lounge floor picking accepts walkable points within the lounge, not beyond its walls', () => {
  const last = stations.at(-1);
  for (const [x, z] of [[48, 0], [53, -2], [58, 4]]) {
    assert.deepEqual(lobbyFloorDestination({x,z},last), {x,z});
  }
  for (const [x, z] of [[40, 0], [60, 0], [50, -6]]) {
    assert.equal(lobbyFloorDestination({x,z},last), null);
  }
});
