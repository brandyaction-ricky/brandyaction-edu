import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const read=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');

test('seeded learning data erases while financial/consent evidence and other learners survive; old JWT is denied and Storage receipts fail closed',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role authenticator;create role service_role bypassrls;
 create schema private;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,service_role;
 create table profiles(id uuid primary key,email text,full_name text,phone text,avatar_url text,marketing_consent boolean,role text,status text,updated_at timestamptz,deleted_at timestamptz,
 contact_email text,marketing_use_consent_at timestamptz,ad_sms_consent_at timestamptz,ad_kakao_consent_at timestamptz,ad_email_consent_at timestamptz,consent_revision uuid,consent_updated_at timestamptz);
 create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 create table edu_personalization_preferences(member_id uuid primary key,analysis boolean,overseas boolean,revision uuid,updated_at timestamptz);
 create table orders(id uuid primary key,user_id uuid references profiles,amount integer);
 create table payments(id uuid primary key,order_id uuid references orders,amount integer);
 create table refunds(id uuid primary key,payment_id uuid references payments,amount integer);
 create table edu_consent_events(member_id uuid references profiles,document_version text);
 create table edu_message_batches(actor_id uuid,request_id uuid,payload jsonb,receipt jsonb,primary key(actor_id,request_id));
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table profiles enable row level security;create policy own_profile on profiles for all to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
 alter table storage.objects enable row level security;create policy existing_storage_read on storage.objects for select to authenticated using(true);
 grant select on profiles,storage.objects to authenticated;`);
 await db.exec(readFileSync(new URL('./helpers/member-erasure-schema.sql',import.meta.url),'utf8'));
 await db.exec('grant select,insert,update on all tables in schema public to service_role');
 for(const f of ['20260914013836_manage_member_admin_roles_and_deletion.sql','20261004002124_edu_member_diagnosis_erasure.sql','20261109100648_edu_member_erasure_execution.sql','20261109122930_edu_member_erasure_local_data.sql'])await db.exec(read(f));
 const presenterMigration=read('20261111072000_erase_campus_presenter_answers.sql');
 await db.exec(presenterMigration);
 const member=id(),other=id(),admin=id(),enrollment=id(),otherEnrollment=id(),q=id(),answer=id(),conversation=id(),request=id(),post=id(),comment=id(),order=id(),payment=id();
 await db.query("insert into profiles(id,email,role,status) values($1,'qa@example.test','student','active'),($2,'other@example.test','student','active'),($3,'admin@example.test','admin','active')",[member,other,admin]);
 await db.query("insert into enrollments(id,user_id,status) values($1,$2,'active'),($3,$4,'active')",[enrollment,member,otherEnrollment,other]);
 const slot=id(),otherSlot=id(),question=id(),unanswered=id(),unrelated=id();
 await db.query("insert into edu_campus_demo_slots(id,presenter_id,status,revision) values($1,$2,'finished',1),($3,$4,'finished',1)",[slot,member,otherSlot,other]);
 await db.query(`insert into edu_campus_demo_questions(id,slot_id,author_id,alias,body,answer,answered_at,revision) values
   ($1,$2,$3,'질문자','다른 회원의 질문','탈퇴 발표자의 답변',now(),2),
   ($4,$2,$3,'질문자','아직 답변 없는 질문','',null,1),
   ($5,$6,$3,'질문자','다른 발표의 질문','유지할 답변',now(),2)`,[question,slot,other,unanswered,unrelated,otherSlot]);
 await db.query('insert into orders values($1,$2,1000)',[order,member]);await db.query('insert into payments values($1,$2,1000)',[payment,order]);await db.query('insert into refunds values($1,$2,1000)',[id(),payment]);await db.query("insert into edu_consent_events values($1,'policy-qa')",[member]);
 await db.query("insert into edu_questions(id,user_id,title,content,status,category,visibility) values($1,$2,'가상 질문','private-question','open','learning','private')",[q,member]);
 await db.query("insert into edu_question_answers(id,question_id,actor_id,source,content) values($1,$2,$3,'learner','private-followup')",[answer,q,member]);
 await db.query('update edu_questions set answer_head_id=$1 where id=$2',[answer,q]);
 await db.query("insert into edu_member_messages(id,recipient_id,is_notice,notice_source,target_path,content) values($1,$2,true,$3,'/admin/questions','private-notice-copy')",[id(),admin,'question:followup:'+answer]);
 await db.query("insert into edu_ai_requests(id,actor_id,enrollment_id,mode,fingerprint,status) values($1,$2,$3,'student',$4,'succeeded')",[request,member,enrollment,'a'.repeat(64)]);
 await db.query("insert into edu_ai_calls(request_id,attempt,model,status,estimated_usd) values($1,1,'qa-model','succeeded',0.01)",[request]);
 await db.query("insert into edu_ai_conversations(id,actor_id,enrollment_id,last_question) values($1,$2,$3,'private-conversation')",[conversation,member,enrollment]);
 await db.query("insert into edu_ai_conversation_turns(request_id,conversation_id,question,answer,status) values($1,$2,'private-question','{\"answer\":\"private-answer\",\"sources\":[],\"needsMentor\":false}','succeeded')",[request,conversation]);
 await db.query("insert into edu_mission_drafts(id,user_id,enrollment_id,content,url) values($1,$2,$3,'private-draft','https://example.test/private')",[id(),member,enrollment]);
 await db.query("insert into edu_mission_drafts(id,user_id,enrollment_id,content) values($1,$2,$3,'other-draft')",[id(),other,otherEnrollment]);
 const revision=id(),submission=id();await db.query("insert into edu_lesson_block_versions(id,document) values($1,'{\"schemaVersion\":1,\"blocks\":[],\"checklist\":[]}')",[revision]);
 await db.query("insert into edu_lesson_block_drafts(enrollment_id,revision,values,write_id) values($1,$2,'{\"private\":true}',$3)",[enrollment,revision,id()]);
 await db.query("insert into edu_lesson_block_submissions(id,enrollment_id,revision,values,assessment,outcome) values($1,$2,$3,'{\"private\":true}','{}','submitted')",[submission,enrollment,revision]);
 await db.query("insert into edu_lesson_block_reviews(id,submission_id,actor_id,expected_state,decision,feedback) values($1,$2,$3,$4,'approved','private-review')",[id(),submission,admin,id()]);
 await db.query("insert into edu_lesson_block_feedback(id,submission_id,actor_id,source,feedback) values($1,$2,$3,'comment','private-feedback')",[id(),submission,admin]);
 await db.query("insert into edu_campus_posts(id,owner_id,enrollment_id,alias,title,body,kind,visibility,hidden,revision) values($1,$2,$3,'가상별명','가상 게시글','private-post-body','portfolio','cohort',false,1)",[post,member,enrollment]);
 await db.query("insert into edu_campus_comments(id,post_id,author_id,alias,body) values($1,$2,$3,'다른회원','another-learner-comment')",[comment,post,other]);
 await db.query("insert into edu_push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,'https://example.test/push','private-key','private-auth')",[id(),member]);
 for(const [table,bucket] of [['edu_question_images','question-images'],['edu_lesson_answer_files','lesson-answer-files'],['edu_campus_portfolio_files','campus-portfolio-private']]){
  const file=id(),path=member+'/'+file+'.png';
  await db.query('insert into '+table+'(id,owner_id,name,path) values($1,$2,\'private-file.png\',$3)',[file,member,path]);
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,path]);
 }
 // A file uploaded without a surviving metadata row must also be discovered.
 await db.query("insert into storage.objects(bucket_id,name) values('question-images',$1)",[member+'/'+id()+'.png']);
 const mentorImage=id(),mentorPath=admin+'/'+mentorImage+'.png';
 await db.query("insert into edu_question_answer_images(id,owner_id,question_id,name,path) values($1,$2,$3,'mentor-file.png',$4)",[mentorImage,admin,q,mentorPath]);
 await db.query("insert into storage.objects(bucket_id,name) values('question-images',$1),('question-images',$2)",[mentorPath,other+'/untouched.png']);
 const call=async(fn,args=[])=>Object.values((await db.query('select '+fn+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args)).rows[0])[0];
 const jwt=async subject=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[subject]);};
 await jwt(member);await call('edu_account_request_guard');assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,1);
 await db.exec('reset role;set role service_role');
 const accepted=await call('edu_request_member_erasure',[admin,member,'dev']);await call('edu_approve_member_erasure',[admin,accepted.requestId,'dev']);
 await jwt(member);await assert.rejects(call('edu_account_request_guard'),/ACCOUNT_WITHDRAWN/);assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
 await assert.rejects(call('edu_prepare_member_local_erasure',[accepted.requestId,id()]),/permission denied/);
 await jwt(other);await call('edu_account_request_guard');assert.equal((await db.query('select count(*)::int n from profiles')).rows[0].n,1);
 await db.exec('reset role;set role service_role');
 await db.query("update edu_member_erasure_requests set disabled_at=now()-interval '4 minutes',next_attempt_at=now() where request_id=$1",[accepted.requestId]);
 const [job]=await call('edu_claim_approved_member_erasure',['dev',1,accepted.requestId]);await call('edu_record_member_auth_erasure',[accepted.requestId,job.lease]);
 await assert.rejects(call('edu_prepare_member_local_erasure',[accepted.requestId,job.lease]),/LOCAL_UPLOAD_DRAIN_PENDING/);
 // Only the isolated test request's clock is advanced. No signed upload bearer token is issued in this fixture.
 await db.query("update edu_member_erasure_requests set disabled_at=now()-interval '3 hours' where request_id=$1",[accepted.requestId]);
 assert.equal((await call('edu_prepare_member_local_erasure',[accepted.requestId,job.lease])).pending,5);
 const readQuestion=async key=>(await db.query('select author_id,body,answer,answered_at,revision from edu_campus_demo_questions where id=$1',[key])).rows[0];
 const expectedQuestion={author_id:other,body:'다른 회원의 질문',answer:'',answered_at:null,revision:3};
 assert.deepEqual(await readQuestion(question),expectedQuestion);
 assert.equal((await readQuestion(unanswered)).revision,1);
 assert.equal((await readQuestion(unrelated)).answer,'유지할 답변');
 for(const table of ['edu_questions','edu_question_answers','edu_ai_conversation_turns','edu_ai_conversations','edu_push_subscriptions','edu_question_images','edu_lesson_answer_files','edu_lesson_block_drafts','edu_lesson_block_submissions','edu_lesson_block_reviews','edu_lesson_block_feedback','edu_question_answer_images'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0,table);
 assert.equal((await db.query('select content from edu_mission_drafts')).rows[0].content,'other-draft');
 assert.equal((await db.query('select body from edu_campus_comments where id=$1',[comment])).rows[0].body,'another-learner-comment');
 assert.equal((await db.query('select body from edu_campus_posts where id=$1',[post])).rows[0].body,'탈퇴한 회원의 콘텐츠가 삭제되었습니다.');
 assert.ok(!(await db.query('select content from edu_member_messages')).rows[0].content.includes('private-notice-copy'));
 const usage=(await db.query('select * from edu_ai_requests where id=$1',[request])).rows[0];assert.equal(usage.actor_id,null);assert.equal(usage.enrollment_id,null);
 assert.equal(Number((await db.query('select estimated_usd from edu_ai_calls')).rows[0].estimated_usd),0.01);
 for(const table of ['orders','payments','refunds','edu_consent_events'])assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,1,table);
 assert.ok((await db.query('select count(*)::int n from audit_logs')).rows[0].n>0);
 const receipt={requestId:accepted.requestId,erased:true,counts:Object.fromEntries(['sessions','report_requests','report_jobs','precision_calls','precision_stages','precision_artifacts','precision_quality_receipts','precision_issues','markdown_exports','precision_diagnostics','admin_report_events'].map(k=>[k,0])),storageRemoved:0,storageFailedCount:0};
 await assert.rejects(call('edu_finish_member_erasure',[accepted.requestId,job.lease,receipt,null,false]),/LOCAL_ERASURE_PENDING/);
 const files=await call('edu_list_member_erasure_files',[accepted.requestId,job.lease]);assert.equal(files.length,5);
 await assert.rejects(call('edu_record_member_erasure_files',[accepted.requestId,job.lease,[files[0].id]]),/LOCAL_STORAGE_PENDING/);
 await assert.rejects(call('edu_finish_member_local_erasure',[accepted.requestId,job.lease]),/LOCAL_STORAGE_PENDING/);
 await db.exec('reset role');await db.query('delete from storage.objects where name=$1',[files[0].path]);await db.exec('set role service_role');
 await call('edu_record_member_erasure_files',[accepted.requestId,job.lease,[files[0].id]]);await call('edu_record_member_erasure_files',[accepted.requestId,job.lease,[files[0].id]]);
 await assert.rejects(call('edu_finish_member_local_erasure',[accepted.requestId,job.lease]),/LOCAL_STORAGE_PENDING/);
 await db.exec('reset role');await db.query('delete from storage.objects where name=any($1)',[files.map(f=>f.path)]);await db.exec('set role service_role');
 await call('edu_record_member_erasure_files',[accepted.requestId,job.lease,files.map(f=>f.id)]);await call('edu_finish_member_local_erasure',[accepted.requestId,job.lease]);
 assert.deepEqual(await call('edu_prepare_member_local_erasure',[accepted.requestId,job.lease]),{ready:true});
 assert.equal(await call('edu_finish_member_erasure',[accepted.requestId,job.lease,receipt,null,false]),true);
 const [row]=await call('edu_read_member_erasure',[admin]);assert.ok(row.localErasedAt);assert.equal(row.localStorageRemoved,5);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from storage.objects where name=$1',[other+'/untouched.png'])).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from private.edu_erasure_storage_work where path is not null')).rows[0].n,0);
 // Simulate a pre-migration survivor on a completed request. A repeat must be a no-op.
 await db.query("update edu_campus_demo_questions set answer='이전 답변',answered_at=now(),revision=2 where id=$1",[question]);
 await db.exec(presenterMigration);
 await db.exec(presenterMigration);
 assert.deepEqual(await readQuestion(question),expectedQuestion);
 assert.equal((await readQuestion(unrelated)).answer,'유지할 답변');

});
