begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Phase 1 only: no external sender, no seed, no feature flag or existing consent change.
create schema if not exists edu_tips_private;
revoke all on schema edu_tips_private from public,anon,authenticated;
grant usage on schema edu_tips_private to service_role;

create table edu_tips_private.subjects (
 id uuid primary key default gen_random_uuid(),
 member_id uuid references public.profiles(id) on delete set null,
 customer_id text not null unique check(customer_id ~ '^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$'),
 consent_epoch text not null unique check(consent_epoch ~ '^ce_[A-Za-z0-9_-]{32}$'),
 wording_version text not null references public.edu_personalization_terms(version),
 consent_revision uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 retired_at timestamptz,
 check(retired_at is null or retired_at>=created_at)
);
create unique index edu_tips_one_current_subject on edu_tips_private.subjects(member_id) where retired_at is null;
create index edu_tips_subject_member on edu_tips_private.subjects(member_id);
create index edu_tips_subject_terms on edu_tips_private.subjects(wording_version) where retired_at is null;
create table edu_tips_private.erasure_outbox (
 request_id uuid primary key default gen_random_uuid(),
 subject_id uuid not null unique references edu_tips_private.subjects(id),
 reason text not null check(reason in ('consent_withdrawn','account_deleted','identity_retired')),
 requested_at timestamptz not null default clock_timestamp(),
 active_due_at timestamptz not null default clock_timestamp()+interval '72 hours',
 model_due_at timestamptz not null default clock_timestamp()+interval '7 days',
 residual_due_at timestamptz not null default clock_timestamp()+interval '30 days',
 attempt_count integer not null default 0 check(attempt_count>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 delivered_at timestamptz,
 -- Delivery is NOT erasure completion. Completion receipt/ACK is a later migration.
 completed_at timestamptz,
 last_error_code text check(last_error_code in ('transport_unavailable','remote_rejected','invalid_response','lease_expired')),
 check((lease_token is null)=(lease_until is null)),
 check(completed_at is null or delivered_at is not null)
);
create index edu_tips_erasure_due on edu_tips_private.erasure_outbox(next_attempt_at,request_id) where delivered_at is null;
alter table edu_tips_private.subjects enable row level security;
alter table edu_tips_private.erasure_outbox enable row level security;
revoke all on edu_tips_private.subjects,edu_tips_private.erasure_outbox from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.subjects to service_role;
-- Only the withdrawal triggers may insert requests; workers may not forge completion.
grant select on edu_tips_private.erasure_outbox to service_role;
grant update(attempt_count,next_attempt_at,lease_token,lease_until,delivered_at,last_error_code) on edu_tips_private.erasure_outbox to service_role;

create function edu_tips_private.retire(p_member uuid,p_reason text)
returns integer language plpgsql security invoker set search_path='' as $$
declare s edu_tips_private.subjects; n integer:=0;
begin
 if p_reason not in ('consent_withdrawn','account_deleted','identity_retired') then raise exception 'TIPS_INVALID';end if;
 for s in select * from edu_tips_private.subjects where member_id=p_member and retired_at is null order by id for update loop
  update edu_tips_private.subjects set retired_at=clock_timestamp() where id=s.id;
  insert into edu_tips_private.erasure_outbox(subject_id,reason) values(s.id,p_reason) on conflict(subject_id) do nothing;
  n:=n+1;
 end loop;
 return n;
end$$;

-- Lock only a currently effective disclosure; service_role cannot edit its status.
create function edu_tips_private.lock_current_terms(p_version text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.edu_personalization_terms where version=p_version and is_current
  and approved_at<=clock_timestamp() and effective_at<=clock_timestamp() for share;
 return found;
end$$;

-- Registration is server-only and does not export anything. Call with freshly derived
-- EDU-specific opaque identifiers only after consent and prior erasure checks.
create function public.edu_tips_register_subject(p_member uuid,p_customer text,p_epoch text,p_version text,p_revision uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.edu_personalization_preferences; s edu_tips_private.subjects;
begin
 if p_customer is null or p_customer !~ '^k[1-9][0-9]*:[A-Za-z0-9_-]{43}$'
  or p_epoch is null or p_epoch !~ '^ce_[A-Za-z0-9_-]{32}$' then raise exception 'TIPS_INVALID';end if;
 perform 1 from public.profiles where id=p_member and status='active' and role not in ('admin','staff') and not is_internal and deleted_at is null for update;
 if not found then raise exception 'TIPS_NOT_ELIGIBLE';end if;
 if not edu_tips_private.lock_current_terms(p_version) then raise exception 'TIPS_NOT_ELIGIBLE';end if;
 select * into p from public.edu_personalization_preferences where member_id=p_member for update;
 if not found or not p.analysis or not p.overseas or p.wording_version is distinct from p_version or p.revision is distinct from p_revision then raise exception 'TIPS_NOT_ELIGIBLE';end if;
 if exists(select 1 from edu_tips_private.subjects x join edu_tips_private.erasure_outbox q on q.subject_id=x.id where x.member_id=p_member and q.completed_at is null) then raise exception 'TIPS_ERASURE_PENDING';end if;
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null for update;
 if found then
  if s.customer_id<>p_customer or s.consent_epoch<>p_epoch or s.wording_version<>p_version then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
  return jsonb_build_object('customer_id',s.customer_id,'consent_epoch',s.consent_epoch);
 end if;
 if exists(select 1 from edu_tips_private.subjects where customer_id=p_customer or consent_epoch=p_epoch) then raise exception 'TIPS_IDENTITY_CONFLICT';end if;
 insert into edu_tips_private.subjects(member_id,customer_id,consent_epoch,wording_version,consent_revision) values(p_member,p_customer,p_epoch,p_version,p_revision);
 return jsonb_build_object('customer_id',p_customer,'consent_epoch',p_epoch);
end$$;

-- Narrow trigger functions are not exposed RPCs. They can only retire identities,
-- never opt a member in or send requests. Definer permits cascaded/user-initiated
-- withdrawal to enqueue without granting browser roles access to the private schema.
create function edu_tips_private.consent_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform edu_tips_private.retire(old.member_id,'consent_withdrawn');return old;end if;
 if not new.analysis or not new.overseas or (tg_op='UPDATE' and new.wording_version is distinct from old.wording_version) then
  perform edu_tips_private.retire(new.member_id,'consent_withdrawn');
 end if;
 return new;
end$$;
create trigger edu_tips_consent_retire after update or delete on public.edu_personalization_preferences for each row execute function edu_tips_private.consent_changed();
create function edu_tips_private.member_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then perform edu_tips_private.retire(old.id,'account_deleted');return old;end if;
 if new.status='withdrawn' or new.deleted_at is not null then perform edu_tips_private.retire(new.id,'account_deleted');
 elsif new.status<>'active' or new.role in ('admin','staff') or new.is_internal then perform edu_tips_private.retire(new.id,'identity_retired');end if;
 return new;
end$$;
create trigger edu_tips_member_retire before update of status,role,is_internal,deleted_at or delete on public.profiles for each row execute function edu_tips_private.member_changed();
create function edu_tips_private.terms_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare s edu_tips_private.subjects;
begin
 if old.is_current and not new.is_current then
  for s in select * from edu_tips_private.subjects where wording_version=old.version and retired_at is null order by id for update loop
   update edu_tips_private.subjects set retired_at=clock_timestamp() where id=s.id;
   insert into edu_tips_private.erasure_outbox(subject_id,reason) values(s.id,'consent_withdrawn') on conflict(subject_id) do nothing;
  end loop;
 end if;
 return new;
end$$;
create trigger edu_tips_terms_retire after update of is_current on public.edu_personalization_terms for each row execute function edu_tips_private.terms_changed();

create function public.edu_tips_claim_erasures(p_limit integer default 20)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'TIPS_INVALID';end if;
 with due as (
  select q.request_id from edu_tips_private.erasure_outbox q
  where q.delivered_at is null and q.next_attempt_at<=clock_timestamp() and (q.lease_until is null or q.lease_until<=clock_timestamp())
  order by q.next_attempt_at,q.request_id for update skip locked limit p_limit
 ), claimed as (
  update edu_tips_private.erasure_outbox q set attempt_count=q.attempt_count+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
  from due where q.request_id=due.request_id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object(
   'requestId',q.request_id,'customer_id',s.customer_id,'consent_epoch',s.consent_epoch,'reason',q.reason,
   'at',q.requested_at,'active_due_at',q.active_due_at,'model_due_at',q.model_due_at,'residual_due_at',q.residual_due_at,
   'lease_token',q.lease_token,'lease_until',q.lease_until,'attempt',q.attempt_count
  ) order by q.next_attempt_at,q.request_id),'[]'::jsonb) into result from claimed q join edu_tips_private.subjects s on s.id=q.subject_id;
 return result;
end$$;
create function public.edu_tips_finish_erasure_delivery(p_request uuid,p_lease uuid,p_delivered boolean,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q edu_tips_private.erasure_outbox;
begin
 if p_delivered is null or (p_delivered and p_error is not null) or (not p_delivered and (p_error is null or p_error not in ('transport_unavailable','remote_rejected','invalid_response','lease_expired'))) then raise exception 'TIPS_INVALID';end if;
 select * into q from edu_tips_private.erasure_outbox where request_id=p_request for update;
 if not found or q.delivered_at is not null or q.lease_token is distinct from p_lease or q.lease_until<=clock_timestamp() or q.lease_until is null then return false;end if;
 update edu_tips_private.erasure_outbox set
  delivered_at=case when p_delivered then clock_timestamp() else null end,
  next_attempt_at=case when p_delivered then next_attempt_at else clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(q.attempt_count-1,7)))::integer) end,
  last_error_code=p_error,lease_token=null,lease_until=null
 where request_id=p_request;
 return true;
end$$;

revoke all on all functions in schema edu_tips_private from public,anon,authenticated,service_role;
-- Trigger-only definer functions receive no direct caller grants.
grant execute on function edu_tips_private.lock_current_terms(text) to service_role;
revoke all on function public.edu_tips_register_subject(uuid,text,text,text,uuid),public.edu_tips_claim_erasures(integer),public.edu_tips_finish_erasure_delivery(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.edu_tips_register_subject(uuid,text,text,text,uuid),public.edu_tips_claim_erasures(integer),public.edu_tips_finish_erasure_delivery(uuid,uuid,boolean,text) to service_role;

commit;
