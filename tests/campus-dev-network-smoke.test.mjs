import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DEV_PROJECT, QA_PREFIX, validateNetworkSmokeConfig, runDevNetworkSmoke, verifyRealtimePair, realtimePermissionDenied, verifyQaCatalogIsolation, existingQaRecoveryAuthenticator } from '../integration/campus/dev-migrations/04-network-smoke.mjs';
const id=n=>QA_PREFIX+String(n).padStart(12,'0');
const roles=['owner','peer','otherCohort','refunded'];
const REUSE_ACTORS={owner:id(71),peer:id(72)}; // Synthetic fixture IDs, not deployed QA actors.
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
   if(u.pathname==='/api/platform'){assert.equal(new Headers(options.headers).has('Cookie'),false);const view=u.searchParams.get('view');if(view==='checkout')return json({user:null,data:{courses:[{id:id(10)}],cohorts:[{id:u.searchParams.get('cohort'),course_id:id(10),status:'closed',recruitment_end_at:'2020-01-01T00:00:00Z'}]}});return json({user:null,data:{courses:[]},pagination:{total:0}});}
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
 const bad=[c=>{c.execute=false;},c=>{c.mode='unknown';},c=>{c.mode='reuse-two';},c=>{c.projectRef='qitqxizuwmmlhlcgsrqe';},c=>{c.appOrigin='https://brandyaction-edu.com';},c=>{c.proof.notificationIsolationReviewed=false;},c=>{c.proof.verifiedAt='2020-01-01';},c=>{c.actors.owner.email='person@example.com';},c=>{c.actors.owner.id=id(99);},c=>{c.publishableKey='sb_secret_MUST_NOT_BE_USED_HERE';}];
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
 const c=configuration(),channels=[],removed=[];const clients=Object.fromEntries(roles.map(role=>[role,{auth:{getSession:async()=>({data:{session:{access_token:'MOCK_MEMORY_ONLY'}}})},realtime:{setAuth:async value=>assert.equal(value,'MOCK_MEMORY_ONLY'),disconnect:async()=>{removed.push(`socket:${role}`);return 'ok';},connectionState:()=> 'closed'},channel(topic,options){assert.equal(topic,`campus-space:${id(20)}:${id(1)}`);assert.equal(typeof options.config.private,'boolean');const ch={role,on(_kind,_filter,callback){this.callback=callback;return this;},subscribe(callback){queueMicrotask(()=>callback(['owner','peer'].includes(role)?'SUBSCRIBED':'CHANNEL_ERROR',new Error(`Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`)));return this;},async send(message){for(const other of channels)if(other.role==='peer')other.callback({payload:message.payload});return 'ok';}};channels.push(ch);return ch;},async removeChannel(ch){removed.push(ch.role);return 'ok';}}]));
 const anonymous={channel:clients.refunded.channel,removeChannel:async()=>{removed.push('anonymous');return 'ok';},realtime:{disconnect:async()=>{removed.push('socket:anonymous');return 'ok';},connectionState:()=> 'closed'}};const result=await verifyRealtimePair(clients,c.actors,id(600),anonymous);assert.deepEqual(result,{positiveDelivery:true,otherCohortDenied:true,refundedDenied:true,publicAnonymousIsolated:true,anonymousPrivateDenied:true});assert.ok(removed.includes('owner')&&removed.includes('peer')&&removed.includes('anonymous')&&removed.includes('otherCohort')&&removed.includes('refunded'));assert.equal(removed.filter(x=>x.startsWith('socket:')).length,5);
});

