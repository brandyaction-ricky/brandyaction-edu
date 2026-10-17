begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- New Meta consent is independent of marketing, TIPS and coupon eligibility.
-- No terms, customer opt-ins or transmission jobs are seeded by this migration.
-- An approved, exact disclosure must be published separately before opt-in opens.
create table public.edu_meta_purchase_terms (
 version text primary key check (length(version) between 1 and 100),
 recipient text not null check (length(btrim(recipient)) > 0),
 country text not null check (length(btrim(country)) > 0),
 items text not null check (length(btrim(items)) > 0),
 purpose text not null check (length(btrim(purpose)) > 0),
 transfer text not null check (length(btrim(transfer)) > 0),
 retention text not null check (length(btrim(retention)) > 0),
 refusal text not null check (length(btrim(refusal)) > 0),
 contact text not null check (length(btrim(contact)) > 0),
 approved_at timestamptz not null,
 effective_at timestamptz not null,
 is_current boolean not null default false
);
create unique index edu_meta_purchase_one_current on public.edu_meta_purchase_terms(is_current) where is_current;
create function public.edu_meta_purchase_terms_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
 if (new.version,new.recipient,new.country,new.items,new.purpose,new.transfer,new.retention,new.refusal,new.contact,new.approved_at,new.effective_at)
    is distinct from (old.version,old.recipient,old.country,old.items,old.purpose,old.transfer,old.retention,old.refusal,old.contact,old.approved_at,old.effective_at)
 then raise exception 'META_CONSENT_TERMS_IMMUTABLE'; end if;
 return new;
end$$;
create trigger edu_meta_purchase_terms_immutable before update on public.edu_meta_purchase_terms for each row execute function public.edu_meta_purchase_terms_immutable();
create table public.edu_meta_purchase_preferences (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 consented boolean not null default false,
 wording_version text references public.edu_meta_purchase_terms(version),
 revision uuid not null,
 updated_at timestamptz not null default now(),
 check (not consented or wording_version is not null)
);
create table public.edu_meta_purchase_receipts (
 member_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 expected_revision uuid,
 wording_version text,
 consented boolean not null,
 previous_consented boolean not null,
 surface text not null check (surface in ('signup','profile')),
 result jsonb not null,
 occurred_at timestamptz not null default now(),
 primary key (member_id,request_id)
);
alter table public.edu_meta_purchase_terms enable row level security;
alter table public.edu_meta_purchase_preferences enable row level security;
alter table public.edu_meta_purchase_receipts enable row level security;
revoke all on public.edu_meta_purchase_terms,public.edu_meta_purchase_preferences,public.edu_meta_purchase_receipts from public,anon,authenticated,service_role;
grant select on public.edu_meta_purchase_terms to service_role;
grant select,insert,update on public.edu_meta_purchase_preferences to service_role;
grant select,insert on public.edu_meta_purchase_receipts to service_role;

create function public.edu_meta_purchase_consent(
 p_member uuid,p_request uuid default null,p_expected uuid default null,
 p_consented boolean default null,p_version text default null,p_surface text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 pref public.edu_meta_purchase_preferences; terms public.edu_meta_purchase_terms;
 receipt public.edu_meta_purchase_receipts; previous boolean; result jsonb;
begin
 -- Serialize all preference/reward changes for the same active account.
 perform 1 from public.profiles where id=p_member and status='active' for update;
 if not found then raise exception 'META_CONSENT_FORBIDDEN'; end if;
 select * into terms from public.edu_meta_purchase_terms where is_current and approved_at<=now() and effective_at<=now();
 select * into pref from public.edu_meta_purchase_preferences where member_id=p_member;
 previous := coalesce(pref.consented,false);
 if p_consented is not null then
  if p_request is null or p_surface is null or p_surface not in ('signup','profile') then raise exception 'META_CONSENT_INVALID'; end if;
  select * into receipt from public.edu_meta_purchase_receipts where member_id=p_member and request_id=p_request;
  if found then
   if (receipt.expected_revision,receipt.wording_version,receipt.consented,receipt.surface) is distinct from (p_expected,p_version,p_consented,p_surface)
      or pref.revision is distinct from p_request then raise exception 'META_CONSENT_CONFLICT'; end if;
  else
   if pref.revision is distinct from p_expected then raise exception 'META_CONSENT_CONFLICT'; end if;
   if p_consented and (terms.version is null or p_version is distinct from terms.version) then raise exception 'META_CONSENT_TERMS'; end if;
   insert into public.edu_meta_purchase_preferences(member_id,consented,wording_version,revision)
    values(p_member,p_consented,case when p_consented then terms.version else null end,p_request)
    on conflict(member_id) do update set consented=excluded.consented,wording_version=excluded.wording_version,revision=excluded.revision,updated_at=now()
    returning * into pref;
  end if;
 end if;
 result := jsonb_build_object(
  'consented',coalesce(pref.consented,false),'active',coalesce(pref.consented and pref.wording_version=terms.version,false),
  'needsRenewal',coalesce(pref.consented,false) and pref.wording_version is distinct from terms.version,
  'revision',pref.revision,'updatedAt',pref.updated_at,
  'terms',case when terms.version is null then null else jsonb_build_object('version',terms.version,
   'recipient',terms.recipient,'country',terms.country,'items',terms.items,'purpose',terms.purpose,
   'transfer',terms.transfer,'retention',terms.retention,'refusal',terms.refusal,'contact',terms.contact) end);
 if p_consented is not null and receipt.request_id is null then
  insert into public.edu_meta_purchase_receipts(member_id,request_id,expected_revision,wording_version,consented,previous_consented,surface,result)
   values(p_member,p_request,p_expected,p_version,p_consented,previous,p_surface,result);
 end if;
 return result;
end$$;
revoke all on function public.edu_meta_purchase_consent(uuid,uuid,uuid,boolean,text,text),public.edu_meta_purchase_terms_immutable() from public,anon,authenticated;
grant execute on function public.edu_meta_purchase_consent(uuid,uuid,uuid,boolean,text,text) to service_role;
commit;
