import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const out=await build({entryPoints:['features/campus/space/world-state.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {shouldSendWorldState:send}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
test('unchanged scene snapshots do not redraw, changed positions and removals still arrive',()=>{
 const cache=new Map();assert.equal(send(cache,'peers',{items:[]}),true);
 for(let n=0;n<60;n++)assert.equal(send(cache,'peers',{items:[]}),false);
 assert.equal(send(cache,'peers',{items:[{id:'other',x:1}]}),true);
 assert.equal(send(cache,'peers',{items:[{id:'other',x:2}]}),true);
 assert.equal(send(cache,'peers',{items:[]}),true);
});
test('repeated actions remain repeatable and a new world receives a fresh snapshot',()=>{
 const cache=new Map();for(const type of ['wave','camera','zone','seat','launch','init'])for(let i=0;i<2;i++)assert.equal(send(cache,type,{}),true);
 assert.equal(send(cache,'profile',{name:'동료'}),true);assert.equal(send(cache,'profile',{name:'동료'}),false);
 cache.clear();assert.equal(send(cache,'profile',{name:'동료'}),true);
});
