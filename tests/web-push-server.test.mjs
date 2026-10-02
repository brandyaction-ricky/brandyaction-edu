import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import ts from 'typescript';
import webpush from 'web-push';
const require=createRequire(import.meta.url), pair=webpush.generateVAPIDKeys(), curve=createECDH('prime256v1');curve.generateKeys();
const endpoint='https://fcm.googleapis.com/fcm/send/synthetic-secret';
const subscription={endpoint,p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};
const env={EDU_WEB_PUSH_ENABLED:'true',NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED:'true',EDU_WEB_PUSH_PUBLIC_KEY:pair.publicKey,EDU_WEB_PUSH_PRIVATE_KEY:pair.privateKey,EDU_WEB_PUSH_SUBJECT:'mailto:fixture@example.test'};
function module(path,mocks={},environment=env){const exports={};const code=ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('exports','require','process',code)(exports,n=>n in mocks?mocks[n]:require(n),{env:environment});return exports;}
const load=(environment=env)=>module('lib/web-push-server.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient(){throw Error('Unexpected live DB access');}}},environment);
test('configuration fails closed for missing flags or mismatched keys and never calls DB or transport',async()=>{
 for(const change of [{EDU_WEB_PUSH_ENABLED:'false'},{NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED:'false'},{EDU_WEB_PUSH_PRIVATE_KEY:'invalid'},{EDU_WEB_PUSH_PUBLIC_KEY:webpush.generateVAPIDKeys().publicKey},{EDU_WEB_PUSH_SUBJECT:'http://invalid.test'}]){const api=load({...env,...change});assert.equal(api.pushConfiguration(),null);assert.deepEqual(await api.dispatchWebPush(),{enabled:false,claimed:0,sent:0,deferred:0});}
 assert.equal(load().pushConfiguration().publicKey,pair.publicKey);
});
test('subscriptions require canonical known HTTPS push hosts and a valid curve key',()=>{
 const api=load();assert.deepEqual(api.validatePushSubscription(subscription),subscription);
 for(const url of ['https://updates.push.services.mozilla.com/wpush/v2/synthetic','https://web.push.apple.com/synthetic'])assert.equal(api.validatePushEndpoint(url),url);
 for(const url of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/fcm/send/x','https://fcm.googleapis.com.evil.test/fcm/send/x','https://user@fcm.googleapis.com/fcm/send/x','https://fcm.googleapis.com:8443/fcm/send/x','https://fcm.googleapis.com/fcm/send/x#secret','https://fcm.googleapis.com/other','https://FCM.googleapis.com/fcm/send/x','https://fcm.googleapis.com/fcm/send/../x'])assert.throws(()=>api.validatePushEndpoint(url),/PUSH_INVALID/);
 for(const change of [{p256dh:'A'.repeat(87)},{auth:'A'.repeat(21)},{p256dh:subscription.p256dh+'='},{endpoint:'https://private.test'}])assert.throws(()=>api.validatePushSubscription({...subscription,...change}),/PUSH_INVALID/);
});
function dispatcher(statuses){const calls=[],sent=[],jobs=statuses.map(()=>({id:randomUUID(),lease:randomUUID()})),events=jobs.map(()=>randomUUID()),binding=randomUUID();const dependencies={rpc:async(name,args)=>{calls.push({name,args});if(name==='edu_claim_push')return{data:jobs,error:null};if(name==='edu_read_push_delivery'){const n=jobs.findIndex(j=>j.id===args.p_id);return{data:statuses[n]==='stale'?null:{...jobs[n],...subscription,eventId:events[n],binding,path:statuses[n]==='bad-path'?'https://external.test':'/my/questions'},error:null};}return{data:true,error:null};},send:async(sub,payload,options)=>{const data=JSON.parse(payload),n=events.indexOf(data.eventId);sent.push({sub,data,options});if(statuses[n]!==201)throw Object.assign(Error('SECRET PROVIDER DETAILS'),{statusCode:statuses[n]});return{statusCode:201,body:'',headers:{}};}};return{calls,sent,dependencies};}
test('dispatcher encrypts no private text, sends only current bindings and records bounded provider outcomes',async()=>{
 const h=dispatcher([201,410,404,429,503,401,undefined,'stale','bad-path']);const result=await load().dispatchWebPush(h.dependencies);assert.equal(result.sent,1);assert.equal(h.sent.length,7);
 assert.ok(h.sent.every(({data})=>Object.keys(data).sort().join(',')==='binding,eventId,path,version'));
 assert.deepEqual(h.calls.filter(c=>c.name==='edu_finish_push').map(c=>c.args.p_outcome).sort(),['sent','expired','expired','retry','retry','failed','retry','skipped','failed'].sort());
 assert.doesNotMatch(JSON.stringify(h.calls),/SECRET PROVIDER|synthetic-secret/);
 const first=h.sent[0],request=webpush.generateRequestDetails(first.sub,JSON.stringify(first.data),first.options);assert.ok(Buffer.isBuffer(request.body));assert.ok(request.body.length>JSON.stringify(first.data).length);assert.equal(request.headers.TTL,86400);
});
test('transport completion waits for other workers after a queue failure and returns only a redacted error',async()=>{
 const h=dispatcher([201,201]);const rpc=h.dependencies.rpc;h.dependencies.rpc=async(name,args)=>name==='edu_finish_push'&&args.p_id===h.calls.find(c=>c.name==='edu_read_push_delivery')?.args.p_id?{data:null,error:Error('DATABASE SECRET')}:rpc(name,args);
 await assert.rejects(()=>load().dispatchWebPush(h.dependencies),e=>e.message==='Push queue unavailable');assert.equal(h.sent.length,2);
});
function route({user={id:randomUUID()},config=true,control=true,error=null}={}){const calls=[];const server=load();const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled:control},error})})})}),rpc:async(name,args)=>{calls.push({name,args});return{data:{enabled:true,binding:randomUUID()},error};}};const api=module('app/api/member/push/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/web-push-server':{...server,pushConfiguration:()=>config?server.pushConfiguration():null}});const post=(body,origin='https://edu.test')=>api.POST(new Request('https://edu.test/api/member/push',{method:'POST',headers:{origin},body:typeof body==='string'?body:JSON.stringify(body)}));return{api,post,calls,user};}
test('member API uses authenticated actor, exposes only public key and allows revocation while paused',async()=>{
 const h=route(),get=await h.api.GET();assert.deepEqual(await get.json(),{enabled:true,publicKey:pair.publicKey});assert.equal(get.headers.get('cache-control'),'private, no-store');
 assert.equal((await h.post({...subscription,action:'subscribe',actor:randomUUID()})).status,200);assert.equal(h.calls[0].args.p_actor,h.user.id);
 const off=route({config:false});assert.deepEqual(await(await off.api.GET()).json(),{enabled:false});assert.equal((await off.post({...subscription,action:'subscribe'})).status,409);assert.equal(off.calls.length,0);assert.equal((await off.post({endpoint,action:'unsubscribe'})).status,200);assert.equal(off.calls[0].args.p_disable,true);
});
test('API rejects unauthenticated, cross-origin, malformed and oversized requests without secret disclosure',async()=>{
 const h=route();assert.equal((await h.post({action:'subscribe'},'https://attacker.test')).status,403);
 for(const body of [null,[],{},'{',{action:'subscribe',...subscription,p256dh:'bad'},{action:'status',endpoint:'https://127.0.0.1'}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post('x'.repeat(8001))).status,413);assert.equal(h.calls.length,0);
 const guest=route({user:null});assert.equal((await guest.api.GET()).status,401);assert.equal((await guest.post({action:'status',endpoint})).status,401);
 const fail=route({error:{message:'secret endpoint credential'}});const r=await fail.api.GET();assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret endpoint/);
});
test('cron requires an exact configured secret and never discloses queue/transport details',async()=>{
 let calls=0;const api=module('app/api/cron/push/route.ts',{'@/lib/web-push-server':{dispatchWebPush:async()=>{calls++;throw Error('SECRET ENDPOINT');}}},{CRON_SECRET:'synthetic-only'});
 const get=token=>api.GET(new Request('https://edu.test/api/cron/push',{headers:{authorization:token}}));
 assert.equal((await get('Bearer wrong')).status,401);assert.equal(calls,0);const r=await get('Bearer synthetic-only');assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET ENDPOINT/);assert.equal(calls,1);
});
