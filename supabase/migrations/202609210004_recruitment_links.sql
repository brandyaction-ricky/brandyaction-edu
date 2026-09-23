begin;
create table public.edu_recruitment_links (
 period_id text primary key, id uuid not null unique default gen_random_uuid(),
 room_version integer not null, enabled boolean not null, revision integer not null check(revision>0),
 updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now(),
 foreign key(period_id,room_version) references public.edu_recruitment_room_revisions(period_id,version)
);
create table public.edu_recruitment_link_history (
 period_id text not null, revision integer not null, room_version integer not null, enabled boolean not null,
 actor_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
 primary key(period_id,revision)
);
create table public.edu_recruitment_clicks (
 id uuid primary key, link_id uuid not null references public.edu_recruitment_links(id),
 period_id text not null, room_version integer not null,
 channel text not null check(channel in ('paid','organic')), created_at timestamptz not null default now(),
 foreign key(period_id,room_version) references public.edu_recruitment_room_revisions(period_id,version)
);
create index edu_recruitment_clicks_period on public.edu_recruitment_clicks(period_id,channel);
create index edu_recruitment_clicks_rate on public.edu_recruitment_clicks(link_id,created_at);
alter table public.edu_recruitment_links enable row level security;
alter table public.edu_recruitment_link_history enable row level security;
alter table public.edu_recruitment_clicks enable row level security;
revoke all on public.edu_recruitment_links,public.edu_recruitment_link_history,public.edu_recruitment_clicks from public,anon,authenticated,service_role;
grant select on public.edu_recruitment_links to service_role;
create function public.edu_manage_recruitment_links(p_actor uuid,p_period text,p_version integer,p_expected integer,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; item public.edu_recruitment_links%rowtype;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if permissions->'marketing' is distinct from 'true'::jsonb or permissions->'products' is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 -- Read and write use the same authorized RPC; no raw event rows leave the DB.
 perform pg_catalog.pg_advisory_xact_lock(207260921,3);
 select * into item from public.edu_recruitment_links where period_id=p_period;
 if p_enabled is not null then
  if p_expected is null or p_expected<>coalesce(item.revision,0) then raise exception 'CONVERSION_STALE'; end if;
  if p_enabled then
   if p_version is null or p_version is distinct from (select max(version) from public.edu_recruitment_room_revisions where period_id=p_period) then raise exception 'CONVERSION_STALE'; end if;
  elsif item.id is null then raise exception 'CONVERSION_NOT_FOUND'; end if;
  insert into public.edu_recruitment_links(period_id,room_version,enabled,revision,updated_by)
  values(p_period,case when p_enabled then p_version else item.room_version end,p_enabled,1,p_actor)
  on conflict(period_id) do update set room_version=excluded.room_version,enabled=excluded.enabled,revision=edu_recruitment_links.revision+1,updated_by=p_actor,updated_at=now()
  returning * into item;
  insert into public.edu_recruitment_link_history values(item.period_id,item.revision,item.room_version,item.enabled,p_actor,now());
 end if;
 return jsonb_build_object('link',case when item.id is null then null else jsonb_build_object('id',item.id,'room_version',item.room_version,'revision',item.revision,'enabled',item.enabled) end,
 'counts',jsonb_build_object('paid',(select count(*) from public.edu_recruitment_clicks where period_id=p_period and channel='paid'),'organic',(select count(*) from public.edu_recruitment_clicks where period_id=p_period and channel='organic')));
end;
$$;
create function public.edu_recruitment_destination(p_link uuid,p_channel text,p_event uuid default null,p_version integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.edu_recruitment_links%rowtype; settings jsonb; previous public.edu_recruitment_clicks%rowtype; recorded boolean:=false;
begin
 if p_channel is null or p_channel not in ('paid','organic') then raise exception 'CONVERSION_INVALID'; end if;
 select * into item from public.edu_recruitment_links where id=p_link and enabled for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 select r.settings into settings from public.edu_recruitment_room_revisions r where r.period_id=item.period_id and r.version=item.room_version;
 if p_event is not null then
  if p_version is distinct from item.room_version then raise exception 'CONVERSION_STALE'; end if;
  select * into previous from public.edu_recruitment_clicks where id=p_event;
  if found then
   if previous.link_id<>p_link or previous.channel<>p_channel or previous.room_version<>p_version then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
   recorded:=true;
  elsif (select count(*) from public.edu_recruitment_clicks where link_id=p_link and created_at>now()-interval '1 minute')<1000 then
   insert into public.edu_recruitment_clicks values(p_event,p_link,item.period_id,item.room_version,p_channel,now());
   recorded:=true;
  end if;
 end if;
 return jsonb_build_object('label',settings->>'label','version',item.room_version,'url',settings->>case when p_channel='paid' then 'paidUrl' else 'organicUrl' end,'recorded',recorded);
end;
$$;
revoke all on function public.edu_manage_recruitment_links(uuid,text,integer,integer,boolean),public.edu_recruitment_destination(uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.edu_manage_recruitment_links(uuid,text,integer,integer,boolean),public.edu_recruitment_destination(uuid,text,uuid,integer) to service_role;
commit;
