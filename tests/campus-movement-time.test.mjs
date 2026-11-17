import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMovement} from '../public/campus/world/tour/movement-time.mjs';
import {canWalkAtrium,atriumHeightAt} from '../public/campus/world/tour/atrium-layout.mjs';
test('slow frames preserve walking distance and small stair collision checks',()=>{
 const walk=hz=>{let y=20;for(let i=0;i<10*hz;i++)advanceMovement(1/hz,dt=>{const next=y-2*dt;if(canWalkAtrium({x:0,y},{x:0,y:next}))y=next;});return y;};
 assert(Math.abs(walk(60)-walk(4))<1e-6);assert.equal(atriumHeightAt(0,walk(4)),4.2);
});
test('resume gaps and invalid elapsed time cannot teleport the character',()=>{
 let distance=0,maxStep=0;advanceMovement(30,dt=>{distance+=dt;maxStep=Math.max(maxStep,dt);});assert(Math.abs(distance-.25)<1e-8);assert(maxStep<=.025);
 for(const value of [-1,NaN,Infinity])advanceMovement(value,()=>assert.fail('invalid time advanced'));
});