test('two existing synthetic actors use explicit verified CAS phases, isolated sessions and no password reset',async()=>{
 const h=harness(),c=h.c;c.mode='reuse-two';c.reuseActors=REUSE_ACTORS;c.proof.existingQaMetadataVerified=true;
 for(const role of roles){const a=c.actors[role];a.id=role==='owner'?REUSE_ACTORS.owner:REUSE_ACTORS.peer;a.enrollmentId=id(role==='owner'?31:32);a.email=`existing-qa-${role==='owner'?'owner':'peer'}@example.invalid`;delete a.password;}
 let phase='same';const changes=[];
 h.dependencies.authenticateExistingQa=async(_role,_actor,client)=>client.auth.signInWithPassword();
 h.dependencies.transitionPeer=async v=>{assert.equal(v.actorId,REUSE_ACTORS.peer);assert.equal(v.enrollmentId,id(32));assert.equal(v.expectedPhase,phase);changes.push(v.nextPhase);phase=v.nextPhase;return {phase,verified:true};};
 h.dependencies.verifyRealtime=async(_clients,_actors,_session,_anonymous,opts)=>{assert.equal(phase,'same');await opts.transitionPeer('foreign');await opts.transitionPeer('refunded');return {positiveDelivery:true,otherCohortDenied:true,refundedDenied:true,publicAnonymousIsolated:true,anonymousPrivateDenied:true};};
 // Use the actual owner-based path emitted by the API; the test fixture has no service credential.
 const original=h.dependencies.fetch;h.dependencies.fetch=async(url,options)=>{const r=await original(url,options);if(r.status===302){const loc=r.headers.get('location').replace(id(1),REUSE_ACTORS.owner);return new Response(null,{status:302,headers:{'cache-control':'private, no-store',location:loc}});}if(new URL(url).pathname==='/api/campus/community/files'&&typeof options.body==='string'&&JSON.parse(options.body).action==='prepare'){const b=await r.json();b.signedUrl=b.signedUrl.replace(id(1),REUSE_ACTORS.owner);return Response.json(b,{headers:{'cache-control':'private, no-store'}});}return r;};
 const result=await runDevNetworkSmoke(c,h.dependencies);assert.equal(result.status,'passed');assert.ok(result.checks.includes('two-reused-actors-four-isolated-auth-sessions'));assert.ok(changes.includes('foreign')&&changes.includes('refunded')&&changes.filter(x=>x==='same').length>=2);assert.equal(phase,'refunded');
});
test('existing QA recovery adapter never creates accounts, sends mail or resets passwords and rejects identity drift',async()=>{
 const actor={id:REUSE_ACTORS.owner,email:'known-qa@example.invalid'},actions=[];
 const admin={auth:{admin:{getUserById:async id=>{actions.push('get');return {data:{user:{id,email:actor.email,email_confirmed_at:'2026-10-30T00:00:00Z',phone:''}}};},generateLink:async options=>{assert.deepEqual(options,{type:'recovery',email:actor.email});actions.push('generate');return {data:{user:{id:actor.id},properties:{verification_type:'recovery',hashed_token:'MOCK_MEMORY_ONLY_HASH'}}};}}}};
 const client={auth:{verifyOtp:async options=>{actions.push('verify');assert.deepEqual(options,{type:'recovery',token_hash:'MOCK_MEMORY_ONLY_HASH'});return {data:{user:{id:actor.id}}};}}};
 await existingQaRecoveryAuthenticator(admin,REUSE_ACTORS)('owner',actor,client);assert.deepEqual(actions,['get','generate','verify']);
 await assert.rejects(existingQaRecoveryAuthenticator(admin,REUSE_ACTORS)('owner',{...actor,id:id(99)},client),/Unknown/);
 admin.auth.admin.getUserById=async()=>({data:{user:{id:actor.id,email:'unexpected@example.invalid'}}});await assert.rejects(existingQaRecoveryAuthenticator(admin,REUSE_ACTORS)('owner',actor,client),/drift/);
 admin.auth.admin.getUserById=async()=>({data:{user:{id:actor.id,email:actor.email,email_confirmed_at:null}}});await assert.rejects(existingQaRecoveryAuthenticator(admin,REUSE_ACTORS)('owner',actor,client),/drift/);assert.deepEqual(actions,['get','generate','verify']);
});

