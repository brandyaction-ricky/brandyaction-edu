// Regression cases preserved from the supplied MIT handoff; imports adapted to EDU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordedAmbience, RECORDED_AMBIENCE } from '../public/campus/world/office/vendor/recorded-ambience.js';

const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
function fixture({defer=false,reject=false}={}){
  const instances=[],listeners=new Map(),states=[];
  const document={hidden:false,addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
  class Audio {
    constructor(src){this.src=src;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.playing=false;this.pending=[];instances.push(this);}
    play(){this.playCalls++;if(reject)return Promise.reject(new Error('play blocked'));if(defer)return new Promise(resolve=>this.pending.push(()=>{this.playing=true;resolve();}));this.playing=true;return Promise.resolve();}
    pause(){this.pauseCalls++;this.playing=false;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){this.loadCalls++;}
  }
  const engine=createRecordedAmbience({scope:{Audio,document},onState:state=>states.push(state)});
  const visibility=async hidden=>{document.hidden=hidden;listeners.get('visibilitychange')?.();await flush();};
  return{engine,instances,states,listeners,visibility};
}

test('recorded layers use the supplied rain and keyboard files and never autoplay on construction',()=>{
  assert.deepEqual(RECORDED_AMBIENCE,{rain:'/campus/world/office/vendor/assets/audio/rain-house.m4a',office:'/campus/world/office/vendor/assets/audio/keyboard-og104.m4a'});
  const f=fixture();assert.equal(f.instances.length,0);assert.equal(f.engine.getState().rain.enabled,false);
  f.engine.setRoom('study');assert.equal(f.instances.length,0);f.engine.destroy();
});

test('recorded rain and keyboard mix independently with separate volume and looping playback',async()=>{
  const f=fixture();f.engine.setRoom('study');
  await f.engine.setEnabled('rain',true);await f.engine.setEnabled('office',true);
  const [rain,keyboard]=f.instances;
  assert.equal(rain.src,RECORDED_AMBIENCE.rain);assert.equal(keyboard.src,RECORDED_AMBIENCE.office);
  assert.equal(rain.loop,true);assert.equal(keyboard.loop,true);assert.equal(rain.preload,'none');
  assert.equal(rain.playing,true);assert.equal(keyboard.playing,true);
  f.engine.setVolume('rain',70);f.engine.setVolume('office',15);
  assert.equal(rain.volume,.7);assert.equal(keyboard.volume,.15);
  await f.engine.setEnabled('rain',false);
  assert.equal(rain.playing,false);assert.equal(keyboard.playing,true);
  assert.equal(f.engine.getState().office.status,'playing');f.engine.destroy();
});

test('office playback starts on request and both rooms share the same uninterrupted recordings',async()=>{
  const f=fixture();
  await f.engine.setEnabled('rain',true);await f.engine.setEnabled('office',true);
  assert.ok(f.instances.every(a=>a.playing));
  const plays=f.instances.map(a=>a.playCalls),pauses=f.instances.map(a=>a.pauseCalls);
  for(const room of ['study','office','study','office']){f.engine.setRoom(room);await flush();}
  assert.equal(f.instances.length,2);assert.ok(f.instances.every(a=>a.playing));
  assert.deepEqual(f.instances.map(a=>a.playCalls),plays);
  assert.deepEqual(f.instances.map(a=>a.pauseCalls),pauses);
  assert.equal(f.engine.getState().rain.status,'playing');f.engine.destroy();
});

test('leaving campus and hiding the page pause recordings while preserving enabled choices',async()=>{
  const f=fixture();f.engine.setRoom('study');await f.engine.setEnabled('rain',true);await f.engine.setEnabled('office',true);
  f.engine.setRoom('outside');assert.ok(f.instances.every(a=>!a.playing));assert.equal(f.engine.getState().rain.enabled,true);
  f.engine.setRoom('study');await flush();assert.ok(f.instances.every(a=>a.playing));
  await f.visibility(true);assert.ok(f.instances.every(a=>!a.playing));assert.equal(f.engine.getState().office.enabled,true);
  await f.visibility(false);assert.ok(f.instances.every(a=>a.playing));f.engine.destroy();
});

test('muting only one layer pauses it and raising its volume resumes it without affecting the other',async()=>{
  const f=fixture();f.engine.setRoom('study');await f.engine.setEnabled('rain',true);await f.engine.setEnabled('office',true);
  f.engine.setVolume('rain',0);assert.equal(f.instances[0].playing,false);assert.equal(f.instances[1].playing,true);
  f.engine.setVolume('rain',35);await flush();assert.equal(f.instances[0].playing,true);assert.equal(f.instances[0].volume,.35);f.engine.destroy();
});

test('a late play resolution cannot restart a layer disabled while playback was loading',async()=>{
  const f=fixture({defer:true});f.engine.setRoom('study');const pending=f.engine.setEnabled('rain',true),rain=f.instances[0];
  assert.equal(f.engine.getState().rain.status,'loading');await f.engine.setEnabled('rain',false);
  rain.pending.shift()();await pending;
  assert.equal(rain.playing,false);assert.equal(f.engine.getState().rain.enabled,false);assert.equal(f.engine.getState().rain.status,'off');f.engine.destroy();
});

test('rejected playback publishes a disabled error state so the actual mixer can reset its checkbox',async()=>{
  const f=fixture({reject:true});f.engine.setRoom('study');
  await assert.rejects(f.engine.setEnabled('rain',true),/play blocked/);
  const last=f.states.at(-1);assert.equal(last.rain.enabled,false);assert.equal(last.rain.status,'error');assert.equal(f.instances[0].playing,false);f.engine.destroy();
});

test('destruction stops both recordings, releases their sources, removes listeners and prevents restart',async()=>{
  const f=fixture();f.engine.setRoom('study');await f.engine.setEnabled('rain',true);await f.engine.setEnabled('office',true);
  f.engine.destroy();f.engine.destroy();assert.equal(f.listeners.size,0);
  for(const a of f.instances){assert.equal(a.playing,false);assert.equal(a.src,'');assert.equal(a.loadCalls,1);}
  const plays=f.instances.map(a=>a.playCalls);f.engine.setRoom('study');await f.engine.setEnabled('rain',true);
  assert.deepEqual(f.instances.map(a=>a.playCalls),plays);
});
