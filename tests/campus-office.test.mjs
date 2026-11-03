import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
async function load(path){const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {verifyOfficeWebhook,readOfficeConnectors,handleOfficeWebhook}=await load('../features/campus/office/webhook.ts');
const {validateOfficeCommand,validateOfficeEvent,learnerOfficeTransition,connectorOfficeTransition}=await load('../features/campus/office/domain.ts');
const {handleOffice}=await load('../features/campus/office/handler.ts');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key='test-only-'.repeat(6),connector={id:'yoonik-office',keyVersion:'v1',secret:key,ownerIds:[uid(1)]},now=Date.parse('2026-11-03T00:00:00Z');
const event={jobId:uid(100),expectedRevision:1,event:'accepted',ownerId:uid(99)};
function signed(raw=JSON.stringify(event),options={}){const ts=String(Math.floor((options.now??now)/1000)),eventId=options.eventId??uid(200);const headers=new Headers({'content-type':'application/json','x-campus-connector':'yoonik-office','x-campus-key-version':'v1','x-campus-timestamp':ts,'x-campus-event-id':eventId,'x-campus-signature':'v1='+createHmac('sha256',key).update(`yoonik-office.v1.${ts}.${eventId}.${raw}`).digest('hex')});return{raw,headers};}
test('HMAC raw-body signature binds time, event ID, connector and key; output strips forged owner',()=>{
 const {raw,headers}=signed();const verified=verifyOfficeWebhook(raw,headers,[connector],now);assert.equal(verified.event.ownerId,undefined);assert.deepEqual(verified.allowedOwners,[uid(1)]);assert.equal(verified.payloadHash.length,64);
 assert.throws(()=>verifyOfficeWebhook(raw+' ',headers,[connector],now),{status:401});
 const otherHeader=new Headers(headers);otherHeader.set('x-campus-connector','other');assert.throws(()=>verifyOfficeWebhook(raw,otherHeader,[{...connector,id:'other'}],now),{status:401});
 const rotatedHeader=new Headers(headers);rotatedHeader.set('x-campus-key-version','v2');assert.throws(()=>verifyOfficeWebhook(raw,rotatedHeader,[{...connector,keyVersion:'v2'}],now),{status:401});
 assert.throws(()=>verifyOfficeWebhook(raw,headers,[connector],now+301000),{status:401});assert.throws(()=>verifyOfficeWebhook(raw,headers,[connector],now-301000),{status:401});
 for(const [h,v] of [['x-campus-event-id',uid(201)],['x-campus-connector','other'],['x-campus-key-version','v2'],['x-campus-signature','v1=abc'],['x-campus-timestamp','NaN']]){const changed=new Headers(headers);changed.set(h,v);assert.throws(()=>verifyOfficeWebhook(raw,changed,[connector],now),{status:401});}
});
test('connector configuration fails closed, never exposes secret environment values',()=>{
 assert.deepEqual(readOfficeConnectors({}),[]);assert.deepEqual(readOfficeConnectors({EDU_CAMPUS_OFFICE_CONNECTORS_JSON:'oops'}),[]);
 const config={id:connector.id,keyVersion:'v1',secretEnv:'EDU_CAMPUS_OFFICE_YOONIK_SECRET',ownerIds:[uid(1)]};const env={EDU_CAMPUS_OFFICE_CONNECTORS_JSON:JSON.stringify([config]),EDU_CAMPUS_OFFICE_YOONIK_SECRET:key};
 assert.equal(readOfficeConnectors(env).length,1);assert.deepEqual(readOfficeConnectors({...env,EDU_CAMPUS_OFFICE_YOONIK_SECRET:'short'}),[]);
 assert.deepEqual(readOfficeConnectors({...env,EDU_CAMPUS_OFFICE_CONNECTORS_JSON:JSON.stringify([{...config,secretEnv:'SUPABASE_SERVICE_ROLE_KEY'}])}),[]);
 assert.deepEqual(readOfficeConnectors({...env,EDU_CAMPUS_OFFICE_CONNECTORS_JSON:JSON.stringify([config,config])}),[]);
 assert.deepEqual(readOfficeConnectors({...env,EDU_CAMPUS_OFFICE_CONNECTORS_JSON:JSON.stringify([config,{...config,id:'other'}])}),[]);
});
test('webhook never ingests unauthenticated/malformed/disabled events and sanitizes failures',async()=>{
 const s=signed();let calls=0;const deps={enabled:true,connectors:[connector],now,ingest:async()=>{calls++;return{accepted:true};}};
 const request=(headers=s.headers,raw=s.raw)=>new Request('https://edu.test/api/campus/office/webhook',{method:'POST',headers,body:raw});
 assert.equal((await handleOfficeWebhook(request(),{...deps,enabled:false})).status,404);
 const bad=new Headers(s.headers);bad.delete('x-campus-signature');assert.equal((await handleOfficeWebhook(request(bad),deps)).status,401);assert.equal(calls,0);
 assert.equal((await handleOfficeWebhook(request(),deps)).status,200);assert.equal(calls,1);
 const failed=await handleOfficeWebhook(request(),{...deps,ingest:async()=>{throw new Error('SECRET LOG CONTENT');}});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('SECRET'));
});
test('learner commands cannot run jobs; draft receipt cannot self-approve and CAS is mandatory',()=>{
 const job={id:uid(100),revision:1,status:'awaiting_connection',draft_text:''};
 assert.throws(()=>learnerOfficeTransition(job,{action:'approve',expectedRevision:1}),{status:409});
 assert.throws(()=>connectorOfficeTransition(job,{event:'draft',expectedRevision:1}),{status:409});
 assert.throws(()=>validateOfficeEvent({...event,event:'approved'}),{status:400});
 assert.throws(()=>validateOfficeCommand({requestId:uid(2),enrollmentId:uid(3),action:'started'}),{status:400});
 assert.throws(()=>learnerOfficeTransition({...job,status:'review',draft_text:'verified real draft'}, {action:'approve',expectedRevision:0}),{status:409});
 assert.equal(connectorOfficeTransition(job,{event:'accepted',expectedRevision:1}),'queued');
 assert.throws(()=>learnerOfficeTransition({...job,status:'running'}, {action:'archive',expectedRevision:1}),{status:409});
});
test('office API origin/auth/input boundary',async()=>{
 const deps={enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({jobs:[],connection:'not_connected'}),save:async()=>({status:'awaiting_connection'})};
 const req=(method='GET',headers={},body)=>new Request(`https://edu.test/api/campus/office?enrollmentId=${uid(2)}`,{method,headers,body});
 assert.equal((await handleOffice(req(),{...deps,enabled:false})).status,404);assert.equal((await handleOffice(req(),{...deps,authenticate:async()=>null})).status,401);
 assert.equal((await handleOffice(req('POST',{'content-type':'application/json'},'{}'),deps)).status,403);
 assert.equal((await handleOffice(req('POST',{'content-type':'application/json',origin:'https://edu.test'},'null'),deps)).status,400);
 const r=await handleOffice(req(),deps);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');
});

