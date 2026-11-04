import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
async function load(path){const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {readOutboundConnectors,publicIpv4,sendOfficeDispatch,runOfficeDispatch,dispatchBearerAllowed}=await load('../features/campus/office/dispatch.ts');
const {validateOfficeEvent}=await load('../features/campus/office/domain.ts');
const {handleOfficeDispatch,validateDispatchCommand}=await load('../features/campus/office/dispatch-handler.ts');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key='synthetic-key-only-'.repeat(3),connector={id:'office',keyVersion:'v1',secret:key,ownerIds:[uid(1)],endpoint:'https://worker.example.com/campus',allowedHost:'worker.example.com'};
const lease={id:uid(200),leaseId:uid(300),attempt:1,operation:'submit',connectorId:'office',keyVersion:'v1',payload:{jobId:uid(100),ownerId:uid(1),objective:'SYNTHETIC objective'}};
const config={EDU_CAMPUS_ENABLED:'true',EDU_CAMPUS_OFFICE_ENABLED:'true',EDU_CAMPUS_OFFICE_DISPATCH_ENABLED:'true',EDU_CAMPUS_OFFICE_CONNECTORS_JSON:JSON.stringify([{id:'office',keyVersion:'v1',secretEnv:'EDU_CAMPUS_OFFICE_TEST_SECRET',ownerIds:[uid(1)]}]),EDU_CAMPUS_OFFICE_TEST_SECRET:key,EDU_CAMPUS_OFFICE_OUTBOUND_JSON:JSON.stringify([{id:'office',endpoint:connector.endpoint,allowedHost:connector.allowedHost}])};
function ack(w,outcome='accepted',l=lease){const body=JSON.stringify({dispatchId:l.id,leaseId:l.leaseId,operation:l.operation,outcome});return{status:200,body,signature:'v1='+createHmac('sha256',key).update(`campus-office-ack.v1.office.v1.${w.headers['x-campus-timestamp']}.${l.id}.${l.leaseId}.${l.operation}.${body}`).digest('hex')};}
const resolve=async()=>[{address:'93.184.216.34',family:4}];
test('outbound config is default off, pinned to mapped connector and exact HTTPS hostname',()=>{
 assert.deepEqual(readOutboundConnectors({}),[]);assert.equal(readOutboundConnectors(config).length,1);
 for(const endpoint of ['http://worker.example.com','https://127.0.0.1/a','https://worker.example.com:444/a','https://user@worker.example.com/a','https://evil.example.com/a','https://worker.example.com/a?key=x','https://worker.example.com/a#x'])assert.deepEqual(readOutboundConnectors({...config,EDU_CAMPUS_OFFICE_OUTBOUND_JSON:JSON.stringify([{id:'office',endpoint,allowedHost:connector.allowedHost}])}),[]);
 assert.deepEqual(readOutboundConnectors({...config,EDU_CAMPUS_OFFICE_DISPATCH_ENABLED:'false'}),[]);
 for(const ip of ['127.0.0.1','10.2.3.4','169.254.169.254','100.64.0.2','172.31.0.1','192.168.0.1','192.0.0.1','198.19.1.1','198.51.100.4','203.0.113.2','224.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicIpv4(ip),false,ip);
 assert.equal(publicIpv4('93.184.216.34'),true);assert.equal(dispatchBearerAllowed('Bearer '+key,key),true);assert.equal(dispatchBearerAllowed('Bearer wrong',key),false);assert.equal(dispatchBearerAllowed('Bearer '+key,undefined),false);
});
test('dispatch pins DNS address, HMAC body, stable idempotency; only bounded signed acknowledgements count',async()=>{
 let sent;const post=async w=>{sent=w;return ack(w);};assert.equal(await sendOfficeDispatch(connector,lease,{resolve,post,now:()=>1000000}),'accepted');
 assert.equal(JSON.parse(sent.body).attempt,1);assert.equal(sent.address,'93.184.216.34');assert.equal(sent.headers['x-campus-idempotency-key'],lease.id);assert.equal(sent.url.href,connector.endpoint);
 const signed=`campus-office-request.v1.office.v1.1000.${lease.id}.${lease.leaseId}.submit.${sent.body}`;assert.equal(sent.headers['x-campus-signature'],'v1='+createHmac('sha256',key).update(signed).digest('hex'));
 for(const reply of [{status:302,signature:'',body:'https://127.0.0.1'}, {status:500,signature:'',body:'SECRET'}, {...ack(sent),signature:'v1='+'a'.repeat(64)}, {status:200,signature:'v1='+'a'.repeat(64),body:'x'.repeat(5000)}])assert.equal(await sendOfficeDispatch(connector,lease,{resolve,post:async()=>reply}),'uncertain');
 assert.equal(await sendOfficeDispatch(connector,lease,{resolve,post:async()=>{throw Error('connection reset after receive');}}),'uncertain');
 for(const addresses of [[{address:'10.0.0.1',family:4}],[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}],[]]){let calls=0;assert.equal(await sendOfficeDispatch(connector,lease,{resolve:async()=>addresses,post:async()=>{calls++;throw Error();}}),'uncertain');assert.equal(calls,0);}
});
test('one lease has one send and one durable finish; unknown finish is never automatically resent',async()=>{
 let claims=0,sends=0,finishes=0;const deps={connectors:[connector],claim:async()=>{claims++;return lease;},send:async()=>{sends++;throw Error('unknown');},finish:async(_l,outcome)=>{finishes++;assert.equal(outcome,'uncertain');}};
 assert.deepEqual(await runOfficeDispatch(deps),{claimed:1,completed:1,uncertain:1});assert.deepEqual([claims,sends,finishes],[1,1,1]);
 await assert.rejects(runOfficeDispatch({...deps,finish:async()=>{throw Error('commit uncertain');}}));assert.equal(sends,2);
});
test('webhook validation preserves the signed dispatch binding and rejects malformed IDs',()=>{const e={jobId:uid(100),dispatchId:uid(200),expectedRevision:1,event:'accepted',note:''};assert.equal(validateOfficeEvent(e).dispatchId,uid(200));assert.throws(()=>validateOfficeEvent({...e,dispatchId:'wrong'}));assert.equal(validateOfficeEvent({...e,dispatchId:undefined}).dispatchId,undefined);});

test('owner endpoint strips forged connector, checks origin, streaming limit and preserves same request IDs',async()=>{
 const c={requestId:uid(200),enrollmentId:uid(31),jobId:uid(100),expectedJobRevision:1,action:'enqueue'};assert.deepEqual(validateDispatchCommand({...c,connectorId:'evil'}),c);
 assert.throws(()=>validateDispatchCommand({...c,expectedJobRevision:null}));let saves=0;const deps={enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({}),save:async()=>{saves++;return{};}};
 const req=(origin='https://edu.test')=>new Request('https://edu.test/api/campus/office/dispatch',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(c)});
 assert.equal((await handleOfficeDispatch(req(),{...deps,enabled:false})).status,404);assert.equal((await handleOfficeDispatch(req('https://evil.test'),deps)).status,403);assert.equal((await handleOfficeDispatch(req(),deps)).status,200);assert.equal(saves,1);
 let canceled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(5000));},cancel(){canceled=true;}});const huge=new Request('https://edu.test/api/campus/office/dispatch',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body:stream,duplex:'half'});assert.equal((await handleOfficeDispatch(huge,deps)).status,400);assert.equal(canceled,true);assert.equal(saves,1);
});
async function database(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table profiles(id uuid primary key,status text);create table courses(id uuid primary key,status text,archived_at timestamptz);create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create function private.campus_community_url(text) returns boolean language sql immutable as $$ select $1='' or $1 ~ '^https://[a-z]+\\.[a-z]+/' $$;
 insert into profiles values('${uid(1)}','active'),('${uid(2)}','active');insert into courses values('${uid(10)}','published',null);insert into cohorts values('${uid(20)}','${uid(10)}',null);
 insert into enrollments(id,user_id,course_id,cohort_id,status) values('${uid(31)}','${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(32)}','${uid(2)}','${uid(10)}','${uid(20)}','active');`);
 for(const name of ['20261102154425_edu_campus_private_office_jobs.sql','20261103012334_edu_campus_office_dispatch_outbox.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 const role=async(name='authenticated',id=1)=>db.exec(`reset role;set role ${name};select set_config('request.jwt.claim.sub','${uid(id)}',false);`);
 const rpc=async(name,args=[],casts=[])=>{const params=args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:''));return(await db.query(`select public.${name}(${params}) result`,args)).rows[0].result;};
 const command=async c=>rpc('edu_campus_office_dispatch_command',[JSON.stringify(c)],['jsonb']);
 const claim=async n=>rpc('edu_campus_office_dispatch_claim',['office','v1',[uid(1)],uid(n)],['text','text','uuid[]','uuid']);
 const finish=async(l,outcome)=>rpc('edu_campus_office_dispatch_finish',[l.id,l.leaseId,outcome],['uuid','uuid','text']);
 const create=async n=>{await role();return rpc('edu_campus_office_mutate',[JSON.stringify({requestId:uid(n),enrollmentId:uid(31),action:'create',objective:'Synthetic test goal requiring reviewed draft',materialUrls:[],outputType:'plan'})],['jsonb']);};
 const enqueue=(n,job)=>({requestId:uid(n),enrollmentId:uid(31),jobId:uid(job),expectedJobRevision:1,action:'enqueue',connectorId:'office',keyVersion:'v1'});
 return{db,role,rpc,command,claim,finish,create,enqueue};}
test('SQL durable outbox: ownership/RLS, payload binding, CAS, exact replay, single lease and uncertain no-resend',async()=>{
 const x=await database();const {db,role,rpc,command,claim,finish,create,enqueue}=x;try{
 await create(100);await assert.rejects(command(enqueue(200,100)),/connection/i);
 await db.exec(`reset role;insert into private.edu_campus_office_connectors values('office','${uid(1)}','v1',true,now());`);await role();
 const c=enqueue(200,100),d=await command(c);assert.equal(d.status,'queued');assert.deepEqual(await command(c),d);await assert.rejects(command({...c,expectedJobRevision:2}),/replay/i);await assert.rejects(command({...c,requestId:uid(201),expectedJobRevision:null}),/revision/i);
 await role('authenticated',2);await assert.rejects(rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']),/scope/);await assert.rejects(command({...c,requestId:uid(201)}),/scope/);await assert.rejects(db.exec('select * from private.edu_campus_office_dispatches'),/permission denied/);await assert.rejects(claim(300),/permission denied/);
 await role();await assert.rejects(rpc('edu_campus_office_mutate',[JSON.stringify({requestId:uid(299),enrollmentId:uid(31),jobId:uid(100),expectedRevision:1,action:'archive',note:''})],['jsonb']),/delivery unresolved/);await assert.rejects(db.exec("select private.campus_office_mutate_before_dispatch('{}')"),/permission denied/);
 await role('service_role');const l=await claim(300);assert.equal(l.id,uid(200));assert.equal(l.payload.objective,'Synthetic test goal requiring reviewed draft');assert.equal(await claim(301),null);await assert.rejects(finish({...l,leaseId:uid(301)},'accepted'),/lease conflict/);
 await finish(l,'uncertain');assert.equal(await claim(302),null);await role();await assert.rejects(command({...c,action:'retry',dispatchId:d.id,expectedRevision:3,requestId:uid(202)}),/transition/);
 const ds=await rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']);assert.equal(ds[0].status,'uncertain');assert.equal(ds[0].payload,undefined);
 await command({...c,requestId:uid(203),action:'reconcile',dispatchId:d.id,expectedRevision:ds[0].revision});await role('service_role');const status=await claim(303);assert.equal(status.operation,'status');assert.equal(status.payload.objective,undefined);await finish(status,'not_found');await role();const rs=(await rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']))[0];await command({...c,requestId:uid(204),action:'retry',dispatchId:d.id,expectedRevision:rs.revision});await role('service_role');const again=await claim(304);assert.equal(again.id,l.id);assert.equal(again.operation,'submit');
 }finally{await db.close();}
});
test('SQL cancellation fences late callbacks, preserves review, does not bypass mapping, expired lease never replays',async()=>{
 const{db,role,rpc,command,claim,finish,create,enqueue}=await database();try{
 await db.exec(`insert into private.edu_campus_office_connectors values('office','${uid(1)}','v1',true,now());`);await create(100);const c=enqueue(200,100);await command(c);await role('service_role');const l=await claim(300);await role();const d=(await rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']))[0];await command({...c,requestId:uid(201),action:'cancel',dispatchId:d.id,expectedRevision:d.revision});
 await role('service_role');await assert.rejects(rpc('edu_campus_office_ingest',['office','v1',[uid(1)],uid(400),'a'.repeat(64),JSON.stringify({jobId:uid(100),dispatchId:uid(200),expectedRevision:1,event:'accepted',note:''})],['text','text','uuid[]','uuid','text','jsonb']),/cancel fence/);await assert.rejects(db.exec(`select private.campus_office_ingest_before_dispatch('office','v1','{}','${uid(400)}','${'a'.repeat(64)}','{}')`),/permission denied/);
 await finish(l,'accepted');await db.exec('reset role;update private.edu_campus_office_dispatches set available_at=now();set role service_role;');const cancel=await claim(301);assert.equal(cancel.operation,'cancel');await finish(cancel,'cancelled');await role();const j=(await db.query('select status,revision from edu_campus_office_jobs')).rows[0];assert.equal(j.status,'failed');assert.equal(j.revision,2);
 await create(101);await command(enqueue(202,101));await role('service_role');const expired=await claim(302);await db.exec(`reset role;update private.edu_campus_office_dispatches set lease_expires_at=now()-interval '1 second' where id='${expired.id}';set role service_role;`);assert.equal(await claim(303),null);await assert.rejects(finish(expired,'accepted'),/lease conflict/);
 await create(102);await command(enqueue(203,102));await db.exec(`reset role;update enrollments set status='revoked' where id='${uid(31)}';set role service_role;`);assert.equal(await claim(304),null);await role();await assert.rejects(rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']),/scope/);
 }finally{await db.close();}
});
test('SQL proven busy retries are delayed and capped; cancellation before send is durable and fresh job revision can retry',async()=>{
 const{db,role,rpc,command,claim,finish,create,enqueue}=await database();try{
 await db.exec(`insert into private.edu_campus_office_connectors values('office','${uid(1)}','v1',true,now());`);await create(100);let d=await command(enqueue(200,100));
 await command({...enqueue(201,100),action:'cancel',dispatchId:d.id,expectedRevision:d.revision});assert.equal((await db.query('select status,revision from edu_campus_office_jobs')).rows[0].status,'failed');
 await rpc('edu_campus_office_mutate',[JSON.stringify({requestId:uid(202),enrollmentId:uid(31),action:'retry',jobId:uid(100),expectedRevision:2,note:''})],['jsonb']);
 d=await command({...enqueue(203,100),expectedJobRevision:3});assert.notEqual(d.id,uid(200));await role('service_role');
 for(let i=0;i<4;i++){const l=await claim(300+i);assert.ok(l);await finish(l,'busy');assert.equal(await claim(400+i),null);await db.exec(`reset role;update private.edu_campus_office_dispatches set available_at=now();set role service_role;`);}
 assert.equal(await claim(500),null);await role();const current=(await rpc('edu_campus_office_dispatch_list',[uid(31)],['uuid']))[0];assert.equal(current.status,'uncertain');assert.equal(current.attempts,4);
 }finally{await db.close();}
});
test('new wrapper retains mapped webhook sequence and human-only approval; next revision uses a new immutable dispatch',async()=>{
 const{db,role,rpc,command,claim,finish,create,enqueue}=await database();try{
 await db.exec(`insert into private.edu_campus_office_connectors values('office','${uid(1)}','v1',true,now());`);await create(100);await command(enqueue(200,100));await role('service_role');const l=await claim(300);await finish(l,'accepted');
 const ingest=async(n,event,revision,more={})=>rpc('edu_campus_office_ingest',['office','v1',[uid(1)],uid(n),'a'.repeat(64),JSON.stringify({jobId:uid(100),dispatchId:revision<5?uid(200):uid(201),expectedRevision:revision,event,note:'Synthetic callback',...more})],['text','text','uuid[]','uuid','text','jsonb']);
 await assert.rejects(ingest(399,'accepted',1,{dispatchId:uid(999)}),/dispatch mismatch/);await assert.rejects(ingest(398,'accepted',1,{dispatchId:undefined}),/dispatch mismatch/);await ingest(400,'accepted',1);await ingest(401,'started',2);await ingest(402,'draft',3,{draftText:'Synthetic draft that still requires a human review.'});await assert.rejects(ingest(403,'approved',4),/transition/);
 await role();let j=(await db.query('select status,revision from edu_campus_office_jobs')).rows[0];assert.equal(j.status,'review');const revisionRequest={requestId:uid(500),enrollmentId:uid(31),jobId:uid(100),expectedRevision:4,action:'request_revision',note:'Please narrow the target audience before review.'};await rpc('edu_campus_office_mutate',[JSON.stringify(revisionRequest)],['jsonb']);
 const next=await command({...enqueue(201,100),expectedJobRevision:5});assert.equal(next.jobRevision,5);assert.notEqual(next.id,l.id);await role('service_role');const second=await claim(301);assert.equal(second.payload.revisionNote,revisionRequest.note);assert.equal(second.payload.expectedRevision,5);await finish(second,'accepted');
 await ingest(404,'accepted',5);await ingest(405,'started',6);await ingest(406,'draft',7,{draftText:'Revised synthetic target audience draft for human review.'});await role();await rpc('edu_campus_office_mutate',[JSON.stringify({...revisionRequest,requestId:uid(501),expectedRevision:8,action:'approve',note:'Reviewed the audience and accepted this draft.'})],['jsonb']);j=(await db.query('select status,revision from edu_campus_office_jobs')).rows[0];assert.equal(j.status,'approved');
 }finally{await db.close();}
});
