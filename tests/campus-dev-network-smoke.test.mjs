import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DEV_PROJECT, QA_PREFIX, validateNetworkSmokeConfig, runDevNetworkSmoke, verifyRealtimePair } from '../integration/campus/dev-migrations/04-network-smoke.mjs';
const id=n=>QA_PREFIX+String(n).padStart(12,'0');
const roles=['owner','peer','otherCohort','refunded'];
const configuration=()=>({execute:true,projectRef:DEV_PROJECT,supabaseUrl:`https://${DEV_PROJECT}.supabase.co`,appOrigin:'https://brandyaction-edu-dev.vercel.app',publishableKey:'sb_publishable_FAKE_LOCAL_QA_ONLY',proof:{appProjectRef:DEV_PROJECT,fixture:'campus-network-qa-20261103',sourceSha:'a'.repeat(40),verifiedAt:new Date().toISOString(),notificationIsolationReviewed:true,freshActorsOnly:true,migrationChecksPassed:true,realtimePrivateChannelsReviewed:true},actors:Object.fromEntries(roles.map((role,i)=>[role,{id:id(i+1),enrollmentId:id(31+i),cohortId:id(role==='otherCohort'?21:20),email:`campus-network-qa-20261103-${i+1}@example.invalid`,password:'MOCK-ONLY-NOT-A-REAL-PASSWORD-2026'}]))});
function harness({failUpload=false,wrongStorage=false,cleanupOkay=true}={}){
 const c=configuration();let currentRole=0,shared=false,postVisibility='private',postRevision=0,blob=null,cleanup=null,rtCalls=0;const calls=[];
 const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store'}});
 const filePath=`${id(1)}/${id(500)}/${id(501)}`;
 const dependencies={
  createServerClient(_url,_key,opts){const role=roles[currentRole++];return {auth:{signInWithPassword:async()=>{opts.cookies.setAll([{name:'qa-role',value:role}]);return {data:{user:{id:c.actors[role].id}}};},getUser:async()=>({data:{user:{id:c.actors[role].id}}}),signOut:async()=>({})}};},
  async fetch(input,options={}){
   const u=new URL(input);const role=decodeURIComponent(new Headers(options.headers).get('cookie')?.split('=')[1]??'');const body=options.body&&typeof options.body==='string'?JSON.parse(options.body):null;calls.push({path:u.pathname,method:options.method??'GET',role});
   if(u.hostname===`${DEV_PROJECT}.supabase.co`){if(options.method==='PUT'){if(failUpload)throw Error('DO NOT EXPOSE SECRET SignedURL token');blob=new Uint8Array(options.body);return new Response('{}');}return new Response(blob);}
   if(u.pathname==='/api/campus/community'){
    if(!role)return json({},401);
    if(body.action==='create'){postRevision=1;return json({postId:body.requestId,revision:1});}
    if(body.action==='revise'){postVisibility=body.visibility;postRevision++;if(postVisibility==='private')shared=false;return json({postId:body.postId,revision:postRevision});}
   }
   if(u.pathname==='/api/campus/community/files'){
    if(!role)return json({},401);
    if(u.searchParams.has('postId'))return json({},403);
    if(u.searchParams.has('fileId')){
     if(role==='owner'||role==='peer'&&shared&&postVisibility==='cohort')return new Response(null,{status:302,headers:{'cache-control':'private, no-store',location:`https://${DEV_PROJECT}.supabase.co/storage/v1/object/sign/campus-portfolio-private/${filePath}?token=MOCK_ONLY`}});
     return json({},403);
    }
    if(body.action==='prepare')return json({id:id(501),contentType:'image/png',ready:false,visibility:'private',signedUrl:`https://${wrongStorage?'qitqxizuwmmlhlcgsrqe':DEV_PROJECT}.supabase.co/storage/v1/object/upload/sign/campus-portfolio-private/${filePath}?token=MOCK_ONLY`});
    if(body.action==='complete')return json({ready:true});
    if(body.action==='share'){if(body.visibility==='cohort'&&!body.confirmed)return json({},400);shared=body.visibility==='cohort';return json({});}
   }
   if(u.pathname==='/api/campus/space'){if(role==='otherCohort'||role==='refunded')return json({},403);return json({peers:[]});}
   throw Error('UNEXPECTED MOCK PATH');
  },
  async verifyRealtime(){rtCalls++;return {positiveDelivery:true,otherCohortDenied:true,refundedDenied:true,publicAnonymousIsolated:true,anonymousPrivateDenied:true};},
  async cleanupArtifacts(ledger){cleanup=ledger;return {storageRemoved:cleanupOkay,qaAccessRevoked:cleanupOkay};}
 };
 return {c,dependencies,read:()=>({calls,cleanup,rtCalls,shared})};
}
test('network smoke is inert on CLI and rejects unsafe targets/proofs/credentials before any I/O',async()=>{
 const stdout=execFileSync(process.execPath,['integration/campus/dev-migrations/04-network-smoke.mjs'],{encoding:'utf8'});assert.equal(JSON.parse(stdout).status,'prepared-not-executed');
 const bad=[c=>{c.execute=false;},c=>{c.projectRef='qitqxizuwmmlhlcgsrqe';},c=>{c.appOrigin='https://brandyaction-edu.com';},c=>{c.proof.notificationIsolationReviewed=false;},c=>{c.proof.verifiedAt='2020-01-01';},c=>{c.actors.owner.email='person@example.com';},c=>{c.actors.owner.id=id(99);},c=>{c.publishableKey='sb_secret_MUST_NOT_BE_USED_HERE';}];
 for(const mutate of bad){const c=configuration();mutate(c);assert.throws(()=>validateNetworkSmokeConfig(c));let contacted=false;await assert.rejects(runDevNetworkSmoke(c,{fetch:()=>{contacted=true;},cleanupArtifacts:async()=>({})}));assert.equal(contacted,false);}
 assert.equal(validateNetworkSmokeConfig(configuration()).projectRef,DEV_PROJECT);
});
test('mock network smoke follows real API boundaries, exact Storage bytes and explicit share/revocation, then exact cleanup',async()=>{
 const h=harness();const result=await runDevNetworkSmoke(h.c,h.dependencies);assert.equal(result.status,'passed');assert.equal(result.cleanup,'verified');assert.equal(result.realBrowserCorsTested,false);assert.equal(result.checks.length,6);
 const {calls,cleanup,rtCalls,shared}=h.read();assert.equal(rtCalls,1);assert.equal(shared,false);assert.deepEqual(cleanup.fileIds,[id(501)]);assert.deepEqual(cleanup.postIds,[id(500)]);assert.equal(cleanup.spaceSessions.length,2);assert.ok(calls.length<45);assert.ok(calls.every(c=>c.path.startsWith('/api/campus/')||c.path.startsWith('/storage/v1/object/')));assert.ok(!JSON.stringify(result).includes('PASSWORD'));assert.ok(!JSON.stringify(result).includes('token='));
});
test('mid-flight failures never expose errors, never follow a production Storage URL and still clean exact artifacts',async()=>{
 for(const flags of [{failUpload:true},{wrongStorage:true}]){const h=harness(flags);const r=await runDevNetworkSmoke(h.c,h.dependencies);assert.equal(r.status,'failed');assert.equal(r.failedStep,'storage-upload');assert.equal(r.cleanup,'verified');assert.equal(h.read().rtCalls,0);assert.ok(!JSON.stringify(r).includes('SECRET'));assert.deepEqual(h.read().cleanup.fileIds,[id(501)]);}
 const h=harness({cleanupOkay:false});const r=await runDevNetworkSmoke(h.c,h.dependencies);assert.equal(r.status,'failed');assert.equal(r.cleanup,'unverified');
});
test('Realtime uses private topics, a real positive delivery assertion and explicit foreign denial; closes all channels',async()=>{
 const c=configuration(),channels=[],removed=[];const clients=Object.fromEntries(roles.map(role=>[role,{auth:{getSession:async()=>({data:{session:{access_token:'MOCK_MEMORY_ONLY'}}})},realtime:{setAuth:async value=>assert.equal(value,'MOCK_MEMORY_ONLY')},channel(topic,options){assert.equal(topic,`campus-space:${id(20)}:${id(1)}`);assert.equal(typeof options.config.private,'boolean');const ch={role,on(_kind,_filter,callback){this.callback=callback;return this;},subscribe(callback){queueMicrotask(()=>callback(['owner','peer'].includes(role)?'SUBSCRIBED':'CHANNEL_ERROR'));return this;},async send(message){for(const other of channels)if(other.role==='peer')other.callback({payload:message.payload});return 'ok';}};channels.push(ch);return ch;},async removeChannel(ch){removed.push(ch.role);}}]));
 const anonymous={channel:clients.refunded.channel,removeChannel:async()=>removed.push('anonymous')};const result=await verifyRealtimePair(clients,c.actors,id(600),anonymous);assert.deepEqual(result,{positiveDelivery:true,otherCohortDenied:true,refundedDenied:true,publicAnonymousIsolated:true,anonymousPrivateDenied:true});assert.ok(removed.includes('owner')&&removed.includes('peer')&&removed.includes('anonymous')&&removed.includes('otherCohort')&&removed.includes('refunded'));
});
