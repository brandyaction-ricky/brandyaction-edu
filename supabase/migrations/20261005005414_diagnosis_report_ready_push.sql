begin;
-- A status-only queue. No answers, report text, new generation or AI calls are stored here.
-- Existing completed reports are deliberately not backfilled.
create table public.edu_diagnosis_report_watches (
 attempt_id uuid primary key references public.edu_diagnosis_attempts(id) on delete cascade,
 state text not null default 'watching' check(state in ('watching','complete','cancelled')),
 next_check_at timestamptz not null default now(), lease uuid, lease_until timestamptz,
 failures integer not null default 0, last_code text, checked_at timestamptz, completed_at timestamptz
);
create index edu_report_watch_due on public.edu_diagnosis_report_watches(next_check_at) where state='watching';
alter table public.edu_diagnosis_report_watches enable row level security;
revoke all on public.edu_diagnosis_report_watches from public,anon,authenticated;
grant select,insert,update on public.edu_diagnosis_report_watches to service_role;

create function edu_private.watch_submitted_diagnosis() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state='submitted' and new.is_current and new.remote_response_id is not null
    and (tg_op='INSERT' or old.state is distinct from new.state) then
  insert into public.edu_diagnosis_report_watches(attempt_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end; $$;
create trigger edu_watch_submitted_diagnosis after insert or update of state on public.edu_diagnosis_attempts
 for each row execute function edu_private.watch_submitted_diagnosis();
-- Used only after a validated pending status; covers submissions whose acknowledgement was lost.
create function public.edu_watch_diagnosis_report(p_actor uuid,p_attempt uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare c jsonb;
begin
 c:=public.edu_diagnosis_context(p_actor);
 if c->>'attemptId' is distinct from p_attempt::text or c->>'responseId' is null then return false; end if;
 insert into public.edu_diagnosis_report_watches(attempt_id) values(p_attempt) on conflict do nothing;
 return true;
end; $$;
create function public.edu_claim_report_watches(p_limit integer default 20) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; result jsonb:='[]'::jsonb; token uuid;
begin
 if not exists(select 1 from public.edu_push_control where singleton and enabled) then return result; end if;
 for r in select w.attempt_id,a.user_id from public.edu_diagnosis_report_watches w
 join public.edu_diagnosis_attempts a on a.id=w.attempt_id
 where w.state='watching' and w.next_check_at<=now() and (w.lease_until is null or w.lease_until<=now())
 and exists(select 1 from public.edu_push_subscriptions s where s.user_id=a.user_id and s.enabled)
 order by w.next_check_at,w.attempt_id limit greatest(1,least(coalesce(p_limit,20),20)) for update of w skip locked
 loop
  token:=gen_random_uuid();
  update public.edu_diagnosis_report_watches set lease=token,lease_until=now()+interval '3 minutes' where attempt_id=r.attempt_id;
  result:=result||jsonb_build_array(jsonb_build_object('attemptId',r.attempt_id,'userId',r.user_id,'lease',token));
 end loop;
 return result;
end; $$;
alter table public.edu_push_events drop constraint edu_push_events_kind_check;
alter table public.edu_push_events add constraint edu_push_events_kind_check check(kind in ('message','question','answer','submission','review','diagnosis_ready'));
alter table public.edu_push_events drop constraint edu_push_events_path_check;
alter table public.edu_push_events add constraint edu_push_events_path_check check(path in ('/my/messages','/my/questions','/my/missions','/admin/questions','/admin/reviews','/admin/reviews?tab=blocks','/admin/reviews?tab=missions','/my/diagnosis','/admin/diagnosis') or path ~ '^/my/questions[?]question=[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' or path ~ '^/learn/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$');
create or replace function edu_private.enqueue_push(p_user uuid,p_kind text,p_source text,p_path text)
returns void language plpgsql security invoker set search_path='' as $$
declare event_id uuid;
begin
 if p_kind not in ('question','answer','diagnosis_ready') then return; end if;
 if not exists(select 1 from public.edu_push_control where singleton and enabled) or not exists(select 1 from public.profiles where id=p_user and status='active') then return; end if;
 insert into public.edu_push_events(user_id,kind,source,path) values(p_user,p_kind,p_source,p_path)
 on conflict(user_id,kind,source) do nothing returning id into event_id;
 if event_id is null then return; end if;
 insert into public.edu_push_deliveries(event_id,subscription_id,binding)
 select event_id,s.id,s.binding from public.edu_push_subscriptions s where s.user_id=p_user and s.enabled;
end; $$;
create function public.edu_finish_report_watch(p_attempt uuid,p_lease uuid,p_state text) returns boolean language plpgsql security invoker set search_path='' as $$
declare w public.edu_diagnosis_report_watches; a public.edu_diagnosis_attempts; c jsonb; allowed boolean:=false;
begin
 if p_state is null or p_state not in ('queued','processing','ready','needs_review','access_denied','unavailable','obsolete') then raise exception 'REPORT_WATCH_INVALID'; end if;
 select * into w from public.edu_diagnosis_report_watches where attempt_id=p_attempt for update;
 if not found or w.state<>'watching' or w.lease is distinct from p_lease or w.lease_until<=now() then return false; end if;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then
  update public.edu_diagnosis_report_watches set lease=null,lease_until=null,next_check_at=now()+interval '2 minutes' where attempt_id=p_attempt;
  return false;
 end if;
 select * into a from public.edu_diagnosis_attempts where id=p_attempt;
 begin
  c:=public.edu_diagnosis_context(a.user_id);
  allowed:=coalesce(a.is_current and c->>'attemptId'=p_attempt::text and c->>'responseId'=a.remote_response_id::text,false);
 exception when others then allowed:=false;
 end;
 if not allowed or p_state in ('access_denied','obsolete') then
  update public.edu_diagnosis_report_watches set state='cancelled',last_code='ACCESS_UNAVAILABLE',checked_at=now(),lease=null,lease_until=null where attempt_id=p_attempt;
 elsif p_state='ready' then
  if not exists(select 1 from public.edu_push_control where singleton and enabled) then
   update public.edu_diagnosis_report_watches set lease=null,lease_until=null,next_check_at=now()+interval '2 minutes' where attempt_id=p_attempt;
   return false;
  end if;
  perform edu_private.enqueue_push(a.user_id,'diagnosis_ready',p_attempt::text,
   case when a.admin_test then '/admin/diagnosis' else '/my/diagnosis' end);
  update public.edu_diagnosis_report_watches set state='complete',completed_at=now(),checked_at=now(),last_code='READY',lease=null,lease_until=null where attempt_id=p_attempt;
 else
  update public.edu_diagnosis_report_watches set checked_at=now(),last_code=upper(p_state),lease=null,lease_until=null,
   failures=case when p_state='unavailable' then least(failures+1,10) else 0 end,
   next_check_at=now()+case when p_state='needs_review' then interval '15 minutes'
    when p_state='unavailable' then make_interval(secs=>least(1800,60*power(2,least(failures,5))::integer)) else interval '2 minutes' end
   where attempt_id=p_attempt;
 end if;
 return true;
end; $$;
-- Check current entitlement again immediately before releasing a transport credential.
create function edu_private.report_push_allowed(p_user uuid,p_source text) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare c jsonb;
begin
 c:=public.edu_diagnosis_context(p_user);
 return coalesce(c->>'attemptId'=p_source,false) and exists(select 1 from public.edu_diagnosis_report_watches w where w.attempt_id::text=p_source and w.state='complete');
exception when others then return false;
end; $$;
create or replace function public.edu_read_push_delivery(p_id uuid,p_lease uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'lease',d.lease,'eventId',e.id,'path',e.path,'binding',d.binding,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth',s.auth)
 from public.edu_push_deliveries d join public.edu_push_events e on e.id=d.event_id join public.edu_push_subscriptions s on s.id=d.subscription_id join public.profiles p on p.id=e.user_id
 where e.kind in ('question','answer','diagnosis_ready') and d.id=p_id and d.lease=p_lease and d.status='processing' and d.lease_until>now() and s.enabled and s.binding=d.binding and s.user_id=e.user_id and p.status='active'
 and e.created_at>now()-interval '24 hours' and (select enabled from public.edu_push_control where singleton)
 and (e.path not like '/admin/%' or public.edu_message_operator(e.user_id))
 and (e.kind<>'diagnosis_ready' or edu_private.report_push_allowed(e.user_id,e.source));
$$;
revoke all on function edu_private.watch_submitted_diagnosis(),edu_private.report_push_allowed(uuid,text),public.edu_watch_diagnosis_report(uuid,uuid),public.edu_claim_report_watches(integer),public.edu_finish_report_watch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function edu_private.watch_submitted_diagnosis(),edu_private.report_push_allowed(uuid,text),public.edu_watch_diagnosis_report(uuid,uuid),public.edu_claim_report_watches(integer),public.edu_finish_report_watch(uuid,uuid,text) to service_role;
commit;
