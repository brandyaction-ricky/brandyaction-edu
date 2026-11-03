begin;

-- Separate opt-in learning-care queue. Ordinary inbox messages never gain push.
create table public.edu_care_delivery_batches (
 actor_id uuid not null, request_id uuid not null, mode text not null check(mode in ('push_first','all')),
 channels text[] not null, template_id uuid, primary key(actor_id,request_id),
 foreign key(actor_id,request_id) references public.edu_learning_care_sends(actor_id,request_id)
);
create table public.edu_care_deliveries (
 id uuid primary key default gen_random_uuid(), message_id uuid not null references public.edu_member_messages(id),
 channel text not null check(channel in ('push','email','alimtalk','sms')), destination_hash text,
 template_id uuid, event_id uuid references public.edu_push_events(id),
 status text not null default 'pending' check(status in ('pending','processing','accepted','failed','unknown','skipped')),
 lease uuid, lease_until timestamptz, code text, provider_id text,
 created_at timestamptz not null default now(), finished_at timestamptz,
 unique(message_id,channel)
);
create index edu_care_deliveries_due on public.edu_care_deliveries(created_at,id) where status in ('pending','processing') and channel<>'push';
alter table public.edu_care_delivery_batches enable row level security;
alter table public.edu_care_deliveries enable row level security;
revoke all on public.edu_care_delivery_batches,public.edu_care_deliveries from public,anon,authenticated;
grant select,insert on public.edu_care_delivery_batches to service_role;
grant select,insert,update on public.edu_care_deliveries to service_role;

