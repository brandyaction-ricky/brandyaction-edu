import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url), modules=new Map();
function load(name){
 if(modules.has(name))return modules.get(name);
 const result={};modules.set(name,result);
 const code=ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('exports','require',code)(result,n=>n==='server-only'?{}:n.startsWith('./edu-tips-')
  ?n.endsWith('.json')?JSON.parse(readFileSync(new URL('../lib/'+n.slice(2),import.meta.url),'utf8')):load(n.slice(2)):require(n));
 return result;
}
const identity=load('edu-tips-identity-candidate'), api=load('edu-tips-control-candidate'), worker=load('edu-tips-control-worker-candidate');
const read=n=>JSON.parse(readFileSync(new URL('./fixtures/edu-tips-control-candidate/'+n+'.json',import.meta.url),'utf8'));
const iv=read('identity-vectors'),cv=read('control-vectors'),base=JSON.parse(cv.raw_body),now=Number(cv.timestamp)*1000;
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const idOptions={environment:'dev',profile:identity.IDENTITY_PROFILE,customerVersion:'k1',customerKey:Buffer.from(iv.test_customer_key_hex,'hex'),recordKey:Buffer.from(iv.test_id_key_hex,'hex')};
const key={kid:'edu_dev',secret:Buffer.from(cv.test_control_key_hex,'hex'),environment:'dev',tenant:'brandyaction',brand:'brandyaction_edu',receiver:api.CONTROL_RECEIVER,direction:'source_to_tips',scope:'control:block',expiresAt:'2099-01-01T00:00:00.000Z',revoked:false};
const ack=(b=base)=>({control_version:b.control_version,environment:b.environment,tenant_id:b.tenant_id,brand_id:b.brand_id,receiver_id:b.receiver_id,requestId:b.block.requestId,customer_id:b.block.customer_id,consent_epoch:b.block.consent_epoch,request_digest:api.controlDigest(b),status:'blocked',blocked_at:new Date(now).toISOString(),cancellation:'requested'});
const deps={enabled:true,agreedVersion:api.CONTROL_VERSION,environment:'dev',origin:'https://tips.example.invalid',allowedOrigin:'https://tips.example.invalid',key,now:()=>now,fetch:async()=>Response.json(ack())};
const send=(b=base,d={})=>api.sendEduControlCandidate(b,{...deps,...d});

