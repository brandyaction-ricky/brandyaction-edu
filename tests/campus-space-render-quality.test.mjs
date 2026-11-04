import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQuality} from '../public/campus/world/src/render-quality.mjs';

test('ordinary GPU frames and one initial shader compile preserve the full visual quality', () => {
  const q=createRenderQuality(2);
  assert.deepEqual(q.settings(),{name:'full',pixelRatio:1.5,shadows:true,shadowInterval:0});
  q.record(1500);
  for(let i=0;i<60;i++)q.record(12,34);
  assert.equal(q.settings().name,'full');
  assert.equal(createRenderQuality(3,true).settings().pixelRatio,1);
});

test('sustained measured work reduces pixel fill and caches shadows before disabling them', () => {
  const q=createRenderQuality(1.5);
  for(let i=0;i<3;i++)q.record(55,50);
  assert.deepEqual(q.settings(),{name:'balanced',pixelRatio:1,shadows:true,shadowInterval:200});
  for(let i=0;i<3;i++)q.record(55,50);
  assert.deepEqual(q.settings(),{name:'light',pixelRatio:0.65,shadows:false,shadowInterval:0});
  for(let i=0;i<60;i++)q.record(8,32);
  assert.equal(q.settings().name,'light','no alternating quality or GPU resource churn');
});

test('severe render stalls and continuously scheduled GPU delays reduce quality without a CI bypass', () => {
  const q=createRenderQuality(1);
  q.record(180);q.record(8);q.record(250);
  assert.equal(q.settings().name,'light');
  const asynchronous=createRenderQuality(1);
  asynchronous.record(5,300);asynchronous.record(5,300);
  assert.equal(asynchronous.settings().name,'light');
});

test('idle and hidden gaps, invalid samples and a low existing DPR do not increase rendering work', () => {
  const q=createRenderQuality(0.5);
  q.record(5);q.record(8);q.record(NaN);q.record(-1);q.record(Infinity);
  assert.equal(q.settings().name,'full');
  q.record(200);q.record(200);
  assert.equal(q.settings().pixelRatio,0.5);
});
