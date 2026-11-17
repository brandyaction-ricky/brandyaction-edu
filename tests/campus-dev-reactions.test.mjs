import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {REACTIONS,REACTION_TTL,REACTION_COOLDOWN,reactionText} from '../public/campus/world/tour/reactions.mjs';
const built=await build({entryPoints:['features/campus/webinar/dev-presence.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'mock-realtime',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'sdk',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createClient(){return globalThis.__reactionSdk;}'}));}}]});
const {connectDevVisitors}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('presets are friendly opt-in greetings, without boastful copy or arbitrary text',()=>{
 assert.equal(REACTIONS.length,8);assert.equal(reactionText('moonshot'),'🚀 문샷 좋아요');assert.equal(reactionText('<script>'),'');assert.ok(REACTIONS.every(r=>!r.text.includes('대단해요')));
});
test('real-time presets require live peers, matching rooms and cooldown; expiry and leaving clear them',async()=>{
 const env={...process.env},oldDocument=globalThis.document,oldSdk=globalThis.__reactionSdk,oldNow=Date.now;let now=100000,connection;
 const peer='00000000-0000-4000-8000-000000000001',stranger='00000000-0000-4000-8000-000000000002';
 const members={[peer]:[{id:peer,x:1,y:28,yaw:0,room:'live'}]},handlers={},sent=[],states=[];
 const channel={presenceState:()=>members,on(kind,filter,fn){handlers[kind+':'+filter.event]=fn;return this;},subscribe(fn){void fn('SUBSCRIBED');return this;},async track(p){members[p.id]=[p];},async send(p){sent.push(p);}};
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://vjmjhaidlqkmascdjocw.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='public-test';globalThis.document={hidden:false};Date.now=()=>now;
  globalThis.__reactionSdk={channel:()=>channel,removeChannel:async()=>{},realtime:{disconnect(){}}};connection=connectDevVisitors(s=>states.push(s));await Promise.resolve();handlers['presence:sync']();
  const receive=(id,code,room='live')=>handlers['broadcast:reaction']({payload:{id,code,room}});
  receive(stranger,'hello');receive(peer,'free text');receive(peer,'hello','library');assert.equal(states.at(-1).people[0].reaction,undefined);
  receive(peer,'hello');assert.equal(states.at(-1).people[0].reaction.code,'hello');receive(peer,'moonshot');assert.equal(states.at(-1).people[0].reaction.code,'hello');
  now+=REACTION_COOLDOWN;receive(peer,'thanks');assert.equal(states.at(-1).people[0].reaction.code,'thanks');
  assert.equal(connection.react('hello'),true);assert.equal(connection.react('moonshot'),false);assert.equal(sent.filter(x=>x.event==='reaction').length,1);
  now+=REACTION_TTL+1;handlers['presence:sync']();assert.equal(states.at(-1).people[0].reaction,undefined);
  // A greeting may precede presence sync; it is never drawn until the sender is present.
  receive(stranger,'hello');assert.equal(states.at(-1).people.some(p=>p.id===stranger),false);now+=500;members[stranger]=[{id:stranger,x:2,y:28,yaw:0,room:'live'}];handlers['presence:sync']();assert.equal(states.at(-1).people.find(p=>p.id===stranger).reaction.code,'hello');
  globalThis.document.hidden=true;assert.equal(connection.react('thanks'),false);globalThis.document.hidden=false;
  connection.move({room:'library',x:1,y:28,yaw:0});receive(peer,'hello');assert.deepEqual(states.at(-1).people,[]);
  connection.close();assert.equal(connection.react('hello'),false);
 }finally{connection?.close();Date.now=oldNow;globalThis.document=oldDocument;globalThis.__reactionSdk=oldSdk;for(const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