test('optional real-browser callback runs before cleanup, receives memory cookies only and must verify both UI and CORS',async()=>{
 for(const complete of [true,false]){const h=harness();let browserCalled=false;h.dependencies.verifyBrowser=async({actors,artifacts,getCookies})=>{browserCalled=true;assert.equal(h.read().cleanup,null);assert.equal(actors.owner.id,h.c.actors.owner.id);assert.deepEqual(artifacts.fileIds,[id(501)]);assert.ok(getCookies('owner').every(c=>c.url===h.c.appOrigin&&c.name==='qa-role'));assert.throws(()=>getCookies('unknown'));return {corsVerified:complete,uiVerified:true};};const result=await runDevNetworkSmoke(h.c,h.dependencies);assert.equal(browserCalled,true);assert.equal(result.status,complete?'passed':'failed');assert.equal(result.realBrowserCorsTested,complete);assert.equal(result.cleanup,'verified');if(!complete)assert.equal(result.failedStep,'browser');}
});

test('Realtime denial evidence excludes generic socket/server failures and expired JWTs',()=>{
 const topic='campus-space:synthetic:synthetic';assert.equal(realtimePermissionDenied(new Error('socket disconnected'),topic),false);assert.equal(realtimePermissionDenied(new Error('InvalidJWTToken: expired token'),topic),false);assert.equal(realtimePermissionDenied(new Error('Unauthorized'),topic),false);assert.equal(realtimePermissionDenied(new Error('This project only allows private channels'),topic),false);assert.equal(realtimePermissionDenied(new Error('This project only allows private channels'),topic,true),true);assert.equal(realtimePermissionDenied({cause:{reason:`Unauthorized: You do not have permissions to read from this Channel topic: ${topic}`}},topic),true);
});

test('anonymous catalog isolation rejects listed QA or a recruiting cohort using fresh route cache keys',async()=>{
 const c=configuration();for(const mode of ['listed','open','okay']){let calls=0;const fetcher=async(url,options)=>{calls++;const u=new URL(url);assert.ok(u.searchParams.get('filter').startsWith('qa-isolation-'));assert.equal(new Headers(options.headers).has('Cookie'),false);const checkout=u.searchParams.get('view')==='checkout';return Response.json(checkout?{user:null,data:{courses:[{id:id(10)}],cohorts:[{id:u.searchParams.get('cohort'),course_id:id(10),status:mode==='open'?'recruiting':'closed',recruitment_end_at:'2020-01-01T00:00:00Z'}]}}:{user:null,data:{courses:mode==='listed'?[{id:id(10)}]:[]},pagination:{total:mode==='listed'?1:0}});};if(mode==='okay'){assert.deepEqual(await verifyQaCatalogIsolation(c,fetcher),{anonymous:true,listed:false,salesClosed:true});assert.equal(calls,4);}else await assert.rejects(verifyQaCatalogIsolation(c,fetcher),/publicly listed|sales scope/);}
});

test('Realtime channel or socket cleanup failure is never reported as verified and all sockets are attempted',async()=>{
 const c=configuration();for(const mode of ['remove-timeout','socket-timeout']){const disconnected=[];const make=role=>({auth:{getSession:async()=>({data:{session:{access_token:'MOCK_MEMORY_ONLY'}}})},realtime:{setAuth:async()=>{},disconnect:async()=>{disconnected.push(role);return mode==='socket-timeout'?'timeout':'ok';},connectionState:()=> 'closed'},channel(){return {on(){return this;},subscribe(callback){queueMicrotask(()=>callback('CHANNEL_ERROR',new Error('transport unavailable')));return this;}};},removeChannel:async()=>mode==='remove-timeout'?'timed out':'ok'});const clients=Object.fromEntries(roles.map(role=>[role,make(role)]));await assert.rejects(verifyRealtimePair(clients,c.actors,id(600),make('anonymous')),error=>error.qaCleanupUnverified===true);assert.deepEqual(disconnected.sort(),[...roles,'anonymous'].sort());}
 const h=harness();h.dependencies.verifyRealtime=async()=>{throw Object.assign(new Error('do not log raw SDK cause'),{qaCleanupUnverified:true});};const result=await runDevNetworkSmoke(h.c,h.dependencies);assert.equal(result.status,'failed');assert.equal(result.failedStep,'realtime');assert.equal(result.cleanup,'unverified');assert.ok(h.read().cleanup,'artifact cleanup still runs');
});
