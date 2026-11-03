import test from'node:test';import assert from'node:assert/strict';import{PGlite}from'@electric-sql/pglite';import{readFileSync}from'node:fs';import{randomUUID as id}from'node:crypto';
const countKeys=['sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events'];
const counts=patch=>Object.fromEntries(countKeys.map(k=>[k,patch[k]??0]));
test('withdrawal intake, leases, stable retries, cumulative receipts and current admin authorization',async t=>{
 const db=new PGlite();t.after(()=>db.close());const read=f=>readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8');
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,email text,full_name text,phone text,avatar_url text,marketing_consent boolean,role text,status text,updated_at timestamptz);
 create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create table edu_diagnosis_attempts(id uuid primary key,user_id uuid references profiles(id));
 create table edu_diagnosis_outbox(attempt_id uuid references edu_diagnosis_attempts(id),state text,last_code text,lease uuid,lease_until timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 await db.exec(read('20260914013836_manage_member_admin_roles_and_deletion.sql'));await db.exec(read('20261004002124_edu_member_diagnosis_erasure.sql'));
 const admin=id(),student=id(),staff=id(),other=id();await db.query("insert into profiles(id,role,status,email) values($1,'admin','active','admin@example.test'),($2,'student','active','test@example.test'),($3,'staff','active','staff@example.test'),($4,'student','active','other@example.test')",[admin,student,staff,other]);await db.exec('set role service_role');
 const call=async(fn,args=[])=>Object.values((await db.query('select '+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args)).rows[0])[0];
 await assert.rejects(call('edu_request_member_erasure',[staff,student,'dev']),/ERASURE_FORBIDDEN/);await assert.rejects(call('edu_request_member_erasure',[admin,admin,'dev']),/ERASURE_INVALID/);
 const accepted=await call('edu_request_member_erasure',[admin,student,'dev']);assert.equal(accepted.state,'requested');assert.deepEqual(await call('edu_request_member_erasure',[admin,student,'dev']),accepted);assert.equal((await db.query('select status from profiles where id=$1',[student])).rows[0].status,'active');
 assert.deepEqual(await call('edu_claim_member_erasure',['production',3]),[]);await assert.rejects(call('edu_request_member_erasure',[admin,student,'production']),/ERASURE_ENVIRONMENT/);
 await db.query('insert into edu_diagnosis_attempts values($1,$2)',[student,student]);await db.query("insert into edu_diagnosis_outbox values($1,'working',null,$2,now()+interval '60 seconds')",[student,student]);
 assert.deepEqual(await call('edu_claim_member_erasure',['dev',3]),[]);assert.equal((await db.query('select status from profiles where id=$1',[student])).rows[0].status,'withdrawn');assert.equal((await db.query('select state from edu_diagnosis_outbox')).rows[0].state,'needs_review');
 // Even an explicit admin retry cannot bypass the signed-request drain period.
 await call('edu_retry_member_erasure',[admin,accepted.requestId]);assert.deepEqual(await call('edu_claim_member_erasure',['dev',3]),[]);
 await db.query("update edu_member_erasure_requests set disabled_at=now()-interval '4 minutes',next_attempt_at=now() where request_id=$1",[accepted.requestId]);
 const jobs=await call('edu_claim_member_erasure',['dev',3]);assert.equal(jobs.length,1);assert.equal(jobs[0].requestId,accepted.requestId);assert.deepEqual(await call('edu_claim_member_erasure',['dev',3]),[]);
 const partial={erased:true,requestId:accepted.requestId,counts:counts({sessions:4,report_jobs:2}),storageRemoved:1,storageFailedCount:1};
 await assert.rejects(call('edu_finish_member_erasure',[accepted.requestId,jobs[0].lease,{...partial,counts:{}},null,false]),/ERASURE_INVALID/);
 await assert.rejects(call('edu_finish_member_erasure',[accepted.requestId,jobs[0].lease,{},null,false]),/ERASURE_INVALID/);
 assert.equal(await call('edu_finish_member_erasure',[accepted.requestId,jobs[0].lease,partial,'STORAGE_PENDING',true]),false);let rows=await call('edu_read_member_erasure',[admin]);assert.equal(rows[0].state,'retry');assert.equal(rows[0].completedAt,null);assert.equal(rows[0].counts.sessions,4);
 await call('edu_retry_member_erasure',[admin,accepted.requestId]);const retry=(await call('edu_claim_member_erasure',['dev',3]))[0];assert.equal(retry.requestId,accepted.requestId);assert.notEqual(retry.lease,jobs[0].lease);await assert.rejects(call('edu_finish_member_erasure',[accepted.requestId,jobs[0].lease,partial,null,false]),/ERASURE_LEASE_CHANGED/);
 // Losing a remote receipt marks count uncertainty when the lease is reclaimed.
 await db.query("update edu_member_erasure_requests set lease_until=now()-interval '1 second' where request_id=$1",[accepted.requestId]);const recovered=(await call('edu_claim_member_erasure',['dev',3]))[0];assert.equal(recovered.requestId,accepted.requestId);await assert.rejects(call('edu_finish_member_erasure',[accepted.requestId,retry.lease,partial,null,false]),/ERASURE_LEASE_CHANGED/);
 assert.equal(await call('edu_finish_member_erasure',[accepted.requestId,recovered.lease,{...partial,counts:counts({}),storageRemoved:1,storageFailedCount:0},null,false]),true);
 rows=await call('edu_read_member_erasure',[admin]);assert.equal(rows[0].state,'complete');assert.equal(rows[0].counts.sessions,4);assert.equal(rows[0].storageRemoved,2);assert.equal(rows[0].uncertainAttempts,1);assert.equal(rows[0].memberId,student);assert.ok(rows[0].completedAt);assert.equal(JSON.stringify(rows).includes('email'),false);
 await assert.rejects(call('edu_read_member_erasure',[staff]),/ERASURE_FORBIDDEN/);await assert.rejects(call('edu_retry_member_erasure',[admin,accepted.requestId]),/ERASURE_NOT_RETRYABLE/);
 await call('edu_request_member_erasure',[admin,other,'dev']);await db.query("update profiles set role='student' where id=$1",[admin]);assert.deepEqual(await call('edu_claim_member_erasure',['dev',3]),[]);assert.equal((await db.query('select state from edu_member_erasure_requests where member_id=$1',[other])).rows[0].state,'blocked');assert.equal((await db.query('select status from profiles where id=$1',[other])).rows[0].status,'active');
 for(const role of['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call('edu_read_member_erasure',[admin]),/permission denied/);await assert.rejects(db.query('select * from edu_member_erasure_requests'),/permission denied/);}
});
