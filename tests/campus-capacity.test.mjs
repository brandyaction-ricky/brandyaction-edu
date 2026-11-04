import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createPreviewMeetup} from './campus-fixture/meetup-server.mjs';import {createCampusHub} from '../services/campus-realtime/hub.mjs';
import {retryDelay,nearbyPeers} from '../public/campus/world/tour/meetup-policy.mjs';
test('production hub refuses missing authorization resolver',()=>assert.throws(()=>createCampusHub(),/authorization/));
test('retry is bounded and mobile peer selection is local and stable',()=>{assert.equal(retryDelay(0,()=>0),500);assert.equal(retryDelay(99,()=>1),30000);const peers=Array.from({length:24},(_,i)=>({id:String(i),x:i,y:0}));assert.equal(nearbyPeers(peers,{id:'self',x:0,y:0},12).length,12);assert.equal(nearbyPeers(peers,{id:'self',x:23,y:0},12)[0].id,'23');});
test('partitioning applies on join AND moves; capacity reserves survive concurrent authentication; reconnect preserves slot',async()=>{
 let clock=100000;const hub=createPreviewMeetup({maxSessions:30,roomSize:3,now:()=>clock});const server=createServer((req,res)=>void hub.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/campus/preview-meetup',streams=[];
 const post=async data=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 try{
  const joined=await Promise.all(Array.from({length:40},()=>post({kind:'join',role:'student',room:'welcome'})));assert.equal(joined.filter(v=>v.status===200).length,30);assert.equal(joined.filter(v=>v.status===503).length,10);assert.equal(hub.stats().maxRoomOccupancy,3);
  const admitted=joined.filter(v=>v.status===200).map(v=>v.body);for(const s of admitted)assert.equal((await post({...s,kind:'update',room:'live'})).status,200);assert.equal(hub.stats().maxRoomOccupancy,3);assert.equal(hub.stats().partitions,10);
  const abort=new AbortController();streams.push(abort);const s=admitted[0],r=await fetch(base+'?'+new URLSearchParams(s),{signal:abort.signal});const reader=r.body.getReader();await reader.read();abort.abort();await new Promise(r=>setTimeout(r,20));clock+=1000;assert.equal((await post({...s,kind:'resume'})).status,200);assert.equal(hub.stats().sessions,30);
  clock+=16000;hub.flush();assert.equal((await post({...s,kind:'resume'})).status,401);assert.equal(hub.stats().sessions,29);
  assert.equal((await post({kind:'join',role:'guest',room:'office'})).status,403);
 }finally{for(const s of streams)s.abort();hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
import {issueTicket,verifyTicket} from '../services/campus-realtime/tickets.mjs';
import {createFrameBudget} from '../public/campus/world/office/frame-budget.mjs';
test('trusted tickets expire and cannot change event or role',()=>{const secret='a'.repeat(40),now=100000,t=issueTicket({eventId:'event-1',subject:'qa',role:'guest'},secret,now);assert.equal(verifyTicket(t,secret,'event-1',now).role,'guest');assert.equal(verifyTicket(t,secret,'event-2',now),null);assert.equal(verifyTicket(t,secret,'event-1',now+61000),null);assert.equal(verifyTicket(t+'x',secret,'event-1',now),null);assert.throws(()=>issueTicket({eventId:'x',subject:'a'},'short'));});
test('mobile active frames stay at 30 fps and hidden pages do not render',()=>{const b=createFrameBudget({activeInterval:1000/30});let rendered=0;for(let t=0;t<1000;t+=5)if(b.shouldDraw(t,{moving:true}))rendered++;assert.ok(rendered<=30);assert.equal(b.shouldDraw(2000,{moving:true,hidden:true}),false);});

test('trusted admission ignores client role, consumes tickets once, bounds bodies and expires leases',async()=>{
 let clock=100000;const secret='s'.repeat(40);
 const hub=createCampusHub({now:()=>clock,authenticateJoin:async(_req,data)=>verifyTicket(data.joinToken,secret,'qa-event',clock)});
 const server=createServer((req,res)=>void hub.handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/campus/realtime';
 const post=async(data,headers={})=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 try{
  const joinToken=issueTicket({eventId:'qa-event',subject:'visitor',role:'guest'},secret,clock);
  assert.equal((await post({kind:'join',joinToken,role:'admin',room:'study'})).status,403);
  const joined=await post({kind:'join',joinToken,role:'admin',room:'live'});assert.equal(joined.status,200);
  assert.equal((await post({kind:'join',joinToken,room:'live'})).status,409);
  assert.equal((await post({...joined.body,kind:'update',room:'office',role:'admin'})).status,403);
  assert.equal((await post({...joined.body,kind:'resume'},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post({kind:'update',padding:'x'.repeat(5000)})).status,413);
  const flooded=await Promise.all(Array.from({length:15},()=>post({...joined.body,kind:'resume'})));
  assert.ok(flooded.some(r=>r.status===429));
  // Heartbeats never extend the absolute authorization lease.
  for(let i=0;i<31;i++){clock+=30000;await post({...joined.body,kind:'resume'});hub.flush();}
  assert.equal((await post({...joined.body,kind:'resume'})).status,401);
  assert.equal(hub.stats().sessions,0);
 }finally{hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('appearance is resent when a disconnected peer returns to the same partition',async()=>{
 const hub=createPreviewMeetup({tickMs:60000});
 const server=createServer((req,res)=>void hub.handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/campus/preview-meetup';
 const aborts=[];
 const post=async data=>(await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
 async function connect(session){const abort=new AbortController();aborts.push(abort);const response=await fetch(base+'?'+new URLSearchParams(session),{signal:abort.signal});const reader=response.body.getReader();let buffer='';return {abort,async next(){while(!buffer.includes('\n\n')){const part=await reader.read();assert.equal(part.done,false);buffer+=new TextDecoder().decode(part.value);}const end=buffer.indexOf('\n\n'),data=JSON.parse(buffer.slice(6,end));buffer=buffer.slice(end+2);return data;}};}
 try{
  const a=await post({kind:'join',room:'live'}),sa=await connect(a);await sa.next();
  const b=await post({kind:'join',room:'live',appearance:{nickname:'돌아온 동료',coat:'#123456'}}),sb=await connect(b);await sb.next();hub.flush();
  assert.equal((await sa.next()).peers[0].appearance.coat,'#123456');
  sb.abort.abort();await new Promise(r=>setTimeout(r,25));hub.flush();assert.equal((await sa.next()).peers.length,0);
  await post({...b,kind:'resume'});const back=await connect(b);await back.next();hub.flush();
  assert.equal((await sa.next()).peers[0].appearance.nickname,'돌아온 동료');
  assert.equal(hub.stats().sessions,2);
 }finally{for(const a of aborts)a.abort();hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('30 fps pacing does not drift to 20 fps on a jittering 60 Hz clock',()=>{const b=createFrameBudget({activeInterval:1000/30});let count=0;for(let i=0;i<120;i++)if(b.shouldDraw(i*1000/60+(i%3)*.08,{moving:true}))count++;assert.ok(count>=59&&count<=61);});
