begin;
create table public.edu_webinar_sessions (
 campaign_id uuid not null references public.edu_webinar_campaigns(id),
 phase text not null check(phase in ('first','encore')),
 youtube_url text check(youtube_url ~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$'),
 is_open boolean not null default false, revision integer not null check(revision>0),
 updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now(),
 primary key(campaign_id,phase), check(not is_open or youtube_url is not null)
);
create table public.edu_webinar_checkins (
 campaign_id uuid not null, phase text not null,
 registration_id uuid not null references public.edu_webinar_registrations(id),
 session_revision integer not null, checked_at timestamptz not null default now(),
 primary key(campaign_id,phase,registration_id),
 foreign key(campaign_id,phase) references public.edu_webinar_sessions(campaign_id,phase)
);
create table public.edu_webinar_session_history (
 campaign_id uuid not null, phase text not null, revision integer not null,
 youtube_url text, is_open boolean not null, actor_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), primary key(campaign_id,phase,revision)
);
alter table public.edu_webinar_sessions enable row level security;
alter table public.edu_webinar_checkins enable row level security;
alter table public.edu_webinar_session_history enable row level security;
revoke all on public.edu_webinar_sessions,public.edu_webinar_checkins,public.edu_webinar_session_history from public,anon,authenticated,service_role;
create function public.edu_manage_webinar_attendance(p_actor uuid,p_code uuid,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; permissions jsonb; campaign public.edu_webinar_campaigns%rowtype;
 session public.edu_webinar_sessions%rowtype; v_phase text; v_url text; v_open boolean; result jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if permissions->'marketing' is distinct from 'true'::jsonb or permissions->'products' is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 select * into campaign from public.edu_webinar_campaigns where id=p_code for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 if p_settings is not null then
  if jsonb_typeof(p_settings)<>'object' or not(p_settings ?& array['phase','url','open','expected'])
   or p_settings-array['phase','url','open','expected']<>'{}'::jsonb or jsonb_typeof(p_settings->'open')<>'boolean' then raise exception 'CONVERSION_INVALID'; end if;
  v_phase:=p_settings->>'phase';v_url:=p_settings->>'url';v_open:=(p_settings->>'open')::boolean;
  if v_phase is null or v_phase not in ('first','encore') or (v_url is not null and v_url !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$') then raise exception 'CONVERSION_INVALID'; end if;
  select * into session from public.edu_webinar_sessions where campaign_id=p_code and phase=v_phase;
  if (p_settings->>'expected')::integer is distinct from coalesce(session.revision,0) then raise exception 'CONVERSION_STALE'; end if;
  if v_open and (not campaign.enabled or v_url is null) then raise exception 'CONVERSION_INVALID'; end if;
  if session.youtube_url is distinct from v_url and exists(select 1 from public.edu_webinar_checkins where campaign_id=p_code and phase=v_phase) then raise exception 'ATTENDANCE_URL_LOCKED'; end if;
  insert into public.edu_webinar_sessions(campaign_id,phase,youtube_url,is_open,revision,updated_by)
  values(p_code,v_phase,v_url,v_open,1,p_actor)
  on conflict(campaign_id,phase) do update set youtube_url=excluded.youtube_url,is_open=excluded.is_open,revision=edu_webinar_sessions.revision+1,updated_by=p_actor,updated_at=now() returning * into session;
  insert into public.edu_webinar_session_history values(p_code,v_phase,session.revision,v_url,v_open,p_actor,now());
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('phase',s.phase,'url',s.youtube_url,'open',s.is_open,'revision',s.revision,
  'count',(select count(*) from public.edu_webinar_checkins c where c.campaign_id=p_code and c.phase=s.phase)) order by s.phase),'[]'::jsonb)
 into result from public.edu_webinar_sessions s where s.campaign_id=p_code;
 return jsonb_build_object('sessions',result,'unique',(select count(distinct registration_id) from public.edu_webinar_checkins where campaign_id=p_code),
  'both',(select count(*) from (select registration_id from public.edu_webinar_checkins where campaign_id=p_code group by registration_id having count(*)=2) q));
end;
$$;
create function public.edu_webinar_attendance(p_code uuid,p_user uuid,p_phase text default null,p_expected integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign public.edu_webinar_campaigns%rowtype; application public.edu_webinar_registrations%rowtype; session public.edu_webinar_sessions%rowtype; result jsonb;
begin
 perform 1 from public.profiles where id=p_user and status='active' for share;
 if not found then raise exception 'CONVERSION_FORBIDDEN'; end if;
 select * into campaign from public.edu_webinar_campaigns where id=p_code and enabled for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 perform 1 from public.courses where id=campaign.free_course_id and category='free' and list_price=0 and status='published' for share;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 select * into application from public.edu_webinar_registrations where period_id=campaign.period_id and user_id=p_user;
 if not found then raise exception 'ATTENDANCE_REGISTER_FIRST'; end if;
 if p_phase is not null then
  if p_phase not in ('first','encore') then raise exception 'CONVERSION_INVALID'; end if;
  select * into session from public.edu_webinar_sessions where campaign_id=p_code and phase=p_phase;
  if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
  if not exists(select 1 from public.edu_webinar_checkins where campaign_id=p_code and phase=p_phase and registration_id=application.id) then
   if not session.is_open then raise exception 'ATTENDANCE_CLOSED'; end if;
   if p_expected is distinct from session.revision then raise exception 'CONVERSION_STALE'; end if;
   insert into public.edu_webinar_checkins(campaign_id,phase,registration_id,session_revision) values(p_code,p_phase,application.id,session.revision);
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('phase',s.phase,'url',s.youtube_url,'open',s.is_open,'revision',s.revision,
 'checked',c.registration_id is not null,'checkedAt',c.checked_at) order by s.phase),'[]'::jsonb) into result
 from public.edu_webinar_sessions s left join public.edu_webinar_checkins c on c.campaign_id=s.campaign_id and c.phase=s.phase and c.registration_id=application.id
 where s.campaign_id=p_code;
 return jsonb_build_object('sessions',result);
end;
$$;
revoke all on function public.edu_manage_webinar_attendance(uuid,uuid,jsonb),public.edu_webinar_attendance(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.edu_manage_webinar_attendance(uuid,uuid,jsonb),public.edu_webinar_attendance(uuid,uuid,text,integer) to service_role;
commit;