create function edu_private.care_contacts(p_member uuid)
returns table(email text,phone text,push boolean) language sql stable security invoker set search_path='' as $$
 select case when trim(coalesce(nullif(p.contact_email,''),p.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   then lower(trim(coalesce(nullif(p.contact_email,''),p.email))) end,
 case when regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') ~ '^01[016789][0-9]{7,8}$'
   then regexp_replace(p.phone,'[^0-9]','','g') end,
 coalesce((select enabled from public.edu_push_control where singleton),false) and exists(select 1 from public.edu_push_subscriptions s where s.user_id=p.id and s.enabled)
 from public.profiles p where p.id=p_member and p.status='active' and p.role not in ('admin','staff');
$$;
create function public.edu_care_channel_reach(p_actor uuid,p_members uuid[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_members is null or cardinality(p_members)>100 or array_position(p_members,null) is not null then raise exception 'CARE_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('memberId',id,'push',coalesce(c.push,false),'email',c.email is not null,'alimtalk',c.phone is not null,'sms',c.phone is not null,
  'emailMasked',case when c.email is not null then left(c.email,1)||'***@'||split_part(c.email,'@',2) end,
  'phoneMasked',case when c.phone is not null then left(c.phone,3)||'****'||right(c.phone,4) end) order by id),'[]') into result
 from (select distinct unnest(p_members) id) members left join lateral edu_private.care_contacts(id) c on true;
 return result;
end; $$;

-- Recheck access and lesson state just before dispatch, without treating this
-- batch's own inbox message as a new 24-hour exclusion.
create function edu_private.care_delivery_allowed(p_message uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.edu_member_messages m
 join public.edu_learning_care_sends b on b.actor_id=m.sender_id and b.request_id=m.request_id
 join public.edu_care_delivery_batches cb on cb.actor_id=b.actor_id and cb.request_id=b.request_id
 join public.profiles p on p.id=m.recipient_id
 join public.enrollments e on e.user_id=p.id and e.cohort_id=b.cohort_id
 join public.courses c on c.id=e.course_id
 cross join lateral jsonb_array_elements(edu_private.edu_learning_care_cells(e.id)) cell
 where m.id=p_message and m.deleted_at is null and m.created_at>now()-interval '24 hours'
 and public.edu_message_operator(m.sender_id) and p.status='active' and p.role not in ('admin','staff')
 and c.archived_at is null and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and cell->>'track' is distinct from 'daily'
 and cell->>'lessonId'=b.lesson_id::text and cell->>'state' in ('not_submitted','changes_requested'));
$$;
create function public.edu_care_delivery_receipt(p_actor uuid,p_request uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select b.receipt || jsonb_build_object('deliveries',coalesce((select jsonb_agg(jsonb_build_object(
  'memberId',m.recipient_id,'channel',d.channel,'status',case when d.channel<>'push' then d.status
   when exists(select 1 from public.edu_push_deliveries pd where pd.event_id=d.event_id and pd.status='sent') then 'sent'
   when exists(select 1 from public.edu_push_deliveries pd where pd.event_id=d.event_id and pd.status in ('pending','processing')) then 'pending'
   when exists(select 1 from public.edu_push_deliveries pd where pd.event_id=d.event_id and pd.status='failed') then 'failed'
   else 'skipped' end,'code',d.code) order by m.recipient_id,d.channel)
 from public.edu_member_messages m join public.edu_care_deliveries d on d.message_id=m.id
 where m.sender_id=b.actor_id and m.request_id=b.request_id),'[]')) into result
 from public.edu_learning_care_sends b where b.actor_id=p_actor and b.request_id=p_request;
 return result;
end; $$;
create function public.edu_send_learning_care_channels(p_actor uuid,p_request uuid,p_cohort uuid,p_lesson uuid,p_recipients uuid[],p_content text,p_mode text,p_channels text[],p_template uuid,p_routes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare channels text[]; prior public.edu_care_delivery_batches%rowtype; m record; c record; channel text; chosen text[]; event uuid; routes jsonb:='[]';
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_mode is null or p_mode not in ('push_first','all') or p_channels is null or cardinality(p_channels)>4
 or array_position(p_channels,null) is not null or not p_channels<@array['push','email','alimtalk','sms']::text[]
 or ('alimtalk'=any(p_channels) and p_template is null) then raise exception 'CARE_INVALID'; end if;
 select coalesce(array_agg(distinct x order by x),'{}'::text[]) into channels from unnest(p_channels) x;
 perform pg_advisory_xact_lock(hashtextextended('edu-message:'||p_actor::text,0));
 select * into prior from public.edu_care_delivery_batches where actor_id=p_actor and request_id=p_request;
 if found then
  if prior.mode<>p_mode or prior.channels<>channels then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
  perform public.edu_send_learning_care(p_actor,p_request,p_cohort,p_lesson,p_recipients,p_content);
  return public.edu_care_delivery_receipt(p_actor,p_request);
 end if;
 if exists(select 1 from public.edu_learning_care_sends where actor_id=p_actor and request_id=p_request) then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
 perform public.edu_send_learning_care(p_actor,p_request,p_cohort,p_lesson,p_recipients,p_content);
 insert into public.edu_care_delivery_batches values(p_actor,p_request,p_mode,channels,p_template);
 for m in select * from public.edu_member_messages where sender_id=p_actor and request_id=p_request order by recipient_id loop
  if not edu_private.care_delivery_allowed(m.id) then raise exception 'CARE_RECIPIENT_CHANGED'; end if;
  select * into c from edu_private.care_contacts(m.recipient_id);
  chosen:='{}';
  if 'push'=any(channels) and c.push then chosen:=array['push']; end if;
  if p_mode='all' or cardinality(chosen)=0 then
   if 'email'=any(channels) and c.email is not null then chosen:=array_append(chosen,'email'); end if;
   if 'alimtalk'=any(channels) and c.phone is not null then chosen:=array_append(chosen,'alimtalk'); end if;
   if 'sms'=any(channels) and c.phone is not null and (p_mode='all' or not 'alimtalk'=any(chosen)) then chosen:=array_append(chosen,'sms'); end if;
  end if;
  routes:=routes||jsonb_build_array(jsonb_build_object('memberId',m.recipient_id,'channels',(select coalesce(jsonb_agg(x order by x),'[]') from unnest(chosen) x)));
  foreach channel in array chosen loop
   event:=null;
   if channel='push' then
    insert into public.edu_push_events(user_id,kind,source,path) values(m.recipient_id,'message','care:'||m.id::text,'/my/messages') returning id into event;
    insert into public.edu_push_deliveries(event_id,subscription_id,binding) select event,s.id,s.binding from public.edu_push_subscriptions s where s.user_id=m.recipient_id and s.enabled;
   end if;
   insert into public.edu_care_deliveries(message_id,channel,destination_hash,template_id,event_id)
    values(m.id,channel,case when channel<>'push' then md5(m.id::text||':'||case channel when 'email' then c.email when 'alimtalk' then c.phone when 'sms' then c.phone end) end,case when channel='alimtalk' then p_template end,event);
  end loop;
 end loop;
 -- The operator reviewed these exact channel routes; a change rolls back even
 -- the inbox insert and requires a fresh confirmation.
 if p_routes is null or p_routes<>routes then raise exception 'CARE_CHANNELS_CHANGED'; end if;
 return public.edu_care_delivery_receipt(p_actor,p_request);
end; $$;

create function public.edu_claim_care_channels(p_email boolean,p_alimtalk boolean,p_template uuid,p_sms boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 -- Expired lease may already have reached the provider. Never resend blindly.
 update public.edu_care_deliveries set status='unknown',code='LEASE_EXPIRED',finished_at=now(),lease=null,lease_until=null
 where channel<>'push' and status='processing' and lease_until<=now();
 update public.edu_care_deliveries set status='skipped',code='EXPIRED_OR_DISABLED',finished_at=now()
 where channel<>'push' and status='pending' and (created_at<=now()-interval '24 hours'
  or (channel='email' and not coalesce(p_email,false))
  or (channel='sms' and not coalesce(p_sms,false))
  or (channel='alimtalk' and (not coalesce(p_alimtalk,false) or template_id is distinct from p_template)));
 with due as (select id from public.edu_care_deliveries where channel<>'push' and status='pending' order by created_at,id for update skip locked limit 9),
 claimed as (update public.edu_care_deliveries d set status='processing',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' from due where d.id=due.id returning d.id,d.lease)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease)),'[]') into result from claimed;
 return result;
end; $$;
create function public.edu_read_care_channel(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'channel',d.channel,'destination',case d.channel when 'email' then c.email when 'alimtalk' then c.phone when 'sms' then c.phone end,'name',p.full_name,'content',m.content,'templateId',d.template_id)
 from public.edu_care_deliveries d join public.edu_member_messages m on m.id=d.message_id join public.profiles p on p.id=m.recipient_id
 cross join lateral edu_private.care_contacts(p.id) c
 where d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and d.channel<>'push'
 and d.destination_hash=md5(m.id::text||':'||case d.channel when 'email' then c.email when 'alimtalk' then c.phone when 'sms' then c.phone end)
 and edu_private.care_delivery_allowed(m.id);
$$;
create function public.edu_finish_care_channel(p_id uuid,p_lease uuid,p_status text,p_code text,p_provider text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('accepted','failed','unknown','skipped') or p_status is null or length(p_code)>80 or length(p_provider)>200 then raise exception 'CARE_INVALID'; end if;
 update public.edu_care_deliveries set status=p_status,code=p_code,provider_id=p_provider,finished_at=now(),lease=null,lease_until=null
 where id=p_id and lease=p_lease and status='processing' and lease_until>now() and channel<>'push';
 return found;
end; $$;

create or replace function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where (e.kind in ('question','answer','diagnosis_ready') or (e.kind='message' and e.path='/my/messages' and exists(
  select 1 from public.edu_care_deliveries cd join public.edu_member_messages m on m.id=cd.message_id
  where cd.channel='push' and cd.event_id=e.id and e.source='care:'||m.id::text and e.user_id=m.recipient_id and edu_private.care_delivery_allowed(m.id))))
 and d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
 and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
 and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
 and (e.kind<>'diagnosis_ready' or edu_private.report_push_allowed(e.user_id,e.source));
$$;
revoke all on function edu_private.care_contacts(uuid),edu_private.care_delivery_allowed(uuid),public.edu_care_channel_reach(uuid,uuid[]),public.edu_care_delivery_receipt(uuid,uuid),public.edu_send_learning_care_channels(uuid,uuid,uuid,uuid,uuid[],text,text,text[],uuid,jsonb),public.edu_claim_care_channels(boolean,boolean,uuid,boolean),public.edu_read_care_channel(uuid,uuid),public.edu_finish_care_channel(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function edu_private.care_contacts(uuid),edu_private.care_delivery_allowed(uuid),public.edu_care_channel_reach(uuid,uuid[]),public.edu_care_delivery_receipt(uuid,uuid),public.edu_send_learning_care_channels(uuid,uuid,uuid,uuid,uuid[],text,text,text[],uuid,jsonb),public.edu_claim_care_channels(boolean,boolean,uuid,boolean),public.edu_read_care_channel(uuid,uuid),public.edu_finish_care_channel(uuid,uuid,text,text,text) to service_role;
commit;
