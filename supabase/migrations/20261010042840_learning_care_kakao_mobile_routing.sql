begin;

-- Auth identities are provider-maintained, unlike editable user metadata.
-- Return only a boolean; never expose auth rows or grant direct table access.
create or replace function edu_private.care_mobile_only(p_member uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.identities where user_id=p_member and provider='kakao');
$$;
revoke all on function edu_private.care_mobile_only(uuid) from public,anon,authenticated;
grant execute on function edu_private.care_mobile_only(uuid) to service_role;
create or replace function edu_private.care_contacts(p_member uuid)
returns table(email text,phone text,push boolean) language sql stable security invoker set search_path='' as $$
 select case when not edu_private.care_mobile_only(p.id) and trim(coalesce(nullif(p.contact_email,''),p.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   then lower(trim(coalesce(nullif(p.contact_email,''),p.email))) end,
 case when regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') ~ '^01[016789][0-9]{7,8}$'
   then regexp_replace(p.phone,'[^0-9]','','g') end,
 not edu_private.care_mobile_only(p.id) and coalesce((select enabled from public.edu_push_control where singleton),false) and exists(select 1 from public.edu_push_subscriptions s where s.user_id=p.id and s.enabled)
 from public.profiles p where p.id=p_member and p.status='active' and p.role not in ('admin','staff');
$$;

create or replace function public.edu_care_channel_reach(p_actor uuid,p_members uuid[])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_members is null or cardinality(p_members)>100 or array_position(p_members,null) is not null then raise exception 'CARE_INVALID'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('memberId',id,'mobileOnly',edu_private.care_mobile_only(id),'push',coalesce(c.push,false),'email',c.email is not null,'alimtalk',c.phone is not null,'sms',c.phone is not null,
  'emailMasked',case when c.email is not null then left(c.email,1)||'***@'||split_part(c.email,'@',2) end,
  'phoneMasked',case when c.phone is not null then left(c.phone,3)||'****'||right(c.phone,4) end) order by id),'[]') into result
 from (select distinct unnest(p_members) id) members left join lateral edu_private.care_contacts(id) c on true;
 return result;
end; $$;

create or replace function public.edu_send_learning_care_channels(p_actor uuid,p_request uuid,p_cohort uuid,p_lesson uuid,p_recipients uuid[],p_content text,p_mode text,p_channels text[],p_template uuid,p_routes jsonb)
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
   if 'sms'=any(channels) and c.phone is not null and ((p_mode='all' and not edu_private.care_mobile_only(m.recipient_id)) or not 'alimtalk'=any(chosen)) then chosen:=array_append(chosen,'sms'); end if;
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

create or replace function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where (e.kind in ('question','answer','diagnosis_ready') or (e.kind='message' and e.path='/my/messages' and exists(
  select 1 from public.edu_care_deliveries cd join public.edu_member_messages m on m.id=cd.message_id
  where cd.channel='push' and not edu_private.care_mobile_only(e.user_id) and cd.event_id=e.id and e.source='care:'||m.id::text and e.user_id=m.recipient_id and edu_private.care_delivery_allowed(m.id))))
 and d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
 and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
 and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
 and (e.kind<>'diagnosis_ready' or edu_private.report_push_allowed(e.user_id,e.source));
$$;
commit;
