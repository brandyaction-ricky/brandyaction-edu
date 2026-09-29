begin;
-- Automatic learning notices are separate from manual sender batches, while
-- sharing an inbox sequence so pagination, ownership and read state stay stable.
create table public.edu_learning_notice_control(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into public.edu_learning_notice_control values(true,false);
alter table public.edu_learning_notice_control enable row level security;
revoke all on public.edu_learning_notice_control from public,anon,authenticated;
grant select on public.edu_learning_notice_control to service_role;
alter table public.edu_member_messages alter column sender_id drop not null,alter column request_id drop not null;
alter table public.edu_member_messages add column is_notice boolean not null default false,add column notice_source text,add column target_path text;
alter table public.edu_member_messages add constraint edu_message_notice_shape check(
 (not is_notice and sender_id is not null and request_id is not null and notice_source is null and target_path is null)
 or (is_notice and sender_id is null and request_id is null and reply_to is null and notice_source is not null and target_path is not null));
alter table public.edu_member_messages drop constraint edu_member_messages_content_check;
-- Preserve full question/answer snapshots, rather than truncate them to a manual message's limit.
alter table public.edu_member_messages add constraint edu_member_messages_content_check check(length(content)>=1 and content ~ '[^[:space:]]' and (is_notice or length(content)<=5000));
create unique index edu_learning_notice_once on public.edu_member_messages(recipient_id,notice_source) where is_notice;

create function public.edu_unread_member_messages(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 return jsonb_build_object('count',(select count(*) from public.edu_member_messages where recipient_id=p_actor and read_at is null
  and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor))));
end; $$;

create function edu_private.learning_notice(p_user uuid,p_kind text,p_source text,p_content text,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_user and status='active') then return; end if;
 if p_path not in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews','/admin/reviews?tab=blocks','/admin/reviews?tab=missions') and
   p_path !~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then raise exception 'MESSAGE_INVALID'; end if;
 if exists(select 1 from public.edu_learning_notice_control where singleton and enabled) then
  insert into public.edu_member_messages(recipient_id,content,is_notice,notice_source,target_path)
   values(p_user,p_content,true,p_kind||':'||p_source,p_path)
   on conflict(recipient_id,notice_source) where is_notice do nothing;
 end if;
 perform edu_private.enqueue_push(p_user,p_kind,p_source,p_path);
end; $$;

create or replace function edu_private.queue_learning_push()
returns trigger language plpgsql security invoker set search_path='' as $$
declare recipient uuid; source_id text; destination text; title text; body text;
begin
 if tg_table_name='edu_member_messages' then
  if not new.is_notice then perform edu_private.enqueue_push(new.recipient_id,'message',new.id::text,'/my/messages'); end if;
 elsif tg_table_name='edu_questions' then
  if tg_op='INSERT' then
   for recipient in select id from public.profiles where role='admin' and status='active' loop
    perform edu_private.learning_notice(recipient,'question',new.id::text,'[새 질문]'||E'\n\n'||new.title||E'\n'||new.content,'/admin/questions');
   end loop;
  elsif new.answer is distinct from old.answer and coalesce(btrim(new.answer),'')<>'' then
   source_id=new.id::text||':'||gen_random_uuid()::text;
   perform edu_private.learning_notice(new.user_id,'answer',source_id,'[질문함 답변]'||E'\n\nQ. '||new.content||E'\n\nA. '||new.answer,'/my/questions');
  end if;
 elsif tg_table_name='edu_lesson_block_submissions' then
  -- This constraint trigger runs at commit, after automatic review has been recorded.
  if new.outcome<>'submitted' or exists(select 1 from public.edu_lesson_block_reviews where submission_id=new.id) then return new; end if;
  select id into recipient from public.profiles where role='admin' and status='active' order by id limit 1;
  select l.title into title from public.curriculum_lessons l where id=new.lesson_id;
  if recipient is not null then perform edu_private.learning_notice(recipient,'submission',new.id::text,'[미션 승인 요청]'||E'\n'||coalesce(title,'학습')||'의 새 제출물을 확인해 주세요.','/admin/reviews?tab=blocks'); end if;
 elsif tg_table_name='edu_lesson_block_reviews' then
  if new.decision not in ('approved','changes_requested') then return new; end if;
  select e.user_id,'/learn/'||s.enrollment_id::text||'/'||s.lesson_id::text,l.title into recipient,destination,title
   from public.edu_lesson_block_submissions s join public.enrollments e on e.id=s.enrollment_id join public.curriculum_lessons l on l.id=s.lesson_id where s.id=new.submission_id;
  body:='['||case when new.decision='approved' then '미션 승인' else '미션 수정 요청' end||']'||E'\n'||coalesce(title,'학습')||E'\n\n'||coalesce(new.feedback,'');
  if recipient is not null then perform edu_private.learning_notice(recipient,'review',new.id::text,body,destination); end if;
 elsif tg_table_name='mission_submissions' then
  select e.user_id into recipient from public.enrollments e where e.id=new.enrollment_id;
  select m.title into title from public.curriculum_missions m where m.id=new.mission_id;
  if new.status='submitted' then
   if tg_op='UPDATE' then if old.status='submitted' then return new; end if; end if;
   select id into recipient from public.profiles where role='admin' and status='active' order by id limit 1;
   if recipient is not null then perform edu_private.learning_notice(recipient,'submission','legacy:'||new.id::text,'[미션 승인 요청]'||E'\n'||coalesce(title,'미션')||'의 새 제출물을 확인해 주세요.','/admin/reviews?tab=missions'); end if;
  elsif tg_op='UPDATE' then
   if new.status in ('approved','changes_requested','rejected') and new.status is distinct from old.status then
    body:='['||case when new.status='approved' then '미션 승인' else '미션 수정 요청' end||']'||E'\n'||coalesce(title,'미션')||E'\n\n'||coalesce(new.reviewer_feedback,'');
   elsif new.reviewer_feedback is distinct from old.reviewer_feedback and coalesce(btrim(new.reviewer_feedback),'')<>'' then
    body:='[멘토 피드백]'||E'\n'||coalesce(title,'미션')||E'\n\n'||new.reviewer_feedback;
   else return new; end if;
   if recipient is not null then perform edu_private.learning_notice(recipient,'review','legacy:'||new.id::text||':'||gen_random_uuid()::text,body,'/my/missions'); end if;
  end if;
 end if;
 return new;
