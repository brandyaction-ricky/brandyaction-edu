begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No campaign, terms, member choices or transmission activation is seeded.
create or replace function public.edu_account_consent(
 p_member uuid,p_request uuid default null,p_choices jsonb default null,
 p_surface text default null,p_version text default null,p_expected uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 p public.profiles%rowtype; receipt public.edu_consent_requests%rowtype;
 result jsonb; old_choices jsonb; changed jsonb='[]'; k text; action text; stamp timestamptz=now();
begin
 select * into p from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'CONSENT_FORBIDDEN'; end if;
 if p_choices is not null then
  if p_request is null or p_surface is null or p_surface not in ('signup','profile')
   or (p_version is null or p_version not in ('2026-10-17','2026-10-20')) or jsonb_typeof(p_choices)<>'object'
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

-- Retain the exact wording accepted for each independent analysis purpose.
alter table public.edu_personalization_preferences
 add column analysis_wording_version text references public.edu_personalization_terms(version),
 add column overseas_wording_version text references public.edu_personalization_terms(version);
update public.edu_personalization_preferences set
 analysis_wording_version=case when analysis then wording_version end,
 overseas_wording_version=case when overseas then wording_version end;
create or replace function public.edu_personalization_consent(p_member uuid,p_request uuid default null,p_choices jsonb default null,p_version text default null,p_expected uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.edu_personalization_preferences; t public.edu_personalization_terms;
 r public.edu_personalization_receipts; result jsonb; previous jsonb; renewing boolean; reducing boolean; va text; vo text;
begin
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'PERSONALIZATION_FORBIDDEN'; end if;
 select * into t from public.edu_personalization_terms where is_current and approved_at<=now() and effective_at<=now();
 select * into p from public.edu_personalization_preferences where member_id=p_member;
 previous:=jsonb_build_object('analysis',coalesce(p.analysis,false),'overseas',coalesce(p.overseas,false));
 if p_choices is not null then
  if p_request is null or jsonb_typeof(p_choices)<>'object'
    or (select count(*) from jsonb_object_keys(p_choices))<>2
    or jsonb_typeof(p_choices->'analysis') is distinct from 'boolean'
    or jsonb_typeof(p_choices->'overseas') is distinct from 'boolean' then raise exception 'PERSONALIZATION_INVALID';end if;
  select * into r from public.edu_personalization_receipts where member_id=p_member and request_id=p_request;
  if found then
   if r.choices is distinct from p_choices or r.wording_version is distinct from p_version or r.expected_revision is distinct from p_expected
      or p.revision is distinct from p_request then raise exception 'PERSONALIZATION_CONFLICT'; end if;
   -- Re-evaluate current eligibility/terms even for a lost-response retry.
  else
   if p.revision is distinct from p_expected then raise exception 'PERSONALIZATION_CONFLICT';end if;
   reducing := p.member_id is not null and not ((p_choices->>'analysis')::boolean and not p.analysis) and not ((p_choices->>'overseas')::boolean and not p.overseas) and p_version is not distinct from p.wording_version;
   if not reducing and ((p_choices->>'analysis')::boolean or (p_choices->>'overseas')::boolean)
    and (t.version is null or p_version is distinct from t.version) then raise exception 'PERSONALIZATION_TERMS';end if;
   va:=case when (p_choices->>'analysis')::boolean then case when reducing then p.analysis_wording_version else t.version end end;
   vo:=case when (p_choices->>'overseas')::boolean then case when reducing then p.overseas_wording_version else t.version end end;
   insert into public.edu_personalization_preferences(member_id,analysis,overseas,wording_version,revision,analysis_wording_version,overseas_wording_version)
    values(p_member,(p_choices->>'analysis')::boolean,(p_choices->>'overseas')::boolean,
      case when (p_choices->>'analysis')::boolean or (p_choices->>'overseas')::boolean then case when reducing then p.wording_version else t.version end else null end,p_request,va,vo)
    on conflict(member_id) do update set analysis=excluded.analysis,overseas=excluded.overseas,wording_version=excluded.wording_version,revision=excluded.revision,analysis_wording_version=excluded.analysis_wording_version,overseas_wording_version=excluded.overseas_wording_version,updated_at=now()
    returning * into p;
  end if;
 end if;
 renewing:=(coalesce(p.analysis,false) and p.analysis_wording_version is distinct from t.version) or (coalesce(p.overseas,false) and p.overseas_wording_version is distinct from t.version);
 result:=jsonb_build_object('choices',jsonb_build_object('analysis',coalesce(p.analysis,false),'overseas',coalesce(p.overseas,false)),
  'activeChoices',jsonb_build_object('analysis',coalesce(p.analysis and p.analysis_wording_version=t.version,false),'overseas',coalesce(p.overseas and p.overseas_wording_version=t.version,false)),
  'revision',p.revision,'recordedVersion',p.wording_version,'updatedAt',p.updated_at,'needsRenewal',renewing,
  'eligible',coalesce(p.analysis and p.overseas and p.analysis_wording_version=t.version and p.overseas_wording_version=t.version,false),
  'terms',case when t.version is null then null else jsonb_build_object('version',t.version,'analysis',t.analysis,'overseas',t.overseas) end);
 if p_choices is not null and r.request_id is null then
  insert into public.edu_personalization_receipts(member_id,request_id,expected_revision,wording_version,choices,previous_choices,result)
   values(p_member,p_request,p_expected,p_version,p_choices,previous,result);
 end if;
 return result;
end$$;

-- A settings toggle re-consents only that purpose, never the neighbouring box.
create function public.edu_personalization_choice(p_member uuid,p_request uuid,p_expected uuid,p_kind text,p_on boolean,p_version text,p_allow boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.edu_personalization_preferences;t public.edu_personalization_terms;previous jsonb;choices jsonb;v text;va text;vo text;result jsonb;
begin
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'PERSONALIZATION_FORBIDDEN';end if;
 if p_request is null or p_kind not in ('analysis','overseas') or p_kind is null or p_on is null then raise exception 'PERSONALIZATION_INVALID';end if;
 select * into p from public.edu_personalization_preferences where member_id=p_member;
 if p.revision is distinct from p_expected then raise exception 'PERSONALIZATION_CONFLICT';end if;
 select * into t from public.edu_personalization_terms where is_current and approved_at<=now() and effective_at<=now();
 if p_on and (p_allow is not true or t.version is null or t.version is distinct from p_version) then raise exception 'PERSONALIZATION_TERMS';end if;
 previous:=jsonb_build_object('analysis',coalesce(p.analysis,false),'overseas',coalesce(p.overseas,false));
 choices:=previous||jsonb_build_object(p_kind,p_on);
 va:=case when p_kind='analysis' then case when p_on then t.version end else p.analysis_wording_version end;
 vo:=case when p_kind='overseas' then case when p_on then t.version end else p.overseas_wording_version end;
 -- The legacy shared version is current only if every true purpose is current.
 v:=case when va is not null and va is distinct from t.version then va when vo is not null and vo is distinct from t.version then vo else coalesce(va,vo) end;
 insert into public.edu_personalization_preferences(member_id,analysis,overseas,wording_version,revision,analysis_wording_version,overseas_wording_version)
 values(p_member,(choices->>'analysis')::boolean,(choices->>'overseas')::boolean,v,p_request,va,vo)
 on conflict(member_id) do update set analysis=excluded.analysis,overseas=excluded.overseas,wording_version=excluded.wording_version,revision=excluded.revision,analysis_wording_version=excluded.analysis_wording_version,overseas_wording_version=excluded.overseas_wording_version,updated_at=now();
 result:=public.edu_personalization_consent(p_member);
 insert into public.edu_personalization_receipts(member_id,request_id,expected_revision,wording_version,choices,previous_choices,result)
 values(p_member,p_request,p_expected,case when p_on then t.version end,choices,previous,result);
 return result;
end$$;
revoke all on function public.edu_personalization_choice(uuid,uuid,uuid,text,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.edu_personalization_choice(uuid,uuid,uuid,text,boolean,text,boolean) to service_role;

create table public.edu_consent_prompts (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 answered_at timestamptz not null default now(),
 copy_version text not null,
 answer text not null check(answer in ('welcome','dismiss','settings'))
);
create table public.edu_welcome_consent_requests (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 payload jsonb not null,
 occurred_at timestamptz not null default now(),
 primary key(member_id,request_id)
);
create table public.edu_welcome_consent_events (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 kind text not null check(kind in ('marketing','analysis','overseas','meta')),
 consented boolean not null,
 copy_version text not null,
 wording_version text,
 surface text not null check(surface in ('welcome','settings','withdrawal')),
 occurred_at timestamptz not null default now(),
 primary key(member_id,request_id,kind)
);
alter table public.edu_consent_prompts enable row level security;
alter table public.edu_welcome_consent_requests enable row level security;
alter table public.edu_welcome_consent_events enable row level security;
revoke all on public.edu_consent_prompts,public.edu_welcome_consent_requests,public.edu_welcome_consent_events from public,anon,authenticated,service_role;
grant select,insert on public.edu_consent_prompts,public.edu_welcome_consent_requests,public.edu_welcome_consent_events to service_role;

create function public.edu_welcome_consent_snapshot(p_member uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb;p jsonb;meta jsonb;r jsonb;asked timestamptz;handled boolean;
begin
 m:=public.edu_account_consent(p_member);p:=public.edu_personalization_consent(p_member);meta:=public.edu_meta_purchase_consent(p_member);r:=public.edu_consent_reward(p_member);
 select answered_at into asked from public.edu_consent_prompts where member_id=p_member;
 handled:=asked is not null or m->>'revision' is not null or p->>'revision' is not null or meta->>'revision' is not null or (r->>'handled')::boolean;
 return jsonb_build_object('marketing',m,'personal',p,'meta',meta,'reward',r,'promptedAt',asked,'handled',handled);
end$$;

create function public.edu_welcome_consent(p_member uuid,p_request uuid default null,p_payload jsonb default null,
 p_allow_marketing boolean default false,p_allow_personal boolean default false,p_allow_reward boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb;c jsonb;scope text;prior jsonb;m jsonb;p jsonb;meta jsonb;r jsonb;
 marketing boolean;analysis boolean;overseas boolean;measurement boolean;kind text;v text;surface text;
 cfg public.edu_consent_reward_config;wallet uuid;
begin
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'WELCOME_FORBIDDEN';end if;
 s:=public.edu_welcome_consent_snapshot(p_member);
 if p_payload is null then return s;end if;
 if p_request is null or p_payload->>'requestId' is distinct from p_request::text
 or p_payload->>'copyVersion' is distinct from 'edu-welcome-e-20261017'
 or jsonb_typeof(p_payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload))<>6
 or jsonb_typeof(p_payload->'choices') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload->'choices'))<>5
 or jsonb_typeof(p_payload->'expected') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload->'expected'))<>3
 or jsonb_typeof(p_payload->'versions') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload->'versions'))<>2
 then raise exception 'WELCOME_INVALID';end if;
 c:=p_payload->'choices';scope:=p_payload->>'scope';
 if scope is null or scope not in ('welcome','dismiss','marketing','analysis','overseas','meta') then raise exception 'WELCOME_INVALID';end if;
 foreach kind in array array['email','kakao','analysis','overseas','meta'] loop
  if jsonb_typeof(c->kind) is distinct from 'boolean' then raise exception 'WELCOME_INVALID';end if;
 end loop;
 select payload into prior from public.edu_welcome_consent_requests where member_id=p_member and request_id=p_request;
 if found then
  if prior is distinct from p_payload then raise exception 'WELCOME_CONFLICT';end if;
  -- Replays return current choices and never reapply an older grant after withdrawal.
  return s;
 end if;
 if scope in ('welcome','dismiss') and (s->>'handled')::boolean then raise exception 'WELCOME_ANSWERED';end if;
 m:=s->'marketing';p:=s->'personal';meta:=s->'meta';r:=s->'reward';surface:=case when scope='welcome' then 'welcome' else 'settings' end;
 marketing:=(c->>'email')::boolean or (c->>'kakao')::boolean;
 if scope<>'dismiss' then
  if scope in ('welcome','marketing') then
   if m->>'revision' is distinct from p_payload#>>'{expected,marketing}' then raise exception 'WELCOME_CONFLICT';end if;
   if p_allow_marketing is not true and (((c->>'email')::boolean and not (m#>>'{choices,email}')::boolean) or ((c->>'kakao')::boolean and not (m#>>'{choices,kakao}')::boolean)) then raise exception 'WELCOME_DISABLED';end if;
   m:=public.edu_account_consent(p_member,p_request,jsonb_build_object('marketingUse',marketing,'sms',false,'kakao',(c->>'kakao')::boolean,'email',(c->>'email')::boolean),'profile','2026-10-17',(p_payload#>>'{expected,marketing}')::uuid);
  end if;
  if scope in ('welcome','analysis','overseas') then
   if p->>'revision' is distinct from p_payload#>>'{expected,personal}' then raise exception 'WELCOME_CONFLICT';end if;
   if scope='welcome' then
    analysis:=(c->>'analysis')::boolean;overseas:=(c->>'overseas')::boolean;
    if p_allow_personal is not true and (analysis or overseas) then raise exception 'WELCOME_DISABLED';end if;
    p:=public.edu_personalization_consent(p_member,p_request,jsonb_build_object('analysis',analysis,'overseas',overseas),p_payload#>>'{versions,personal}',(p_payload#>>'{expected,personal}')::uuid);
   else
    if (c->>scope)::boolean and p_allow_personal is not true then raise exception 'WELCOME_DISABLED';end if;
    p:=public.edu_personalization_choice(p_member,p_request,(p_payload#>>'{expected,personal}')::uuid,scope,(c->>scope)::boolean,p_payload#>>'{versions,personal}',p_allow_personal);
   end if;
  end if;
  if scope in ('welcome','meta') then
   if meta->>'revision' is distinct from p_payload#>>'{expected,meta}' then raise exception 'WELCOME_CONFLICT';end if;
   measurement:=(c->>'meta')::boolean;
   if measurement and not (meta->>'active')::boolean and p_allow_marketing is not true then raise exception 'WELCOME_DISABLED';end if;
   meta:=public.edu_meta_purchase_consent(p_member,p_request,(p_payload#>>'{expected,meta}')::uuid,measurement,case when measurement then p_payload#>>'{versions,meta}' else null end,'profile');
  end if;
  -- The old award ledger remains the single once-per-account coupon authority.
  if scope in ('welcome','marketing') and marketing and not (r->>'awarded')::boolean then
   if scope='welcome' and (p_allow_reward is not true or not (r->>'available')::boolean) then raise exception 'REWARD_UNAVAILABLE';end if;
   if p_allow_reward is true and (r->>'available')::boolean then
    select * into cfg from public.edu_consent_reward_config where singleton;
    insert into public.customer_coupons(coupon_id,user_id,expires_at) values(cfg.coupon_id,p_member,now()+make_interval(days=>cfg.valid_days))
      on conflict(coupon_id,user_id) do nothing returning id into wallet;
    if wallet is null then select id into wallet from public.customer_coupons where coupon_id=cfg.coupon_id and user_id=p_member;end if;
    insert into public.edu_consent_reward_awards(member_id,wallet_id,request_id) values(p_member,wallet,p_request);
   end if;
  end if;
  foreach kind in array array['marketing','analysis','overseas','meta'] loop
   if scope='welcome' or scope=kind then
    v:=case when kind='marketing' then '2026-10-17' when kind='meta' then (select wording_version from public.edu_meta_purchase_preferences where member_id=p_member) when kind='analysis' then (select analysis_wording_version from public.edu_personalization_preferences where member_id=p_member) else (select overseas_wording_version from public.edu_personalization_preferences where member_id=p_member) end;
    insert into public.edu_welcome_consent_events(member_id,request_id,kind,consented,copy_version,wording_version,surface)
    values(p_member,p_request,kind,case when kind='marketing' then marketing else (c->>kind)::boolean end,'edu-welcome-e-20261017',v,surface);
   end if;
  end loop;
 end if;
 insert into public.edu_consent_prompts(member_id,copy_version,answer) values(p_member,'edu-welcome-e-20261017',case when scope in ('welcome','dismiss') then scope else 'settings' end) on conflict(member_id) do nothing;
 insert into public.edu_welcome_consent_requests(member_id,request_id,payload) values(p_member,p_request,p_payload);
 return public.edu_welcome_consent_snapshot(p_member);
end$$;

create function public.edu_withdraw_four_consents() returns trigger language plpgsql security invoker set search_path='' as $$
declare req uuid:=gen_random_uuid();kind text;
begin
 if new.status='withdrawn' and old.status is distinct from 'withdrawn' then
  new.marketing_use_consent_at:=null;new.ad_sms_consent_at:=null;new.ad_kakao_consent_at:=null;new.ad_email_consent_at:=null;
  new.marketing_consent:=false;new.marketing_opt_out_at:=now();new.consent_revision:=req;new.consent_updated_at:=now();
  update public.edu_personalization_preferences set analysis=false,overseas=false,wording_version=null,analysis_wording_version=null,overseas_wording_version=null,revision=req,updated_at=now() where member_id=new.id;
  update public.edu_meta_purchase_preferences set consented=false,wording_version=null,revision=req,updated_at=now() where member_id=new.id;
  foreach kind in array array['marketing','analysis','overseas','meta'] loop
   insert into public.edu_welcome_consent_events(member_id,request_id,kind,consented,copy_version,wording_version,surface)
    values(new.id,req,kind,false,'edu-welcome-e-20261017',null,'withdrawal');
  end loop;
 end if;
 return new;
end$$;
create trigger edu_withdraw_four_consents before update of status on public.profiles for each row execute function public.edu_withdraw_four_consents();
revoke all on function public.edu_welcome_consent_snapshot(uuid),public.edu_welcome_consent(uuid,uuid,jsonb,boolean,boolean,boolean),public.edu_withdraw_four_consents() from public,anon,authenticated;
grant execute on function public.edu_welcome_consent_snapshot(uuid),public.edu_welcome_consent(uuid,uuid,jsonb,boolean,boolean,boolean),public.edu_withdraw_four_consents() to service_role;
commit;
