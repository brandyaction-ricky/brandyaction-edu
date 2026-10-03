begin;
-- Retain send receipts and reply references; removal hides the content from both boxes.
alter table public.edu_member_messages
 add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id),
 add constraint edu_message_deletion_shape check(
  (deleted_at is null and deleted_by is null) or
  (deleted_at is not null and deleted_by is not null and (is_notice or deleted_by=sender_id)));
grant update(deleted_at,deleted_by) on public.edu_member_messages to service_role;
create index edu_message_visible_unread on public.edu_member_messages(recipient_id)
 where read_at is null and deleted_at is null;

create function public.edu_delete_member_message(p_actor uuid,p_message uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.edu_member_messages%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 if not public.edu_message_operator(p_actor) then raise exception 'MESSAGE_FORBIDDEN'; end if;
 select * into item from public.edu_member_messages where id=p_message and sender_id=p_actor and not is_notice for update;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 if item.deleted_at is null then
  update public.edu_member_messages set deleted_at=now(),deleted_by=p_actor where id=p_message returning * into item;
 end if;
 -- Older message deliveries are cancelled; delivered OS notifications cannot be recalled.
 update public.edu_push_deliveries d set status='skipped',lease=null,lease_until=null,
  finished_at=now(),last_code='MESSAGE_DELETED'
 from public.edu_push_events e where e.id=d.event_id and e.kind='message' and e.source=p_message::text
  and d.status in ('pending','processing');
 return jsonb_build_object('id',item.id,'deletedAt',item.deleted_at);
end; $$;
revoke all on function public.edu_delete_member_message(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_delete_member_message(uuid,uuid) to service_role;

create or replace function public.edu_unread_member_messages(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 return jsonb_build_object('count',(select count(*) from public.edu_member_messages
  where recipient_id=p_actor and read_at is null and deleted_at is null
  and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor))));
end; $$;

create or replace function public.edu_list_member_messages(p_actor uuid,p_box text,p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; cursor_value text; has_more boolean;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_box is null or p_box not in ('inbox','sent') or p_before<1 then raise exception 'MESSAGE_INVALID'; end if;
 with page as (
  select m.*,sender.full_name as sender_name,recipient.full_name as recipient_name
  from public.edu_member_messages m left join public.profiles sender on sender.id=m.sender_id join public.profiles recipient on recipient.id=m.recipient_id
  where m.deleted_at is null and (case when p_box='inbox' then m.recipient_id=p_actor else m.sender_id=p_actor end)
   and (not m.is_notice or m.target_path not like '/admin/%' or public.edu_message_operator(p_actor))
   and (p_before is null or m.sequence<p_before) order by m.sequence desc limit 26
 ), visible as (select * from page order by sequence desc limit 25)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'senderId',sender_id,'recipientId',recipient_id,
  'canDelete',not is_notice and sender_id=p_actor and public.edu_message_operator(p_actor),'isNotice',is_notice,'targetPath',target_path,'senderName',case when is_notice then '브랜디에듀 알림' else sender_name end,'recipientName',recipient_name,'content',content,'replyTo',reply_to,'createdAt',created_at,'readAt',read_at) order by sequence desc) from visible),'[]'::jsonb),
  (select min(sequence)::text from visible),(select count(*)>25 from page) into items,cursor_value,has_more;
 return jsonb_build_object('rows',items,'nextCursor',case when has_more then cursor_value else null end,
  'unreadCount',(select count(*) from public.edu_member_messages where recipient_id=p_actor and read_at is null and deleted_at is null and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor))),
  'canSendToMembers',public.edu_message_operator(p_actor));
end;
$$;

create or replace function public.edu_mark_member_message_read(p_actor uuid,p_message uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare value timestamptz;
begin
 perform public.edu_assert_message_actor(p_actor);
 update public.edu_member_messages set read_at=coalesce(read_at,now()) where id=p_message and deleted_at is null and recipient_id=p_actor and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor)) returning read_at into value;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 return jsonb_build_object('id',p_message,'readAt',value);
end;
$$;

