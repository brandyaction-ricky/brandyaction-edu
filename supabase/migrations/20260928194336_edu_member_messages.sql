begin;

-- Service-only RPCs derive ownership from the server-authenticated actor.
-- A batch and all recipients commit together; request receipts survive retries.
create table public.edu_message_batches (
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  payload jsonb not null,
  receipt jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
create index edu_message_batch_rate on public.edu_message_batches(actor_id,created_at desc);
create table public.edu_member_messages (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  sender_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  request_id uuid not null,
  content text not null check(length(content) between 1 and 5000 and content ~ '[^[:space:]]'),
  reply_to uuid references public.edu_member_messages(id),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key(sender_id,request_id) references public.edu_message_batches(actor_id,request_id),
  unique(sender_id,request_id,recipient_id),
  check(sender_id<>recipient_id)
);
create index edu_message_inbox on public.edu_member_messages(recipient_id,sequence desc);
create index edu_message_sent on public.edu_member_messages(sender_id,sequence desc);
create index edu_message_unread on public.edu_member_messages(recipient_id) where read_at is null;
create index edu_message_reply on public.edu_member_messages(reply_to) where reply_to is not null;
alter table public.edu_message_batches enable row level security;
alter table public.edu_member_messages enable row level security;
revoke all on public.edu_message_batches,public.edu_member_messages from public,anon,authenticated;
grant select,insert on public.edu_message_batches,public.edu_member_messages to service_role;
grant update(receipt) on public.edu_message_batches to service_role;
grant update(read_at) on public.edu_member_messages to service_role;
grant usage on sequence public.edu_member_messages_sequence_seq to service_role;

create function public.edu_message_operator(p_actor uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and
  (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
   where s.key='edu_staff_permissions_'||p.id::text and s.value->'members'='true'::jsonb))));
$$;
create function public.edu_assert_message_actor(p_actor uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'MESSAGE_FORBIDDEN'; end if;
end;
$$;

create function public.edu_send_member_message(p_actor uuid,p_request uuid,p_content text,p_recipients uuid[],p_reply uuid,p_ongoing uuid)
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
  select sender_id into target from public.edu_member_messages where id=p_reply and recipient_id=p_actor;
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

create function public.edu_list_member_messages(p_actor uuid,p_box text,p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; cursor_value text; has_more boolean;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_box is null or p_box not in ('inbox','sent') or p_before<1 then raise exception 'MESSAGE_INVALID'; end if;
 with page as (
  select m.*,sender.full_name as sender_name,recipient.full_name as recipient_name
  from public.edu_member_messages m join public.profiles sender on sender.id=m.sender_id join public.profiles recipient on recipient.id=m.recipient_id
  where (case when p_box='inbox' then m.recipient_id=p_actor else m.sender_id=p_actor end)
   and (p_before is null or m.sequence<p_before) order by m.sequence desc limit 26
 ), visible as (select * from page order by sequence desc limit 25)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'senderId',sender_id,'recipientId',recipient_id,
  'senderName',sender_name,'recipientName',recipient_name,'content',content,'replyTo',reply_to,'createdAt',created_at,'readAt',read_at) order by sequence desc) from visible),'[]'::jsonb),
  (select min(sequence)::text from visible),(select count(*)>25 from page) into items,cursor_value,has_more;
 return jsonb_build_object('rows',items,'nextCursor',case when has_more then cursor_value else null end,
  'unreadCount',(select count(*) from public.edu_member_messages where recipient_id=p_actor and read_at is null),
  'canSendToMembers',public.edu_message_operator(p_actor));
end;
$$;

create function public.edu_mark_member_message_read(p_actor uuid,p_message uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare value timestamptz;
begin
 perform public.edu_assert_message_actor(p_actor);
 update public.edu_member_messages set read_at=coalesce(read_at,now()) where id=p_message and recipient_id=p_actor returning read_at into value;
 if not found then raise exception 'MESSAGE_NOT_FOUND'; end if;
 return jsonb_build_object('id',p_message,'readAt',value);
end;
$$;

create function public.edu_message_recipients(p_actor uuid,p_search text,p_after uuid,p_ongoing uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; next_id uuid; has_more boolean;
begin
 if not public.edu_message_operator(p_actor) then raise exception 'MESSAGE_FORBIDDEN'; end if;
 if p_search is null or length(p_search)>100 then raise exception 'MESSAGE_INVALID'; end if;
 with page as (
  select p.id,p.full_name,p.email from public.profiles p where p.status='active' and p.id<>p_actor and (p_after is null or p.id>p_after)
   and (p_search='' or strpos(lower(coalesce(p.full_name,'')||' '||coalesce(p.email,'')),lower(p_search))>0)
   and (p_ongoing is null or exists(select 1 from public.edu_ongoing_completions c join public.enrollments e on e.id=c.enrollment_id
    where c.lesson_id=p_ongoing and e.user_id=p.id)) order by p.id limit 26
 ), visible as (select * from page order by id limit 25)
 select coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'email',email) order by id) from visible),'[]'::jsonb),
  (select id from visible order by id desc limit 1),(select count(*)>25 from page) into items,next_id,has_more;
 return jsonb_build_object('rows',items,'nextCursor',case when has_more then next_id else null end);
end;
$$;

revoke all on function public.edu_message_operator(uuid),public.edu_assert_message_actor(uuid),public.edu_send_member_message(uuid,uuid,text,uuid[],uuid,uuid),public.edu_list_member_messages(uuid,text,bigint),public.edu_mark_member_message_read(uuid,uuid),public.edu_message_recipients(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_message_operator(uuid),public.edu_assert_message_actor(uuid),public.edu_send_member_message(uuid,uuid,text,uuid[],uuid,uuid),public.edu_list_member_messages(uuid,text,bigint),public.edu_mark_member_message_read(uuid,uuid),public.edu_message_recipients(uuid,text,uuid,uuid) to service_role;
commit;
