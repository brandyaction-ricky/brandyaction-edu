import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['features/campus/tour/appearance.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {tourAvatar}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('preview avatar retains all original cosmetic fields and drops unrelated data',()=>{
 const value=tourAvatar({nickname:' 문샷 동료 ',gender:'female',model:5,coat:'#AABBCC',hairColor:'#010203',skinColor:'#f1e2d3',pantsColor:'#234567',heldItem:'book',role:'admin',secret:'private',enrollmentId:'fake'});
 assert.deepEqual(value,{nickname:'문샷 동료',gender:'female',model:5,coat:'#aabbcc',hairColor:'#010203',skinColor:'#f1e2d3',pantsColor:'#234567',heldItem:'book'});
});
test('corrupt local data is bounded and cannot inject arbitrary style values',()=>{
 for(const input of [null,[],{nickname:'x'.repeat(100),model:99,coat:'url(https://example.invalid)',heldItem:'script'}]){const v=tourAvatar(input);assert.ok(v.nickname.length<=24);assert.equal(v.model,0);assert.match(v.coat,/^#[a-f0-9]{6}$/);assert.equal(v.heldItem,'none');}
});
