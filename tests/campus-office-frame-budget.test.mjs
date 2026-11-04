import test from 'node:test';import assert from 'node:assert/strict';
import {createFrameBudget} from '../public/campus/world/office/frame-budget.mjs';
test('idle ambient work is bounded while movement and fresh input remain responsive',()=>{
 const b=createFrameBudget();let idle=0;for(let t=0;t<30000;t+=16)if(b.shouldDraw(t))idle++;
 assert.ok(idle<=30);b.wake(30000);assert.equal(b.shouldDraw(30001),true);assert.equal(b.shouldDraw(30017),true);
 assert.equal(b.shouldDraw(34000,{moving:true}),true);assert.equal(b.shouldDraw(34016,{moving:true}),true);
 assert.equal(b.shouldDraw(34017,{hidden:true,moving:true}),false);b.wake(35000);assert.equal(b.shouldDraw(35000),true);
});