create or replace function public.edu_send_member_message(p_actor uuid,p_request uuid,p_content text,p_recipients uuid[],p_reply uuid,p_ongoing uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare targets uuid[]; body jsonb; previous public.edu_message_batches%rowtype; result jsonb; operator boolean; target uuid;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_request is null or p_content is null or length(p_content)>5000 or p_content!~'[^[:space:]]' or
  p_recipients is null or cardinality(p_recipients)>100 or array_position(p_recipients,null) is not null or
  (p_reply is not null and cardinality(p_recipients)>0) then raise exception 'MESSAGE_INVALID'; end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into targets from unnest(p_recipients) x;
 body=jsonb_build_object('content',p_content,'recipients',targets,'replyTo',p_reply,'ongoingLesson',p_ongoing);
 -- Serialize all sends by one actor, including request replay and rate checks.
 perform pg_advisory_xact_lock(hashtextextended('edu-message:'||p_actor::text,0));
 select * into previous from public.edu_message_batches where actor_id=p_actor and request_id=p_request;
 if found then
  if previous.payload<>body then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
  return previous.receipt;
 end if;
 operator=public.edu_message_operator(p_actor);
 if not operator and (cardinality(targets)>0 or p_ongoing is not null) then raise exception 'MESSAGE_FORBIDDEN'; end if;
 if p_reply is not null then
  select sender_id into target from public.edu_member_messages where id=p_reply and recipient_id=p_actor and deleted_at is null for share;
  if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
  if not operator and not public.edu_message_operator(target) then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE'; end if;
  targets=array[target];
 elsif not operator then
  select id into target from public.profiles where status='active' and role='admin' and id<>p_actor order by id limit 1;
  if not found then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE'; end if;
  targets=array[target];
 end if;
 if cardinality(targets)=0 then raise exception 'MESSAGE_INVALID'; end if;
 if exists(select 1 from unnest(targets) t left join public.profiles p on p.id=t
  where p.id is null or p.status<>'active' or p.status is null or p.id=p_actor) then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE'; end if;
 if p_ongoing is not null and exists(select 1 from unnest(targets) t where not exists(
  select 1 from public.edu_ongoing_completions c join public.enrollments e on e.id=c.enrollment_id
  where c.lesson_id=p_ongoing and e.user_id=t)) then raise exception 'MESSAGE_RECIPIENT_CHANGED'; end if;
 if (select count(*) from public.edu_message_batches where actor_id=p_actor and created_at>now()-interval '1 minute')>=20 then raise exception 'MESSAGE_RATE_LIMIT'; end if;
 insert into public.edu_message_batches(actor_id,request_id,payload) values(p_actor,p_request,body);
 insert into public.edu_member_messages(sender_id,recipient_id,request_id,content,reply_to)
  select p_actor,t,p_request,p_content,p_reply from unnest(targets) t;
 select jsonb_build_object('requestId',p_request,'count',count(*),'messageIds',jsonb_agg(id order by sequence),'createdAt',min(created_at)) into result
  from public.edu_member_messages where sender_id=p_actor and request_id=p_request;
 update public.edu_message_batches set receipt=result where actor_id=p_actor and request_id=p_request;
 return result;
end;
$$;


alter table public.edu_question_answers add column deleted_at timestamptz,
 add column deleted_by uuid references public.profiles(id),
 add constraint edu_question_answer_deletion_shape check(
  (deleted_at is null and deleted_by is null) or (deleted_at is not null and deleted_by is not null and source<>'learner'));
grant update(deleted_at,deleted_by) on public.edu_question_answers to service_role;

-- Summary repair must not manufacture another legacy answer or notification.
create or replace function edu_private.capture_legacy_question_answer()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.answer is distinct from old.answer and new.answer ~ '[^[:space:]]' then
  if new.answer_head_id is distinct from old.answer_head_id and exists(select 1 from public.edu_question_answers where id=new.answer_head_id and question_id=new.id and content=new.answer and deleted_at is null) then return new; end if;
  if exists(select 1 from public.edu_question_answers where question_id=new.id and deleted_at is not null and content=old.answer)
   and new.answer is not distinct from (select content from public.edu_question_answers where question_id=new.id and source<>'learner' and deleted_at is null order by sequence desc limit 1)
   then return new; end if;
  insert into public.edu_question_answers(question_id,author_name,source,content) values(new.id,'운영자','legacy',new.answer);
 end if;
 return new;
end; $$;

create function public.edu_delete_question_answer(p_actor uuid,p_question uuid,p_answer uuid,p_expected_head uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; a public.edu_question_answers%rowtype; last_source text; last_content text;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select * into q from public.edu_questions where id=p_question for update;
 if not found or q.is_archived then raise exception 'QUESTION_NOT_FOUND'; end if;
 select * into a from public.edu_question_answers where id=p_answer and question_id=q.id and source<>'learner' for update;
 if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
 if a.actor_id is distinct from p_actor and not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'BLOCK_FORBIDDEN'; end if;
 -- Repeat deletion is a receipt lookup, even after a later answer was appended.
 if a.deleted_at is not null then return jsonb_build_object('id',a.id,'questionId',q.id,'deletedAt',a.deleted_at); end if;
 if q.answer_head_id is distinct from p_expected_head then raise exception 'QUESTION_CHANGED'; end if;
 update public.edu_question_answers set deleted_at=now(),deleted_by=p_actor where id=a.id returning * into a;
 select source into last_source from public.edu_question_answers where question_id=q.id and deleted_at is null order by sequence desc limit 1;
 select content into last_content from public.edu_question_answers where question_id=q.id and source<>'learner' and deleted_at is null order by sequence desc limit 1;
 -- Keep the immutable head as the latest write token; deleted receipts are never resurrected.
 update public.edu_questions set answer=last_content,
  status=case when last_source is null or last_source='learner' then 'open' else 'answered' end,
  is_resolved=false,updated_at=now() where id=q.id;
 -- Cached drafts prepared before deletion must fail their existing fingerprint check.
 update public.edu_question_assist_jobs set question_fingerprint='deleted-answer:'||a.id::text
  where question_id=q.id and status in ('waiting','draft');
 update public.edu_shared_answers set published=false,updated_at=now() where source_question_id=q.id and published;
 update public.edu_member_messages set deleted_at=now(),deleted_by=p_actor
  where is_notice and notice_source='answer:'||a.id::text and deleted_at is null;
 update public.edu_push_deliveries d set status='skipped',lease=null,lease_until=null,finished_at=now(),last_code='ANSWER_DELETED'
  from public.edu_push_events e where e.id=d.event_id and e.kind='answer' and e.source=a.id::text and d.status in ('pending','processing');
 return jsonb_build_object('id',a.id,'questionId',q.id,'deletedAt',a.deleted_at);
end; $$;
revoke all on function public.edu_delete_question_answer(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_delete_question_answer(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.edu_read_question_thread(p_actor uuid,p_question uuid,p_before bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare q public.edu_questions%rowtype; operator boolean; answer_rows jsonb; next_cursor text;
begin
 perform public.edu_assert_message_actor(p_actor);
 operator:=public.edu_message_operator(p_actor);
 select * into q from public.edu_questions where id=p_question;
 if not found or (not operator and (q.is_archived or (q.user_id<>p_actor and not public.edu_can_read_cohort_question(p_actor,q.id)))) then raise exception 'QUESTION_NOT_FOUND'; end if;
 if p_before<1 then raise exception 'QUESTION_INVALID'; end if;
 with page as (
  select * from public.edu_question_answers where question_id=q.id and deleted_at is null and (p_before is null or sequence<p_before) order by sequence desc limit 21
 ), visible as (select * from page order by sequence desc limit 20)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'authorName',case when source='learner' and not operator and q.user_id<>p_actor then '수강생' else author_name end,'source',source,'canDelete',operator and not q.is_archived and source<>'learner' and (actor_id=p_actor or exists(select 1 from public.profiles where id=p_actor and role='admin')),'content',content,'createdAt',created_at) order by sequence) from visible),'[]'::jsonb),
  case when (select count(*) from page)>20 then (select min(sequence)::text from visible) else null end into answer_rows,next_cursor;
 return jsonb_build_object('question',jsonb_build_object('id',q.id,'title',q.title,'content',q.content,'learningContext',q.learning_context,'status',q.status,'resolved',q.is_resolved,'archived',q.is_archived,'headId',q.answer_head_id,'imageId',q.image_id,'visibility',q.visibility),
  'answers',answer_rows,'nextCursor',next_cursor,'canAnswer',operator and not q.is_archived,
  'canFollowUp',q.user_id=p_actor and not q.is_archived);
end; $$;


commit;
