begin;
-- Only question/answer notifications are delivered; history is retained.
create or replace function edu_private.enqueue_push(p_user uuid,p_kind text,p_source text,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
declare event_id uuid;
begin
 if p_kind not in ('question','answer') then return; end if;
 if not exists(select 1 from public.edu_push_control where singleton and enabled) or not exists(select 1 from public.profiles where id=p_user and status='active') then return; end if;
 insert into public.edu_push_events(user_id,kind,source,path) values(p_user,p_kind,p_source,p_path)
  on conflict(user_id,kind,source) do nothing returning id into event_id;
 if event_id is null then return; end if;
 insert into public.edu_push_deliveries(event_id,subscription_id,binding)
  select event_id,s.id,s.binding from public.edu_push_subscriptions s where s.user_id=p_user and s.enabled;
end; $$;
create or replace function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where e.kind in ('question','answer') and d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
  and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
  and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
  and (e.kind<>'submission' or case when e.source like 'legacy:%' then exists(select 1 from public.mission_submissions ms where 'legacy:'||ms.id::text=e.source and ms.status='submitted') else not exists(select 1 from public.edu_lesson_block_reviews r where r.submission_id::text=e.source) end);
$$;
update public.edu_push_deliveries d set status='skipped',finished_at=now(),lease=null,lease_until=null,last_code='QUESTION_ONLY' from public.edu_push_events e where d.event_id=e.id and e.kind not in ('question','answer') and d.status in ('pending','processing');
commit;
