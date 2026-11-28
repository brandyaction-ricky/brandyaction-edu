import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneGesture} from '../public/campus/world/tour/scene-gesture.mjs';

const pointer = (x, y, id=1, type='touch') => ({clientX:x, clientY:y, pointerId:id, pointerType:type});

test('a resting thumb can tap, but a mouse can start a precise short drag', () => {
  const g=createSceneGesture();
  g.begin(pointer(0,0));
  assert.equal(g.move(pointer(6,2)).kind,'tap');
  assert.equal(g.end(pointer(6,2)),true);
  g.begin(pointer(0,0,1,'mouse'));
  assert.deepEqual(g.move(pointer(6,0,1,'mouse')),{kind:'drag',dx:2,dy:0});
  assert.equal(g.end(pointer(0,0,1,'mouse')),false);
});

test('slow and fast drags have the same rotation and never walk on release', () => {
  for(const xs of [[18],[3,6,9,12,15,18]]){
    const g=createSceneGesture();
    g.begin(pointer(0,0));
    assert.equal(xs.reduce((sum,x)=>sum+g.move(pointer(x,0)).dx,0),9);
    assert.equal(g.end(pointer(0,0)),false);
  }
});

test('neither finger of a pinch, a cancelled press nor a stray release can walk', () => {
  const g=createSceneGesture();
  g.begin(pointer(0,0));g.begin(pointer(30,0,2));
  assert.equal(g.end(pointer(30,0,2)),false);
  assert.equal(g.end(pointer(0,0)),false);
  g.begin(pointer(0,0));g.cancel(pointer(0,0));
  assert.equal(g.end(pointer(0,0)),false);
  g.begin(pointer(0,0));g.reset();assert.equal(g.end(pointer(0,0)),false);
  g.begin(pointer(0,0));assert.equal(g.end(pointer(0,0)),true);
});
