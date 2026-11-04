import test from 'node:test';
import assert from 'node:assert/strict';
import {crowdLayout,crowdMotion} from './campus-fixture/crowd-layout.mjs';
import {atriumHeightAt} from '../public/campus/world/tour/atrium-layout.mjs';
test('QA crowd has small spaced groups, an open arrival and staggered walking pauses',()=>{
 const people=crowdLayout();assert.equal(people.length,60);const groups=new Map();
 for(let i=0;i<people.length;i++){const p=people[i];groups.set(p.group,(groups.get(p.group)||0)+1);assert.ok(Math.hypot(p.x,p.y-28)>3.5||p.walker);for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-people[j].x,p.y-people[j].y)>1.2,`${i}/${j}`);}
 assert.ok(Math.max(...groups.values())<=4);assert.ok(groups.size>=16);
 const walkers=people.filter(p=>p.walker);assert.ok(walkers.length>=45);
 let activeTotal=0,maxMoving=0;
 for(let t=0;t<600;t+=.5){
  const states=people.map((p,i)=>crowdMotion(p,i,t)),moving=states.filter(p=>p.moving).length;maxMoving=Math.max(maxMoving,moving);activeTotal+=moving;
  assert.ok(moving<=15,'at most a quarter of QA crowd walking');
  for(const [i,next]of states.entries()){
   const p=people[i];assert.equal(atriumHeightAt(p.x,p.y),atriumHeightAt(next.x,next.y));assert.ok(Math.hypot(next.x-p.x,next.y-p.y)<=1.41);
   for(let j=0;j<i;j++)assert.ok(Math.hypot(next.x-states[j].x,next.y-states[j].y)>.77,`personal space ${i}/${j} at ${t}`);
   const later=crowdMotion(p,i,t+.01);assert.ok(Math.hypot(next.x-later.x,next.y-later.y)<.008,'no teleport between rounds');
  }
 }
 assert.ok(maxMoving>=10);assert.ok(activeTotal/1200>=7,'visible activity, not just occasional walkers');
 assert.equal(crowdMotion(people[0],0,33).moving,false,'approach anchor remains stable');
});
