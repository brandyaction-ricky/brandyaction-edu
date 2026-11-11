begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Installs code only. Does not approve or run any withdrawal or transfer.
create or replace function private.edu_prepare_member_local_erasure(p_request uuid,p_lease uuid)
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
  -- Delivery rows reference both events and subscriptions with RESTRICT. Remove only
  -- this member's push deliveries first; retain their count in the erasure receipt.
  if to_regclass('public.edu_push_deliveries') is not null then
   delete from public.edu_push_deliveries where event_id in(select id from public.edu_push_events where user_id=subject)
    or subscription_id in(select id from public.edu_push_subscriptions where user_id=subject);
   get diagnostics n=row_count;total:=total||jsonb_build_object('push_deliveries',n);
  end if;
  -- Care delivery evidence stays. Detach the erased push event before deleting it.
  if to_regclass('public.edu_care_deliveries') is not null then
   update public.edu_care_deliveries set event_id=null,destination_hash=null
    where event_id in(select id from public.edu_push_events where user_id=subject);
   get diagnostics n=row_count;total:=total||jsonb_build_object('care_deliveries_unlinked',n);
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


-- Intake cancellation is possible only before approval or any access/data change.
-- Keep cancelled requests and their UUIDs permanently; a new intake gets a new UUID.
alter table public.edu_member_erasure_requests
 drop constraint edu_member_erasure_requests_state_check,
 drop constraint edu_member_erasure_requests_member_id_key,
 add column cancelled_at timestamptz,
 add column cancelled_by uuid references public.profiles(id),
 add constraint edu_member_erasure_requests_state_check check(state in ('requested','processing','retry','blocked','complete','cancelled')),
 add constraint edu_erasure_cancellation_pair check((state='cancelled')=(cancelled_at is not null) and (cancelled_at is null)=(cancelled_by is null)),
 add constraint edu_erasure_cancellation_before_approval check(state<>'cancelled' or (approved_at is null and disabled_at is null and auth_erased_at is null and local_prepared_at is null and local_erased_at is null and attempts=0));
create unique index edu_erasure_current_member on public.edu_member_erasure_requests(member_id) where state<>'cancelled';
create or replace function public.edu_request_member_erasure(p_actor uuid,p_member uuid,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; target public.profiles;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 if p_actor=p_member or p_environment is null or p_environment not in ('dev','production') then raise exception 'ERASURE_INVALID';end if;
 select * into target from public.profiles where id=p_member for update;
 if not found then raise exception 'ERASURE_NOT_FOUND';end if;
 select * into r from public.edu_member_erasure_requests where member_id=p_member and state<>'cancelled';
 if found then
   if r.environment<>p_environment then raise exception 'ERASURE_ENVIRONMENT';end if;
   return jsonb_build_object('requestId',r.request_id,'state',r.state);
 end if;
 if target.role='admin' and (select count(*) from public.profiles where role='admin' and status='active')<=1 then raise exception 'ERASURE_LAST_ADMIN';end if;
 insert into public.edu_member_erasure_requests(member_id,actor_id,environment) values(p_member,p_actor,p_environment) returning * into r;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'member.erasure_requested','profile',p_member::text,jsonb_build_object('requestId',r.request_id,'state','requested','deadlineAt',r.deadline_at));
 return jsonb_build_object('requestId',r.request_id,'state',r.state);
end;$$;


create function public.edu_cancel_member_erasure(p_actor uuid,p_request uuid,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and deleted_at is null) then raise exception 'ERASURE_FORBIDDEN';end if;
 if p_environment is null or p_environment not in ('dev','production') then raise exception 'ERASURE_ENVIRONMENT';end if;
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.environment<>p_environment then raise exception 'ERASURE_NOT_FOUND';end if;
 if r.state='cancelled' then return jsonb_build_object('requestId',p_request,'state','cancelled');end if;
 if r.state<>'requested' or r.approved_at is not null or r.disabled_at is not null or r.auth_erased_at is not null
  or r.local_prepared_at is not null or r.local_erased_at is not null or r.attempts<>0 or r.lease is not null
  or not exists(select 1 from public.profiles where id=r.member_id and status='active' and deleted_at is null)
 then raise exception 'ERASURE_CANNOT_CANCEL';end if;
 update public.edu_member_erasure_requests set state='cancelled',cancelled_at=now(),cancelled_by=p_actor,last_code=null where request_id=p_request;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'member.erasure_cancelled','profile',r.member_id::text,jsonb_build_object('requestId',p_request,'environment',p_environment));
 return jsonb_build_object('requestId',p_request,'state','cancelled');
