/** Prepared, never auto-executed. Imports do not read credentials or contact a server.
 * Provisioning is deliberately separate: CRM notification safety must be reviewed first.
 * Secrets, cookies, signed URLs and payload bodies must remain in caller memory.
 */
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServerClient } from '@supabase/ssr';

export const DEV_PROJECT='vjmjhaidlqkmascdjocw';
export const QA_PREFIX='f04c2026-1103-4000-8000-';
const roles=['owner','peer','otherCohort','refunded'];
export const REUSE_ACTORS={owner:'652dea72-5e32-415b-9e4f-4db8013fc770',peer:'2561a4d5-2486-4ddc-9e28-9e9683f5e9af'};
const fixture='campus-network-qa-20261103';
const bucket='campus-portfolio-private';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV9sAAAAASUVORK5CYII=','base64');
const assert=(ok,label)=>{if(!ok)throw new Error(label);};
const qaId=n=>QA_PREFIX+String(n).padStart(12,'0');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateNetworkSmokeConfig(c){
 assert(c?.execute===true,'Execution was not explicitly enabled');
 assert(c.projectRef===DEV_PROJECT&&c.supabaseUrl===`https://${DEV_PROJECT}.supabase.co`,'DEV target mismatch');
 const app=new URL(c.appOrigin);
 assert(app.origin===c.appOrigin&&app.protocol==='https:'&&!app.username&&!app.password,'Invalid DEV app origin');
 assert(app.hostname==='brandyaction-edu-dev.vercel.app'||/^brandyaction-edu-dev-[a-z0-9-]+\.vercel\.app$/.test(app.hostname),'Only verified DEV app origins are allowed');
 assert(c.proof?.appProjectRef===DEV_PROJECT&&c.proof?.fixture===fixture&&/^[a-f0-9]{40}$/.test(c.proof?.sourceSha??''),'Missing app/fixture/source verification');
 assert(c.proof?.notificationIsolationReviewed===true&&(c.mode==='reuse-two'?c.proof?.existingQaMetadataVerified===true:c.proof?.freshActorsOnly===true)&&c.proof?.migrationChecksPassed===true&&c.proof?.realtimePrivateChannelsReviewed===true,'Provisioning safety proof missing');
 assert(Date.now()-Date.parse(c.proof?.verifiedAt)<15*60*1000&&Date.parse(c.proof?.verifiedAt)<=Date.now()+5000,'Preflight proof expired');
 assert(typeof c.publishableKey==='string'&&c.publishableKey.length>20,'Public API key missing');
 if(!c.publishableKey.startsWith('sb_publishable_')){let claims;try{claims=JSON.parse(Buffer.from(c.publishableKey.split('.')[1],'base64url').toString());}catch{}assert(claims?.role==='anon'&&(!claims.ref||claims.ref===DEV_PROJECT),'Only the DEV public/anon key may be used');}
 const ids=[];for(const [i,role]of roles.entries()){
  const a=c.actors?.[role];const expectedId=c.mode==='reuse-two'?(role==='owner'?REUSE_ACTORS.owner:REUSE_ACTORS.peer):qaId(i+1);const expectedEnrollment=c.mode==='reuse-two'?qaId(role==='owner'?31:32):qaId(31+i);assert(a?.id===expectedId&&a.enrollmentId===expectedEnrollment,'Actor is outside the fixed QA namespace');
  assert(a.cohortId===qaId(role==='otherCohort'?21:20),'QA cohort mismatch');
  assert(c.mode==='reuse-two'?(typeof a.email==='string'&&a.email.endsWith('@example.invalid')&&!a.password):(a.email===`${fixture}-${i+1}@example.invalid`&&typeof a.password==='string'&&a.password.length>=24),'Only synthetic credentials are allowed');ids.push(a.id);
 }
 assert(new Set(ids).size===(c.mode==='reuse-two'?2:4),'QA actor identities mismatch');return c;
}
function signedUrl(value,kind,path){
 const u=new URL(value);assert(u.origin===`https://${DEV_PROJECT}.supabase.co`&&u.pathname===`/storage/v1/object/${kind}/${bucket}/${path}`,'Storage target mismatch');return u.href;
}
async function subscribe(channel,expected){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Realtime authorization timed out; inconclusive')),12000);
  channel.subscribe(status=>{
   if(status==='SUBSCRIBED'){clearTimeout(timer);if(expected)resolve();else reject(new Error('Foreign Realtime subscription unexpectedly admitted'));}
   else if(status==='CHANNEL_ERROR'){clearTimeout(timer);if(!expected)resolve();else reject(new Error('Authorized Realtime subscription rejected'));}
   else if(status==='TIMED_OUT'){clearTimeout(timer);reject(new Error('Realtime timed out; not denial evidence'));}
  });
 });
}
export async function verifyRealtimePair(clients,actors,sessionId,anonymous,options={}){
 assert(anonymous,'Independent anonymous Realtime client required');
 const topic=`campus-space:${actors.owner.cohortId}:${actors.owner.id}`;
 const channels=[];let received,publicLeaked=false;
 try{
  for(const role of roles){const result=await clients[role].auth.getSession();assert(!result.error&&result.data?.session?.access_token,'Realtime session unavailable');await clients[role].realtime.setAuth(result.data.session.access_token);}
  const own=clients.owner.channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});channels.push([clients.owner,own]);
  const peer=clients.peer.channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});channels.push([clients.peer,peer]);
  const nonce=randomUUID();
  // A separate public channel must never receive traffic from the private topic.
  // The SDK de-duplicates identical topic names per client, so remove public probes
  // before reusing that client's topic for private-denial checks below.
  const publicProbes=[];
  for(const client of [clients.otherCohort,anonymous]){
   const probe=client.channel(topic,{config:{private:false,broadcast:{ack:true,self:false}}});channels.push([client,probe]);publicProbes.push([client,probe]);
   probe.on('broadcast',{event:'move'},({payload})=>{if(payload?.qaNonce===nonce)publicLeaked=true;});
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Public probe timed out; inconclusive')),12000);probe.subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR'].includes(status)){clearTimeout(timer);resolve();}else if(status==='TIMED_OUT'){clearTimeout(timer);reject(new Error('Public probe timed out; inconclusive'));}});});
  }
  let deliveryTimer,resolveDelivery;const delivery=new Promise(resolve=>{resolveDelivery=resolve;});received={resolve:value=>resolveDelivery(value),cancel:()=>clearTimeout(deliveryTimer)};
  peer.on('broadcast',{event:'move'},({payload})=>{if(payload?.qaNonce===nonce)received.resolve(payload);});
  await Promise.all([subscribe(own,true),subscribe(peer,true)]);
  const sent=await own.send({type:'broadcast',event:'move',payload:{sessionId,seq:0,x:12,y:8.8,sitting:false,qaNonce:nonce}});assert(sent==='ok','Authorized Realtime send failed');
  const actual=await Promise.race([delivery,new Promise((_,reject)=>{deliveryTimer=setTimeout(()=>reject(new Error('Authorized Realtime delivery missing')),12000);})]);clearTimeout(deliveryTimer);assert(actual.sessionId===sessionId&&actual.x===12,'Realtime payload mismatch');
  await new Promise(resolve=>setTimeout(resolve,1000));assert(!publicLeaked,'Private broadcast reached a public or anonymous channel');
  for(const [client,probe]of publicProbes)await client.removeChannel(probe);
  await clients.peer.removeChannel(peer);
  for(const role of ['otherCohort','refunded']){if(options.transitionPeer)await options.transitionPeer(role==='otherCohort'?'foreign':'refunded');const foreign=clients[role].channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});channels.push([clients[role],foreign]);await subscribe(foreign,false);}
  const anonPrivate=anonymous.channel(topic,{config:{private:true,broadcast:{ack:true,self:false}}});channels.push([anonymous,anonPrivate]);await subscribe(anonPrivate,false);
  return {positiveDelivery:true,otherCohortDenied:true,refundedDenied:true,publicAnonymousIsolated:true,anonymousPrivateDenied:true};
 }finally{received?.cancel();await Promise.allSettled(channels.map(([client,channel])=>client.removeChannel(channel)));}
}
/** Admin magiclink generation does not send mail; ordinary profile hooks must still be reviewed. */
export function existingQaMagiclinkAuthenticator(admin){
 return async(_role,actor,client)=>{
  assert(Object.values(REUSE_ACTORS).includes(actor.id)&&actor.email.endsWith('@example.invalid'),'Unknown existing QA actor');
  const current=await admin.auth.admin.getUserById(actor.id);assert(!current.error&&current.data?.user?.id===actor.id&&current.data.user.email===actor.email&&!current.data.user.phone,'Existing QA identity drift');
  const generated=await admin.auth.admin.generateLink({type:'magiclink',email:actor.email});
  assert(!generated.error&&generated.data?.user?.id===actor.id&&generated.data.properties?.verification_type==='magiclink'&&generated.data.properties.hashed_token,'QA session generation failed');
  return client.auth.verifyOtp({type:'magiclink',token_hash:generated.data.properties.hashed_token});
 };
}
/**
 * Required cleanupArtifacts callback is an operator-owned, exact-ID cleanup plan.
 * It must remove ONLY this run's Storage objects through Storage API and verify
 * access revoked / QA actors disabled; it must never mutate Storage.objects SQL.
 * prepareActors/createUser are intentionally absent from this runner.
 */
