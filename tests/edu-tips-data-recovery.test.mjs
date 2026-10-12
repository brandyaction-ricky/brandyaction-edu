import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {fixture,id,customer,epoch} from './helpers/edu-tips-erasure.mjs';
const require=createRequire(import.meta.url),api={};
const schema=JSON.parse(readFileSync(new URL('../lib/edu-tips-data.schema.json',import.meta.url)));
new Function('exports','require',ts.transpileModule(readFileSync(new URL('../lib/edu-tips-data-http.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(api,n=>n.endsWith('.schema.json')?schema:require(n));
const sql=readFileSync(new URL('../supabase/migrations/20261012030707_edu_tips_data_recovery_v2.sql',import.meta.url),'utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const key='synthetic-data-recovery-key-development-00000';
const env={EDU_TIPS_DATA_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_DATA_CURSOR_SECRET:'x'.repeat(48),EDU_TIPS_ERASURE_CURSOR_SECRET:'y'.repeat(48)};
async function setup(t){
 const f=await fixture(t,['20261010080829_edu_tips_erasure_http_v2.sql','20261012014228_edu_tips_eligibility_v2.sql']);
 const owner=async(sql,params=[])=>{await f.db.exec('reset role');try{return params.length?await f.db.query(sql,params):await f.db.exec(sql);}catch(e){await f.db.exec('rollback');throw e;}finally{await f.db.exec('set role service_role');}};
 await owner(`
 create table courses(id uuid primary key,course_code text);
 create table cohorts(id uuid primary key,cohort_code text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),is_test_order boolean default false,total_amount integer,status text,entry_src text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id));
 create table payments(id uuid primary key,order_id uuid references orders(id),status text,approved_amount integer,cancelled_amount integer default 0,approved_at timestamptz);
 create table refunds(id uuid primary key,payment_id uuid references payments(id),status text,amount integer,completed_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),order_item_id uuid references order_items(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id),source text);
 create table learning_usage_events(id uuid primary key,enrollment_id uuid references enrollments(id),item_type text,item_id uuid,first_used_at timestamptz,last_used_at timestamptz,evidence_source text);
 create view edu_analytics_orders with(security_invoker=true) as select o.* from orders o join profiles p on p.id=o.user_id where not o.is_test_order and o.total_amount>0 and p.status='active' and not p.is_internal and p.role not in ('admin','staff');
 grant select on courses,cohorts,orders,order_items,payments,refunds,enrollments,learning_usage_events,edu_analytics_orders to service_role;
 `);
 await owner(sql);
 await owner(readFileSync(new URL('../supabase/migrations/20261012041637_edu_tips_expired_revision_guard.sql',import.meta.url),'utf8'));
 await owner(readFileSync(new URL('../supabase/migrations/20261012052049_edu_tips_rest_safe_updates.sql',import.meta.url),'utf8'));
 await owner('delete from edu_tips_private.erasure_outbox');
 await owner("update edu_tips_private.feed_state set capture_enabled=true,serving_enabled=true;update edu_tips_private.feed_state set capture_since=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'");
 await owner("insert into edu_tips_private.data_keys values($1,$2,array['edu.events.read','edu.learning.read','edu.recovery'],'2099-01-01',null)",[hash(key),id(90)]);
 await owner('insert into courses values($1,\'moonshot\');',[id(200)]);
 await owner('insert into cohorts values($1,\'4\');',[id(201)]);
 for(const n of [5,6]){
  await owner('insert into profiles(id) values($1)',[id(n)]);
  await owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(n),id(n+10)]);
  await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(n),customer(n),epoch(n),id(n+10)]);
  await owner("update edu_tips_private.subjects set created_at=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' where member_id=$1",[id(n)]);
  await owner("insert into orders values($1,$2,false,100000,'paid','alumni')",[id(n+100),id(n)]);
  await owner('insert into order_items values($1,$2,$3,$4)',[id(n+110),id(n+100),id(200),id(201)]);
  await owner("insert into payments values($1,$2,'done',100000,0,statement_timestamp()-interval '1 day')",[id(n+120),id(n+100)]);
  await owner("insert into enrollments values($1,$2,$3,$4,$5,'purchase')",[id(n+130),id(n),id(n+110),id(200),id(201)]);
 }
 const rpc=async(name,a)=>{
  try{
   let data;
   if(name==='edu_tips_data_gate')data=await f.value('select edu_tips_data_gate($1,$2,$3) as v',[a.p_key_hash,a.p_environment,a.p_scope]);
   else data=await f.value('select edu_tips_data_operation($1,$2,$3,$4,$5::jsonb,$6,$7,$8::text[]) as v',[a.p_consumer,a.p_key_hash,a.p_environment,a.p_action,JSON.stringify(a.p_body),a.p_after,a.p_limit,a.p_hashes]);
   return {data,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}
 };
 const call=async(action,{token=key,after,limit,body,environment=env,rpcOverride=rpc}={})=>{
  const page=['events','learning'].includes(action),q=new URLSearchParams();if(after!==undefined)q.set('after',after);if(limit!==undefined)q.set('limit',String(limit));
  const req=new Request('https://synthetic.invalid/api/internal/export/v2/'+action+(q.size?'?'+q:''),{method:page?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(!page?{body:JSON.stringify(body)}:{})});
  const r=await api.handleData(req,action,{env:environment,rpc:rpcOverride});return {status:r.status,headers:r.headers,body:await r.json()};
 };
 const recover=(requestId=id(900),reason='initial')=>call('recovery',{body:{requestId,reason}});
 const rates=()=>owner('delete from edu_tips_private.data_rates');
 return {...f,owner,call,recover,rates,rpc};
}
async function snapshot(f,action,start,limit=500){
 const rows=[];let cursor=start;let r;
 do{r=await f.call(action,{after:cursor,limit});assert.equal(r.status,200,JSON.stringify(r.body));rows.push(...(r.body.events??r.body.rows));cursor=r.body.next_cursor;}while(r.body.has_more);
 return {rows,cursor};
}
test('recovery is mandatory; a complete current snapshot includes both subjects and terminal incremental scans',async t=>{
 const f=await setup(t);assert.equal((await f.call('events')).body.error,'recovery_required');
 const r=await f.recover();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.headers.get('x-contract-version'),'2.0.0-rc.2');
 assert.deepEqual((await f.recover()).body,r.body);
 assert.equal((await f.recover(id(900),'consumer_rebuild')).body.error,'idempotency_conflict');
 const events=await snapshot(f,'events',r.body.event_cursor,1);assert.equal(events.rows.length,2);assert.equal(events.rows[0].payload.amount_paid,100000);
 assert.equal(events.rows[0].payload.entry_src,'alumni');assert.equal(events.rows[0].event_timestamp.slice(-6),'00:00Z');
 const learning=await snapshot(f,'learning',r.body.learning_cursor);
 let complete=await f.call('complete',{body:{recovery_id:r.body.recovery_id,event_through:events.cursor,learning_through:learning.cursor,tombstone_through:r.body.tombstone_cursor}});
 assert.equal(complete.body.error,'recovery_incomplete');
 const e=await snapshot(f,'events',events.cursor);const l=await snapshot(f,'learning',learning.cursor);
 complete=await f.call('complete',{body:{recovery_id:r.body.recovery_id,event_through:e.cursor,learning_through:l.cursor,tombstone_through:r.body.tombstone_cursor}});
 assert.equal(complete.status,200,JSON.stringify(complete.body));assert.equal(complete.body.status,'reconciled');
});
test('same-value partial refunds have distinct identity; correction revisions retain IDs and do not extend expiry',async t=>{
 const f=await setup(t);
 for(const n of [301,302]){
  await f.owner("insert into refunds values($1,$2,'done',10000,statement_timestamp()-interval '1 hour')",[id(n),id(125)]);
  await f.owner("update payments set cancelled_amount=cancelled_amount+10000,status='partial_cancelled' where id=$1",[id(125)]);
 }
 const r=await f.recover();const e=await snapshot(f,'events',r.body.event_cursor);
 const refunds=e.rows.filter(x=>x.event_type==='order_refunded');assert.equal(refunds.length,2);assert.notEqual(refunds[0].payload.refund_id,refunds[1].payload.refund_id);
 const initial=e.rows.find(x=>x.customer_id===customer(5)&&x.event_type==='payment_completed');
 await f.owner("update orders set entry_src='youtube' where id=$1",[id(105)]);
 const next=await snapshot(f,'events',e.cursor);const update=next.rows.find(x=>x.event_id===initial.event_id);
 assert.equal(update.payload.record_revision,2);assert.equal(update.payload.entry_src,'youtube');assert.equal(update.payload.expires_at,initial.payload.expires_at);
 await f.owner('update orders set entry_src=entry_src where id=$1',[id(105)]);
 assert.equal(await f.value('select max(revision)::int as v from edu_tips_private.feed_facts where record_key=$1',['payment:'+id(125)]),2);
});
test('learning counts real KST days and unique items; unknown historical composition never gets a fake ratio',async t=>{
 const f=await setup(t);
 await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(401),id(135),id(410)]);
 await f.owner("update learning_usage_events set last_used_at=clock_timestamp() where id=$1",[id(401)]);
 await f.owner("insert into learning_usage_events values($1,$2,'vod_complete',$3,now(),now(),'lesson_progress')",[id(402),id(135),id(411)]);
 const r=await f.recover(),l=await snapshot(f,'learning',r.body.learning_cursor);assert.equal(l.rows.length,1);
 assert.equal(l.rows[0].resource_used,1);assert.equal(l.rows[0].vod_completed,1);
 assert.equal(l.rows[0].usage_ratio,null);assert.equal(l.rows[0].total_items,null);assert.equal(l.rows[0].curriculum_version,null);
 assert.equal(Date.parse(l.rows[0].expires_at)-Date.parse(l.rows[0].date_kst+'T00:00:00+09:00'),90*86400000);
});
test('withdrawal between snapshot creation and reading removes A only and prevents completion with pending erasure',async t=>{
 const f=await setup(t);const r=await f.recover();
 await f.owner('update edu_personalization_preferences set analysis=false where member_id=$1',[id(5)]);
 const e=await snapshot(f,'events',r.body.event_cursor);assert.equal(e.rows.length,1);assert.equal(e.rows[0].customer_id,customer(6));
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_facts where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)',[customer(5)]),0);
 const l=await snapshot(f,'learning',r.body.learning_cursor);const ee=await snapshot(f,'events',e.cursor),ll=await snapshot(f,'learning',l.cursor);
 const c=await f.call('complete',{body:{recovery_id:r.body.recovery_id,event_through:ee.cursor,learning_through:ll.cursor,tombstone_through:r.body.tombstone_cursor}});
 assert.equal(c.body.error,'recovery_incomplete');
});
test('old source data belongs in a full recovery, not the 30-day delivery log; cursor gaps force recovery',async t=>{
 const f=await setup(t);
 await f.owner("update payments set approved_at=now()-interval '100 days' where id=$1",[id(125)]);
 await f.owner("update edu_tips_private.feed_outbox set expires_at=now()-interval '1 second' where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)",[customer(5)]);
 const r=await f.recover();const e=await snapshot(f,'events',r.body.event_cursor);assert.equal(e.rows.length,2);
 // A newly committed change after terminal snapshot retains its original retention bound.
 await f.owner("update orders set entry_src='paid' where id=$1",[id(105)]);
 await f.owner("update edu_tips_private.feed_outbox set expires_at=now()-interval '1 second' where publish_seq is null");
 assert.equal((await f.call('events',{after:e.cursor})).body.error,'cursor_expired');
});
test('bad/foreign/expired/removed credentials, scope and cursor binding fail closed; rate limit is shared',async t=>{
 const f=await setup(t);const r=await f.recover();
 assert.equal((await f.call('learning',{after:r.body.event_cursor})).body.error,'unknown_cursor');
 assert.equal((await f.call('events',{after:r.body.event_cursor,token:'z'.repeat(44)})).status,401);
 assert.equal((await f.call('events',{after:r.body.event_cursor,environment:{...env,NEXT_PUBLIC_APP_ENV:'production'}})).status,401);
 await f.owner("update edu_tips_private.data_keys set scopes=array['edu.events.read']");assert.equal((await f.recover(id(901))).status,403);
 await f.rates();await f.owner('update edu_tips_private.data_rates set used=30');
 // A first call seeds the same consumer window before forcing its count.
 await f.call('events',{after:r.body.event_cursor});await f.owner('update edu_tips_private.data_rates set used=30');
 const limited=await f.call('events',{after:r.body.event_cursor});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
 await f.owner('update edu_tips_private.data_keys set revoked_at=now()');assert.equal((await f.call('events',{after:r.body.event_cursor})).status,401);
 assert.equal(await f.value("select count(*)::int as v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='edu_tips_private' and c.relkind='r' and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select'))"),0);
 for(const fn of ['public.edu_tips_data_gate(text,text,text)','public.edu_tips_data_operation(uuid,text,text,text,jsonb,text,integer,text[])','public.edu_tips_prune_feed_content()']){
  assert.equal(await f.value("select has_function_privilege('anon',$1,'execute') as v",[fn]),false);
  assert.equal(await f.value("select has_function_privilege('authenticated',$1,'execute') as v",[fn]),false);
 }
 await f.db.exec('set role anon');await assert.rejects(()=>f.db.query('select edu_tips_data_gate($1,$2,$3)',[hash(key),'dev','edu.events.read']),/permission denied/);
});
test('OFF bypasses authentication and DB; malformed/extra customer fields or backend failure never produce success',async t=>{
 const f=await setup(t);
 const never=async()=>{throw new Error('should not call');};const off=await f.call('events',{environment:{...env,EDU_TIPS_DATA_API_ENABLED:'false'},rpcOverride:never});assert.equal(off.status,503);assert.equal(off.body.error,'disabled');
 assert.equal((await f.call('recovery',{body:{requestId:id(900),reason:'initial',email:'synthetic@example.invalid'}})).status,400);
 assert.equal((await f.call('recovery',{body:[]})).status,400);
 const bad=await f.call('events',{rpcOverride:async()=>({data:null,error:{message:'private error'}})});assert.equal(bad.status,503);assert.equal(JSON.stringify(bad.body).includes('private'),false);
});
test('ambiguous refund source is quarantined without breaking the payment transaction, then repaired on coherent source',async t=>{
 const f=await setup(t);await f.owner("insert into refunds values($1,$2,'done',10000,now()-interval '1 hour')",[id(301),id(125)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_quarantine'),1);
 assert.equal((await f.recover()).status,503);
 await f.owner("update payments set cancelled_amount=10000,status='partial_cancelled' where id=$1",[id(125)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_quarantine'),0);assert.equal((await f.recover()).status,200);
});

test('snapshot preserves cutoff revisions while later committed corrections are delivered incrementally',async t=>{
 const f=await setup(t),r=await f.recover();
 await f.owner("update orders set entry_src='paid' where id=$1",[id(105)]);
 const e=await snapshot(f,'events',r.body.event_cursor);
 const first=e.rows.find(x=>x.customer_id===customer(5));assert.equal(first.payload.entry_src,'alumni');assert.equal(first.payload.record_revision,1);
 const next=await snapshot(f,'events',e.cursor);assert.equal(next.rows[0].payload.entry_src,'paid');assert.equal(next.rows[0].event_id,first.event_id);
});
test('a newly committed outbox with an earlier timestamp is published after the earlier high-watermark',async t=>{
 const f=await setup(t),r=await f.recover();const e=await snapshot(f,'events',r.body.event_cursor);
 await f.owner("update orders set entry_src='paid' where id=$1",[id(105)]);
 await f.owner("update edu_tips_private.feed_outbox set queued_at=now()-interval '20 days' where publish_seq is null");
 const next=await snapshot(f,'events',e.cursor);assert.equal(next.rows.length,1);assert.equal(next.rows[0].payload.entry_src,'paid');
 assert.equal((await snapshot(f,'events',next.cursor)).rows.length,0);
});
test('new consumer rebuild invalidates old staging; reclassifying a test order forces a clean snapshot',async t=>{
 const f=await setup(t),r=await f.recover();const replacement=await f.recover(id(901));assert.equal(replacement.status,200);
 assert.equal((await f.call('events',{after:r.body.event_cursor})).body.error,'recovery_required');
 await f.owner('update orders set is_test_order=true where id=$1',[id(105)]);
 assert.equal((await f.call('events',{after:replacement.body.event_cursor})).body.error,'recovery_required');
 const latest=await f.recover(id(902));const e=await snapshot(f,'events',latest.body.event_cursor);assert.equal(e.rows.length,1);assert.equal(e.rows[0].customer_id,customer(6));
});
test('retention cleanup runs with collection OFF and preserves B, deletion records and ID mappings',async t=>{
 const f=await setup(t);
 await f.owner("update edu_tips_private.feed_facts set expires_at=now()-interval '1 second' where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)",[customer(5)]);
 await f.owner("update edu_tips_private.fact_versions set expires_at=now()-interval '1 second' where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)",[customer(5)]);
 await f.owner('update edu_tips_private.feed_state set serving_enabled=false,capture_enabled=false');
 const counts=await f.value('select edu_tips_prune_feed_content() as v');assert.equal(counts.facts,1);assert.equal(counts.versions,1);
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.feed_facts where payload<>'{}'::jsonb"),1);
 assert.ok(await f.value('select count(*)::int as v from edu_tips_private.opaque_refs')>0);
 const req=new Request('https://synthetic.invalid/api/cron/tips-data-retention',{headers:{authorization:'Bearer synthetic-cron'}});
 let called=false;const rpc=async()=>{called=true;return {data:counts,error:null};};
 assert.equal((await api.scheduledDataRetention(req,{env:{...env,CRON_SECRET:'synthetic-cron'},rpc})).status,503);assert.equal(called,false);
 assert.equal((await api.scheduledDataRetention(req,{env:{...env,CRON_SECRET:'synthetic-cron',EDU_TIPS_DATA_RETENTION_ENABLED:'true'},rpc})).status,200);
 assert.equal((await api.scheduledDataRetention(new Request(req.url,{method:'HEAD'}),{env:{...env,EDU_TIPS_DATA_RETENTION_ENABLED:'true'},rpc})).status,405);
});

test('an eligible subject without a complete source projection cannot produce an empty success snapshot',async t=>{
 const f=await setup(t);await f.owner('delete from edu_tips_private.projection_subjects where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)',[customer(5)]);
 assert.equal((await f.recover()).status,503);
 await f.value('select edu_tips_private.capture_member($1) as v',[id(5)]);
 assert.equal((await f.recover()).status,200);
});
test('non-consenting daily evidence is not collected; failed response schema and invalid ratios reject the whole page',async t=>{
 const f=await setup(t);const r=await f.recover();
 await f.owner('update edu_personalization_preferences set overseas=false where member_id=$1',[id(5)]);
 await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(401),id(135),id(410)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.learning_days where enrollment_id=$1',[id(135)]),0);
 const wrong=async(name,a)=>name==='edu_tips_data_gate'?f.rpc(name,a):{data:{items:[{email:'synthetic@example.invalid'}],has_more:false,stream_generation:1},error:null};
 const page=await f.call('events',{after:r.body.event_cursor,rpcOverride:wrong});assert.equal(page.status,503);
});

test('partial first KST day and collection gaps are unmeasured rather than false daily zero counts',async t=>{
 const f=await setup(t);
 await f.owner("update edu_tips_private.subjects set created_at=now() where member_id=$1",[id(5)]);
 await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(401),id(135),id(410)]);
 const r=await f.recover(),l=await snapshot(f,'learning',r.body.learning_cursor);assert.equal(l.rows.length,0);
 const prior=await f.value('select generation as v from edu_tips_private.feed_state');
 await f.owner('update edu_tips_private.feed_state set capture_enabled=false;update edu_tips_private.feed_state set capture_enabled=true');
 assert.equal(await f.value('select generation as v from edu_tips_private.feed_state'),prior+1);
 assert.equal((await f.call('events',{after:r.body.event_cursor})).body.error,'recovery_required');
});

test('a correction moving the original payment outside retention removes its earlier analysis copy',async t=>{
 const f=await setup(t),r=await f.recover();
 const mappingCount=await f.value('select count(*)::int as v from edu_tips_private.opaque_refs');
 await f.owner("update payments set approved_at=now()-interval '400 days' where id=$1",[id(125)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_facts where record_key=$1',['payment:'+id(125)]),0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.fact_versions where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)',[customer(5)]),0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_outbox where subject_id=(select id from edu_tips_private.subjects where customer_id=$1) and payload is not null',[customer(5)]),0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.recovery_rows where subject_id=(select id from edu_tips_private.subjects where customer_id=$1) and payload is not null',[customer(5)]),0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.opaque_refs'),mappingCount);
 assert.equal((await f.call('events',{after:r.body.event_cursor})).body.error,'recovery_required');
 const next=await f.recover(id(902));const rows=await snapshot(f,'events',next.body.event_cursor);
 assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].customer_id,customer(6));
});


