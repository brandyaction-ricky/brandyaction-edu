begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.profiles
  add column if not exists marketing_use_consent_at timestamptz,
  add column if not exists ad_sms_consent_at timestamptz,
  add column if not exists ad_kakao_consent_at timestamptz,
  add column if not exists ad_email_consent_at timestamptz,
  add column if not exists consent_revision uuid,
  add column if not exists consent_updated_at timestamptz,
  add column if not exists legacy_consent_retired_at timestamptz;

create table if not exists public.edu_consent_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.profiles(id) on delete set null,
  request_id uuid not null,
  kind text not null check (kind in ('marketingUse','sms','kakao','email','legacy')),
  action text not null check (action in ('consent','refusal','withdrawal','retired')),
  surface text not null check (surface in ('signup','profile','legacy_retirement')),
  wording_version text not null,
  occurred_at timestamptz not null default now(),
  legacy_snapshot jsonb,
  unique(member_id, request_id, kind)
);
create index if not exists edu_consent_events_member_time on public.edu_consent_events(member_id, occurred_at desc);
-- Immutable request receipts make a lost HTTP response safe to retry.
create table if not exists public.edu_consent_requests (
  member_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  expected_revision uuid,
  choices jsonb not null,
  surface text not null,
  wording_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(member_id, request_id)
);
alter table public.edu_consent_events enable row level security;
alter table public.edu_consent_requests enable row level security;
revoke all on public.edu_consent_events, public.edu_consent_requests from public, anon, authenticated, service_role;
grant select, insert on public.edu_consent_events, public.edu_consent_requests to service_role;
-- Profile owners cannot forge consent timestamps or an audit revision through the Data API.
revoke update(marketing_use_consent_at,ad_sms_consent_at,ad_kakao_consent_at,ad_email_consent_at,consent_revision,consent_updated_at,legacy_consent_retired_at) on public.profiles from authenticated;

-- Only applying this approved migration retires legacy consent; the calendar does not.
-- Archive the old values without treating them as consent to any new channel.
insert into public.edu_consent_events(member_id,request_id,kind,action,surface,wording_version,legacy_snapshot)
select id,gen_random_uuid(),'legacy','retired','legacy_retirement','legacy',
 jsonb_build_object('marketing_consent',marketing_consent,'marketing_consent_at',marketing_consent_at,'marketing_opt_out_at',marketing_opt_out_at)
from public.profiles where legacy_consent_retired_at is null and consent_revision is null
 and (coalesce(marketing_consent,false) or marketing_consent_at is not null or marketing_opt_out_at is not null);
update public.profiles set marketing_consent=false,marketing_opt_out_at=now(),legacy_consent_retired_at=now()
where legacy_consent_retired_at is null and consent_revision is null
 and (coalesce(marketing_consent,false) or marketing_consent_at is not null or marketing_opt_out_at is not null);