test('chunked office requests stop consuming bytes when the body limit is reached',async()=>{
 let pulls=0,canceled=false,saves=0;
 const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(24000));if(pulls===100)controller.close();},cancel(){canceled=true;}});
 const req=new Request('https://edu.test/api/campus/office',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body,duplex:'half'});
 const response=await handleOffice(req,{enabled:true,authenticate:async()=>({id:uid(1)}),load:async()=>({}),save:async()=>{saves++;}});
 assert.equal(response.status,400);assert.equal(canceled,true);assert.ok(pulls<5);assert.equal(saves,0);
});

test('PostgreSQL isolates office ownership, mapped connector events, replay, CAS, review and archives',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table profiles(id uuid primary key,status text);create table courses(id uuid primary key,status text,archived_at timestamptz);create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create function private.campus_community_url(text) returns boolean language sql immutable as $$ select $1='' or $1 ~ '^https://[a-z]+\\.[a-z]+/' $$;
 insert into profiles values('${uid(1)}','active'),('${uid(2)}','active');insert into courses values('${uid(10)}','published',null);insert into cohorts values('${uid(20)}','${uid(10)}',null);
 insert into enrollments(id,user_id,course_id,cohort_id,status) values('${uid(31)}','${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(32)}','${uid(2)}','${uid(10)}','${uid(20)}','active');`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261102154425_edu_campus_private_office_jobs.sql',import.meta.url),'utf8'));
 const login=async n=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
 const mutate=async c=>(await db.query('select public.edu_campus_office_mutate($1::jsonb) result',[JSON.stringify(c)])).rows[0].result;
 const ingest=async(id,ev,owners=[uid(1)],hash='a'.repeat(64),connectorId='office',version='v1')=>(await db.query('select public.edu_campus_office_ingest($1,$2,$3::uuid[],$4,$5,$6::jsonb) result',[connectorId,version,owners,uid(id),hash,JSON.stringify(ev)])).rows[0].result;
 const create={requestId:uid(100),enrollmentId:uid(31),action:'create',objective:'문샷 커리큘럼을 실행할 첫 번째 작업 계획을 정리해 주세요.',materialUrls:['https://example.com/work'],outputType:'plan'};
 await login(1);await mutate(create);assert.equal((await mutate(create)).revision,1);
 assert.equal((await db.query('select status from edu_campus_office_jobs')).rows[0].status,'awaiting_connection');
 await assert.rejects(db.exec(`update edu_campus_office_jobs set status='approved'`),/permission denied/i);
 await assert.rejects(ingest(200,event),/permission denied/i);
 await login(2);assert.equal((await db.query('select * from edu_campus_office_jobs')).rows.length,0);
 await assert.rejects(mutate({...create,requestId:uid(101)}),/scope/i);
 await db.exec(`reset role;insert into private.edu_campus_office_connectors values('office','${uid(1)}','v1',true,now());set role service_role;`);
 const accepted={jobId:uid(100),expectedRevision:1,event:'accepted',note:''};
 await assert.rejects(ingest(200,accepted,[uid(2)]),/scope/i);await assert.rejects(ingest(200,accepted,[uid(1)],'a'.repeat(64),'office','wrong-version'),/scope/i);
 assert.equal((await ingest(200,accepted)).status,'queued');assert.equal((await ingest(200,accepted)).revision,2);
 await assert.rejects(ingest(200,accepted,[uid(1)],'b'.repeat(64)),/replay conflict/i);
 await assert.rejects(ingest(201,{...accepted,event:'draft',expectedRevision:2,draftText:'변조한 바로 완료 시도입니다.'}),/transition/i);
 await ingest(201,{...accepted,event:'started',expectedRevision:2});
 await ingest(202,{...accepted,event:'draft',expectedRevision:3,draftText:'첫 제안의 대상을 좁히고 고객이 얻을 변화를 구체적으로 적으세요.',draftUrl:''});
 await login(1);const approve={requestId:uid(300),enrollmentId:uid(31),action:'approve',jobId:uid(100),expectedRevision:4,note:'목표와 자료를 확인했고 사용 가능한 초안입니다.'};
 assert.equal((await mutate(approve)).status,'approved');await assert.rejects(mutate({...approve,requestId:uid(301)}),/revision conflict/i);
 await mutate({...approve,requestId:uid(302),action:'archive',expectedRevision:5,note:''});
 assert.equal((await db.query('select * from edu_campus_office_history')).rows.length,6);
 await db.exec(`reset role;set role service_role;`);await assert.rejects(ingest(203,{...accepted,expectedRevision:6}),/transition/i);
 await db.exec(`reset role;update cohorts set archived_at=now() where id='${uid(20)}';`);await login(1);
 assert.equal((await db.query('select * from edu_campus_office_jobs')).rows.length,0);await assert.rejects(mutate({...create,requestId:uid(500)}),/scope/i);
 await db.exec('reset role;set role service_role;');await assert.rejects(ingest(500,{...accepted,expectedRevision:6}),/scope/i);
 await db.exec(`reset role;update cohorts set archived_at=null where id='${uid(20)}';`);
 await db.exec(`reset role;update enrollments set revoked_at=now() where id='${uid(31)}';`);await login(1);assert.equal((await db.query('select * from edu_campus_office_jobs')).rows.length,0);await assert.rejects(mutate(create),/scope/i);
 await db.exec(`reset role;set role anon;`);await assert.rejects(db.query('select * from edu_campus_office_jobs'),/permission denied/i);
 }finally{await db.close();}
});
