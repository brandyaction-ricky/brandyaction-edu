begin;
create table public.edu_recruitment_room_revisions (
 period_id text not null check (period_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
 version integer not null check (version > 0),
 settings jsonb not null,
 actor_id uuid references public.profiles(id) on delete set null,
 request_id uuid not null,
 expected_version integer not null check (expected_version >= 0),
 created_at timestamptz not null default now(),
 primary key(period_id,version), unique(actor_id,request_id)
);
alter table public.edu_recruitment_room_revisions enable row level security;
revoke all on public.edu_recruitment_room_revisions from public,anon,authenticated,service_role;
grant select on public.edu_recruitment_room_revisions to service_role;
create function public.edu_save_recruitment_rooms(p_actor uuid,p_request uuid,p_period text,p_expected integer,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.profiles%rowtype;
 permissions jsonb;
 previous public.edu_recruitment_room_revisions%rowtype;
 current_version integer;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if (permissions->'marketing') is distinct from 'true'::jsonb or (permissions->'products') is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 if p_request is null or p_expected is null or p_expected<0 or p_period is null or p_period !~ '^[a-z0-9][a-z0-9-]{0,63}$' or jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'CONVERSION_INVALID'; end if;
 if (p_settings - array['label','organicUrl','paidUrl','paidMode']) <> '{}'::jsonb
  or not (p_settings ?& array['label','organicUrl','paidUrl','paidMode']) then raise exception 'CONVERSION_INVALID'; end if;
 if exists(select 1 from jsonb_each(p_settings) e where jsonb_typeof(e.value)<>'string') then raise exception 'CONVERSION_INVALID'; end if;
 if length(trim(p_settings->>'label')) not between 1 and 80
  or length(p_settings->>'organicUrl')>200 or length(p_settings->>'paidUrl')>200
  or (p_settings->>'organicUrl') !~ '^https://open\.kakao\.com/o/[a-zA-Z0-9]+$'
  or (p_settings->>'paidUrl') !~ '^https://open\.kakao\.com/o/[a-zA-Z0-9]+$'
  or p_settings->>'organicUrl'=p_settings->>'paidUrl'
  or p_settings->>'paidMode' not in ('undecided','new','reuse') then raise exception 'CONVERSION_INVALID'; end if;
 perform pg_catalog.pg_advisory_xact_lock(207260921,2);
 select * into previous from public.edu_recruitment_room_revisions where actor_id=p_actor and request_id=p_request;
 if found then
  if previous.period_id<>p_period or previous.expected_version<>p_expected or previous.settings<>p_settings then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
  return to_jsonb(previous);
 end if;
 select coalesce(max(version),0) into current_version from public.edu_recruitment_room_revisions where period_id=p_period;
 if current_version<>p_expected then raise exception 'CONVERSION_STALE'; end if;
 insert into public.edu_recruitment_room_revisions(period_id,version,settings,actor_id,request_id,expected_version)
 values(p_period,current_version+1,p_settings,p_actor,p_request,p_expected) returning * into previous;
 return to_jsonb(previous);
end;
$$;
revoke all on function public.edu_save_recruitment_rooms(uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.edu_save_recruitment_rooms(uuid,uuid,text,integer,jsonb) to service_role;
commit;