test('expired learning revisions clear staged copies while retaining the other stream and opaque mappings',async t=>{
 const f=await setup(t);
 await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(401),id(135),id(410)]);
 const r=await f.recover();
 const count=await f.value('select count(*)::int as v from edu_tips_private.opaque_refs');
 await f.owner("select edu_tips_private.put_fact(subject_id,stream,record_key,occurred_at,statement_timestamp()-interval '1 second',payload) from edu_tips_private.feed_facts where stream='learning'");
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.feed_facts where stream='learning'"),0);
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.recovery_rows where stream='learning' and payload is not null"),0);
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.feed_outbox where stream='learning' and payload is not null"),0);
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.feed_facts where stream='events'"),2);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.opaque_refs'),count);
 assert.equal((await f.call('learning',{after:r.body.learning_cursor})).body.error,'recovery_required');
});


test('all feed singleton updates retain an explicit predicate under the REST safeupdate boundary',async t=>{
 const f=await setup(t);
 for(const signature of ['edu_tips_private.put_fact(uuid,text,text,timestamptz,timestamptz,jsonb)','edu_tips_private.capture_member(uuid)','edu_tips_private.publish_feed()']){
  const definition=await f.value('select pg_get_functiondef($1::regprocedure) as v',[signature]);
  const statements=definition.match(/update edu_tips_private\.feed_state[^;]+;/gi);
  assert.ok(statements?.length,signature);
  for(const statement of statements)assert.match(statement,/where singleton;/i);
  assert.doesNotMatch(definition,/safeupdate\s*[=:]\s*(off|false|0)/i);
 }
 assert.equal((await f.call('events')).body.error,'recovery_required');
 const r=await f.recover();assert.equal(r.status,200);
 await f.owner("update payments set approved_at=now()-interval '400 days' where id=$1",[id(125)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.feed_quarantine'),0);
 assert.equal((await f.call('events',{after:r.body.event_cursor})).body.error,'recovery_required');
});
