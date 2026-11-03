begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No disclosure or customer choice is seeded. Publication needs separately
-- reviewed exact recipients/countries/items/purposes/retention/refusal effects.
create table public.edu_personalization_terms (
 version text primary key check(length(version) between 1 and 100),
 analysis text not null check(length(btrim(analysis))>0),
 overseas text not null check(length(btrim(overseas))>0),
 approved_at timestamptz not null,
 effective_at timestamptz not null,
 is_current boolean not null default false
);
create unique index edu_personalization_one_current on public.edu_personalization_terms(is_current) where is_current;
create function public.edu_personalization_terms_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.version,new.analysis,new.overseas,new.approved_at,new.effective_at) is distinct from
    (old.version,old.analysis,old.overseas,old.approved_at,old.effective_at) then raise exception 'PERSONALIZATION_TERMS_IMMUTABLE';end if;
 return new;
end$$;
create trigger edu_personalization_terms_immutable before update on public.edu_personalization_terms for each row execute function public.edu_personalization_terms_immutable();
create table public.edu_personalization_preferences (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 analysis boolean not null default false,
 overseas boolean not null default false,
 wording_version text references public.edu_personalization_terms(version),
 revision uuid not null,
 updated_at timestamptz not null default now(),
 check(not (analysis or overseas) or wording_version is not null)
);
create table public.edu_personalization_receipts (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 expected_revision uuid,
 wording_version text,
 choices jsonb not null,
 previous_choices jsonb not null,
 result jsonb not null,
 occurred_at timestamptz not null default now(),
 primary key(member_id,request_id)
);
alter table public.edu_personalization_terms enable row level security;
alter table public.edu_personalization_preferences enable row level security;
alter table public.edu_personalization_receipts enable row level security;
revoke all on public.edu_personalization_terms,public.edu_personalization_preferences,public.edu_personalization_receipts from public,anon,authenticated,service_role;
grant select on public.edu_personalization_terms to service_role;
grant select,insert,update on public.edu_personalization_preferences to service_role;
grant select,insert on public.edu_personalization_receipts to service_role;

create function public.edu_personalization_consent(p_member uuid,p_request uuid default null,p_choices jsonb default null,p_version text default null,p_expected uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.edu_personalization_preferences; t public.edu_personalization_terms;
 r public.edu_personalization_receipts; result jsonb; previous jsonb; renewing boolean;
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
   if ((p_choices->>'analysis')::boolean or (p_choices->>'overseas')::boolean)
    and (t.version is null or p_version is distinct from t.version) then raise exception 'PERSONALIZATION_TERMS';end if;
   insert into public.edu_personalization_preferences(member_id,analysis,overseas,wording_version,revision)
    values(p_member,(p_choices->>'analysis')::boolean,(p_choices->>'overseas')::boolean,
      case when (p_choices->>'analysis')::boolean or (p_choices->>'overseas')::boolean then t.version else null end,p_request)
    on conflict(member_id) do update set analysis=excluded.analysis,overseas=excluded.overseas,wording_version=excluded.wording_version,revision=excluded.revision,updated_at=now()
    returning * into p;
  end if;
 end if;
 renewing:=(coalesce(p.analysis,false) or coalesce(p.overseas,false)) and p.wording_version is distinct from t.version;
 result:=jsonb_build_object('choices',jsonb_build_object('analysis',coalesce(p.analysis,false),'overseas',coalesce(p.overseas,false)),
  'revision',p.revision,'updatedAt',p.updated_at,'needsRenewal',renewing,
  'eligible',coalesce(p.analysis and p.overseas and p.wording_version=t.version,false),
  'terms',case when t.version is null then null else jsonb_build_object('version',t.version,'analysis',t.analysis,'overseas',t.overseas) end);
 if p_choices is not null and r.request_id is null then
  insert into public.edu_personalization_receipts(member_id,request_id,expected_revision,wording_version,choices,previous_choices,result)
   values(p_member,p_request,p_expected,p_version,p_choices,previous,result);
 end if;
 return result;
end$$;
revoke all on function public.edu_personalization_consent(uuid,uuid,jsonb,text,uuid),public.edu_personalization_terms_immutable() from public,anon,authenticated;
grant execute on function public.edu_personalization_consent(uuid,uuid,jsonb,text,uuid) to service_role;
commit;