test('EDU identities match independent Python vectors; no raw IDs or access credentials enter public identities',()=>{
 const ids=identity.createEduIdentityCandidate(idOptions);
 assert.equal(ids.customerId(iv.member_uuid,iv.consent_epoch),iv.customer_id);
 assert.equal(ids.eventId('payment_completed',uid(10)),iv.event_id);
 assert.equal(ids.recordId('order',uid(11)),iv.order_id);
 assert.equal(ids.recordId('payment',uid(10)),iv.payment_id);
 assert.equal(ids.recordId('refund',uid(20)),iv.refund_id);
 assert.equal(ids.learningId(iv.member_uuid,uid(30),'2026-10-14'),iv.learning_id);
 assert.ok(!JSON.stringify(ids).includes(iv.member_uuid));
 assert.notEqual(ids.eventId('order_refunded',uid(20)),ids.eventId('order_refunded',uid(21)));
 const changed=identity.createEduIdentityCandidate({...idOptions,customerVersion:'k2',customerKey:Buffer.alloc(32,99)});
 assert.notEqual(changed.customerId(iv.member_uuid,iv.consent_epoch),iv.customer_id);
 assert.equal(changed.recordId('order',uid(11)),iv.order_id);
 const secretCopy=Buffer.from(idOptions.customerKey),copied=identity.createEduIdentityCandidate({...idOptions,customerKey:secretCopy});secretCopy.fill(0);
 assert.equal(copied.customerId(iv.member_uuid,iv.consent_epoch),iv.customer_id);
});
test('no UUID/email fallback, purpose-key reuse, unknown profile or invalid KST date',()=>{
 for(const change of [{customerKey:Buffer.alloc(31)},{recordKey:idOptions.customerKey},{profile:'active'},{environment:'preview'},{customerVersion:'k01'},{customerVersion:'k1000'}])assert.throws(()=>identity.createEduIdentityCandidate({...idOptions,...change}),/TIPS_IDENTITY_INVALID/);
 const ids=identity.createEduIdentityCandidate(idOptions);
 for(const bad of ['raw@example.invalid',uid(1).toUpperCase().replace('000000','ABCDEF'),null,42])assert.throws(()=>ids.customerId(bad,iv.consent_epoch));
 for(const bad of ['2026-02-30','2026-2-01','2026-10-14T00:00:00Z','not-a-date'])assert.throws(()=>ids.learningId(uid(1),uid(30),bad),/TIPS_IDENTITY_INVALID/);
 assert.throws(()=>ids.recordId('diagnosis',uid(1)),/TIPS_IDENTITY_INVALID/);
 const a=identity.newConsentEpoch(),b=identity.newConsentEpoch();assert.match(a,/^ce_[A-Za-z0-9_-]{32}$/);assert.notEqual(a,b);
});
test('candidate sender defaults OFF before any transport; agreement and exact environment/host are required',async()=>{
 let calls=0;const fetch=async()=>{calls++;throw Error('must not call');};
 for(const d of [{enabled:undefined},{enabled:false},{agreedVersion:undefined},{agreedVersion:'2.0.0-rc.2'}])assert.equal((await send(null,{...d,fetch})).code,'disabled');
 for(const d of [{origin:undefined},{origin:'https://elsewhere.invalid'},{origin:'http://tips.example.invalid',allowedOrigin:'http://tips.example.invalid'},
  {origin:'https://tips.example.invalid/path',allowedOrigin:'https://tips.example.invalid/path'},{origin:'https://u:p@tips.example.invalid',allowedOrigin:'https://u:p@tips.example.invalid'},
  {origin:'https://127.0.0.1',allowedOrigin:'https://127.0.0.1'},{environment:'production'},{timeoutMs:5001},
  {key:{...key,environment:'production'}},{key:{...key,scope:'edu.events.read'}},{key:{...key,revoked:true}},{key:{...key,expiresAt:new Date(now).toISOString()}},{key:{...key,kid:'edu_dev\nAuthorization'}}]){
  assert.equal((await send(base,{...d,fetch})).code,'invalid_configuration');
 }
 assert.equal(calls,0);
});
test('strict schemas reject raw/private fields and impossible or extended deadlines before network',async()=>{
 for(const mutate of [b=>b.extra=true,b=>b.block.email='member@example.invalid',b=>b.block.cursor='private',b=>b.block.customer_id=uid(1),b=>b.block.requestId='ABCDEF00-0000-4000-8000-000000000001',b=>b.block.requestId='00000000-0000-0000-8000-000000000001',b=>b.block.at='2026-02-30T00:00:00.000Z',b=>b.block.active_due_at='2026-10-20T00:00:00.000Z',b=>b.block.residual_due_at=b.block.active_due_at,b=>b.brand_id='myin',b=>b.origin_contract_version='2.0.0-rc.1']){
  const b=structuredClone(base);mutate(b);assert.equal((await send(b,{fetch:()=>{throw Error('must not call');}})).code,'invalid_request');
 }
});
test('exact UTF8 HMAC matches independent vector; raw original body stable, fresh nonce each retry, no redirects/cache',async()=>{
 assert.equal(api.controlDigest(base),cv.request_digest);
 const h=api.signedControlHeaders(cv.raw_body,base,key,now,cv.nonce);assert.equal(h['x-tips-control-signature'],cv.signature);
 assert.throws(()=>api.signedControlHeaders(JSON.stringify(base,null,2),base,key,now,cv.nonce),/TIPS_CONTROL_INVALID/);
 let previousNonce;
 for(let n=0;n<2;n++){
  const r=await send(base,{fetch:async(url,options)=>{
   assert.equal(url,'https://tips.example.invalid'+api.CONTROL_PATH);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
   assert.equal(options.body,cv.raw_body);assert.notEqual(options.headers['x-tips-control-nonce'],previousNonce);previousNonce=options.headers['x-tips-control-nonce'];
   assert.equal(options.signal.aborted,false);return Response.json(ack());
  }});assert.equal(r.confirmed,true);assert.equal(r.ack.status,'blocked');assert.ok(!Object.hasOwn(r.ack,'completed_at'));
 }
});
test('input mutation after dispatch cannot rebind signed target or original ACK',async()=>{
 const b=structuredClone(base);const r=await send(b,{fetch:async()=>{b.block.customer_id='k1:'+'A'.repeat(43);return Response.json(ack());}});assert.equal(r.confirmed,true);
});
test('bad/partial/mismatched ACK never counts as remote confirmation',async()=>{
 for(const mutate of [a=>a.status='completed',a=>a.environment='production',a=>a.brand_id='myin',a=>a.request_digest='0'.repeat(64),a=>a.customer_id='k1:'+'A'.repeat(43),a=>a.requestId=uid(99),a=>a.extra=true,a=>a.blocked_at='2026-10-13T00:00:00.000Z',a=>a.blocked_at=new Date(now+60001).toISOString()]){
  const a=ack();mutate(a);const r=await send(base,{fetch:async()=>Response.json(a)});assert.equal(r.code,'invalid_ack');assert.equal(r.confirmed,false);
 }
 for(const response of [new Response(''),new Response('<html>OK</html>',{headers:{'content-type':'text/html'}}),new Response(' '.repeat(4097),{headers:{'content-type':'application/json'}}),
  new Response(JSON.stringify(ack()).replace('"status":"blocked"','"status":"blocked","status":"blocked"'),{headers:{'content-type':'application/json'}}),
  new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})])assert.equal((await send(base,{fetch:async()=>response})).code,'invalid_ack');
 for(const status of [202,204,302,401,403,409,429,500,503]){
  const r=await send(base,{fetch:async()=>new Response(null,{status,headers:{'retry-after':'3601'}})});assert.equal(r.confirmed,false);assert.equal(r.attention,[401,403,409].includes(status));
  if(status===429)assert.equal(r.retryAfterSeconds,3600);
 }
});
test('timeouts cover slow fetch AND streamed ACK; diagnostic bodies never enter result',async()=>{
 const r=await send(base,{timeoutMs:10,fetch:()=>new Promise(()=>{})});assert.equal(r.code,'timeout');
 const r2=await send(base,{timeoutMs:10,fetch:async(_url,o)=>{
  const body=new ReadableStream({start(c){o.signal.addEventListener('abort',()=>c.error(Error('private diagnostic')),{once:true});}});
  return new Response(body,{headers:{'content-type':'application/json'}});
 }});assert.equal(r2.code,'timeout');
 assert.equal((await send(base,{fetch:async()=>{throw Error('bearer/private/password');}})).code,'network_error');
 assert.ok(!JSON.stringify(r2).includes('diagnostic'));
});
const lease=()=>({requestId:base.block.requestId,leaseToken:uid(100),attempt:1,body:structuredClone(base)});
const run=(l,d)=>worker.deliverEduControlLeaseCandidate(l,{now:()=>now,jitter:()=>0,...d});
test('worker commits independent control acknowledgment before confirmed and never erasure completion',async()=>{
 const saved=[];const l=lease();l.delivered_at='already-set-by-pull';l.completed_at=null;
 const result=await run(l,{send:async b=>({confirmed:true,ack:ack(b)}),store:{confirm:async(x,a)=>{saved.push({x,a});return true;},defer:()=>{throw Error('no');}}});
 assert.equal(result,'confirmed');assert.equal(saved.length,1);assert.equal(saved[0].a.status,'blocked');assert.equal(l.completed_at,null);
 assert.equal(await run(lease(),{send:async()=>({confirmed:true,ack:ack()}),store:{confirm:async()=>false}}),'lease_lost');
 await assert.rejects(()=>run(lease(),{send:async()=>({confirmed:true,ack:ack()}),store:{confirm:async()=>{throw Error('private DB');}}}),/^Error: TIPS_CONTROL_STORE_UNAVAILABLE$/);
 await assert.rejects(()=>run(lease(),{send:async()=>({confirmed:true,ack:{...ack(),brand_id:'myin'}}),store:{confirm:async()=>{throw Error('must not persist');}}}),/TIPS_CONTROL_ACK_INVALID/);
});
test('worker retries original immutable request independently of collection/pull; 60s alert and bounded backoff',async()=>{
 const l=lease(),states=[];l.delivered_at='already-set-by-receipt';const original=JSON.stringify(l);
 for(const attempt of [1,2,3,4,5,6,999]){
  l.attempt=attempt;
  assert.equal(await run(l,{send:async b=>{b.block.at='wrong';return {confirmed:false,code:'network_error',attention:false};},store:{defer:async(x,s)=>{assert.deepEqual(x.body,base);states.push(s);return true;}}}),'pending');
 }
 assert.deepEqual(states.map(x=>Date.parse(x.nextAttemptAt)-now),[1000,2000,4000,8000,16000,30000,30000]);assert.ok(states.every(x=>x.attention));
 l.attempt=1;assert.equal(JSON.stringify(l),original);
 let received;
 await run(l,{send:async()=>({confirmed:false,code:'remote_unavailable',attention:false,retryAfterSeconds:60}),store:{defer:async(_l,s)=>{received=s;return true;}}});assert.equal(Date.parse(received.nextAttemptAt)-now,60000);
 assert.equal(await run(l,{send:async()=>{throw Error('secret');},store:{defer:async()=>false}}),'lease_lost');
 await assert.rejects(()=>run(l,{send:async()=>({confirmed:false,code:'disabled',attention:false}),store:{defer:async()=>{throw Error('secret');}}}),/TIPS_CONTROL_STORE_UNAVAILABLE/);
});
test('canonical sender bytes ignore DB property order while preserving microseconds and first digest',()=>{
 const reversed=Object.fromEntries(Object.entries(base).reverse());reversed.block=Object.fromEntries(Object.entries(base.block).reverse());assert.equal(api.canonicalControlBody(reversed),cv.raw_body);
 const b=structuredClone(base);for(const k of ['at','active_due_at','model_due_at','residual_due_at'])b.block[k]=b.block[k].replace('.000Z','.000123Z');assert(api.isEduControlBlock(b));
 assert.ok(api.canonicalControlBody(b).includes('.000123Z'));b.block.residual_due_at=b.block.residual_due_at.replace('123Z','124Z');assert.equal(api.isEduControlBlock(b),false);
});
