import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atriumHeightAt,canWalkAtrium,intersectAtriumRay} from '../public/campus/world/tour/atrium-layout.mjs';
test('stairs connect continuously to deck; side edges cannot teleport up or fall down',()=>{
 assert.equal(atriumHeightAt(0,28),0);assert.equal(atriumHeightAt(0,18.3),0);assert.equal(atriumHeightAt(0,4),4.2);assert.equal(atriumHeightAt(0,0),4.2);
 for(let y=18.3;y>0;y-=.2)assert.equal(canWalkAtrium({x:0,y},{x:0,y:y-.2}),true);
 assert.equal(canWalkAtrium({x:0,y:-.95},{x:0,y:-1.1}),false);
 assert.equal(canWalkAtrium({x:3.4,y:9},{x:3.6,y:9}),false);
 assert.equal(canWalkAtrium({x:3.6,y:9},{x:3.4,y:9}),false);
});
test('click rays stop on the visible stairs and deck rather than their ground projection',()=>{
 const stairs=intersectAtriumRay({x:0,y:6,z:18},{x:0,y:-2,z:5});assert.ok(stairs);assert.ok(stairs.y>=4&&stairs.y<=18.3);assert.ok(atriumHeightAt(stairs.x,stairs.y)>0);
 const deck=intersectAtriumRay({x:7,y:10,z:1},{x:7,y:-2,z:1});assert.equal(deck.x,7);assert.equal(deck.y,1);assert.ok(deck.t<.5);
 assert.equal(intersectAtriumRay({x:0,y:10,z:20},{x:0,y:10,z:0}),null);
});
