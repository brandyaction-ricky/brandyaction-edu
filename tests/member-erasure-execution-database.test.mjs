import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

test('only administrator-confirmed withdrawal runs, keeps orders, waits for Auth receipt and preserves retry identity',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,email text,full_name text,phone text,avatar_url text,marketing_consent boolean,role text,status text,updated_at timestamptz,
 contact_email text,marketing_use_consent_at timestamptz,ad_sms_consent_at timestamptz,ad_kakao_consent_at timestamptz,ad_email_consent_at timestamptz,consent_revision uuid,consent_updated_at timestamptz);
 create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create table edu_diagnosis_attempts(id uuid primary key,user_id uuid references profiles(id));
 create table edu_diagnosis_outbox(attempt_id uuid references edu_diagnosis_attempts(id),state text,last_code text,lease uuid,lease_until timestamptz);
 create table edu_personalization_preferences(member_id uuid primary key,analysis boolean,overseas boolean,revision uuid,updated_at timestamptz);
 create table orders(id uuid primary key,user_id uuid references profiles(id),amount integer);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const file of ['20260914013836_manage_member_admin_roles_and_deletion.sql','20261004002124_edu_member_diagnosis_erasure.sql','20261109100648_edu_member_erasure_execution.sql'])await db.exec(migration(file));
 const actor=randomUUID(),former=randomUUID(),member=randomUUID(),other=randomUUID(),staff=randomUUID();
 await db.query("insert into profiles(id,role,status,email,full_name,contact_email,phone,marketing_consent) values ($1,'admin','active','admin@example.test','관리자',null,null,false),($2,'admin','active','former@example.test',null,null,null,false),($3,'student','active','member@example.test','가상 회원','contact@example.test','01000000000',true),($4,'student','active','other@example.test',null,null,null,false),($5,'staff','active','staff@example.test',null,null,null,false)",[actor,former,member,other,staff]);
 await db.query('insert into orders values($1,$2,1000)',[randomUUID(),member]);
 await db.query('insert into edu_personalization_preferences values($1,true,true,$2,now())',[member,randomUUID()]);
 const call=async(name,args=[])=>Object.values((await db.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args)).rows[0])[0];
 await db.exec('set role service_role');
 const a=await call('edu_request_member_erasure',[former,member,'dev']);
 const b=await call('edu_request_member_erasure',[actor,other,'dev']);
 // Enabling a scheduled worker must not silently approve either old pending request.
 assert.deepEqual(await call('edu_claim_member_erasure',['dev',3]),[]);
 await assert.rejects(call('edu_retry_member_erasure',[actor,a.requestId]),/ERASURE_NOT_RETRYABLE/);
 await assert.rejects(call('edu_approve_member_erasure',[staff,a.requestId,'dev']),/ERASURE_FORBIDDEN/);
 await assert.rejects(call('edu_approve_member_erasure',[actor,a.requestId,'production']),/ERASURE_NOT_FOUND/);
 // The original requester no longer being an admin must not strand a valid new administrator approval.
 await db.query("update profiles set role='staff' where id=$1",[former]);
 await call('edu_approve_member_erasure',[actor,a.requestId,'dev']);
 const profile=(await db.query('select * from profiles where id=$1',[member])).rows[0];
 assert.equal(profile.status,'withdrawn');assert.equal(profile.contact_email,null);assert.equal(profile.phone,null);assert.equal(profile.marketing_consent,false);
 assert.equal((await db.query('select analysis from edu_personalization_preferences where member_id=$1',[member])).rows[0].analysis,false);
 assert.equal((await db.query('select amount from orders where user_id=$1',[member])).rows[0].amount,1000);
 await assert.rejects(call('edu_approve_member_erasure',[actor,await selfRequest(db,actor),'dev']),/ERASURE_SELF/);
 assert.deepEqual(await call('edu_claim_approved_member_erasure',['dev',1,a.requestId]),[]);
 await db.query("update edu_member_erasure_requests set disabled_at=now()-interval '4 minutes',next_attempt_at=now() where request_id=$1",[a.requestId]);
 // Scope is server-selected; an unrelated pending request is never claimed.
 assert.deepEqual(await call('edu_claim_approved_member_erasure',['dev',1,b.requestId]),[]);
 const [job]=await call('edu_claim_approved_member_erasure',['dev',1,a.requestId]);assert.equal(job.authErased,false);
 const keys=['sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events'];
 const receipt={requestId:a.requestId,erased:true,counts:Object.fromEntries(keys.map(k=>[k,0])),storageRemoved:0,storageFailedCount:0};
 await assert.rejects(call('edu_finish_member_erasure',[a.requestId,job.lease,receipt,null,false]),/ERASURE_AUTH_PENDING/);
 await assert.rejects(call('edu_record_member_auth_erasure',[a.requestId,randomUUID()]),/ERASURE_LEASE_CHANGED/);
 await call('edu_record_member_auth_erasure',[a.requestId,job.lease]);
 // A lost/failed remote response is kept pending, with the same request ID for resumption.
 await call('edu_finish_member_erasure',[a.requestId,job.lease,null,'NETWORK',true]);
 await call('edu_approve_member_erasure',[actor,a.requestId,'dev']);
 const [retry]=await call('edu_claim_approved_member_erasure',['dev',1,a.requestId]);assert.equal(retry.requestId,a.requestId);assert.equal(retry.authErased,true);
 assert.equal(await call('edu_finish_member_erasure',[a.requestId,retry.lease,receipt,null,false]),true);
 const rows=await call('edu_read_member_erasure',[actor]);const done=rows.find(r=>r.requestId===a.requestId);
 assert.equal(done.state,'complete');assert.ok(done.authErasedAt);assert.equal(done.memberEmail,null);assert.equal(rows.find(r=>r.requestId===b.requestId).state,'requested');
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call('edu_approve_member_erasure',[actor,b.requestId,'dev']),/permission denied/);await assert.rejects(call('edu_record_member_auth_erasure',[a.requestId,retry.lease]),/permission denied/);}
});
async function selfRequest(db,actor){const id=randomUUID();await db.query("insert into edu_member_erasure_requests(request_id,member_id,actor_id,environment) values($1,$2,$2,'dev')",[id,actor]);return id;}
