import test from 'node:test';
import assert from 'node:assert/strict';
import {crowdLayout,crowdMotion} from './campus-fixture/crowd-layout.mjs';
import {atriumHeightAt} from '../public/campus/world/tour/atrium-layout.mjs';
test('QA crowd has small spaced groups, an open arrival and staggered walking pauses',()=>{
 const people=crowdLayout();assert.equal(people.length,60);const groups=new Map();
 for(let i=0;i<people.length;i++){const p=people[i];groups.set(p.group,(groups.get(p.group)||0)+1);assert.ok(Math.hypot(p.x,p.y-28)>3.5||p.walker);for(let j=0;j<i;j++)assert.ok(Math.hypot(p.x-people[j].x,p.y-people[j].y)>1.2,`${i}/${j}`);}
 assert.ok(Math.max(...groups.values())<=4);assert.ok(groups.size>=16);
 for(const [i,p]of people.entries())for(let t=0;t<90;t++){const next=crowdMotion(p,i,t);assert.equal(atriumHeightAt(p.x,p.y),atriumHeightAt(next.x,next.y));assert.ok(Math.hypot(next.x-p.x,next.y-p.y)<=1.61);if(!p.walker){assert.equal(next.x,p.x);assert.equal(next.y,p.y);}}
 const walkers=people.filter(p=>p.walker);assert.ok(walkers.some((p,i)=>Array.from({length:40},(_,t)=>crowdMotion(p,i,t).moving).includes(false)));
});
