begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- This migration approves nobody. All destructive work is bound to an administrator-approved request/lease.
-- Financial records, coupon/consent receipts, audit/moderation evidence and shared threads remain.
alter table public.edu_member_erasure_requests
 add column local_prepared_at timestamptz,
 add column local_erased_at timestamptz,
 add column local_counts jsonb not null default '{}'::jsonb check(jsonb_typeof(local_counts)='object'),
 add column local_storage_removed integer not null default 0 check(local_storage_removed>=0);

create table private.edu_erasure_storage_work(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.edu_member_erasure_requests(request_id),
 bucket text not null check(bucket in ('question-images','lesson-answer-files','campus-portfolio-private')),
 key_hash text not null,
 path text,
 removed_at timestamptz,
 unique(request_id,bucket,key_hash),
 check((removed_at is null)=(path is not null))
);
alter table private.edu_erasure_storage_work enable row level security;
revoke all on private.edu_erasure_storage_work from public,anon,authenticated,service_role;

-- SECURITY DEFINER is confined to this private helper to read profiles without recursive profiles RLS.
-- It has no subject argument: an authenticated caller can check only their own JWT subject.
create function private.edu_account_access_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and (p.status='withdrawn' or p.deleted_at is not null));
$$;
revoke all on function private.edu_account_access_allowed() from public,anon;
grant execute on function private.edu_account_access_allowed() to authenticated,service_role;
grant usage on schema private to authenticated,service_role;

-- The pre-request hook also protects exposed SECURITY DEFINER RPCs, which table RLS cannot cover.
-- Storage/Realtime do not invoke this hook, so keep the restrictive policies below as well.
create function public.edu_account_request_guard() returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('role',true)='authenticated' then
  if not private.edu_account_access_allowed() then raise sqlstate 'PT401' using message='ACCOUNT_WITHDRAWN';end if;
 end if;
end;$$;
revoke all on function public.edu_account_request_guard() from public,anon;
grant execute on function public.edu_account_request_guard() to anon,authenticated,service_role;
do $$declare config text; t record;
begin
 select setting into config from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
 unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%' limit 1;
 if config is not null and config<>'pgrst.db_pre_request=public.edu_account_request_guard' then raise exception 'ERASURE_EXISTING_API_GUARD';end if;
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects')) loop
  execute format('create policy edu_withdrawn_account_deny on %I.%I as restrictive for all to authenticated using ((select private.edu_account_access_allowed())) with check ((select private.edu_account_access_allowed()))',t.nspname,t.relname);
 end loop;
end;$$;
alter role authenticator set pgrst.db_pre_request='public.edu_account_request_guard';
notify pgrst,'reload config';

create function private.edu_assert_erasure_lease(p_request uuid,p_lease uuid)
returns public.edu_member_erasure_requests language plpgsql security definer set search_path='' as $$
declare r public.edu_member_erasure_requests;
begin
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.state<>'processing' or r.lease is distinct from p_lease or r.lease_until<=now()
  or r.approved_at is null or r.disabled_at is null
  or not exists(select 1 from public.profiles where id=r.member_id and status='withdrawn') then raise exception 'ERASURE_LEASE_CHANGED';end if;
 return r;
end;$$;
revoke all on function private.edu_assert_erasure_lease(uuid,uuid) from public,anon,authenticated,service_role;

