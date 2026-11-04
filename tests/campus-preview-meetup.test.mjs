import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPreviewMeetup} from './campus-fixture/meetup-server.mjs';

test('local meetup validates sessions, isolates rooms and keeps private offices private',{timeout:10000},async()=>{
 const hub=createPreviewMeetup(),server=createServer(async(req,res)=>{await hub.handle(req,res,new URL(req.url,'http://localhost'));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/campus/preview-meetup`,streams=[];
 const post=(body,headers={})=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const join=async(role,room)=>{const r=await post({kind:'join',role,room,appearance:{nickname:'QA',skinColor:'invalid'}});assert.equal(r.status,200);return r.json();};
 const connect=async(s)=>{const abort=new AbortController();streams.push(abort);const r=await fetch(base+'?'+new URLSearchParams(s),{signal:abort.signal});assert.equal(r.status,200);return r.body.getReader();};
 const snapshot=async(reader)=>{const {value}=await reader.read();return JSON.parse(new TextDecoder().decode(value).split('data: ')[1].split('\n')[0]);};
 try{
  assert.equal((await post(null)).status,400);
  assert.equal((await post({kind:'join'},{Origin:'https://outside.example'})).status,403);
  assert.equal((await post({kind:'join',role:'guest',room:'study'})).status,403);
  const guest=await join('guest','live');
  assert.equal((await post({...guest,kind:'update',room:'office'})).status,403);
  assert.equal((await post({...guest,ticket:'bad',kind:'update'})).status,401);
  assert.equal((await post({...guest,ticket:'한'.repeat(48),kind:'update'})).status,401);
  const a=await join('student','live'),b=await join('student','live');
  const ra=await connect(a);assert.equal((await snapshot(ra)).peers.length,0);
  const rb=await connect(b);const together=await snapshot(rb);assert.equal(together.peers.length,1);assert.equal(together.peers[0].appearance.skinColor,'#e8b68b');
  assert.equal((await post({...a,kind:'update',message:'동료 안녕하세요'})).status,200);
  let seen=false;for(let i=0;i<4;i++){if((await snapshot(rb)).peers.some(p=>p.message==='동료 안녕하세요')){seen=true;break;}}assert.equal(seen,true);
  await post({...a,kind:'update',room:'office'});await post({...b,kind:'update',room:'office'});
  let isolated=false;for(let i=0;i<4;i++){const s=await snapshot(rb);if(s.room==='office'){assert.equal(s.peers.length,0);isolated=true;break;}}assert.equal(isolated,true);
  await post({...b,kind:'leave'});assert.equal((await post({...b,kind:'update'})).status,401);
 }finally{for(const a of streams)a.abort();hub.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
