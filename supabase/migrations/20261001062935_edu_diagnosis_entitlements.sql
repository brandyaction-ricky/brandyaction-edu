begin;
-- Additive foundation only. No course, customer, payment or publication is seeded.
create table public.edu_diagnosis_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into public.edu_diagnosis_control default values;
create table public.edu_diagnosis_offers (
 id uuid primary key default gen_random_uuid(),
 course_id uuid not null references public.courses(id),
 diagnosis_code text not null default 'myin-n6' check(diagnosis_code='myin-n6'),
 package_version text not null check(length(package_version) between 1 and 100),
 release_id uuid not null,
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 unique(course_id,package_version)
);
create unique index edu_diagnosis_offer_current on public.edu_diagnosis_offers(course_id) where enabled;
create table public.edu_diagnosis_grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 offer_id uuid not null references public.edu_diagnosis_offers(id),
 order_item_id uuid references public.order_items(id),
 enrollment_id uuid references public.enrollments(id),
 created_at timestamptz not null default now(),
 check(num_nonnulls(order_item_id,enrollment_id)=1),
 unique(order_item_id),unique(enrollment_id)
);
create index edu_diagnosis_grants_owner on public.edu_diagnosis_grants(user_id,offer_id);
create index edu_diagnosis_grants_offer on public.edu_diagnosis_grants(offer_id);
create table public.edu_diagnosis_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 diagnosis_code text not null check(diagnosis_code='myin-n6'),
 offer_id uuid not null references public.edu_diagnosis_offers(id),
 state text not null default 'preparing' check(state in ('preparing','in_progress','submitted','processing','ready','needs_review')),
 remote_response_id uuid,
 remote_revision bigint not null default -1 check(remote_revision>=-1),
 report_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,diagnosis_code),unique(remote_response_id),unique(report_id),
 check(state not in ('in_progress','submitted','processing','ready') or remote_response_id is not null),
 check((state='ready')=(report_id is not null))
);
create index edu_diagnosis_attempt_offer on public.edu_diagnosis_attempts(offer_id);
create table public.edu_diagnosis_outbox (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null unique references public.edu_diagnosis_attempts(id),
 kind text not null default 'ensure_session' check(kind='ensure_session'),
 state text not null default 'pending' check(state in ('pending','working','done','needs_review')),
 tries integer not null default 0 check(tries between 0 and 8),
 available_at timestamptz not null default now(),
 lease uuid,lease_until timestamptz,
 last_code text check(last_code in ('REMOTE_UNAVAILABLE','ACCESS_REVOKED','RETRY_LIMIT','REMOTE_REJECTED')),
 created_at timestamptz not null default now(),
 check((state='working')=(lease is not null and lease_until is not null))
);
create index edu_diagnosis_outbox_due on public.edu_diagnosis_outbox(available_at,id) where state in ('pending','working');

alter table public.edu_diagnosis_control enable row level security;
alter table public.edu_diagnosis_offers enable row level security;
alter table public.edu_diagnosis_grants enable row level security;
alter table public.edu_diagnosis_attempts enable row level security;
alter table public.edu_diagnosis_outbox enable row level security;
revoke all on public.edu_diagnosis_control,public.edu_diagnosis_offers,public.edu_diagnosis_grants,public.edu_diagnosis_attempts,public.edu_diagnosis_outbox from public,anon,authenticated,service_role;
grant select on public.edu_diagnosis_control,public.edu_diagnosis_offers to service_role;
grant select,insert,update on public.edu_diagnosis_grants,public.edu_diagnosis_attempts,public.edu_diagnosis_outbox to service_role;

create function public.edu_diagnosis_offer_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.id,new.course_id,new.diagnosis_code,new.package_version,new.release_id) is distinct from
    (old.id,old.course_id,old.diagnosis_code,old.package_version,old.release_id) then raise exception 'DIAGNOSIS_OFFER_IMMUTABLE'; end if;
 return new;
end $$;
create trigger edu_diagnosis_offer_immutable before update on public.edu_diagnosis_offers for each row execute function public.edu_diagnosis_offer_immutable();

