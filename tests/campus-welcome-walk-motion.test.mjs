import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalkMotion} from '../public/campus/world/tour/welcome-walk-motion.mjs';

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
    assert.equal(m.walk(), false);
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
  m.sync(7,false);assert.equal(m.state.x,40);
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
