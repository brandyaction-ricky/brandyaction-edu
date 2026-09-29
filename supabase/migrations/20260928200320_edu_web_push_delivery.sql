begin;
create table public.edu_push_control (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into public.edu_push_control(singleton,enabled) values(true,false);
create table public.edu_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 endpoint text not null unique check(length(endpoint) between 20 and 2048),
 p256dh text not null, auth text not null, binding uuid not null default gen_random_uuid(),
 enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index edu_push_subscription_owner on public.edu_push_subscriptions(user_id) where enabled;
create table public.edu_push_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('message','question','answer','submission','review')),
 source text not null check(length(source)<=200), path text not null check(path in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews') or path ~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
 created_at timestamptz not null default now(), unique(user_id,kind,source)
);
create table public.edu_push_deliveries (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.edu_push_events(id),
 subscription_id uuid not null references public.edu_push_subscriptions(id),binding uuid not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 attempts integer not null default 0,available_at timestamptz not null default now(),
 lease uuid,lease_until timestamptz,finished_at timestamptz,last_code text,
 unique(event_id,subscription_id)
);
create index edu_push_delivery_due on public.edu_push_deliveries(available_at,id) where status in ('pending','processing');
create index edu_push_delivery_subscription on public.edu_push_deliveries(subscription_id);
alter table public.edu_push_control enable row level security;
alter table public.edu_push_subscriptions enable row level security;
alter table public.edu_push_events enable row level security;
alter table public.edu_push_deliveries enable row level security;
revoke all on public.edu_push_control,public.edu_push_subscriptions,public.edu_push_events,public.edu_push_deliveries from public,anon,authenticated;
grant select on public.edu_push_control to service_role;
grant select,insert,update on public.edu_push_subscriptions,public.edu_push_deliveries to service_role;
grant select,insert on public.edu_push_events to service_role;

create function public.edu_register_push(p_actor uuid,p_endpoint text,p_key text,p_auth text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_push_subscriptions%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 if not exists(select 1 from public.edu_push_control where singleton and enabled) then raise exception 'PUSH_DISABLED'; end if;
 if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint!~'^https://' or p_key is null or p_key!~'^[A-Za-z0-9_-]{87}$' or p_auth is null or p_auth!~'^[A-Za-z0-9_-]{22}$' then raise exception 'PUSH_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-push-actor:'||p_actor::text,0));
 perform pg_advisory_xact_lock(hashtextextended('edu-push:'||p_endpoint,0));
 select * into s from public.edu_push_subscriptions where endpoint=p_endpoint for update;
 if found then
  if s.p256dh<>p_key or s.auth<>p_auth then raise exception 'PUSH_ENDPOINT_CHANGED'; end if;
  if s.user_id<>p_actor or not s.enabled then
   if (select count(*) from public.edu_push_subscriptions where user_id=p_actor and enabled)>=10 then raise exception 'PUSH_DEVICE_LIMIT'; end if;
   update public.edu_push_subscriptions set user_id=p_actor,binding=gen_random_uuid(),enabled=true,updated_at=now() where id=s.id returning * into s;
  end if;
 else
  if (select count(*) from public.edu_push_subscriptions where user_id=p_actor and enabled)>=10 then raise exception 'PUSH_DEVICE_LIMIT'; end if;
  insert into public.edu_push_subscriptions(user_id,endpoint,p256dh,auth) values(p_actor,p_endpoint,p_key,p_auth) returning * into s;
 end if;
 return jsonb_build_object('binding',s.binding,'enabled',true);