end;$$;
revoke all on function public.edu_cancel_member_erasure(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_cancel_member_erasure(uuid,uuid,text) to service_role;

create or replace function public.edu_approve_member_erasure(p_actor uuid,p_request uuid,p_environment text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 if p_environment is null or p_environment not in ('dev','production') then raise exception 'ERASURE_ENVIRONMENT';end if;
 select * into r from public.edu_member_erasure_requests where request_id=p_request for update;
 if not found or r.environment<>p_environment then raise exception 'ERASURE_NOT_FOUND';end if;
 if r.member_id=p_actor then raise exception 'ERASURE_SELF';end if;
 if r.state='cancelled' then raise exception 'ERASURE_CANCELLED';end if;
 if r.state='complete' or (r.state='processing' and r.lease_until>now()) then
  return jsonb_build_object('requestId',r.request_id,'state',r.state);
 end if;
 -- Recheck current permission and last-administrator protection in the existing function.
 if r.disabled_at is null then
  if not exists(select 1 from public.profiles where id=r.member_id and status='withdrawn') then
   perform public.edu_delete_member(p_actor,r.member_id);
  end if;
  -- This address and channel choices were added after the original withdrawal function.
  update public.profiles set contact_email=null,marketing_use_consent_at=null,ad_sms_consent_at=null,
   ad_kakao_consent_at=null,ad_email_consent_at=null,consent_revision=gen_random_uuid(),consent_updated_at=now()
   where id=r.member_id;
  -- Preserve consent receipts; revoke the current choices and trigger downstream erasure.
  update public.edu_personalization_preferences set analysis=false,overseas=false,revision=gen_random_uuid(),updated_at=now() where member_id=r.member_id;
  update public.edu_diagnosis_outbox j set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null
   from public.edu_diagnosis_attempts a where j.attempt_id=a.id and a.user_id=r.member_id and j.state in ('pending','working');
 end if;
 update public.edu_member_erasure_requests set
  approved_at=coalesce(approved_at,now()),approved_by=coalesce(approved_by,p_actor),disabled_at=coalesce(disabled_at,now()),
  state='requested',lease=null,lease_until=null,last_code=null,
  next_attempt_at=now()
 where request_id=p_request;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'member.erasure_approved','profile',r.member_id::text,jsonb_build_object('requestId',p_request,'environment',p_environment));
 return jsonb_build_object('requestId',p_request,'state','requested');
end;$$;

create or replace function public.edu_claim_approved_member_erasure(p_environment text,p_limit integer default 3,p_request uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.edu_member_erasure_requests; jobs jsonb:='[]';token uuid;
begin
 if p_environment is null or p_environment not in ('dev','production') or p_limit is null or p_limit not between 1 and 3 then raise exception 'ERASURE_INVALID';end if;
 for r in select * from public.edu_member_erasure_requests
   where approved_at is not null and environment=p_environment and (p_request is null or request_id=p_request)
     and ((state in ('requested','retry') and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
   order by received_at for update skip locked limit p_limit loop
   if r.disabled_at is null then raise exception 'ERASURE_NOT_WITHDRAWN';end if;
   token:=gen_random_uuid();
   update public.edu_member_erasure_requests set state='processing',lease=token,lease_until=now()+interval '2 minutes',attempts=attempts+1,
     uncertain_attempts=uncertain_attempts+case when r.state='processing' then 1 else 0 end where request_id=r.request_id;
   jobs:=jobs||jsonb_build_array(jsonb_build_object('requestId',r.request_id,'subject',r.member_id,'environment',r.environment,'lease',token,'authErased',r.auth_erased_at is not null));
 end loop;
 return jobs;
end;$$;




create or replace function public.edu_read_member_erasure(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ERASURE_FORBIDDEN';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r."receivedAt" desc) from (
  select q.request_id as "requestId",q.member_id as "memberId",q.state,q.received_at as "receivedAt",q.deadline_at as "deadlineAt",
   q.next_attempt_at as "nextAttemptAt",q.attempts,q.uncertain_attempts as "uncertainAttempts",q.counts,q.storage_removed as "storageRemoved",
   q.storage_failed as "storageFailedCount",q.last_code as "lastCode",q.completed_at as "completedAt",q.cancelled_at as "cancelledAt",
   q.local_erased_at as "localErasedAt",q.local_counts as "localCounts",q.local_storage_removed as "localStorageRemoved",q.approved_at as "approvedAt",q.disabled_at as "disabledAt",q.auth_erased_at as "authErasedAt",
   case when q.disabled_at is null then p.full_name end as "memberName",
   case when q.disabled_at is null then p.email end as "memberEmail"
  from public.edu_member_erasure_requests q join public.profiles p on p.id=q.member_id order by q.received_at desc limit 100
 )r),'[]'::jsonb);
end;$$;

-- Retired callers must also honor explicit approval; intake must never delete access.
create or replace function public.edu_claim_member_erasure(p_environment text,p_limit integer default 3)
returns jsonb language sql security invoker set search_path='' as $$
 select public.edu_claim_approved_member_erasure(p_environment,p_limit,null);
$$;

-- Transfer access, not another member's personal records or payment ownership.
create table private.edu_enrollment_transfers(
 request_id uuid primary key,
 actor_id uuid not null references public.profiles(id),
 source_enrollment uuid not null references public.enrollments(id),
 source_order_item_id uuid references public.order_items(id),
 target_enrollment uuid not null unique references public.enrollments(id),
 source_member uuid not null references public.profiles(id),
 target_member uuid not null references public.profiles(id),
 reason text not null check(char_length(btrim(reason)) between 2 and 500),
 created_at timestamptz not null default now(),
 check(source_member<>target_member),check(source_enrollment<>target_enrollment)
);
alter table private.edu_enrollment_transfers enable row level security;
revoke all on private.edu_enrollment_transfers from public,anon,authenticated,service_role;
create index edu_enrollment_transfer_target_member on private.edu_enrollment_transfers(target_member);
create unique index edu_enrollment_transfer_source_acquisition on private.edu_enrollment_transfers(source_enrollment,coalesce(source_order_item_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index edu_enrollment_transfer_purchase on private.edu_enrollment_transfers(source_order_item_id) where source_order_item_id is not null;

-- Preserve the purchase enrollment/order link. A duplicate provider callback must not
-- reactivate a transferred source; a full refund must revoke every subsequent recipient.
create function private.edu_guard_transferred_enrollment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.edu_enrollment_transfers where source_enrollment=old.id and source_order_item_id is not distinct from old.order_item_id) then
  if row(new.user_id,new.course_id,new.cohort_id) is distinct from row(old.user_id,old.course_id,old.cohort_id) then raise exception 'TRANSFER_SOURCE_IMMUTABLE';end if;
  -- A genuinely new purchase by the original member is allowed. A replay of the
  -- transferred purchase must not restore their old access.
  if new.order_item_id is distinct from old.order_item_id then
   if not exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id
    where i.id=new.order_item_id and o.user_id=old.user_id and o.status='paid' and i.course_id=old.course_id and i.cohort_id=old.cohort_id) then raise exception 'TRANSFER_SOURCE_IMMUTABLE';end if;
  elsif new.status='active' then new.status:=old.status;new.revoked_at:=old.revoked_at;
  end if;
 end if;
 return new;
end;$$;

create function private.edu_revoke_transferred_access(p_source uuid,p_item uuid) returns void
language sql security definer set search_path='' as $$
 with recursive recipients(id) as (
  select target_enrollment from private.edu_enrollment_transfers where source_enrollment=p_source and source_order_item_id is not distinct from p_item
  union
  select t.target_enrollment from private.edu_enrollment_transfers t join recipients r on t.source_enrollment=r.id where t.source_order_item_id is null
 ) update public.enrollments set status='refunded',revoked_at=coalesce(revoked_at,now()),updated_at=now()
 where id in(select id from recipients) and order_item_id is null and status<>'refunded';
$$;
create function private.edu_propagate_transferred_refund() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()=1 and new.status='refunded' and old.status is distinct from new.status then
  perform private.edu_revoke_transferred_access(new.id,new.order_item_id);
 end if;
 return null;
end;$$;
-- A subsequent purchase can reuse the original member's enrollment row. Follow
-- the immutable purchase receipt as well, so refunding the earlier purchase still
-- revokes its recipients while preserving the genuinely new purchase.
create function private.edu_propagate_transferred_payment_refund() returns trigger
language plpgsql security definer set search_path='' as $$
declare t record;
begin
 if new.cancelled_amount>=new.approved_amount and new.approved_amount>0 and new.status='cancelled' then
  for t in select x.source_enrollment,x.source_order_item_id from private.edu_enrollment_transfers x
    join public.order_items i on i.id=x.source_order_item_id where i.order_id=new.order_id loop
   perform private.edu_revoke_transferred_access(t.source_enrollment,t.source_order_item_id);
  end loop;
 end if;
 return null;
end;$$;
revoke all on function private.edu_guard_transferred_enrollment(),private.edu_revoke_transferred_access(uuid,uuid),private.edu_propagate_transferred_refund(),private.edu_propagate_transferred_payment_refund() from public,anon,authenticated,service_role;
create trigger edu_transfer_source_guard before update on public.enrollments for each row execute function private.edu_guard_transferred_enrollment();
create trigger edu_transfer_refund after update of status on public.enrollments for each row execute function private.edu_propagate_transferred_refund();
create trigger edu_transfer_payment_refund after update of cancelled_amount,status on public.payments for each row execute function private.edu_propagate_transferred_payment_refund();

create function private.edu_transfer_enrollment(p_actor uuid,p_request uuid,p_source uuid,p_member uuid,p_target uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.enrollments; prior private.edu_enrollment_transfers; result uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and deleted_at is null) then raise exception 'TRANSFER_FORBIDDEN';end if;
 if p_request is null or p_source is null or p_member is null or p_target is null or p_member=p_target
  or p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then raise exception 'TRANSFER_INVALID';end if;
 -- Serialize retries without holding locks on unrelated transfers.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,118));
 select * into prior from private.edu_enrollment_transfers where request_id=p_request;
 if found then
  if row(prior.actor_id,prior.source_enrollment,prior.source_member,prior.target_member,prior.reason)
    is distinct from row(p_actor,p_source,p_member,p_target,btrim(p_reason)) then raise exception 'TRANSFER_REQUEST_REUSED';end if;
  return jsonb_build_object('enrollmentId',prior.target_enrollment,'targetMember',prior.target_member);
 end if;
 -- Profile locks are in UUID order, matching both directions of a possible transfer.
 perform 1 from public.profiles where id in(p_member,p_target) order by id for update;
 if (select count(*) from public.profiles where id in(p_member,p_target) and status='active' and deleted_at is null and role='student')<>2 then raise exception 'TRANSFER_MEMBER_INACTIVE';end if;
 -- Cohort lock serializes an ordinary grant and a transfer to the same recipient.
 select * into e from public.enrollments where id=p_source and user_id=p_member;
 if not found then raise exception 'TRANSFER_NOT_FOUND';end if;
 perform 1 from public.cohorts where id=e.cohort_id and status<>'cancelled' and archived_at is null for update;
 if not found then raise exception 'TRANSFER_COHORT_UNAVAILABLE';end if;
 select * into e from public.enrollments where id=p_source and user_id=p_member for update;
 if not found then raise exception 'TRANSFER_NOT_FOUND';end if;
 if e.status<>'active' or e.revoked_at is not null or (e.access_ends_at is not null and e.access_ends_at<=now())
  or exists(select 1 from private.edu_enrollment_transfers where source_enrollment=e.id and source_order_item_id is not distinct from e.order_item_id) then raise exception 'TRANSFER_NOT_ACTIVE';end if;
 if exists(select 1 from public.enrollments where user_id=p_target and cohort_id=e.cohort_id) then raise exception 'TRANSFER_TARGET_EXISTS';end if;
 -- The original row continues to link to its purchase, receipts and private work.
 update public.enrollments set status='revoked',revoked_at=now(),updated_at=now() where id=e.id;
 insert into public.enrollments(user_id,course_id,cohort_id,source,granted_by,status,access_starts_at,access_ends_at)
 values(p_target,e.course_id,e.cohort_id,'admin_grant',p_actor,'active',e.access_starts_at,e.access_ends_at) returning id into result;
 insert into private.edu_enrollment_transfers(request_id,actor_id,source_enrollment,source_order_item_id,target_enrollment,source_member,target_member,reason)
 values(p_request,p_actor,e.id,e.order_item_id,result,p_member,p_target,btrim(p_reason));
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'enrollment.transferred','enrollment',e.id::text,
 jsonb_build_object('member',p_member,'enrollmentId',e.id,'status',e.status),
 jsonb_build_object('requestId',p_request,'member',p_target,'enrollmentId',result,'reason',btrim(p_reason),'accessStartsAt',e.access_starts_at,'accessEndsAt',e.access_ends_at));
 return jsonb_build_object('enrollmentId',result,'targetMember',p_target);
end;$$;
revoke all on function private.edu_transfer_enrollment(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.edu_transfer_enrollment(uuid,uuid,uuid,uuid,uuid,text) to service_role;
create function public.edu_transfer_enrollment(p_actor uuid,p_request uuid,p_source uuid,p_member uuid,p_target uuid,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$select private.edu_transfer_enrollment(p_actor,p_request,p_source,p_member,p_target,p_reason);$$;
revoke all on function public.edu_transfer_enrollment(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_transfer_enrollment(uuid,uuid,uuid,uuid,uuid,text) to service_role;
commit;