create or replace function public.edu_account_consent(
 p_member uuid,p_request uuid default null,p_choices jsonb default null,
 p_surface text default null,p_version text default null,p_expected uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.profiles%rowtype; receipt public.edu_consent_requests%rowtype;
 result jsonb; old_choices jsonb; changed jsonb='[]'; k text; action text; stamp timestamptz=now();
begin
 select * into p from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'CONSENT_FORBIDDEN'; end if;
 if p_choices is not null then
  if p_request is null or p_surface is null or p_surface not in ('signup','profile')
   or p_version is distinct from '2026-10-20' or jsonb_typeof(p_choices)<>'object'
   or (select count(*) from jsonb_object_keys(p_choices))<>4 then raise exception 'CONSENT_INVALID'; end if;
  foreach k in array array['marketingUse','sms','kakao','email'] loop
   if jsonb_typeof(p_choices->k) is distinct from 'boolean' then raise exception 'CONSENT_INVALID'; end if;
  end loop;
  if not (p_choices->>'marketingUse')::boolean and ((p_choices->>'sms')::boolean or (p_choices->>'kakao')::boolean or (p_choices->>'email')::boolean) then raise exception 'CONSENT_INVALID'; end if;
  select * into receipt from public.edu_consent_requests where member_id=p_member and request_id=p_request;
  if found then
   if receipt.choices is distinct from p_choices or receipt.surface is distinct from p_surface or receipt.wording_version is distinct from p_version or receipt.expected_revision is distinct from p_expected or p.consent_revision is distinct from p_request then raise exception 'CONSENT_CONFLICT'; end if;
   return receipt.result;
  end if;
  if p.consent_revision is distinct from p_expected then raise exception 'CONSENT_CONFLICT'; end if;
  old_choices=jsonb_build_object('marketingUse',p.marketing_use_consent_at is not null,'sms',p.ad_sms_consent_at is not null,'kakao',p.ad_kakao_consent_at is not null,'email',p.ad_email_consent_at is not null);
  foreach k in array array['marketingUse','sms','kakao','email'] loop
   if (p.consent_revision is null or old_choices->k is distinct from p_choices->k)
    and not (k='sms' and old_choices->>'sms'='false' and p_choices->>'sms'='false') then
    action=case when (p_choices->>k)::boolean then 'consent' when (old_choices->>k)::boolean then 'withdrawal' else 'refusal' end;
    insert into public.edu_consent_events(member_id,request_id,kind,action,surface,wording_version,occurred_at) values(p_member,p_request,k,action,p_surface,p_version,stamp);
    changed=changed||jsonb_build_array(jsonb_build_object('kind',k,'action',action));
   end if;
  end loop;
  update public.profiles set
   marketing_use_consent_at=case when (p_choices->>'marketingUse')::boolean then coalesce(p.marketing_use_consent_at,stamp) end,
   ad_sms_consent_at=case when (p_choices->>'sms')::boolean then coalesce(p.ad_sms_consent_at,stamp) end,
   ad_kakao_consent_at=case when (p_choices->>'kakao')::boolean then coalesce(p.ad_kakao_consent_at,stamp) end,
   ad_email_consent_at=case when (p_choices->>'email')::boolean then coalesce(p.ad_email_consent_at,stamp) end,
   marketing_consent=(p_choices->>'marketingUse')::boolean and (p_choices->>'sms')::boolean,
   marketing_consent_at=case when (p_choices->>'marketingUse')::boolean and (p_choices->>'sms')::boolean then coalesce(p.ad_sms_consent_at,stamp) else p.marketing_consent_at end,
   marketing_opt_out_at=case when (p_choices->>'marketingUse')::boolean and (p_choices->>'sms')::boolean then null else coalesce(p.marketing_opt_out_at,stamp) end,
   consent_revision=p_request,consent_updated_at=stamp where id=p_member returning * into p;
 end if;
 result=jsonb_build_object(
  'choices',jsonb_build_object('marketingUse',p.marketing_use_consent_at is not null,'sms',p.ad_sms_consent_at is not null,'kakao',p.ad_kakao_consent_at is not null,'email',p.ad_email_consent_at is not null),
  'dates',jsonb_build_object('marketingUse',p.marketing_use_consent_at,'sms',p.ad_sms_consent_at,'kakao',p.ad_kakao_consent_at,'email',p.ad_email_consent_at),
  'revision',p.consent_revision,'updatedAt',p.consent_updated_at,'legacyRetired',p.legacy_consent_retired_at is not null,'changed',changed);
 if p_choices is not null then
  insert into public.edu_consent_requests(member_id,request_id,expected_revision,choices,surface,wording_version,result) values(p_member,p_request,p_expected,p_choices,p_surface,p_version,result);
 end if;
 return result;
end $$;
revoke all on function public.edu_account_consent(uuid,uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_account_consent(uuid,uuid,jsonb,text,text,uuid) to service_role;
-- Cached old signup clients cannot reintroduce legacy consent after retirement.
create or replace function public.edu_guard_legacy_consent() returns trigger
language plpgsql set search_path='' as $$
begin
 if coalesce(new.marketing_consent,false) and (new.marketing_use_consent_at is null or new.ad_sms_consent_at is null) then
  if tg_op='UPDATE' then raise exception 'CONSENT_MIGRATION_REQUIRED'; end if;
  new.marketing_consent=false; new.marketing_consent_at=null;
 end if;
 return new;
end $$;
revoke all on function public.edu_guard_legacy_consent() from public,anon,authenticated;
drop trigger if exists edu_guard_legacy_consent on public.profiles;
create trigger edu_guard_legacy_consent before insert or update of marketing_consent on public.profiles
for each row execute function public.edu_guard_legacy_consent();
commit;
