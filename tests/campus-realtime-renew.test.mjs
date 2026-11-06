import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {createCampusHub} from '../services/campus-realtime/hub.mjs';
import {issueTicket,verifyTicket} from '../services/campus-realtime/tickets.mjs';
test('renew preserves session, rejects replay/identity changes, and heartbeat cannot bypass authorization expiry',async()=>{
 let clock=100000;const secret='s'.repeat(40),eventId='dev-review';
 const hub=createCampusHub({now:()=>clock,tickMs:60000,ttlMs:100000,authorizationLeaseMs:90000,authenticateJoin:async(_,data)=>verifyTicket(data.joinToken,secret,eventId,clock)});
 const server=createServer((req,res)=>void hub.handle(req,res,new URL(req.url,'http://localhost')));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/campus/realtime';
 const ticket=(subject='reviewer',role='guest')=>issueTicket({eventId,subject,role},secret,clock);
 const post=async body=>{const r=await fetch(base,{method:'POST',body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try{
  const joined=(await post({kind:'join',joinToken:ticket(),room:'library'})).body;assert.ok(joined.id);
  clock+=60000;const renewal=ticket();assert.equal((await post({...joined,kind:'renew',joinToken:renewal})).status,200);
  assert.equal((await post({...joined,kind:'renew',joinToken:renewal})).status,409);assert.equal(hub.stats().sessions,1);
  assert.equal((await post({...joined,kind:'update',room:'office',role:'admin'})).status,403);
  clock+=60000;assert.equal((await post({...joined,kind:'resume'})).status,200);
  clock+=30000;assert.equal((await post({...joined,kind:'renew',joinToken:ticket()})).status,401);assert.equal(hub.stats().sessions,0);
  const second=(await post({kind:'join',joinToken:ticket()})).body;
  assert.equal((await post({...second,kind:'renew',joinToken:ticket('other')})).status,403);assert.equal(hub.stats().sessions,0);
  const third=(await post({kind:'join',joinToken:ticket()})).body;
  assert.equal((await post({...third,kind:'renew',joinToken:ticket('reviewer','admin')})).status,403);
 }finally{hub.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