end; $$;
create function public.edu_push_device(p_actor uuid,p_endpoint text,p_disable boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.edu_push_subscriptions%rowtype;
begin
 perform public.edu_assert_message_actor(p_actor);
 if p_disable is null then raise exception 'PUSH_INVALID'; end if;
 if p_disable then update public.edu_push_subscriptions set enabled=false,updated_at=now() where endpoint=p_endpoint and user_id=p_actor; end if;
 select * into s from public.edu_push_subscriptions where endpoint=p_endpoint and user_id=p_actor and enabled;
 return jsonb_build_object('enabled',found,'binding',case when found then s.binding else null end);
end; $$;

create function edu_private.enqueue_push(p_user uuid,p_kind text,p_source text,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
declare event_id uuid;
begin
 if not exists(select 1 from public.edu_push_control where singleton and enabled) or not exists(select 1 from public.profiles where id=p_user and status='active') then return; end if;
 insert into public.edu_push_events(user_id,kind,source,path) values(p_user,p_kind,p_source,p_path)
  on conflict(user_id,kind,source) do nothing returning id into event_id;
 if event_id is null then return; end if;
 insert into public.edu_push_deliveries(event_id,subscription_id,binding)
  select event_id,s.id,s.binding from public.edu_push_subscriptions s where s.user_id=p_user and s.enabled;
end; $$;
create function edu_private.queue_learning_push()
returns trigger language plpgsql security invoker set search_path='' as $$
declare recipient uuid; source_id text; destination text;
begin
 if tg_table_name='edu_member_messages' then
  perform edu_private.enqueue_push(new.recipient_id,'message',new.id::text,'/my/messages');
 elsif tg_table_name='edu_questions' then
  if tg_op='INSERT' then
   for recipient in select id from public.profiles where role='admin' and status='active' loop
    perform edu_private.enqueue_push(recipient,'question',new.id::text,'/admin/questions');
   end loop;
  elsif new.answer is distinct from old.answer and coalesce(btrim(new.answer),'')<>'' then
   source_id=new.id::text||':'||gen_random_uuid()::text;
   perform edu_private.enqueue_push(new.user_id,'answer',source_id,'/my/questions');
  end if;
 elsif tg_table_name='edu_lesson_block_submissions' then
  if new.outcome<>'submitted' then return new; end if;
  select id into recipient from public.profiles where role='admin' and status='active' order by id limit 1;
  if recipient is not null then perform edu_private.enqueue_push(recipient,'submission',new.id::text,'/admin/reviews'); end if;
 elsif tg_table_name='edu_lesson_block_reviews' then
  if new.decision not in ('approved','changes_requested') then return new; end if;
  select e.user_id,'/learn/'||s.enrollment_id::text||'/'||s.lesson_id::text into recipient,destination from public.edu_lesson_block_submissions s join public.enrollments e on e.id=s.enrollment_id where s.id=new.submission_id;
  if recipient is not null then perform edu_private.enqueue_push(recipient,'review',new.id::text,destination); end if;
 end if;
 return new;
end; $$;
create trigger edu_message_push after insert on public.edu_member_messages for each row execute function edu_private.queue_learning_push();
create trigger edu_question_push after insert or update of answer on public.edu_questions for each row execute function edu_private.queue_learning_push();
create trigger edu_block_submission_push after insert on public.edu_lesson_block_submissions for each row execute function edu_private.queue_learning_push();
create trigger edu_block_review_push after insert on public.edu_lesson_block_reviews for each row execute function edu_private.queue_learning_push();

create function public.edu_claim_push(p_limit integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 15 then raise exception 'PUSH_INVALID'; end if;
 if not exists(select 1 from public.edu_push_control where singleton and enabled) then return '[]'::jsonb; end if;
 -- Expiry/rebinding/deactivation never sends a previous account's pending work.
 update public.edu_push_deliveries d set status='skipped',finished_at=now(),lease=null,lease_until=null
 from public.edu_push_events e,public.edu_push_subscriptions s,public.profiles p
 where d.event_id=e.id and d.subscription_id=s.id and p.id=e.user_id and d.status in ('pending','processing') and
  (not s.enabled or s.binding<>d.binding or s.user_id<>e.user_id or p.status is distinct from 'active' or e.created_at<now()-interval '24 hours'
   or (e.path like '/admin/%' and not public.edu_message_operator(e.user_id)));
 update public.edu_push_deliveries set status='failed',finished_at=now(),lease=null,lease_until=null,last_code='LEASE_EXHAUSTED'
 where status='processing' and lease_until<=now() and attempts>=6;
 with due as (
  select id from public.edu_push_deliveries where
   (status='pending' and available_at<=now()) or (status='processing' and lease_until<=now())
   order by available_at,id for update skip locked limit p_limit
 ), claimed as (
  update public.edu_push_deliveries d set status='processing',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from due where d.id=due.id returning d.id,d.lease
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease)),'[]'::jsonb) into result from claimed;
 return result;
end; $$;
create function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
  and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
  and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
  and (e.kind<>'submission' or not exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id::text=e.source));
$$;
create function public.edu_finish_push(p_id uuid,p_lease uuid,p_outcome text,p_code text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.edu_push_deliveries%rowtype;
begin
 if p_outcome is null or p_outcome not in ('sent','expired','retry','failed','skipped') or p_code is null or p_code!~'^[A-Z0-9_]{1,40}$' then raise exception 'PUSH_INVALID'; end if;
 select * into d from public.edu_push_deliveries where id=p_id and lease=p_lease and status='processing' and lease_until>now() for update;
 if not found then return false; end if;
 if p_outcome='expired' then
  update public.edu_push_subscriptions set enabled=false,updated_at=now() where id=d.subscription_id and binding=d.binding;
 end if;
 update public.edu_push_deliveries set
  status=case when p_outcome='retry' and attempts<6 then 'pending' when p_outcome in ('expired','failed','retry') then 'failed' else p_outcome end,
  available_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))::integer),
  finished_at=case when p_outcome='retry' and attempts<6 then null else now() end,
  lease=null,lease_until=null,last_code=p_code where id=d.id;
 return true;
end; $$;
revoke all on function public.edu_register_push(uuid,text,text,text),public.edu_push_device(uuid,text,boolean),public.edu_claim_push(integer),public.edu_read_push_delivery(uuid,uuid),public.edu_finish_push(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.edu_register_push(uuid,text,text,text),public.edu_push_device(uuid,text,boolean),public.edu_claim_push(integer),public.edu_read_push_delivery(uuid,uuid),public.edu_finish_push(uuid,uuid,text,text) to service_role;
revoke all on function edu_private.enqueue_push(uuid,text,text,text),edu_private.queue_learning_push() from public,anon,authenticated;
grant execute on function edu_private.enqueue_push(uuid,text,text,text),edu_private.queue_learning_push() to service_role;
commit;
