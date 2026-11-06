import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {verifyTicket} from '../services/campus-realtime/tickets.mjs';
const bundle=await build({entryPoints:['features/campus/webinar/realtime-admission.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {admitGateway,gatewayConfig}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const origin='http://127.0.0.1:4586',clock=Date.parse('2026-11-06T00:00:00Z');
const env={NODE_ENV:'development',EDU_CAMPUS_REALTIME_DEV_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://vjmjhaidlqkmascdjocw.supabase.co',CAMPUS_REALTIME_ENDPOINT:'http://127.0.0.1:8787/api/campus/realtime',CAMPUS_REALTIME_SIGNING_SECRET:'qa-only-'.repeat(8),CAMPUS_REALTIME_EVENT_ID:'dev-realtime-review'};
const request=(body={slug:env.CAMPUS_REALTIME_EVENT_ID},headers={})=>new Request(origin+'/api/campus/realtime-admission',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
const deps=()=>({env:{...env},user:async()=>({id:'verified-user',role:'admin',status:'active'}),event:async()=>({status:'published',endsAt:new Date(clock+600000).toISOString()}),now:()=>clock});
test('DEV-only admission issues fresh guest tickets after verified account and uncached event checks',async()=>{
 const d=deps();let reads=0;d.event=async()=>{reads++;return {status:'published',endsAt:new Date(clock+600000).toISOString()};};
 const a=await admitGateway(request(),d),b=await admitGateway(request(),d);assert.equal(a.status,200);assert.match(a.headers.get('cache-control'),/private, no-store/);
 const first=await a.json(),second=await b.json();assert.notEqual(first.joinToken,second.joinToken);assert.equal(reads,2);
 const claims=verifyTicket(first.joinToken,env.CAMPUS_REALTIME_SIGNING_SECRET,env.CAMPUS_REALTIME_EVENT_ID,clock);assert.equal(claims.subject,'verified-user');assert.equal(claims.role,'guest');
 assert.equal((await admitGateway(request({slug:env.CAMPUS_REALTIME_EVENT_ID,role:'admin'}),d)).status,400);
 assert.equal((await admitGateway(request({slug:'foreign-event'}),d)).status,400);
});
test('admission denies inactive/anonymous/non-admin accounts, closed events, cross origin and dependency failures',async()=>{
 for(const user of [null,{id:'x',role:'student',status:'active'},{id:'x',role:'admin',status:'inactive'}]){const d=deps();d.user=async()=>user;assert.equal((await admitGateway(request(),d)).status,user?403:401);}
 for(const event of [null,{status:'paused',endsAt:new Date(clock+1000).toISOString()},{status:'published',endsAt:new Date(clock).toISOString()}]){const d=deps();d.event=async()=>event;assert.equal((await admitGateway(request(),d)).status,403);}
 assert.equal((await admitGateway(request(undefined,{origin:'https://foreign.test'}),deps())).status,403);
 const d=deps();d.user=async()=>{throw Error('Auth offline');};assert.equal((await admitGateway(request(),d)).status,503);
 assert.equal((await admitGateway(request({slug:'x'.repeat(2000)}),deps())).status,400);
});
test('production database, missing settings and insecure remote URLs never enable the DEV gateway',async()=>{
 for(const change of [{EDU_CAMPUS_REALTIME_DEV_ENABLED:'false'},{NEXT_PUBLIC_SUPABASE_URL:'https://qitqxizuwmmlhlcgsrqe.supabase.co'}]){const d=deps();Object.assign(d.env,change);assert.equal((await admitGateway(request(),d)).status,404);}
 for(const change of [{NODE_ENV:'production'},{CAMPUS_REALTIME_ENDPOINT:'http://192.168.1.1/api/campus/realtime'},{CAMPUS_REALTIME_ENDPOINT:'https://example.test/api/campus/realtime?token=oops'},{CAMPUS_REALTIME_SIGNING_SECRET:'short'}])assert.equal(gatewayConfig({...env,...change}),null);
 assert.ok(gatewayConfig({...env,NODE_ENV:'production',CAMPUS_REALTIME_ENDPOINT:'https://example.test/api/campus/realtime'}));
});
