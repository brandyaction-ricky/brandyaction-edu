import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createPreviewMeetup} from './campus-fixture/meetup-server.mjs';
test('public crowd is connection-backed and redacted; group joins check distance/capacity and preserve private rooms',async()=>{
 let time=100000;const hub=createPreviewMeetup({roomSize:3,tickMs:60000,now:()=>time});const server=createServer((req,res)=>void hub.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/api/campus/preview-meetup',aborts=[];
 const post=async data=>{const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return{status:r.status,...await r.json()};};
 const connect=async session=>{const abort=new AbortController();aborts.push(abort);const r=await fetch(base+'?'+new URLSearchParams(session),{signal:abort.signal});const reader=r.body.getReader();let buffer='';return async()=>{while(!buffer.includes('\n\n'))buffer+=new TextDecoder().decode((await reader.read()).value);const end=buffer.indexOf('\n\n'),data=JSON.parse(buffer.slice(6,end));buffer=buffer.slice(end+2);return data;};};
 try{
  const clients=[];for(let i=0;i<5;i++){const c=await post({kind:'join',room:'live',synthetic:i===0});await post({...c,kind:'update',x:10,y:24,message:'group secret'});clients.push(c);await (await connect(c))();}
  const [a,,c,,e]=clients;const privateUser=await post({kind:'join',room:'office',role:'student'});await (await connect(privateUser))();
  const read=await connect(e),snapshot=await read();assert.equal(snapshot.crowd.length,3);assert.equal(snapshot.syntheticCount,1);assert.ok(snapshot.crowd.every(p=>!('message'in p)&&!('nickname'in p)&&p.id!==privateUser.id));
  assert.equal((await post({...e,kind:'joinGroup',partition:a.partition})).status,409); // full
  await post({...c,kind:'leave'});time+=1000;await post({...e,kind:'update',x:-10,y:24});
  assert.equal((await post({...e,kind:'joinGroup',partition:a.partition})).status,409); // far
  time+=1000;await post({...e,kind:'update',x:10,y:24});
  assert.equal((await post({...e,kind:'joinGroup',partition:a.partition})).status,200);
  assert.equal((await post({...e,kind:'joinGroup',partition:privateUser.partition})).status,403);
  const joined=await (await connect(e))();assert.equal(joined.partition,a.partition);assert.equal(joined.peers.length,2);assert.ok(joined.peers.every(p=>p.id!==privateUser.id));
  await post({...a,kind:'leave'});time+=2100;const after=await (await connect(clients[3]))();assert.ok(after.crowd.every(p=>p.id!==a.id));assert.equal(after.syntheticCount,0);
 }finally{for(const a of aborts)a.abort();hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