export async function runDevNetworkSmoke(input,dependencies={}){
 const c=validateNetworkSmokeConfig(input);
 assert(typeof dependencies.cleanupArtifacts==='function','Exact-artifact cleanup is required');
 if(c.mode==='reuse-two')assert(typeof dependencies.authenticateExistingQa==='function'&&typeof dependencies.transitionPeer==='function','Existing QA authentication and CAS transitions are required');
 const request=dependencies.fetch??fetch,clientFactory=dependencies.createServerClient??createServerClient;
 const cleanup=dependencies.cleanupArtifacts,rt=dependencies.verifyRealtime??verifyRealtimePair;
 const clients={},jars={},checks=[],artifacts={fixture,postIds:[],fileIds:[],spaceSessions:[]};let step='authentication',failedStep=null,cleanupOkay=false;
 const result={status:'prepared',checks,failedStep:null,cleanup:'not-started',realBrowserCorsTested:false};
 const mark=label=>checks.push(label);let peerPhase='same';
 const transitionPeer=async phase=>{if(c.mode!=='reuse-two'||phase===peerPhase)return;const outcome=await dependencies.transitionPeer({actorId:REUSE_ACTORS.peer,enrollmentId:qaId(32),expectedPhase:peerPhase,nextPhase:phase,cohortId:qaId(phase==='foreign'?21:20)});assert(outcome?.verified===true&&outcome.phase===phase,'QA peer transition was not verified');peerPhase=phase;};
 const appRequest=async(role,path,body,expected=200)=>{
  if(c.mode==='reuse-two'&&role&&role!=='owner'&&body?.kind!=='leave')await transitionPeer(role==='peer'?'same':role==='otherCohort'?'foreign':'refunded');
  assert(path.startsWith('/api/campus/')&&!path.includes('://'),'Unexpected application path');
  const headers={Origin:c.appOrigin,'Content-Type':'application/json'};
  if(role)headers.Cookie=[...jars[role]].map(([name,value])=>`${name}=${encodeURIComponent(value)}`).join('; ');
  const r=await request(c.appOrigin+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(15000)});
  assert(r.status===expected,`Application status mismatch in ${step}`);
  assert((r.headers.get('cache-control')??'').includes('no-store'),'No-store header missing');
  if(expected===302)return r.headers.get('location');
  if(expected!==200){await r.body?.cancel();return null;}
  const text=await r.text();assert(text.length<1000000,'Unexpected response size');return JSON.parse(text);
 };
 try{
  for(const role of roles){
   const a=c.actors[role],jar=new Map();jars[role]=jar;
   const client=clientFactory(c.supabaseUrl,c.publishableKey,{auth:{autoRefreshToken:false,detectSessionInUrl:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const v of values)if(v.value)jar.set(v.name,v.value);else jar.delete(v.name);}}});clients[role]=client;
   const login=c.mode==='reuse-two'?await dependencies.authenticateExistingQa(role,a,client):await client.auth.signInWithPassword({email:a.email,password:a.password});assert(!login.error&&login.data?.user?.id===a.id,'QA password authentication failed');
   const current=await client.auth.getUser();assert(!current.error&&current.data?.user?.id===a.id,'QA authenticated user mismatch');assert(jar.size>0,'SSR auth cookie absent');
  }mark(c.mode==='reuse-two'?'two-reused-actors-four-isolated-auth-sessions':'four-real-auth-sessions');
  step='anonymous-api';await appRequest(null,`/api/campus/community?enrollmentId=${c.actors.owner.enrollmentId}`,undefined,401);mark('anonymous-api-denied');
  step='portfolio-private';
  const postId=qaId(500);artifacts.postIds.push(postId);
  const post={requestId:postId,enrollmentId:c.actors.owner.enrollmentId,action:'create',kind:'portfolio',title:'DEV NETWORK QA ONLY',body:'Synthetic screenshot and authorization verification. No real customer or student data.',alias:'QA ONLY',url:'',imageUrls:[],lessonId:null,visibility:'private'};
  const created=await appRequest('owner','/api/campus/community',post);assert(created.postId===postId&&created.revision===1,'Created QA post mismatch');
  await appRequest('peer',`/api/campus/community/files?postId=${postId}`,undefined,403);mark('private-portfolio-peer-denied');
  step='storage-upload';const file=await appRequest('owner','/api/campus/community/files',{action:'prepare',postId,expectedRevision:1,requestId:qaId(501),name:'DEV-QA-ONLY.png',size:png.length});
  assert(file.id===qaId(501)&&file.contentType==='image/png'&&file.ready===false&&file.visibility==='private','Prepared file mismatch');artifacts.fileIds.push(file.id);const storagePath=`${c.actors.owner.id}/${postId}/${file.id}`;
  const uploaded=await request(signedUrl(file.signedUrl,'upload/sign',storagePath),{method:'PUT',headers:{'Content-Type':'image/png','x-upsert':'false'},body:png,redirect:'manual',signal:AbortSignal.timeout(15000)});assert(uploaded.ok,'Signed upload failed');await uploaded.body?.cancel();
  const complete=await appRequest('owner','/api/campus/community/files',{action:'complete',fileId:file.id});assert(complete.ready===true,'Server file verification failed');
  const download=async role=>{const url=await appRequest(role,`/api/campus/community/files?fileId=${file.id}`,undefined,302);const r=await request(signedUrl(url,'sign',storagePath),{redirect:'manual',signal:AbortSignal.timeout(15000)});assert(r.ok,'Signed download failed');const bytes=new Uint8Array(await r.arrayBuffer());assert(digest(bytes)===digest(png),'Uploaded/downloaded bytes differ');};
  await download('owner');mark('real-storage-upload-server-verification-download');
  step='share-boundaries';
  const revision=async(expectedRevision,visibility,id)=>appRequest('owner','/api/campus/community',{...post,action:'revise',requestId:qaId(id),postId,expectedRevision,visibility,changeNote:'QA changes only the sharing scope.'});
  await revision(1,'cohort',502);
  await appRequest('peer',`/api/campus/community/files?fileId=${file.id}`,undefined,403);
  const share=(expectedRevision,visibility,id,confirmed=true)=>appRequest('owner','/api/campus/community/files',{action:'share',fileId:file.id,requestId:qaId(id),expectedRevision,visibility,confirmed},confirmed||visibility==='private'?200:400);
  await share(1,'cohort',503,false);await share(1,'cohort',504);await download('peer');
  for(const role of ['otherCohort','refunded',null])await appRequest(role,`/api/campus/community/files?fileId=${file.id}`,undefined,role?403:401);
  await share(2,'private',505);await appRequest('peer',`/api/campus/community/files?fileId=${file.id}`,undefined,403);
  await share(3,'cohort',506);await revision(2,'private',507);await appRequest('peer',`/api/campus/community/files?fileId=${file.id}`,undefined,403);mark('explicit-share-cohort-refund-anon-and-revocation');
  step='space-api';const profile={nickname:'QA ONLY',gender:'male',coat:'#527086',status:'quiet',lowMotion:true,photoOptIn:false,note:'',desk:'',accessory:'none',deskTheme:'orbital'};
  for(const [i,role]of ['owner','peer'].entries()){const sessionId=qaId(600+i);artifacts.spaceSessions.push({role,sessionId});await appRequest(role,'/api/campus/space',{kind:'join',cohortId:c.actors.owner.cohortId,sessionId,profile});}
  for(const role of ['otherCohort','refunded'])await appRequest(role,`/api/campus/space?cohortId=${c.actors.owner.cohortId}`,undefined,403);
  step='realtime';await transitionPeer('same');const anonymous=clientFactory(c.supabaseUrl,c.publishableKey,{auth:{autoRefreshToken:false,detectSessionInUrl:false},cookies:{getAll:()=>[],setAll:()=>{}}});const real=await rt(clients,c.actors,qaId(600),anonymous,{transitionPeer:c.mode==='reuse-two'?transitionPeer:undefined});assert(real.positiveDelivery&&real.otherCohortDenied&&real.refundedDenied&&real.publicAnonymousIsolated&&real.anonymousPrivateDenied,'Realtime verification incomplete');mark('real-private-broadcast-peer-and-foreign-denial');
 }catch{failedStep=step;}
 finally{
  let left=true;for(const {role,sessionId}of artifacts.spaceSessions){try{await appRequest(role,'/api/campus/space',{kind:'leave',cohortId:c.actors.owner.cohortId,sessionId});}catch{left=false;}}
  for(const role of Object.keys(clients)){try{const out=await clients[role].auth.signOut({scope:'local'});if(out.error)left=false;}catch{left=false;}jars[role]?.clear();}
  try{const outcome=await cleanup(structuredClone(artifacts));cleanupOkay=left&&outcome?.storageRemoved===true&&outcome?.qaAccessRevoked===true;}catch{cleanupOkay=false;}
 }
 return {...result,status:failedStep||!cleanupOkay?'failed':'passed',failedStep,cleanup:cleanupOkay?'verified':'unverified',realBrowserCorsTested:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify({status:'prepared-not-executed',target:DEV_PROJECT,provisioning:'blocked-until-notification-preflight-reviewed',entrypoint:'runDevNetworkSmoke(config, dependencies)',secrets:'memory-only; never CLI arguments or saved files'}));
