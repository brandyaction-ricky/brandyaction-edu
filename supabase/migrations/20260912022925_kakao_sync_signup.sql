-- Opt-in Kakao Sync. Existing OAuth and anonymous free-class links are unchanged.
create table public.kakao_sync_config (
  id boolean primary key default true check(id),
  value jsonb not null default '{}' check(jsonb_typeof(value)='object'),
  revision integer not null default 0 check(revision >= 0),
  updated_at timestamptz not null default now()
);
insert into public.kakao_sync_config(id,value) values(true,
  '{"enabled":false,"appId":"","channelId":"","termsTag":"","privacyTag":"","readChannel":false,"setupConfirmed":false}');

create table public.kakao_sync_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  app_id text not null, kakao_user_id text not null,
  policy_version text not null,
  terms jsonb not null check(jsonb_typeof(terms)='array'),
  channel_id text not null,
  channel_relation text not null check(channel_relation in ('ADDED','BLOCKED','NONE','UNKNOWN')),
  checked_at timestamptz not null default now(),
  unique(app_id,kakao_user_id)
);
create table public.kakao_sync_consent_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_id text not null, policy_version text not null,
  terms jsonb not null check(jsonb_typeof(terms)='array'),
  channel_id text not null,
  channel_relation text not null check(channel_relation in ('ADDED','BLOCKED','NONE','UNKNOWN')),
  observed_at timestamptz not null default now()
);
create index kakao_sync_history_user_date on public.kakao_sync_consent_history(user_id,observed_at desc);

do $$ declare t text; begin
  foreach t in array array['kakao_sync_config','kakao_sync_members','kakao_sync_consent_history'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create function public.edu_record_kakao_consent(
  p_user uuid, p_kakao_id text, p_app_id text, p_revision integer,
  p_policy text, p_terms jsonb, p_channel text, p_relation text
) returns void language plpgsql security invoker set search_path='' as $$
declare cfg public.kakao_sync_config; old public.kakao_sync_members;
begin
  select * into cfg from public.kakao_sync_config where id=true for share;
  if cfg.revision is distinct from p_revision or (cfg.value->>'enabled') is distinct from 'true'
     or cfg.value->>'appId' is distinct from p_app_id or cfg.value->>'channelId' is distinct from p_channel then
    raise exception 'SYNC_CONFIG_CHANGED';
  end if;
  if p_policy is null or length(p_policy)>40 or p_kakao_id !~ '^[1-9][0-9]{0,19}$'
     or p_terms is null or jsonb_typeof(p_terms)<>'array' or jsonb_array_length(p_terms)<>2
     or p_terms->0->>'tag' is distinct from cfg.value->>'termsTag'
     or p_terms->1->>'tag' is distinct from cfg.value->>'privacyTag' then
    raise exception 'INVALID_SYNC_SNAPSHOT';
  end if;
  perform 1 from public.profiles where id=p_user and status='active' for update;
  if not found then raise exception 'ACTIVE_MEMBER_REQUIRED'; end if;
  -- The server binds Kakao token identity to auth.getUser().identities before
  -- calling this service-role-only function. No new grants on auth tables.
  select * into old from public.kakao_sync_members where user_id=p_user;
  if not found or old.app_id is distinct from p_app_id or old.policy_version is distinct from p_policy
     or old.terms is distinct from p_terms or old.channel_id is distinct from p_channel or old.channel_relation is distinct from p_relation then
    insert into public.kakao_sync_consent_history(user_id,app_id,policy_version,terms,channel_id,channel_relation)
      values(p_user,p_app_id,p_policy,p_terms,p_channel,p_relation);
  end if;
  insert into public.kakao_sync_members(user_id,app_id,kakao_user_id,policy_version,terms,channel_id,channel_relation)
    values(p_user,p_app_id,p_kakao_id,p_policy,p_terms,p_channel,p_relation)
  on conflict(user_id) do update set app_id=excluded.app_id,kakao_user_id=excluded.kakao_user_id,
    policy_version=excluded.policy_version,terms=excluded.terms,channel_id=excluded.channel_id,
    channel_relation=excluded.channel_relation,checked_at=now();
  -- Deliberately NO mutation of profiles.marketing_consent, role or membership.
  -- Adding a channel does not grant email/SMS marketing consent or course access.
end $$;
revoke all on function public.edu_record_kakao_consent(uuid,text,text,integer,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.edu_record_kakao_consent(uuid,text,text,integer,text,jsonb,text,text) to service_role;