-- No external IO and no AI calls in the payment transaction. Partial refunds fail
-- closed until a component-level refund policy is implemented and approved.
create function public.edu_diagnosis_fulfill_order(p_order uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then return 0; end if;
 insert into public.edu_diagnosis_grants(user_id,offer_id,order_item_id)
 select o.user_id,f.id,i.id from public.orders o
 join public.order_items i on i.order_id=o.id
 join public.edu_diagnosis_offers f on f.course_id=i.course_id and f.enabled
 where o.id=p_order and o.status='paid' and o.user_id is not null
 on conflict(order_item_id) do nothing;
 get diagnostics affected=row_count;
 return affected;
end $$;
create function public.edu_diagnosis_order_paid() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='paid' and old.status is distinct from 'paid' then perform public.edu_diagnosis_fulfill_order(new.id); end if;
 return new;
end $$;
create trigger edu_diagnosis_order_paid after update of status on public.orders for each row execute function public.edu_diagnosis_order_paid();

-- A persisted grant is never sufficient alone: always recheck its source.
create function public.edu_diagnosis_has_access(p_user uuid,p_code text,p_course uuid default null) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.edu_diagnosis_grants g
 join public.edu_diagnosis_offers f on f.id=g.offer_id
 join public.profiles p on p.id=g.user_id and p.status='active'
 left join public.order_items i on i.id=g.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.enrollments e on e.id=g.enrollment_id
 where g.user_id=p_user and f.diagnosis_code=p_code and (p_course is null or f.course_id=p_course) and (
   (g.order_item_id is not null and o.user_id=p_user and o.status='paid' and i.course_id=f.course_id)
   or (g.enrollment_id is not null and e.user_id=p_user and e.course_id=f.course_id
       and e.order_item_id is null and e.status='active' and e.revoked_at is null
       and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
 ))
$$;
create function public.edu_diagnosis_begin(p_actor uuid,p_course uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_diagnosis_offers; a public.edu_diagnosis_attempts; o record;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then raise exception 'DIAGNOSIS_DISABLED'; end if;
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into f from public.edu_diagnosis_offers where course_id=p_course and enabled;
 if not found then raise exception 'DIAGNOSIS_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('edu-diagnosis:'||p_actor::text,0));
 -- Lazy reconciliation covers an already-paid course when an offer is first enabled.
 for o in select distinct orders.id from public.orders join public.order_items i on i.order_id=orders.id
   where orders.user_id=p_actor and orders.status='paid' and i.course_id=p_course
 loop perform public.edu_diagnosis_fulfill_order(o.id); end loop;
 insert into public.edu_diagnosis_grants(user_id,offer_id,enrollment_id)
 select p_actor,f.id,e.id from public.enrollments e where e.user_id=p_actor and e.course_id=p_course
   and e.order_item_id is null and e.status='active' and e.revoked_at is null
 on conflict(enrollment_id) do nothing;
 -- Require rights in the requested course, not merely a different diagnosis grant.
 if not public.edu_diagnosis_has_access(p_actor,f.diagnosis_code,p_course) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 insert into public.edu_diagnosis_attempts(user_id,diagnosis_code,offer_id) values(p_actor,f.diagnosis_code,f.id)
 on conflict(user_id,diagnosis_code) do nothing;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code=f.diagnosis_code;
 insert into public.edu_diagnosis_outbox(attempt_id) values(a.id) on conflict(attempt_id) do nothing;
 return jsonb_build_object('id',a.id,'state',a.state,'createdAt',a.created_at);
end $$;
create function public.edu_diagnosis_read(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.edu_diagnosis_attempts;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 select * into a from public.edu_diagnosis_attempts where user_id=p_actor and diagnosis_code='myin-n6';
 if not found then return jsonb_build_object('state','not_started'); end if;
 if not public.edu_diagnosis_has_access(p_actor,a.diagnosis_code) then raise exception 'DIAGNOSIS_FORBIDDEN'; end if;
 return jsonb_build_object('id',a.id,'state',case when a.state='preparing' and exists(select 1 from public.edu_diagnosis_outbox where attempt_id=a.id and state='needs_review') then 'needs_review' else a.state end,'createdAt',a.created_at,'updatedAt',a.updated_at);
end $$;

create function public.edu_diagnosis_claim(p_limit integer default 5) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>20 then raise exception 'DIAGNOSIS_INVALID'; end if;
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then return '[]'::jsonb; end if;
 -- Leases abandoned at the last attempt must not remain "working" forever.
 update public.edu_diagnosis_outbox set state='needs_review',lease=null,lease_until=null,last_code='RETRY_LIMIT'
 where state in ('pending','working') and tries>=8 and (lease_until is null or lease_until<=now());
 with due as (
  select j.id from public.edu_diagnosis_outbox j where
   (j.state='pending' and j.available_at<=now() or j.state='working' and j.lease_until<=now()) and j.tries<8
   order by j.available_at,j.id limit p_limit for update skip locked
 ), claimed as (
  update public.edu_diagnosis_outbox j set state='working',tries=j.tries+1,lease=gen_random_uuid(),lease_until=now()+interval '60 seconds'
  from due where j.id=due.id returning j.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'attemptId',attempt_id,'lease',lease,'tries',tries)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
-- Read immediately before remote IO. A lease is a fencing token, not just a timer.
create function public.edu_diagnosis_dispatch(p_job uuid,p_lease uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.edu_diagnosis_outbox; a public.edu_diagnosis_attempts; f public.edu_diagnosis_offers;
begin
 if not exists(select 1 from public.edu_diagnosis_control where singleton and enabled) then return null; end if;
 select * into j from public.edu_diagnosis_outbox where id=p_job and state='working' and lease=p_lease and lease_until>now() for update;
 if not found then return null; end if;
 select * into a from public.edu_diagnosis_attempts where id=j.attempt_id;
 if not public.edu_diagnosis_has_access(a.user_id,a.diagnosis_code) then
  update public.edu_diagnosis_outbox set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null where id=j.id;
  return null;
 end if;
 select * into f from public.edu_diagnosis_offers where id=a.offer_id;
 return jsonb_build_object('version',1,'kind','ensure_session','attemptId',a.id,'subject',a.user_id,'diagnosis',a.diagnosis_code,'releaseId',f.release_id,'packageVersion',f.package_version);
end $$;
create function public.edu_diagnosis_ack(p_job uuid,p_lease uuid,p_response uuid) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.edu_diagnosis_outbox; a public.edu_diagnosis_attempts;
begin
 if p_response is null then raise exception 'DIAGNOSIS_INVALID'; end if;
 select * into j from public.edu_diagnosis_outbox where id=p_job and state='working' and lease=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 select * into a from public.edu_diagnosis_attempts where id=j.attempt_id for update;
 if not public.edu_diagnosis_has_access(a.user_id,a.diagnosis_code) then
  update public.edu_diagnosis_outbox set state='needs_review',last_code='ACCESS_REVOKED',lease=null,lease_until=null where id=j.id;
  return false;
 end if;
 if a.remote_response_id is not null and a.remote_response_id<>p_response then raise exception 'DIAGNOSIS_BINDING_MISMATCH'; end if;
 update public.edu_diagnosis_attempts set remote_response_id=p_response,state=case when state='preparing' then 'in_progress' else state end,updated_at=now() where id=a.id;
 update public.edu_diagnosis_outbox set state='done',lease=null,lease_until=null,last_code=null where id=j.id;
 return true;
end $$;
create function public.edu_diagnosis_retry(p_job uuid,p_lease uuid,p_code text) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.edu_diagnosis_outbox;
begin
 if p_code is null or p_code not in ('REMOTE_UNAVAILABLE','REMOTE_REJECTED') then raise exception 'DIAGNOSIS_INVALID'; end if;
 select * into j from public.edu_diagnosis_outbox where id=p_job and state='working' and lease=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 update public.edu_diagnosis_outbox set state=case when tries>=8 or p_code='REMOTE_REJECTED' then 'needs_review' else 'pending' end,
 last_code=case when tries>=8 then 'RETRY_LIMIT' else p_code end,
 available_at=now()+make_interval(secs=>least(3600,(power(2,tries)*15)::integer)),lease=null,lease_until=null where id=j.id;
 return true;
end $$;

revoke all on function public.edu_diagnosis_offer_immutable(),public.edu_diagnosis_order_paid(),public.edu_diagnosis_fulfill_order(uuid),public.edu_diagnosis_has_access(uuid,text,uuid),public.edu_diagnosis_begin(uuid,uuid),public.edu_diagnosis_read(uuid),public.edu_diagnosis_claim(integer),public.edu_diagnosis_dispatch(uuid,uuid),public.edu_diagnosis_ack(uuid,uuid,uuid),public.edu_diagnosis_retry(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_diagnosis_fulfill_order(uuid),public.edu_diagnosis_has_access(uuid,text,uuid),public.edu_diagnosis_begin(uuid,uuid),public.edu_diagnosis_read(uuid),public.edu_diagnosis_claim(integer),public.edu_diagnosis_dispatch(uuid,uuid),public.edu_diagnosis_ack(uuid,uuid,uuid),public.edu_diagnosis_retry(uuid,uuid,text) to service_role;
commit;