end; $$;
drop trigger edu_block_submission_push on public.edu_lesson_block_submissions;
create constraint trigger edu_block_submission_push after insert on public.edu_lesson_block_submissions deferrable initially deferred for each row execute function edu_private.queue_learning_push();
create trigger edu_legacy_submission_push after insert or update of status,reviewer_feedback on public.mission_submissions for each row execute function edu_private.queue_learning_push();

alter table public.edu_push_events drop constraint edu_push_events_path_check;
alter table public.edu_push_events add constraint edu_push_events_path_check check(path in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews','/admin/reviews?tab=blocks','/admin/reviews?tab=missions') or path ~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$');

create or replace function public.edu_list_member_messages(p_actor uuid,p_box text,p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; cursor_value text; has_more boolean;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_box is null or p_box not in ('inbox','sent') or p_before<1 then raise exception 'MESSAGE_INVALID'; end if;
 with page as (
  select m.*,sender.full_name as sender_name,recipient.full_name as recipient_name
  from public.edu_member_messages m left join public.profiles sender on sender.id=m.sender_id join public.profiles recipient on recipient.id=m.recipient_id
  where (case when p_box='inbox' then m.recipient_id=p_actor else m.sender_id=p_actor end)
   and (not m.is_notice or m.target_path not like '/admin/%' or public.edu_message_operator(p_actor))
   and (p_before is null or m.sequence<p_before) order by m.sequence desc limit 26
 ), visible as (select * from page order by sequence desc limit 25)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'senderId',sender_id,'recipientId',recipient_id,
  'isNotice',is_notice,'targetPath',target_path,'senderName',case when is_notice then '브랜디에듀 알림' else sender_name end,'recipientName',recipient_name,'content',content,'replyTo',reply_to,'createdAt',created_at,'readAt',read_at) order by sequence desc) from visible),'[]'::jsonb),
  (select min(sequence)::text from visible),(select count(*)>25 from page) into items,cursor_value,has_more;
 return jsonb_build_object('rows',items,'nextCursor',case when has_more then cursor_value else null end,
  'unreadCount',(select count(*) from public.edu_member_messages where recipient_id=p_actor and read_at is null and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor))),
  'canSendToMembers',public.edu_message_operator(p_actor));
end;
$$;

create or replace function public.edu_mark_member_message_read(p_actor uuid,p_message uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare value timestamptz;
begin
 perform public.edu_assert_message_actor(p_actor);
 update public.edu_member_messages set read_at=coalesce(read_at,now()) where id=p_message and recipient_id=p_actor and (not is_notice or target_path not like '/admin/%' or public.edu_message_operator(p_actor)) returning read_at into value;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 return jsonb_build_object('id',p_message,'readAt',value);
end;
$$;

revoke all on function public.edu_unread_member_messages(uuid),edu_private.learning_notice(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.edu_unread_member_messages(uuid),edu_private.learning_notice(uuid,text,text,text,text) to service_role;
create or replace function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
  and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
  and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
  and (e.kind<>'submission' or case when e.source like 'legacy:%' then exists(select 1 from public.mission_submissions ms where 'legacy:'||ms.id::text=e.source and ms.status='submitted') else not exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id::text=e.source) end);
$$;
commit;
