import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import ts from 'typescript';
import { fixture, id, receipt, customer, epoch } from './helpers/edu-tips-erasure.mjs';
const require = createRequire(import.meta.url);
const exports = {};
const schema = JSON.parse(readFileSync(new URL('../lib/edu-tips-erasure.schema.json', import.meta.url)));
const code = ts.transpileModule(readFileSync(new URL('../lib/edu-tips-erasure-http.ts', import.meta.url), 'utf8'),
 { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
new Function('exports','require',code)(exports,name=>name.endsWith('.schema.json')?schema:require(name));
const hash = x => createHash('sha256').update(x).digest('hex');
const key = 'synthetic-development-erasure-key-000000';
const otherKey = 'synthetic-production-erasure-key-000000';
const readerKey = 'synthetic-readonly-erasure-key-00000000';
const secret = 'synthetic-cursor-signing-secret-not-for-use-000000000000';
async function setup(t) {
 const f = await fixture(t,['20261010080829_edu_tips_erasure_http_v2.sql']);
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at=requested_at+interval '120 hours',model_due_at=requested_at+interval '720 hours',residual_due_at=requested_at+interval '720 hours'");
 for (const [token,consumer,scopes] of [[key,90,['edu.erasure.read','edu.erasure.ack']],[otherKey,91,['edu.erasure.read','edu.erasure.ack']],[readerKey,90,['edu.erasure.read']]]) {
  await f.owner("insert into edu_tips_private.erasure_keys(key_hash,consumer_id,scopes,expires_at) values($1,$2,$3,'2099-01-01')",[hash(token),id(consumer),scopes]);
 }
 const env = {EDU_TIPS_ERASURE_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_ERASURE_CURSOR_SECRET:secret,EDU_EXPORT_V1_ENABLED:'false'};
 const rpc = async (name,args) => {
  const names = {
   edu_tips_erasure_http_gate:['p_key_hash','p_environment','p_scope'],
   edu_tips_erasure_http_page:['p_consumer','p_after','p_limit','p_hashes'],
   edu_tips_accept_erasure_receipt:['p_consumer','p_payload'],
   edu_tips_erasure_http_ack:['p_consumer','p_through','p_result_hash'],
  };
  const values = names[name].map(k=>k==='p_payload'?JSON.stringify(args[k]):args[k]);
  try { return { data:await f.value(`select ${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) as v`,values),error:null }; }
  catch (error) { return {data:null,error:{message:error.message}}; }
 };
 const call = async (action='page',options={}) => {
  const {body,query='',token=key,environment=env,rpcOverride=rpc,headers={}}=options;
  const request = new Request(`https://synthetic.invalid/api/internal/export/v2/tombstones${query}`,{
   method:action==='page'?'GET':'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},
   ...(action==='page'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})
  });
  const res = await exports.handleErasure(request,action,{env:environment,rpc:rpcOverride});
  return {status:res.status,body:await res.json(),headers:res.headers};
 };
 return {...f,call,env,rpc};
}

test('HTTP boundary fails closed without flag/config; wrong environment, revoked and insufficient-scope keys are rejected',async t=>{
 const f=await setup(t);
 assert.equal((await f.call('page',{environment:{...f.env,EDU_TIPS_ERASURE_API_ENABLED:'false'},rpcOverride:()=>{throw Error('must not call');}})).status,503);
 assert.equal((await f.call('page',{environment:{...f.env,NEXT_PUBLIC_APP_ENV:undefined}})).status,503);
 assert.equal((await f.call('page',{environment:{...f.env,EDU_TIPS_ERASURE_CURSOR_SECRET:undefined}})).status,503);
 assert.equal((await f.call('page',{token:otherKey})).status,401);
 assert.equal((await f.call('page',{token:'wrong-token'})).status,401);
 assert.equal((await f.call('ack',{token:readerKey,body:{through:'invalid'}})).status,403);
 await f.owner('update edu_tips_private.erasure_keys set revoked_at=now() where key_hash=$1',[hash(key)]);
 assert.equal((await f.call()).status,401);
 assert.equal((await f.call('page',{token:readerKey})).status,200);
});

test('real SQL pages use immutable snapshots, opaque cursors, exact deadlines and late publication on the next cycle',async t=>{
 const f=await setup(t); const first=await f.call('page',{query:'?limit=2'});
 assert.equal(first.status,200); assert.equal(first.body.tombstones.length,2); assert.equal(first.body.has_more,true);
 assert.equal(first.headers.get('cache-control'),'no-store');assert.equal(first.headers.get('x-contract-version'),'2.0.0-rc.2');
 assert.equal(first.body.acked_through,null);
 const item=first.body.tombstones[0];assert.equal(Date.parse(item.active_due_at)-Date.parse(item.at),432000000);
 assert.match(item.cursor,/^ts_[A-Za-z0-9_-]{86}$/);assert.equal(JSON.stringify(first.body).includes('member_id'),false);
 await f.owner('insert into profiles(id) values($1)',[id(5)]);
 await f.owner("insert into edu_tips_private.subjects(member_id,customer_id,consent_epoch,wording_version,consent_revision) values($1,$2,$3,'v1',$4)",[id(5),customer(5),epoch(5),id(15)]);
 await f.owner("update profiles set status='withdrawn' where id=$1",[id(5)]);
 const second=await f.call('page',{query:`?limit=2&after=${first.body.next_cursor}`});
 assert.equal(second.status,200);assert.equal(second.body.tombstones.length,2);assert.equal(second.body.has_more,false);
 const third=await f.call('page',{query:`?after=${second.body.next_cursor}`});
 assert.equal(third.status,200);assert.equal(third.body.tombstones.length,1);assert.equal(third.body.tombstones[0].customer_id,customer(5));
 const empty=await f.call('page',{query:`?after=${third.body.next_cursor}`});
 assert.equal(empty.status,200);assert.equal(empty.body.tombstones.length,0);assert.equal(empty.body.has_more,false);
 const replay=await f.call('page',{query:`?limit=2&after=${first.body.next_cursor}`});
 assert.deepEqual(replay.body.tombstones.map(x=>x.requestId),second.body.tombstones.map(x=>x.requestId));
});

test('forged, signed but unissued, cross-consumer, snapshot and expired cursors cannot advance a consumer',async t=>{
 const f=await setup(t); const page=(await f.call()).body;
 const token=page.tombstones[0].cursor;
 assert.equal((await f.call('page',{query:`?after=${token.slice(0,-1)}!`})).status,409);
 assert.equal((await f.call('page',{query:`?after=${page.snapshot_upper}`})).status,409);
 const nonce=randomBytes(32);const signature=createHmac('sha256',secret).update(`${id(90)}:dev:brandyaction:brandyaction_edu:tombstones:1:`).update(nonce).digest();
 const unissued=`ts_${Buffer.concat([nonce,signature]).toString('base64url')}`;
 assert.equal((await f.call('page',{query:`?after=${unissued}`})).status,409);
 assert.equal((await f.call('page',{token:otherKey,environment:{...f.env,NEXT_PUBLIC_APP_ENV:'production'},query:`?after=${token}`})).status,409);
 await f.owner("update edu_tips_private.erasure_cursors set expires_at='2000-01-01' where cursor_hash=$1",[hash(token)]);
 const expired=await f.call('page',{query:`?after=${token}`}); assert.equal(expired.status,410);assert.equal(expired.body.error,'cursor_expired');
 assert.equal((await f.call('ack',{body:{through:token}})).status,410);
});

test('receipts remain idempotent and final ACK cannot skip incomplete work; lower retries return current ACK without global clearance',async t=>{
 const f=await setup(t);const page=(await f.call()).body;const deliveries=await f.deliveries();
 const send=(n)=>f.call('receipts',{body:receipt(deliveries[n],100+n)});
 assert.equal((await send(1)).status,200);
 assert.equal((await f.call('ack',{body:{through:page.tombstones[1].cursor}})).status,409);
 const accepted=await send(0); assert.equal(accepted.status,200);assert.deepEqual((await send(0)).body,accepted.body);
 const changed=receipt(deliveries[0],100); changed.counts.events=1;
 assert.equal((await f.call('receipts',{body:changed})).body.error,'idempotency_conflict');
 const ack=await f.call('ack',{body:{through:page.tombstones[1].cursor}});assert.equal(ack.status,200);
 const retry=await f.call('ack',{body:{through:page.tombstones[0].cursor}});assert.equal(retry.status,200);
 const remaining=await f.call('page',{query:`?after=${retry.body.acked_through}`});
 assert.deepEqual(remaining.body.tombstones.map(x=>x.requestId),page.tombstones.slice(2).map(x=>x.requestId));
 assert.equal((await f.call('ack',{body:{through:page.snapshot_upper}})).status,409);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});

test('invalid input, unknown keys and oversized/chunked JSON never become a receipt',async t=>{
 const f=await setup(t);const d=(await f.call()).body.tombstones[0];
 for(const query of ['?limit=501','?limit=0','?limit=2&limit=3','?consumer_id=anything','?after=']) assert.ok((await f.call('page',{query})).status>=400);
 const r=receipt((await f.deliveries())[0]);
 assert.equal((await f.call('receipts',{body:{...r,email:'synthetic@example.invalid'}})).status,400);
 assert.equal((await f.call('receipts',{body:'{'})).status,400);
 assert.equal((await f.call('receipts',{body:' '.repeat(17000)})).status,413);
 assert.equal((await f.call('receipts',{body:r,headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await f.call('ack',{body:{through:d.cursor,consumer_id:id(91)}})).status,400);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_receipts'),0);
});

test('private database mistakes fail the whole response and do not expose data or diagnostic messages',async t=>{
 const f=await setup(t);
 const rpcOverride=async(name,args,signal)=>{
  const result=await f.rpc(name,args,signal);
  if(name==='edu_tips_erasure_http_page') result.data.tombstones[0].email='synthetic@example.invalid';
  return result;
 };
 assert.deepEqual((await f.call('page',{rpcOverride})).body,{error:'contract_violation'});
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at=requested_at+interval '6 days'");
 assert.equal((await f.call()).body.error,'contract_violation');
 const failed=await f.call('page',{rpcOverride:async()=>({error:{message:'secret connection diagnostic'},data:null})});
 assert.deepEqual(failed.body,{error:'erasure_unavailable'});
});

test('all keys and routes share the database rate limit, and anonymous database roles cannot use the API RPCs',async t=>{
 const f=await setup(t);
 await f.owner("insert into edu_tips_private.erasure_rate_limits values($1,date_trunc('minute',now()),59)",[id(90)]);
 assert.equal((await f.call('page',{token:readerKey})).status,200);
 const rejected=await f.call('ack',{body:{through:'not reached'}});
 assert.equal(rejected.status,429);assert.equal(rejected.headers.get('retry-after'),'60');
 await f.owner("update edu_tips_private.erasure_rate_limits set window_at=now()-interval '1 minute'");
 assert.equal((await f.call()).status,200);
 await f.db.exec('reset role;set role anon');
 await assert.rejects(()=>f.db.query("select edu_tips_erasure_http_gate('x','dev','edu.erasure.read')"),/permission denied/);
 await assert.rejects(()=>f.db.query('select * from edu_tips_private.erasure_keys'),/permission denied/);
});

test('empty zero cursor cannot ACK and replaying an old snapshot after a later ACK remains valid',async t=>{
 const f=await setup(t);
 const first=(await f.call('page',{query:'?limit=1'})).body;
 const ds=await f.deliveries();for(let i=0;i<ds.length;i++) await f.accept(receipt(ds[i],200+i));
 const all=(await f.call()).body;
 assert.equal((await f.call('ack',{body:{through:all.tombstones.at(-1).cursor}})).status,200);
 assert.equal((await f.call('page',{query:`?after=${first.next_cursor}`})).status,200);
 const other=await f.call('page',{token:otherKey,environment:{...f.env,NEXT_PUBLIC_APP_ENV:'production'}});
 assert.equal(other.status,200);
 // Empty initial publication on a consumer with no outbox rows, in a separate fixture transaction.
 await f.owner('delete from edu_tips_private.erasure_cursors');
 await f.owner('delete from edu_tips_private.erasure_receipts');
 await f.owner('delete from edu_tips_private.erasure_deliveries');
 await f.owner('delete from edu_tips_private.erasure_outbox');
 await f.owner('update edu_tips_private.erasure_consumers set last_ordinal=0,acked_ordinal=0');
 const empty=(await f.call()).body;
 assert.equal(empty.tombstones.length,0);
 assert.equal((await f.call('ack',{body:{through:empty.next_cursor}})).body.error,'unknown_cursor');
});