-- This private SECURITY DEFINER operation is necessary for append-only learner submissions and
-- private campus tables: do not grant DELETE globally to service_role. No caller-supplied SQL/table/subject.
create function private.edu_prepare_member_local_erasure(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.edu_member_erasure_requests;subject uuid;total jsonb:='{}';n bigint;pending integer;
begin
 r:=private.edu_assert_erasure_lease(p_request,p_lease);subject:=r.member_id;
 if r.local_erased_at is not null then return jsonb_build_object('ready',true);end if;
 -- Signed upload URLs are bearer tokens, valid for two hours even without a login session.
 -- Wait from access revocation, not file.created_at (an old unready row can be signed again).
 if r.disabled_at>now()-interval '2 hours 2 minutes' then raise exception 'LOCAL_UPLOAD_DRAIN_PENDING';end if;
 if r.local_prepared_at is null then
  insert into private.edu_erasure_storage_work(request_id,bucket,key_hash,path)
  select p_request,bucket,encode(sha256(convert_to(path,'UTF8')),'hex'),path from (
   select 'question-images'::text bucket,path from public.edu_question_images where owner_id=subject
   union select 'question-images',path from public.edu_question_answer_images where owner_id=subject or question_id in(select id from public.edu_questions where user_id=subject)
   union select 'lesson-answer-files',path from public.edu_lesson_answer_files where owner_id=subject
   union select 'campus-portfolio-private',path from public.edu_campus_portfolio_files where owner_id=subject
   union select bucket_id,name from storage.objects where bucket_id in ('question-images','lesson-answer-files','campus-portfolio-private') and name like subject::text||'/%'
  )f on conflict do nothing;
  -- Notifications cache question text in other administrators' inboxes; erase those copies too.
  update public.edu_member_messages m set content='탈퇴한 회원의 질문·답변 알림이 삭제되었습니다.'
   where m.is_notice and (exists(select 1 from public.edu_questions q where q.user_id=subject and strpos(m.notice_source,q.id::text)>0)
    or exists(select 1 from public.edu_question_answers a join public.edu_questions q on q.id=a.question_id where q.user_id=subject and strpos(m.notice_source,a.id::text)>0));
  get diagnostics n=row_count;total:=total||jsonb_build_object('question_notice_copies',n);
  update public.edu_message_batches set payload='{"erased":true}'::jsonb,receipt='{"erased":true}'::jsonb where actor_id=subject;
  if to_regclass('public.edu_question_assist_jobs') is not null then
   execute $op$delete from public.edu_question_assist_jobs where requested_by=$1 or question_id in(select id from public.edu_questions where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('question_assist_jobs',n);
  end if;
  if to_regclass('public.edu_ai_conversation_turns') is not null then
   execute $op$delete from public.edu_ai_conversation_turns where conversation_id in(select id from public.edu_ai_conversations where actor_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('ai_turns',n);
  end if;
  if to_regclass('public.edu_ai_conversations') is not null then
   execute $op$delete from public.edu_ai_conversations where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('ai_conversations',n);
  end if;
  if to_regclass('public.edu_ai_requests') is not null then
   execute $op$update public.edu_ai_requests set actor_id=null,enrollment_id=null,question_id=null,fingerprint=encode(sha256(gen_random_uuid()::text::bytea),'hex') where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('ai_usage_anonymized',n);
  end if;
  if to_regclass('public.edu_question_answers') is not null then
   execute $op$update public.edu_question_answers set content='탈퇴한 회원의 답변이 삭제되었습니다.',author_name='탈퇴회원',actor_id=null where actor_id=$1 and question_id not in(select id from public.edu_questions where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('own_answer_text',n);
  end if;
  if to_regclass('public.edu_question_answer_images') is not null then
   execute $op$delete from public.edu_question_answer_images where owner_id=$1 or question_id in(select id from public.edu_questions where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('question_answer_images',n);
  end if;
  if to_regclass('public.edu_questions') is not null then
   execute $op$delete from public.edu_questions where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('questions',n);
  end if;
  if to_regclass('public.edu_question_images') is not null then
   execute $op$delete from public.edu_question_images where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('question_images',n);
  end if;
  if to_regclass('public.edu_lesson_block_feedback') is not null then
   execute $op$delete from public.edu_lesson_block_feedback where submission_id in(select s.id from public.edu_lesson_block_submissions s join public.enrollments e on e.id=s.enrollment_id where e.user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('edu_lesson_block_feedback',n);
  end if;
  if to_regclass('public.edu_lesson_block_reviews') is not null then
   execute $op$delete from public.edu_lesson_block_reviews where submission_id in(select s.id from public.edu_lesson_block_submissions s join public.enrollments e on e.id=s.enrollment_id where e.user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('edu_lesson_block_reviews',n);
  end if;
  if to_regclass('public.edu_lesson_block_submissions') is not null then
   execute $op$delete from public.edu_lesson_block_submissions where enrollment_id in(select id from public.enrollments where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('edu_lesson_block_submissions',n);
  end if;
  if to_regclass('public.edu_lesson_block_drafts') is not null then
   execute $op$delete from public.edu_lesson_block_drafts where enrollment_id in(select id from public.enrollments where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('edu_lesson_block_drafts',n);
  end if;
  if to_regclass('public.mission_submissions') is not null then
   execute $op$delete from public.mission_submissions where enrollment_id in(select id from public.enrollments where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('mission_submissions',n);
  end if;
  if to_regclass('public.lesson_progress') is not null then
   execute $op$delete from public.lesson_progress where enrollment_id in(select id from public.enrollments where user_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('lesson_progress',n);
  end if;
  if to_regclass('public.edu_lesson_answer_files') is not null then
   execute $op$delete from public.edu_lesson_answer_files where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('lesson_files',n);
  end if;
  if to_regclass('private.edu_campus_office_dispatch_receipts') is not null then
   execute $op$delete from private.edu_campus_office_dispatch_receipts where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_office_dispatch_receipts',n);
  end if;
  if to_regclass('private.edu_campus_office_dispatches') is not null then
   execute $op$delete from private.edu_campus_office_dispatches where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_office_dispatches',n);
  end if;
  if to_regclass('private.edu_campus_office_receipts') is not null then
   execute $op$delete from private.edu_campus_office_receipts where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_office_receipts',n);
  end if;
  if to_regclass('private.edu_campus_community_receipts') is not null then
   execute $op$delete from private.edu_campus_community_receipts where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_community_receipts',n);
  end if;
  if to_regclass('private.edu_campus_community_flow_receipts') is not null then
   execute $op$delete from private.edu_campus_community_flow_receipts where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_community_flow_receipts',n);
  end if;
  if to_regclass('public.edu_campus_office_employees') is not null then
   execute $op$delete from public.edu_campus_office_employees where owner_id=$1$op$ using subject;get diagnostics n=row_count;total:=total||jsonb_build_object('edu_campus_office_employees',n);
  end if;
  if to_regclass('public.edu_campus_office_inbox_signals') is not null then
   execute $op$delete from public.edu_campus_office_inbox_signals where owner_id=$1$op$ using subject;get diagnostics n=row_count;total:=total||jsonb_build_object('edu_campus_office_inbox_signals',n);
  end if;
  if to_regclass('public.edu_campus_office_jobs') is not null then
   execute $op$delete from public.edu_campus_office_jobs where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_office_jobs',n);
  end if;
  if to_regclass('private.edu_campus_office_connectors') is not null then
   execute $op$delete from private.edu_campus_office_connectors where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.edu_campus_office_connectors',n);
  end if;
  if to_regclass('private.campus_student_reporting_pilot') is not null then
   execute $op$delete from private.campus_student_reporting_pilot where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.campus_student_reporting_pilot',n);
  end if;
  if to_regclass('private.campus_student_connections') is not null then
   execute $op$delete from private.campus_student_connections where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('private.campus_student_connections',n);
  end if;
  if to_regclass('public.edu_campus_focus_sessions') is not null then
   execute $op$delete from public.edu_campus_focus_sessions where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_focus_sessions',n);
  end if;
  if to_regclass('public.edu_campus_business_records') is not null then
   execute $op$delete from public.edu_campus_business_records where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_business_records',n);
  end if;
  if to_regclass('public.edu_campus_business_review_links') is not null then
   execute $op$delete from public.edu_campus_business_review_links where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_business_review_links',n);
  end if;
  if to_regclass('public.edu_campus_business_cases') is not null then
   execute $op$delete from public.edu_campus_business_cases where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_business_cases',n);
  end if;
  if to_regclass('public.edu_campus_archive_entries') is not null then
   execute $op$delete from public.edu_campus_archive_entries where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_archive_entries',n);
  end if;
  if to_regclass('public.edu_campus_personal_offices') is not null then
   execute $op$delete from public.edu_campus_personal_offices where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_personal_offices',n);
  end if;
  if to_regclass('public.edu_campus_preferences') is not null then
   execute $op$delete from public.edu_campus_preferences where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_preferences',n);
  end if;
  if to_regclass('public.edu_campus_space_profiles') is not null then
   execute $op$delete from public.edu_campus_space_profiles where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_space_profiles',n);
  end if;
  if to_regclass('public.edu_campus_space_presence') is not null then
   execute $op$delete from public.edu_campus_space_presence where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_space_presence',n);
  end if;
  if to_regclass('public.edu_campus_space_seats') is not null then
   execute $op$delete from public.edu_campus_space_seats where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_space_seats',n);
  end if;
  if to_regclass('public.edu_campus_space_chat') is not null then
   execute $op$delete from public.edu_campus_space_chat where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_space_chat',n);
  end if;
  if to_regclass('public.edu_campus_activity_batches') is not null then
   execute $op$delete from public.edu_campus_activity_batches where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_activity_batches',n);
  end if;
  if to_regclass('public.edu_campus_office_bookings') is not null then
   execute $op$delete from public.edu_campus_office_bookings where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_office_bookings',n);
  end if;
  if to_regclass('public.edu_campus_launches') is not null then
   execute $op$delete from public.edu_campus_launches where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_launches',n);
  end if;
  if to_regclass('public.edu_campus_feedback_acknowledgments') is not null then
   execute $op$delete from public.edu_campus_feedback_acknowledgments where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_feedback_acknowledgments',n);
  end if;
  if to_regclass('public.edu_campus_support_requests') is not null then
   execute $op$delete from public.edu_campus_support_requests where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_campus_support_requests',n);
  end if;
  if to_regclass('public.edu_mission_drafts') is not null then
   execute $op$delete from public.edu_mission_drafts where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_mission_drafts',n);
  end if;
  if to_regclass('public.edu_push_subscriptions') is not null then
   execute $op$delete from public.edu_push_subscriptions where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_push_subscriptions',n);
  end if;
  if to_regclass('public.edu_push_events') is not null then
   execute $op$delete from public.edu_push_events where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_push_events',n);
  end if;
  if to_regclass('public.edu_member_encouragements') is not null then
   execute $op$delete from public.edu_member_encouragements where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_member_encouragements',n);
  end if;
  if to_regclass('public.edu_member_visits') is not null then
   execute $op$delete from public.edu_member_visits where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_member_visits',n);
  end if;
  if to_regclass('public.edu_member_mvp') is not null then
   execute $op$delete from public.edu_member_mvp where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_member_mvp',n);
  end if;
  if to_regclass('public.course_content_claims') is not null then
   execute $op$delete from public.course_content_claims where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.course_content_claims',n);
  end if;
  if to_regclass('public.customer_journey_events') is not null then
   execute $op$delete from public.customer_journey_events where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.customer_journey_events',n);
  end if;
  if to_regclass('public.edu_event_actions') is not null then
   execute $op$delete from public.edu_event_actions where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_event_actions',n);
  end if;
  if to_regclass('public.crm_member_tags') is not null then
   execute $op$delete from public.crm_member_tags where member_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.crm_member_tags',n);
  end if;
  if to_regclass('public.member_group_members') is not null then
   execute $op$delete from public.member_group_members where member_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.member_group_members',n);
  end if;
  if to_regclass('public.kakao_sync_members') is not null then
   execute $op$delete from public.kakao_sync_members where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.kakao_sync_members',n);
  end if;
  if to_regclass('public.edu_mutation_receipts') is not null then
   execute $op$delete from public.edu_mutation_receipts where actor_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('public.edu_mutation_receipts',n);
  end if;
  if to_regclass('public.edu_campus_blocks') is not null then
   execute $op$delete from public.edu_campus_blocks where owner_id=$1 or target_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_blocks',n);
  end if;
  if to_regclass('public.edu_campus_post_revisions') is not null then
   execute $op$delete from public.edu_campus_post_revisions where post_id in(select id from public.edu_campus_posts where owner_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_post_revisions',n);
  end if;
  if to_regclass('public.edu_campus_posts') is not null then
   execute $op$update public.edu_campus_posts set alias='탈퇴회원',title='삭제된 게시글',body='탈퇴한 회원의 콘텐츠가 삭제되었습니다.',url='',image_urls='{}'::text[],visibility='private',hidden=true,revision=revision+1 where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_posts_tombstoned',n);
  end if;
  if to_regclass('public.edu_campus_comments') is not null then
   execute $op$update public.edu_campus_comments set alias='탈퇴회원',body='탈퇴한 회원의 댓글이 삭제되었습니다.',hidden=true where author_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_comments_tombstoned',n);
  end if;
  if to_regclass('public.edu_campus_exchanges') is not null then
   execute $op$update public.edu_campus_exchanges set alias='탈퇴회원',proposal='탈퇴한 회원과의 교환 내용이 삭제되었습니다.',result_note='',status='canceled',revision=revision+1 where proposer_id=$1 or recipient_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_exchanges_tombstoned',n);
  end if;
  if to_regclass('public.edu_campus_demo_questions') is not null then
   execute $op$update public.edu_campus_demo_questions set alias='탈퇴회원',body='탈퇴한 회원의 질문이 삭제되었습니다.',answer='',revision=revision+1 where author_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_demo_questions_tombstoned',n);
  end if;
  if to_regclass('public.edu_campus_demo_slots') is not null then
   execute $op$update public.edu_campus_demo_slots set status='canceled',revision=revision+1 where presenter_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_demo_slots_canceled',n);
  end if;
  if to_regclass('public.edu_campus_community_flow_history') is not null then
   execute $op$delete from public.edu_campus_community_flow_history where actor_id=$1 or post_id in(select id from public.edu_campus_posts where owner_id=$1)$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_history',n);
  end if;
  if to_regclass('public.edu_campus_office_sessions') is not null then
   execute $op$update public.edu_campus_office_sessions set title='취소된 모임',location_url='',shared_goal='',status='cancelled' where created_by=$1 and student_created$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('campus_student_sessions_canceled',n);
  end if;
  if to_regclass('public.edu_campus_portfolio_files') is not null then
   execute $op$update public.edu_campus_portfolio_files set name='삭제된 파일',path='erased/'||id::text,sha256=null,state='pending',ready_at=null,visibility='private',shared_at=null,revision=revision+1 where owner_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('portfolio_metadata_tombstoned',n);
  end if;
  if to_regclass('public.edu_member_messages') is not null then
   execute $op$update public.edu_member_messages set content='탈퇴한 회원의 메시지가 삭제되었습니다.' where sender_id=$1 or recipient_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('messages_tombstoned',n);
  end if;
  if to_regclass('public.enrollments') is not null then
   execute $op$update public.enrollments set status=case when status='active' then 'revoked' else status end,revoked_at=coalesce(revoked_at,now()) where user_id=$1$op$ using subject;get diagnostics n=row_count;
   total:=total||jsonb_build_object('enrollments_revoked',n);
  end if;
  update public.edu_member_erasure_requests set local_prepared_at=now(),local_counts=total where request_id=p_request;
 end if;
 select count(*) into pending from private.edu_erasure_storage_work where request_id=p_request and removed_at is null;
 return jsonb_build_object('ready',false,'pending',pending);
end;$$;
revoke all on function private.edu_prepare_member_local_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function private.edu_prepare_member_local_erasure(uuid,uuid) to service_role;

create function private.edu_list_member_erasure_files(p_request uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.edu_assert_erasure_lease(p_request,p_lease);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'bucket',bucket,'path',path)) from
 (select * from private.edu_erasure_storage_work where request_id=p_request and removed_at is null order by id limit 50)f),'[]');
end;$$;
create function private.edu_record_member_erasure_files(p_request uuid,p_lease uuid,p_files uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare f private.edu_erasure_storage_work;file_id uuid;
begin
 perform private.edu_assert_erasure_lease(p_request,p_lease);
 if p_files is null or cardinality(p_files)>50 then raise exception 'ERASURE_INVALID';end if;
 foreach file_id in array p_files loop
  select * into f from private.edu_erasure_storage_work where id=file_id and request_id=p_request for update;
  if not found then raise exception 'ERASURE_INVALID';end if;
  if f.removed_at is not null then continue;end if;
  -- A successful HTTP response alone is insufficient. Confirm absence from the Storage catalog.
  if exists(select 1 from storage.objects where bucket_id=f.bucket and name=f.path) then raise exception 'LOCAL_STORAGE_PENDING';end if;
  update private.edu_erasure_storage_work set path=null,removed_at=now() where id=f.id;
 end loop;
end;$$;
create function private.edu_finish_member_local_erasure(p_request uuid,p_lease uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.edu_member_erasure_requests;
begin
 r:=private.edu_assert_erasure_lease(p_request,p_lease);
 if r.local_prepared_at is null or exists(select 1 from private.edu_erasure_storage_work where request_id=p_request and removed_at is null)
 or exists(select 1 from storage.objects where bucket_id in ('question-images','lesson-answer-files','campus-portfolio-private') and name like r.member_id::text||'/%') then raise exception 'LOCAL_STORAGE_PENDING';end if;
 update public.edu_member_erasure_requests set local_erased_at=coalesce(local_erased_at,now()),
 local_storage_removed=(select count(*) from private.edu_erasure_storage_work where request_id=p_request and removed_at is not null) where request_id=p_request;
end;$$;
revoke all on function private.edu_list_member_erasure_files(uuid,uuid),private.edu_record_member_erasure_files(uuid,uuid,uuid[]),private.edu_finish_member_local_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function private.edu_list_member_erasure_files(uuid,uuid),private.edu_record_member_erasure_files(uuid,uuid,uuid[]),private.edu_finish_member_local_erasure(uuid,uuid) to service_role;

-- Keep minimal request/attempt evidence, but unlink erased remote sessions/reports only after MYIN confirms.
create function private.edu_unlink_erased_diagnosis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.approved_at is not null and new.state='complete' and old.state<>'complete' then
  update public.edu_diagnosis_attempts set state='needs_review',remote_response_id=null,report_id=null,remote_revision=-1,is_current=false,updated_at=now() where user_id=new.member_id;
 end if;
 return new;
end;$$;
revoke all on function private.edu_unlink_erased_diagnosis() from public,anon,authenticated,service_role;
create trigger edu_unlink_erased_diagnosis after update on public.edu_member_erasure_requests for each row execute function private.edu_unlink_erased_diagnosis();

create function private.edu_guard_local_erasure_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.approved_at is not null and new.state='complete' and old.state<>'complete' and new.local_erased_at is null then raise exception 'LOCAL_ERASURE_PENDING';end if;
 if new.state='retry' and new.local_erased_at is null and new.disabled_at is not null then
  new.next_attempt_at:=greatest(new.next_attempt_at,new.disabled_at+interval '2 hours 2 minutes');
 end if;
 return new;
end;$$;
revoke all on function private.edu_guard_local_erasure_completion() from public,anon,authenticated;
create trigger edu_local_erasure_completion before update on public.edu_member_erasure_requests for each row execute function private.edu_guard_local_erasure_completion();
create function public.edu_prepare_member_local_erasure(p_request uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.edu_prepare_member_local_erasure(p_request,p_lease); $$;
revoke all on function public.edu_prepare_member_local_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_prepare_member_local_erasure(uuid,uuid) to service_role;
create function public.edu_list_member_erasure_files(p_request uuid,p_lease uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.edu_list_member_erasure_files(p_request,p_lease); $$;
revoke all on function public.edu_list_member_erasure_files(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_list_member_erasure_files(uuid,uuid) to service_role;
create function public.edu_record_member_erasure_files(p_request uuid,p_lease uuid,p_files uuid[]) returns void language sql security invoker set search_path='' as $$ select private.edu_record_member_erasure_files(p_request,p_lease,p_files); $$;
revoke all on function public.edu_record_member_erasure_files(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.edu_record_member_erasure_files(uuid,uuid,uuid[]) to service_role;
create function public.edu_finish_member_local_erasure(p_request uuid,p_lease uuid) returns void language sql security invoker set search_path='' as $$ select private.edu_finish_member_local_erasure(p_request,p_lease); $$;
revoke all on function public.edu_finish_member_local_erasure(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_finish_member_local_erasure(uuid,uuid) to service_role;
create or replace function public.edu_read_member_erasure(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r."receivedAt" desc) from (
  select q.request_id as "requestId",q.member_id as "memberId",q.state,q.received_at as "receivedAt",q.deadline_at as "deadlineAt",
   q.next_attempt_at as "nextAttemptAt",q.attempts,q.uncertain_attempts as "uncertainAttempts",q.counts,q.storage_removed as "storageRemoved",
   q.storage_failed as "storageFailedCount",q.last_code as "lastCode",q.completed_at as "completedAt",
   q.local_erased_at as "localErasedAt",q.local_counts as "localCounts",q.local_storage_removed as "localStorageRemoved",q.approved_at as "approvedAt",q.disabled_at as "disabledAt",q.auth_erased_at as "authErasedAt",
   case when q.disabled_at is null then p.full_name end as "memberName",
   case when q.disabled_at is null then p.email end as "memberEmail"
  from public.edu_member_erasure_requests q join public.profiles p on p.id=q.member_id order by q.received_at desc limit 100
 )r),'[]'::jsonb);
end;$$;
commit;
